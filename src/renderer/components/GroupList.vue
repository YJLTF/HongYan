<template>
  <div class="group-list">
    <div class="list-header">
      <span class="title">群聊</span>
      <button class="create-btn" @click="showCreateDialog = true" title="创建群聊">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>
    </div>
    <div class="list-content">
      <div
        v-for="group in groups"
        :key="group.groupId"
        class="group-item"
        :class="{ selected: group.groupId === selectedGroupId }"
        @click="$emit('selectGroup', group.groupId)"
      >
        <div class="avatar-wrapper">
          <div class="avatar-placeholder group-avatar">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
            </svg>
          </div>
          <span v-if="groupStore.getUnread(group.groupId) > 0" class="unread-badge">
            {{ groupStore.getUnread(group.groupId) > 99 ? '99+' : groupStore.getUnread(group.groupId) }}
          </span>
        </div>
        <div class="group-info">
          <div class="name-row">
            <span class="group-name">{{ group.groupName }}</span>
            <span class="member-count">{{ group.members.length }}人</span>
          </div>
          <div class="meta-row">
            <span class="last-preview">{{ lastPreview(group) }}</span>
          </div>
        </div>
      </div>
      <div v-if="groups.length === 0" class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
        </svg>
        <p>暂无群聊</p>
        <span class="hint">点击右上角"+"创建群聊</span>
      </div>
    </div>

    <CreateGroupDialog
      v-if="showCreateDialog"
      @close="showCreateDialog = false"
      @created="onGroupCreated"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { Group, ChatRecord } from '@shared/types'
import { useConfigStore } from '../stores/config-store'
import { useGroupStore } from '../stores/group-store'
import CreateGroupDialog from './CreateGroupDialog.vue'

defineProps<{
  groups: Group[]
  selectedGroupId: string
  lastMessages: Record<string, ChatRecord>
}>()

const emit = defineEmits<{
  selectGroup: [groupId: string]
  groupCreated: [group: Group]
}>()

const configStore = useConfigStore()
const groupStore = useGroupStore()
const showCreateDialog = ref(false)

function lastPreview(group: Group): string {
  const self = configStore.peerId
  const others = group.members.filter(m => m.peerId !== self)
  const names = others.slice(0, 3).map(m => m.nickname).join('、')
  if (others.length > 3) return `${names}等 ${others.length + 1} 人`
  return names || '仅自己'
}

function onGroupCreated(group: Group) {
  showCreateDialog.value = false
  emit('groupCreated', group)
}
</script>

<style scoped>
.group-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #fff;
  overflow: hidden;
}

.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid #e8e8e8;
  background: linear-gradient(180deg, #fafafa 0%, #fff 100%);
}

.title {
  font-size: 15px;
  font-weight: 600;
  color: #333;
}

.create-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #07c160;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.create-btn:hover {
  background: rgba(7, 193, 96, 0.1);
  transform: scale(1.05);
}

.list-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.group-item {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  cursor: pointer;
  transition: all 0.2s;
  border-left: 3px solid transparent;
}

.group-item:hover {
  background: #f5f5f5;
}

.group-item.selected {
  background: #e8f5e9;
  border-left-color: #07c160;
}

.avatar-wrapper {
  position: relative;
  margin-right: 12px;
  flex-shrink: 0;
}

.avatar-placeholder {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar-placeholder.group-avatar {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
}

.unread-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  background: #ff4d4f;
  color: white;
  border-radius: 9px;
  font-size: 11px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid #fff;
}

.group-info {
  flex: 1;
  min-width: 0;
}

.name-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 4px;
}

.group-name {
  font-size: 14px;
  font-weight: 500;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.member-count {
  font-size: 11px;
  color: #999;
  flex-shrink: 0;
}

.meta-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #999;
}

.last-preview {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
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
  background: #bbb;
}
</style>
