import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { cryptoService } from '../crypto/crypto-service'
import { storageService } from '../storage/storage-service'
import { udpBroadcaster } from '../network/udp-broadcaster'
import { sendToPeer } from '../network/connection-manager'
import { createPacket } from '../network/protocol'
import { getDataDir } from '../storage/database'
import { FILE_CHUNK_SIZE, MAX_FILE_SIZE, FILES_DIR } from '@shared/constants'
import type {
  IFileTransferService,
  FileTransferRecord,
  FileRequestPacket,
  FileAcceptPacket,
  FileChunkPacket,
  FileCompletePacket,
} from '@shared/types'
import { FileTransferStatus, PROTOCOL_VERSION } from '@shared/types'
import log from 'electron-log'

const activeTransfers = new Map<string, { readStream: fs.ReadReadStream; writeStream: fs.WriteStream | null }>()

class FileTransferService implements IFileTransferService {
  private selfPeerId(): string {
    return storageService.loadConfig()?.peerId || ''
  }

  private wrapEncrypted(peerId: string, encrypted: any): any {
    return { fromPeerId: this.selfPeerId(), encrypted }
  }

  private unwrapEncrypted(data: any, fallbackPeerId: string): { peerId: string; encrypted: any } {
    return {
      peerId: data.fromPeerId || fallbackPeerId,
      encrypted: data.encrypted || data,
    }
  }

  async sendFile(peerId: string, filePath: string): Promise<string> {
    const friend = udpBroadcaster.getFriend(peerId)
    if (!friend || !friend.online) throw new Error('Friend is not online')

    const stat = fs.statSync(filePath)
    if (stat.size > MAX_FILE_SIZE) throw new Error('File size exceeds 2GB limit')

    const transferId = crypto.randomUUID()
    const fileName = path.basename(filePath)
    const md5 = this.calculateMD5(filePath)
    const selfPeerId = storageService.loadConfig()?.peerId || ''

    const request: FileRequestPacket = {
      version: PROTOCOL_VERSION,
      transferId,
      fromPeerId: selfPeerId,
      toPeerId: peerId,
      fileName,
      fileSize: stat.size,
      md5,
      timestamp: Date.now(),
    }

    const encrypted = cryptoService.encryptForTransmission(peerId, JSON.stringify(request))
    await sendToPeer(friend, createPacket('file-request', this.wrapEncrypted(peerId, encrypted)))

    const record: FileTransferRecord = {
      transferId,
      peerId,
      direction: 'send',
      fileName,
      fileSize: stat.size,
      status: FileTransferStatus.PENDING,
      progress: 0,
      md5,
      timestamp: Date.now(),
    }
    storageService.saveFileTransfer(record)

    return transferId
  }

  acceptTransfer(transferId: string, savePath: string): void {
    const transfers = storageService.queryFileTransfers()
    const transfer = transfers.find((t) => t.transferId === transferId)
    if (!transfer) return

    storageService.updateFileTransferStatus(transferId, FileTransferStatus.ACCEPTED)

    const accept: FileAcceptPacket = {
      version: PROTOCOL_VERSION,
      transferId,
      accepted: true,
    }
    const friend = udpBroadcaster.getFriend(transfer.peerId)
    if (friend) {
      const encrypted = cryptoService.encryptForTransmission(transfer.peerId, JSON.stringify(accept))
      sendToPeer(friend, createPacket('file-accept', this.wrapEncrypted(transfer.peerId, encrypted))).catch(() => {})

      const writeStream = fs.createWriteStream(savePath)
      activeTransfers.set(transferId, { readStream: null as any, writeStream })
    }
  }

  rejectTransfer(transferId: string): void {
    const transfers = storageService.queryFileTransfers()
    const transfer = transfers.find((t) => t.transferId === transferId)
    if (!transfer) return

    storageService.updateFileTransferStatus(transferId, FileTransferStatus.REJECTED)

    const reject: FileAcceptPacket = {
      version: PROTOCOL_VERSION,
      transferId,
      accepted: false,
    }
    const friend = udpBroadcaster.getFriend(transfer.peerId)
    if (friend) {
      const encrypted = cryptoService.encryptForTransmission(transfer.peerId, JSON.stringify(reject))
      sendToPeer(friend, createPacket('file-accept', this.wrapEncrypted(transfer.peerId, encrypted))).catch(() => {})
    }
  }

  cancelTransfer(transferId: string): void {
    // 关闭传输流
    const transfer = activeTransfers.get(transferId)
    if (transfer?.readStream) {
      transfer.readStream.destroy()
    }
    if (transfer?.writeStream) {
      transfer.writeStream.end()
    }
    activeTransfers.delete(transferId)

    // 更新状态为中断
    storageService.updateFileTransferStatus(transferId, FileTransferStatus.INTERRUPTED)
  }

