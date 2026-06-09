<template>
  <div class="group-chat-view" v-if="currentGroup">
    <header class="chat-header">
      <div class="header-left">
        <div class="avatar-wrapper">
          <div class="avatar-placeholder group-avatar">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
            </svg>
          </div>
        </div>
        <div class="group-info">
          <h3 class="name" @click="openGroupInfo">{{ currentGroup.groupName }}</h3>
          <p class="status-text">{{ currentGroup.members.length }} 人</p>
        </div>
      </div>
      <div class="header-actions">
        <button class="action-btn" title="群信息" @click="openGroupInfo">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
        </button>
      </div>
    </header>

    <div class="messages-container" ref="messagesContainer">
      <div class="messages-list">
        <template v-for="(msg, index) in sortedMessages" :key="msg.id || `idx-${index}`">
          <div v-if="shouldShowTimeDivider(index)" class="time-divider">
            <span>{{ formatTimeDivider(msg.timestamp) }}</span>
          </div>
          <MessageBubble
            :record="msg"
            :showAvatar="shouldShowAvatar(index)"
            @viewImage="(c: string) => $emit('viewImage', c)"
            @downloadFile="handleDownloadFile"
          />
        </template>
        <div v-if="sortedMessages.length === 0" class="empty-chat">
          <div class="empty-icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
            </svg>
          </div>
          <p>开始群聊</p>
          <span class="hint">发送一条消息开启群聊</span>
        </div>
      </div>
    </div>

    <MessageInput
      :peerId="currentGroup.groupId"
      :isGroup="true"
      :groupMembers="currentGroup.members"
      @sendText="handleSendText"
      @sendImage="handleSendImage"
      @sendFile="handleSendFile"
    />

    <GroupInfoDialog
      v-if="showGroupInfo"
      :group="currentGroup"
      @close="showGroupInfo = false"
      @left="onLeftOrDismissed"
      @dismissed="onLeftOrDismissed"
    />
  </div>

  <div class="empty-state" v-else>
    <div class="empty-icon">
      <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
        <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
      </svg>
    </div>
    <h3>选择一个群开始聊天</h3>
    <p>点击左侧群列表中的群开始群聊</p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import type { ChatRecord, Group } from '@shared/types'
import { useGroupStore } from '../stores/group-store'
import { useConfigStore } from '../stores/config-store'
import MessageBubble from './MessageBubble.vue'
import MessageInput from './MessageInput.vue'
import GroupInfoDialog from './GroupInfoDialog.vue'

const emit = defineEmits<{
  viewImage: [content: string]
}>()

const groupStore = useGroupStore()
const configStore = useConfigStore()

const showGroupInfo = ref(false)
const messagesContainer = ref<HTMLElement | null>(null)

const currentGroup = computed<Group | undefined>(() => groupStore.currentGroup)

const sortedMessages = computed(() => {
  return [...groupStore.messages].sort((a, b) => a.timestamp - b.timestamp)
})

function openGroupInfo() {
  showGroupInfo.value = true
}

function onLeftOrDismissed() {
  showGroupInfo.value = false
}

async function handleSendText(content: string, mentions?: string[], mentionedAll?: boolean) {
  const group = currentGroup.value
  if (!group) return
  const result = await window.electronAPI.invoke('group:send-text', group.groupId, content, mentions || [], !!mentionedAll)
  if (result?.error) {
    alert(result.error)
    return
  }
  // 本地刷新（主进程已 push，但保险起见重读）
  const refreshed = await window.electronAPI.invoke('group:load-history', group.groupId)
  if (refreshed?.records) {
    groupStore.setMessages(group.groupId, refreshed.records)
  }
}

async function handleSendImage(filePath: string) {
  const group = currentGroup.value
  if (!group) return
  const result = await window.electronAPI.invoke('group:send-image', group.groupId, filePath)
  if (result?.error) {
    alert(result.error)
    return
  }
  const refreshed = await window.electronAPI.invoke('group:load-history', group.groupId)
  if (refreshed?.records) {
    groupStore.setMessages(group.groupId, refreshed.records)
  }
}

