<template>
  <div class="update-publish-view">
    <div class="view-header">
      <h2>版本分发</h2>
      <p class="subtitle">选择一组新版本分发包，Message 将向所有低版本好友广播升级通知</p>
    </div>

    <!-- 当前发布状态 -->
    <div v-if="publishStatus.running" class="status-card running">
      <div class="status-header">
        <span class="status-dot" />
        <span class="status-title">正在发布 {{ publishStatus.targetVersion }}</span>
      </div>
      <div class="status-info">
        <div>HTTP 服务端口：<code>{{ publishStatus.httpPort }}</code></div>
        <div>广播已发出，等待好友下载</div>
      </div>
      <button class="btn-stop" @click="handleStop">停止发布</button>
    </div>

    <!-- 发布表单 -->
    <div class="publish-form">
      <h3>新发布</h3>

      <div class="form-section">
        <label class="form-label">目标版本号</label>
        <div class="version-input">
          <input
            type="text"
            v-model="targetVersion"
            placeholder="例如 1.5.0"
            :class="{ invalid: targetVersion && !isValidVersion(targetVersion) }"
          />
          <button class="btn-link" @click="useCurrentVersion">使用本机版本</button>
        </div>
        <div v-if="targetVersion && !isValidVersion(targetVersion)" class="hint error">
          版本号格式必须为 x.y.z
        </div>
      </div>

      <div class="form-section">
        <label class="form-label">NSIS 安装包</label>
        <div v-if="!nsisFile" class="file-picker" @click="pickNsis">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <span>点击选择 .exe 安装包</span>
        </div>
        <div v-else class="file-card">
          <div class="file-info">
            <div class="file-name">{{ nsisFile.filePath.split(/[\\/]/).pop() }}</div>
            <div class="file-meta">
              {{ formatSize(nsisFile.size) }} · SHA-256: {{ nsisFile.sha256.slice(0, 12) }}...
            </div>
          </div>
          <button class="btn-icon" @click="nsisFile = null" title="移除">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="form-section">
        <label class="form-label">Portable 便携版</label>
        <div v-if="!portableFile" class="file-picker" @click="pickPortable">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <span>点击选择 .exe 便携版</span>
        </div>
        <div v-else class="file-card">
          <div class="file-info">
            <div class="file-name">{{ portableFile.filePath.split(/[\\/]/).pop() }}</div>
            <div class="file-meta">
              {{ formatSize(portableFile.size) }} · SHA-256: {{ portableFile.sha256.slice(0, 12) }}...
            </div>
          </div>
          <button class="btn-icon" @click="portableFile = null" title="移除">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="form-section">
        <label class="form-label">更新说明（可选）</label>
        <textarea
          v-model="note"
          rows="3"
          maxlength="500"
          placeholder="例：修复群文件下载问题；优化大文件传输性能"
        />
        <div class="char-count">{{ note.length }} / 500</div>
      </div>

      <div v-if="lowerVersionFriends.length > 0" class="friends-hint">
        将向 <strong>{{ lowerVersionFriends.length }}</strong> 个低版本好友广播
      </div>
      <div v-else-if="targetVersion && isValidVersion(targetVersion)" class="friends-hint muted">
        当前无在线的低版本好友（仅当好友开启 V1.5.0+ 才会出现在此列表）
      </div>

      <div class="firewall-hint">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <span>发布后 Message 将在 LAN 启用临时 HTTP 下载服务（默认 :19890）。Windows 防火墙首次可能弹窗询问是否允许 node.exe 监听，请选择「允许」。</span>
      </div>

      <div class="form-actions">
        <button
          class="btn-publish"
          :disabled="!canPublish"
          @click="handleStart"
        >
          {{ publishing ? '发布中...' : '一键发布' }}
        </button>
      </div>
    </div>

    <!-- 历史发布 -->
    <div class="history-section">
      <h3>历史发布</h3>
      <div v-if="publishedList.length === 0" class="empty">暂无历史发布</div>
      <div v-else class="history-list">
        <div v-for="rec in publishedList" :key="rec.id" class="history-item">
          <div class="history-info">
            <div class="history-version">{{ rec.version }}</div>
            <div class="history-meta">
              <span :class="['status-badge', rec.stoppedAt ? 'stopped' : 'running']">
                {{ rec.stoppedAt ? '已停止' : '广播中' }}
              </span>
              <span>下载 {{ rec.downloadCount }} 次</span>
              <span>{{ formatDateTime(rec.publishedAt) }}</span>
            </div>
            <div class="history-files">
              <span v-if="rec.nsis">NSIS: {{ rec.nsis.filename }} ({{ formatSize(rec.nsis.size) }})</span>
              <span v-if="rec.portable">Portable: {{ rec.portable.filename }} ({{ formatSize(rec.portable.size) }})</span>
            </div>
            <div v-if="rec.note" class="history-note">{{ rec.note }}</div>
          </div>
          <div class="history-actions">
            <button class="btn-secondary" @click="handleRebroadcast(rec.id)">再次广播</button>
            <button class="btn-danger" @click="handleDelete(rec.id)">删除</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, shallowRef, computed, onMounted, onUnmounted, watch } from 'vue'
