<template>
  <div class="settings-modal" v-if="visible">
    <div class="overlay" @click="$emit('close')"></div>
    <div class="dialog">
      <div class="dialog-header">
        <h3>设置</h3>
        <button class="close-btn" @click="$emit('close')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div class="dialog-content">
        <!-- 个人资料 -->
        <section class="settings-section">
          <h4 class="section-title">个人资料</h4>
          
          <div class="setting-item avatar-setting">
            <label>头像</label>
            <div class="avatar-upload">
              <img 
                v-if="localConfig.avatar" 
                :src="localConfig.avatar" 
                alt="avatar"
                class="avatar-preview"
              />
              <div v-else class="avatar-placeholder">
                {{ getInitials(localConfig.nickname) }}
              </div>
              <button class="change-avatar-btn" @click="selectAvatar">
                更换头像
              </button>
            </div>
          </div>

          <div class="setting-item">
            <label for="nickname">昵称</label>
            <input 
              id="nickname"
              v-model="localConfig.nickname" 
              @change="saveConfig"
              placeholder="输入昵称"
              maxlength="20"
            />
          </div>

          <div class="setting-item">
            <label>Peer ID</label>
            <div class="peer-id-display">
              <code>{{ configStore.peerId }}</code>
              <button class="copy-btn" @click="copyPeerId" title="复制">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
              </button>
            </div>
          </div>
        </section>

        <!-- 存储设置 -->
        <section class="settings-section">
          <h4 class="section-title">存储设置</h4>
          
          <div class="setting-item path-setting">
            <div class="path-label-row">
              <label for="download-path">默认下载路径</label>
              <span class="path-hint">接收文件时默认保存位置</span>
            </div>
            <div class="path-input-row">
              <input 
                id="download-path"
                v-model="localConfig.downloadPath" 
                placeholder="点击右侧按钮选择目录"
                readonly
                class="path-input"
              />
              <button class="browse-btn" @click="selectDownloadPath" title="选择目录">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                浏览
              </button>
            </div>
          </div>

          <div class="setting-item path-setting">
            <div class="path-label-row">
              <label for="user-data-dir">数据目录</label>
              <span class="path-hint warning">修改后需要重启应用生效</span>
            </div>
            <div class="path-input-row">
              <input 
                id="user-data-dir"
                v-model="localConfig.userDataDir" 
                placeholder="点击右侧按钮选择目录"
                readonly
                class="path-input"
              />
              <button class="browse-btn" @click="selectUserDataDir" title="选择目录">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                浏览
              </button>
            </div>
            <p class="help-text">当前数据存储在应用配置目录中，可自定义数据存放位置</p>
          </div>

          <div class="setting-actions">
            <button class="btn-primary" @click="saveStorageConfig">保存路径设置</button>
          </div>
        </section>

        <!-- 网段扫描配置 -->
        <section class="settings-section">
          <h4 class="section-title">网段扫描配置</h4>
          
          <div class="setting-item">
            <label for="scan-segments">扫描网段（每行一个，支持 CIDR 格式）</label>
            <textarea 
              id="scan-segments"
              v-model="scanSegmentsText" 
              placeholder="例如：&#10;192.168.1.0/24&#10;192.168.31.0/24&#10;10.0.0.0/24"
              rows="5"
              maxlength="500"
            ></textarea>
            <p class="help-text">默认会扫描当前所在网段，可在此添加其他需要扫描的网段</p>
          </div>

          <div class="segment-actions">
            <button class="btn-primary" @click="saveScanSegments">保存配置</button>
            <button class="btn-secondary" @click="refreshFriends" :disabled="isRefreshing">
              {{ isRefreshing ? '刷新中...' : '刷新好友' }}
            </button>
          </div>
        </section>

        <!-- 关于 -->
        <section class="settings-section">
          <h4 class="section-title">关于</h4>
          <div class="about-info">
            <p class="app-name">鸿雁 (HongYan)</p>
            <p class="version">版本 1.0.0</p>
            <p class="description">局域网点对点即时通讯工具</p>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useConfigStore } from '../stores/config-store'
import { useFriendStore } from '../stores/friend-store'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits(['close'])

const configStore = useConfigStore()
const friendStore = useFriendStore()

interface LocalConfig {
  nickname: string
  avatar?: string
  userDataDir?: string
  downloadPath?: string
}

const localConfig = ref<LocalConfig>({
  nickname: configStore.nickname,
  avatar: configStore.avatar,
  userDataDir: '',
  downloadPath: ''
})

