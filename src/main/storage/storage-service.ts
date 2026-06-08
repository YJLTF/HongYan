import { getDatabase } from './database'
import { saveConfig, loadConfig as loadConfigFromStore } from './config-store'
import type { IStorageService, ChatRecord, Friend, FileTransferRecord, AppConfig, FileTransferStatus, MessageStatus } from '@shared/types'
import log from 'electron-log'

class StorageService implements IStorageService {
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
      .filter(r => r.peerId === peerId)
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
}

export const storageService = new StorageService()
