<template>
  <div class="chat-view" v-if="currentPeerId">
    <!-- 聊天头部 -->
    <header class="chat-header">
      <div class="header-left">
        <div class="avatar-wrapper">
          <img 
            v-if="currentFriend?.avatar" 
            :src="currentFriend.avatar" 
            :alt="currentFriend.nickname"
            class="avatar"
          />
          <div v-else class="avatar-placeholder">
            {{ getInitials(currentFriend?.remark || currentFriend?.nickname) }}
          </div>
          <span class="status-dot" :class="{ online: currentFriend?.online }"></span>
        </div>
        <div class="friend-info">
          <h3 class="name">{{ currentFriend?.remark || currentFriend?.nickname }}</h3>
          <p class="status-text">
            <span v-if="currentFriend?.online" class="online">在线</span>
            <span v-else>{{ formatLastSeen(currentFriend?.lastSeen) }}</span>
          </p>
        </div>
      </div>
      <div class="header-actions">
        <button 
          class="action-btn" 
          title="更多"
          @click="toggleMoreMenu"
          ref="moreBtnRef"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="1"/>
            <circle cx="19" cy="12" r="1"/>
            <circle cx="5" cy="12" r="1"/>
          </svg>
        </button>
        
        <!-- 更多菜单 -->
        <div v-if="showMoreMenu" class="more-menu" ref="moreMenuRef">
          <div class="menu-item" @click="viewFriendInfo">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            <span>查看资料</span>
          </div>
          <div class="menu-item" @click="editRemark">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            <span>设置备注</span>
          </div>
          <div class="menu-item danger" @click="deleteFriend">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
            <span>删除好友</span>
          </div>
        </div>
      </div>
    </header>

    <!-- 消息列表 -->
    <div class="messages-container" ref="messagesContainer">
      <div class="messages-list">
        <template v-for="(msg, index) in groupedMessages" :key="msg.id || `group-${index}`">
          <!-- 时间分隔线 -->
          <div v-if="shouldShowTimeDivider(index)" class="time-divider">
            <span>{{ formatTimeDivider(msg.timestamp) }}</span>
          </div>
          
          <!-- 消息气泡 -->
          <MessageBubble
            :record="msg"
            :showAvatar="shouldShowAvatar(index)"
            @viewImage="(c: string) => emit('viewImage', c)"
          />
        </template>
        
        <div v-if="messages.length === 0" class="empty-chat">
          <div class="empty-icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <p>开始新的对话</p>
          <span class="hint">发送一条消息开始聊天吧</span>
        </div>
      </div>
    </div>

    <!-- 输入区域 -->
    <MessageInput
      :peerId="currentPeerId"
      @sendText="emit('sendText', $event)"
      @sendImage="emit('sendImage', $event)"
      @sendFile="emit('sendFile', $event)"
    />
  </div>
  
  <div class="empty-state" v-else>
    <div class="empty-icon">
      <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    </div>
    <h3>鸿雁 - 局域网即时通讯</h3>
    <p>选择一个好友开始聊天</p>
  </div>

  <!-- 好友详情对话框 -->
  <div v-if="showFriendInfoDialog && currentFriend" class="modal-overlay" @click.self="closeFriendInfoDialog">
    <div class="friend-info-dialog">
      <div class="dialog-header">
        <h3>好友资料</h3>
        <button class="close-btn" @click="closeFriendInfoDialog">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="dialog-body">
        <div class="friend-avatar-large">
          <img 
            v-if="currentFriend.avatar" 
            :src="currentFriend.avatar" 
            :alt="currentFriend.nickname"
          />
          <div v-else class="avatar-placeholder-large">
            {{ getInitials(currentFriend.remark || currentFriend.nickname) }}
          </div>
        </div>
        <div class="friend-details-large">
          <div class="detail-item">
            <span class="label">昵称</span>
            <span class="value">{{ currentFriend.nickname }}</span>
          </div>
          <div class="detail-item" v-if="currentFriend.remark">
            <span class="label">备注</span>
            <span class="value">{{ currentFriend.remark }}</span>
          </div>
          <div class="detail-item">
            <span class="label">IP地址</span>
            <span class="value">{{ currentFriend.ip }}</span>
          </div>
          <div class="detail-item">
            <span class="label">状态</span>
            <span class="value" :class="{ online: currentFriend.online }">
              {{ currentFriend.online ? '在线' : '离线' }}
            </span>
          </div>
          <div class="detail-item" v-if="currentFriend.lastSeen">
            <span class="label">最后在线</span>
            <span class="value">{{ formatLastSeen(currentFriend.lastSeen) }}</span>
          </div>
        </div>
      </div>
      <div class="dialog-footer">
        <button class="btn-primary" @click="editRemarkFromDialog">设置备注</button>
      </div>
    </div>
  </div>

  <!-- 备注编辑对话框 -->
  <div v-if="showRemarkDialog && currentFriend" class="modal-overlay" @click.self="closeRemarkDialog">
    <div class="remark-dialog">
      <div class="dialog-header">
        <h3>设置备注</h3>
        <button class="close-btn" @click="closeRemarkDialog">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="dialog-body">
        <div class="friend-preview">
          <div class="preview-avatar">
            <img v-if="currentFriend.avatar" :src="currentFriend.avatar" :alt="currentFriend.nickname" />
            <div v-else class="avatar-placeholder">{{ getInitials(currentFriend.remark || currentFriend.nickname) }}</div>
          </div>
          <div class="preview-info">
            <div class="preview-nickname">{{ currentFriend.nickname }}</div>
            <div class="preview-ip">{{ currentFriend.ip }}</div>
          </div>
        </div>
        <div class="remark-input">
          <label>备注名</label>
          <input 
            type="text" 
            v-model="editingRemark" 
            placeholder="输入备注名（可选）"
            maxlength="50"
          />
        </div>
      </div>
      <div class="dialog-footer">
        <button class="btn-cancel" @click="closeRemarkDialog">取消</button>
        <button class="btn-save" @click="saveRemark">保存</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useChatStore } from '../stores/chat-store'
