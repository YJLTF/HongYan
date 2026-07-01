import { Tray, Menu, nativeImage, BrowserWindow, app, NativeImage } from 'electron'
import path from 'path'
import log from 'electron-log'
import { TRAY_ICON_NORMAL, TRAY_ICON_ACTIVE, TRAY_TOOLTIP } from '@shared/constants'

let tray: Tray | null = null
let normalIcon: NativeImage | null = null
let activeIcon: NativeImage | null = null
let flashTimer: NodeJS.Timeout | null = null
let flashState: boolean = false
let flashPending: boolean = false

/**
 * 解析托盘图标绝对路径
 * - dev:    __dirname = dist/main/  → ../../src/renderer/public/icons/
 * - prod:   __dirname = dist/main/  → ../renderer/icons/
 */
function resolveTrayIconPath(name: string): string {
  const rel = process.env.VITE_DEV_SERVER_URL
    ? path.join('../../src/renderer/public/icons', name)
    : path.join('../renderer/icons', name)
  return path.join(__dirname, rel)
}

function loadIcons(): void {
  try {
    const normalPath = resolveTrayIconPath(TRAY_ICON_NORMAL)
    const activePath = resolveTrayIconPath(TRAY_ICON_ACTIVE)
    log.info('Tray icon paths:', { normalPath, activePath })
    normalIcon = nativeImage.createFromPath(normalPath)
    activeIcon = nativeImage.createFromPath(activePath)
    if (normalIcon.isEmpty()) {
      log.warn('Tray normal icon is empty, fallback to empty image')
    }
    if (activeIcon.isEmpty()) {
      log.warn('Tray active icon is empty, fallback to normal icon')
      activeIcon = normalIcon
    }
  } catch (err) {
    log.error('Failed to load tray icons:', err)
  }
}

function buildContextMenu(getWindow: () => BrowserWindow | null): Electron.Menu {
  return Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => showMainWindow(getWindow),
    },
    { type: 'separator' },
    {
      label: '退出 Message',
      click: () => {
        log.info('User selected Quit from tray menu')
        app.quit()
      },
    },
  ])
}

/**
 * 创建系统托盘图标
 */
export function createTray(getWindow: () => BrowserWindow | null): Tray | null {
  if (tray) {
    log.warn('Tray already exists, skipping creation')
    return tray
  }

  loadIcons()
  if (!normalIcon || normalIcon.isEmpty()) {
    log.error('Cannot create tray: normal icon unavailable')
    return null
  }

  try {
    tray = new Tray(normalIcon)
    tray.setToolTip(TRAY_TOOLTIP)
    tray.setContextMenu(buildContextMenu(getWindow))

    // 左键单击：显示/聚焦主窗口
    tray.on('click', () => {
      showMainWindow(getWindow)
    })
    // 双击：同上（Windows 习惯）
    tray.on('double-click', () => {
      showMainWindow(getWindow)
    })

    log.info('System tray created')
    return tray
  } catch (err) {
    log.error('Failed to create tray:', err)
    tray = null
    return null
  }
}

/**
 * 显示并聚焦主窗口
 */
export function showMainWindow(getWindow: () => BrowserWindow | null): void {
  const win = getWindow()
  if (!win || win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  if (!win.isVisible()) win.show()
  win.focus()
}

/**
 * 销毁托盘
 */
export function destroyTray(): void {
  stopFlash()
  if (tray) {
    try {
      tray.destroy()
    } catch (err) {
      log.warn('Failed to destroy tray:', err)
    }
    tray = null
  }
}

/**
 * 启动托盘图标闪烁（收到新消息等场景调用）
 * 重复调用是幂等的——已有闪烁在进行时不会叠加计时器
 */
export function startFlash(): void {
  if (!tray) return
  if (flashTimer) return // 已在闪烁

  // 立即显示一次激活态，然后启动 1s 周期的 toggle
  if (activeIcon && !activeIcon.isEmpty()) {
    tray.setImage(activeIcon)
    flashState = true
  }
  flashTimer = setInterval(() => {
    if (!tray || !normalIcon || normalIcon.isEmpty()) return
    flashState = !flashState
    tray.setImage(flashState && activeIcon && !activeIcon.isEmpty() ? activeIcon : normalIcon)
  }, 1000)
  log.debug('Tray flash started')
}

/**
 * 停止托盘图标闪烁，恢复常态
 */
export function stopFlash(): void {
  if (flashTimer) {
    clearInterval(flashTimer)
    flashTimer = null
  }
  flashPending = false
  if (tray && normalIcon && !normalIcon.isEmpty()) {
    tray.setImage(normalIcon)
  }
  flashState = false
}

/**
 * 标记「有待闪烁提醒」，但实际闪烁由调用方策略决定是否启动
 * 保留为后续 M4 notification-policy 使用
 */
export function markPendingFlash(): void {
  flashPending = true
}

export function consumePendingFlash(): boolean {
  const v = flashPending
  flashPending = false
  return v
}

/**
 * 当前是否在闪烁中
 */
export function isFlashing(): boolean {
  return flashTimer !== null
}

/**
 * 获取托盘实例（用于外部需要直接操作 tray 的场景）
 */
export function getTray(): Tray | null {
  return tray
}
