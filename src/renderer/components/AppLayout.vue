<template>
  <div class="app-layout">
    <!-- 左侧导航栏 -->
    <aside class="sidebar-nav">
      <div class="nav-header">
        <div class="user-avatar" @click="showSettings = true">
          <img v-if="configStore.avatar" :src="configStore.avatar" alt="avatar" />
          <div v-else class="avatar-placeholder">{{ getInitials(configStore.nickname) }}</div>
        </div>
      </div>
      <nav class="nav-menu">
        <button 
          class="nav-item" 
          :class="{ active: currentView === 'chat' }"
          title="聊天"
          @click="currentView = 'chat'"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </button>
        <button 
          class="nav-item" 
          :class="{ active: currentView === 'contacts' }"
          title="联系人"
          @click="currentView = 'contacts'"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
        </button>
        <button 
          class="nav-item" 
          title="文件传输"
          @click="showTransfers = true"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
            <polyline points="13 2 13 9 20 9"/>
          </svg>
        </button>
      </nav>
      <div class="nav-footer">
        <button class="nav-item" title="设置" @click="showSettings = true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
      </div>
    </aside>

    <!-- 好友列表区域 -->
    <div class="friend-sidebar" v-if="currentView === 'chat'">
      <div class="sidebar-header">
        <div class="search-box">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.35-4.35"/>
          </svg>
          <input 
            type="text" 
            placeholder="搜索好友" 
            v-model="searchQuery"
          />
        </div>
        <button class="scan-btn" @click="showScanConfig = true" title="扫描配置">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
          </svg>
          <span>扫描配置</span>
        </button>
      </div>
      <FriendList 
        :friends="filteredFriends"
        :selectedPeerId="friendStore.selectedPeerId"
        @selectFriend="handleSelectFriend"
      />
    </div>

    <!-- 主聊天区域 -->
    <main class="main-content">
      <ChatView
        v-if="currentView === 'chat'"
        @sendText="handleSendText"
        @sendImage="handleSendImage"
        @sendFile="handleSendFile"
        @viewImage="handleViewImage"
        @openContacts="switchToContacts"
      />
      <ContactsView 
        v-else-if="currentView === 'contacts'"
        @openChat="switchToChat"
      />
    </main>

    <!-- 模态框 -->
    <SettingsView :visible="showSettings" @close="showSettings = false" />
    <FileTransferProgress :visible="showTransfers" @close="showTransfers = false" />
    <ImageViewer 
      :visible="showImageViewer" 
      :imageData="currentImageData" 
      @close="showImageViewer = false" 
    />

    <!-- 通知提示 -->
    <NotificationToast ref="notificationRef" />

    <!-- 网段扫描配置对话框 -->
    <div v-if="showScanConfig" class="modal-overlay" @click.self="closeScanConfig">
      <div class="scan-config-dialog">
        <div class="dialog-header">
          <h3>网段扫描配置</h3>
          <button class="close-btn" @click="closeScanConfig">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="dialog-body">
          <div class="config-info">
            <p class="info-text">配置需要扫描的网段，系统会自动扫描当前所在网段</p>
          </div>
          <div class="segment-input">
            <label>额外扫描网段（每行一个，支持 CIDR 格式）</label>
            <textarea 
              v-model="scanSegmentsText" 
              placeholder="例如：&#10;192.168.1.0/24&#10;192.168.31.0/24&#10;10.0.0.0/24"
              rows="5"
              maxlength="500"
            ></textarea>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="btn-cancel" @click="closeScanConfig">取消</button>
          <button class="btn-save" @click="saveAndScan">保存并刷新</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useFriendStore } from '../stores/friend-store'
import { useChatStore } from '../stores/chat-store'
import { useTransferStore } from '../stores/transfer-store'
import { useConfigStore } from '../stores/config-store'
import FriendList from './FriendList.vue'
import ChatView from './ChatView.vue'
import ContactsView from './ContactsView.vue'
import SettingsView from './SettingsView.vue'
import FileTransferProgress from './FileTransferProgress.vue'
import ImageViewer from './ImageViewer.vue'
import NotificationToast from './NotificationToast.vue'