const scanSegmentsText = ref('')
const isRefreshing = ref(false)

onMounted(async () => {
  const config = await window.electronAPI.invoke('config:get')
  if (config) {
    configStore.setConfig(config)
    localConfig.value = {
      nickname: config.nickname,
      avatar: config.avatar,
      userDataDir: config.userDataDir || '',
      downloadPath: config.downloadPath || ''
    }
    
    // 如果没有设置下载路径，使用默认的 Downloads 目录
    if (!localConfig.value.downloadPath) {
      const homeDir = await window.electronAPI.invoke('get:home-dir')
      localConfig.value.downloadPath = `${homeDir}\\Downloads`
    }
    
    // 如果没有设置 userDataDir，显示当前使用的目录
    if (!localConfig.value.userDataDir) {
      const homeDir = await window.electronAPI.invoke('get:home-dir')
      localConfig.value.userDataDir = `${homeDir}\\AppData\\Roaming\\HongYan`
    }
    
    // 加载网段配置
    if (config.scanSegments && Array.isArray(config.scanSegments)) {
      scanSegmentsText.value = config.scanSegments.join('\n')
    }
  }
})

async function saveConfig() {
  await window.electronAPI.invoke('config:set', {
    peerId: configStore.peerId,
    nickname: localConfig.value.nickname,
    avatar: localConfig.value.avatar,
    userDataDir: localConfig.value.userDataDir,
    downloadPath: localConfig.value.downloadPath
  })
  configStore.nickname = localConfig.value.nickname
  configStore.avatar = localConfig.value.avatar
}

async function selectAvatar() {
  try {
    // 选择图片文件
    const filePath = await window.electronAPI.invoke('avatar:select') as string | undefined
    if (!filePath) return

    // 将图片转换为 base64
    const base64Image = await window.electronAPI.invoke('avatar:save', filePath) as string
    
    // 更新本地配置和 store
    localConfig.value.avatar = base64Image
    configStore.avatar = base64Image

    // 保存到配置文件
    await saveConfig()
  } catch (err) {
    console.error('Failed to select avatar:', err)
    alert('选择头像失败')
  }
}

async function copyPeerId() {
  try {
    await navigator.clipboard.writeText(configStore.peerId)
    // 可以添加toast提示
  } catch (err) {
    console.error('Failed to copy:', err)
  }
}

async function selectDownloadPath() {
  try {
    const dirPath = await window.electronAPI.invoke('dialog:select-directory', '选择默认下载路径') as string | undefined
    if (dirPath) {
      localConfig.value.downloadPath = dirPath
    }
  } catch (err) {
    console.error('Failed to select directory:', err)
  }
}

async function selectUserDataDir() {
  try {
    const dirPath = await window.electronAPI.invoke('dialog:select-directory', '选择数据存储目录') as string | undefined
    if (dirPath) {
      localConfig.value.userDataDir = dirPath
    }
  } catch (err) {
    console.error('Failed to select directory:', err)
  }
}

async function saveStorageConfig() {
  try {
    const config = await window.electronAPI.invoke('config:get')
    const newConfig = {
      ...config,
      userDataDir: localConfig.value.userDataDir,
      downloadPath: localConfig.value.downloadPath
    }
    await window.electronAPI.invoke('config:set', newConfig)
    // 更新 configStore 使设置立即生效
    configStore.downloadPath = localConfig.value.downloadPath
    configStore.userDataDir = localConfig.value.userDataDir

    // 检查是否修改了 userDataDir
    const oldUserDataDir = config.userDataDir || ''
    const newUserDataDir = localConfig.value.userDataDir || ''
    const userDataDirChanged = oldUserDataDir !== newUserDataDir

    if (userDataDirChanged) {
      // 提示用户重启应用
      const confirmed = confirm('数据目录已修改，需要重启应用才能生效。是否立即重启？')
      if (confirmed) {
        await window.electronAPI.invoke('app:restart')
        return
      }
    } else {
      alert('路径设置已保存')
    }
  } catch (err) {
    console.error('Failed to save storage config:', err)
    alert('保存失败')
  }
}

async function saveScanSegments() {
  try {
    // 解析网段文本，每行一个
    const segments = scanSegmentsText.value
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.length > 0)

    // 保存到配置
    const config = await window.electronAPI.invoke('config:get')
    await window.electronAPI.invoke('config:set', {
      ...config,
      scanSegments: segments
    })

    alert('网段配置已保存')
  } catch (err) {
    console.error('Failed to save scan segments:', err)
    alert('保存失败')
  }
}

