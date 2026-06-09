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
  pushEvent(MainToRendererChannels.FRIEND_ONLINE, friend)
}

export function pushFriendOffline(peerId: string): void {
  pushEvent(MainToRendererChannels.FRIEND_OFFLINE, peerId)
}

export function pushFriendUpdated(friend: any): void {
  pushEvent(MainToRendererChannels.FRIEND_UPDATED, friend)
}

export function pushMessageReceived(message: any): void {
  pushEvent(MainToRendererChannels.MESSAGE_RECEIVED, message)
}

export function pushMessageStatusUpdated(messageId: string, status: string): void {
  pushEvent(MainToRendererChannels.MESSAGE_STATUS_UPDATED, { messageId, status })
}

export function pushFileTransferRequest(request: any): void {
  pushEvent(MainToRendererChannels.FILE_TRANSFER_REQUEST, request)
}

export function pushFileProgress(transferId: string, progress: number): void {
  pushEvent(MainToRendererChannels.FILE_PROGRESS, { transferId, progress })
}

export function pushFileCompleted(transferId: string): void {
  pushEvent(MainToRendererChannels.FILE_COMPLETED, { transferId })
}

export function pushFileFailed(transferId: string, reason: string): void {
  pushEvent(MainToRendererChannels.FILE_FAILED, { transferId, reason })
}

export function pushFileUpdated(record: any): void {
  pushEvent(MainToRendererChannels.FILE_UPDATED, record)
}

// ============================================================
// V1.4.0: 群聊推送
// ============================================================

export function pushGroupCreated(group: any): void {
  pushEvent(MainToRendererChannels.GROUP_CREATED, group)
}

export function pushGroupUpdated(group: any): void {
  pushEvent(MainToRendererChannels.GROUP_UPDATED, group)
}

export function pushGroupDissolved(payload: { groupId: string; reason?: string }): void {
  pushEvent(MainToRendererChannels.GROUP_DISSOLVED, payload)
}

export function pushGroupInviteReceived(payload: {
  groupId: string
  groupName: string
  inviterPeerId: string
  inviterNickname: string
  keyVersion: number
  timestamp: number
}): void {
  pushEvent(MainToRendererChannels.GROUP_INVITE_RECEIVED, payload)
}

export function pushGroupInviteResponded(payload: {
  groupId: string
  peerId: string
  nickname: string
  accepted: boolean
  timestamp: number
}): void {
  pushEvent(MainToRendererChannels.GROUP_INVITE_RESPONDED, payload)
}

export function pushGroupMemberChanged(payload: {
  groupId: string
  type: 'added' | 'removed' | 'left' | 'kicked'
  peerIds: string[]
}): void {
  pushEvent(MainToRendererChannels.GROUP_MEMBER_CHANGED, payload)
}

export function pushGroupMessageReceived(message: any): void {
  pushEvent(MainToRendererChannels.GROUP_MESSAGE_RECEIVED, message)
}

export function pushGroupMessageStatusUpdated(payload: {
  groupId: string
  messageId: string
  status: string
}): void {
  pushEvent(MainToRendererChannels.GROUP_MESSAGE_STATUS_UPDATED, payload)
}
