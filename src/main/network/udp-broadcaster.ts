import dgram from 'dgram'
import {
  getUdpPort,
  ANNOUNCEMENT_KIND,
  DEFAULT_HEARTBEAT_INTERVAL_MS,
  SIGNATURE_MAX_AGE_MS,
  calculateOnlineTimeoutMs,
} from '@shared/constants'
import { PROTOCOL_VERSION, GROUP_PROTOCOL_VERSION } from '@shared/types'
import type { PresenceAnnouncement, Friend, VersionAnnouncement, VersionAnnouncementPayload } from '@shared/types'
import { storageService } from '../storage/storage-service'
import { getNetworkInterfaces } from './network-utils'
import { initIdentity, signPayload, verifyPayload } from '../crypto/identity'
import { isVersionLower, isVersionHigher } from '@shared/version'
import { getAppVersion } from '../utils/app-info'
import log from 'electron-log'

// 检测是否处于多实例/开发模式
function isMultiInstanceMode(): boolean {
  return process.env.NODE_ENV === 'development' || !!process.env.ABCD_DATA_DIR
}

// 注意：每次调用时读取端口，避免在模块加载时 env var 尚未生效
// V1.4.0: 多实例测试脚本支持 3 个实例，端口扩展到 19876/78/80
function getScanUdpPorts(): number[] {
  return isMultiInstanceMode()
    ? [19876, 19878, 19880]
    : [getUdpPort()]
}

export type BroadcastReason =
  | 'start'
  | 'stop'
  | 'self-info-changed'
  | 'manual-refresh'
  | 'send-failure'
  | 'heartbeat'
  | 'peer-response'

// 接收方按版本分流处理：V1 (1) 是 V1.1.0 旧协议无签名；V2 (2) 是 V1.2.0 带签名
const LEGACY_PROTOCOL_VERSION = 1
const ACCEPTABLE_VERSIONS = new Set([LEGACY_PROTOCOL_VERSION, PROTOCOL_VERSION])

// V1.5.0: 版本公告协议版本
const VERSION_ANNOUNCEMENT_PROTOCOL_VERSION = GROUP_PROTOCOL_VERSION // 3

// 签名载荷：announcement 中除 signature 本身外的所有字段
// 公共字段包括 publicKey（用于验签），但 publicKey 不参与自签名（避免循环）
// V1.5.0: 新增 appVersion。V1.2.0~V1.4.0 客户端不发送此字段，但接收方按"非签名/非公钥字段集合"
// 提取，V1.5.0 的存在/不存在会自动适配
type SignablePayload = {
  version: number
  peerId: string
  nickname: string
  ip: string
  tcpPort: number
  timestamp: number
  appVersion?: string
}

class UdpBroadcaster {
  private socket: dgram.Socket | null = null
  private heartbeatTimer: NodeJS.Timeout | null = null
  private onlineCheckTimer: NodeJS.Timeout | null = null
  private friends = new Map<string, Friend>()
  private selfPeerId = ''
  private selfNickname = ''
  private selfTcpPort = 19877
  private selfPublicKey: string = ''
  private heartbeatIntervalMs: number = DEFAULT_HEARTBEAT_INTERVAL_MS
  // V1.2.0: 在线超时动态跟随心跳间隔 (见 calculateOnlineTimeoutMs)
  // 初始化为 60s heartbeat 对应的 120s 超时
  private onlineTimeoutMs: number = calculateOnlineTimeoutMs(DEFAULT_HEARTBEAT_INTERVAL_MS)
  private lastBroadcastAt = 0
  private readonly minBroadcastGapMs = 200

  private onFriendOnline: ((friend: Friend) => void) | null = null
  private onFriendOffline: ((peerId: string) => void) | null = null
  private onFriendUpdated: ((friend: Friend) => void) | null = null
  // V1.5.0: 收到版本公告（来自其他用户的"我刚发布了 X.Y.Z"广播）
  private onVersionAnnouncement:
    | ((payload: VersionAnnouncement, fromIp: string) => void)
    | null = null

