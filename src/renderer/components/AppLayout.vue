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
          title="私聊"
          @click="currentView = 'chat'"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </button>
        <!-- V1.4.0: 群聊（3 人头图标） -->
        <button
          class="nav-item"
          :class="{ active: currentView === 'groups' }"
          title="群聊"
          @click="currentView = 'groups'"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
          </svg>
        </button>
        <button
          class="nav-item"
          :class="{ active: currentView === 'contacts' }"
          title="联系人"
          @click="currentView = 'contacts'"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
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

    <!-- V1.4.0: 群聊列表区域 -->
    <div class="friend-sidebar" v-else-if="currentView === 'groups'">
      <GroupList
        :groups="groupStore.groups"
        :selectedGroupId="groupStore.selectedGroupId"
        :lastMessages="{}"
        @selectGroup="handleSelectGroup"
        @groupCreated="handleGroupCreated"
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
      <GroupChatView
        v-else-if="currentView === 'groups'"
        @viewImage="handleViewImage"
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

    <!-- V1.4.0: 群邀请提示对话框 -->
    <div v-if="groupStore.pendingInvites.length > 0" class="invite-banner" @click="handleInviteBannerClick">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <line x1="20" y1="8" x2="20" y2="14"/>
        <line x1="23" y1="11" x2="17" y2="11"/>
      </svg>
      <span>{{ groupStore.pendingInvites[0].inviterNickname }} 邀请你加入群「{{ groupStore.pendingInvites[0].groupName }}」</span>
    </div>

    <!-- V1.4.0: 群邀请详情对话框 -->
    <div v-if="showInviteDialog" class="modal-overlay" @click.self="showInviteDialog = false">
      <div class="invite-confirm-dialog">
        <div class="dialog-header">
          <h3>群聊邀请</h3>
          <button class="close-btn" @click="showInviteDialog = false">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="dialog-body">
          <div class="invite-info">
            <div class="invite-avatar">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
              </svg>
            </div>
            <div class="invite-text">
              <div class="invite-name">{{ activeInvite?.groupName }}</div>
              <div class="invite-from">邀请人：{{ activeInvite?.inviterNickname }}</div>
            </div>
          </div>
          <div class="invite-hint">
            接受邀请后将自动加入该群聊
          </div>
        </div>
        <div class="dialog-footer">
          <button class="btn-cancel" @click="respondActiveInvite(false)">拒绝</button>
          <button class="btn-accept" @click="respondActiveInvite(true)">接受</button>
        </div>
      </div>
    </div>

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
import { useGroupStore, type PendingInvite } from '../stores/group-store'
import FriendList from './FriendList.vue'
import ChatView from './ChatView.vue'
import GroupList from './GroupList.vue'
import GroupChatView from './GroupChatView.vue'
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
const groupStore = useGroupStore()

const notificationRef = ref<any>(null)

