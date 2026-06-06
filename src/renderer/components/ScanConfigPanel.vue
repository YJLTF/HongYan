<template>
  <div class="scan-config-panel">
    <div class="panel-header">
      <h3>网段扫描配置</h3>
      <button class="close-btn" @click="$emit('close')">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
    <div class="panel-body">
      <div class="config-info">
        <p class="info-text">配置需要扫描的网段，系统会自动扫描当前所在网段</p>
      </div>
      <div class="segment-input">
        <label>额外扫描网段（每行一个，支持 CIDR 格式）</label>
        <textarea 
          v-model="localSegmentsText" 
          placeholder="例如：&#10;192.168.1.0/24&#10;192.168.31.0/24&#10;10.0.0.0/24"
          rows="5"
          maxlength="500"
          :disabled="isLoading"
        ></textarea>
      </div>
    </div>
    <div class="panel-footer">
      <button class="btn-cancel" @click="handleCancel" :disabled="isLoading">
        取消
      </button>
      <button class="btn-save" @click="handleSave" :disabled="isLoading">
        {{ isLoading ? '处理中...' : '保存并刷新' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'

const emit = defineEmits<{
  close: []
  refreshed: [friends: any[]]
}>()

const localSegmentsText = ref('')
const originalSegmentsText = ref('')
const isLoading = ref(false)

const hasChanges = computed(() => localSegmentsText.value !== originalSegmentsText.value)

onMounted(async () => {
  try {
    const config = await window.electronAPI.invoke('config:get')
    if (config?.scanSegments && Array.isArray(config.scanSegments)) {
      localSegmentsText.value = config.scanSegments.join('\n')
      originalSegmentsText.value = config.scanSegments.join('\n')
    }
  } catch (err) {
    console.error('Failed to load scan config:', err)
  }
})

function handleCancel() {
  localSegmentsText.value = originalSegmentsText.value
  emit('close')
}

async function handleSave() {
  isLoading.value = true
  try {
    // 解析网段文本
    const segments = localSegmentsText.value
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.length > 0)

    // 保存到配置
    const config = await window.electronAPI.invoke('config:get')
    await window.electronAPI.invoke('config:set', {
      ...config,
      scanSegments: segments
    })

    // 触发扫描
    await window.electronAPI.invoke('friend:scan')
    
    // 等待扫描完成
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // 重新加载好友列表
    const loadedFriends = await window.electronAPI.invoke('friend:list')
    if (Array.isArray(loadedFriends)) {
      originalSegmentsText.value = localSegmentsText.value
      emit('refreshed', loadedFriends)
    }

    emit('close')
  } catch (err) {
    console.error('Failed to save and scan:', err)
    alert('操作失败')
  } finally {
    isLoading.value = false
  }
}
</script>

<style scoped>
.scan-config-panel {
  background: #fff;
  border-radius: 12px;
  width: 450px;
  max-width: 90%;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #e8e8e8;
}

.panel-header h3 {
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

.panel-body {
  padding: 20px;
}

.config-info {
  margin-bottom: 16px;
}

.info-text {
  font-size: 13px;
  color: #666;
  margin: 0;
}

.segment-input {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.segment-input label {
  font-size: 13px;
  font-weight: 500;
  color: #666;
}

.segment-input textarea {
  padding: 10px 12px;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
  font-family: 'Consolas', 'Monaco', monospace;
  resize: vertical;
}

.segment-input textarea:focus {
  border-color: #07c160;
}

.segment-input textarea:disabled {
  background: #f5f5f5;
  cursor: not-allowed;
}

.panel-footer {
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

.btn-cancel:hover:not(:disabled) {
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

.btn-cancel:disabled,
.btn-save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