import { useFriendStore } from '../stores/friend-store'
import MessageBubble from './MessageBubble.vue'
import MessageInput from './MessageInput.vue'
import type { ChatRecord } from '@shared/types'

const emit = defineEmits(['sendText', 'sendImage', 'sendFile', 'viewImage', 'openContacts'])

const chatStore = useChatStore()
const friendStore = useFriendStore()
const messagesContainer = ref<HTMLElement | null>(null)
const showMoreMenu = ref(false)
const moreBtnRef = ref<HTMLElement | null>(null)
const moreMenuRef = ref<HTMLElement | null>(null)
const showFriendInfoDialog = ref(false)
const showRemarkDialog = ref(false)
const editingRemark = ref('')

const messages = computed(() => chatStore.messages)
const currentPeerId = computed(() => chatStore.currentPeerId)
const currentFriend = computed(() =>
  friendStore.friends.find((f) => f.peerId === currentPeerId.value)
)

// 按时间分组的消息
const groupedMessages = computed(() => {
  return messages.value.sort((a, b) => a.timestamp - b.timestamp)
})

function toggleMoreMenu() {
  showMoreMenu.value = !showMoreMenu.value
}

function viewFriendInfo() {
  showMoreMenu.value = false
  showFriendInfoDialog.value = true
}

function closeFriendInfoDialog() {
  showFriendInfoDialog.value = false
}

function editRemarkFromDialog() {
  showFriendInfoDialog.value = false
  openRemarkDialog()
}

function openRemarkDialog() {
  if (!currentFriend.value) return
  editingRemark.value = currentFriend.value.remark || ''
  showRemarkDialog.value = true
}

function closeRemarkDialog() {
  showRemarkDialog.value = false
  editingRemark.value = ''
}

async function saveRemark() {
  if (!currentFriend.value) return

  try {
    // 调用后端保存备注
    await window.electronAPI.invoke('friend:update-remark', currentFriend.value.peerId, editingRemark.value || '')

    // 更新本地store
    const updatedFriend = {
      ...currentFriend.value,
      remark: editingRemark.value || undefined
    }
    friendStore.addOrUpdateFriend(updatedFriend)

    closeRemarkDialog()
  } catch (err) {
    console.error('Failed to save friend remark:', err)
    alert('保存备注失败')
  }
}

