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

        <!-- 文件按钮（私聊、群聊均可用，V1.4.0 群聊文件共享） -->
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
        :placeholder="isGroup ? '输入消息... 输入 @ 提及成员 (Enter发送，Shift+Enter换行)' : '输入消息... (Enter发送，Shift+Enter换行)'"
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

    <!-- V1.4.0: @ 提及成员浮层（仅群聊） -->
    <div v-if="isGroup && showMentionPicker" class="mention-picker">
      <div
        class="mention-item mention-all"
        @click="selectMention('all')"
      >
        <div class="mention-avatar-placeholder">@</div>
        <div class="mention-info">
          <div class="mention-name">所有人</div>
          <div class="mention-hint">通知所有成员</div>
        </div>
      </div>
      <div
        v-for="m in mentionableMembers"
        :key="m.peerId"
        class="mention-item"
        @click="selectMention(m)"
      >
        <div class="mention-avatar">
          <img v-if="m.avatar" :src="m.avatar" :alt="m.nickname" />
          <div v-else class="mention-avatar-placeholder">{{ m.nickname[0] }}</div>
        </div>
        <div class="mention-info">
          <div class="mention-name">{{ m.nickname }}</div>
        </div>
      </div>
      <div v-if="mentionableMembers.length === 0" class="mention-empty">
        暂无可 @ 的成员
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, computed, watch } from 'vue'
import type { GroupMember } from '@shared/types'
import { useConfigStore } from '../stores/config-store'

const props = defineProps<{
  peerId: string
  isGroup?: boolean
  groupMembers?: GroupMember[]
}>()
const emit = defineEmits<{
  (e: 'sendText', content: string, mentions?: string[], mentionedAll?: boolean): void
  (e: 'sendImage', filePath: string): void
  (e: 'sendFile', filePath: string): void
}>()

const configStore = useConfigStore()

const text = ref('')
const showEmojiPicker = ref(false)
const showMentionPicker = ref(false)
const textareaRef = ref<HTMLTextAreaElement | null>(null)

const mentionableMembers = computed(() => {
  if (!props.isGroup || !props.groupMembers) return []
  const myId = configStore.peerId
  return props.groupMembers.filter(m => m.peerId !== myId)
})

// 跟踪已 @ 的成员（用 peerId 集合）和是否 @ 所有人
const mentionedPeerIds = ref<Set<string>>(new Set())
const mentionedAll = ref(false)

// V1.4.0 修复：selectMention 触发的 text 变化不应触发 watcher 重开浮层
// 原因：watcher 在 nextTick 之前读 textarea.selectionStart，此时 DOM 仍是旧文本，
//       光标位置对应不到新插入的尾随空格，watcher 会把 "@昵称 " 误判为"还在 @ 输入中"。
let suppressMentionWatch = false

// 监听 text 变化，检测是否需要显示 @ 选择浮层
watch(text, (val) => {
  if (suppressMentionWatch) {
    suppressMentionWatch = false
    showMentionPicker.value = false
    return
  }
  if (!props.isGroup) {
    showMentionPicker.value = false
    return
  }
  const textarea = textareaRef.value
  if (!textarea) return
  const cursor = textarea.selectionStart
  // 查找光标前最近的 @ 字符
  const before = val.substring(0, cursor)
  const atIdx = before.lastIndexOf('@')
  if (atIdx < 0) {
    showMentionPicker.value = false
    return
  }
  // @ 后面没有空格或换行才算正在输入 @
  const after = before.substring(atIdx + 1)
  if (/[\s\n]/.test(after)) {
    showMentionPicker.value = false
    return
  }
  // 如果当前光标位置正好落在空格/换行上（说明 @ 已被完整选择），也要关闭
  if (cursor < val.length && /[\s\n]/.test(val[cursor])) {
    showMentionPicker.value = false
    return
  }
  showMentionPicker.value = true
})

function selectMention(member: { peerId: string; nickname: string } | 'all') {
  const textarea = textareaRef.value
  if (!textarea) return
  const cursor = textarea.selectionStart
  const before = text.value.substring(0, cursor)
  const atIdx = before.lastIndexOf('@')
  if (atIdx < 0) return
  const after = text.value.substring(cursor)

  let insertion: string
  if (member === 'all') {
    mentionedAll.value = true
    insertion = '@所有人 '
  } else {
    mentionedPeerIds.value.add(member.peerId)
    insertion = `@${member.nickname} `
  }

  // 抑制 watcher 对本次 text 变化的重开判定
  suppressMentionWatch = true

  const newText = before.substring(0, atIdx) + insertion + after
  text.value = newText
  showMentionPicker.value = false

  // 在 nextTick 中移动光标（此时 DOM 已更新到 newText）
  // 二次保险：若用户已经输入了新字符，不要覆盖他的光标
  const newCursor = (before.substring(0, atIdx) + insertion).length
  nextTick(() => {
    if (textareaRef.value && textareaRef.value.value === newText) {
      textareaRef.value.focus()
      textareaRef.value.setSelectionRange(newCursor, newCursor)
    }
  })
}

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
  const mentionsArr = Array.from(mentionedPeerIds.value)
  emit('sendText', text.value, mentionsArr, mentionedAll.value)
  text.value = ''
  showEmojiPicker.value = false
  showMentionPicker.value = false
  mentionedPeerIds.value = new Set()
  mentionedAll.value = false
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
  position: relative;
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

/* V1.4.0: @ 提及浮层 */
.mention-picker {
  position: absolute;
  bottom: 100%;
  left: 16px;
  margin-bottom: 8px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  padding: 6px;
  min-width: 220px;
  max-height: 280px;
  overflow-y: auto;
  z-index: 100;
  animation: mentionSlideIn 0.15s ease-out;
}

@keyframes mentionSlideIn {
  from { opacity: 0; transform: translateY(8px) }
  to { opacity: 1; transform: translateY(0) }
}

.mention-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
}

.mention-item:hover {
  background: #f5f5f5;
}

.mention-item.mention-all {
  border-bottom: 1px solid #f0f0f0;
  border-radius: 8px 8px 0 0;
}

.mention-avatar {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
}

.mention-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.mention-avatar-placeholder {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: linear-gradient(135deg, #07c160 0%, #06ad56 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  flex-shrink: 0;
}

.mention-info {
  flex: 1;
  min-width: 0;
}

.mention-name {
  font-size: 14px;
  color: #333;
  font-weight: 500;
}

.mention-hint {
  font-size: 12px;
  color: #999;
  margin-top: 2px;
}

.mention-empty {
  padding: 20px;
  text-align: center;
  color: #999;
  font-size: 13px;
}
</style>
