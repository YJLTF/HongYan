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
          :class="{ active: currentView === 'transfers' }"
          title="文件传输"
          @click="currentView = 'transfers'"
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
        <div class="sidebar-actions">
          <button class="icon-btn" @click="handleRefreshFriends" title="刷新好友" :disabled="isRefreshing">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="23 4 23 10 17 10"/>
              <polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            <span>{{ isRefreshing ? '刷新中...' : '刷新' }}</span>
          </button>
          <button class="icon-btn" @click="showScanConfig = true" title="扫描配置">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
            </svg>
            <span>扫描</span>
          </button>
        </div>
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
      <FileTransferView v-else-if="currentView === 'transfers'" />
    </main>

    <!-- 模态框 -->
    <SettingsView :visible="showSettings" @close="showSettings = false" />
    <ImageViewer 
      :visible="showImageViewer" 
      :imageData="currentImageData" 
      @close="showImageViewer = false" 
    />

    <!-- 通知提示 -->
    <NotificationToast ref="notificationRef" />

    <!-- 网段扫描配置面板 -->
    <div v-if="showScanConfig" class="modal-overlay" @click.self="showScanConfig = false">
      <ScanConfigPanel 
        @close="showScanConfig = false"
        @refreshed="handleFriendsRefreshed"
      />
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
import FileTransferView from './FileTransferView.vue'
import ImageViewer from './ImageViewer.vue'
import NotificationToast from './NotificationToast.vue'
import ScanConfigPanel from './ScanConfigPanel.vue'

const friendStore = useFriendStore()
const chatStore = useChatStore()
const transferStore = useTransferStore()
const configStore = useConfigStore()

const notificationRef = ref<any>(null)

