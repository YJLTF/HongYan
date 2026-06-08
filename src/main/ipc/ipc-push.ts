import { BrowserWindow } from 'electron'
import { MainToRendererChannels } from '@shared/types'
import log from 'electron-log'

let mainWindow: BrowserWindow | null = null

export function setMainWindow(win: BrowserWindow): void {
  mainWindow = win
  // V1.3.0: 注册 closed 自清理，避免外部模块持有悬空引用
  win.on('closed', () => {
    if (mainWindow === win) {
      mainWindow = null
    }
  })
}

/**
 * V1.3.0: 主窗口引用的单一真源
 * 之前 ipc-handlers.ts 用 require('../index') 试图获取 mainWindow 引入了循环依赖
 * 且 rollup 不会处理局部模块的动态 require。改用 ipc-push 作为统一访问点。
 */
export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function pushEvent(channel: string, ...args: any[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args)
  }
}

export function pushFriendOnline(friend: any): void {
  pushEvent('friend:online', friend)
}

export function pushFriendOffline(peerId: string): void {
  pushEvent('friend:offline', peerId)
}

export function pushFriendUpdated(friend: any): void {
  pushEvent('friend:updated', friend)
}

export function pushMessageReceived(message: any): void {
  pushEvent('message:received', message)
}

export function pushMessageStatusUpdated(messageId: string, status: string): void {
  pushEvent('message:status-updated', { messageId, status })
}

export function pushFileTransferRequest(request: any): void {
  pushEvent('file:transfer-request', request)
}

export function pushFileProgress(transferId: string, progress: number): void {
  pushEvent('file:progress', { transferId, progress })
}

export function pushFileCompleted(transferId: string): void {
  pushEvent('file:completed', { transferId })
}

export function pushFileFailed(transferId: string, reason: string): void {
  pushEvent('file:failed', { transferId, reason })
}

export function pushFileUpdated(record: any): void {
  pushEvent('file:updated', record)
}
