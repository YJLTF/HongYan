<template>
  <div class="message-item" :class="[direction, { 'show-avatar': showAvatar }]">
    <!-- 头像（仅在需要时显示） -->
    <div v-if="showAvatar" class="avatar-wrapper">
      <img 
        v-if="displayAvatar" 
        :src="displayAvatar" 
        :alt="displayName"
        class="avatar"
      />
      <div v-else class="avatar-placeholder" :class="{ 'self': direction === 'sent' }">
        {{ getInitials(displayName) }}
      </div>
    </div>
    
    <!-- 占位符（保持对齐） -->
    <div v-else class="avatar-spacer"></div>

    <!-- 消息内容区域 -->
    <div class="message-body" :class="{ 'mentioned': isMentioned, 'mention-all': mentionedAllFlag }">
      <!-- V1.4.0: 群聊中被 @ 的消息加特殊高亮 -->
      <div v-if="isMentioned" class="mention-indicator">
        {{ mentionedAllFlag ? '@所有人提到了我' : '@ 我' }}
      </div>
      <!-- 发送者名称（接收方：1:1 仅显示头像时；群聊：始终显示） -->
      <div v-if="shouldShowSenderName" class="sender-name">
        {{ displayName }}
      </div>

      <!-- 消息气泡容器 -->
      <div class="bubble-wrapper">
        <!-- 文本消息 -->
        <div v-if="record.type === 'text'" class="bubble text-bubble">
          {{ record.content }}
        </div>

        <!-- 图片消息 -->
        <div v-else-if="record.type === 'image'" class="bubble image-bubble">
          <img 
            :src="'data:image/png;base64,' + record.content" 
            @click="$emit('viewImage', record.content)"
            alt="图片"
          />
        </div>

        <!-- 文件消息 -->
        <div v-else-if="record.type === 'file'" class="bubble file-bubble">
          <div class="file-main-row">
            <div class="file-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
                <polyline points="13 2 13 9 20 9"/>
              </svg>
            </div>
            <div class="file-info">
              <div class="file-name">{{ record.fileName }}</div>
              <div class="file-size">{{ formatFileSize(record.fileSize) }}</div>
            </div>
          </div>
          <div class="file-actions" v-if="isGroupFileDownloadable">
            <button class="btn-file-accept" @click.stop="$emit('downloadFile', record)">下载</button>
          </div>
          <div class="file-actions" v-else-if="direction === 'received' && !fileDecided">
            <button class="btn-file-accept" @click.stop="$emit('acceptFile', record)">接收</button>
            <button class="btn-file-saveas" @click.stop="$emit('saveAsFile', record)">另存为</button>
            <button class="btn-file-reject" @click.stop="$emit('rejectFile', record)">拒绝</button>
          </div>
          <div class="file-result" v-else-if="direction === 'received' && fileDecided">
            <span class="file-result-text" :class="fileResultClass">{{ fileResultText }}</span>
            <span class="file-save-path" v-if="fileSavePath">{{ fileSavePath }}</span>
          </div>
          <div class="file-result" v-else-if="direction === 'sent'">
            <span class="file-result-text">{{ fileStatusText }}</span>
          </div>
        </div>

        <!-- 消息状态（嵌入在气泡内） -->
        <div v-if="direction === 'sent'" class="bubble-status">
          <span v-if="record.status === 'sending'" class="status-icon sending">
            <svg class="spinner" width="14" height="14" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" fill="none" stroke-dasharray="31.4" stroke-dashoffset="31.4">
                <animate attributeName="stroke-dasharray" dur="1.5s" repeatCount="indefinite" values="0,31.4;15.7,15.7;0,31.4"/>
                <animate attributeName="stroke-dashoffset" dur="1.5s" repeatCount="indefinite" values="0;-15.7;-31.4"/>
              </circle>
            </svg>
          </span>
          <span v-else-if="record.status === 'sent'" class="status-icon sent">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </span>
          <span v-else-if="record.status === 'delivered'" class="status-icon delivered">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12"/>
              <polyline points="14 6 3 17"/>
            </svg>
          </span>
          <span v-else-if="record.status === 'read'" class="status-icon read">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12"/>
              <polyline points="14 6 3 17"/>
            </svg>
          </span>
          <span v-else-if="record.status === 'failed'" class="status-icon failed">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="15" y1="9" x2="9" y2="15"/>
              <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
          </span>
        </div>
      </div>

      <!-- 时间戳 -->
      <div class="message-time">{{ formatTime(record.timestamp) }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ChatRecord } from '@shared/types'
import { useFriendStore } from '../stores/friend-store'
import { useConfigStore } from '../stores/config-store'
import { useTransferStore } from '../stores/transfer-store'

