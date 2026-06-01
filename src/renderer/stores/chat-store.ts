import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ChatRecord } from '@shared/types'

export const useChatStore = defineStore('chat', () => {
  const messages = ref<ChatRecord[]>([])
  const currentPeerId = ref<string>('')

  function setMessages(peerId: string, records: ChatRecord[]) {
    currentPeerId.value = peerId
    messages.value = records
  }

  function addMessage(record: ChatRecord) {
    messages.value.push(record)
  }

  function updateMessageStatus(messageId: string, status: string) {
    const msg = messages.value.find((m) => m.id === messageId)
    if (msg) {
      msg.status = status as any
    }
  }

  function clearMessages() {
    messages.value = []
    currentPeerId.value = ''
  }

  return { messages, currentPeerId, setMessages, addMessage, updateMessageStatus, clearMessages }
})