function editRemark() {
  showMoreMenu.value = false
  openRemarkDialog()
}

async function deleteFriend() {
  if (!currentFriend.value) return
  
  if (!confirm(`确定要删除好友 "${currentFriend.value.nickname}" 吗？`)) {
    showMoreMenu.value = false
    return
  }

  try {
    await window.electronAPI.invoke('friend:delete', currentFriend.value.peerId)
    // 从 store 中移除
    friendStore.removeFriend(currentFriend.value.peerId)
    // 清空当前聊天
    chatStore.clearMessages()
    showMoreMenu.value = false
  } catch (err) {
    console.error('Failed to delete friend:', err)
    alert('删除好友失败')
  }
}

// 点击其他地方关闭菜单
function handleClickOutside(event: MouseEvent) {
  if (moreMenuRef.value && !moreMenuRef.value.contains(event.target as Node)) {
    if (moreBtnRef.value && !moreBtnRef.value.contains(event.target as Node)) {
      showMoreMenu.value = false
    }
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

// 判断是否显示时间分隔线
function shouldShowTimeDivider(index: number): boolean {
  if (index === 0) return true
  
  const currentMsg = groupedMessages.value[index]
  const prevMsg = groupedMessages.value[index - 1]
  
  if (!currentMsg || !prevMsg) return false
  
  // 如果两条消息间隔超过5分钟，显示时间分隔线
  return currentMsg.timestamp - prevMsg.timestamp > 5 * 60 * 1000
}

// 判断是否显示头像（类似微信的逻辑）
function shouldShowAvatar(index: number): boolean {
  if (index === 0) return true  // 第一条消息显示头像
  
  const currentMsg = groupedMessages.value[index]
  const prevMsg = groupedMessages.value[index - 1]
  
  if (!currentMsg || !prevMsg) return false
  
  // 如果前一条消息是时间分隔线后的第一条，显示头像
  if (shouldShowTimeDivider(index)) return true
  
  // 如果当前消息和前一条消息的发送者不同，显示头像
  if (currentMsg.direction !== prevMsg.direction) return true
  
  // 如果间隔超过2分钟，显示头像
  if (currentMsg.timestamp - prevMsg.timestamp > 2 * 60 * 1000) return true
  
  // 否则不显示头像（连续消息）
  return false
}

// 格式化时间分隔线
function formatTimeDivider(timestamp: number): string {
  const now = new Date()
  const msgDate = new Date(timestamp)
  const diff = now.getTime() - msgDate.getTime()
  
  // 今天
  if (diff < 24 * 60 * 60 * 1000 && now.getDate() === msgDate.getDate()) {
    return formatTime(msgDate)
  }
  
  // 昨天
  if (diff < 48 * 60 * 60 * 1000 && now.getDate() - msgDate.getDate() === 1) {
    return `昨天 ${formatTime(msgDate)}`
  }
  
  // 更早
  return `${msgDate.getMonth() + 1}月${msgDate.getDate()}日 ${formatTime(msgDate)}`
}

function formatTime(date: Date): string {
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
}

function getInitials(name: string): string {
  if (!name) return '?'
  const parts = name.split(/[\s_-]+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return name[0].toUpperCase()
}

function formatLastSeen(timestamp?: number): string {
  if (!timestamp) return '离线'
  
  const now = Date.now()
  const diff = now - timestamp
  
  if (diff < 60000) return '刚刚在线'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前在线`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前在线`
  
  const date = new Date(timestamp)
  return `${date.getMonth() + 1}月${date.getDate()}日在线`
}

// 自动滚动到底部
watch(messages, () => {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}, { deep: true })
</script>

<style scoped>
.chat-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f5f5f5;
}

/* 聊天头部 */
.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: #fff;
  border-bottom: 1px solid #e8e8e8;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.avatar-wrapper {
  position: relative;
}

.avatar,
.avatar-placeholder {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  object-fit: cover;
}

.avatar-placeholder {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
}

.status-dot {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #ccc;
  border: 2px solid #fff;
}

.status-dot.online {
  background: #07c160;
}

.friend-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.name {
  font-size: 15px;
  font-weight: 600;
  color: #333;
  margin: 0;
}

.status-text {
  font-size: 12px;
  color: #999;
  margin: 0;
}

.status-text .online {
  color: #07c160;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
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

.action-btn:hover {
  background: #f5f5f5;
  color: #333;
}

/* 消息容器 */
.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 16px 0;
}

.messages-list {
  max-width: 800px;
  margin: 0 auto;
  padding: 0 20px;
}

.time-divider {
  text-align: center;
  margin: 16px 0;
}

.time-divider span {
  display: inline-block;
  padding: 4px 12px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 12px;
  font-size: 12px;
  color: #999;
}

.empty-chat {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  color: #999;
  text-align: center;
}

.empty-icon {
  margin-bottom: 16px;
  opacity: 0.3;
}

.empty-chat p {
  font-size: 14px;
  color: #666;
  margin-bottom: 4px;
}

.hint {
  font-size: 12px;
  color: #bbb;
}

/* 空状态 */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #f5f5f5;
  color: #999;
}

