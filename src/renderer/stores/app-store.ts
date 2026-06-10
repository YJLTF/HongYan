import { defineStore } from 'pinia'
import { ref } from 'vue'

// V1.5.0 合并: 关于页 + 发布页共用一个版本号源；fetch 一次缓存到 session
export const useAppStore = defineStore('app', () => {
  const version = ref<string>('')
  const loaded = ref(false)

  async function loadVersion(force = false) {
    if (loaded.value && !force) return
    try {
      const v = await window.electronAPI.invoke('app:get-version')
      if (typeof v === 'string' && v.length > 0) {
        version.value = v
        loaded.value = true
      }
    } catch (err) {
      console.error('Failed to load app version:', err)
    }
  }

  return { version, loaded, loadVersion }
})