const props = defineProps<{ 
  record: ChatRecord,
  showAvatar?: boolean
}>()
defineEmits(['viewImage', 'acceptFile', 'saveAsFile', 'rejectFile', 'downloadFile'])

const friendStore = useFriendStore()
const configStore = useConfigStore()
const transferStore = useTransferStore()

const direction = props.record.direction

// V1.4.0: 群聊消息始终显示发送者名称（1:1 仅接收方显示）
const isGroup = !!props.record.groupId || props.record.conversationType === 'group'
const shouldShowSenderName = computed(() => {
  if (isGroup) return !!displayName.value
  return direction === 'received' && !!props.showAvatar
})

// V1.4.0: 当前用户是否被 @ 提及
const isMentioned = computed(() => {
  if (!isGroup) return false
  if (direction !== 'received') return false
  if (props.record.mentionedAll) return true
  const myId = configStore.peerId
  if (!myId) return false
  return Array.isArray(props.record.mentions) && props.record.mentions.includes(myId)
})
const mentionedAllFlag = computed(() => !!props.record.mentionedAll)

const fileDecided = computed(() => {
  if (props.record.type !== 'file') return false
  if (props.record.direction === 'sent') return true
  const t = transferStore.transfers.find(tr => tr.transferId === props.record.id)
  if (!t) return false
  return ['accepted', 'rejected', 'transferring', 'completed', 'failed', 'interrupted'].includes(t.status)
})

// V1.4.0: 群聊接收的文件用"下载"按钮（不弹私聊 UI）
const isGroupFileDownloadable = computed(() => {
  return isGroup && props.record.type === 'file' && props.record.direction === 'received' && !fileDecided.value
})

const fileResultClass = computed(() => {
  const t = transferStore.transfers.find(tr => tr.transferId === props.record.id)
  if (!t) return ''
  if (t.status === 'rejected') return 'rejected'
  return 'accepted'
})

const fileResultText = computed(() => {
  const t = transferStore.transfers.find(tr => tr.transferId === props.record.id)
  if (!t) return ''
  const map: Record<string, string> = {
    accepted: '已接受',
    rejected: '已拒绝',
    transferring: '传输中',
    completed: '已完成',
    failed: '传输失败',
    interrupted: '已中断'
  }
  return map[t.status] || t.status
})

const fileSavePath = computed(() => {
  const t = transferStore.transfers.find(tr => tr.transferId === props.record.id)
  return t?.savePath || ''
})

const fileStatusText = computed(() => {
  if (props.record.type !== 'file') return ''
  const t = transferStore.transfers.find(tr => tr.transferId === props.record.id)
  if (!t) return '已发送'
  const map: Record<string, string> = {
    pending: '等待接收',
    accepted: '对方已接受',
    transferring: '传输中',
    completed: '已完成',
    failed: '失败',
    rejected: '对方已拒绝',
    interrupted: '已中断'
  }
  return map[t.status] || t.status
})

// 根据方向决定显示哪个头像和信息
const displayAvatar = computed(() => {
  if (isGroup) {
    // 群聊：以 senderPeerId 找发送者（自己或好友）
    const senderId = props.record.senderPeerId || (direction === 'sent' ? configStore.peerId : props.record.peerId)
    if (senderId === configStore.peerId) return configStore.avatar
    const friend = friendStore.friends.find((f) => f.peerId === senderId)
    return friend?.avatar
  }
  if (direction === 'sent') {
    return configStore.avatar
  } else {
    const friend = friendStore.friends.find((f) => f.peerId === props.record.peerId)
    return friend?.avatar
  }
})

const displayName = computed(() => {
  if (isGroup) {
    // 群聊：以 senderPeerId 找发送者昵称
    const senderId = props.record.senderPeerId || (direction === 'sent' ? configStore.peerId : props.record.peerId)
    if (senderId === configStore.peerId) return configStore.nickname
    const friend = friendStore.friends.find((f) => f.peerId === senderId)
    return friend?.remark || friend?.nickname || ''
  }
  if (direction === 'sent') {
    return configStore.nickname
  } else {
    const friend = friendStore.friends.find((f) => f.peerId === props.record.peerId)
    return friend?.remark || friend?.nickname || ''
  }
})

