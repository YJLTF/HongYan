<template>
  <div class="modal-overlay modal-overlay-nested" @click.self="$emit('close')">
    <div class="invite-dialog">
      <div class="dialog-header">
        <h3>邀请新成员</h3>
        <button class="close-btn" @click="$emit('close')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="dialog-body">
        <div class="hint">仅显示非本群成员的好友（{{ candidateFriends.length }}）</div>
        <div class="friend-picker">
          <div
            v-for="friend in candidateFriends"
            :key="friend.peerId"
            class="friend-chip"
            :class="{ selected: selectedPeerIds.includes(friend.peerId) }"
            @click="togglePeer(friend.peerId)"
          >
            <div class="chip-avatar">
              <img v-if="friend.avatar" :src="friend.avatar" :alt="friend.nickname" />
              <div v-else class="chip-avatar-placeholder">
                {{ friend.nickname[0] }}
              </div>
            </div>
            <span class="chip-name">{{ friend.remark || friend.nickname }}</span>
            <span v-if="selectedPeerIds.includes(friend.peerId)" class="check-mark">✓</span>
          </div>
          <div v-if="candidateFriends.length === 0" class="empty-tip">
            没有可邀请的好友
          </div>
        </div>
        <div v-if="error" class="error-tip">{{ error }}</div>
      </div>
      <div class="dialog-footer">
        <button class="btn-cancel" @click="$emit('close')">取消</button>
        <button class="btn-save" @click="handleInvite" :disabled="selectedPeerIds.length === 0 || inviting">
          {{ inviting ? '邀请中...' : `邀请 (${selectedPeerIds.length})` }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Group, Friend } from '@shared/types'
import { useFriendStore } from '../stores/friend-store'

const props = defineProps<{
  group: Group
}>()

const emit = defineEmits<{
  close: []
  invited: []
}>()

const friendStore = useFriendStore()

const selectedPeerIds = ref<string[]>([])
const inviting = ref(false)
const error = ref('')

const candidateFriends = computed<Friend[]>(() => {
  const memberSet = new Set(props.group.members.map(m => m.peerId))
  return friendStore.friends.filter(f => !memberSet.has(f.peerId))
})

function togglePeer(peerId: string) {
  const idx = selectedPeerIds.value.indexOf(peerId)
  if (idx >= 0) {
    selectedPeerIds.value.splice(idx, 1)
  } else {
    selectedPeerIds.value.push(peerId)
  }
}

async function handleInvite() {
  if (selectedPeerIds.value.length === 0 || inviting.value) return
  error.value = ''
  inviting.value = true
  try {
    const result = await window.electronAPI.invoke('group:invite', props.group.groupId, [...selectedPeerIds.value])
    if (result?.error) {
      error.value = result.error
      return
    }
    emit('invited')
  } catch (err: any) {
    error.value = err?.message || '邀请失败'
  } finally {
    inviting.value = false
  }
}
</script>

<style scoped>
.modal-overlay-nested {
  z-index: 1100;
  background: rgba(0, 0, 0, 0.6);
}

.invite-dialog {
  background: #fff;
  border-radius: 16px;
  width: 90%;
  max-width: 480px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
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
  transform: rotate(90deg);
}

.dialog-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
}

.hint {
  font-size: 12px;
  color: #999;
  margin-bottom: 12px;
}

.friend-picker {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px;
  max-height: 320px;
  overflow-y: auto;
  padding: 4px;
}

.friend-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  background: #f5f5f5;
  border: 2px solid transparent;
  border-radius: 10px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}

.friend-chip:hover {
  background: #e8e8e8;
}

.friend-chip.selected {
  background: rgba(7, 193, 96, 0.1);
  border-color: #07c160;
  color: #07c160;
}

.chip-avatar {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
}

.chip-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.chip-avatar-placeholder {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
}

.chip-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.check-mark {
  color: #07c160;
  font-weight: bold;
}

.empty-tip {
  grid-column: 1 / -1;
  text-align: center;
  color: #999;
  font-size: 13px;
  padding: 20px;
}

.error-tip {
  margin-top: 12px;
  padding: 8px 12px;
  background: #fff1f0;
  border: 1px solid #ffccc7;
  color: #ff4d4f;
  border-radius: 8px;
  font-size: 13px;
}

.dialog-footer {
  padding: 16px 20px;
  border-top: 1px solid #f0f0f0;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.btn-cancel, .btn-save {
  padding: 10px 20px;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-cancel {
  background: #f5f5f5;
  color: #666;
}

.btn-cancel:hover {
  background: #e8e8e8;
}

.btn-save {
  background: linear-gradient(135deg, #07c160 0%, #06ad56 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(7, 193, 96, 0.3);
}

.btn-save:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(7, 193, 96, 0.4);
}

.btn-save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
