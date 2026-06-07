import { ipcMain, BrowserWindow, dialog, app } from 'electron'
import os from 'os'
import { friendDiscoveryService } from '../services/friend-discovery-service'
import { messageService } from '../services/message-service'
import { fileTransferService } from '../services/file-transfer-service'
import { storageService } from '../storage/storage-service'
import type {
  RendererToMainChannels,
  MainToRendererChannels,
} from '@shared/types'
import log from 'electron-log'

export function registerIpcHandlers(): void {
  ipcMain.handle('friend:scan-segment', async (_event, cidr: string) => {
    try {
      return await friendDiscoveryService.scanSegment(cidr)
    } catch (err) {
      log.error('Scan segment failed:', err)
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle('message:send-text', async (_event, peerId: string, content: string) => {
    try {
      return await messageService.sendText(peerId, content)
    } catch (err) {
      log.error('Send text failed:', err)
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle('message:select-image', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'] }],
    })
    if (result.canceled || result.filePaths.length === 0) return undefined
    return result.filePaths[0]
  })

  // 选择头像图片
  ipcMain.handle('avatar:select', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'] }],
    })
    if (result.canceled || result.filePaths.length === 0) return undefined
    return result.filePaths[0]
  })

  // 保存头像（将图片转换为 base64）
  ipcMain.handle('avatar:save', async (_event, filePath: string) => {
    try {
      const fs = require('fs')
      const imageBuffer = fs.readFileSync(filePath)
      const base64Image = imageBuffer.toString('base64')
      return `data:image/png;base64,${base64Image}`
    } catch (err) {
      log.error('Save avatar failed:', err)
      throw err
    }
  })

  ipcMain.handle('message:send-image', async (_event, peerId: string, filePath: string) => {
    try {
      return await messageService.sendImage(peerId, filePath)
    } catch (err) {
      log.error('Send image failed:', err)
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle('chat:load-history', async (_event, peerId: string, limit?: number, offset?: number) => {
    try {
      return await messageService.loadHistory(peerId, limit, offset)
    } catch (err) {
      log.error('Load history failed:', err)
      return []
    }
  })

  ipcMain.handle('file:select', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
    })
    if (result.canceled || result.filePaths.length === 0) return undefined
    return result.filePaths[0]
  })

  ipcMain.handle('file:send', async (_event, peerId: string, filePath: string) => {
    try {
      return await fileTransferService.sendFile(peerId, filePath)
    } catch (err) {
      log.error('Send file failed:', err)
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle('file:accept', (_event, transferId: string, savePath: string) => {
    fileTransferService.acceptTransfer(transferId, savePath)
  })

  ipcMain.handle('file:reject', (_event, transferId: string) => {
    fileTransferService.rejectTransfer(transferId)
  })

  ipcMain.handle('file:list-transfers', () => {
    return storageService.queryFileTransfers()
  })

  // 选择保存路径（另存为）
  ipcMain.handle('file:select-save-path', async (_event, defaultFileName: string) => {
    const result = await dialog.showSaveDialog({
      defaultPath: defaultFileName,
      filters: [
        { name: '所有文件', extensions: ['*'] }
      ]
    })
    if (result.canceled || !result.filePath) return { canceled: true }
    return { filePath: result.filePath, canceled: false }
  })

  // 取消文件传输
  ipcMain.handle('file:cancel', (_event, transferId: string) => {
    fileTransferService.cancelTransfer(transferId)
  })

  // 打开文件位置
  ipcMain.handle('file:open-location', async (_event, filePath: string) => {
    try {
      const { shell } = require('electron')
      await shell.showItemInFolder(filePath)
    } catch (err) {
      log.error('Failed to open file location:', err)
      throw err
    }
  })

  // 选择目录
  ipcMain.handle('dialog:select-directory', async (_event, title?: string) => {
    const result = await dialog.showOpenDialog({
      title: title || '选择目录',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return undefined
    return result.filePaths[0]
  })

  ipcMain.handle('config:get', () => {
    return storageService.loadConfig()
  })

  ipcMain.handle('get:home-dir', () => {
    return os.homedir()
  })

  ipcMain.handle('config:set', (_event, config: any) => {
    storageService.saveConfig(config)
  })

  ipcMain.handle('friend:list', () => {
    return friendDiscoveryService.getFriends()
  })

  // 删除好友
  ipcMain.handle('friend:delete', (_event, peerId: string) => {
    try {
      storageService.deleteFriend(peerId)
      return { success: true }
    } catch (err) {
      log.error('Delete friend failed:', err)
      return { error: (err as Error).message }
    }
  })

  // 主动扫描好友
  ipcMain.handle('friend:scan', async () => {
    try {
      const config = storageService.loadConfig()
      const scanSegments = config?.scanSegments || []
      
      if (scanSegments.length > 0) {
        log.info(`Scanning configured segments: ${scanSegments.join(', ')}`)
        for (const cidr of scanSegments) {
          try {
            await friendDiscoveryService.scanSegment(cidr)
          } catch (err) {
            log.error(`Failed to scan segment ${cidr}:`, err)
          }
        }
      }
      
      return { success: true }
    } catch (err) {
      log.error('Friend scan failed:', err)
      return { error: (err as Error).message }
    }
  })

  // 更新好友备注
  ipcMain.handle('friend:update-remark', (_event, peerId: string, remark: string | null) => {
    try {
      storageService.updateFriendRemark(peerId, remark)
      return { success: true }
    } catch (err) {
      log.error('Update friend remark failed:', err)
      return { error: (err as Error).message }
    }
  })

  // 标记消息已读
  ipcMain.handle('message:mark-read', (_event, peerId: string, messageIds: string[]) => {
    try {
      messageService.markMessagesAsRead(peerId, messageIds)
      return { success: true }
    } catch (err) {
      log.error('Mark messages as read failed:', err)
      return { error: (err as Error).message }
    }
  })

  log.info('IPC handlers registered')
}

// 重启应用
ipcMain.handle('app:restart', () => {
  app.relaunch()
  app.exit(0)
})
