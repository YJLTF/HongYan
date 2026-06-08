import dgram from 'dgram'
import {
  getUdpPort,
  ONLINE_TIMEOUT_MS,
  ANNOUNCEMENT_KIND,
  DEFAULT_HEARTBEAT_INTERVAL_MS,
} from '@shared/constants'
import { PROTOCOL_VERSION } from '@shared/types'
import type { PresenceAnnouncement, Friend } from '@shared/types'
import { storageService } from '../storage/storage-service'
import { getNetworkInterfaces } from './network-utils'
import log from 'electron-log'

// 检测是否处于多实例/开发模式
// 触发条件：HONGYAN_DATA_DIR 被设置（典型多实例测试场景）或 NODE_ENV=development
// 多实例模式下不同实例绑定不同 UDP 端口，必须扫全端口 + 127.0.0.1 才能互相发现
function isMultiInstanceMode(): boolean {
  return process.env.NODE_ENV === 'development' || !!process.env.HONGYAN_DATA_DIR
}

// 注意：每次调用时读取端口，避免在模块加载时 env var 尚未生效
function getScanUdpPorts(): number[] {
  return isMultiInstanceMode()
    ? [19876, 19877, 19878, 19879, 19880]
    : [getUdpPort()]
}

export type BroadcastReason =
  | 'start'
  | 'stop'
  | 'self-info-changed'
  | 'manual-refresh'
  | 'send-failure'
  | 'heartbeat'

class UdpBroadcaster {
  private socket: dgram.Socket | null = null
  private heartbeatTimer: NodeJS.Timeout | null = null
  private onlineCheckTimer: NodeJS.Timeout | null = null
  private friends = new Map<string, Friend>()
  private selfPeerId = ''
  private selfNickname = ''
  private selfTcpPort = 19877
  // 心跳间隔（ms）；0 = 完全关闭
  // 默认走 DEFAULT_HEARTBEAT_INTERVAL_MS，外部可通过 setHeartbeatInterval 调整
  private heartbeatIntervalMs: number = DEFAULT_HEARTBEAT_INTERVAL_MS
  private lastBroadcastAt = 0
  // 防止短时间内因多个事件触发重复广播（如 send-failure 与 manual-refresh 同帧触发）
  private readonly minBroadcastGapMs = 200

  private onFriendOnline: ((friend: Friend) => void) | null = null
  private onFriendOffline: ((peerId: string) => void) | null = null
  private onFriendUpdated: ((friend: Friend) => void) | null = null

  start(peerId: string, nickname: string, tcpPort: number): void {
    this.selfPeerId = peerId
    this.selfNickname = nickname
    this.selfTcpPort = tcpPort

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
      // 事件驱动：启动时广播一次"上线公告"
      this.broadcastNow('start')

      // 启动低频心跳（兜底检测对方静默崩溃）；interval=0 时不启动
      this.startHeartbeat()

      // 在线检查 timer 仍保留，用于 ONLINE_TIMEOUT_MS 兜底
      this.onlineCheckTimer = setInterval(() => {
        this.checkOnlineStatus()
      }, ONLINE_TIMEOUT_MS / 2)
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
    // 优雅退出时广播"下线公告"，对方立即标记离线
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
    // scanSegment 仍复用普通 announcement，让对方发现自己
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

  // 运行时更新本地用户信息（昵称/头像修改后立即广播一次）
  setSelfInfo(info: { peerId?: string; nickname?: string; tcpPort?: number }): void {
    if (info.peerId !== undefined) this.selfPeerId = info.peerId
    if (info.nickname !== undefined) this.selfNickname = info.nickname
    if (info.tcpPort !== undefined) this.selfTcpPort = info.tcpPort
    if (this.socket) {
      log.info('Self info updated, broadcasting immediately:', this.selfNickname)
      this.broadcastNow('self-info-changed')
    }
  }

  // 手动触发一次广播（friend:refresh IPC 用）
  refresh(): void {
    log.info('Manual refresh requested')
    this.broadcastNow('manual-refresh')
  }

  // 主动广播下线公告
  broadcastLeaving(): void {
    if (!this.socket) return
    log.info('Broadcasting leaving announcement')
    this.broadcastToCurrentSegment(ANNOUNCEMENT_KIND.LEAVING, 'stop')
  }

  // 配置心跳间隔；0 = 关闭
  setHeartbeatInterval(intervalMs: number): void {
    this.heartbeatIntervalMs = intervalMs
    log.info('Heartbeat interval set to', intervalMs, 'ms')
    // 重启心跳 timer 以立即生效
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

  // V1.2.0: 供外部模块（如 friend-discovery-service 订阅的 TCP 断开事件）强制标记好友离线
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

  // 事件驱动广播入口：所有广播都走这里，自动合并短时间内多次触发
  private broadcastNow(reason: BroadcastReason): void {
    if (!this.socket) return
    const now = Date.now()
    // 合并短时间内的多次广播请求（保留最后一次的 reason）
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
    const announcement: PresenceAnnouncement = {
      version: PROTOCOL_VERSION,
      peerId: this.selfPeerId,
      nickname: this.selfNickname,
      ip: this.getOwnIp(),
      tcpPort: this.selfTcpPort,
      timestamp: Date.now(),
    }
    const msg = Buffer.from(JSON.stringify({ kind, data: announcement }), 'utf-8')

    const ports = scanAllPorts ? getScanUdpPorts() : [getUdpPort()]

    // 避免重复发送：只发送到网段广播地址，不重复发送到 255.255.255.255 和 127.0.0.1
    // 127.0.0.1 仅在开发模式发送用于本地测试
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
      if (packet.kind !== ANNOUNCEMENT_KIND.PRESENCE && packet.kind !== ANNOUNCEMENT_KIND.LEAVING) return
      const announcement = packet.data as PresenceAnnouncement
      if (announcement.version !== PROTOCOL_VERSION) return
      if (announcement.peerId === this.selfPeerId) return

      // 下线公告：立即标记离线，不等 ONLINE_TIMEOUT_MS
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

      const friend: Friend = {
        peerId: announcement.peerId,
        nickname: announcement.nickname,
        ip: rinfo.address,
        tcpPort: announcement.tcpPort,
        online: true,
        lastSeen: Date.now(),
      }

      const existing = this.friends.get(friend.peerId)
      const isNew = !existing
      const justCameOnline = !!existing && !existing.online
      const infoChanged = !!existing && existing.online && (
        existing.nickname !== friend.nickname ||
        existing.ip !== friend.ip ||
        existing.tcpPort !== friend.tcpPort
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
        log.info('Friend online:', toPersist.nickname, toPersist.ip)
        this.onFriendOnline?.(toPersist)
      } else if (infoChanged) {
        log.info('Friend info updated:', toPersist.peerId, 'nickname:', toPersist.nickname)
        this.onFriendUpdated?.(toPersist)
      }
    } catch (err) {
      // ignore malformed packets
    }
  }

  private checkOnlineStatus(): void {
    const now = Date.now()
    for (const [peerId, friend] of this.friends) {
      if (friend.online && now - friend.lastSeen > ONLINE_TIMEOUT_MS) {
        friend.online = false
        this.friends.set(peerId, friend)
        storageService.updateFriendOnlineStatus(peerId, false)
        log.info('Friend offline (timeout):', friend.nickname)
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
}

export const udpBroadcaster = new UdpBroadcaster()
