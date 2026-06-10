<template>
  <div class="notification-container">
    <transition-group name="notification-slide">
      <div 
        v-for="notification in notifications" 
        :key="notification.id"
        class="notification-toast"
        :class="notification.type"
        @click="handleClick(notification)"
      >
        <div class="notification-icon">
          <svg v-if="notification.type === 'message'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <svg v-else-if="notification.type === 'file'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
            <polyline points="13 2 13 9 20 9"/>
          </svg>
          <svg v-else-if="notification.type === 'friend'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
        </div>
        <div class="notification-content">
          <div class="notification-title">{{ notification.title }}</div>
          <div class="notification-message">{{ notification.message }}</div>
        </div>
        <button class="notification-close" @click.stop="closeNotification(notification.id)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    </transition-group>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useFriendStore } from '../stores/friend-store'
import { useChatStore } from '../stores/chat-store'
import { formatSize } from '@shared/format'

interface Notification {
  id: string
  type: 'message' | 'file' | 'friend' | 'info'
  title: string
  message: string
  data?: any
  timestamp: number
}

const notifications = ref<Notification[]>([])
const friendStore = useFriendStore()
const chatStore = useChatStore()

let notificationId = 0
let cleanupFunctions: Array<() => void> = []

function generateId(): string {
  return `notification-${++notificationId}-${Date.now()}`
}

function showNotification(
  type: 'message' | 'file' | 'friend' | 'info',
  title: string,
  message: string,
  data?: any,
  duration: number = 5000
): string {
  const id = generateId()
  const notification: Notification = {
    id,
    type,
    title,
    message,
    data,
    timestamp: Date.now()
  }
  
  notifications.value.push(notification)
  
  // 自动关闭
  if (duration > 0) {
    setTimeout(() => {
      closeNotification(id)
    }, duration)
  }
  
  return id
}

function closeNotification(id: string) {
  const index = notifications.value.findIndex(n => n.id === id)
  if (index !== -1) {
    notifications.value.splice(index, 1)
  }
}

function handleClick(notification: Notification) {
  // 根据通知类型执行不同操作
  if (notification.type === 'message') {
    // 切换到聊天页面并选择对应好友
    const peerId = notification.data?.peerId
    if (peerId) {
      friendStore.selectFriend(peerId)
      // 触发切换视图事件
      window.dispatchEvent(new CustomEvent('switch-to-chat'))
    }
  } else if (notification.type === 'file') {
    // 打开文件传输窗口
    window.dispatchEvent(new CustomEvent('open-file-transfers'))
  }
  
  closeNotification(notification.id)
}

// 监听来自后端的消息
onMounted(() => {
  // 监听新消息
  cleanupFunctions.push(
    window.electronAPI.on('message:received', (msg: any) => {
      const peerId = msg.peerId || msg.fromPeerId
      const friend = friendStore.friends.find(f => f.peerId === peerId)
      const friendName = friend?.remark || friend?.nickname || '未知好友'
      
      let messageText = ''
      if (msg.type === 'text') {
        messageText = msg.content
      } else if (msg.type === 'image') {
        messageText = '[图片]'
      } else if (msg.type === 'file') {
        messageText = `[文件] ${msg.fileName}`
      }
      
      showNotification(
        'message',
        `${friendName}`,
        messageText,
        { peerId, messageId: msg.id },
        5000
      )
    })
  )
  
  // 监听文件传输请求
  cleanupFunctions.push(
    window.electronAPI.on('file:transfer-request', (req: any) => {
      const peerId = req.fromPeerId
      const friend = friendStore.friends.find(f => f.peerId === peerId)
      const friendName = friend?.remark || friend?.nickname || '未知好友'
      
      showNotification(
        'file',
        '文件传输请求',
        `${friendName} 想要发送文件 "${req.fileName}" (${formatSize(req.fileSize)})`,
        { transferId: req.transferId, fileName: req.fileName },
        10000
      )
    })
  )
  
  // 监听好友上线
  cleanupFunctions.push(
    window.electronAPI.on('friend:online', (friend: any) => {
      showNotification(
        'friend',
        '好友上线',
        `${friend.remark || friend.nickname} 已上线`,
        { peerId: friend.peerId },
        3000
      )
    })
  )
})

onUnmounted(() => {
  cleanupFunctions.forEach(fn => fn())
})

// 暴露方法供外部调用
defineExpose({
  showNotification,
  closeNotification
})
</script>

<style scoped>
.notification-container {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 10px;
  pointer-events: none;
}

.notification-toast {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  min-width: 300px;
  max-width: 400px;
  cursor: pointer;
  pointer-events: auto;
  transition: all 0.3s ease;
  animation: slideInRight 0.3s ease-out;
}

@keyframes slideInRight {
  from {
    opacity: 0;
    transform: translateX(100%);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.notification-toast:hover {
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
  transform: translateY(-2px);
}

.notification-toast.message {
  border-left: 4px solid #07c160;
}

.notification-toast.file {
  border-left: 4px solid #1890ff;
}

.notification-toast.friend {
  border-left: 4px solid #faad14;
}

.notification-toast.info {
  border-left: 4px solid #999;
}

.notification-icon {
  flex-shrink: 0;
  color: #666;
}

.notification-toast.message .notification-icon {
  color: #07c160;
}

.notification-toast.file .notification-icon {
  color: #1890ff;
}

.notification-toast.friend .notification-icon {
  color: #faad14;
}

.notification-content {
  flex: 1;
  min-width: 0;
}

.notification-title {
  font-size: 14px;
  font-weight: 600;
  color: #333;
  margin-bottom: 4px;
}

.notification-message {
  font-size: 13px;
  color: #666;
  line-height: 1.4;
  word-break: break-word;
}

.notification-close {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
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

.notification-close:hover {
  background: #f5f5f5;
  color: #333;
}

/* 过渡动画 */
.notification-slide-enter-active,
.notification-slide-leave-active {
  transition: all 0.3s ease;
}

.notification-slide-enter-from {
  opacity: 0;
  transform: translateX(100%);
}

.notification-slide-leave-to {
  opacity: 0;
  transform: translateX(100%);
}

.notification-slide-move {
  transition: transform 0.3s ease;
}
</style>
