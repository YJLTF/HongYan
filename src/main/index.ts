import path from 'path'
import fs from 'fs'
import { app, BrowserWindow, Menu, ipcMain } from 'electron'
import log from 'electron-log'
import { initDatabase, closeDatabase, getDefaultDataDir, getDataDir } from './storage/database'
import { storageService } from './storage/storage-service'
import { cryptoService } from './crypto/crypto-service'
import { loadAllGroupKeys } from './crypto/group-key-manager'
import { startTcpServer, stopTcpServer } from './network/tcp-communication'
import { friendDiscoveryService } from './services/friend-discovery-service'
import { messageService } from './services/message-service'
import { fileTransferService } from './services/file-transfer-service'
import { groupService } from './services/group-service'
import { setPacketHandler, sendToPeer } from './network/connection-manager'
import { hasPendingNegotiation } from './crypto/key-negotiation'
import { clearIdentity } from './crypto/identity'
import { createPacket } from './network/protocol'
import { registerIpcHandlers } from './ipc/ipc-handlers'
import { setMainWindow, getMainWindow, pushFriendOnline, pushFriendOffline, pushMessageReceived, pushFileTransferRequest, pushGroupMessageReceived, pushGroupCreated, pushUpdatePublishStatus } from './ipc/ipc-push'
import { createTray, destroyTray, showMainWindow as showTrayMainWindow } from './tray'
import { initFlashManager, notify as flashNotify, attachFocusAutoClear } from './notifications/flash-manager'
import { initNotificationManager, showMessage as notifMessage, showFileRequest as notifFileRequest } from './notifications/notification-manager'
import { updatePublisher } from './services/update-publisher'
import { registerUpdateReceiver } from './services/update-receiver'
import { GROUP_PACKET_KINDS } from '@shared/types'
import type { AppConfig, ProtocolPacket, ChatRecord, FileTransferRecord } from '@shared/types'
import { MessageType, MessageStatus, FileTransferStatus } from '@shared/types'
import crypto from 'crypto'
import { FILES_DIR, LOGS_DIR, DB_NAME, MASTER_KEY_FILE, CONFIG_FILE, IDENTITY_KEY_FILE } from '@shared/constants'

log.transports.file.level = 'info'
log.transports.console.level = 'info'

// V1.3.0: Windows Toast 通知需要 AppUserModelID，否则会归到 electron.exe 名下
if (process.platform === 'win32') {
  app.setAppUserModelId('com.message.messenger')
}

let mainWindow: BrowserWindow | null = null
let isQuitting = false
let hasShownTrayTip = false

/**
 * V1.3.0: 拦截窗口 close 事件
 * - 默认最小化到托盘（closeToTray=true），并在首次最小化时通过主进程推一条
 *   「已最小化到托盘，双击托盘图标可恢复」提示给渲染端
 * - 设置 closeToTray=false 时走原行为：close 直接销毁
 */