import { useUpdateStore } from '../stores/update-store'
import { useAppStore } from '../stores/app-store'
import { isValidVersion } from '@shared/version'
import { formatSize, formatDateTime } from '@shared/format'

const updateStore = useUpdateStore()
const appStore = useAppStore()

const targetVersion = ref('')
// V1.5.0 修复: shallowRef 避免 Vue 3 把内部 object 包成 reactive Proxy
// ref(obj) 会调用 reactive() 包装，下一次 .value 拿到的对象带 __v_raw/__v_isReactive 槽位，
// Electron 的 ipcRenderer.invoke 走 V8 structuredClone，Proxy 无法被克隆，会报
// "An object could not be cloned."。shallowRef 只跟踪 .value 自身变化
const nsisFile = shallowRef<{ filePath: string; size: number; sha256: string } | null>(null)
const portableFile = shallowRef<{ filePath: string; size: number; sha256: string } | null>(null)
const note = ref('')
const publishing = ref(false)
const lowerVersionFriends = ref<any[]>([])

const publishedList = computed(() => updateStore.publishedList)
const publishStatus = computed(() => updateStore.publishStatus)

const canPublish = computed(() => {
  if (publishing.value) return false
  if (!targetVersion.value || !isValidVersion(targetVersion.value)) return false
  if (!nsisFile.value && !portableFile.value) return false
  return true
})

function useCurrentVersion() {
  targetVersion.value = appStore.version
}

async function pickNsis() {
  const r: any = await window.electronAPI.invoke('update:pick-files')
  if (r?.canceled) return
  if (r?.files && r.files.length > 0) nsisFile.value = r.files[0]
}

async function pickPortable() {
  const r: any = await window.electronAPI.invoke('update:pick-files')
  if (r?.canceled) return
  if (r?.files && r.files.length > 0) portableFile.value = r.files[0]
}

async function refreshLowerFriends() {
  if (!targetVersion.value || !isValidVersion(targetVersion.value)) {
    lowerVersionFriends.value = []
    return
  }
  const friends = await updateStore.getLowerVersionFriends(targetVersion.value)
  lowerVersionFriends.value = Array.isArray(friends) ? friends : []
}

async function handleStart() {
  if (!canPublish.value) return
  publishing.value = true
  try {
    const result = await updateStore.startPublish({
      targetVersion: targetVersion.value,
      nsis: nsisFile.value || undefined,
      portable: portableFile.value || undefined,
      note: note.value || undefined,
    })
    if (result?.error) {
      alert('发布失败：' + result.error)
    } else {
      note.value = ''
    }
  } catch (err) {
    alert('发布失败：' + (err as Error).message)
  } finally {
    publishing.value = false
  }
}

async function handleStop() {
  if (!confirm('确定要停止当前发布吗？已下载的文件不受影响，新下载请求将被拒绝。')) return
  await updateStore.stopPublish()
}

async function handleRebroadcast(id: string) {
  await updateStore.rebroadcast(id)
  alert('已重新广播')
}

async function handleDelete(id: string) {
  if (!confirm('确定删除该历史发布记录吗？\n（仅删除本地记录，不影响已发出的广播）')) return
  await updateStore.deletePublished(id)
}

onMounted(async () => {
  await appStore.loadVersion()
  await updateStore.refreshPublished()
  await updateStore.refreshPublishStatus()

  // 监听本组件的 publish 状态推送
  const off = window.electronAPI.on('update:publish-status', (status: any) => {
    if (status && typeof status === 'object') {
      updateStore.publishStatus = status
    }
  })
  onUnmounted(() => off())
})

watch(targetVersion, async (val) => {
  if (val && isValidVersion(val)) {
    const friends = await updateStore.getLowerVersionFriends(val)
    lowerVersionFriends.value = Array.isArray(friends) ? friends : []
  } else {
    lowerVersionFriends.value = []
  }
})
</script>

<style scoped>
.update-publish-view {
  padding: 24px 32px;
  width: 100%;
  height: 100%;
  overflow-y: auto;
}

.view-header h2 {
  margin: 0 0 4px;
  font-size: 20px;
  color: #333;
}

.subtitle {
  margin: 0 0 24px;
  font-size: 13px;
  color: #999;
}

.status-card {
  background: linear-gradient(135deg, rgba(7, 193, 96, 0.1) 0%, rgba(6, 173, 86, 0.05) 100%);
  border: 1px solid #07c160;
  border-radius: 12px;
  padding: 16px 20px;
  margin-bottom: 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.status-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #07c160;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.3); }
}

.status-title {
  font-weight: 600;
  color: #07c160;
}

.status-info {
  font-size: 13px;
  color: #666;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.status-info code {
  background: rgba(7, 193, 96, 0.1);
  padding: 1px 6px;
  border-radius: 4px;
  font-family: monospace;
}

.btn-stop {
  align-self: flex-start;
  padding: 6px 14px;
  border: 1px solid #f5222d;
  background: #fff;
  color: #f5222d;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.btn-stop:hover {
  background: #f5222d;
  color: #fff;
}