const currentView = ref<'chat' | 'contacts' | 'transfers'>('chat')
const showSettings = ref(false)
const showImageViewer = ref(false)
const showScanConfig = ref(false)
const currentImageData = ref('')
const searchQuery = ref('')
const isRefreshing = ref(false)

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
  }

  try {
    const transfers = await window.electronAPI.invoke('file:list-transfers')
    if (Array.isArray(transfers)) {
      transferStore.setTransfers(transfers)
    }
  } catch (_) {}

  cleanups.push(
    window.electronAPI.on('friend:online', (friend: any) => {
      friendStore.addOrUpdateFriend(friend)
    })
  )
  cleanups.push(
    window.electronAPI.on('friend:updated', (friend: any) => {
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
    window.electronAPI.on('file:updated', (record: any) => {
      transferStore.addOrUpdateTransfer(record)
    })
  )
  cleanups.push(
    window.electronAPI.on('file:transfer-request', (req: any) => {
      transferStore.addOrUpdateTransfer(req)
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

  // V1.3.0: 首次最小化到托盘时给用户一个 in-app 提示
  cleanups.push(
    window.electronAPI.on('app:minimized-to-tray', () => {
      notificationRef.value?.showNotification(
        'info',
        '已最小化到系统托盘',
        '窗口已隐藏到托盘，双击托盘图标或右键 → 显示主窗口 即可恢复',
        undefined,
        6000
      )
    })
  )

  // V1.3.0: 点击系统通知时，切换到对应聊天 / 传输列表
  cleanups.push(
    window.electronAPI.on('notification:click', (payload: any) => {
      if (payload?.type === 'message' && payload.peerId) {
        friendStore.selectFriend(payload.peerId)
        currentView.value = 'chat'
      } else if (payload?.type === 'file' && payload.transferId) {
        currentView.value = 'transfers'
      }
    })
  )

  // V1.3.0: 启动时检查是否需要展示"已升级到 V1.3.0"的功能提示
  // 仅在从未提示过且 closeToTray=true（默认）时展示一次
  const TIP_KEY = 'hongyan.v1.3.0.feature-tip-shown'
  if (!localStorage.getItem(TIP_KEY)) {
    setTimeout(() => {
      notificationRef.value?.showNotification(
        'info',
        'V1.3.0 已支持托盘和系统通知',
        '关闭主窗口将自动隐藏到系统托盘（不再直接退出）。可在「设置 → 消息提醒」中调整横幅、任务栏闪烁、免打扰等行为。',
        undefined,
        8000
      )
      localStorage.setItem(TIP_KEY, '1')
    }, 1500)
  }

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
  const result = await window.electronAPI.invoke('file:send', peerId, filePath)
  if (result?.error) {
    alert(result.error)
  } else {
    const records = await window.electronAPI.invoke('chat:load-history', peerId)
    chatStore.setMessages(peerId, records || [])
  }
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

function handleFriendsRefreshed(friends: any[]) {
  friendStore.updateFriends(friends)
}

// V1.2.0: 手动触发 UDP 广播，事件驱动机制下用户需要主动重发现好友
async function handleRefreshFriends() {
  if (isRefreshing.value) return
  isRefreshing.value = true
  try {
    await window.electronAPI.invoke('friend:refresh')
    // 等待一会让广播有时间传播
    await new Promise((resolve) => setTimeout(resolve, 1000))
    const friends = await window.electronAPI.invoke('friend:list')
    if (Array.isArray(friends)) {
      friendStore.updateFriends(friends)
    }
  } catch (err) {
    console.error('Refresh friends failed:', err)
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
  background: linear-gradient(180deg, #2e2e2e 0%, #1a1a1a 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 0;
  flex-shrink: 0;
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.1);
}

.nav-header {
  margin-bottom: 20px;
}

.user-avatar {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.user-avatar:hover {
  transform: scale(1.1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
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
  border-radius: 10px;
  background: transparent;
  color: #999;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
}

.nav-item::before {
  content: '';
  position: absolute;
  left: -12px;
  top: 50%;
  transform: translateY(-50%);
  width: 4px;
  height: 0;
  background: #07c160;
  border-radius: 0 4px 4px 0;
  transition: height 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  transform: scale(1.05);
}

.nav-item.active {
  background: #07c160;
  color: #fff;
  box-shadow: 0 4px 12px rgba(7, 193, 96, 0.4);
}

.nav-item.active::before {
  height: 24px;
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
  background: linear-gradient(180deg, #fafafa 0%, #fff 100%);
}

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: #f5f5f5;
  border-radius: 10px;
  margin-bottom: 8px;
  transition: all 0.3s ease;
  border: 2px solid transparent;
}

.search-box:focus-within {
  background: #fff;
  border-color: #07c160;
  box-shadow: 0 0 0 4px rgba(7, 193, 96, 0.1);
}

.search-box svg {
  color: #999;
  flex-shrink: 0;
  transition: color 0.3s;
}

.search-box:focus-within svg {
  color: #07c160;
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
  padding: 10px;
  border: 1px solid #d9d9d9;
  border-radius: 10px;
  background: #fff;
  color: #666;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.scan-btn:hover {
  border-color: #07c160;
  color: #07c160;
  background: rgba(7, 193, 96, 0.05);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(7, 193, 96, 0.15);
}

.scan-btn:active {
  transform: translateY(0);
}

/* V1.2.0: 好友列表侧边栏操作行 */
.sidebar-actions {
  display: flex;
  gap: 8px;
}

.icon-btn {
  flex: 1;
  padding: 8px 10px;
  border: 1px solid #d9d9d9;
  border-radius: 8px;
  background: #fff;
  color: #666;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  transition: all 0.2s ease;
}

.icon-btn:hover:not(:disabled) {
  border-color: #07c160;
  color: #07c160;
  background: rgba(7, 193, 96, 0.05);
}

.icon-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 主内容区域 */
.main-content {
  flex: 1;
  display: flex;
  min-width: 0;
  overflow: hidden;
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
  backdrop-filter: blur(4px);
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
