<template>
  <div class="file-transfer-modal" v-if="visible">
    <div class="overlay" @click="$emit('close')"></div>
    <div class="dialog">
      <div class="dialog-header">
        <h3>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 8px;">
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
            <polyline points="13 2 13 9 20 9"/>
          </svg>
          文件传输
        </h3>
        <button class="close-btn" @click="$emit('close')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div class="dialog-content">
        <div v-if="transfers.length === 0" class="empty-state">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
            <polyline points="13 2 13 9 20 9"/>
          </svg>
          <p>暂无文件传输记录</p>
        </div>

        <div v-else class="transfer-list">
          <div 
            v-for="t in transfers" 
            :key="t.transferId" 
            class="transfer-item"
            :class="t.status"
          >
            <div class="transfer-header">
              <div class="file-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
                  <polyline points="13 2 13 9 20 9"/>
                </svg>
              </div>
              <div class="file-info">
                <div class="file-name">{{ t.fileName }}</div>
                <div class="file-meta">
                  <span>{{ formatSize(t.fileSize) }}</span>
                  <span class="separator">•</span>
                  <span :class="t.direction">{{ t.direction === 'send' ? '发送' : '接收' }}</span>
                </div>
              </div>
              <div class="status-badge" :class="t.status">
                {{ getStatusText(t.status) }}
              </div>
            </div>

            <div class="progress-section" v-if="showProgress(t.status)">
              <div class="progress-bar">
                <div class="progress-fill" :style="{ width: t.progress + '%' }"></div>
              </div>
              <div class="progress-info">
                <span class="progress-percent">{{ t.progress.toFixed(1) }}%</span>
                <span class="progress-speed" v-if="t.status === 'transferring'">传输中...</span>
              </div>
            </div>

            <div class="transfer-actions" v-if="t.status === 'pending' && t.direction === 'receive'">
              <button class="btn-accept" @click="acceptTransfer(t)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                接收
              </button>
              <button class="btn-save-as" @click="saveAsTransfer(t)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                另存为
              </button>
              <button class="btn-reject" @click="rejectTransfer(t.transferId)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
                拒绝
              </button>
            </div>

            <div class="transfer-actions" v-if="t.status === 'transferring' && t.direction === 'send'">
              <button class="btn-cancel" @click="cancelTransfer(t.transferId)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="15" y1="9" x2="9" y2="15"/>
                  <line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
                取消发送
              </button>
            </div>

            <div class="transfer-actions" v-if="t.status === 'completed'">
              <button class="btn-open-location" @click="openFileLocation(t)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                打开位置
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useTransferStore } from '../stores/transfer-store'
import type { FileTransferRecord, FileTransferStatus } from '@shared/types'

defineProps<{ visible: boolean }>()
defineEmits(['close'])

const store = useTransferStore()
const transfers = computed(() => store.transfers)

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB'
  return (bytes / 1073741824).toFixed(1) + ' GB'
}

function getStatusText(status: FileTransferStatus): string {
  const statusMap: Record<FileTransferStatus, string> = {
    pending: '等待接受',
    accepted: '已接受',
    rejected: '已拒绝',
    transferring: '传输中',
    completed: '已完成',
    failed: '失败',
    interrupted: '中断'
  }
  return statusMap[status] || status
}

function showProgress(status: FileTransferStatus): boolean {
  return ['transferring', 'completed'].includes(status)
}

function acceptTransfer(t: FileTransferRecord) {
  const savePath = `C:\\Users\\${require('os').userInfo().username}\\Downloads\\${t.fileName}`
  window.electronAPI.invoke('file:accept', t.transferId, savePath)
}

async function saveAsTransfer(t: FileTransferRecord) {
  try {
    const result = await window.electronAPI.invoke('file:select-save-path', t.fileName)
    if (result && !result.canceled) {
      window.electronAPI.invoke('file:accept', t.transferId, result.filePath)
    }
  } catch (err) {
    console.error('Failed to select save path:', err)
    alert('选择保存路径失败')
  }
}

function rejectTransfer(transferId: string) {
  window.electronAPI.invoke('file:reject', transferId)
}

async function cancelTransfer(transferId: string) {
  try {
    await window.electronAPI.invoke('file:cancel', transferId)
    store.updateStatus(transferId, 'interrupted')
  } catch (err) {
    console.error('Failed to cancel transfer:', err)
    alert('取消传输失败')
  }
}

