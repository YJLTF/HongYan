<template>
  <div class="contacts-view">
    <div class="contacts-header">
      <h2>联系人</h2>
      <div class="header-actions">
        <button class="action-btn" @click="showScanConfig = true" title="扫描配置">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
          </svg>
          扫描配置
        </button>
      </div>
    </div>

    <div class="search-box">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"/>
        <path d="m21 21-4.35-4.35"/>
      </svg>
      <input 
        type="text" 
        placeholder="搜索联系人..." 
        v-model="searchQuery"
      />
    </div>

    <div class="contacts-list">
      <!-- 在线好友 -->
      <div v-if="onlineFriends.length > 0" class="contact-group">
        <div class="group-title">
          <span class="dot online"></span>
          在线 ({{ onlineFriends.length }})
        </div>
        <div 
          v-for="friend in onlineFriends" 
          :key="friend.peerId"
          class="contact-item"
          @click="selectFriend(friend)"
        >
          <div class="contact-avatar">
            <img 
              v-if="friend.avatar" 
              :src="friend.avatar" 
              :alt="friend.nickname"
            />
            <div v-else class="avatar-placeholder">
              {{ getInitials(friend.remark || friend.nickname) }}
            </div>
            <span class="status-dot online"></span>
          </div>
          <div class="contact-info">
            <div class="contact-name">{{ friend.remark || friend.nickname }}</div>
            <div class="contact-meta">{{ friend.ip }}</div>
          </div>
          <button class="chat-btn" @click.stop="startChat(friend)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- 离线好友 -->
      <div v-if="offlineFriends.length > 0" class="contact-group">
        <div class="group-title">
          <span class="dot offline"></span>
          离线 ({{ offlineFriends.length }})
        </div>
        <div 
          v-for="friend in offlineFriends" 
          :key="friend.peerId"
          class="contact-item offline"
          @click="selectFriend(friend)"
        >
          <div class="contact-avatar">
            <img 
              v-if="friend.avatar" 
              :src="friend.avatar" 
              :alt="friend.nickname"
            />
            <div v-else class="avatar-placeholder">
              {{ getInitials(friend.remark || friend.nickname) }}
            </div>
            <span class="status-dot offline"></span>
          </div>
          <div class="contact-info">
            <div class="contact-name">{{ friend.remark || friend.nickname }}</div>
            <div class="contact-meta">{{ formatLastSeen(friend.lastSeen) }}</div>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="friends.length === 0" class="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        <p>暂无联系人</p>
        <span class="hint">点击"扫描配置"按钮添加网段并刷新</span>
      </div>
    </div>

    <!-- 网段扫描配置面板 -->
    <div v-if="showScanConfig" class="modal-overlay" @click.self="showScanConfig = false">
      <ScanConfigPanel 
        @close="showScanConfig = false"
        @refreshed="handleFriendsRefreshed"
      />
    </div>

    <!-- 好友备注编辑对话框 -->
    <div v-if="showRemarkDialog && selectedFriend" class="modal-overlay" @click.self="closeRemarkDialog">
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
              <img v-if="selectedFriend.avatar" :src="selectedFriend.avatar" :alt="selectedFriend.nickname" />
              <div v-else class="avatar-placeholder">{{ getInitials(selectedFriend.remark || selectedFriend.nickname) }}</div>
            </div>
            <div class="preview-info">
              <div class="preview-nickname">{{ selectedFriend.nickname }}</div>
              <div class="preview-ip">{{ selectedFriend.ip }}</div>
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
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useFriendStore } from '../stores/friend-store'
import { useChatStore } from '../stores/chat-store'
import ScanConfigPanel from './ScanConfigPanel.vue'
import type { Friend } from '@shared/types'

const emit = defineEmits(['openChat'])

const friendStore = useFriendStore()
const chatStore = useChatStore()
const searchQuery = ref('')
const showScanConfig = ref(false)
const showRemarkDialog = ref(false)
const selectedFriend = ref<Friend | null>(null)
const editingRemark = ref('')

const friends = computed(() => friendStore.friends)

const filteredFriends = computed(() => {
  if (!searchQuery.value) return friends.value
  const query = searchQuery.value.toLowerCase()
  return friends.value.filter(f => 
    f.nickname.toLowerCase().includes(query) || 
    f.remark?.toLowerCase().includes(query) ||
    f.ip.includes(query)
  )
})

const onlineFriends = computed(() => 
  filteredFriends.value.filter(f => f.online)
)

const offlineFriends = computed(() => 
  filteredFriends.value.filter(f => !f.online)
)

