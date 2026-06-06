<template>
  <div class="transfer-view">
    <div class="transfer-toolbar">
      <div class="toolbar-title">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
          <polyline points="13 2 13 9 20 9"/>
        </svg>
        <h3>文件传输记录</h3>
      </div>
      <button class="btn-refresh" @click="loadTransfers" :disabled="loading" title="刷新">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" :class="{ spinning: loading }">
          <polyline points="23 4 23 10 17 10"/>
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
        </svg>
        <span>刷新</span>
      </button>
    </div>

    <div class="transfer-content">
      <div v-if="loading" class="loading-state">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spinning">
          <polyline points="23 4 23 10 17 10"/>
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
        </svg>
        <p>加载中...</p>
      </div>

      <div v-else-if="loadError" class="error-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p class="error-text">加载失败</p>
        <p class="error-detail">{{ loadError }}</p>
        <button class="btn-retry" @click="loadTransfers">重试</button>
      </div>

      <div v-else-if="sortedTransfers.length === 0" class="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
          <polyline points="13 2 13 9 20 9"/>
        </svg>
        <p>暂无文件传输记录</p>
        <p class="empty-hint">发送或接收文件后，记录将显示在这里</p>
      </div>

      <div v-else class="transfer-list">
        <div 
          v-for="t in sortedTransfers" 
          :key="t.transferId" 
          class="transfer-item"
          :class="[t.status, t.direction]"
        >
          <div class="transfer-item-header">
            <div class="file-icon-wrapper" :class="t.direction">
              <svg v-if="t.direction === 'send'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 19V5M5 12l7-7 7 7"/>
              </svg>
              <svg v-else width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 5v14M19 12l-7 7-7-7"/>
              </svg>
            </div>
            <div class="file-details">
              <div class="file-name" :title="t.fileName">{{ t.fileName }}</div>
              <div class="file-meta">
                <span class="meta-size">{{ formatSize(t.fileSize) }}</span>
                <span class="meta-dot"></span>
                <span class="meta-direction" :class="t.direction">{{ t.direction === 'send' ? '发送' : '接收' }}</span>
                <span class="meta-dot"></span>
                <span class="meta-time">{{ formatTime(t.timestamp) }}</span>
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
            </div>
          </div>

          <div v-if="t.savePath" class="save-path-row">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
            <span class="save-path-text" :title="t.savePath">{{ t.savePath }}</span>
          </div>

          <div class="transfer-item-actions" v-if="t.status === 'completed' || t.savePath">
            <button class="btn-action btn-open-folder" @click="openFileLocation(t)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
              打开文件位置
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useTransferStore } from '../stores/transfer-store'
import type { FileTransferRecord, FileTransferStatus } from '@shared/types'

const store = useTransferStore()
const loading = ref(true)
const loadError = ref('')

async function loadTransfers() {
  loading.value = true
  loadError.value = ''
  try {
    const records = await window.electronAPI.invoke('file:list-transfers')
    if (Array.isArray(records)) {
      store.setTransfers(records)
    } else {
      store.setTransfers([])
    }
  } catch (err) {
    console.error('Failed to load file transfers:', err)
    loadError.value = err instanceof Error ? err.message : '未知错误'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadTransfers()
})

const sortedTransfers = computed(() => 
  [...store.transfers].sort((a, b) => b.timestamp - a.timestamp)
)

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB'
  return (bytes / 1073741824).toFixed(1) + ' GB'
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const timeStr = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  if (isToday) return `今天 ${timeStr}`
  return `${d.getFullYear()}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getDate().toString().padStart(2,'0')} ${timeStr}`
}

function getStatusText(status: FileTransferStatus): string {
  const statusMap: Record<FileTransferStatus, string> = {
    pending: '等待接受',
    accepted: '已接受',
    rejected: '已拒绝',
    transferring: '传输中',
    completed: '已完成',
    failed: '失败',
    interrupted: '已中断'
  }
  return statusMap[status] || status
}

function showProgress(status: FileTransferStatus): boolean {
  return status === 'transferring'
}

async function openFileLocation(t: FileTransferRecord) {
  try {
    const filePath = t.direction === 'send' ? t.fileName : (t.savePath || '')
    if (filePath) {
      await window.electronAPI.invoke('file:open-location', filePath)
    }
  } catch (err) {
    console.error('Failed to open file location:', err)
  }
}
</script>

