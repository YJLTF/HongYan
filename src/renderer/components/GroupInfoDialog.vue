<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="group-info-dialog">
      <div class="dialog-header">
        <h3>群信息</h3>
        <button class="close-btn" @click="$emit('close')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="dialog-body">
        <div class="group-summary">
          <div class="group-avatar">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
            </svg>
          </div>
          <div class="group-meta">
            <div v-if="!editingName" class="group-name-row" @click="startEditName">
              <span class="group-name">{{ group.groupName }}</span>
              <button v-if="isOwner" class="edit-name-btn" title="修改群名">✎</button>
            </div>
            <input
              v-else
              v-model="newName"
              class="name-input"
              @keyup.enter="saveName"
              @keyup.esc="cancelEditName"
              @blur="saveName"
              ref="nameInput"
              maxlength="30"
            />
            <div class="group-sub">
              群主：{{ ownerNickname }} · {{ group.members.length }} 人
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">
            成员 ({{ group.members.length }})
            <button v-if="isOwner" class="invite-btn" @click="showInvite = true">+ 邀请</button>
          </div>
          <div class="member-list">
            <div v-for="m in group.members" :key="m.peerId" class="member-item">
              <div class="member-avatar">
                <img v-if="getMemberAvatar(m.peerId)" :src="getMemberAvatar(m.peerId)" :alt="m.nickname" />
                <div v-else class="member-avatar-placeholder">
                  {{ m.nickname[0] }}
                </div>
              </div>
              <div class="member-info">
                <div class="member-name">
                  {{ m.nickname }}
                  <span v-if="m.role === 'owner'" class="owner-badge">群主</span>
                  <span v-else-if="m.peerId === selfPeerId" class="self-badge">我</span>
                </div>
                <div class="member-status">
                  <span v-if="isOnline(m.peerId)" class="online-dot"></span>
                  {{ isOnline(m.peerId) ? '在线' : '离线' }}
                </div>
              </div>
              <button
                v-if="isOwner && m.peerId !== selfPeerId"
                class="kick-btn"
                @click="handleKick(m.peerId, m.nickname)"
                title="踢出"
              >
                踢出
              </button>
            </div>
          </div>
        </div>
      </div>
      <div class="dialog-footer">
        <button v-if="isOwner" class="btn-danger" @click="handleDismiss">解散群聊</button>
        <button v-else class="btn-danger" @click="handleLeave">退出群聊</button>
        <button class="btn-cancel" @click="$emit('close')">关闭</button>
      </div>
    </div>

    <InviteMembersDialog
      v-if="showInvite"
      :group="group"
      @close="showInvite = false"
      @invited="onInvited"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Group, Friend } from '@shared/types'
import { useConfigStore } from '../stores/config-store'
import { useFriendStore } from '../stores/friend-store'
import { useGroupStore } from '../stores/group-store'
import InviteMembersDialog from './InviteMembersDialog.vue'

const props = defineProps<{
  group: Group
}>()

const emit = defineEmits<{
  close: []
  left: []
  dismissed: []
}>()

const configStore = useConfigStore()
const friendStore = useFriendStore()
const groupStore = useGroupStore()

const selfPeerId = computed(() => configStore.peerId)
const isOwner = computed(() => props.group.ownerPeerId === selfPeerId.value)
const ownerNickname = computed(() => {
  const owner = props.group.members.find(m => m.peerId === props.group.ownerPeerId)
  return owner?.nickname || '未知'
})

const editingName = ref(false)
const newName = ref('')
const nameInput = ref<HTMLInputElement | null>(null)
const showInvite = ref(false)

function startEditName() {
  if (!isOwner.value) return
  newName.value = props.group.groupName
  editingName.value = true
  setTimeout(() => nameInput.value?.focus(), 50)
}

async function saveName() {
  if (!editingName.value) return
  const name = newName.value.trim()
  editingName.value = false
  if (!name || name === props.group.groupName) return
  try {
    const result = await window.electronAPI.invoke('group:update-name', props.group.groupId, name)
    if (result?.error) alert(result.error)
  } catch (err: any) {
    alert(err?.message || '修改失败')
  }
}

function cancelEditName() {
  editingName.value = false
  newName.value = ''
}

function getMemberAvatar(peerId: string): string | undefined {
  if (peerId === selfPeerId.value) return configStore.avatar
  const f: Friend | undefined = friendStore.friends.find(x => x.peerId === peerId)
  return f?.avatar
}

function isOnline(peerId: string): boolean {
  if (peerId === selfPeerId.value) return true
  const f = friendStore.friends.find(x => x.peerId === peerId)
  return f?.online === true
}

