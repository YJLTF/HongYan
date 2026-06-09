<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="create-group-dialog">
      <div class="dialog-header">
        <h3>创建群聊</h3>
        <button class="close-btn" @click="$emit('close')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="dialog-body">
        <div class="form-row">
          <label>群名称</label>
          <input
            v-model="groupName"
            type="text"
            placeholder="请输入群名称"
            maxlength="30"
            ref="nameInput"
          />
        </div>
        <div class="form-row">
          <label>选择成员 ({{ selectedPeerIds.length }})</label>
          <div class="friend-picker">
            <div
              v-for="friend in onlineFriends"
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
            <div v-if="onlineFriends.length === 0" class="empty-tip">
              暂无可用好友（需要在线好友）
            </div>
          </div>
        </div>
        <div v-if="error" class="error-tip">{{ error }}</div>
      </div>
      <div class="dialog-footer">
        <button class="btn-cancel" @click="$emit('close')">取消</button>
        <button class="btn-save" @click="handleCreate" :disabled="!canCreate || creating">
          {{ creating ? '创建中...' : '创建' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { Group, Friend } from '@shared/types'
import { useFriendStore } from '../stores/friend-store'

const emit = defineEmits<{
  close: []
  created: [group: Group]
}>()

const friendStore = useFriendStore()

const groupName = ref('')
const selectedPeerIds = ref<string[]>([])
const creating = ref(false)
const error = ref('')
const nameInput = ref<HTMLInputElement | null>(null)

const onlineFriends = computed<Friend[]>(() => friendStore.friends.filter(f => f.online))

const canCreate = computed(() => groupName.value.trim().length > 0 && selectedPeerIds.value.length >= 1)

function togglePeer(peerId: string) {
  const idx = selectedPeerIds.value.indexOf(peerId)
  if (idx >= 0) {
    selectedPeerIds.value.splice(idx, 1)
  } else {
    selectedPeerIds.value.push(peerId)
  }
}

async function handleCreate() {
  if (!canCreate.value || creating.value) return
  error.value = ''
  creating.value = true
  try {
    const result = await window.electronAPI.invoke('group:create', groupName.value.trim(), [...selectedPeerIds.value])
    if (result?.error) {
      error.value = result.error
      return
    }
    if (result?.group) {
      emit('created', result.group)
    }
  } catch (err: any) {
    error.value = err?.message || '创建失败'
  } finally {
    creating.value = false
  }
}

onMounted(() => {
  nameInput.value?.focus()
})
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

.create-group-dialog {
  background: #fff;
  border-radius: 16px;
  width: 90%;
  max-width: 480px;
  max-height: 80vh;
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

.form-row {
  margin-bottom: 20px;
}

.form-row label {
  display: block;
  font-size: 13px;
  color: #333;
  margin-bottom: 10px;
  font-weight: 600;
}

.form-row input {
  width: 100%;
  padding: 12px 16px;
  border: 2px solid #e8e8e8;
  border-radius: 10px;
  font-size: 14px;
  outline: none;
  transition: all 0.3s;
  box-sizing: border-box;
}

.form-row input:focus {
  border-color: #07c160;
  box-shadow: 0 0 0 4px rgba(7, 193, 96, 0.1);
}

.friend-picker {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px;
  max-height: 240px;
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
  position: relative;
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
  margin-top: 8px;
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

.btn-cancel,
.btn-save {
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
  transform: translateY(-1px);
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
