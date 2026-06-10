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
import { pushFileProgress, pushFileCompleted, pushFileFailed, pushFileUpdated } from '../ipc/ipc-push'
import { computeFileMd5 } from '../utils/file-hash'
import type {
  IFileTransferService,
  FileTransferRecord,
  FileRequestPacket,
  FileShareRequestPacket,
  FileAcceptPacket,
  FileChunkPacket,
  FileCompletePacket,
  ChatRecord,
} from '@shared/types'
import { FileTransferStatus, MessageType, MessageStatus, PROTOCOL_VERSION } from '@shared/types'
import log from 'electron-log'

const activeTransfers = new Map<string, {
  readStream: fs.ReadStream | null
  writeStream: fs.WriteStream | null
  receivedBytes: number
  fileSize: number
  lastPushedProgress: number
  lastPushTime: number
}>()

// 限频：每个传输的进度推送间隔至少 PROGRESS_PUSH_INTERVAL_MS
const PROGRESS_PUSH_INTERVAL_MS = 200
// 进度变化超过此阈值时强制推送，避免小文件最后一帧被吞
const PROGRESS_PUSH_DELTA = 0.5

function shouldPushProgress(progress: number, lastPushed: number, lastPushTime: number): boolean {
  if (progress >= 100) return true
  if (progress - lastPushed >= PROGRESS_PUSH_DELTA) return true
  if (Date.now() - lastPushTime >= PROGRESS_PUSH_INTERVAL_MS) return true
  return false
}

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

    if (cryptoService.needsRenegotiation(peerId)) {
      const requestJson = await cryptoService.negotiateKey(peerId)
      if (requestJson) {
        await sendToPeer(friend, createPacket('key-negotiation', JSON.parse(requestJson)))
        await cryptoService.waitForSessionKey(peerId)
      }
    }

    const stat = fs.statSync(filePath)
    if (stat.size > MAX_FILE_SIZE) throw new Error('File size exceeds 2GB limit')

    const transferId = crypto.randomUUID()
    const fileName = path.basename(filePath)
    const md5 = await this.calculateMD5(filePath)
    const selfPeerId = storageService.loadConfig()?.peerId || ''

    // 将文件复制到 FILES_DIR 目录，以便后续发送数据块
    const dataDir = getDataDir()
    const filesDir = path.join(dataDir, FILES_DIR)
    if (!fs.existsSync(filesDir)) {
      fs.mkdirSync(filesDir, { recursive: true })
    }
    // 使用 transferId 作为文件名前缀，避免同名文件冲突
    const storedFileName = `${transferId}_${fileName}`
    const storedFilePath = path.join(filesDir, storedFileName)
    fs.copyFileSync(filePath, storedFilePath)
    log.info(`File copied to ${storedFilePath} for transfer ${transferId}`)

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
      fileName,  // 聊天记录中显示原始文件名
      fileSize: stat.size,
      status: FileTransferStatus.PENDING,
      progress: 0,
      md5,
      timestamp: Date.now(),
    }
    storageService.saveFileTransfer({
      ...record,
      fileName: storedFileName,  // 持久化使用带前缀的物理文件名
    })

    // 通知渲染端加入传输列表（发送方 UI 也能立即看到记录）
    pushFileUpdated(record)

    const chatRecord: ChatRecord = {
      id: transferId,
      peerId,
      type: MessageType.FILE,
      direction: 'sent',
      content: '',
      fileName,  // 聊天记录中显示原始文件名
      fileSize: stat.size,
      status: MessageStatus.SENT,
      timestamp: Date.now(),
    }
    storageService.saveChatRecord(chatRecord)

    return transferId
  }

  // ============================================================
  // V1.4.0: 群文件共享
  //   - sendSharedFile:  群文件发送方把 FILES_DIR 中已暂存的文件分发给请求者
  //                       （fileId 沿用 group messageId，文件路径不再复制）
  //   - handleFileShareRequest: 群成员在群聊中点击"下载" → 主进程向发送方请求文件
  // ============================================================
  async sendSharedFile(
    peerId: string,
    transferId: string,
    fileName: string,
    fileSize: number,
    md5: string,
  ): Promise<void> {
    const friend = udpBroadcaster.getFriend(peerId)
    if (!friend || !friend.online) throw new Error('Peer is not online')

    // 找到 FILES_DIR 中暂存的文件
    const dataDir = getDataDir()
    const storedFileName = `${transferId}_${fileName}`
    const storedFilePath = path.join(dataDir, FILES_DIR, storedFileName)
    if (!fs.existsSync(storedFilePath)) {
      throw new Error(`Shared file not found in storage: ${storedFileName}`)
    }

    // 会话密钥协商
    if (cryptoService.needsRenegotiation(peerId)) {
      const requestJson = await cryptoService.negotiateKey(peerId)
      if (requestJson) {
        await sendToPeer(friend, createPacket('key-negotiation', JSON.parse(requestJson)))
        await cryptoService.waitForSessionKey(peerId)
      }
    }

    // 构造 file-request 包（fromGroupShare=true 让接收方自动接收、不弹私聊 UI）
    const request: FileRequestPacket = {
      version: PROTOCOL_VERSION,
      transferId,
      fromPeerId: this.selfPeerId(),
      toPeerId: peerId,
      fileName,
      fileSize,
      md5,
      timestamp: Date.now(),
      fromGroupShare: true,
    }
    const encrypted = cryptoService.encryptForTransmission(peerId, JSON.stringify(request))
    await sendToPeer(friend, createPacket('file-request', this.wrapEncrypted(peerId, encrypted)))

    // 记录一条方向=send 的 FileTransferRecord（供现有 accept/chunk/complete 流程使用）
    const record: FileTransferRecord = {
      transferId,
      peerId,
      direction: 'send',
      fileName,
      fileSize,
      status: FileTransferStatus.PENDING,
      progress: 0,
      md5,
      timestamp: Date.now(),
    }
    storageService.saveFileTransfer({
      ...record,
      fileName: storedFileName,  // 物理文件名
    })
    pushFileUpdated(record)

    log.info(`Shared file send-init: transferId=${transferId} → ${peerId} (${fileName})`)
  }

  // 群成员发起下载请求：向群文件发送方（peerId）请求 transferId 对应的文件
  async handleFileShareRequest(data: any, fromPeerId: string): Promise<void> {
    try {
      const payload = (data.encrypted !== undefined)
        ? (() => {
            const dec = cryptoService.decryptFromTransmission(fromPeerId, data.encrypted)
            return JSON.parse(dec) as FileShareRequestPacket
          })()
        : (data as FileShareRequestPacket)

      // 调用 sendSharedFile 把已暂存的文件分发给请求方
      await this.sendSharedFile(
        fromPeerId,
        payload.transferId,
        payload.fileName,
        payload.fileSize,
        payload.md5,
      )
    } catch (err) {
      log.error('handleFileShareRequest failed:', err)
    }
  }

  acceptTransfer(transferId: string, savePath: string): void {
    const transfers = storageService.queryFileTransfers()
    const transfer = transfers.find((t) => t.transferId === transferId)
    if (!transfer) return

    // 立即标记为传输中、0% 进度，让接收方 UI 立刻出现进度条
    storageService.updateFileTransferStatus(transferId, FileTransferStatus.TRANSFERRING, 0)
    storageService.updateFileTransferSavePath(transferId, savePath)
    pushFileUpdated({ ...transfer, status: FileTransferStatus.TRANSFERRING, progress: 0, savePath })

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
      activeTransfers.set(transferId, {
        readStream: null,
        writeStream,
        receivedBytes: 0,
        fileSize: transfer.fileSize,
        lastPushedProgress: 0,
        lastPushTime: 0,
      })
    }
  }

  rejectTransfer(transferId: string): void {
    const transfers = storageService.queryFileTransfers()
    const transfer = transfers.find((t) => t.transferId === transferId)
    if (!transfer) return

    storageService.updateFileTransferStatus(transferId, FileTransferStatus.REJECTED)
    pushFileUpdated({ ...transfer, status: FileTransferStatus.REJECTED })

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
    pushFileUpdated({ transferId, status: FileTransferStatus.INTERRUPTED } as any)
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
        const buf = Buffer.from(chunk.data, 'base64')
        transfer.writeStream.write(buf)
        transfer.receivedBytes += buf.length
        if (transfer.fileSize > 0) {
          const progress = (transfer.receivedBytes / transfer.fileSize) * 100
          storageService.updateFileTransferStatus(chunk.transferId, FileTransferStatus.TRANSFERRING, progress)
          if (shouldPushProgress(progress, transfer.lastPushedProgress, transfer.lastPushTime)) {
            pushFileProgress(chunk.transferId, progress)
            transfer.lastPushedProgress = progress
            transfer.lastPushTime = Date.now()
          }
        }
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
      pushFileProgress(complete.transferId, 100)
      pushFileCompleted(complete.transferId)
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
    activeTransfers.set(transferId, {
      readStream,
      writeStream: null,
      receivedBytes: 0,
      fileSize: transfer.fileSize,
      lastPushedProgress: 0,
      lastPushTime: 0,
    })

    let sequence = 0
    const totalSize = transfer.fileSize
    let sentSize = 0
    let lastPushedProgress = 0
    let lastPushTime = 0

    readStream.on('data', (chunk: string | Buffer) => {
      if (typeof chunk === 'string') chunk = Buffer.from(chunk)
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

      // 节流推送进度到渲染端，避免小文件分片过细导致 IPC 风暴
      if (shouldPushProgress(progress, lastPushedProgress, lastPushTime)) {
        pushFileProgress(transferId, progress)
        lastPushedProgress = progress
        lastPushTime = Date.now()
      }
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
      pushFileProgress(transferId, 100)
      pushFileCompleted(transferId)
    })

    readStream.on('error', (err) => {
      log.error('File read error during transfer:', err)
      storageService.updateFileTransferStatus(transferId, FileTransferStatus.FAILED)
      pushFileFailed(transferId, err.message)
    })
  }

  private async calculateMD5(filePath: string): Promise<string> {
    return computeFileMd5(filePath)
  }
}

export const fileTransferService = new FileTransferService()
