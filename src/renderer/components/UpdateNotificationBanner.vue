<template>
  <div v-if="visibleItems.length > 0 || debugMode" class="update-banner-list">
    <!-- V1.5.0 调试: 横幅不可见时也提供手动刷新入口，避免 push 事件丢失后无法看到 -->
    <div v-if="visibleItems.length === 0 && debugMode" class="update-banner debug">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <span class="banner-text">
        <strong>暂无更新提示</strong>
        <span v-if="updateStore.availableList.length > 0" class="note">
          （{{ updateStore.availableList.length }} 条已忽略，<a @click="handleClearDismissed">清除忽略</a>）
        </span>
      </span>
      <button class="btn-debug" @click.stop="handleManualRefresh" title="手动刷新">刷新</button>
    </div>
    <div
      v-for="item in visibleItems"
      :key="item.publisherPeerId + ':' + item.targetVersion"
      class="update-banner"
      @click="handleView(item)"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="16 16 12 12 8 16"/>
        <line x1="12" y1="12" x2="12" y2="21"/>
        <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
      </svg>
      <span class="banner-text">
        <strong>{{ item.publisherNickname }}</strong> 发布了新版本
        <strong>v{{ item.targetVersion }}</strong>
        <span v-if="item.note" class="note">— {{ item.note.slice(0, 30) }}{{ item.note.length > 30 ? '...' : '' }}</span>
      </span>
      <button class="btn-dismiss" @click.stop="handleDismiss(item)" title="忽略">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useUpdateStore } from '../stores/update-store'
import type { AvailableUpdate } from '@shared/types'

const emit = defineEmits<{ view: [AvailableUpdate] }>()
const updateStore = useUpdateStore()
const debugMode = ref(false)

const visibleItems = computed(() =>
  updateStore.availableList.filter(r => !r.dismissed)
)

async function handleView(item: AvailableUpdate) {
  emit('view', item)
}

async function handleDismiss(item: AvailableUpdate) {
  await updateStore.dismissAvailable(item.publisherPeerId, item.targetVersion)
}

async function handleClearDismissed() {
  for (const r of updateStore.availableList) {
    if (r.dismissed) {
      await updateStore.dismissAvailable(r.publisherPeerId, r.targetVersion)
    }
  }
}

async function handleManualRefresh() {
  await updateStore.refreshAvailable()
}

let cleanups: (() => void)[] = []
onMounted(() => {
  cleanups.push(window.electronAPI.on('update:available', (rec: AvailableUpdate) => {
    console.log('[UpdateBanner] received update:available', rec)
    updateStore.refreshAvailable()
  }))
  cleanups.push(window.electronAPI.on('update:removed', () => {
    console.log('[UpdateBanner] received update:removed')
    updateStore.refreshAvailable()
  }))
  // V1.5.0 修复: 窗口重新聚焦 / 从隐藏恢复时主动拉一次，避免 push 事件在
  // banner 挂载之前到达导致丢失
  const onFocus = () => {
    console.log('[UpdateBanner] window focused, refreshing available')
    updateStore.refreshAvailable()
  }
  window.addEventListener('focus', onFocus)
  cleanups.push(() => window.removeEventListener('focus', onFocus))
})
onUnmounted(() => {
  cleanups.forEach(fn => fn())
})
</script>

<style scoped>
.update-banner-list {
  position: fixed;
  top: 12px;
  right: 12px;
  z-index: 150;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 380px;
}

.update-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: linear-gradient(135deg, #07c160 0%, #06ad56 100%);
  color: #fff;
  border-radius: 24px;
  box-shadow: 0 8px 24px rgba(7, 193, 96, 0.35);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  animation: bannerSlideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
}

.update-banner:hover {
  transform: translateY(-1px);
  box-shadow: 0 12px 32px rgba(7, 193, 96, 0.45);
}

@keyframes bannerSlideIn {
  from { opacity: 0; transform: translateX(20px); }
  to { opacity: 1; transform: translateX(0); }
}

.banner-text {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.note {
  opacity: 0.9;
  font-weight: 400;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.btn-dismiss {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.85);
  cursor: pointer;
  padding: 2px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-dismiss:hover {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.update-banner.debug {
  background: linear-gradient(135deg, #8c8c8c 0%, #595959 100%);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  font-size: 12px;
}

.update-banner.debug a {
  color: #fff;
  text-decoration: underline;
  cursor: pointer;
  margin-left: 4px;
}

.btn-debug {
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.4);
  color: #fff;
  padding: 2px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  white-space: nowrap;
}

.btn-debug:hover {
  background: rgba(255, 255, 255, 0.35);
}
</style>