  start(peerId: string, nickname: string, tcpPort: number): void {
    this.selfPeerId = peerId
    this.selfNickname = nickname
    this.selfTcpPort = tcpPort
    // V1.5.0 合并: 版本号直接读自 getAppVersion()（已备忘录化），不再缓存副本
    log.info('Self app version:', getAppVersion(), 'electron:', process.versions.electron)

    // V1.2.0: 初始化 Ed25519 身份密钥对（首次启动自动生成）
    try {
      const identity = initIdentity()
      this.selfPublicKey = identity.publicKey
      log.info('UDP broadcaster using publicKey:', this.selfPublicKey.slice(0, 16) + '...')
    } catch (err) {
      // 密钥初始化失败不应阻止 UDP 启动，只是无法签名
      log.error('Failed to init identity, broadcasting will be unsigned:', err)
      this.selfPublicKey = ''
    }

    this.socket = dgram.createSocket('udp4')
    this.socket.on('message', (msg, rinfo) => {
      this.handleMessage(msg, rinfo)
    })

    this.socket.on('error', (err) => {
      log.error('UDP socket error:', err)
    })

    this.socket.bind(getUdpPort(), () => {
      if (this.socket) {
        this.socket.setBroadcast(true)
        log.info('UDP broadcaster started on port', getUdpPort())
      }
      this.broadcastNow('start')
      this.startHeartbeat()
      this.onlineCheckTimer = setInterval(() => {
        this.checkOnlineStatus()
      }, this.onlineTimeoutMs / 2)
    })
  }

