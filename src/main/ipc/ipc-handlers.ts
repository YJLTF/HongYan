import { ipcMain, BrowserWindow, dialog, app, shell } from 'electron'
import os from 'os'
import path from 'path'
import fs from 'fs'
import { friendDiscoveryService } from '../services/friend-discovery-service'
import { messageService } from '../services/message-service'
import { fileTransferService } from '../services/file-transfer-service'
import { groupService } from '../services/group-service'
import { updatePublisher, computeFileSha256, getFileSize } from '../services/update-publisher'
import { updateDownloader } from '../services/update-downloader'
import { storageService } from '../storage/storage-service'
import { getDataDir } from '../storage/database'
import { udpBroadcaster } from '../network/udp-broadcaster'
import { sendToPeer } from '../network/connection-manager'
import { createPacket } from '../network/protocol'
import { cryptoService } from '../crypto/crypto-service'
import { showMainWindow as showTrayWindow } from '../tray'
import { getMainWindow, pushFileUpdated } from './ipc-push'
import { RendererToMainChannels, FileTransferStatus } from '@shared/types'
import type {
  Group,
  FileShareRequestPacket,
  FileTransferRecord,
  StartPublishInput,
} from '@shared/types'
import { getAppVersion } from '../utils/app-info'
import log from 'electron-log'

