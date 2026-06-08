import crypto from 'crypto'
import fs from 'fs'
import { cryptoService } from '../crypto/crypto-service'
import { storageService } from '../storage/storage-service'
import { udpBroadcaster } from '../network/udp-broadcaster'
import { sendToPeer } from '../network/connection-manager'
import { createPacket } from '../network/protocol'
import type { IMessageService, ChatRecord, MessagePacket, MessageAckPacket } from '@shared/types'
import { MessageType, MessageStatus, PROTOCOL_VERSION } from '@shared/types'
import log from 'electron-log'

class MessageService implements IMessageService {
  private pendingAcks = new Map<string, { resolve: () => void; timer: NodeJS.Timeout }>()

  private async ensureSessionKey(peerId: string): Promise<void> {
    if (!cryptoService.needsRenegotiation(peerId)) return
    const friend = udpBroadcaster.getFriend(peerId)
    if (!friend) throw new Error('Friend not found')
    const requestJson = await cryptoService.negotiateKey(peerId)
    if (requestJson) {
      const packet = createPacket('key-negotiation', JSON.parse(requestJson))
      await sendToPeer(friend, packet)
      await cryptoService.waitForSessionKey(peerId)
    }
  }

  async sendText(peerId: string, content: string): Promise<string> {
    if (!content.trim()) throw new Error('Message content cannot be empty')
    const friend = udpBroadcaster.getFriend(peerId)
    if (!friend || !friend.online) throw new Error('Friend is not online')

    await this.ensureSessionKey(peerId)

    const messageId = crypto.randomUUID()
    const timestamp = Date.now()
    const selfPeerId = storageService.loadConfig()?.peerId || ''

    const messagePacket: MessagePacket = {
      version: PROTOCOL_VERSION,
      type: MessageType.TEXT,
      messageId,
      fromPeerId: selfPeerId,
      toPeerId: peerId,
      timestamp,
      payload: content,
    }

    const encrypted = cryptoService.encryptForTransmission(peerId, JSON.stringify(messagePacket))
    const packet = createPacket('message', { fromPeerId: selfPeerId, encrypted })

    const record: ChatRecord = {
      id: messageId,
      peerId,
      type: MessageType.TEXT,
      direction: 'sent',
      content: this.encryptForStorage(content),
      status: MessageStatus.SENDING,
      timestamp,
    }
    storageService.saveChatRecord(record)

    try {
      await sendToPeer(friend, packet)
      record.status = MessageStatus.SENT
      storageService.saveChatRecord(record)
    } catch (err) {
      record.status = MessageStatus.FAILED
      storageService.saveChatRecord(record)
      // V1.2.0: 发送失败时触发一次 UDP 广播，以便重新发现对方（IP/端口可能变更）
      udpBroadcaster.refresh()
      log.error('Failed to send text message:', err)
      throw err
    }

    return messageId
  }

  async sendImage(peerId: string, filePath: string): Promise<string> {
    const friend = udpBroadcaster.getFriend(peerId)
    if (!friend || !friend.online) throw new Error('Friend is not online')

    await this.ensureSessionKey(peerId)


    const imageBuffer = fs.readFileSync(filePath)
    const base64 = imageBuffer.toString('base64')
    const messageId = crypto.randomUUID()
    const timestamp = Date.now()
    const selfPeerId = storageService.loadConfig()?.peerId || ''

    const messagePacket: MessagePacket = {
      version: PROTOCOL_VERSION,
      type: MessageType.IMAGE,
      messageId,
      fromPeerId: selfPeerId,
      toPeerId: peerId,
      timestamp,
      payload: base64,
    }

    const encrypted = cryptoService.encryptForTransmission(peerId, JSON.stringify(messagePacket))
    const packet = createPacket('message', { fromPeerId: selfPeerId, encrypted })

    const record: ChatRecord = {
      id: messageId,
      peerId,
      type: MessageType.IMAGE,
      direction: 'sent',
      content: this.encryptForStorage(base64),
      status: MessageStatus.SENDING,
      timestamp,
    }
    storageService.saveChatRecord(record)

    try {
      await sendToPeer(friend, packet)
      record.status = MessageStatus.SENT
      storageService.saveChatRecord(record)
    } catch (err) {
      record.status = MessageStatus.FAILED
      storageService.saveChatRecord(record)
      // V1.2.0: 图片发送失败时也触发一次广播
      udpBroadcaster.refresh()
      throw err
    }

    return messageId
  }

  async loadHistory(peerId: string, limit = 100, offset = 0): Promise<ChatRecord[]> {
    const records = storageService.queryChatRecords(peerId, limit, offset)
    return records.map((r) => ({
      ...r,
      content: this.decryptFromStorage(r.content),
    }))
  }

  handleIncomingMessage(data: any, fromPeerId: string): ChatRecord | null {
    try {
      const peerId = data.fromPeerId || fromPeerId
      const encrypted = data.encrypted || data
      const decrypted = cryptoService.decryptFromTransmission(peerId, encrypted)
      const messagePacket = JSON.parse(decrypted) as MessagePacket

      const ack: MessageAckPacket = {
        version: PROTOCOL_VERSION,
        messageId: messagePacket.messageId,
        timestamp: Date.now(),
      }
      const friend = udpBroadcaster.getFriend(peerId)
      if (friend) {
        const ackEncrypted = cryptoService.encryptForTransmission(peerId, JSON.stringify(ack))
        sendToPeer(friend, createPacket('ack', { fromPeerId: messagePacket.toPeerId, encrypted: ackEncrypted })).catch(() => {})
      }

      const record: ChatRecord = {
        id: messagePacket.messageId,
        peerId,
        type: messagePacket.type,
        direction: 'received',
        content: this.encryptForStorage(messagePacket.payload),
        thumbnail: messagePacket.thumbnail,
        fileName: messagePacket.fileName,
        fileSize: messagePacket.fileSize,
        status: MessageStatus.DELIVERED,
        timestamp: messagePacket.timestamp,
      }
      storageService.saveChatRecord(record)

      return {
        ...record,
        content: messagePacket.payload,
      }
    } catch (err) {
      log.warn('Failed to handle incoming message:', err)
      return null
    }
  }

