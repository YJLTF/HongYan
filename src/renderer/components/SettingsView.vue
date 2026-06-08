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

      <div class="dialog-body">
        <!-- 左侧纵向 tab 导航 -->
        <nav class="tab-nav">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            class="tab-item"
            :class="{ active: activeTab === tab.key }"
            @click="activeTab = tab.key"
          >
            <span class="tab-icon" v-html="tab.icon"></span>
            <span class="tab-label">{{ tab.label }}</span>
            <span v-if="tab.badge" class="tab-badge">V1.3.0</span>
          </button>
        </nav>

        <!-- 右侧内容区 -->
        <div class="tab-content">
          <!-- 个人 -->
          <section v-show="activeTab === 'profile'" class="settings-section">
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

          <!-- 提醒 -->
          <section v-show="activeTab === 'notifications'" class="settings-section">
            <h4 class="section-title">消息提醒</h4>

            <div class="setting-item toggle-item">
              <div class="toggle-label">
                <label>关闭按钮最小化到托盘</label>
                <span class="path-hint">关闭主窗口时隐藏到系统托盘，不退出进程</span>
              </div>
              <label class="switch">
                <input type="checkbox" v-model="localConfig.closeToTray" />
                <span class="slider"></span>
              </label>
            </div>

            <div class="setting-item toggle-item">
              <div class="toggle-label">
                <label>启用 Windows 横幅通知</label>
                <span class="path-hint">收到消息时弹出系统通知</span>
              </div>
              <label class="switch">
                <input type="checkbox" v-model="localConfig.enableNotifications" />
                <span class="slider"></span>
              </label>
            </div>

            <div class="setting-item toggle-item">
              <div class="toggle-label">
                <label>启用任务栏闪烁</label>
                <span class="path-hint">窗口未聚焦时让任务栏图标闪烁</span>
              </div>
              <label class="switch">
                <input type="checkbox" v-model="localConfig.enableTaskbarFlash" />
                <span class="slider"></span>
              </label>
            </div>

            <div class="setting-item toggle-item">
              <div class="toggle-label">
                <label>启用托盘图标闪烁</label>
                <span class="path-hint">收到消息时让托盘图标闪烁</span>
              </div>
              <label class="switch">
                <input type="checkbox" v-model="localConfig.enableTrayFlash" />
                <span class="slider"></span>
              </label>
            </div>

            <div class="setting-item toggle-item">
              <div class="toggle-label">
                <label>免打扰时段</label>
                <span class="path-hint">该时段内不弹横幅、不闪烁，仅记录消息</span>
              </div>
              <label class="switch">
                <input type="checkbox" v-model="localConfig.dndEnabled" />
                <span class="slider"></span>
              </label>
            </div>

            <div v-if="localConfig.dndEnabled" class="setting-item dnd-box">
              <div class="dnd-row">
                <div class="dnd-field">
                  <label>开始</label>
                  <input type="time" v-model="localConfig.dndStart" />
                </div>
                <div class="dnd-field">
                  <label>结束</label>
                  <input type="time" v-model="localConfig.dndEnd" />
                </div>
              </div>
              <p class="help-text">支持跨午夜（如 22:00 → 08:00）</p>
            </div>

            <div class="setting-actions">
              <button class="btn-primary" @click="saveNotificationConfig">保存提醒设置</button>
            </div>
          </section>

          <!-- 存储 -->
          <section v-show="activeTab === 'storage'" class="settings-section">
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

          <!-- 网络 -->
          <section v-show="activeTab === 'network'" class="settings-section">
            <h4 class="section-title">网段扫描</h4>

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

            <h4 class="section-title section-title-divider">UDP 广播</h4>

            <div class="setting-item">
              <label for="heartbeat-interval">低频心跳间隔</label>
              <div class="select-wrapper">
                <select
                  id="heartbeat-interval"
                  v-model="heartbeatPreset"
                  @change="onHeartbeatPresetChange"
                  class="select-input"
                >
                  <option value="0">关闭（仅靠事件 + TCP 连接状态）</option>
                  <option value="30000">30 秒（最快响应）</option>
                  <option value="60000">60 秒（推荐）</option>
                  <option value="120000">2 分钟</option>
                  <option value="300000">5 分钟（最省流量）</option>
                </select>
                <svg
                  class="select-chevron"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
              <p class="help-text">心跳仅作为"对方静默崩溃"的兜底检测；正常情况仅在上线/下线/资料变更时广播</p>
            </div>
          </section>

          <!-- 关于 -->
          <section v-show="activeTab === 'about'" class="settings-section">
            <h4 class="section-title">关于</h4>
            <div class="about-info">
              <div class="about-logo">
                <img
                  v-if="localConfig.avatar"
                  :src="localConfig.avatar"
                  alt="logo"
                  class="about-logo-img"
                />
                <div v-else class="about-logo-placeholder">
                  {{ getInitials(localConfig.nickname) }}
                </div>
              </div>
              <p class="app-name">鸿雁 (HongYan)</p>
              <p class="version">版本 {{ appVersion }}</p>
              <p class="description">局域网点对点即时通讯工具</p>
              <div class="about-divider"></div>
              <p class="copyright">Copyright © 2026 HongYan</p>
            </div>
          </section>
        </div>
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
  closeToTray: boolean
  enableNotifications: boolean
  enableTaskbarFlash: boolean
  enableTrayFlash: boolean
  dndEnabled: boolean
  dndStart: string
  dndEnd: string
}

