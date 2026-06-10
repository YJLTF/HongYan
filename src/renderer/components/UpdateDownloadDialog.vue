<template>
  <div v-if="visible" class="update-download-dialog">
    <div class="dialog-mask" @click.self="handleClose" />
    <div class="dialog-card">
      <div class="dialog-header">
        <h3>下载更新</h3>
        <button class="close-btn" @click="handleClose">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div class="dialog-body">
        <div v-if="status === 'idle'" class="meta">
          <div class="row"><span>发布方：</span><strong>{{ publisherNickname }}</strong></div>
          <div class="row"><span>版本：</span><strong>{{ targetVersion }}</strong></div>
          <div v-if="record.note" class="row note">{{ record.note }}</div>
          <div class="packages">
            <label v-if="record.nsis" class="package-option">
              <input type="radio" v-model="selectedType" value="nsis" />
              <span>NSIS 安装包 · {{ record.nsis.filename }} · {{ formatSize(record.nsis.size) }}</span>
            </label>
            <label v-if="record.portable" class="package-option">
              <input type="radio" v-model="selectedType" value="portable" />
              <span>Portable 便携版 · {{ record.portable.filename }} · {{ formatSize(record.portable.size) }}</span>
            </label>
          </div>
        </div>

        <div v-else-if="status === 'downloading' || status === 'verifying'" class="progress">
          <div class="row"><span>正在下载：</span><strong>{{ currentProgress?.fileName }}</strong></div>
          <div class="bar-wrap">
            <div class="bar-fill" :style="{ width: progressPercent + '%' }" />
          </div>
          <div class="progress-info">
            <span>{{ formatSize(currentProgress?.downloaded || 0) }} / {{ formatSize(currentProgress?.fileSize || 0) }}</span>
            <span>{{ formatSpeed(currentProgress?.speed || 0) }}</span>
            <span v-if="status === 'verifying'">校验中...</span>
          </div>
        </div>

        <div v-else-if="status === 'completed'" class="result success">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          <div>下载完成</div>
          <div class="save-path">{{ savePath }}</div>
        </div>

        <div v-else-if="status === 'failed'" class="result error">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <div>下载失败</div>
          <div class="error-msg">{{ errorMessage }}</div>
        </div>
      </div>

      <div class="dialog-footer">
        <template v-if="status === 'idle'">
          <button class="btn-cancel" @click="handleClose">取消</button>
          <button class="btn-primary" :disabled="!selectedType" @click="handleStart">开始下载</button>
        </template>
        <template v-else-if="status === 'downloading'">
          <button class="btn-cancel" @click="handleCancel">取消下载</button>
        </template>
        <template v-else-if="status === 'completed'">
          <button class="btn-cancel" @click="handleClose">关闭</button>
          <button class="btn-primary" @click="handleOpenInstaller">打开安装器</button>
        </template>
        <template v-else-if="status === 'failed'">
          <button class="btn-cancel" @click="handleClose">关闭</button>
          <button class="btn-primary" @click="resetAndRetry">重试</button>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useUpdateStore } from '../stores/update-store'
import type { AvailableUpdate, UpdateDownloadProgress } from '@shared/types'
import { formatSize } from '@shared/format'

const props = defineProps<{
  record: AvailableUpdate
}>()
const emit = defineEmits<{ close: [] }>()

const updateStore = useUpdateStore()

const visible = ref(true)
const status = ref<'idle' | 'downloading' | 'verifying' | 'completed' | 'failed'>('idle')
const selectedType = ref<'nsis' | 'portable' | ''>('')
const currentProgress = ref<UpdateDownloadProgress | null>(null)
const savePath = ref<string>('')
const errorMessage = ref<string>('')

const publisherNickname = computed(() => props.record.publisherNickname || '未知')
const targetVersion = computed(() => props.record.targetVersion)

const progressPercent = computed(() => {
  const cur = currentProgress.value
  if (!cur || cur.fileSize === 0) return 0
  return Math.min(100, (cur.downloaded / cur.fileSize) * 100)
})

watch(() => props.record, (rec) => {
  if (rec.nsis) selectedType.value = 'nsis'
  else if (rec.portable) selectedType.value = 'portable'
}, { immediate: true })

function onProgress(p: UpdateDownloadProgress) {
  if (p.jobId && activeJobId.value && p.jobId !== activeJobId.value) return
  currentProgress.value = p
  if (p.status === 'downloading') status.value = 'downloading'
  else if (p.status === 'verifying') status.value = 'verifying'
  else if (p.status === 'failed') {
    status.value = 'failed'
    errorMessage.value = p.error || '未知错误'
  }
}

