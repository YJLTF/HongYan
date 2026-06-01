import { getDatabase } from './database'
import { saveConfig, loadConfig as loadConfigFromStore } from './config-store'
import type { IStorageService, ChatRecord, Friend, FileTransferRecord, AppConfig, FileTransferStatus } from '@shared/types'
import log from 'electron-log'

class StorageService implements IStorageService {
  saveChatRecord(record: ChatRecord): void {
    const db = getDatabase()
    const insert = db.prepare(`
      INSERT OR REPLACE INTO chat_records (id, peer_id, type, direction, content, thumbnail, file_name, file_size, status, timestamp, recalled)
      VALUES (@id, @peerId, @type, @direction, @content, @thumbnail, @fileName, @fileSize, @status, @timestamp, @recalled)
    `)
    const tx = db.transaction(() => {
      insert.run({
        id: record.id,
        peerId: record.peerId,
        type: record.type,
        direction: record.direction,
        content: record.content,
        thumbnail: record.thumbnail ?? null,
        fileName: record.fileName ?? null,
        fileSize: record.fileSize ?? null,
        status: record.status,
        timestamp: record.timestamp,
        recalled: record.recalled ? 1 : 0,
      })
    })
    try {
      tx()
    } catch (err) {
      log.error('Failed to save chat record:', err)
      throw err
    }
  }

  saveChatRecords(records: ChatRecord[]): void {
    const db = getDatabase()
    const insert = db.prepare(`
      INSERT OR REPLACE INTO chat_records (id, peer_id, type, direction, content, thumbnail, file_name, file_size, status, timestamp, recalled)
      VALUES (@id, @peerId, @type, @direction, @content, @thumbnail, @fileName, @fileSize, @status, @timestamp, @recalled)
    `)
    const tx = db.transaction(() => {
      for (const record of records) {
        insert.run({
          id: record.id,
          peerId: record.peerId,
          type: record.type,
          direction: record.direction,
          content: record.content,
          thumbnail: record.thumbnail ?? null,
          fileName: record.fileName ?? null,
          fileSize: record.fileSize ?? null,
          status: record.status,
          timestamp: record.timestamp,
          recalled: record.recalled ? 1 : 0,
        })
      }
    })
    try {
      tx()
    } catch (err) {
      log.error('Failed to save chat records batch:', err)
      throw err
    }
  }

  queryChatRecords(peerId: string, limit = 100, offset = 0): ChatRecord[] {
    const db = getDatabase()
    const stmt = db.prepare(
      'SELECT * FROM chat_records WHERE peer_id = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?'
    )
    const rows = stmt.all(peerId, limit, offset) as any[]
    return rows.map(this.mapChatRecord).reverse()
  }