function attachCloseToTrayHandler(win: BrowserWindow): void {
  win.on('close', (event) => {
    if (isQuitting) return
    const cfg = storageService.loadConfig()
    const closeToTray = cfg?.closeToTray !== false // 默认 true
    if (!closeToTray) return

    event.preventDefault()
    if (win.isMinimized()) {
      // 已经最小化则保持隐藏即可
      win.hide()
    } else {
      win.hide()
    }
    log.info('Main window hidden to tray (closeToTray=true)')

    if (!hasShownTrayTip) {
      hasShownTrayTip = true
      // 给前端推一条「已最小化到托盘」提示
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('app:minimized-to-tray')
      }
    }
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 650,
    minWidth: 700,
    minHeight: 500,
    title: 'Message',
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
  attachCloseToTrayHandler(mainWindow)
  attachFocusAutoClear(mainWindow)

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
  log.info('Initializing Message...')
  log.info('MESSAGE_DATA_DIR env:', process.env.MESSAGE_DATA_DIR || process.env.HONGYAN_DATA_DIR || '(not set, using default)')

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

  // V1.4.0 修复：恢复磁盘上已持久化的群密钥（解决重启后发文件报 No group key available）
  loadAllGroupKeys()

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
  log.info('Application window created')

  // V1.3.0 系统托盘
  const tray = createTray(getMainWindow)
  if (tray) {
    log.info('System tray initialized')
  } else {
    log.warn('System tray NOT available (will run without tray)')
  }

  // V1.3.0 任务栏 / 托盘闪烁协调
  initFlashManager(getMainWindow)
  log.info('Flash manager initialized')

  // V1.3.0 Windows Toast 通知
  initNotificationManager(
    getMainWindow,
    path.join(
      __dirname,
      process.env.VITE_DEV_SERVER_URL
        ? '../../src/renderer/public/icons/icon-256x256.png'
        : '../renderer/icons/icon-256x256.png'
    )
  )
  log.info('Notification manager initialized')

  // V1.5.0: 发布方状态变化推送到渲染端
  updatePublisher.onStatusChange((status) => {
    pushUpdatePublishStatus(status)
  })
  log.info('Update publisher status bridge initialized')

  // V1.5.0: 注册版本公告接收桥
  registerUpdateReceiver()
  log.info('Update receiver registered')

  log.info('Application started successfully')
}

// 旧版默认数据目录名（用于迁移）
const OLD_DEFAULT_APP_DATA_DIR = 'HongYan'
const OLD_DB_NAME = 'hongyan.db'

// 检查并迁移数据到新的 userDataDir
async function migrateDataIfNeeded(config: AppConfig): Promise<void> {
  // === 第一步：从旧版默认目录 HongYan 迁移到新版默认目录 Message ===
  // 当用户从旧版升级时，%appdata%/HongYan 下已有数据，需要迁移到 %appdata%/Message
  await migrateFromOldDefaultDir()

  // === 第二步：从默认目录迁移到自定义 userDataDir（已有逻辑） ===
  const oldDir = getDefaultDataDir()
  const newDir = getDataDir(config)

  if (oldDir === newDir) {
    return
  }

  const dbPath = path.join(oldDir, DB_NAME.replace('.db', '.json'))
  if (!fs.existsSync(dbPath)) {
    log.info('No data to migrate from default directory')
    return
  }

  log.info(`Migrating data from ${oldDir} to ${newDir}`)

  if (!fs.existsSync(newDir)) {
    fs.mkdirSync(newDir, { recursive: true })
  }

  const newDbPath = path.join(newDir, DB_NAME.replace('.db', '.json'))
  const oldDbStat = fs.statSync(dbPath)
  if (oldDbStat.size > 50) {
    fs.copyFileSync(dbPath, newDbPath)
    log.info('Database file migrated')
  }

  const oldFilesDir = path.join(oldDir, FILES_DIR)
  if (fs.existsSync(oldFilesDir)) {
    const newFilesDir = path.join(newDir, FILES_DIR)
    copyDirectory(oldFilesDir, newFilesDir)
    log.info('Files directory migrated')
  }

  const oldLogsDir = path.join(oldDir, LOGS_DIR)
  if (fs.existsSync(oldLogsDir)) {
    const newLogsDir = path.join(newDir, LOGS_DIR)
    copyDirectory(oldLogsDir, newLogsDir)
    log.info('Logs directory migrated')
  }

  log.info('Data migration completed')
}

/**
 * 从旧版默认数据目录 (HongYan) 迁移到新版默认数据目录 (Message)
 * 旧版数据库文件名为 hongyan.json（源自 hongyan.db），新版为 message.json（源自 message.db）
 * 仅在使用默认数据目录（未设置环境变量）时执行
 */
async function migrateFromOldDefaultDir(): Promise<void> {
  // 如果设置了环境变量（多实例测试/dev 模式），跳过旧目录迁移
  if (process.env.MESSAGE_DATA_DIR || process.env.HONGYAN_DATA_DIR) {
    return
  }

  const appDataPath = app.getPath('appData')
  const oldDefaultDir = path.join(appDataPath, OLD_DEFAULT_APP_DATA_DIR)
  const newDefaultDir = getDefaultDataDir()

  // 新旧目录相同 → 无需迁移
  if (oldDefaultDir === newDefaultDir) {
    return
  }

  // 旧目录不存在 → 无需迁移
  if (!fs.existsSync(oldDefaultDir)) {
    return
  }

  // 新目录已有数据 → 跳过（说明已迁移过）
  if (fs.existsSync(newDefaultDir)) {
    log.info('New default data dir already exists, skipping migration from old HongYan dir')
    return
  }

  log.info(`Migrating data from old default dir ${oldDefaultDir} to new default dir ${newDefaultDir}`)

  // 迁移数据库文件（旧版 hongyan.json → 新版 message.json）
  const oldDbName = OLD_DB_NAME.replace('.db', '.json')
  const newDbName = DB_NAME.replace('.db', '.json')
  const oldDbPath = path.join(oldDefaultDir, oldDbName)
  if (fs.existsSync(oldDbPath)) {
    const newDbPath = path.join(newDefaultDir, newDbName)
    const oldDbStat = fs.statSync(oldDbPath)
    if (oldDbStat.size > 50) {
      if (!fs.existsSync(newDefaultDir)) {
        fs.mkdirSync(newDefaultDir, { recursive: true })
      }
      fs.copyFileSync(oldDbPath, newDbPath)
      log.info('Database file migrated from old HongYan dir')
    }
  }

  // 迁移 files 目录
  const oldFilesDir = path.join(oldDefaultDir, FILES_DIR)
  if (fs.existsSync(oldFilesDir)) {
    const newFilesDir = path.join(newDefaultDir, FILES_DIR)
    copyDirectory(oldFilesDir, newFilesDir)
    log.info('Files directory migrated from old HongYan dir')
  }

  // 迁移 logs 目录
  const oldLogsDir = path.join(oldDefaultDir, LOGS_DIR)
  if (fs.existsSync(oldLogsDir)) {
    const newLogsDir = path.join(newDefaultDir, LOGS_DIR)
    copyDirectory(oldLogsDir, newLogsDir)
    log.info('Logs directory migrated from old HongYan dir')
  }

  // 迁移其他配置文件（master.key, identity.json, identity.key, group-keys.json）
  const configFilesToMigrate = [
    MASTER_KEY_FILE,
    CONFIG_FILE,
    IDENTITY_KEY_FILE,
    'group-keys.json',
  ]
  for (const fileName of configFilesToMigrate) {
    const oldPath = path.join(oldDefaultDir, fileName)
    if (fs.existsSync(oldPath)) {
      const newPath = path.join(newDefaultDir, fileName)
      if (!fs.existsSync(newDefaultDir)) {
        fs.mkdirSync(newDefaultDir, { recursive: true })
      }
      fs.copyFileSync(oldPath, newPath)
      log.info(`Migrated config file: ${fileName}`)
    }
  }

  log.info('Data migration from old HongYan dir completed')
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
                flashNotify('message')
                const friend = friendDiscoveryService.getFriend(peerId)
                notifMessage({
                  peerId,
                  senderName: friend?.remark || friend?.nickname || '未知好友',
                  msg: { type: msg.type, content: msg.content, fileName: msg.fileName },
                })
              }
            }
          } catch (err) {
            log.error('Failed to process encrypted message:', err)
          }
        } else {
          const msg = messageService.handleIncomingMessage(data, extractPeerId(packet))
          if (msg) {
            pushMessageReceived(msg)
            flashNotify('message')
            const peerId = extractPeerId(packet)
            const friend = friendDiscoveryService.getFriend(peerId)
            notifMessage({
              peerId,
              senderName: friend?.remark || friend?.nickname || '未知好友',
              msg: { type: msg.type, content: msg.content, fileName: msg.fileName },
            })
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

          // V1.4.0: 群文件分享（fromGroupShare=true）— 接收方已通过 file:request-group-file
          // 预登记 receive 方向 FileTransferRecord（带 savePath），此处跳过 UI 通知和私聊记录，
          // 直接以预登记的 savePath 自动接收
          if (fileRequest.fromGroupShare) {
            const pendingTransfers = storageService.queryFileTransfers()
            const pending = pendingTransfers.find(t => t.transferId === fileRequest.transferId)
            if (pending?.savePath) {
              fileTransferService.acceptTransfer(fileRequest.transferId, pending.savePath)
              log.info(`Group share auto-accept: ${fileRequest.fileName} → ${pending.savePath}`)
              break
            }
            log.warn(`Group share: no pending download for transferId=${fileRequest.transferId}, falling back to manual flow`)
          }

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
          flashNotify('file-request')
          const friend = friendDiscoveryService.getFriend(peerId)
          notifFileRequest({
            peerId,
            senderName: friend?.remark || friend?.nickname || '未知好友',
            fileName: fileRequest.fileName,
            fileSize: fileRequest.fileSize,
            transferId: fileRequest.transferId,
          })

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
      // V1.4.0: 群文件下载请求（接收方 → 原始发送方）
      case 'file-share-request': {
        fileTransferService.handleFileShareRequest(packet.data, extractPeerId(packet))
        break
      }
      // V1.4.0 修复：群密钥重同步（成员 → owner）
      case GROUP_PACKET_KINDS.KEY_RESYNC: {
        groupService.handleKeyResync(packet.data, extractPeerId(packet))
        break
      }
      // V1.4.0: 群聊相关包
      case GROUP_PACKET_KINDS.CREATE: {
        groupService.handleGroupCreate(packet.data, extractPeerId(packet))
        break
      }
      case GROUP_PACKET_KINDS.INVITE: {
        groupService.handleGroupInvite(packet.data, extractPeerId(packet))
        break
      }
      case GROUP_PACKET_KINDS.JOIN_ACCEPT: {
        groupService.handleGroupJoinAccept(packet.data, extractPeerId(packet))
        break
      }
      case GROUP_PACKET_KINDS.INVITE_REJECT: {
        groupService.handleGroupInviteReject(packet.data, extractPeerId(packet))
        break
      }
      case GROUP_PACKET_KINDS.LEAVE: {
        groupService.handleGroupLeave(packet.data, extractPeerId(packet))
        break
      }
      case GROUP_PACKET_KINDS.KICK: {
        groupService.handleGroupKick(packet.data, extractPeerId(packet))
        break
      }
      case GROUP_PACKET_KINDS.DISMISS: {
        groupService.handleGroupDismiss(packet.data, extractPeerId(packet))
        break
      }
      case GROUP_PACKET_KINDS.UPDATE: {
        groupService.handleGroupUpdate(packet.data, extractPeerId(packet))
        break
      }
      case GROUP_PACKET_KINDS.MESSAGE: {
        const fromPeerId = extractPeerId(packet)
        const msg = groupService.handleGroupMessage(packet.data, fromPeerId)
        if (msg) {
          pushGroupMessageReceived(msg)
          flashNotify('message')
          const groupId = (packet.data as any).groupId
          const group = groupService.getGroup(groupId)
          const sender = group?.members.find(m => m.peerId === fromPeerId)
          const senderName = sender?.nickname || '群成员'
          notifMessage({
            groupId,
            senderName: `[${group?.groupName || '群'}] ${senderName}`,
            msg: { type: msg.type, content: msg.content, fileName: msg.fileName },
          })
        }
        break
      }
      case GROUP_PACKET_KINDS.ACK: {
        groupService.handleGroupAck(packet.data, extractPeerId(packet))
        break
      }
      case GROUP_PACKET_KINDS.READ: {
        groupService.handleGroupRead(packet.data, extractPeerId(packet))
        break
      }
      case GROUP_PACKET_KINDS.RECALL: {
        groupService.handleGroupRecall(packet.data, extractPeerId(packet))
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
  log.info('Shutting down Message...')
  isQuitting = true
  destroyTray()
  // V1.2.0: 优雅退出时广播下线公告，让好友立即知道本机已下线
  friendDiscoveryService.stop({ graceful: true })
  // V1.5.0: 停止 HTTP 发布服务并解绑端口（await 确保 server.close 完成再退出）
  await updatePublisher.stopPublish()
  stopTcpServer()
  closeDatabase()
  cryptoService.destroy()
  clearIdentity()
  log.info('Message shutdown complete')
}

app.whenReady().then(initApp).catch((err) => {
  log.error('Failed to initialize app:', err)
  app.quit()
})

// V1.3.0: 默认有托盘时即使所有窗口关闭也保持运行
// 只有当用户明确退出（托盘菜单 / app.quit）时才真正退出
app.on('window-all-closed', () => {
  // 故意不调用 app.quit() —— 让应用留在托盘
  // shutdown 流程在 before-quit 中统一处理
  log.info('All windows closed; staying alive in tray')
})

app.on('before-quit', async (event) => {
  // 防止重入：如果正在退出，跳过
  if (isQuitting) return
  isQuitting = true
  event.preventDefault()
  try {
    await shutdownApp()
  } catch (err) {
    log.error('Error during shutdown:', err)
  } finally {
    app.exit(0)
  }
})

// 提供给渲染端调用的「真正退出」IPC（从设置页/托盘菜单的备用入口）
ipcMain.handle('app:quit', () => {
  log.info('Renderer requested app quit')
  app.quit()
})
