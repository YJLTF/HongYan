import { getDatabase } from './database'
import { saveConfig, loadConfig as loadConfigFromStore } from './config-store'
import { ConversationType } from '@shared/types'
import type {
  IStorageService, ChatRecord, Friend, FileTransferRecord, AppConfig,
  FileTransferStatus, MessageStatus, Group,
  PublishedUpdate, AvailableUpdate,
} from '@shared/types'
import log from 'electron-log'

class StorageService implements IStorageService {
  // V1.5.0 修复: availableUpdates 是「当前在线发布方的活跃公告」这种瞬态状态，
  // 不能跨重启保留——否则发布方下线后接收方重启会从 DB 加载出已失效的记录，
  // 横幅再次弹出，但 publisher 的 HTTP 服务早已不在，点下载必 ECONNREFUSED。
  // 用纯内存 Map：UDP 公告到达时 upsert，stopped 信号或重启时自然清空。
  // 发布方默认每 5 分钟重广播一次（VERSION_BROADCAST_REPEAT_MS），失活记录无外援即消失。
  private availableUpdatesMem = new Map<string, AvailableUpdate>()

  private availableUpdateKey(publisherPeerId: string, targetVersion: string): string {
    return `${publisherPeerId}::${targetVersion}`
  }

  saveChatRecord(record: ChatRecord): void {
    const db = getDatabase()
    const index = db.data.chatRecords.findIndex(r => r.id === record.id)
    if (index !== -1) {
      db.data.chatRecords[index] = record
    } else {
      db.data.chatRecords.push(record)
    }
    db.write().catch(err => log.error('Failed to save chat record:', err))
  }

  saveChatRecords(records: ChatRecord[]): void {
    const db = getDatabase()
    for (const record of records) {
      const index = db.data.chatRecords.findIndex(r => r.id === record.id)
      if (index !== -1) {
        db.data.chatRecords[index] = record
      } else {
        db.data.chatRecords.push(record)
      }
    }
    db.write().catch(err => log.error('Failed to save chat records batch:', err))
  }

  queryChatRecords(peerId: string, limit = 100, offset = 0): ChatRecord[] {
    const db = getDatabase()
    const records = db.data.chatRecords
      .filter(r => r.peerId === peerId && r.conversationType !== ConversationType.GROUP)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(offset, offset + limit)
      .reverse()
    return records
  }

  saveFriend(friend: Friend): void {
    const db = getDatabase()
    const index = db.data.friends.findIndex(f => f.peerId === friend.peerId)
    if (index !== -1) {
      db.data.friends[index] = friend
    } else {
      db.data.friends.push(friend)
    }
    db.write().catch(err => log.error('Failed to save friend:', err))
  }

  // 更新好友备注
  updateFriendRemark(peerId: string, remark: string | null): void {
    const db = getDatabase()
    const friend = db.data.friends.find(f => f.peerId === peerId)
    if (friend) {
      friend.remark = remark ?? undefined
      db.write().catch(err => log.error('Failed to update friend remark:', err))
    }
  }

  // 更新好友头像
  updateFriendAvatar(peerId: string, avatar: string | null): void {
    const db = getDatabase()
    const friend = db.data.friends.find(f => f.peerId === peerId)
    if (friend) {
      friend.avatar = avatar ?? undefined
      db.write().catch(err => log.error('Failed to update friend avatar:', err))
    }
  }

  // 删除好友
  deleteFriend(peerId: string): void {
    const db = getDatabase()
    // 同时删除相关的聊天记录
    db.data.chatRecords = db.data.chatRecords.filter(r => r.peerId !== peerId)
    db.data.friends = db.data.friends.filter(f => f.peerId !== peerId)
    db.write().catch(err => log.error('Failed to delete friend:', err))
  }

  // 更新消息状态
  updateMessageStatus(messageId: string, status: MessageStatus): void {
    const db = getDatabase()
    const record = db.data.chatRecords.find(r => r.id === messageId)
    if (record) {
      record.status = status
      db.write().catch(err => log.error('Failed to update message status:', err))
    }
  }

  queryFriends(): Friend[] {
    const db = getDatabase()
    return [...db.data.friends]
  }

  // V1.2.0: TOFU 信任链查询
  getStoredPublicKey(peerId: string): string | undefined {
    const db = getDatabase()
    const friend = db.data.friends.find(f => f.peerId === peerId)
    return friend?.publicKey
  }

  updateFriendOnlineStatus(peerId: string, online: boolean): void {
    const db = getDatabase()
    const friend = db.data.friends.find(f => f.peerId === peerId)
    if (friend) {
      friend.online = online
      friend.lastSeen = Date.now()
      db.write().catch(err => log.error('Failed to update friend online status:', err))
    }
  }

  saveFileTransfer(record: FileTransferRecord): void {
    const db = getDatabase()
    const index = db.data.fileTransfers.findIndex(t => t.transferId === record.transferId)
    if (index !== -1) {
      db.data.fileTransfers[index] = record
    } else {
      db.data.fileTransfers.push(record)
    }
    db.write().catch(err => log.error('Failed to save file transfer:', err))
  }

  updateFileTransferStatus(transferId: string, status: FileTransferStatus, progress?: number): void {
    const db = getDatabase()
    const record = db.data.fileTransfers.find(t => t.transferId === transferId)
    if (record) {
      record.status = status
      if (progress !== undefined) {
        record.progress = progress
      }
      db.write().catch(err => log.error('Failed to update file transfer status:', err))
    }
  }