// V1.5.0 合并: 关于页 + 发布页共用 app:get-version
// getAppVersion() 内部已备忘录化，多个组件多次调用只解析一次 package.json
// 详细 fallback 逻辑见 utils/app-info.ts

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

  // V1.4.0: 群聊文件下载 — 群成员请求发送方下发已暂存的文件
  ipcMain.handle('file:request-group-file', async (
    _event,
    groupId: string,
    messageId: string,
    senderPeerId: string,
    savePath: string,
  ) => {
    try {
      // 从群消息中查文件元数据
      const records = storageService.queryGroupChatRecords(groupId, 1000, 0)
      const record = records.find(r => r.id === messageId)
      if (!record) return { error: 'Group message not found' }
      if (record.type !== 'file') return { error: 'Message is not a file' }
      if (record.senderPeerId !== senderPeerId) {
        return { error: 'Sender mismatch' }
      }
      // payload 可能是密文，也可能是兼容旧格式
      let md5 = ''
      try {
        if (record.content) {
          const parsed = JSON.parse(record.content)
          if (parsed?.md5) md5 = parsed.md5
        }
      } catch { /* content 可能是空或旧数据 */ }

      // 通过加密通道向发送方请求文件
      const friend = udpBroadcaster.getFriend(senderPeerId)
      if (!friend) return { error: 'Sender is not a known peer' }

      const fileName = record.fileName || 'file'
      const fileSize = record.fileSize || 0
      const selfId = storageService.loadConfig()?.peerId || ''

      // 构造 FileShareRequestPacket 并加密
      const shareRequest: FileShareRequestPacket = {
        version: 1,
        transferId: messageId,
        fromPeerId: senderPeerId,
        toPeerId: selfId,
        fileName,
        fileSize,
        md5,
        timestamp: Date.now(),
      }
      const encrypted = cryptoService.encryptForTransmission(senderPeerId, JSON.stringify(shareRequest))
      await sendToPeer(friend, createPacket('file-share-request', {
        fromPeerId: selfId,
        encrypted,
      }))

      // 立即登记一条 receive 方向的 FileTransferRecord，让 UI 状态变化可见
      // （主进程收到 fromGroupShare 的 file-request 时会查这个 record 取 savePath 自动接收）
      const pendingRecord: FileTransferRecord = {
        transferId: messageId,
        peerId: senderPeerId,
        direction: 'receive',
        fileName,
        fileSize,
        status: FileTransferStatus.PENDING,
        progress: 0,
        md5,
        savePath,
        timestamp: Date.now(),
      }
      storageService.saveFileTransfer(pendingRecord)
      pushFileUpdated(pendingRecord)

      return { success: true }
    } catch (err) {
      log.error('Request group file failed:', err)
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

  ipcMain.handle('app:get-version', () => {
    const v = getAppVersion()
    log.info('App version requested:', v, 'electron:', process.versions.electron)
    return v
  })

  // 返回当前实例真实使用的数据目录（已综合 ABCD_DATA_DIR 环境变量和配置中的 userDataDir）
  ipcMain.handle('app:get-data-dir', () => {
    return getDataDir(storageService.loadConfig() ?? undefined)
  })

  ipcMain.handle('config:set', (_event, config: any) => {
    storageService.saveConfig(config)
    // 同步更新 UDP 广播中携带的本地用户信息，让其他好友能立即看到昵称变更
    udpBroadcaster.setSelfInfo({
      peerId: config?.peerId,
      nickname: config?.nickname,
    })
    // V1.2.0: 应用用户配置的心跳间隔
    if (typeof config?.heartbeatIntervalMs === 'number') {
      friendDiscoveryService.setHeartbeatInterval(config.heartbeatIntervalMs)
    }
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

  // V1.2.0: 手动触发一次 UDP 广播
  ipcMain.handle('friend:refresh', () => {
    try {
      friendDiscoveryService.refresh()
      return { success: true }
    } catch (err) {
      log.error('Friend refresh failed:', err)
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

  // V1.3.0: 渲染端请求显示主窗口（用于从托盘通知点击唤起）
  ipcMain.handle('app:show-main-window', () => {
    showTrayWindow(getMainWindow)
  })

  // ============================================================
  // V1.4.0: 群聊 IPC
  // ============================================================

  ipcMain.handle(RendererToMainChannels.GROUP_CREATE, async (_event, groupName: string, memberPeerIds: string[]) => {
    try {
      const group = await groupService.createGroup(groupName, memberPeerIds)
      return { group }
    } catch (err) {
      log.error('Create group failed:', err)
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle(RendererToMainChannels.GROUP_INVITE, async (_event, groupId: string, memberPeerIds: string[]) => {
    try {
      await groupService.inviteMembers(groupId, memberPeerIds)
      return { success: true }
    } catch (err) {
      log.error('Invite members failed:', err)
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle(RendererToMainChannels.GROUP_RESPOND_INVITE, async (_event, inviterPeerId: string, groupId: string, accept: boolean) => {
    try {
      // V1.4.0: 接受邀请时先建立本地群组（基于暂存的 invite 数据），再回 ACK
      if (accept) {
        const invite = groupService.takePendingInvite(inviterPeerId, groupId)
        if (invite) {
          groupService.acceptInviteCreateLocalGroup(invite, inviterPeerId)
        }
      }
      await groupService.respondInvite(inviterPeerId, groupId, accept)
      return { success: true }
    } catch (err) {
      log.error('Respond invite failed:', err)
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle(RendererToMainChannels.GROUP_LEAVE, async (_event, groupId: string) => {
    try {
      await groupService.leaveGroup(groupId)
      return { success: true }
    } catch (err) {
      log.error('Leave group failed:', err)
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle(RendererToMainChannels.GROUP_KICK, async (_event, groupId: string, peerId: string) => {
    try {
      await groupService.kickMember(groupId, peerId)
      return { success: true }
    } catch (err) {
      log.error('Kick member failed:', err)
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle(RendererToMainChannels.GROUP_DISMISS, async (_event, groupId: string) => {
    try {
      await groupService.dismissGroup(groupId)
      return { success: true }
    } catch (err) {
      log.error('Dismiss group failed:', err)
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle(RendererToMainChannels.GROUP_LIST, () => {
    try {
      return { groups: groupService.getGroups() }
    } catch (err) {
      log.error('List groups failed:', err)
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle(RendererToMainChannels.GROUP_LOAD_HISTORY, async (_event, groupId: string, limit?: number, offset?: number) => {
    try {
      const records = await groupService.loadHistory(groupId, limit, offset)
      return { records }
    } catch (err) {
      log.error('Load group history failed:', err)
      return { records: [] }
    }
  })

  ipcMain.handle(RendererToMainChannels.GROUP_SEND_TEXT, async (_event, groupId: string, content: string, mentions?: string[], mentionedAll?: boolean) => {
    try {
      const messageId = await groupService.sendText(groupId, content, mentions, mentionedAll)
      return { messageId }
    } catch (err) {
      log.error('Send group text failed:', err)
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle(RendererToMainChannels.GROUP_SEND_IMAGE, async (_event, groupId: string, filePath: string) => {
    try {
      const messageId = await groupService.sendImage(groupId, filePath)
      return { messageId }
    } catch (err) {
      log.error('Send group image failed:', err)
      return { error: (err as Error).message }
    }
  })

  // V1.4.0: 群聊发送文件（仅广播文件元数据，文件本体暂存于发送方 FILES_DIR）
  ipcMain.handle(RendererToMainChannels.GROUP_SEND_FILE, async (_event, groupId: string, filePath: string) => {
    try {
      const messageId = await groupService.sendFile(groupId, filePath)
      return { messageId }
    } catch (err) {
      log.error('Send group file failed:', err)
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle(RendererToMainChannels.GROUP_UPDATE_NAME, async (_event, groupId: string, newName: string) => {
    try {
      await groupService.updateGroupName(groupId, newName)
      return { success: true }
    } catch (err) {
      log.error('Update group name failed:', err)
      return { error: (err as Error).message }
    }
  })

  // ============================================================
  // V1.5.0: 版本分发 IPC
  // ============================================================

  ipcMain.handle(RendererToMainChannels.UPDATE_GET_LOWER_VERSION_FRIENDS, (_event, targetVersion: string) => {
    return friendDiscoveryService.getLowerVersionFriends(targetVersion)
  })

  // 选择文件并计算元数据（SHA-256 + size）
  ipcMain.handle(RendererToMainChannels.UPDATE_PICK_FILES, async () => {
    const result = await dialog.showOpenDialog({
      title: '选择分发包（可多选）',
      properties: ['openFile'],
      filters: [
        { name: '可执行文件', extensions: ['exe'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    })
    if (result.canceled || result.filePaths.length === 0) return { canceled: true }
    const files: Array<{ filePath: string; size: number; sha256: string }> = []
    for (const fp of result.filePaths) {
      try {
        const size = await getFileSize(fp)
        const sha256 = await computeFileSha256(fp)
        files.push({ filePath: fp, size, sha256 })
      } catch (err) {
        log.error('Failed to inspect file:', fp, err)
      }
    }
    return { canceled: false, files }
  })

  ipcMain.handle(RendererToMainChannels.UPDATE_START_PUBLISH, async (_event, input: StartPublishInput) => {
    try {
      const rec = await updatePublisher.startPublish(input)
      return { success: true, record: rec }
    } catch (err) {
      log.error('Start publish failed:', err)
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle(RendererToMainChannels.UPDATE_STOP_PUBLISH, async () => {
    try {
      await updatePublisher.stopPublish()
      return { success: true }
    } catch (err) {
      log.error('Stop publish failed:', err)
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle(RendererToMainChannels.UPDATE_GET_PUBLISH_STATUS, () => {
    return updatePublisher.getStatus()
  })

  ipcMain.handle(RendererToMainChannels.UPDATE_LIST_PUBLISHED, () => {
    return updatePublisher.listPublished()
  })

  // V1.5.0: 删除历史发布记录
  ipcMain.handle('update:delete-published', (_event, id: string) => {
    try {
      storageService.deletePublishedUpdate(id)
      return { success: true }
    } catch (err) {
      log.error('Delete published failed:', err)
      return { error: (err as Error).message }
    }
  })

  // 重新广播（如果是已停止的发布，会重启 HTTP 服务再广播；要求本地包文件仍在）
  ipcMain.handle('update:rebroadcast', async (_event, id: string) => {
    try {
      await updatePublisher.rebroadcast(id)
      return { success: true }
    } catch (err) {
      log.error('Rebroadcast failed:', err)
      return { error: (err as Error).message }
    }
  })

  // ============================================================
  // V1.5.0: 收端下载 / 安装 IPC
  // ============================================================

  ipcMain.handle(RendererToMainChannels.UPDATE_LIST_AVAILABLE, () => {
    return storageService.listAvailableUpdates()
  })

  ipcMain.handle(RendererToMainChannels.UPDATE_DISMISS_AVAILABLE, (_event, publisherPeerId: string, targetVersion: string) => {
    try {
      storageService.setAvailableUpdateDismissed(publisherPeerId, targetVersion, true)
      return { success: true }
    } catch (err) {
      log.error('Dismiss failed:', err)
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle(RendererToMainChannels.UPDATE_START_DOWNLOAD, async (
    _event,
    jobId: string,
    publisherIp: string,
    httpPort: number,
    packageType: 'nsis' | 'portable',
    fileName: string,
    fileSize: number,
    sha256: string
  ) => {
    try {
      // 后台执行下载，状态走 push 事件
      void updateDownloader.download({
        jobId, publisherIp, httpPort, packageType, fileName, fileSize, sha256
      }).then((savePath) => {
        log.info('Download finished for jobId=', jobId, '→', savePath)
      }).catch((err) => {
        log.error('Download failed for jobId=', jobId, ':', err)
        try {
          const { pushUpdateDownloadFailed } = require('./ipc-push')
          pushUpdateDownloadFailed({ jobId, packageType, fileName, error: (err as Error).message })
        } catch { /* ignore */ }
      })
      return { success: true, jobId }
    } catch (err) {
      log.error('Start download failed:', err)
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle(RendererToMainChannels.UPDATE_CANCEL_DOWNLOAD, (_event, jobId: string) => {
    try {
      const ok = updateDownloader.cancel(jobId)
      return { success: ok }
    } catch (err) {
      log.error('Cancel download failed:', err)
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle(RendererToMainChannels.UPDATE_OPEN_INSTALLER, (_event, savePath: string) => {
    try {
      updateDownloader.openInstaller(savePath)
      return { success: true }
    } catch (err) {
      log.error('Open installer failed:', err)
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