const localConfig = ref<LocalConfig>({
  nickname: configStore.nickname,
  avatar: configStore.avatar,
  userDataDir: '',
  downloadPath: '',
  closeToTray: configStore.closeToTray,
  enableNotifications: configStore.enableNotifications,
  enableTaskbarFlash: configStore.enableTaskbarFlash,
  enableTrayFlash: configStore.enableTrayFlash,
  dndEnabled: configStore.dndEnabled,
  dndStart: configStore.dndStart,
  dndEnd: configStore.dndEnd,
})

type TabKey = 'profile' | 'notifications' | 'storage' | 'network' | 'about'

const activeTab = ref<TabKey>('profile')

// 内联 SVG 图标（heroicons-style，stroke-width=2）
const tabs: { key: TabKey; label: string; icon: string; badge?: boolean }[] = [
  {
    key: 'profile',
    label: '个人',
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  },
  {
    key: 'notifications',
    label: '提醒',
    badge: true,
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
  },
  {
    key: 'storage',
    label: '存储',
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
  },
  {
    key: 'network',
    label: '网络',
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
  },
  {
    key: 'about',
    label: '关于',
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  },
]

const scanSegmentsText = ref('')
const isRefreshing = ref(false)
const appVersion = ref('—')
// V1.2.0: 心跳间隔预设（字符串键方便 v-model 绑定）
const heartbeatPreset = ref('60000')