function getInitials(name: string): string {
  if (!name) return '?'
  const parts = name.split(/[\s_-]+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return name[0].toUpperCase()
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return '未知大小'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB'
  return (bytes / 1073741824).toFixed(1) + ' GB'
}
</script>

<style scoped>
.message-item {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
  animation: messageSlideIn 0.2s ease-out;
}

@keyframes messageSlideIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 隐藏不显示头像时的间距 */
.message-item:not(.show-avatar) {
  margin-top: -8px;
}

.message-item.sent {
  flex-direction: row-reverse;
  margin-left: auto;
}

.message-item.received {
  flex-direction: row;
  margin-right: auto;
}

/* 头像样式 */
.avatar-wrapper {
  flex-shrink: 0;
  align-self: flex-start;
}

.avatar,
.avatar-placeholder {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  object-fit: cover;
}

.avatar-placeholder {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
}

.avatar-placeholder.self {
  background: linear-gradient(135deg, #4a90e2 0%, #357abd 100%);
}

.avatar-spacer {
  width: 36px;
  flex-shrink: 0;
}

/* 消息主体 */
.message-body {
  display: flex;
  flex-direction: column;
  max-width: 65%;
  gap: 4px;
}

.message-item.sent .message-body {
  align-items: flex-end;
}

.message-item.received .message-body {
  align-items: flex-start;
}

/* V1.4.0: 群聊被 @ 消息高亮 */
.message-body.mentioned .bubble.text-bubble {
  border: 2px solid #07c160;
  box-shadow: 0 0 0 3px rgba(7, 193, 96, 0.15);
}

.mention-indicator {
  font-size: 11px;
  color: #07c160;
  background: rgba(7, 193, 96, 0.1);
  padding: 1px 8px;
  border-radius: 8px;
  align-self: flex-start;
  font-weight: 600;
}

.sender-name {
  font-size: 12px;
  color: #999;
  margin-bottom: 2px;
  padding-left: 4px;
}

/* 气泡包装器 */
.bubble-wrapper {
  display: flex;
  align-items: flex-end;
  gap: 6px;
}

.message-item.sent .bubble-wrapper {
  flex-direction: row-reverse;
}

/* 消息气泡 */
.bubble {
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 14px;
  line-height: 1.5;
  word-break: break-word;
  position: relative;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.text-bubble {
  max-width: 100%;
}

.message-item.sent .text-bubble {
  background: #07c160;
  color: #fff;
  border-top-right-radius: 2px;
}

.message-item.received .text-bubble {
  background: #fff;
  color: #333;
  border-top-left-radius: 2px;
}

/* 图片气泡 */
.image-bubble {
  padding: 4px;
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
}

.image-bubble img {
  max-width: 240px;
  max-height: 240px;
  border-radius: 6px;
  cursor: pointer;
  transition: transform 0.2s;
  display: block;
}

.image-bubble img:hover {
  transform: scale(1.02);
}

/* 文件气泡 */
.file-bubble {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  background: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  cursor: default;
  transition: all 0.2s;
  min-width: 220px;
}

.file-main-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.file-icon {
  color: #07c160;
  flex-shrink: 0;
}

.file-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.file-name {
  font-size: 14px;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-size {
  font-size: 12px;
  color: #999;
}

.file-actions {
  display: flex;
  gap: 8px;
}

.btn-file-accept,
.btn-file-saveas,
.btn-file-reject {
  flex: 1;
  padding: 6px 0;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.btn-file-accept {
  background: #07c160;
  color: #fff;
}

.btn-file-accept:hover {
  background: #06ad56;
}

.btn-file-saveas {
  background: #1890ff;
  color: #fff;
}

.btn-file-saveas:hover {
  background: #096dd9;
}

.btn-file-reject {
  background: #f5f5f5;
  color: #666;
}

.btn-file-reject:hover {
  background: #ff4d4f;
  color: #fff;
}

.file-result {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.file-result-text {
  font-size: 13px;
  color: #999;
}

.file-result-text.accepted {
  color: #07c160;
}

.file-result-text.rejected {
  color: #ff4d4f;
}

.file-save-path {
  font-size: 12px;
  color: #999;
  word-break: break-all;
  line-height: 1.4;
}

/* 撤回消息 */
.recalled-bubble {
  padding: 8px 12px;
  background: transparent;
  font-size: 13px;
  color: #999;
  font-style: italic;
}

/* 气泡内的状态图标 */
.bubble-status {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.status-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

.status-icon.sending {
  color: rgba(255, 255, 255, 0.8);
}

.status-icon.sent {
  color: rgba(255, 255, 255, 0.7);
}

.status-icon.delivered {
  color: rgba(255, 255, 255, 0.9);
}

.status-icon.read {
  color: #fff;
}

.status-icon.failed {
  color: #ff4d4f;
}

.spinner {
  animation: spin 1.5s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 时间戳 */
.message-time {
  font-size: 11px;
  color: #bbb;
  padding: 0 4px;
}

.message-item.sent .message-time {
  text-align: right;
}

.message-item.received .message-time {
  text-align: left;
}
</style>