  stop(opts: { graceful?: boolean } = {}): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    if (this.onlineCheckTimer) {
      clearInterval(this.onlineCheckTimer)
      this.onlineCheckTimer = null
    }
    if (opts.graceful) {
      this.broadcastLeaving()
    }
    if (this.socket) {
      this.socket.close(() => {
        log.info('UDP broadcaster stopped')
      })
      this.socket = null
    } else {
      log.info('UDP broadcaster stopped')
    }
  }

  scanSegment(broadcastAddress: string): void {
    this.sendAnnouncement(broadcastAddress, true, ANNOUNCEMENT_KIND.PRESENCE, 'manual-refresh')
    log.info('Scanning segment via broadcast:', broadcastAddress)
  }

  setCallbacks(
    onOnline: (friend: Friend) => void,
    onOffline: (peerId: string) => void,
    onUpdated?: (friend: Friend) => void
  ): void {
    this.onFriendOnline = onOnline
    this.onFriendOffline = onOffline
    this.onFriendUpdated = onUpdated ?? null
  }

  setSelfInfo(info: { peerId?: string; nickname?: string; tcpPort?: number }): void {
    if (info.peerId !== undefined) this.selfPeerId = info.peerId
    if (info.nickname !== undefined) this.selfNickname = info.nickname
    if (info.tcpPort !== undefined) this.selfTcpPort = info.tcpPort
    if (this.socket) {
      log.info('Self info updated, broadcasting immediately:', this.selfNickname)
      this.broadcastNow('self-info-changed')
    }
  }

  refresh(): void {
    log.info('Manual refresh requested')
    this.broadcastNow('manual-refresh')
  }

  broadcastLeaving(): void {
    if (!this.socket) return
    log.info('Broadcasting leaving announcement')
    this.broadcastToCurrentSegment(ANNOUNCEMENT_KIND.LEAVING, 'stop')
  }

  setHeartbeatInterval(intervalMs: number): void {
    this.heartbeatIntervalMs = intervalMs
    // V1.2.0: 重新计算在线超时，必须 > 新心跳间隔否则误判
    this.onlineTimeoutMs = calculateOnlineTimeoutMs(intervalMs)
    log.info('Heartbeat interval set to', intervalMs, 'ms, online timeout:', this.onlineTimeoutMs, 'ms')
    if (this.socket) {
      this.restartHeartbeat()
    }
  }

  getHeartbeatInterval(): number {
    return this.heartbeatIntervalMs
  }

  getFriends(): Friend[] {
    return Array.from(this.friends.values())
  }

  getFriend(peerId: string): Friend | undefined {
    return this.friends.get(peerId)
  }

  // V1.2.0: 供外部模块强制标记好友离线
  markOffline(peerId: string): void {
    const friend = this.friends.get(peerId)
    if (!friend || !friend.online) return
    friend.online = false
    this.friends.set(peerId, friend)
    storageService.updateFriendOnlineStatus(peerId, false)
    log.info('Friend marked offline externally:', friend.nickname, peerId)
    this.onFriendOffline?.(peerId)
  }

  // === 内部方法 ===

  private startHeartbeat(): void {
    this.stopHeartbeat()
    if (this.heartbeatIntervalMs <= 0) {
      log.info('Heartbeat disabled (interval=0)')
      return
    }
    this.heartbeatTimer = setInterval(() => {
      this.broadcastNow('heartbeat')
    }, this.heartbeatIntervalMs)
    log.info('Heartbeat started, interval:', this.heartbeatIntervalMs, 'ms')
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private restartHeartbeat(): void {
    this.startHeartbeat()
  }

  private broadcastNow(reason: BroadcastReason): void {
    if (!this.socket) return
    const now = Date.now()
    if (now - this.lastBroadcastAt < this.minBroadcastGapMs) {
      log.debug('Skipping duplicate broadcast, reason:', reason, 'gap:', now - this.lastBroadcastAt, 'ms')
      return
    }
    this.lastBroadcastAt = now
    log.debug('Broadcasting, reason:', reason)
    this.broadcastToCurrentSegment(ANNOUNCEMENT_KIND.PRESENCE, reason)
  }

  private broadcastToCurrentSegment(kind: typeof ANNOUNCEMENT_KIND[keyof typeof ANNOUNCEMENT_KIND], reason: BroadcastReason): void {
    const segments = getNetworkInterfaces()
    for (const seg of segments) {
      this.sendAnnouncement(seg.broadcast, true, kind, reason)
    }
  }

  private sendAnnouncement(
    broadcastAddress: string,
    scanAllPorts: boolean,
    kind: typeof ANNOUNCEMENT_KIND[keyof typeof ANNOUNCEMENT_KIND],
    _reason: BroadcastReason
  ): void {
    if (!this.socket) return
    const timestamp = Date.now()
    const signable: SignablePayload = {
      version: PROTOCOL_VERSION,
      peerId: this.selfPeerId,
      nickname: this.selfNickname,
      ip: this.getOwnIp(),
      tcpPort: this.selfTcpPort,
      timestamp,
      // V1.5.0: 携带当前 appVersion 供收端判断「是否提示更新」
      appVersion: getAppVersion(),
    }

    const announcement: PresenceAnnouncement = { ...signable }
    // V1.2.0: 对公告包进行 Ed25519 签名
    if (this.selfPublicKey) {
      try {
        announcement.publicKey = this.selfPublicKey
        announcement.signature = signPayload(signable as unknown as Record<string, unknown>)
      } catch (err) {
        log.warn('Failed to sign announcement, sending unsigned:', err)
      }
    }

    const msg = Buffer.from(JSON.stringify({ kind, data: announcement }), 'utf-8')

    const ports = scanAllPorts ? getScanUdpPorts() : [getUdpPort()]

    const targets: Array<{ address: string; port: number }> = []
    for (const port of ports) {
      targets.push({ address: broadcastAddress, port })
      if (isMultiInstanceMode()) {
        targets.push({ address: '127.0.0.1', port })
      }
    }

    log.debug('Sending announcement to', targets.length, 'targets, kind:', kind)

    for (const target of targets) {
      this.socket.send(msg, 0, msg.length, target.port, target.address, (err) => {
        if (err) log.debug('Broadcast send error:', err)
      })
    }
  }

  private handleMessage(msg: Buffer, rinfo: { address: string; port: number; size: number }): void {
    try {
      log.info('Received UDP message from', rinfo.address, 'port:', rinfo.port, 'size:', rinfo.size)
      const packet = JSON.parse(msg.toString('utf-8'))
      log.info('Packet kind:', packet.kind, 'peerId:', packet.data?.peerId)
      // V1.5.0: 路由版本公告包到独立处理函数
      if (packet.kind === ANNOUNCEMENT_KIND.VERSION) {
        this.handleVersionAnnouncement(packet, rinfo)
        return
      }
      if (packet.kind !== ANNOUNCEMENT_KIND.PRESENCE && packet.kind !== ANNOUNCEMENT_KIND.LEAVING) return
      const announcement = packet.data as PresenceAnnouncement
      // V1.2.0: 接受 V1 旧协议（无签名）和 V2 当前协议（有签名），拒绝未来未知版本
      if (!ACCEPTABLE_VERSIONS.has(announcement.version)) {
        log.warn('Dropping announcement with unsupported version:', announcement.version)
        return
      }
      if (announcement.peerId === this.selfPeerId) return

      // 重放保护：检查 timestamp 是否在可接受窗口内
      const now = Date.now()
      if (Math.abs(now - announcement.timestamp) > SIGNATURE_MAX_AGE_MS) {
        log.warn('Dropping announcement with stale timestamp, peerId:', announcement.peerId,
          'skew:', Math.abs(now - announcement.timestamp), 'ms')
        return
      }

      // 签名验证（V2 才有 signature，V1 跳过）
      let signatureValid: boolean | null = null  // true/false/未签名(null)
      if (announcement.version === PROTOCOL_VERSION) {
        if (!announcement.publicKey || !announcement.signature) {
          log.warn('V2 announcement missing signature/publicKey, peerId:', announcement.peerId)
          return
        }
        // 提取签名字段（除 publicKey/signature 外的所有字段）
        const { publicKey: _pk, signature: _sig, ...signable } = announcement
        const ok = verifyPayload(
          signable as unknown as Record<string, unknown>,
          announcement.signature,
          announcement.publicKey
        )
        if (!ok) {
          log.warn('Signature verification FAILED, dropping packet from peerId:', announcement.peerId,
            'claimed publicKey:', announcement.publicKey.slice(0, 16) + '...')
          return
        }
        signatureValid = true
      } else {
        signatureValid = null  // 旧版未签名
        log.info('Accepting legacy unsigned announcement from peerId:', announcement.peerId)
      }

      // 下线公告：立即标记离线，不等心跳超时
      if (packet.kind === ANNOUNCEMENT_KIND.LEAVING) {
        const existing = this.friends.get(announcement.peerId)
        if (existing && existing.online) {
          existing.online = false
          this.friends.set(announcement.peerId, existing)
          storageService.updateFriendOnlineStatus(announcement.peerId, false)
          log.info('Friend announced leaving:', existing.nickname, announcement.peerId)
          this.onFriendOffline?.(announcement.peerId)
        }
        return
      }

      // TOFU 信任链：已记录 peerId 的 publicKey 必须一致，否则可能是冒充
      if (signatureValid === true) {
        const known = storageService.getStoredPublicKey(announcement.peerId)
        if (known && known !== announcement.publicKey) {
          log.error('PublicKey mismatch for peerId:', announcement.peerId,
            'known:', known.slice(0, 16) + '...',
            'claimed:', (announcement.publicKey || '').slice(0, 16) + '...',
            '— possible impersonation, dropping packet')
          return
        }
      }

      const friend: Friend = {
        peerId: announcement.peerId,
        nickname: announcement.nickname,
        ip: rinfo.address,
        tcpPort: announcement.tcpPort,
        online: true,
        lastSeen: Date.now(),
        publicKey: signatureValid === true ? announcement.publicKey : undefined,
        untrusted: signatureValid === null,
        // V1.5.0: 携带对方应用版本（旧版客户端不发送此字段，视为 undefined）
        appVersion: announcement.appVersion,
      }

      const existing = this.friends.get(friend.peerId)
      const isNew = !existing
      const justCameOnline = !!existing && !existing.online
      const infoChanged = !!existing && existing.online && (
        existing.nickname !== friend.nickname ||
        existing.ip !== friend.ip ||
        existing.tcpPort !== friend.tcpPort ||
        existing.appVersion !== friend.appVersion
      )

      log.info('Processing friend:', friend.peerId, 'isNew:', isNew, 'justCameOnline:', justCameOnline, 'infoChanged:', infoChanged)

      // 已在线好友的信息变更：保留本地的 remark/avatar，只覆盖公告里提供的字段
      let toPersist: Friend = friend
      if (infoChanged && existing) {
        toPersist = {
          ...friend,
          remark: existing.remark,
          avatar: existing.avatar,
        }
      }
      this.friends.set(friend.peerId, toPersist)
      storageService.saveFriend(toPersist)

      if (isNew || justCameOnline) {
        log.info('Friend online:', toPersist.nickname, toPersist.ip, 'trusted:', !toPersist.untrusted)
        this.onFriendOnline?.(toPersist)
      } else if (infoChanged) {
        log.info('Friend info updated:', toPersist.peerId, 'nickname:', toPersist.nickname)
        this.onFriendUpdated?.(toPersist)
      }

      // V1.2.0: 双向发现
      // 仅对"新发现"或"刚上线"的好友回播自己的公告，让对方也能立刻看到我们
      // infoChanged 不回播（对方已经在我们列表里，且我们要的是对方信息，不是再次确认自己存在）
      // 200ms minBroadcastGapMs 天然防回播死循环（A 收到 B 的回播后，因为已知 B，不会再触发回播）
      if (isNew || justCameOnline) {
        this.broadcastNow('peer-response')
      }
    } catch (err) {
      // ignore malformed packets
    }
  }

  private checkOnlineStatus(): void {
    const now = Date.now()
    for (const [peerId, friend] of this.friends) {
      if (friend.online && now - friend.lastSeen > this.onlineTimeoutMs) {
        friend.online = false
        this.friends.set(peerId, friend)
        storageService.updateFriendOnlineStatus(peerId, false)
        log.info('Friend offline (timeout):', friend.nickname, 'lastSeen:', new Date(friend.lastSeen).toISOString())
        this.onFriendOffline?.(peerId)
      }
    }
  }

  private getOwnIp(): string {
    const interfaces = require('os').networkInterfaces()
    for (const name of Object.keys(interfaces)) {
      const nets = interfaces[name]
      if (!nets) continue
      for (const net of nets) {
        if (net.family === 'IPv4' && !net.internal) {
          return net.address
        }
      }
    }
    return '0.0.0.0'
  }

  // === V1.5.0: 版本公告相关 ===

  // 注册版本公告回调（外部模块通常在 update-publisher / update-downloader 中注册）
  setVersionAnnouncementCallback(
    cb: (payload: VersionAnnouncement, fromIp: string) => void
  ): void {
    this.onVersionAnnouncement = cb
  }

  // V1.5.0: 广播一次"我刚发布了 X.Y.Z"公告
  // 复用 Ed25519 签名（payload 与 presence 同源），仅 kind 不同
  broadcastVersionAnnouncement(payload: VersionAnnouncementPayload): void {
    if (!this.socket) {
      log.warn('Cannot broadcast version announcement: socket not started')
      return
    }
    if (!this.selfPublicKey) {
      log.warn('Cannot broadcast version announcement: no identity key')
      return
    }
    const signable: VersionAnnouncementPayload = {
      ...payload,
      version: VERSION_ANNOUNCEMENT_PROTOCOL_VERSION,
    }
    let signature = ''
    try {
      signature = signPayload(signable as unknown as Record<string, unknown>)
    } catch (err) {
      log.error('Failed to sign version announcement:', err)
      return
    }
    const full: VersionAnnouncement = {
      ...signable,
      publicKey: this.selfPublicKey,
      signature,
    }
    const data = JSON.stringify({ kind: ANNOUNCEMENT_KIND.VERSION, data: full })
    const buf = Buffer.from(data, 'utf-8')

    const segments = getNetworkInterfaces()
    const ports = getScanUdpPorts()
    for (const seg of segments) {
      for (const port of ports) {
        const targets: Array<{ address: string; port: number }> = [
          { address: seg.broadcast, port },
        ]
        if (isMultiInstanceMode()) {
          targets.push({ address: '127.0.0.1', port })
        }
        for (const t of targets) {
          this.socket.send(buf, 0, buf.length, t.port, t.address, (err) => {
            if (err) log.debug('Version-announcement send error:', err)
          })
        }
      }
    }
    log.info('Broadcast version announcement: targetVersion=', payload.targetVersion,
      'httpPort=', payload.httpPort,
      'nsis=', payload.nsis?.filename || '(none)',
      'portable=', payload.portable?.filename || '(none)')
  }

  // V1.5.0: 收端处理版本公告
  private handleVersionAnnouncement(
    packet: { kind: string; data: unknown },
    rinfo: { address: string; port: number; size: number }
  ): void {
    const data = (packet.data || {}) as Partial<VersionAnnouncement> & { version?: number; timestamp?: number }
    if (typeof data.version !== 'number' || typeof data.timestamp !== 'number') {
      log.warn('Dropping malformed version-announcement from', rinfo.address)
      return
    }
    if (data.version > VERSION_ANNOUNCEMENT_PROTOCOL_VERSION) {
      log.warn('Dropping future version-announcement, version:', data.version)
      return
    }
    const now = Date.now()
    if (Math.abs(now - data.timestamp) > SIGNATURE_MAX_AGE_MS) {
      log.warn('Dropping version-announcement with stale timestamp, skew:', Math.abs(now - data.timestamp), 'ms')
      return
    }
    if (!data.publicKey || !data.signature) {
      log.warn('Version-announcement missing signature/publicKey from', rinfo.address)
      return
    }
    // 提取 signable（除 publicKey/signature 外的所有字段）
    const { publicKey: _pk, signature: _sig, ...signable } = data
    const ok = verifyPayload(
      signable as unknown as Record<string, unknown>,
      data.signature,
      data.publicKey
    )
    if (!ok) {
      log.warn('Version-announcement signature verification FAILED from', rinfo.address)
      return
    }
    // 必须是来自其他 peer 的公告
    if (data.publisherPeerId === this.selfPeerId) {
      log.debug('Ignoring own version-announcement echo')
      return
    }
    // V1.5.0 修复: 放宽过滤——只在本机版本严格高于目标版本时丢弃
    // (旧逻辑 `self >= target` 丢弃，导致同版本重广播也看不到，测试时无法验证通路)
    // 停止公告无论如何都放行（收端业务层需要清理记录）
    if (!data.stopped && data.targetVersion && isVersionHigher(getAppVersion(), data.targetVersion)) {
      log.info('Ignoring version-announcement for version < self:', data.targetVersion)
      return
    }
    log.info('Received version-announcement from', data.publisherPeerId,
      'targetVersion=', data.targetVersion, 'httpPort=', data.httpPort,
      'stopped=', !!data.stopped, 'selfVersion=', getAppVersion())
    this.onVersionAnnouncement?.(signable as unknown as VersionAnnouncement, rinfo.address)
  }

  // V1.5.0: 获取所有"已知 appVersion 且低于 targetVersion"的好友
  // 用于发布方在 UI 展示"将向 N 个低版本好友广播"
  getLowerVersionFriends(targetVersion: string): Friend[] {
    return this.getFriends().filter(
      (f) => f.online && f.appVersion && isVersionLower(f.appVersion, targetVersion)
    )
  }

  // V1.5.0 合并: 移除 getSelfAppVersion() 透传方法（getAppVersion() 已是唯一来源）
  // V1.5.0: 广播"我刚停止发布"的公告
  // 不带任何包信息，httpPort=0、stopped=true；收端凭此清理 availableUpdates
  broadcastVersionAnnouncementStopped(targetVersion: string): void {
    if (!this.socket) return
    if (!this.selfPublicKey) {
      log.warn('Cannot broadcast stop announcement: no identity key')
      return
    }
    const config = storageService.loadConfig()
    const payload: VersionAnnouncementPayload = {
      version: VERSION_ANNOUNCEMENT_PROTOCOL_VERSION,
      targetVersion,
      publisherPeerId: this.selfPeerId,
      publisherNickname: config?.nickname || 'User',
      httpPort: 0,
      stopped: true,
      timestamp: Date.now(),
    }
    let signature = ''
    try {
      signature = signPayload(payload as unknown as Record<string, unknown>)
    } catch (err) {
      log.error('Failed to sign stop announcement:', err)
      return
    }
    const full: VersionAnnouncement = {
      ...payload,
      publicKey: this.selfPublicKey,
      signature,
    }
    const data = JSON.stringify({ kind: ANNOUNCEMENT_KIND.VERSION, data: full })
    const buf = Buffer.from(data, 'utf-8')

    const segments = getNetworkInterfaces()
    const ports = getScanUdpPorts()
    for (const seg of segments) {
      for (const port of ports) {
        const targets: Array<{ address: string; port: number }> = [
          { address: seg.broadcast, port },
        ]
        if (isMultiInstanceMode()) {
          targets.push({ address: '127.0.0.1', port })
        }
        for (const t of targets) {
          this.socket.send(buf, 0, buf.length, t.port, t.address, (err) => {
            if (err) log.debug('Stop-announcement send error:', err)
          })
        }
      }
    }
    log.info('Broadcast stop announcement for version:', targetVersion)
  }
}

export const udpBroadcaster = new UdpBroadcaster()