<style scoped>
.transfer-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100%;
  background: #f0f2f5;
}

.transfer-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  background: #fff;
  border-bottom: 1px solid #e8e8e8;
  flex-shrink: 0;
}

.toolbar-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #333;
}

.toolbar-title h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.toolbar-title svg {
  color: #07c160;
}

.btn-refresh {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  background: #fff;
  color: #666;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-refresh:hover:not(:disabled) {
  border-color: #07c160;
  color: #07c160;
}

.btn-refresh:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.transfer-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  color: #999;
}

.loading-state p {
  margin-top: 12px;
  font-size: 14px;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  color: #999;
}

.error-state svg {
  color: #ff4d4f;
  margin-bottom: 16px;
}

.error-text {
  font-size: 16px;
  font-weight: 500;
  color: #333;
  margin: 0 0 8px;
}

.error-detail {
  font-size: 13px;
  color: #999;
  margin: 0 0 20px;
  text-align: center;
  max-width: 400px;
  word-break: break-all;
}

.btn-retry {
  padding: 8px 20px;
  border: 1px solid #07c160;
  border-radius: 6px;
  background: #fff;
  color: #07c160;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-retry:hover {
  background: #07c160;
  color: #fff;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  color: #bbb;
  text-align: center;
}

.empty-state svg {
  margin-bottom: 20px;
  opacity: 0.25;
}

.empty-state p {
  font-size: 15px;
  margin: 0 0 6px;
  color: #999;
}

.empty-hint {
  font-size: 13px !important;
  color: #bbb !important;
}

.transfer-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.transfer-item {
  padding: 16px;
  border: 1px solid #e8e8e8;
  border-radius: 10px;
  background: #fff;
  transition: all 0.2s;
}

.transfer-item:hover {
  border-color: #d9d9d9;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.transfer-item.completed {
  border-color: #d9f7be;
  background: #f6ffed;
}

.transfer-item.failed {
  border-color: #ffccc7;
  background: #fff2f0;
}

.transfer-item.rejected {
  border-color: #e8e8e8;
  background: #fafafa;
}

.transfer-item.interrupted {
  border-color: #ffccc7;
  background: #fff2f0;
}

.transfer-item-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.file-icon-wrapper {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.file-icon-wrapper.send {
  background: #e6f7ff;
  color: #1890ff;
}

.file-icon-wrapper.receive {
  background: #f6ffed;
  color: #07c160;
}

.file-details {
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

.meta-dot {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: #d9d9d9;
}

.meta-direction.send {
  color: #1890ff;
}

.meta-direction.receive {
  color: #07c160;
}

.meta-time {
  color: #bbb;
}

.status-badge {
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  flex-shrink: 0;
  white-space: nowrap;
}

.status-badge.pending { background: #fff7e6; color: #fa8c16; }
.status-badge.transferring { background: #e6f7ff; color: #1890ff; }
.status-badge.completed { background: #f6ffed; color: #52c41a; }
.status-badge.failed, .status-badge.interrupted { background: #fff2f0; color: #ff4d4f; }
.status-badge.rejected { background: #f5f5f5; color: #999; }
.status-badge.accepted { background: #e6f7ff; color: #1890ff; }

.progress-section {
  margin-top: 12px;
  padding-left: 54px;
}

.progress-bar {
  height: 6px;
  background: #f0f0f0;
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 6px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #07c160, #52c41a);
  border-radius: 3px;
  transition: width 0.3s ease;
}

.progress-info {
  font-size: 12px;
  color: #999;
}

.progress-percent {
  font-weight: 500;
  color: #07c160;
}

.save-path-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  padding: 8px 12px;
  background: #f6f8fa;
  border-radius: 6px;
  margin-left: 54px;
}

.save-path-row svg {
  color: #999;
  flex-shrink: 0;
}

.save-path-text {
  font-size: 12px;
  color: #666;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.transfer-item-actions {
  margin-top: 10px;
  padding-left: 54px;
}

.btn-action {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  background: #fff;
  color: #666;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-action:hover {
  border-color: #07c160;
  color: #07c160;
}

.transfer-content::-webkit-scrollbar {
  width: 6px;
}

.transfer-content::-webkit-scrollbar-track {
  background: transparent;
}

.transfer-content::-webkit-scrollbar-thumb {
  background: #ddd;
  border-radius: 3px;
}

.transfer-content::-webkit-scrollbar-thumb:hover {
  background: #bbb;
}
</style>
