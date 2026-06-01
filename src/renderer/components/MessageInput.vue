<template>
  <div class="message-input">
    <!-- 工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <!-- 表情按钮 -->
        <button 
          class="tool-btn" 
          title="表情"
          @click="toggleEmojiPicker"
          :class="{ active: showEmojiPicker }"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
            <line x1="9" y1="9" x2="9.01" y2="9"/>
            <line x1="15" y1="9" x2="15.01" y2="9"/>
          </svg>
        </button>

        <!-- 图片按钮 -->
        <button class="tool-btn" title="发送图片" @click="selectImage">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
        </button>

        <!-- 文件按钮 -->
        <button class="tool-btn" title="发送文件" @click="selectFile">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
          </svg>
        </button>
      </div>

      <div class="toolbar-right">
        <span class="char-count" v-if="text.length > 0">{{ text.length }}/2000</span>
      </div>
    </div>

    <!-- 表情选择器 -->
    <div v-if="showEmojiPicker" class="emoji-picker">
      <div class="emoji-grid">
        <button
          v-for="emoji in commonEmojis"
          :key="emoji"
          class="emoji-btn"
          @click="insertEmoji(emoji)"
          :title="emoji"
        >
          {{ emoji }}
        </button>
      </div>
    </div>

    <!-- 输入区域 -->
    <div class="input-area">
      <textarea
        ref="textareaRef"
        v-model="text"
        placeholder="输入消息... (Enter发送，Shift+Enter换行)"
        @keydown.enter.exact.prevent="sendText"
        @keydown.enter.shift.exact="handleShiftEnter"
        rows="1"
        maxlength="2000"
      ></textarea>
      <button 
        class="send-btn" 
        @click="sendText" 
        :disabled="!text.trim()"
        :class="{ 'has-text': text.trim() }"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="22" y1="2" x2="11" y2="13"/>
          <polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
        <span>发送</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue'

const props = defineProps<{ peerId: string }>()
const emit = defineEmits(['sendText', 'sendImage', 'sendFile'])

const text = ref('')
const showEmojiPicker = ref(false)
const textareaRef = ref<HTMLTextAreaElement | null>(null)

// 常用表情列表
const commonEmojis = [
  '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂',
  '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩',
  '😘', '😗', '😚', '😙', '😋', '😛', '😜', '🤪',
  '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨',
  '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥',
  '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕',
  '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '🤯',
  '🤠', '🥳', '😎', '🤓', '🧐', '😕', '😟', '🙁',
  '☹️', '😮', '😯', '😲', '😳', '🥺', '😦', '😧',
  '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣',
  '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠',
  '👍', '👎', '👌', '✌️', '🤝', '👏', '🙏', '💪',
  '❤️', '💔', '💕', '💖', '💗', '💓', '💞', '💘',
  '🎉', '🎊', '✨', '⭐', '🌟', '💫', '🔥', '💯'
]

function sendText() {
  if (!text.value.trim()) return
  emit('sendText', text.value)
  text.value = ''
  showEmojiPicker.value = false
}

function handleShiftEnter(e: KeyboardEvent) {
  // 允许Shift+Enter换行
  e.stopPropagation()
}

async function selectImage() {
  const filePath = await window.electronAPI.invoke('message:select-image') as string | undefined
  if (filePath) {
    emit('sendImage', filePath)
  }
}

async function selectFile() {
  const filePath = await window.electronAPI.invoke('file:select') as string | undefined
  if (filePath) {
    emit('sendFile', filePath)
  }
}

function toggleEmojiPicker() {
  showEmojiPicker.value = !showEmojiPicker.value
  if (showEmojiPicker.value && textareaRef.value) {
    nextTick(() => {
      textareaRef.value?.focus()
    })
  }
}

function insertEmoji(emoji: string) {
  const textarea = textareaRef.value
  if (!textarea) return

  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const before = text.value.substring(0, start)
  const after = text.value.substring(end)

  text.value = before + emoji + after

  nextTick(() => {
    textarea.focus()
    const newPos = start + emoji.length
    textarea.setSelectionRange(newPos, newPos)
  })
}
</script>

<style scoped>
.message-input {
  border-top: 1px solid #e8e8e8;
  background: #fff;
  flex-shrink: 0;
}

/* 工具栏 */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  border-bottom: 1px solid #f0f0f0;
}

.toolbar-left {
  display: flex;
  gap: 4px;
}

.toolbar-right {
  display: flex;
  align-items: center;
}

.tool-btn {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #666;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.tool-btn:hover {
  background: #f5f5f5;
  color: #07c160;
}

.tool-btn.active {
  background: #e8f5e9;
  color: #07c160;
}

.char-count {
  font-size: 12px;
  color: #999;
}

/* 表情选择器 */
.emoji-picker {
  padding: 12px 16px;
  border-bottom: 1px solid #f0f0f0;
  background: #fafafa;
  animation: slideDown 0.2s ease-out;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.emoji-grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 4px;
  max-height: 200px;
  overflow-y: auto;
}

.emoji-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 4px;
  background: transparent;
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.emoji-btn:hover {
  background: #e8f5e9;
  transform: scale(1.1);
}

/* 输入区域 */
.input-area {
  display: flex;
  gap: 12px;
  padding: 12px 16px;
  align-items: flex-end;
}

textarea {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  font-size: 14px;
  resize: none;
  outline: none;
  font-family: inherit;
  line-height: 1.5;
  min-height: 44px;
  max-height: 120px;
  transition: border-color 0.2s;
}

textarea:focus {
  border-color: #07c160;
}

textarea::placeholder {
  color: #bbb;
}

.send-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  background: #f5f5f5;
  color: #999;
  cursor: not-allowed;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
  flex-shrink: 0;
}

.send-btn.has-text {
  background: #07c160;
  color: #fff;
  cursor: pointer;
}

.send-btn.has-text:hover {
  background: #05a350;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(7, 193, 96, 0.3);
}

.send-btn.has-text:active {
  transform: translateY(0);
}

/* 滚动条样式 */
.emoji-grid::-webkit-scrollbar {
  width: 4px;
}

.emoji-grid::-webkit-scrollbar-track {
  background: transparent;
}

.emoji-grid::-webkit-scrollbar-thumb {
  background: #ddd;
  border-radius: 2px;
}
</style>
