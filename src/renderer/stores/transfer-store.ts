import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { FileTransferRecord } from '@shared/types'

export const useTransferStore = defineStore('transfer', () => {
  const transfers = ref<FileTransferRecord[]>([])

  function addTransfer(record: FileTransferRecord) {
    transfers.value.push(record)
  }

  function updateProgress(transferId: string, progress: number) {
    const t = transfers.value.find((t) => t.transferId === transferId)
    if (t) {
      t.progress = progress
    }
  }

  function updateStatus(transferId: string, status: string) {
    const t = transfers.value.find((t) => t.transferId === transferId)
    if (t) {
      t.status = status as any
    }
  }

  return { transfers, addTransfer, updateProgress, updateStatus }
})