.empty-state .empty-icon {
  margin-bottom: 20px;
  opacity: 0.2;
}

.empty-state h3 {
  font-size: 18px;
  color: #666;
  margin-bottom: 8px;
  font-weight: 500;
}

.empty-state p {
  font-size: 14px;
  color: #999;
}

/* 滚动条样式 */
.messages-container::-webkit-scrollbar {
  width: 6px;
}

.messages-container::-webkit-scrollbar-track {
  background: transparent;
}

.messages-container::-webkit-scrollbar-thumb {
  background: #ddd;
  border-radius: 3px;
}

.messages-container::-webkit-scrollbar-thumb:hover {
  background: #ccc;
}

/* 更多菜单 */
.header-actions {
  position: relative;
}

.more-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 8px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  padding: 4px;
  min-width: 160px;
  z-index: 100;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  font-size: 14px;
  color: #333;
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.2s;
}

.menu-item:hover {
  background: #f5f5f5;
}

.menu-item.danger {
  color: #ff4d4f;
}

.menu-item.danger:hover {
  background: #fff1f0;
}

/* 好友详情对话框 */
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

.friend-info-dialog {
  background: #fff;
  border-radius: 12px;
  width: 90%;
  max-width: 480px;
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
  padding: 24px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.friend-avatar-large img,
.avatar-placeholder-large {
  width: 100px;
  height: 100px;
  border-radius: 12px;
  object-fit: cover;
}

.avatar-placeholder-large {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  font-weight: 600;
}

.friend-details-large {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-item {
  display: flex;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid #f0f0f0;
}

.detail-item:last-child {
  border-bottom: none;
}

.detail-item .label {
  width: 80px;
  font-size: 14px;
  color: #999;
  flex-shrink: 0;
}

.detail-item .value {
  flex: 1;
  font-size: 14px;
  color: #333;
  text-align: right;
}

.detail-item .value.online {
  color: #07c160;
}

.dialog-footer {
  padding: 16px 20px;
  border-top: 1px solid #e8e8e8;
  display: flex;
  justify-content: center;
}

.btn-primary {
  padding: 10px 24px;
  border: none;
  border-radius: 6px;
  background: #07c160;
  color: white;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary:hover {
  background: #06ad56;
}

/* 备注对话框 */
.remark-dialog {
  background: #fff;
  border-radius: 12px;
  width: 90%;
  max-width: 400px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.friend-preview {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: #f5f5f5;
  border-radius: 8px;
  margin-bottom: 16px;
}

.preview-avatar img,
.preview-avatar .avatar-placeholder {
  width: 50px;
  height: 50px;
  border-radius: 8px;
  object-fit: cover;
}

.preview-avatar .avatar-placeholder {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 600;
}

.preview-info {
  flex: 1;
}

.preview-nickname {
  font-size: 15px;
  font-weight: 600;
  color: #333;
  margin-bottom: 4px;
}

.preview-ip {
  font-size: 13px;
  color: #999;
}

.remark-input label {
  display: block;
  font-size: 13px;
  color: #333;
  margin-bottom: 8px;
  font-weight: 500;
}

.remark-input input {
  width: 100%;
  padding: 10px;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}

.remark-input input:focus {
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