const friendStore = useFriendStore()
const chatStore = useChatStore()
const transferStore = useTransferStore()
const configStore = useConfigStore()

const notificationRef = ref<any>(null)

const currentView = ref<'chat' | 'contacts'>('chat')
const showSettings = ref(false)
const showTransfers = ref(false)
const showImageViewer = ref(false)
const showScanConfig = ref(false)
const currentImageData = ref('')
const searchQuery = ref('')
const scanSegmentsText = ref('')

const cleanups: (() => void)[] = []

const filteredFriends = computed(() => {
  if (!searchQuery.value) return friendStore.friends
  const query = searchQuery.value.toLowerCase()
  return friendStore.friends.filter(f => 
    f.nickname.toLowerCase().includes(query) || 
    f.remark?.toLowerCase().includes(query) ||
    f.ip.includes(query)
  )
})

onMounted(async () => {
  const friends = await window.electronAPI.invoke('friend:list')
  if (Array.isArray(friends)) {
    friendStore.updateFriends(friends)
  }

  const config = await window.electronAPI.invoke('config:get')
  if (config) {
    configStore.setConfig(config)
    // 加载网段配置
    if (config.scanSegments && Array.isArray(config.scanSegments)) {
      scanSegmentsText.value = config.scanSegments.join('\n')
    }
  }

  cleanups.push(
    window.electronAPI.on('friend:online', (friend: any) => {
      friendStore.addOrUpdateFriend(friend)
    })
  )
  cleanups.push(
    window.electronAPI.on('friend:offline', (peerId: string) => {
      friendStore.setOffline(peerId)
    })
  )
  cleanups.push(
    window.electronAPI.on('message:received', async (msg: any) => {
      const peerId = msg.peerId || msg.fromPeerId
      if (peerId === chatStore.currentPeerId) {
        const records = await window.electronAPI.invoke('chat:load-history', peerId)
        chatStore.setMessages(peerId, records || [])
      }
    })
  )
  cleanups.push(
    window.electronAPI.on('message:status-updated', (data: any) => {
      chatStore.updateMessageStatus(data.messageId, data.status)
    })
  )
  cleanups.push(
    window.electronAPI.on('file:progress', (data: any) => {
      transferStore.updateProgress(data.transferId, data.progress)
    })
  )
  cleanups.push(
    window.electronAPI.on('file:transfer-request', (req: any) => {
      transferStore.addTransfer(req)
      showTransfers.value = true
    })
  )
  cleanups.push(
    window.electronAPI.on('file:completed', (data: any) => {
      transferStore.updateStatus(data.transferId, 'completed')
    })
  )
  cleanups.push(
    window.electronAPI.on('file:failed', (data: any) => {
      transferStore.updateStatus(data.transferId, 'failed')
    })
  )

  watchSelectedFriend()
})

onUnmounted(() => {
  cleanups.forEach((fn) => fn())
})

async function watchSelectedFriend() {
  const { watch } = await import('vue')
  watch(
    () => friendStore.selectedPeerId,
    async (peerId) => {
      if (peerId) {
        const records = await window.electronAPI.invoke('chat:load-history', peerId)
        chatStore.setMessages(peerId, records || [])
      } else {
        chatStore.clearMessages()
      }
    }
  )
}

function handleSelectFriend(peerId: string) {
  friendStore.selectFriend(peerId)
}

async function handleSendText(content: string) {
  const peerId = chatStore.currentPeerId
  if (!peerId) return
  const result = await window.electronAPI.invoke('message:send-text', peerId, content)
  if (result?.error) {
    alert(result.error)
  } else if (result) {
    const records = await window.electronAPI.invoke('chat:load-history', peerId)
    chatStore.setMessages(peerId, records || [])
  }
}

async function handleSendImage(filePath: string) {
  const peerId = chatStore.currentPeerId
  if (!peerId) return
  const result = await window.electronAPI.invoke('message:send-image', peerId, filePath)
  if (result) {
    const records = await window.electronAPI.invoke('chat:load-history', peerId)
    chatStore.setMessages(peerId, records || [])
  }
}