function onComplete(payload: any) {
  if (!activeJobId.value || payload.jobId !== activeJobId.value) return
  savePath.value = payload.savePath || ''
  status.value = 'completed'
}

function onFailed(payload: any) {
  if (!activeJobId.value || payload.jobId !== activeJobId.value) return
  status.value = 'failed'
  errorMessage.value = payload.error || '未知错误'
}

const activeJobId = ref<string>('')

async function handleStart() {
  if (!selectedType.value) return
  const type = selectedType.value as 'nsis' | 'portable'
  const pkg = props.record[type]
  if (!pkg) return
  if (!props.record.publisherIp) {
    status.value = 'failed'
    errorMessage.value = '尚未收到发布方的 IP，请等待新一轮广播'
    return
  }
  status.value = 'downloading'
  errorMessage.value = ''
  currentProgress.value = null
  const result = await updateStore.startDownload(
    props.record.publisherIp,
    props.record.httpPort,
    type,
    pkg.filename,
    pkg.size,
    pkg.sha256
  )
  if (result?.success && result.jobId) {
    activeJobId.value = result.jobId
  } else {
    status.value = 'failed'
    errorMessage.value = result?.error || '启动下载失败'
  }
}

async function handleCancel() {
  if (activeJobId.value) {
    await updateStore.cancelDownload(activeJobId.value)
  }
  status.value = 'failed'
  errorMessage.value = '已取消'
}

async function handleOpenInstaller() {
  if (!savePath.value) return
  try {
    await updateStore.openInstaller(savePath.value)
  } catch (err) {
    alert('打开安装器失败：' + (err as Error).message)
  }
}

function resetAndRetry() {
  status.value = 'idle'
  errorMessage.value = ''
  currentProgress.value = null
}

function handleClose() {
  visible.value = false
  emit('close')
}

function formatSpeed(bps: number): string {
  if (!bps) return '0 B/s'
  return formatSize(bps) + '/s'
}

let cleanups: (() => void)[] = []
onMounted(() => {
  cleanups.push(window.electronAPI.on('update:download-progress', onProgress))
  cleanups.push(window.electronAPI.on('update:download-complete', onComplete))
  cleanups.push(window.electronAPI.on('update:download-failed', onFailed))
})
onUnmounted(() => {
  cleanups.forEach(fn => fn())
})
</script>

<style scoped>
.update-download-dialog {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  z-index: 1500;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dialog-mask {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.dialog-card {
  position: relative;
  background: #fff;
  border-radius: 16px;
  width: 90%;
  max-width: 460px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
  animation: scaleIn 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes scaleIn {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #f0f0f0;
}

.dialog-header h3 {
  margin: 0;
  font-size: 15px;
  color: #333;
}

.close-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: #999;
  cursor: pointer;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.close-btn:hover {
  background: #f5f5f5;
  color: #333;
}

.dialog-body {
  padding: 20px;
  min-height: 140px;
}

.row {
  font-size: 13px;
  color: #555;
  margin-bottom: 8px;
}

.row.note {
  padding: 8px 12px;
  background: #fafafa;
  border-radius: 6px;
  color: #666;
  font-style: italic;
  margin-top: 8px;
}

.packages {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.package-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: #fafafa;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  border: 1px solid transparent;
  transition: all 0.15s;
}

.package-option:hover {
  background: #f5f5f5;
}

.package-option input[type="radio"] {
  accent-color: #07c160;
}

.progress {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.bar-wrap {
  height: 8px;
  background: #f0f0f0;
  border-radius: 4px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #07c160 0%, #06ad56 100%);
  transition: width 0.2s ease;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #888;
}

.result {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px 0;
  text-align: center;
}

.result.success { color: #07c160; }
.result.error { color: #f5222d; }

.save-path {
  font-size: 11px;
  color: #999;
  font-family: monospace;
  word-break: break-all;
  max-width: 100%;
  margin-top: 4px;
}

.error-msg {
  font-size: 12px;
  color: #f5222d;
  font-family: monospace;
}

.dialog-footer {
  padding: 12px 20px;
  border-top: 1px solid #f0f0f0;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.btn-cancel, .btn-primary {
  padding: 7px 16px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.btn-cancel {
  background: #f5f5f5;
  color: #666;
}

.btn-cancel:hover {
  background: #e8e8e8;
}

.btn-primary {
  background: linear-gradient(135deg, #07c160 0%, #06ad56 100%);
  color: #fff;
  box-shadow: 0 2px 8px rgba(7, 193, 96, 0.3);
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(7, 193, 96, 0.4);
}

.btn-primary:disabled {
  background: #d9d9d9;
  box-shadow: none;
  cursor: not-allowed;
}
</style>
