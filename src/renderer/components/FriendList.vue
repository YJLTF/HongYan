<template>
  <div class="friend-list">
    <div class="list-content">
      <div
        v-for="friend in friends"
        :key="friend.peerId"
        class="friend-item"
        :class="{ 
          selected: friend.peerId === selectedPeerId, 
          offline: !friend.online 
        }"
        @click="$emit('selectFriend', friend.peerId)"
      >
        <div class="avatar-wrapper">
          <img 
            v-if="friend.avatar" 
            :src="friend.avatar" 
            :alt="friend.nickname"
            class="avatar"
          />
          <div v-else class="avatar-placeholder">
            {{ getInitials(friend.remark || friend.nickname) }}
          </div>
          <span class="status-indicator" :class="{ online: friend.online }"></span>
        </div>
        <div class="friend-info">
          <div class="name-row">
            <span class="nickname">{{ friend.remark || friend.nickname }}</span>
            <span v-if="friend.remark" class="original-name">{{ friend.nickname }}</span>
          </div>
          <div class="meta-row">
            <span class="ip">{{ friend.ip }}</span>
            <span v-if="!friend.online" class="last-seen">{{ formatLastSeen(friend.lastSeen) }}</span>
          </div>
        </div>
      </div>
      <div v-if="friends.length === 0" class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        <p>暂无在线好友</p>
        <span class="hint">点击"扫描"按钮发现局域网内的用户</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Friend } from '@shared/types'

defineProps<{
  friends: Friend[]
  selectedPeerId: string
}>()

defineEmits<{
  selectFriend: [peerId: string]
}>()

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
  
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
  
  const date = new Date(timestamp)
  return `${date.getMonth() + 1}/${date.getDate()}`
}
</script>

<style scoped>
.friend-list {
  flex: 1;
  overflow-y: auto;
  background: #fff;
}

.list-content {
  padding: 8px 0;
}

.friend-item {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  cursor: pointer;
  transition: all 0.2s;
  border-left: 3px solid transparent;
}

.friend-item:hover {
  background: #f5f5f5;
}

.friend-item.selected {
  background: #e8f5e9;
  border-left-color: #07c160;
}

.friend-item.offline {
  opacity: 0.6;
}

.avatar-wrapper {
  position: relative;
  margin-right: 12px;
  flex-shrink: 0;
}

.avatar,
.avatar-placeholder {
  width: 48px;
  height: 48px;
  border-radius: 8px;
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

.status-indicator {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #ccc;
  border: 2px solid #fff;
}

.status-indicator.online {
  background: #07c160;
}

.friend-info {
  flex: 1;
  min-width: 0;
}

.name-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 4px;
}

.nickname {
  font-size: 14px;
  font-weight: 500;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.original-name {
  font-size: 12px;
  color: #999;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #999;
}

.ip {
  color: #bbb;
}

.last-seen {
  color: #ccc;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: #999;
  text-align: center;
}

.empty-state svg {
  margin-bottom: 16px;
  opacity: 0.3;
}

.empty-state p {
  font-size: 14px;
  margin-bottom: 8px;
  color: #666;
}

.hint {
  font-size: 12px;
  color: #bbb;
}

/* 滚动条样式 */
.list-content::-webkit-scrollbar {
  width: 6px;
}

.list-content::-webkit-scrollbar-track {
  background: transparent;
}

.list-content::-webkit-scrollbar-thumb {
  background: #ddd;
  border-radius: 3px;
}

.list-content::-webkit-scrollbar-thumb:hover {
  background: #ccc;
}
</style>
