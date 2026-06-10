import log from 'electron-log'
import type { VersionAnnouncement, AvailableUpdate } from '@shared/types'
import { storageService } from '../storage/storage-service'
import { udpBroadcaster } from '../network/udp-broadcaster'
import {
  pushUpdateAvailable,
  pushUpdateRemoved,
} from '../ipc/ipc-push'

/**
 * V1.5.0: 收端处理 UDP 版本公告
 * - 收到新的 / 更新的版本公告：upsert 到 availableUpdates 并推送给渲染端
 * - 收到 stopped=true 公告：从 availableUpdates 删除并推送 removed 事件
 *
 * 仅在 app ready 后由 index.ts 调用 registerUpdateReceiver() 一次性注册
 */
let registered = false

export function registerUpdateReceiver(): void {
  if (registered) return
  registered = true
  udpBroadcaster.setVersionAnnouncementCallback((payload, fromIp) => {
    try {
      handleVersionAnnouncement(payload, fromIp)
    } catch (err) {
      log.error('Failed to handle version announcement:', err)
    }
  })
  log.info('Update receiver registered')
}

function handleVersionAnnouncement(payload: VersionAnnouncement, fromIp: string): void {
  if (payload.stopped) {
    // 发布方主动停止 → 删除
    const existing = storageService.listAvailableUpdates().find(
      r => r.publisherPeerId === payload.publisherPeerId && r.targetVersion === payload.targetVersion
    )
    if (existing) {
      storageService.removeAvailableUpdate(payload.publisherPeerId, payload.targetVersion)
      log.info('Removed available update (publisher stopped):', payload.publisherPeerId, payload.targetVersion)
      pushUpdateRemoved(payload.publisherPeerId, payload.targetVersion)
    } else {
      log.debug('Stop announcement for unknown record, ignoring:', payload.publisherPeerId, payload.targetVersion)
    }
    return
  }

  const record: AvailableUpdate = {
    publisherPeerId: payload.publisherPeerId,
    publisherNickname: payload.publisherNickname,
    targetVersion: payload.targetVersion,
    httpPort: payload.httpPort,
    publisherIp: fromIp,
    nsis: payload.nsis,
    portable: payload.portable,
    note: payload.note,
    receivedAt: Date.now(),
  }
  storageService.upsertAvailableUpdate(record)
  // 推送完整记录
  const stored = storageService.listAvailableUpdates().find(
    r => r.publisherPeerId === record.publisherPeerId && r.targetVersion === record.targetVersion
  ) || record
  log.info('New available update:', record.publisherPeerId, record.targetVersion, 'from', fromIp)
  pushUpdateAvailable(stored)
}