async function handleKick(peerId: string, nickname: string) {
  if (!confirm(`确定踢出「${nickname}」吗？`)) return
  const result = await window.electronAPI.invoke('group:kick', props.group.groupId, peerId)
  if (result?.error) {
    alert(result.error)
  } else {
    // 本地刷新
    const refreshed = await window.electronAPI.invoke('group:list')
    if (refreshed?.groups) groupStore.setGroups(refreshed.groups)
  }
}

async function handleLeave() {
  if (!confirm('确定退出该群吗？')) return
  const result = await window.electronAPI.invoke('group:leave', props.group.groupId)
  if (result?.error) {
    alert(result.error)
  } else {
    groupStore.removeGroup(props.group.groupId)
    emit('left')
  }
}

async function handleDismiss() {
  if (!confirm(`确定解散群「${props.group.groupName}」吗？此操作不可撤销。`)) return
  const result = await window.electronAPI.invoke('group:dismiss', props.group.groupId)
  if (result?.error) {
    alert(result.error)
  } else {
    groupStore.removeGroup(props.group.groupId)
    emit('dismissed')
  }
}

async function onInvited() {
  showInvite.value = false
  const refreshed = await window.electronAPI.invoke('group:list')
  if (refreshed?.groups) groupStore.setGroups(refreshed.groups)
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }

.group-info-dialog {
  background: #fff;
  border-radius: 16px;
  width: 90%;
  max-width: 520px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
  animation: scaleIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes scaleIn {
  from { opacity: 0; transform: scale(0.95) }
  to { opacity: 1; transform: scale(1) }
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px;
  border-bottom: 1px solid #f0f0f0;
  background: linear-gradient(180deg, #fafafa 0%, #fff 100%);
}

.dialog-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.close-btn {
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

.close-btn:hover {
  background: #f5f5f5;
  color: #333;
  transform: rotate(90deg);
}

.dialog-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.group-summary {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-bottom: 20px;
  border-bottom: 1px solid #f5f5f5;
  margin-bottom: 20px;
}

.group-avatar {
  width: 64px;
  height: 64px;
  border-radius: 12px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.group-meta {
  flex: 1;
  min-width: 0;
}

.group-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.group-name {
  font-size: 18px;
  font-weight: 600;
  color: #333;
}

.edit-name-btn {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 6px;
  background: #f5f5f5;
  color: #666;
  cursor: pointer;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.edit-name-btn:hover {
  background: #07c160;
  color: white;
}

.name-input {
  width: 100%;
  padding: 6px 10px;
  border: 2px solid #07c160;
  border-radius: 6px;
  font-size: 16px;
  font-weight: 600;
  outline: none;
  box-sizing: border-box;
  margin-bottom: 4px;
}

.group-sub {
  font-size: 12px;
  color: #999;
}

.section {
  margin-bottom: 20px;
}

.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 600;
  color: #666;
  margin-bottom: 12px;
}

.invite-btn {
  padding: 4px 12px;
  border: 1px solid #07c160;
  border-radius: 6px;
  background: transparent;
  color: #07c160;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}

.invite-btn:hover {
  background: #07c160;
  color: white;
}

.member-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.member-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: #fafafa;
  border-radius: 10px;
  transition: background 0.2s;
}

.member-item:hover {
  background: #f5f5f5;
}

.member-avatar {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
}

.member-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.member-avatar-placeholder {
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

.member-info {
  flex: 1;
  min-width: 0;
}

.member-name {
  font-size: 14px;
  color: #333;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
}

.owner-badge, .self-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
  font-weight: normal;
}

.owner-badge {
  background: #07c160;
  color: white;
}

.self-badge {
  background: #e8e8e8;
  color: #666;
}

.member-status {
  font-size: 12px;
  color: #999;
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
}

.online-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #07c160;
}

.kick-btn {
  padding: 4px 10px;
  border: 1px solid #ffccc7;
  border-radius: 6px;
  background: transparent;
  color: #ff4d4f;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}

.kick-btn:hover {
  background: #ff4d4f;
  color: white;
  border-color: #ff4d4f;
}

.dialog-footer {
  padding: 16px 20px;
  border-top: 1px solid #f0f0f0;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  background: linear-gradient(0deg, #fafafa 0%, #fff 100%);
}

.btn-cancel, .btn-danger {
  padding: 8px 18px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
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

.btn-danger {
  background: #fff1f0;
  color: #ff4d4f;
  border: 1px solid #ffccc7;
}

.btn-danger:hover {
  background: #ff4d4f;
  color: white;
  border-color: #ff4d4f;
}
</style>