  handleAck(data: any, fromPeerId: string): void {
    try {
      const peerId = data.fromPeerId || fromPeerId
      const encrypted = data.encrypted || data
      const decrypted = cryptoService.decryptFromTransmission(peerId, encrypted)
      const ack = JSON.parse(decrypted) as MessageAckPacket
      const records = storageService.queryChatRecords(peerId, 1000, 0)
      const record = records.find((r) => r.id === ack.messageId)
      if (record && record.status !== MessageStatus.DELIVERED) {
        record.status = MessageStatus.DELIVERED
        storageService.saveChatRecord(record)
      }
    } catch (err) {
      log.warn('Failed to handle ACK:', err)
    }
  }

  private encryptForStorage(plaintext: string): string {
    return JSON.stringify(cryptoService.encryptForStorage(plaintext))
  }

  private decryptFromStorage(ciphertext: string): string {
    try {
      const encrypted = JSON.parse(ciphertext)
      return cryptoService.decryptFromStorage(encrypted)
    } catch {
      return ciphertext
    }
  }

  // 标记消息为已读
  markMessagesAsRead(peerId: string, messageIds: string[]): void {
    const selfPeerId = storageService.loadConfig()?.peerId || ''

    // 更新本地数据库
    for (const messageId of messageIds) {
      storageService.updateMessageStatus(messageId, MessageStatus.READ)
    }

    // 发送已读回执给对方
    const friend = udpBroadcaster.getFriend(peerId)
    if (friend && friend.online) {
      this.sendReadReceipt(peerId, messageIds).catch(() => {})
    }
  }

  // 发送已读回执
  private async sendReadReceipt(peerId: string, messageIds: string[]): Promise<void> {
    await this.ensureSessionKey(peerId)

    const selfPeerId = storageService.loadConfig()?.peerId || ''
    const timestamp = Date.now()

    const readReceipt = {
      version: PROTOCOL_VERSION,
      type: 'read-receipt',
      fromPeerId: selfPeerId,
      toPeerId: peerId,
      messageIds,
      timestamp,
    }

    const encrypted = cryptoService.encryptForTransmission(peerId, JSON.stringify(readReceipt))
    const packet = createPacket('message', { fromPeerId: selfPeerId, encrypted })

    const friend = udpBroadcaster.getFriend(peerId)
    if (friend) {
      await sendToPeer(friend, packet)
      log.info(`Sent read receipt for ${messageIds.length} messages to ${peerId}`)
    }
  }

  // 处理收到的已读回执
  handleReadReceipt(data: any, fromPeerId: string): void {
    try {
      const peerId = data.fromPeerId || fromPeerId
      const encrypted = data.encrypted || data
      const decrypted = cryptoService.decryptFromTransmission(peerId, encrypted)
      const receiptData = JSON.parse(decrypted)

      if (receiptData.type === 'read-receipt' && Array.isArray(receiptData.messageIds)) {
        // 更新本地数据库中对应消息的状态为已读
        for (const messageId of receiptData.messageIds) {
          storageService.updateMessageStatus(messageId, MessageStatus.READ)
        }
        log.info(`Received read receipt for ${receiptData.messageIds.length} messages from ${peerId}`)
      }
    } catch (err) {
      log.warn('Failed to handle read receipt:', err)
    }
  }

  // 处理撤回消息
  handleRecallMessage(data: any, fromPeerId: string): void {
    try {
      const peerId = data.fromPeerId || fromPeerId
      const encrypted = data.encrypted || data
      const decrypted = cryptoService.decryptFromTransmission(peerId, encrypted)
      const recallData = JSON.parse(decrypted)

      if (recallData.type === 'recall' && recallData.messageId) {
        const messageId = recallData.messageId
        const records = storageService.queryChatRecords(peerId, 1000, 0)
        const record = records.find(r => r.id === messageId)
        if (record) {
          record.recalled = true
          storageService.saveChatRecord(record)
          log.info(`Recalled message ${messageId} from ${peerId}`)
        }
      }
    } catch (err) {
      log.warn('Failed to handle recall message:', err)
    }
  }

  // 撤回消息
  async recallMessage(peerId: string, messageId: string): Promise<void> {
    await this.ensureSessionKey(peerId)

    const selfPeerId = storageService.loadConfig()?.peerId || ''
    const timestamp = Date.now()

    const recallPacket = {
      version: PROTOCOL_VERSION,
      type: 'recall',
      fromPeerId: selfPeerId,
      toPeerId: peerId,
      messageId,
      timestamp,
    }

    const encrypted = cryptoService.encryptForTransmission(peerId, JSON.stringify(recallPacket))
    const packet = createPacket('message', { fromPeerId: selfPeerId, encrypted })

    const friend = udpBroadcaster.getFriend(peerId)
    if (friend && friend.online) {
      await sendToPeer(friend, packet)
    }

    // 更新本地消息状态
    const records = storageService.queryChatRecords(peerId, 1000, 0)
    const record = records.find(r => r.id === messageId)
    if (record) {
      record.recalled = true
      storageService.saveChatRecord(record)
    }
  }
}

export const messageService = new MessageService()
