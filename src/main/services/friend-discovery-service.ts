import { udpBroadcaster } from '../network/udp-broadcaster'
import { getTcpPort } from '../network/tcp-communication'
import { parseCIDR } from '../network/network-utils'
import { storageService } from '../storage/storage-service'
import { pushFriendOnline, pushFriendOffline } from '../ipc/ipc-push'
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

    udpBroadcaster.setCallbacks(
      (friend) => {
        log.info('Friend discovered:', friend.nickname)
        pushFriendOnline(friend)
      },
      (peerId) => {
        log.info('Friend went offline:', peerId)
        pushFriendOffline(peerId)
      }
    )

    udpBroadcaster.start(peerId, nickname, tcpPort)
    this.started = true
    log.info('Friend discovery service started')
  }

  stop(): void {
    udpBroadcaster.stop()
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

  getFriends(): Friend[] {
    return udpBroadcaster.getFriends()
  }

  getFriend(peerId: string): Friend | undefined {
    return udpBroadcaster.getFriend(peerId)
  }
}

export const friendDiscoveryService = new FriendDiscoveryService()
