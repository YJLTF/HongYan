import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { AppConfig } from '@shared/types'

export const useConfigStore = defineStore('config', () => {
  const peerId = ref<string>('')
  const nickname = ref<string>('User')
  const avatar = ref<string>('')
  const downloadPath = ref<string>('')
  const userDataDir = ref<string>('')
  const heartbeatIntervalMs = ref<number>(60000)

  function setConfig(config: AppConfig) {
    peerId.value = config.peerId
    nickname.value = config.nickname
    avatar.value = config.avatar || ''
    downloadPath.value = config.downloadPath || ''
    userDataDir.value = config.userDataDir || ''
    heartbeatIntervalMs.value = config.heartbeatIntervalMs ?? 60000
  }

  return { peerId, nickname, avatar, downloadPath, userDataDir, heartbeatIntervalMs, setConfig }
})
