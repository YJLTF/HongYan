import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { AppConfig } from '@shared/types'

export const useConfigStore = defineStore('config', () => {
  const peerId = ref<string>('')
  const nickname = ref<string>('User')
  const avatar = ref<string>('')

  function setConfig(config: AppConfig) {
    peerId.value = config.peerId
    nickname.value = config.nickname
    avatar.value = config.avatar || ''
  }

  return { peerId, nickname, avatar, setConfig }
})
