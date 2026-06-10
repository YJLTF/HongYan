import type { FileTransferStatus } from '@shared/types'

// FileTransferStatus → 中文展示
export function getFileTransferStatusText(status: FileTransferStatus): string {
  const map: Record<FileTransferStatus, string> = {
    pending: '等待接受',
    accepted: '已接受',
    rejected: '已拒绝',
    transferring: '传输中',
    completed: '已完成',
    failed: '失败',
    interrupted: '已中断',
  }
  return map[status] || status
}