async function refreshFriends() {
  isRefreshing.value = true
  try {
    // 触发主动扫描
    await window.electronAPI.invoke('friend:scan')
    // 等待一下让扫描完成
    await new Promise(resolve => setTimeout(resolve, 2000))
    // 重新加载好友列表
    const friends = await window.electronAPI.invoke('friend:list')
    if (Array.isArray(friends)) {
      friendStore.updateFriends(friends)
    }
    alert('刷新完成')
  } catch (err) {
    console.error('Failed to refresh friends:', err)
    alert('刷新失败')
  } finally {
    isRefreshing.value = false
  }
}

function getInitials(name: string): string {
  if (!name) return '?'
  const parts = name.split(/[\s_-]+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return name[0].toUpperCase()
}
</script>

<style scoped>
.settings-modal {
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
  width: 520px;
  max-height: 85vh;
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

.settings-section {
  margin-bottom: 28px;
}

.settings-section:last-child {
  margin-bottom: 0;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: #666;
  margin: 0 0 16px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.setting-item {
  margin-bottom: 16px;
}

.setting-item label {
  display: block;
  font-size: 13px;
  color: #666;
  margin-bottom: 8px;
}

.setting-item input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  font-size: 14px;
  transition: border-color 0.2s;
}

.setting-item input:focus {
  outline: none;
  border-color: #07c160;
}

.help-text {
  font-size: 12px;
  color: #999;
  margin-top: 6px;
  margin-bottom: 0;
}

/* 头像设置 */
.avatar-setting label {
  margin-bottom: 12px;
}

.avatar-upload {
  display: flex;
  align-items: center;
  gap: 16px;
}

.avatar-preview,
.avatar-placeholder {
  width: 64px;
  height: 64px;
  border-radius: 12px;
  object-fit: cover;
}

.avatar-placeholder {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: 600;
}

.change-avatar-btn {
  padding: 8px 16px;
  border: 1px solid #07c160;
  border-radius: 6px;
  background: #fff;
  color: #07c160;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.change-avatar-btn:hover {
  background: #e8f5e9;
}

/* Peer ID 显示 */
.peer-id-display {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: #f5f5f5;
  border-radius: 6px;
}

.peer-id-display code {
  flex: 1;
  font-size: 12px;
  color: #666;
  word-break: break-all;
  font-family: 'Courier New', monospace;
}

.copy-btn {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #999;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.copy-btn:hover {
  background: #e8e8e8;
  color: #333;
}

/* 路径设置 */
.path-setting {
  margin-bottom: 20px;
}

.path-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.path-label-row label {
  margin-bottom: 0;
}

.path-hint {
  font-size: 11px;
  color: #999;
}

.path-hint.warning {
  color: #fa8c16;
}

.path-input-row {
  display: flex;
  gap: 8px;
}

.path-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  font-size: 13px;
  background: #fafafa;
  color: #666;
  cursor: pointer;
}

.path-input:focus {
  border-color: #07c160;
  background: #fff;
}

.browse-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  background: #fff;
  color: #666;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
}

.browse-btn:hover {
  border-color: #07c160;
  color: #07c160;
}

.setting-actions {
  margin-top: 16px;
}

/* 关于信息 */
.about-info {
  text-align: center;
  padding: 20px;
}

.app-name {
  font-size: 18px;
  font-weight: 600;
  color: #333;
  margin-bottom: 8px;
}

.version {
  font-size: 13px;
  color: #999;
  margin-bottom: 8px;
}

.description {
  font-size: 13px;
  color: #666;
  margin: 0;
}

/* 网段配置样式 */
#scan-segments {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  font-size: 13px;
  font-family: 'Consolas', 'Monaco', monospace;
  resize: vertical;
  outline: none;
  transition: border-color 0.2s;
}

#scan-segments:focus {
  border-color: #07c160;
}

.segment-actions {
  display: flex;
  gap: 12px;
  margin-top: 12px;
}

.btn-primary,
.btn-secondary {
  padding: 8px 20px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  border: none;
  background: #07c160;
  color: #fff;
}

.btn-primary:hover:not(:disabled) {
  background: #06ad56;
}

.btn-secondary {
  border: 1px solid #d9d9d9;
  background: #fff;
  color: #666;
}

.btn-secondary:hover:not(:disabled) {
  border-color: #07c160;
  color: #07c160;
}

.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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
