import { BrowserWindow } from 'electron'
import { MainToRendererChannels } from '@shared/types'
import log from 'electron-log'

let mainWindow: BrowserWindow | null = null

export function setMainWindow(win: BrowserWindow): void {
  mainWindow = win
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