  saveFriend(friend: Friend): void {
    const db = getDatabase()
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO friends (peer_id, nickname, remark, avatar, ip, tcp_port, online, last_seen)
      VALUES (@peerId, @nickname, @remark, @avatar, @ip, @tcpPort, @online, @lastSeen)
    `)
    try {
      stmt.run({
        peerId: friend.peerId,
        nickname: friend.nickname,
        remark: friend.remark ?? null,
        avatar: friend.avatar ?? null,
        ip: friend.ip,
        tcpPort: friend.tcpPort,
        online: friend.online ? 1 : 0,
        lastSeen: friend.lastSeen,
      })
    } catch (err) {
      log.error('Failed to save friend:', err)
    }
  }

  // 更新好友备注
  updateFriendRemark(peerId: string, remark: string | null): void {
    const db = getDatabase()
    const stmt = db.prepare(
      'UPDATE friends SET remark = ? WHERE peer_id = ?'
    )
    stmt.run(remark, peerId)
  }

  // 更新好友头像
  updateFriendAvatar(peerId: string, avatar: string | null): void {
    const db = getDatabase()
    const stmt = db.prepare(
      'UPDATE friends SET avatar = ? WHERE peer_id = ?'
    )
    stmt.run(avatar, peerId)
  }

  // 删除好友
  deleteFriend(peerId: string): void {
    const db = getDatabase()
    // 同时删除相关的聊天记录
    db.prepare('DELETE FROM chat_records WHERE peer_id = ?').run(peerId)
    db.prepare('DELETE FROM friends WHERE peer_id = ?').run(peerId)
  }

  // 更新消息状态
  updateMessageStatus(messageId: string, status: string): void {
    const db = getDatabase()
    const stmt = db.prepare(
      'UPDATE chat_records SET status = ? WHERE id = ?'
    )
    stmt.run(status, messageId)
  }

  queryFriends(): Friend[] {
    const db = getDatabase()
    const stmt = db.prepare('SELECT * FROM friends')
    const rows = stmt.all() as any[]
    return rows.map(this.mapFriend)
  }

  updateFriendOnlineStatus(peerId: string, online: boolean): void {
    const db = getDatabase()
    const stmt = db.prepare(
      'UPDATE friends SET online = ?, last_seen = ? WHERE peer_id = ?'
    )
    stmt.run(online ? 1 : 0, Date.now(), peerId)
  }

  saveFileTransfer(record: FileTransferRecord): void {
    const db = getDatabase()
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO file_transfers (transfer_id, peer_id, direction, file_name, file_size, status, progress, md5, save_path, timestamp)
      VALUES (@transferId, @peerId, @direction, @fileName, @fileSize, @status, @progress, @md5, @savePath, @timestamp)
    `)
    try {
      stmt.run({
        transferId: record.transferId,
        peerId: record.peerId,
        direction: record.direction,
        fileName: record.fileName,
        fileSize: record.fileSize,
        status: record.status,
        progress: record.progress,
        md5: record.md5 ?? null,
        savePath: record.savePath ?? null,
        timestamp: record.timestamp,
      })
    } catch (err) {
      log.error('Failed to save file transfer:', err)
    }
  }

  updateFileTransferStatus(transferId: string, status: FileTransferStatus, progress?: number): void {
    const db = getDatabase()
    if (progress !== undefined) {
      const stmt = db.prepare('UPDATE file_transfers SET status = ?, progress = ? WHERE transfer_id = ?')
      stmt.run(status, progress, transferId)
    } else {
      const stmt = db.prepare('UPDATE file_transfers SET status = ? WHERE transfer_id = ?')
      stmt.run(status, transferId)
    }
  }

  queryFileTransfers(peerId?: string): FileTransferRecord[] {
    const db = getDatabase()
    if (peerId) {
      const stmt = db.prepare('SELECT * FROM file_transfers WHERE peer_id = ?')
      return (stmt.all(peerId) as any[]).map(this.mapFileTransfer)
    }
    const stmt = db.prepare('SELECT * FROM file_transfers')
    return (stmt.all() as any[]).map(this.mapFileTransfer)
  }

  saveConfig(config: AppConfig): void {
    saveConfig(config)
  }

  loadConfig(): AppConfig | null {
    return loadConfigFromStore()
  }

  private mapChatRecord(row: any): ChatRecord {
    return {
      id: row.id,
      peerId: row.peer_id,
      type: row.type,
      direction: row.direction,
      content: row.content,
      thumbnail: row.thumbnail ?? undefined,
      fileName: row.file_name ?? undefined,
      fileSize: row.file_size ?? undefined,
      status: row.status,
      timestamp: row.timestamp,
      recalled: row.recalled === 1,
    }
  }

  private mapFriend(row: any): Friend {
    return {
      peerId: row.peer_id,
      nickname: row.nickname,
      remark: row.remark ?? undefined,
      avatar: row.avatar ?? undefined,
      ip: row.ip,
      tcpPort: row.tcp_port,
      online: row.online === 1,
      lastSeen: row.last_seen,
    }
  }

  private mapFileTransfer(row: any): FileTransferRecord {
    return {
      transferId: row.transfer_id,
      peerId: row.peer_id,
      direction: row.direction,
      fileName: row.file_name,
      fileSize: row.file_size,
      status: row.status,
      progress: row.progress,
      md5: row.md5 ?? undefined,
      savePath: row.save_path ?? undefined,
      timestamp: row.timestamp,
    }
  }
}

export const storageService = new StorageService()
