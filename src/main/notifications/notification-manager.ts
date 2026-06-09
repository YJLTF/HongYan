import { Notification, app, nativeImage } from 'electron'
import path from 'path'
import log from 'electron-log'
import { storageService } from '../storage/storage-service'
import { showMainWindow as showTrayMainWindow } from '../tray'

/**
 * V1.3.0 Windows Toast / 系统通知中心管理器
 *
 * 单一入口：所有需要弹横幅通知的消息都调用 showMessage() / showFileRequest()。
 * 模块内统一处理：
 *   - 用户设置 enableNotifications 开关
 *   - 免打扰时段（dndEnabled / dndStart / dndEnd，支持跨午夜）
 *   - 点击通知时唤起主窗口 + 切换到对应聊天
 */

let mainWindowGetter: (() => Electron.BrowserWindow | null) | null = null
let appIconPath: string | null = null

export function initNotificationManager(
  getMainWindow: () => Electron.BrowserWindow | null,
  iconPath?: string
): void {
  mainWindowGetter = getMainWindow
  if (iconPath) {
    appIconPath = iconPath
  }
}

/**
 * 解析通知图标路径，与 tray 相同的 dev/prod 分支
 */
function resolveIconPath(): string | undefined {
  if (appIconPath) return appIconPath
  const rel = process.env.VITE_DEV_SERVER_URL
    ? '../../src/renderer/public/icons/icon-256x256.png'
    : '../renderer/icons/icon-256x256.png'
  const p = path.join(__dirname, rel)
  return p
}

interface ParsedTime {
  h: number
  m: number
  valid: boolean
}

function parseHHmm(s: string | undefined, fallback: string): ParsedTime {
  const str = s || fallback
  const m = /^(\d{1,2}):(\d{2})$/.exec(str)
  if (!m) return { h: 0, m: 0, valid: false }
  const h = parseInt(m[1], 10)
  const min = parseInt(m[2], 10)
  if (h < 0 || h > 23 || min < 0 || min > 59) return { h: 0, m: 0, valid: false }
  return { h, m: min, valid: true }
}

function nowMinutesOfDay(): number {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}

/**
 * 判断当前是否处于免打扰时段
 * 支持 start <= end 的常规情况，也支持 start > end 的跨午夜情况
 */
export function isInDnd(): boolean {
  const cfg = storageService.loadConfig()
  if (cfg?.dndEnabled !== true) return false
  const start = parseHHmm(cfg.dndStart, '22:00')
  const end = parseHHmm(cfg.dndEnd, '08:00')
  if (!start.valid || !end.valid) return false

  const now = nowMinutesOfDay()
  const s = start.h * 60 + start.m
  const e = end.h * 60 + end.m

  if (s === e) return false // 区间为空
  if (s < e) {
    return now >= s && now < e
  } else {
    // 跨午夜：例如 22:00 → 08:00
    return now >= s || now < e
  }
}

function shouldNotify(): boolean {
  const cfg = storageService.loadConfig()
  if (cfg?.enableNotifications === false) return false
  if (isInDnd()) return false
  return true
}

function buildBody(msg: { type?: string; content?: string; fileName?: string }): string {
  if (msg.type === 'image' || (msg as any).type === 'image') return '[图片]'
  if (msg.type === 'file' || (msg as any).type === 'file') {
    const name = msg.fileName || '文件'
    return `[文件] ${name}`
  }
  const text = (msg.content || '').toString()
  if (text.length <= 50) return text
  return text.substring(0, 50) + '…'
}

interface NotificationOptions {
  title: string
  body: string
  peerId?: string
  groupId?: string
  transferId?: string
  silent?: boolean
}

function fireNotification(opts: NotificationOptions): void {
  if (!Notification.isSupported()) {
    log.debug('[notify] system notification not supported on this platform')
    return
  }
  try {
    const icon = resolveIconPath()
    const n = new Notification({
      title: opts.title,
      body: opts.body,
      silent: opts.silent,
      icon: icon && nativeImage.createFromPath(icon),
      // Windows: 不在 toast 里附加 urgency 字段，使用默认行为
    })
    n.on('click', () => {
      log.debug('[notify] clicked, focusing window')
      const win = mainWindowGetter ? mainWindowGetter() : null
      if (win && !win.isDestroyed()) {
        showTrayMainWindow(() => win)
        if (opts.peerId) {
          win.webContents.send('notification:click', {
            type: 'message',
            peerId: opts.peerId,
          })
        } else if (opts.groupId) {
          win.webContents.send('notification:click', {
            type: 'group-message',
            groupId: opts.groupId,
          })
        } else if (opts.transferId) {
          win.webContents.send('notification:click', {
            type: 'file',
            transferId: opts.transferId,
          })
        }
      }
    })
    n.show()
  } catch (err) {
    log.warn('Failed to show notification:', err)
  }
}

/**
 * 弹出一条新消息的系统通知
 */
export function showMessage(args: {
  peerId?: string
  groupId?: string
  senderName: string
  msg: { type?: string; content?: string; fileName?: string }
}): void {
  if (!shouldNotify()) return
  fireNotification({
    title: args.senderName,
    body: buildBody(args.msg),
    peerId: args.peerId,
    groupId: args.groupId,
  })
}

/**
 * 弹出一条文件传输请求的通知
 */
export function showFileRequest(args: {
  peerId: string
  senderName: string
  fileName: string
  fileSize: number
  transferId: string
}): void {
  if (!shouldNotify()) return
  const size = formatSize(args.fileSize)
  fireNotification({
    title: `${args.senderName} 发送文件`,
    body: `${args.fileName} (${size})`,
    transferId: args.transferId,
  })
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB'
  return (bytes / 1073741824).toFixed(1) + ' GB'
}
