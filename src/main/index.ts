import path from 'path'
import fs from 'fs'
import { app, BrowserWindow, Menu } from 'electron'
import log from 'electron-log'
import { initDatabase, closeDatabase, getDefaultDataDir, getDataDir } from './storage/database'
import { storageService } from './storage/storage-service'
import { cryptoService } from './crypto/crypto-service'
import { startTcpServer, stopTcpServer } from './network/tcp-communication'
import { friendDiscoveryService } from './services/friend-discovery-service'
import { messageService } from './services/message-service'
import { fileTransferService } from './services/file-transfer-service'
import { setPacketHandler, sendToPeer } from './network/connection-manager'
import { hasPendingNegotiation } from './crypto/key-negotiation'
import { createPacket } from './network/protocol'
import { registerIpcHandlers } from './ipc/ipc-handlers'
import { setMainWindow, pushFriendOnline, pushFriendOffline, pushMessageReceived, pushFileTransferRequest } from './ipc/ipc-push'
import type { AppConfig, ProtocolPacket, ChatRecord, FileTransferRecord } from '@shared/types'
import { MessageType, MessageStatus, FileTransferStatus } from '@shared/types'
import crypto from 'crypto'
import { FILES_DIR, LOGS_DIR, DB_NAME } from '@shared/constants'

log.transports.file.level = 'info'
log.transports.console.level = 'info'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 650,
    minWidth: 700,
    minHeight: 500,
    title: '鸿雁',
    icon: path.join(
      __dirname,
      process.env.VITE_DEV_SERVER_URL
        ? '../../src/renderer/public/icons/icon-256x256.png'
        : '../renderer/icons/icon-256x256.png'
    ),
    frame: true,

    webPreferences: {
      preload: path.join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    console.log('Loading dev server URL:', process.env.VITE_DEV_SERVER_URL)
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    console.log('Loading production file')
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  setMainWindow(mainWindow)

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function setupApplicationMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '视图',
      submenu: [
        { label: '重新加载', role: 'reload' },
        { label: '强制重新加载', role: 'forceReload' },
        { label: '开发者工具', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: '实际大小', role: 'resetZoom' },
        { label: '放大', role: 'zoomIn' },
        { label: '缩小', role: 'zoomOut' },
        { type: 'separator' },
        { label: '全屏', role: 'togglefullscreen' },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { label: '最小化', role: 'minimize' },
        { label: '关闭', role: 'close' },
      ],
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

async function initApp(): Promise<void> {
  log.info('Initializing HongYan...')
  log.info('HONGYAN_DATA_DIR env:', process.env.HONGYAN_DATA_DIR || '(not set, using default)')

  // 先加载配置，获取 userDataDir 设置
  let config = storageService.loadConfig()
  if (!config) {
    config = {
      peerId: crypto.randomUUID(),
      nickname: require('os').hostname() || 'User',
    }
    storageService.saveConfig(config)
  }
  log.info('Config loaded, peerId:', config.peerId)

  // 检查是否需要迁移数据到新目录
  await migrateDataIfNeeded(config)

  // 使用配置初始化数据库（传入 config 以确定数据目录）
  await initDatabase(config)

  cryptoService.init(config.peerId)
  log.info('Crypto service initialized')

  const tcpPort = await startTcpServer(handleIncomingPacket)
  log.info('TCP server started on port', tcpPort)

  setPacketHandler(handleIncomingPacket)

  friendDiscoveryService.start()
  log.info('Friend discovery service started')

  registerIpcHandlers()
  log.info('IPC handlers registered')

  setupApplicationMenu()
  log.info('Application menu setup')

  createWindow()
  log.info('Application started successfully')
}

// 检查并迁移数据到新的 userDataDir
async function migrateDataIfNeeded(config: AppConfig): Promise<void> {
  const oldDir = getDefaultDataDir()
  const newDir = getDataDir(config)

  // 如果新旧目录相同，或者新目录已存在（已有数据），不需要迁移
  if (oldDir === newDir) {
    return
  }

  // 检查旧目录是否有数据需要迁移
  const dbPath = path.join(oldDir, DB_NAME.replace('.db', '.json'))
  if (!fs.existsSync(dbPath)) {
    log.info('No data to migrate from default directory')
    return
  }

  log.info(`Migrating data from ${oldDir} to ${newDir}`)

  // 确保新目录存在
  if (!fs.existsSync(newDir)) {
    fs.mkdirSync(newDir, { recursive: true })
  }

  // 迁移数据库文件
  const newDbPath = path.join(newDir, DB_NAME.replace('.db', '.json'))
  const oldDbStat = fs.statSync(dbPath)
  // 只迁移有数据的数据库
  if (oldDbStat.size > 50) { // 空数据库文件大约50字节
    fs.copyFileSync(dbPath, newDbPath)
    log.info('Database file migrated')
  }

  // 迁移 files 目录
  const oldFilesDir = path.join(oldDir, FILES_DIR)
  if (fs.existsSync(oldFilesDir)) {
    const newFilesDir = path.join(newDir, FILES_DIR)
    copyDirectory(oldFilesDir, newFilesDir)
    log.info('Files directory migrated')
  }

  // 迁移 logs 目录
  const oldLogsDir = path.join(oldDir, LOGS_DIR)
  if (fs.existsSync(oldLogsDir)) {
    const newLogsDir = path.join(newDir, LOGS_DIR)
    copyDirectory(oldLogsDir, newLogsDir)
    log.info('Logs directory migrated')
  }

  log.info('Data migration completed')
}

function copyDirectory(src: string, dest: string): void {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true })
  }
  const entries = fs.readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

