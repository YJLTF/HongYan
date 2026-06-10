import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { FileTransferRecord } from '@shared/types'

export const useTransferStore = defineStore('transfer', () => {
  const transfers = ref<FileTransferRecord[]>([])

  function setTransfers(records: FileTransferRecord[]) {
    transfers.value = records
  }

  function addOrUpdateTransfer(record: FileTransferRecord) {
    const idx = transfers.value.findIndex(t => t.transferId === record.transferId)
    if (idx >= 0) {
      transfers.value[idx] = { ...transfers.value[idx], ...record }
    } else {
      transfers.value.push(record)
    }
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

  function updateSavePath(transferId: string, savePath: string) {
    const t = transfers.value.find((t) => t.transferId === transferId)
    if (t) {
      t.savePath = savePath
    }
  }

  return { transfers, setTransfers, addOrUpdateTransfer, updateProgress, updateStatus, updateSavePath }
})
