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

  // V1.3.0 消息提醒相关
  const closeToTray = ref<boolean>(true)
  const enableNotifications = ref<boolean>(true)
  const enableTaskbarFlash = ref<boolean>(true)
  const enableTrayFlash = ref<boolean>(true)
  const dndEnabled = ref<boolean>(false)
  const dndStart = ref<string>('22:00')
  const dndEnd = ref<string>('08:00')

  function setConfig(config: AppConfig) {
    peerId.value = config.peerId
    nickname.value = config.nickname
    avatar.value = config.avatar || ''
    downloadPath.value = config.downloadPath || ''
    userDataDir.value = config.userDataDir || ''
    heartbeatIntervalMs.value = config.heartbeatIntervalMs ?? 60000
    closeToTray.value = config.closeToTray !== false
    enableNotifications.value = config.enableNotifications !== false
    enableTaskbarFlash.value = config.enableTaskbarFlash !== false
    enableTrayFlash.value = config.enableTrayFlash !== false
    dndEnabled.value = config.dndEnabled === true
    dndStart.value = config.dndStart || '22:00'
    dndEnd.value = config.dndEnd || '08:00'
  }

  return {
    peerId, nickname, avatar, downloadPath, userDataDir,
    heartbeatIntervalMs,
    closeToTray, enableNotifications, enableTaskbarFlash, enableTrayFlash,
    dndEnabled, dndStart, dndEnd,
    setConfig,
  }
})