async function openFileLocation(t: FileTransferRecord) {
  try {
    let filePath: string
    if (t.direction === 'send') {
      // 发送的文件，从配置中获取文件目录
      const config = await window.electronAPI.invoke('config:get')
      const dataDir = require('path').join(require('electron').remote?.app?.getPath('userData') || '', 'files')
      filePath = require('path').join(dataDir, t.fileName)
    } else {
      // 接收的文件，使用savePath
      filePath = t.savePath || ''
    }
    
    if (filePath) {
      await window.electronAPI.invoke('file:open-location', filePath)
    }
  } catch (err) {
    console.error('Failed to open file location:', err)
    alert('打开文件位置失败')
  }
}
</script>

<style scoped>
.file-transfer-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1000;
}

.overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.dialog {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: #fff;
  border-radius: 12px;
  width: 560px;
  max-height: 70vh;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  animation: modalSlideIn 0.3s ease-out;
}

@keyframes modalSlideIn {
  from {
    opacity: 0;
    transform: translate(-50%, -48%);
  }
  to {
    opacity: 1;
    transform: translate(-50%, -50%);
  }
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid #e8e8e8;
}

.dialog-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #333;
  display: flex;
  align-items: center;
}

.close-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #999;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.close-btn:hover {
  background: #f5f5f5;
  color: #333;
}

.dialog-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: #999;
  text-align: center;
}

.empty-state svg {
  margin-bottom: 16px;
  opacity: 0.3;
}

.empty-state p {
  font-size: 14px;
  margin: 0;
}

.transfer-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.transfer-item {
  padding: 16px;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  transition: all 0.2s;
}

.transfer-item:hover {
  border-color: #d9d9d9;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.transfer-item.completed {
  border-color: #07c160;
  background: #f6ffed;
}

.transfer-item.failed {
  border-color: #ff4d4f;
  background: #fff2f0;
}

.transfer-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}

.file-icon {
  color: #07c160;
  flex-shrink: 0;
}

.file-info {
  flex: 1;
  min-width: 0;
}

.file-name {
  font-size: 14px;
  font-weight: 500;
  color: #333;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-meta {
  font-size: 12px;
  color: #999;
  display: flex;
  align-items: center;
  gap: 6px;
}

.separator {
  color: #ddd;
}

.file-meta .send {
  color: #1890ff;
}

.file-meta .receive {
  color: #07c160;
}

.status-badge {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  flex-shrink: 0;
}

.status-badge.pending {
  background: #fff7e6;
  color: #fa8c16;
}

.status-badge.transferring {
  background: #e6f7ff;
  color: #1890ff;
}

.status-badge.completed {
  background: #f6ffed;
  color: #07c160;
}

.status-badge.failed,
.status-badge.interrupted {
  background: #fff2f0;
  color: #ff4d4f;
}

.status-badge.rejected {
  background: #f5f5f5;
  color: #999;
}

.progress-section {
  margin-top: 12px;
}

.progress-bar {
  height: 6px;
  background: #f0f0f0;
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 8px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #07c160, #52c41a);
  border-radius: 3px;
  transition: width 0.3s ease;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #999;
}

.progress-percent {
  font-weight: 500;
  color: #07c160;
}

.transfer-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.btn-accept,
.btn-reject {
  flex: 1;
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.2s;
}

.btn-accept {
  background: #07c160;
  color: #fff;
}

.btn-accept:hover {
  background: #05a350;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(7, 193, 96, 0.3);
}

.btn-reject {
  background: #f5f5f5;
  color: #666;
}

.btn-reject:hover {
  background: #e8e8e8;
  color: #ff4d4f;
}

.btn-save-as {
  background: #1890ff;
  color: #fff;
}

.btn-save-as:hover {
  background: #096dd9;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(24, 144, 255, 0.3);
}

.btn-cancel {
  background: #ff4d4f;
  color: #fff;
}

.btn-cancel:hover {
  background: #cf1322;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(255, 77, 79, 0.3);
}

.btn-open-location {
  background: #faad14;
  color: #fff;
}

.btn-open-location:hover {
  background: #d48806;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(250, 173, 20, 0.3);
}

/* 滚动条样式 */
.dialog-content::-webkit-scrollbar {
  width: 6px;
}

.dialog-content::-webkit-scrollbar-track {
  background: transparent;
}

.dialog-content::-webkit-scrollbar-thumb {
  background: #ddd;
  border-radius: 3px;
}

.dialog-content::-webkit-scrollbar-thumb:hover {
  background: #ccc;
}
</style>