const currentView = ref<'chat' | 'groups' | 'contacts' | 'transfers'>('chat')
const showSettings = ref(false)
const showImageViewer = ref(false)
const showScanConfig = ref(false)
const showInviteDialog = ref(false)
const activeInvite = ref<PendingInvite | null>(null)
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

  // V1.4.0: 加载群组列表
  try {
    const groupResult = await window.electronAPI.invoke('group:list')
    if (groupResult?.groups) {
      groupStore.setGroups(groupResult.groups)
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
      } else if (payload?.type === 'group-message' && payload.groupId) {
        groupStore.selectGroup(payload.groupId)
        currentView.value = 'groups'
      } else if (payload?.type === 'file' && payload.transferId) {
        currentView.value = 'transfers'
      }
    })
  )

  // V1.4.0: 群事件监听
  cleanups.push(
    window.electronAPI.on('group:created', (group: any) => {
      groupStore.addOrUpdateGroup(group)
    })
  )
  cleanups.push(
    window.electronAPI.on('group:updated', (group: any) => {
      groupStore.addOrUpdateGroup(group)
    })
  )
  cleanups.push(
    window.electronAPI.on('group:dissolved', (payload: any) => {
      groupStore.removeGroup(payload.groupId)
    })
  )
  cleanups.push(
    window.electronAPI.on('group:invite-received', (invite: any) => {
      groupStore.addPendingInvite({
        groupId: invite.groupId,
        groupName: invite.groupName,
        inviterPeerId: invite.inviterPeerId,
        inviterNickname: invite.inviterNickname,
        keyVersion: invite.keyVersion,
        timestamp: invite.timestamp,
      })
    })
  )
  cleanups.push(
    window.electronAPI.on('group:invite-responded', (_payload: any) => {
      // 通知 owner 某人接受/拒绝了邀请（仅日志用，无需 UI 动作）
    })
  )
  cleanups.push(
    window.electronAPI.on('group:member-changed', (_payload: any) => {
      // 重新拉取群组以更新成员列表
      window.electronAPI.invoke('group:list').then((r: any) => {
        if (r?.groups) groupStore.setGroups(r.groups)
      })
    })
  )
  cleanups.push(
    window.electronAPI.on('group:message-received', async (msg: any) => {
      const groupId = msg.groupId
      if (groupId === groupStore.selectedGroupId) {
        const refreshed = await window.electronAPI.invoke('group:load-history', groupId)
        if (refreshed?.records) {
          groupStore.setMessages(groupId, refreshed.records)
        }
      } else {
        groupStore.incrementUnread(groupId)
      }
    })
  )
  cleanups.push(
    window.electronAPI.on('group:message-status-updated', (data: any) => {
      groupStore.updateMessageStatus(data.messageId, data.status)
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
  // V1.4.0: 监听选中群变化
  watch(
    () => groupStore.selectedGroupId,
    async (groupId) => {
      if (groupId) {
        const records = await window.electronAPI.invoke('group:load-history', groupId)
        if (records?.records) {
          groupStore.setMessages(groupId, records.records)
        }
      } else {
        groupStore.clearMessages()
      }
    }
  )
}

function handleSelectFriend(peerId: string) {
  friendStore.selectFriend(peerId)
}

// V1.4.0: 选中群
function handleSelectGroup(groupId: string) {
  groupStore.selectGroup(groupId)
  groupStore.setMessages(groupId, []) // 立即清空，加载完成前先空
}

function handleGroupCreated(_group: any) {
  // 重新拉取群列表
  window.electronAPI.invoke('group:list').then((r: any) => {
    if (r?.groups) {
      groupStore.setGroups(r.groups)
      const created = r.groups[0]
      if (created) groupStore.selectGroup(created.groupId)
    }
  })
}

// V1.4.0: 群邀请横幅点击
function handleInviteBannerClick() {
  if (groupStore.pendingInvites.length === 0) return
  activeInvite.value = groupStore.pendingInvites[0]
  showInviteDialog.value = true
}

// V1.4.0: 接受/拒绝群邀请
async function respondActiveInvite(accept: boolean) {
  if (!activeInvite.value) return
  const invite = activeInvite.value
  const inviterPeerId = invite.inviterPeerId
  const groupId = invite.groupId

  // 先建立本地空群占位（如果接受），让用户能进入群视图看到成员列表
  if (accept) {
    // 主进程会处理密钥分发与本地群创建；我们只需要通知它
    await window.electronAPI.invoke('group:respond-invite', inviterPeerId, groupId, true)
    // 主进程会再发 group:created 推过来
  } else {
    await window.electronAPI.invoke('group:respond-invite', inviterPeerId, groupId, false)
  }
  groupStore.removePendingInvite(groupId, inviterPeerId)
  activeInvite.value = null
  showInviteDialog.value = false
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

/* V1.4.0: 群邀请横幅 */
.invite-banner {
  position: fixed;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 200;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  background: linear-gradient(135deg, #07c160 0%, #06ad56 100%);
  color: white;
  border-radius: 24px;
  box-shadow: 0 8px 24px rgba(7, 193, 96, 0.35);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  animation: inviteBannerSlideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  max-width: 80%;
  user-select: none;
}

.invite-banner:hover {
  transform: translateX(-50%) translateY(-2px);
  box-shadow: 0 12px 32px rgba(7, 193, 96, 0.45);
}

@keyframes inviteBannerSlideIn {
  from { opacity: 0; transform: translateX(-50%) translateY(-20px) }
  to { opacity: 1; transform: translateX(-50%) translateY(0) }
}

/* V1.4.0: 群邀请确认对话框 */
.invite-confirm-dialog {
  background: #fff;
  border-radius: 16px;
  width: 90%;
  max-width: 400px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
  animation: scaleIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes scaleIn {
  from { opacity: 0; transform: scale(0.95) }
  to { opacity: 1; transform: scale(1) }
}

.invite-confirm-dialog .dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px;
  border-bottom: 1px solid #f0f0f0;
  background: linear-gradient(180deg, #fafafa 0%, #fff 100%);
}

.invite-confirm-dialog .dialog-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.invite-confirm-dialog .close-btn {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: #666;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s;
}

.invite-confirm-dialog .close-btn:hover {
  background: #f5f5f5;
  transform: rotate(90deg);
}

.invite-confirm-dialog .dialog-body {
  padding: 24px;
}

.invite-info {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}

.invite-avatar {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.invite-text {
  flex: 1;
}

.invite-name {
  font-size: 16px;
  font-weight: 600;
  color: #333;
  margin-bottom: 4px;
}

.invite-from {
  font-size: 12px;
  color: #999;
}

.invite-hint {
  font-size: 13px;
  color: #999;
  padding: 12px;
  background: #f5f5f5;
  border-radius: 8px;
}

.invite-confirm-dialog .dialog-footer {
  padding: 16px 20px;
  border-top: 1px solid #f0f0f0;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.btn-cancel, .btn-accept {
  padding: 8px 20px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
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

.btn-accept {
  background: linear-gradient(135deg, #07c160 0%, #06ad56 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(7, 193, 96, 0.3);
}

.btn-accept:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(7, 193, 96, 0.4);
}
</style>