async function handleSendFile(filePath: string) {
  const group = currentGroup.value
  if (!group) return
  const result = await window.electronAPI.invoke('group:send-file', group.groupId, filePath)
  if (result?.error) {
    alert(result.error)
    return
  }
  const refreshed = await window.electronAPI.invoke('group:load-history', group.groupId)
  if (refreshed?.records) {
    groupStore.setMessages(group.groupId, refreshed.records)
  }
}

async function handleDownloadFile(record: any) {
  // V1.4.0: 群聊文件下载 = 通知原发送方把已暂存的文件发过来
  const group = currentGroup.value
  if (!group) return
  const senderPeerId = record.senderPeerId
  if (!senderPeerId) {
    alert('无法定位文件发送方')
    return
  }
  // 推断保存路径
  const downloadDir = configStore.downloadPath || ''
  const safeName = record.fileName || 'download'
  const defaultPath = downloadDir ? `${downloadDir}\\${safeName}` : safeName
  const result = await window.electronAPI.invoke(
    'file:request-group-file',
    group.groupId,
    record.id,
    senderPeerId,
    defaultPath,
  )
  if (result?.error) {
    alert(result.error)
  }
}

function shouldShowTimeDivider(index: number): boolean {
  if (index === 0) return true
  const current = sortedMessages.value[index]
  const prev = sortedMessages.value[index - 1]
  if (!current || !prev) return false
  return current.timestamp - prev.timestamp > 5 * 60 * 1000
}

function shouldShowAvatar(index: number): boolean {
  if (index === 0) return true
  const current = sortedMessages.value[index]
  const prev = sortedMessages.value[index - 1]
  if (!current || !prev) return false
  if (shouldShowTimeDivider(index)) return true
  // 群聊中不同发送者切换时显示头像
  if ((current.senderPeerId || current.peerId) !== (prev.senderPeerId || prev.peerId)) return true
  if (current.timestamp - prev.timestamp > 2 * 60 * 1000) return true
  return false
}

function formatTimeDivider(timestamp: number): string {
  const now = new Date()
  const d = new Date(timestamp)
  const diff = now.getTime() - d.getTime()
  if (diff < 24 * 60 * 60 * 1000 && now.getDate() === d.getDate()) {
    return formatTime(d)
  }
  if (diff < 48 * 60 * 60 * 1000 && now.getDate() - d.getDate() === 1) {
    return `昨天 ${formatTime(d)}`
  }
  return `${d.getMonth() + 1}月${d.getDate()}日 ${formatTime(d)}`
}

function formatTime(d: Date): string {
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

watch(() => groupStore.messages.length, () => {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}, { flush: 'post' })

watch(() => groupStore.selectedGroupId, (newId) => {
  if (newId) {
    nextTick(() => {
      if (messagesContainer.value) {
        messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
      }
    })
  }
})
</script>

<style scoped>
.group-chat-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  background: #f5f5f5;
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: #fff;
  border-bottom: 1px solid #e8e8e8;
  flex-shrink: 0;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.avatar-wrapper {
  position: relative;
}

.avatar-placeholder {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.avatar-placeholder.group-avatar {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
}

.group-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.name {
  font-size: 15px;
  font-weight: 600;
  color: #333;
  margin: 0;
  cursor: pointer;
}

.name:hover {
  color: #07c160;
}

.status-text {
  font-size: 12px;
  color: #999;
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
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

.action-btn:hover {
  background: #f5f5f5;
  color: #07c160;
  transform: scale(1.05);
}

.messages-container {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 0;
}

.messages-list {
  width: 100%;
  padding: 0 24px;
  box-sizing: border-box;
}

.time-divider {
  text-align: center;
  margin: 20px 0;
}

.time-divider span {
  display: inline-block;
  padding: 6px 16px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 20px;
  font-size: 12px;
  color: #999;
  backdrop-filter: blur(10px);
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

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
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

.messages-container::-webkit-scrollbar {
  width: 6px;
}
.messages-container::-webkit-scrollbar-track { background: transparent; }
.messages-container::-webkit-scrollbar-thumb { background: #ddd; border-radius: 3px; }
.messages-container::-webkit-scrollbar-thumb:hover { background: #bbb; }
</style>
