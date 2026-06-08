import dgram from 'dgram'
import { getUdpPort, BROADCAST_INTERVAL_MS, ONLINE_TIMEOUT_MS } from '@shared/constants'
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

class UdpBroadcaster {
  private socket: dgram.Socket | null = null
  private timer: NodeJS.Timeout | null = null
  private onlineCheckTimer: NodeJS.Timeout | null = null
  private friends = new Map<string, Friend>()
  private selfPeerId = ''
  private selfNickname = ''
  private selfTcpPort = 19877
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
        this.broadcastToCurrentSegment()
        log.info('UDP broadcaster started on port', getUdpPort())
      }

      this.timer = setInterval(() => {
        this.broadcastToCurrentSegment()
      }, BROADCAST_INTERVAL_MS)

      this.onlineCheckTimer = setInterval(() => {
        this.checkOnlineStatus()
      }, ONLINE_TIMEOUT_MS / 2)
    })
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    if (this.onlineCheckTimer) {
      clearInterval(this.onlineCheckTimer)
      this.onlineCheckTimer = null
    }
    if (this.socket) {
      this.socket.close()
      this.socket = null
    }
    log.info('UDP broadcaster stopped')
  }

  scanSegment(broadcastAddress: string): void {
    this.sendAnnouncement(broadcastAddress, true)
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

  // 允许运行时更新本地用户信息（如昵称修改后立即同步给在线好友）
  setSelfInfo(info: { peerId?: string; nickname?: string; tcpPort?: number }): void {
    if (info.peerId !== undefined) this.selfPeerId = info.peerId
    if (info.nickname !== undefined) this.selfNickname = info.nickname
    if (info.tcpPort !== undefined) this.selfTcpPort = info.tcpPort
    // 立即广播一次，避免等到下一个 BROADCAST_INTERVAL_MS 周期
    if (this.socket) {
      log.info('Self info updated, broadcasting immediately:', this.selfNickname)
      this.broadcastToCurrentSegment()
    }
  }

  getFriends(): Friend[] {
    return Array.from(this.friends.values())
  }

  getFriend(peerId: string): Friend | undefined {
    return this.friends.get(peerId)
  }

  private broadcastToCurrentSegment(): void {

    const segments = getNetworkInterfaces()
    for (const seg of segments) {
      this.sendAnnouncement(seg.broadcast, true)
    }
  }

  private sendAnnouncement(broadcastAddress: string, scanAllPorts: boolean = false): void {
    if (!this.socket) return
    const announcement: PresenceAnnouncement = {
      version: PROTOCOL_VERSION,
      peerId: this.selfPeerId,
      nickname: this.selfNickname,
      ip: this.getOwnIp(),
      tcpPort: this.selfTcpPort,
      timestamp: Date.now(),
    }
    const msg = Buffer.from(JSON.stringify({ kind: 'announcement', data: announcement }), 'utf-8')
    
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
    
    log.debug('Sending announcement to', targets.length, 'targets')
    
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
      if (packet.kind !== 'announcement') return
      const announcement = packet.data as PresenceAnnouncement
      if (announcement.version !== PROTOCOL_VERSION) return
      if (announcement.peerId === this.selfPeerId) return

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
        log.info('Friend offline:', friend.nickname)
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
