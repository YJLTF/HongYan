import { udpBroadcaster } from '../network/udp-broadcaster'
import { getTcpPort } from '../network/tcp-communication'
import { parseCIDR } from '../network/network-utils'
import { getConnectionEvents } from '../network/connection-manager'
import { storageService } from '../storage/storage-service'
import { pushFriendOnline, pushFriendOffline, pushFriendUpdated } from '../ipc/ipc-push'
import { groupService } from './group-service'
import type { IFriendDiscoveryService, Friend } from '@shared/types'
import log from 'electron-log'

class FriendDiscoveryService implements IFriendDiscoveryService {
  private started = false

  start(): void {
    if (this.started) return
    const config = storageService.loadConfig()
    const peerId = config?.peerId || ''
    const nickname = config?.nickname || 'User'
    const tcpPort = getTcpPort()
    // V1.2.0: 应用用户配置的 heartbeat 间隔（默认 60s）
    const heartbeat = config?.heartbeatIntervalMs
    if (typeof heartbeat === 'number') {
      udpBroadcaster.setHeartbeatInterval(heartbeat)
    }

    udpBroadcaster.setCallbacks(
      (friend) => {
        log.info('Friend discovered:', friend.nickname)
        pushFriendOnline(friend)
        // V1.4.0: 好友上线时重试待分发的群密钥
        groupService.retryPendingDeliveriesForPeer(friend.peerId).catch(err =>
          log.warn('Retry pending group key deliveries failed:', err)
        )
      },
      (peerId) => {
        log.info('Friend went offline:', peerId)
        pushFriendOffline(peerId)
      },
      (friend) => {
        log.info('Friend info updated:', friend.peerId, 'nickname:', friend.nickname)
        pushFriendUpdated(friend)
      }
    )

    udpBroadcaster.start(peerId, nickname, tcpPort)

    // V1.2.0: 订阅 TCP 连接断开事件，TCP 断开比 UDP 心跳超时更可靠
    // 一旦 TCP 断开立即标记离线，不等 ONLINE_TIMEOUT_MS
    getConnectionEvents().on('peer:disconnected', (peerId: string) => {
      const friend = udpBroadcaster.getFriend(peerId)
      if (friend && friend.online) {
        log.info('TCP disconnected, marking friend offline immediately:', friend.nickname)
        udpBroadcaster.markOffline(peerId)
      }
    })

    this.started = true
    log.info('Friend discovery service started')
  }

  stop(opts: { graceful?: boolean } = {}): void {
    udpBroadcaster.stop(opts)
    this.started = false
    log.info('Friend discovery service stopped')
  }

  async scanSegment(cidr: string): Promise<Friend[]> {
    const segment = parseCIDR(cidr)
    if (!segment) {
      throw new Error('Invalid network segment format')
    }
    udpBroadcaster.scanSegment(segment.broadcast)
    await new Promise((resolve) => setTimeout(resolve, 10000))
    return this.getFriends()
  }

  // V1.2.0: 手动触发一次 UDP 广播
  refresh(): void {
    udpBroadcaster.refresh()
  }

  // V1.2.0: 更新心跳间隔
  setHeartbeatInterval(intervalMs: number): void {
    udpBroadcaster.setHeartbeatInterval(intervalMs)
  }

  getHeartbeatInterval(): number {
    return udpBroadcaster.getHeartbeatInterval()
  }

  getFriends(): Friend[] {
    return udpBroadcaster.getFriends()
  }

  getFriend(peerId: string): Friend | undefined {
    return udpBroadcaster.getFriend(peerId)
  }
}

export const friendDiscoveryService = new FriendDiscoveryService()