  getTransfers(): FileTransferRecord[] {
    return storageService.queryFileTransfers()
  }

  handleFileAccept(data: any, fromPeerId: string): void {
    try {
      const { peerId, encrypted } = this.unwrapEncrypted(data, fromPeerId)
      const decrypted = cryptoService.decryptFromTransmission(peerId, encrypted)
      const accept = JSON.parse(decrypted) as FileAcceptPacket
      if (!accept.accepted) {
        storageService.updateFileTransferStatus(accept.transferId, FileTransferStatus.REJECTED)
        return
      }
      this.startSendingChunks(accept.transferId, peerId)
    } catch (err) {
      log.error('Failed to handle file accept:', err)
    }
  }

  handleFileChunk(data: any, fromPeerId: string): void {
    try {
      const { peerId, encrypted } = this.unwrapEncrypted(data, fromPeerId)
      const decrypted = cryptoService.decryptFromTransmission(peerId, encrypted)
      const chunk = JSON.parse(decrypted) as FileChunkPacket
      const transfer = activeTransfers.get(chunk.transferId)
      if (transfer?.writeStream) {
        const data = Buffer.from(chunk.data, 'base64')
        transfer.writeStream.write(data)
      }
    } catch (err) {
      log.error('Failed to handle file chunk:', err)
    }
  }

  handleFileComplete(data: any, fromPeerId: string): void {
    try {
      const { peerId, encrypted } = this.unwrapEncrypted(data, fromPeerId)
      const decrypted = cryptoService.decryptFromTransmission(peerId, encrypted)
      const complete = JSON.parse(decrypted) as FileCompletePacket
      const transfer = activeTransfers.get(complete.transferId)
      if (transfer?.writeStream) {
        transfer.writeStream.end()
        activeTransfers.delete(complete.transferId)
      }
      storageService.updateFileTransferStatus(complete.transferId, FileTransferStatus.COMPLETED, 100)
    } catch (err) {
      log.error('Failed to handle file complete:', err)
    }
  }

  private async startSendingChunks(transferId: string, peerId: string): Promise<void> {
    const transfers = storageService.queryFileTransfers()
    const transfer = transfers.find((t) => t.transferId === transferId)
    if (!transfer) return

    const friend = udpBroadcaster.getFriend(peerId)
    if (!friend) return

    storageService.updateFileTransferStatus(transferId, FileTransferStatus.TRANSFERRING, 0)

    const filePath = path.join(getDataDir(), FILES_DIR, transfer.fileName)
    if (!fs.existsSync(filePath)) {
      storageService.updateFileTransferStatus(transferId, FileTransferStatus.FAILED)
      return
    }

    const readStream = fs.createReadStream(filePath, { highWaterMark: FILE_CHUNK_SIZE })
    
    // 保存 readStream 引用，以便取消时能关闭它
    activeTransfers.set(transferId, { readStream, writeStream: null })
    
    let sequence = 0
    const totalSize = transfer.fileSize
    let sentSize = 0

    readStream.on('data', (chunk: Buffer) => {
      // 检查是否已取消
      if (!activeTransfers.has(transferId)) {
        readStream.destroy()
        return
      }
      
      sequence++
      sentSize += chunk.length
      const progress = (sentSize / totalSize) * 100

      const chunkPacket: FileChunkPacket = {
        version: PROTOCOL_VERSION,
        transferId,
        sequence,
        data: chunk.toString('base64'),
      }

      const encrypted = cryptoService.encryptForTransmission(peerId, JSON.stringify(chunkPacket))
      sendToPeer(friend, createPacket('file-chunk', this.wrapEncrypted(peerId, encrypted))).catch(() => {})

      storageService.updateFileTransferStatus(transferId, FileTransferStatus.TRANSFERRING, progress)
    })

    readStream.on('end', () => {
      const complete: FileCompletePacket = {
        version: PROTOCOL_VERSION,
        transferId,
        md5: transfer.md5 || '',
      }
      const encrypted = cryptoService.encryptForTransmission(peerId, JSON.stringify(complete))
      sendToPeer(friend, createPacket('file-complete', this.wrapEncrypted(peerId, encrypted))).catch(() => {})
      storageService.updateFileTransferStatus(transferId, FileTransferStatus.COMPLETED, 100)
    })

    readStream.on('error', (err) => {
      log.error('File read error during transfer:', err)
      storageService.updateFileTransferStatus(transferId, FileTransferStatus.FAILED)
    })
  }

  private calculateMD5(filePath: string): string {
    return crypto.createHash('md5').update(fs.readFileSync(filePath)).digest('hex')
  }
}

export const fileTransferService = new FileTransferService()
