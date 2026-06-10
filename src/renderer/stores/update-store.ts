import { defineStore } from 'pinia'
import { ref } from 'vue'
import type {
  PublishedUpdate, AvailableUpdate, PublishStatus, UpdateDownloadProgress,
} from '@shared/types'

export const useUpdateStore = defineStore('update', () => {
  // 发布方
  const publishedList = ref<PublishedUpdate[]>([])
  const publishStatus = ref<PublishStatus>({ running: false })

  // 收端
  const availableList = ref<AvailableUpdate[]>([])

  // 活跃的下载任务
  const activeDownloads = ref<Record<string, UpdateDownloadProgress>>({})

  // === 发布方 ===

  async function refreshPublished() {
    const list = await window.electronAPI.invoke('update:list-published')
    if (Array.isArray(list)) {
      publishedList.value = list
    }
  }

  async function refreshPublishStatus() {
    const s = await window.electronAPI.invoke('update:get-publish-status')
    if (s && typeof s === 'object') {
      publishStatus.value = s
    }
  }

  async function startPublish(input: {
    targetVersion: string
    nsis?: { filePath: string; size: number; sha256: string }
    portable?: { filePath: string; size: number; sha256: string }
    note?: string
  }): Promise<{ success: boolean; record?: PublishedUpdate; error?: string }> {
    // V1.5.0 修复: 深拷贝剥离 Vue 3 reactive Proxy。Vue 的 ref(obj) 会对内部 object
    // 调用 reactive() 包装，Proxy 带 __v_raw/__v_isReactive 等内部槽位，V8 structuredClone
    // （ipcRenderer.invoke 内部使用）无法克隆 Proxy。深拷贝保险起见——即便调用方
    // 误传了 reactive 对象，这里也会被剥成 plain。
    const plain = JSON.parse(JSON.stringify(input))
    const result = await window.electronAPI.invoke('update:start-publish', plain)
    await refreshPublished()
    await refreshPublishStatus()
    return result
  }

  async function stopPublish(): Promise<void> {
    await window.electronAPI.invoke('update:stop-publish')
    await refreshPublished()
    await refreshPublishStatus()
  }

  async function rebroadcast(id: string): Promise<void> {
    await window.electronAPI.invoke('update:rebroadcast', id)
  }

  async function deletePublished(id: string): Promise<void> {
    await window.electronAPI.invoke('update:delete-published', id)
    await refreshPublished()
  }

  // === 收端 ===

  async function refreshAvailable() {
    const list = await window.electronAPI.invoke('update:list-available')
    if (Array.isArray(list)) {
      availableList.value = list
    }
  }

  async function dismissAvailable(publisherPeerId: string, targetVersion: string) {
    await window.electronAPI.invoke('update:dismiss-available', publisherPeerId, targetVersion)
    await refreshAvailable()
  }

  async function startDownload(
    publisherIp: string,
    httpPort: number,
    packageType: 'nsis' | 'portable',
    fileName: string,
    fileSize: number,
    sha256: string
  ): Promise<{ success: boolean; jobId?: string; error?: string }> {
    const jobId = `dl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const result = await window.electronAPI.invoke(
      'update:start-download',
      jobId, publisherIp, httpPort, packageType, fileName, fileSize, sha256
    )
    return { ...result, jobId }
  }

  async function cancelDownload(jobId: string) {
    await window.electronAPI.invoke('update:cancel-download', jobId)
  }

  async function openInstaller(savePath: string): Promise<void> {
    return window.electronAPI.invoke('update:open-installer', savePath)
  }

  async function getLowerVersionFriends(targetVersion: string) {
    return window.electronAPI.invoke('update:get-lower-version-friends', targetVersion)
  }

  return {
    publishedList, publishStatus, availableList, activeDownloads,
    refreshPublished, refreshPublishStatus, startPublish, stopPublish, rebroadcast, deletePublished,
    refreshAvailable, dismissAvailable, startDownload, cancelDownload, openInstaller,
    getLowerVersionFriends,
  }
})