  updateFileTransferSavePath(transferId: string, savePath: string): void {
    const db = getDatabase()
    const record = db.data.fileTransfers.find(t => t.transferId === transferId)
    if (record) {
      record.savePath = savePath
      db.write().catch(err => log.error('Failed to update file transfer save path:', err))
    }
  }

  queryFileTransfers(peerId?: string): FileTransferRecord[] {
    const db = getDatabase()
    if (peerId) {
      return db.data.fileTransfers.filter(t => t.peerId === peerId)
    }
    return [...db.data.fileTransfers]
  }

  saveConfig(config: AppConfig): void {
    saveConfig(config)
  }

  loadConfig(): AppConfig | null {
    return loadConfigFromStore()
  }

  // ============================================================
  // V1.4.0: 群组管理
  // ============================================================

  saveGroup(group: Group): void {
    const db = getDatabase()
    const index = db.data.groups.findIndex(g => g.groupId === group.groupId)
    if (index !== -1) {
      db.data.groups[index] = group
    } else {
      db.data.groups.push(group)
    }
    db.write().catch(err => log.error('Failed to save group:', err))
  }

  queryGroups(): Group[] {
    const db = getDatabase()
    return [...db.data.groups]
  }

  getGroup(groupId: string): Group | undefined {
    const db = getDatabase()
    return db.data.groups.find(g => g.groupId === groupId)
  }

  deleteGroup(groupId: string): void {
    const db = getDatabase()
    db.data.groups = db.data.groups.filter(g => g.groupId !== groupId)
    // 同时删除该群的所有聊天记录
    db.data.chatRecords = db.data.chatRecords.filter(r => r.groupId !== groupId)
    db.write().catch(err => log.error('Failed to delete group:', err))
  }

  // ============================================================
  // V1.4.0: 群消息
  // ============================================================

  queryGroupChatRecords(groupId: string, limit = 100, offset = 0): ChatRecord[] {
    const db = getDatabase()
    const records = db.data.chatRecords
      .filter(r => r.groupId === groupId && r.conversationType === ConversationType.GROUP)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(offset, offset + limit)
      .reverse()
    return records
  }

  // ============================================================
  // V1.5.0: 版本分发（发布 / 接收）持久化
  // ============================================================

  // --- 发布方 ---

  savePublishedUpdate(record: PublishedUpdate): void {
    const db = getDatabase()
    const index = db.data.publishedUpdates.findIndex(r => r.id === record.id)
    if (index !== -1) {
      db.data.publishedUpdates[index] = record
    } else {
      db.data.publishedUpdates.push(record)
    }
    db.write().catch(err => log.error('Failed to save published update:', err))
  }

  listPublishedUpdates(): PublishedUpdate[] {
    const db = getDatabase()
    return [...db.data.publishedUpdates].sort((a, b) => b.publishedAt - a.publishedAt)
  }

  getPublishedUpdate(id: string): PublishedUpdate | undefined {
    const db = getDatabase()
    return db.data.publishedUpdates.find(r => r.id === id)
  }

  // 累加下载计数
  incrementPublishedUpdateDownloadCount(id: string): void {
    const db = getDatabase()
    const record = db.data.publishedUpdates.find(r => r.id === id)
    if (record) {
      record.downloadCount += 1
      db.write().catch(err => log.error('Failed to increment download count:', err))
    }
  }

  // --- 收端 ---

  // 收到版本公告时 upsert：同一 publisherPeerId + version 视为同一条
  // V1.5.0 修复: 发布方明确重广播 = 重新提示，dismissed 不再保留
  upsertAvailableUpdate(record: AvailableUpdate): void {
    this.availableUpdatesMem.set(
      this.availableUpdateKey(record.publisherPeerId, record.targetVersion),
      { ...record, dismissed: false },
    )
  }

  // V1.5.0: 删除已发布的记录
  deletePublishedUpdate(id: string): void {
    const db = getDatabase()
    const before = db.data.publishedUpdates.length
    db.data.publishedUpdates = db.data.publishedUpdates.filter(r => r.id !== id)
    if (db.data.publishedUpdates.length < before) {
      db.write().catch(err => log.error('Failed to delete published update:', err))
    }
  }

  listAvailableUpdates(): AvailableUpdate[] {
    return Array.from(this.availableUpdatesMem.values())
      .sort((a, b) => b.receivedAt - a.receivedAt)
  }

  setAvailableUpdateDismissed(publisherPeerId: string, targetVersion: string, dismissed: boolean): void {
    const key = this.availableUpdateKey(publisherPeerId, targetVersion)
    const record = this.availableUpdatesMem.get(key)
    if (record) {
      this.availableUpdatesMem.set(key, { ...record, dismissed })
    }
  }

  removeAvailableUpdate(publisherPeerId: string, targetVersion: string): void {
    this.availableUpdatesMem.delete(this.availableUpdateKey(publisherPeerId, targetVersion))
  }

  // V1.5.0: 找到「本机已下载完、安装器文件还在」的某条历史发布
  findPublishedUpdateByVersion(version: string): PublishedUpdate | undefined {
    const db = getDatabase()
    return db.data.publishedUpdates.find(r => r.version === version)
  }
}

export const storageService = new StorageService()