function handleIncomingPacket(packet: ProtocolPacket, peerIp: string): void {
  try {
    switch (packet.kind) {
      case 'key-negotiation': {
        handleKeyNegotiation(packet, peerIp)
        break
      }
      case 'message': {
        const data = packet.data as any
        // 检查是否是特殊类型的消息（撤回、已读回执等）
        if (data.encrypted) {
          try {
            const peerId = extractPeerId(packet)
            const decrypted = cryptoService.decryptFromTransmission(peerId, data.encrypted)
            const messageData = JSON.parse(decrypted)
            
            if (messageData.type === 'recall') {
              // 处理撤回消息
              messageService.handleRecallMessage(data, peerId)
              // 推送撤回通知到前端
              pushMessageReceived({ type: 'recall', messageId: messageData.messageId, fromPeerId: peerId })
            } else if (messageData.type === 'read-receipt') {
              // 处理已读回执
              messageService.handleReadReceipt(data, peerId)
            } else {
              // 普通消息
              const msg = messageService.handleIncomingMessage(data, peerId)
              if (msg) {
                pushMessageReceived(msg)
              }
            }
          } catch (err) {
            log.error('Failed to process encrypted message:', err)
          }
        } else {
          const msg = messageService.handleIncomingMessage(data, extractPeerId(packet))
          if (msg) {
            pushMessageReceived(msg)
          }
        }
        break
      }
      case 'ack': {
        messageService.handleAck(packet.data as any, extractPeerId(packet))
        break
      }
      case 'file-request': {
        try {
          const peerId = extractPeerId(packet)
          log.info('Received file request from peer:', peerId)
          const decrypted = cryptoService.decryptFromTransmission(peerId, (packet.data as any).encrypted)
          const fileRequest = JSON.parse(decrypted)
          log.info('File request decrypted:', fileRequest.fileName, fileRequest.fileSize)

          const fileTransferRecord: FileTransferRecord = {
            transferId: fileRequest.transferId,
            peerId,
            direction: 'receive',
            fileName: fileRequest.fileName,
            fileSize: fileRequest.fileSize,
            status: FileTransferStatus.PENDING,
            progress: 0,
            md5: fileRequest.md5,
            timestamp: Date.now(),
          }
          storageService.saveFileTransfer(fileTransferRecord)

          // 推送完整的 FileTransferRecord，让渲染端的传输列表能直接展示等待接受状态
          pushFileTransferRequest(fileTransferRecord)

          const chatRecord: ChatRecord = {
            id: fileRequest.transferId,
            peerId,
            type: MessageType.FILE,
            direction: 'received',
            content: '',
            fileName: fileRequest.fileName,
            fileSize: fileRequest.fileSize,
            status: MessageStatus.DELIVERED,
            timestamp: Date.now(),
          }
          storageService.saveChatRecord(chatRecord)
          pushMessageReceived(chatRecord)
        } catch (err) {
          log.error('Failed to handle file request:', err)
        }
        break
      }
      case 'file-accept': {
        fileTransferService.handleFileAccept(packet.data as any, extractPeerId(packet))
        break
      }
      case 'file-chunk': {
        fileTransferService.handleFileChunk(packet.data as any, extractPeerId(packet))
        break
      }
      case 'file-complete': {
        fileTransferService.handleFileComplete(packet.data as any, extractPeerId(packet))
        break
      }
      default:
        log.warn('Unknown packet kind:', packet.kind)
    }
  } catch (err) {
    log.error('Error handling incoming packet:', err)
  }
}

function extractPeerId(packet: any): string {
  return packet.data?.fromPeerId || packet.data?.peerId || ''
}

async function handleKeyNegotiation(packet: ProtocolPacket, peerIp: string): Promise<void> {
  const fromPeerId = extractPeerId(packet)
  if (!fromPeerId) return

  const data = packet.data as any
  if (!data.publicKey) return

  if (hasPendingNegotiation(fromPeerId)) {
    await cryptoService.negotiateKey(fromPeerId, data.publicKey)
  } else {
    const result = cryptoService.handleIncomingNegotiation(data)
    if (result) {
      cryptoService.setSessionKey(fromPeerId, result.sessionKey)
      const friend = friendDiscoveryService.getFriend(fromPeerId)
      if (friend) {
        const responsePacket = createPacket('key-negotiation', result.response)
        await sendToPeer(friend, responsePacket)
      }
    }
  }
}

async function shutdownApp(): Promise<void> {
  log.info('Shutting down HongYan...')
  friendDiscoveryService.stop()
  stopTcpServer()
  closeDatabase()
  cryptoService.destroy()
  log.info('HongYan shutdown complete')
}

app.whenReady().then(initApp).catch((err) => {
  log.error('Failed to initialize app:', err)
  app.quit()
})

app.on('window-all-closed', () => {
  shutdownApp().then(() => {
    app.quit()
  })
})

app.on('before-quit', () => {
  shutdownApp()
})