.publish-form {
  background: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 12px;
  padding: 20px 24px;
  margin-bottom: 24px;
}

.publish-form h3 {
  margin: 0 0 16px;
  font-size: 15px;
  color: #333;
}

.form-section {
  margin-bottom: 16px;
}

.form-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: #555;
  margin-bottom: 6px;
}

.version-input {
  display: flex;
  gap: 8px;
  align-items: center;
}

.version-input input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  font-size: 13px;
  outline: none;
  transition: all 0.2s;
}

.version-input input:focus {
  border-color: #07c160;
  box-shadow: 0 0 0 3px rgba(7, 193, 96, 0.1);
}

.version-input input.invalid {
  border-color: #f5222d;
}

.btn-link {
  padding: 6px 10px;
  background: transparent;
  border: none;
  color: #07c160;
  cursor: pointer;
  font-size: 12px;
  white-space: nowrap;
}

.btn-link:hover {
  text-decoration: underline;
}

.hint.error {
  color: #f5222d;
  font-size: 12px;
  margin-top: 4px;
}

.file-picker {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  background: #fafafa;
  border: 2px dashed #d9d9d9;
  border-radius: 8px;
  cursor: pointer;
  color: #999;
  font-size: 13px;
  transition: all 0.2s;
}

.file-picker:hover {
  border-color: #07c160;
  color: #07c160;
  background: rgba(7, 193, 96, 0.05);
}

.file-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: #f5f5f5;
  border-radius: 8px;
  border: 1px solid #e8e8e8;
}

.file-name {
  font-size: 13px;
  font-weight: 500;
  color: #333;
  word-break: break-all;
}

.file-meta {
  font-size: 11px;
  color: #999;
  margin-top: 2px;
  font-family: monospace;
}

.btn-icon {
  background: transparent;
  border: none;
  color: #999;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.btn-icon:hover {
  color: #f5222d;
  background: rgba(245, 34, 45, 0.1);
}

textarea {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  font-size: 13px;
  font-family: inherit;
  outline: none;
  resize: vertical;
  min-height: 60px;
  transition: all 0.2s;
  box-sizing: border-box;
}

textarea:focus {
  border-color: #07c160;
  box-shadow: 0 0 0 3px rgba(7, 193, 96, 0.1);
}

.char-count {
  text-align: right;
  font-size: 11px;
  color: #bbb;
  margin-top: 2px;
}

.friends-hint {
  padding: 8px 12px;
  background: rgba(7, 193, 96, 0.08);
  border-radius: 6px;
  font-size: 12px;
  color: #07c160;
  margin-bottom: 12px;
}

.friends-hint.muted {
  background: #fafafa;
  color: #999;
}

.firewall-hint {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 8px 12px;
  background: #fffbe6;
  border: 1px solid #ffe58f;
  border-radius: 6px;
  font-size: 12px;
  color: #ad6800;
  margin-bottom: 12px;
  line-height: 1.5;
}

.firewall-hint svg {
  flex-shrink: 0;
  margin-top: 1px;
  color: #faad14;
}

.form-actions {
  margin-top: 8px;
}

.btn-publish {
  width: 100%;
  padding: 10px 16px;
  background: linear-gradient(135deg, #07c160 0%, #06ad56 100%);
  border: none;
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 8px rgba(7, 193, 96, 0.3);
}

.btn-publish:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(7, 193, 96, 0.4);
}

.btn-publish:disabled {
  background: #d9d9d9;
  box-shadow: none;
  cursor: not-allowed;
}

.history-section h3 {
  margin: 0 0 12px;
  font-size: 15px;
  color: #333;
}

.empty {
  text-align: center;
  padding: 32px;
  color: #bbb;
  font-size: 13px;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.history-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 14px 18px;
  background: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 10px;
}

.history-info {
  flex: 1;
  min-width: 0;
}

.history-version {
  font-size: 14px;
  font-weight: 600;
  color: #333;
  margin-bottom: 4px;
}

.history-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: #999;
  margin-bottom: 4px;
}

.status-badge {
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
}

.status-badge.running {
  background: rgba(7, 193, 96, 0.1);
  color: #07c160;
}

.status-badge.stopped {
  background: #f5f5f5;
  color: #999;
}

.history-files {
  font-size: 12px;
  color: #666;
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 4px;
}

.history-note {
  font-size: 12px;
  color: #666;
  font-style: italic;
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px dashed #f0f0f0;
}

.history-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-left: 16px;
  flex-shrink: 0;
}

.btn-secondary {
  padding: 6px 12px;
  background: #fff;
  border: 1px solid #d9d9d9;
  color: #666;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
  white-space: nowrap;
}

.btn-secondary:hover {
  border-color: #07c160;
  color: #07c160;
}

.btn-danger {
  padding: 6px 12px;
  background: #fff;
  border: 1px solid #ffccc7;
  color: #f5222d;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
  white-space: nowrap;
}

.btn-danger:hover {
  background: #f5222d;
  color: #fff;
  border-color: #f5222d;
}
</style>