async function handleSendFile(filePath: string) {
  const peerId = chatStore.currentPeerId
  if (!peerId) return
  await window.electronAPI.invoke('file:send', peerId, filePath)
  showTransfers.value = true
}

function handleViewImage(imageData: string) {
  currentImageData.value = imageData
  showImageViewer.value = true
}

function switchToChat() {
  currentView.value = 'chat'
}

function switchToContacts() {
  currentView.value = 'contacts'
}

function closeScanConfig() {
  showScanConfig.value = false
}

async function saveAndScan() {
  try {
    // 解析网段文本
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

    // 触发扫描
    await window.electronAPI.invoke('friend:scan')
    
    // 等待扫描完成
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // 重新加载好友列表
    const loadedFriends = await window.electronAPI.invoke('friend:list')
    if (Array.isArray(loadedFriends)) {
      friendStore.updateFriends(loadedFriends)
    }

    closeScanConfig()
    alert('刷新完成')
  } catch (err) {
    console.error('Failed to save and scan:', err)
    alert('操作失败')
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
.app-layout {
  width: 100%;
  height: 100%;
  display: flex;
  background: #f5f5f5;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

/* 左侧导航栏 */
.sidebar-nav {
  width: 60px;
  background: #2e2e2e;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 0;
  flex-shrink: 0;
}

.nav-header {
  margin-bottom: 20px;
}

.user-avatar {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.2s;
}

.user-avatar:hover {
  transform: scale(1.05);
}

.user-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-placeholder {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
}

.nav-menu {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.nav-item {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #999;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.nav-item.active {
  background: #07c160;
  color: #fff;
}

.nav-footer {
  margin-top: auto;
}

/* 好友侧边栏 */
.friend-sidebar {
  width: 280px;
  background: #fff;
  border-right: 1px solid #e8e8e8;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.sidebar-header {
  padding: 12px;
  border-bottom: 1px solid #e8e8e8;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #f5f5f5;
  border-radius: 6px;
  margin-bottom: 8px;
}

.search-box svg {
  color: #999;
  flex-shrink: 0;
}

.search-box input {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-size: 13px;
  color: #333;
}

.search-box input::placeholder {
  color: #bbb;
}

.scan-btn {
  width: 100%;
  padding: 8px;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  background: #fff;
  color: #666;
  cursor: pointer;
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.2s;
}

.scan-btn:hover {
  border-color: #07c160;
  color: #07c160;
}

/* 主内容区域 */
.main-content {
  flex: 1;
  display: flex;
  min-width: 0;
  background: #f5f5f5;
}

.placeholder-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #999;
}

.placeholder-icon {
  margin-bottom: 16px;
  opacity: 0.3;
}

.placeholder-view p {
  font-size: 14px;
}

/* 网段扫描配置对话框 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.scan-config-dialog {
  background: #fff;
  border-radius: 12px;
  width: 90%;
  max-width: 500px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #e8e8e8;
}

.dialog-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.close-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #666;
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

.dialog-body {
  padding: 20px;
}

.config-info {
  margin-bottom: 16px;
}

.info-text {
  font-size: 13px;
  color: #666;
  margin: 0;
}

.segment-input label {
  display: block;
  font-size: 13px;
  color: #333;
  margin-bottom: 8px;
  font-weight: 500;
}

.segment-input textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  font-size: 13px;
  font-family: 'Courier New', monospace;
  resize: vertical;
  outline: none;
  transition: border-color 0.2s;
}

.segment-input textarea:focus {
  border-color: #07c160;
}

.dialog-footer {
  padding: 12px 20px;
  border-top: 1px solid #e8e8e8;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.btn-cancel,
.btn-save {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel {
  background: #f5f5f5;
  color: #666;
}

.btn-cancel:hover {
  background: #e8e8e8;
}

.btn-save {
  background: #07c160;
  color: white;
}

.btn-save:hover {
  background: #06ad56;
}
</style>
