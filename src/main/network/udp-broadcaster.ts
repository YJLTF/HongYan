import dgram from 'dgram'
import { UDP_PORT, BROADCAST_INTERVAL_MS, ONLINE_TIMEOUT_MS } from '@shared/constants'
import { PROTOCOL_VERSION } from '@shared/types'
import type { PresenceAnnouncement, Friend } from '@shared/types'
import { storageService } from '../storage/storage-service'
import { getNetworkInterfaces } from './network-utils'
import log from 'electron-log'

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

    this.socket.bind(UDP_PORT, () => {
      if (this.socket) {
        this.socket.setBroadcast(true)
        this.broadcastToCurrentSegment()
        log.info('UDP broadcaster started on port', UDP_PORT)
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
    this.sendAnnouncement(broadcastAddress)
    log.info('Scanning segment via broadcast:', broadcastAddress)
  }

  setCallbacks(
    onOnline: (friend: Friend) => void,
    onOffline: (peerId: string) => void
  ): void {
    this.onFriendOnline = onOnline
    this.onFriendOffline = onOffline
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
      this.sendAnnouncement(seg.broadcast)
    }
  }

  private sendAnnouncement(broadcastAddress: string): void {
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
    this.socket.send(msg, 0, msg.length, UDP_PORT, broadcastAddress, (err) => {
      if (err) log.error('Broadcast send error:', err)
    })
  }

  private handleMessage(msg: Buffer, rinfo: dgram.AddressInfo): void {
    try {
      const packet = JSON.parse(msg.toString('utf-8'))
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
      this.friends.set(friend.peerId, friend)
      storageService.saveFriend(friend)

      if (!existing || !existing.online) {
        log.info('Friend online:', friend.nickname, friend.ip)
        this.onFriendOnline?.(friend)
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