onMounted(async () => {
  const config = await window.electronAPI.invoke('config:get')
  if (config) {
    configStore.setConfig(config)
    localConfig.value = {
      nickname: config.nickname,
      avatar: config.avatar,
      userDataDir: config.userDataDir || '',
      downloadPath: config.downloadPath || '',
      closeToTray: config.closeToTray !== false,
      enableNotifications: config.enableNotifications !== false,
      enableTaskbarFlash: config.enableTaskbarFlash !== false,
      enableTrayFlash: config.enableTrayFlash !== false,
      dndEnabled: config.dndEnabled === true,
      dndStart: config.dndStart || '22:00',
      dndEnd: config.dndEnd || '08:00',
    }

    // 如果没有设置下载路径，使用默认的 Downloads 目录
    if (!localConfig.value.downloadPath) {
      const homeDir = await window.electronAPI.invoke('get:home-dir')
      localConfig.value.downloadPath = `${homeDir}\\Downloads`
    }

    // 如果没有设置 userDataDir，显示当前实际使用的目录（受 HONGYAN_DATA_DIR 环境变量影响）
    if (!localConfig.value.userDataDir) {
      localConfig.value.userDataDir = await window.electronAPI.invoke('app:get-data-dir')
    }

    // 加载网段配置
    if (config.scanSegments && Array.isArray(config.scanSegments)) {
      scanSegmentsText.value = config.scanSegments.join('\n')
    }
  }

  try {
    const version = await window.electronAPI.invoke('app:get-version')
    if (typeof version === 'string' && version.length > 0) {
      appVersion.value = version
    }
  } catch (err) {
    console.error('Failed to get app version:', err)
  }

  // V1.2.0: 加载心跳配置
  heartbeatPreset.value = String(config?.heartbeatIntervalMs ?? 60000)
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

async function saveNotificationConfig() {
  try {
    const config = await window.electronAPI.invoke('config:get')
    const newConfig = {
      ...config,
      closeToTray: localConfig.value.closeToTray,
      enableNotifications: localConfig.value.enableNotifications,
      enableTaskbarFlash: localConfig.value.enableTaskbarFlash,
      enableTrayFlash: localConfig.value.enableTrayFlash,
      dndEnabled: localConfig.value.dndEnabled,
      dndStart: localConfig.value.dndStart,
      dndEnd: localConfig.value.dndEnd,
    }
    await window.electronAPI.invoke('config:set', newConfig)
    configStore.closeToTray = localConfig.value.closeToTray
    configStore.enableNotifications = localConfig.value.enableNotifications
    configStore.enableTaskbarFlash = localConfig.value.enableTaskbarFlash
    configStore.enableTrayFlash = localConfig.value.enableTrayFlash
    configStore.dndEnabled = localConfig.value.dndEnabled
    configStore.dndStart = localConfig.value.dndStart
    configStore.dndEnd = localConfig.value.dndEnd
    alert('提醒设置已保存')
  } catch (err) {
    console.error('Failed to save notification config:', err)
    alert('保存失败')
  }
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

// V1.2.0: 心跳配置变更时持久化
async function onHeartbeatPresetChange() {
  const newVal = Number(heartbeatPreset.value)
  try {
    const config = await window.electronAPI.invoke('config:get')
    await window.electronAPI.invoke('config:set', {
      ...config,
      heartbeatIntervalMs: newVal,
    })
  } catch (err) {
    console.error('Failed to save heartbeat config:', err)
    alert('保存失败')
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
  width: 720px;
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
  flex-shrink: 0;
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

/* 主体：左 tab + 右内容 */
.dialog-body {
  display: flex;
  flex: 1;
  min-height: 0;
}

/* 左侧纵向 tab 导航 */
.tab-nav {
  width: 160px;
  flex-shrink: 0;
  background: #fafafa;
  border-right: 1px solid #e8e8e8;
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
}

.tab-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: none;
  background: transparent;
  border-radius: 8px;
  color: #666;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s, color 0.15s;
  position: relative;
}

.tab-item:hover {
  background: rgba(7, 193, 96, 0.06);
  color: #333;
}

.tab-item.active {
  background: #fff;
  color: #07c160;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.tab-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 18px;
  background: #07c160;
  border-radius: 0 2px 2px 0;
}

.tab-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: inherit;
}

.tab-label {
  flex: 1;
  min-width: 0;
}

.tab-badge {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 600;
  color: #07c160;
  background: rgba(7, 193, 96, 0.12);
  padding: 2px 6px;
  border-radius: 4px;
  letter-spacing: 0.3px;
}

/* 右侧内容区 */
.tab-content {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 24px 28px;
}

.settings-section {
  margin-bottom: 0;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: #999;
  margin: 0 0 18px;
  text-transform: uppercase;
  letter-spacing: 0.6px;
}

.section-title-divider {
  margin-top: 32px;
  padding-top: 20px;
  border-top: 1px solid #f0f0f0;
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

/* 开关样式 (V1.3.0) */
.toggle-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 0;
}

.toggle-label {
  flex: 1;
  min-width: 0;
}

.toggle-label label {
  margin-bottom: 4px;
  color: #333;
  font-size: 14px;
  font-weight: 500;
}

.toggle-label .path-hint {
  display: block;
  font-size: 12px;
  color: #999;
  margin-top: 2px;
}

.switch {
  position: relative;
  display: inline-block;
  width: 42px;
  height: 24px;
  flex-shrink: 0;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.switch .slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #d9d9d9;
  border-radius: 12px;
  transition: background-color 0.2s;
}

.switch .slider::before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background-color: #fff;
  border-radius: 50%;
  transition: transform 0.2s;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
}

.switch input:checked + .slider {
  background-color: #07c160;
}

.switch input:checked + .slider::before {
  transform: translateX(18px);
}

.dnd-row {
  display: flex;
  gap: 12px;
}

.dnd-field {
  flex: 1;
}

.dnd-field input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  font-size: 13px;
}

.dnd-field input:focus {
  outline: none;
  border-color: #07c160;
}

.dnd-box {
  margin-left: 12px;
  padding: 12px 14px;
  background: #fafafa;
  border-radius: 8px;
  border-left: 3px solid #07c160;
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
  padding: 32px 20px;
}

.about-logo {
  margin-bottom: 16px;
}

.about-logo-img,
.about-logo-placeholder {
  width: 80px;
  height: 80px;
  border-radius: 18px;
  margin: 0 auto;
  object-fit: cover;
  display: block;
}

.about-logo-placeholder {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  font-size: 32px;
  font-weight: 600;
  line-height: 80px;
}

.app-name {
  font-size: 20px;
  font-weight: 600;
  color: #333;
  margin: 0 0 6px;
}

.version {
  font-size: 13px;
  color: #999;
  margin: 0 0 12px;
}

.description {
  font-size: 13px;
  color: #666;
  margin: 0;
}

.about-divider {
  height: 1px;
  background: #f0f0f0;
  margin: 24px auto;
  width: 60%;
}

.copyright {
  font-size: 12px;
  color: #bbb;
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

/* V1.2.0: 自定义 select 包装 (匹配搜索框/输入框的现代风格) */
.select-wrapper {
  position: relative;
  width: 100%;
}

.select-input {
  width: 100%;
  padding: 10px 38px 10px 14px;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  color: #333;
  background: #fff;
  cursor: pointer;
  outline: none;
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
  /* 防止某些浏览器把首行 option 折叠时高度变化 */
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
}

.select-input:hover {
  border-color: #07c160;
  background: #fafafa;
}

.select-input:focus,
.select-input:focus-visible {
  border-color: #07c160;
  background: #fff;
  box-shadow: 0 0 0 4px rgba(7, 193, 96, 0.12);
}

.select-input:disabled {
  background: #f5f5f5;
  color: #999;
  cursor: not-allowed;
  border-color: #e8e8e8;
  box-shadow: none;
}

.select-chevron {
  position: absolute;
  right: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: #999;
  pointer-events: none;
  transition: color 0.2s ease, transform 0.2s ease;
}

.select-wrapper:hover .select-chevron {
  color: #07c160;
}

.select-input:focus ~ .select-chevron {
  color: #07c160;
}

/* V1.2.0: 尝试美化下拉打开的 option 面板 (受限于浏览器，但能好看一点) */
.select-input option {
  padding: 8px 12px;
  background: #fff;
  color: #333;
}

.select-input option:checked {
  background: linear-gradient(0deg, rgba(7, 193, 96, 0.08) 0%, rgba(7, 193, 96, 0.08) 100%), #fff;
  color: #07c160;
  font-weight: 500;
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
.tab-content::-webkit-scrollbar,
.tab-nav::-webkit-scrollbar {
  width: 6px;
}

.tab-content::-webkit-scrollbar-track,
.tab-nav::-webkit-scrollbar-track {
  background: transparent;
}

.tab-content::-webkit-scrollbar-thumb,
.tab-nav::-webkit-scrollbar-thumb {
  background: #ddd;
  border-radius: 3px;
}

.tab-content::-webkit-scrollbar-thumb:hover,
.tab-nav::-webkit-scrollbar-thumb:hover {
  background: #ccc;
}
</style>
