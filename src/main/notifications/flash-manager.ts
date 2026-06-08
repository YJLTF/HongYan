import { BrowserWindow } from 'electron'
import log from 'electron-log'
import { startFlash as startTrayFlash, stopFlash as stopTrayFlash } from '../tray'
import { storageService } from '../storage/storage-service'

/**
 * V1.3.0 任务栏 / 托盘闪烁协调器
 *
 * 单一入口：所有"有新事件需要闪烁"的消息都调用 notify()，
 * 由本模块根据窗口焦点状态和用户设置决定具体触发哪些提醒手段。
 *
 * 策略（V1.3.0 初版，可在 M4 与通知策略统一调整）：
 *   - 窗口已聚焦：不闪烁（用户当前正在看）
 *   - 窗口存在且未最小化且未聚焦：任务栏闪烁（仅当设置 enableTaskbarFlash=true）
 *   - 窗口已最小化（隐藏到托盘）：托盘图标闪烁（仅当设置 enableTrayFlash=true）
 *
 * notify() 是幂等的：连续触发不会叠加闪烁状态。
 * clear() 在窗口获得焦点时由 main/index.ts 调用，统一停止所有闪烁。
 */

let mainWindowGetter: (() => BrowserWindow | null) | null = null

export function initFlashManager(getMainWindow: () => BrowserWindow | null): void {
  mainWindowGetter = getMainWindow
}

function getWindow(): BrowserWindow | null {
  if (!mainWindowGetter) return null
  return mainWindowGetter()
}

function isFocusActive(): boolean {
  const win = getWindow()
  if (!win || win.isDestroyed()) return true // 窗口已销毁，视为"已处理"，不闪烁
  if (!win.isVisible() || win.isMinimized()) return false
  return win.isFocused()
}

/**
 * 触发提醒闪烁
 * @param reason 触发原因（用于日志）
 */
export function notify(reason: string = 'message'): void {
  const cfg = storageService.loadConfig()
  const enableTaskbarFlash = cfg?.enableTaskbarFlash !== false
  const enableTrayFlash = cfg?.enableTrayFlash !== false

  const win = getWindow()
  if (!win || win.isDestroyed()) {
    log.debug(`[flash] skip (no window) reason=${reason}`)
    return
  }

  if (isFocusActive()) {
    log.debug(`[flash] skip (window focused) reason=${reason}`)
    return
  }

  // 1) 任务栏闪烁（窗口存在但未聚焦时）
  if (enableTaskbarFlash) {
    if (win.isVisible() && !win.isMinimized()) {
      // flashFrame 第二个参数在 Win 上控制闪烁次数；给一个较大值
      // 让用户"足够长"地注意到，配合 clear() 在 focus 时停止
      try {
        win.flashFrame(true)
        log.debug(`[flash] taskbar flash ON reason=${reason}`)
      } catch (err) {
        log.warn('flashFrame failed:', err)
      }
    }
  }

  // 2) 托盘图标闪烁（任何时候窗口未聚焦/最小化都可触发）
  if (enableTrayFlash) {
    startTrayFlash()
  }
}

/**
 * 停止所有闪烁（窗口获得焦点时调用）
 */
export function clear(): void {
  const win = getWindow()
  if (win && !win.isDestroyed()) {
    try {
      win.flashFrame(false)
    } catch (err) {
      log.warn('flashFrame stop failed:', err)
    }
  }
  stopTrayFlash()
  log.debug('[flash] cleared')
}

/**
 * 监听窗口 focus 事件，自动清除闪烁
 * 需在 createWindow 之后由 main/index.ts 调用一次
 */
export function attachFocusAutoClear(win: BrowserWindow): void {
  win.on('focus', () => clear())
  win.on('show', () => {
    // 窗口从隐藏恢复时也清一次，避免恢复时还在闪
    clear()
  })
  win.on('restore', () => clear())
}