function getInitials(name: string): string {
  if (!name) return '?'
  const parts = name.split(/[\s_-]+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return name[0].toUpperCase()
}

function formatLastSeen(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  
  if (diff < 60000) return '刚刚在线'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前在线`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前在线`
  
  const date = new Date(timestamp)
  return `${date.getMonth() + 1}月${date.getDate()}日在线`
}

function selectFriend(friend: Friend) {
  selectedFriend.value = friend
  editingRemark.value = friend.remark || ''
  showRemarkDialog.value = true
}

function closeRemarkDialog() {
  showRemarkDialog.value = false
  selectedFriend.value = null
  editingRemark.value = ''
}

async function saveRemark() {
  if (!selectedFriend.value) return

  try {
    // 调用后端保存备注
    await window.electronAPI.invoke('friend:update-remark', selectedFriend.value.peerId, editingRemark.value || '')

    // 更新本地store
    const updatedFriend = {
      ...selectedFriend.value,
      remark: editingRemark.value || undefined
    }
    friendStore.addOrUpdateFriend(updatedFriend)

    closeRemarkDialog()
  } catch (err) {
    console.error('Failed to save friend remark:', err)
    alert('保存备注失败')
  }
}

function handleFriendsRefreshed(friends: any[]) {
  friendStore.updateFriends(friends)
}

function startChat(friend: Friend) {
  friendStore.selectFriend(friend.peerId)
  emit('openChat')
}
</script>

<style scoped>
.contacts-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  background: #f5f5f5;
}

.contacts-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  background: #fff;
  border-bottom: 1px solid #e8e8e8;
}

.contacts-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #333;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: 1px solid #07c160;
  border-radius: 6px;
  background: #fff;
  color: #07c160;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s;
}

.action-btn:hover {
  background: #e8f5e9;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  background: #fff;
  border-bottom: 1px solid #e8e8e8;
}

.search-box svg {
  color: #999;
  flex-shrink: 0;
}

.search-box input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 14px;
  color: #333;
}

.search-box input::placeholder {
  color: #bbb;
}

.contacts-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px 0;
}

.contact-group {
  margin-bottom: 24px;
}

.group-title {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 24px;
  font-size: 13px;
  font-weight: 600;
  color: #999;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.dot.online {
  background: #07c160;
}

.dot.offline {
  background: #ccc;
}

.contact-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 24px;
  cursor: pointer;
  transition: background 0.2s;
}

.contact-item:hover {
  background: #fff;
}

.contact-item.offline {
  opacity: 0.7;
}

.contact-avatar {
  position: relative;
  flex-shrink: 0;
}

.contact-avatar img,
.avatar-placeholder {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  object-fit: cover;
}

.avatar-placeholder {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 600;
}

.status-dot {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid #fff;
}

.status-dot.online {
  background: #07c160;
}

.status-dot.offline {
  background: #ccc;
}

.contact-info {
  flex: 1;
  min-width: 0;
}

.contact-name {
  font-size: 15px;
  font-weight: 500;
  color: #333;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.contact-meta {
  font-size: 12px;
  color: #999;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-btn {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 8px;
  background: #f5f5f5;
  color: #07c160;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  flex-shrink: 0;
}

.chat-btn:hover {
  background: #e8f5e9;
  transform: scale(1.05);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  color: #999;
  text-align: center;
}

.empty-state svg {
  margin-bottom: 16px;
  opacity: 0.3;
}

.empty-state p {
  font-size: 15px;
  color: #666;
  margin-bottom: 8px;
}

.hint {
  font-size: 13px;
  color: #bbb;
}

/* 滚动条样式 */
.contacts-list::-webkit-scrollbar {
  width: 6px;
}

.contacts-list::-webkit-scrollbar-track {
  background: transparent;
}

.contacts-list::-webkit-scrollbar-thumb {
  background: #ddd;
  border-radius: 3px;
}

.contacts-list::-webkit-scrollbar-thumb:hover {
  background: #ccc;
}

/* 模态框样式 */
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

.remark-dialog {
  background: #fff;
  border-radius: 12px;
  width: 450px;
  max-width: 90%;
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

.dialog-body {
  padding: 20px;
}

.remark-input {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.remark-input label {
  font-size: 13px;
  font-weight: 500;
  color: #666;
}

.remark-input input {
  padding: 10px 12px;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
  font-family: 'Consolas', 'Monaco', monospace;
}

.remark-input input:focus {
  border-color: #07c160;
}

.friend-preview {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #f5f5f5;
  border-radius: 8px;
  margin-bottom: 20px;
}

.preview-avatar img,
.preview-avatar .avatar-placeholder {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  object-fit: cover;
}

.preview-avatar .avatar-placeholder {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 600;
}

.preview-info {
  flex: 1;
}

.preview-nickname {
  font-size: 15px;
  font-weight: 500;
  color: #333;
  margin-bottom: 4px;
}

.preview-ip {
  font-size: 12px;
  color: #999;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid #e8e8e8;
}

.btn-cancel,
.btn-save {
  padding: 8px 20px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel {
  border: 1px solid #d9d9d9;
  background: #fff;
  color: #666;
}

.btn-cancel:hover {
  border-color: #bbb;
  color: #333;
}

.btn-save {
  border: none;
  background: #07c160;
  color: #fff;
}

.btn-save:hover:not(:disabled) {
  background: #06ad56;
}

.btn-save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
