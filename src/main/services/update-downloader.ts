import http from 'http'
import https from 'https'
import path from 'path'
import fs from 'fs'
import os from 'os'
import crypto from 'crypto'
import { shell, app } from 'electron'
import log from 'electron-log'
import {
  HTTP_DOWNLOAD_IDLE_TIMEOUT_MS,
  HTTP_MAX_FILE_SIZE,
} from '@shared/constants'
import type { UpdateDownloadProgress, UpdatePackageMeta } from '@shared/types'
import {
  pushUpdateDownloadProgress,
  pushUpdateDownloadComplete,
  pushUpdateDownloadFailed,
} from '../ipc/ipc-push'

export interface DownloadInput {
  jobId: string
  publisherIp: string
  httpPort: number
  packageType: 'nsis' | 'portable'
  fileName: string
  fileSize: number
  sha256: string
}

interface RunningJob {
  jobId: string
  packageType: 'nsis' | 'portable'
  fileName: string
  fileSize: number
  cancelled: boolean
  abort: () => void
}

class UpdateDownloader {
  private jobs = new Map<string, RunningJob>()

  /**
   * 启动下载任务
   * 进度通过 push 事件推到渲染端
   * 返回最终 savePath，错误抛到调用方
   */
  async download(input: DownloadInput): Promise<string> {
    if (this.jobs.has(input.jobId)) {
      throw new Error('已有同 jobId 的下载在进行中')
    }
    if (input.fileSize > HTTP_MAX_FILE_SIZE) {
      throw new Error(`文件超过最大限制 ${HTTP_MAX_FILE_SIZE} 字节`)
    }

    const targetDir = this.getDownloadDir(input.jobId)
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true })
    const targetPath = path.join(targetDir, input.fileName)

    const controller = new AbortController()
    const job: RunningJob = {
      jobId: input.jobId,
      packageType: input.packageType,
      fileName: input.fileName,
      fileSize: input.fileSize,
      cancelled: false,
      abort: () => controller.abort(),
    }
    this.jobs.set(input.jobId, job)

    log.info('Starting download:', input.fileName, 'size=', input.fileSize,
      'from', input.publisherIp + ':' + input.httpPort)

    try {
      await this.streamDownload(input, targetPath, controller.signal, job)
      log.info('Download complete:', targetPath)
      return targetPath
    } catch (err) {
      // 清理半成品文件
      try { if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath) } catch { /* ignore */ }
      throw err
    } finally {
      this.jobs.delete(input.jobId)
    }
  }

  cancel(jobId: string): boolean {
    const job = this.jobs.get(jobId)
    if (!job) return false
    job.cancelled = true
    job.abort()
    log.info('Download cancelled:', jobId)
    return true
  }

  // V1.5.0: 打开已下载的安装器
  openInstaller(savePath: string): void {
    if (!fs.existsSync(savePath)) {
      throw new Error('安装器文件不存在，请重新下载')
    }
    shell.openPath(savePath).then((errMsg) => {
      if (errMsg) {
        log.error('Failed to open installer:', errMsg)
        throw new Error(errMsg)
      }
    })
  }

  private getDownloadDir(jobId: string): string {
    const base = app.getPath('temp')
    return path.join(base, 'HongYanUpdate', jobId)
  }

  private streamDownload(
    input: DownloadInput,
    targetPath: string,
    signal: AbortSignal,
    job: RunningJob
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `http://${input.publisherIp}:${input.httpPort}/files/${encodeURIComponent(input.fileName)}`
      const request = http.get(url, { signal }, (res) => {
        if (res.statusCode !== 200) {
          res.resume()
          reject(new Error(`HTTP ${res.statusCode}`))
          return
        }
        const total = parseInt(res.headers['content-length'] || String(input.fileSize), 10)
        if (total > HTTP_MAX_FILE_SIZE) {
          res.resume()
          reject(new Error(`文件超过最大限制 ${HTTP_MAX_FILE_SIZE} 字节`))
          return
        }
        const hash = crypto.createHash('sha256')
        let downloaded = 0
        let lastEmit = 0
        let lastByteAt = Date.now()
        const startedAt = Date.now()

        const idleChecker = setInterval(() => {
          if (job.cancelled) {
            clearInterval(idleChecker)
            return
          }
          if (Date.now() - lastByteAt > HTTP_DOWNLOAD_IDLE_TIMEOUT_MS) {
            clearInterval(idleChecker)
            res.destroy(new Error(`下载超时：${HTTP_DOWNLOAD_IDLE_TIMEOUT_MS}ms 无新数据`))
          }
        }, 5000)

        const fileStream = fs.createWriteStream(targetPath)
        res.on('data', (chunk: Buffer) => {
          lastByteAt = Date.now()
          downloaded += chunk.length
          hash.update(chunk)
          // 限流进度推送（每 200ms 最多一次）
          const now = Date.now()
          if (now - lastEmit > 200) {
            lastEmit = now
            const elapsed = (now - startedAt) / 1000 || 1
            const speed = downloaded / elapsed
            this.emitProgress({
              jobId: input.jobId,
              packageType: input.packageType,
              fileName: input.fileName,
              fileSize: total,
              downloaded,
              speed,
              status: 'downloading',
            })
          }
        })
        res.on('end', () => {
          clearInterval(idleChecker)
          fileStream.end()
        })
        res.on('error', (err) => {
          clearInterval(idleChecker)
          fileStream.destroy()
          reject(err)
        })
        fileStream.on('error', (err) => {
          clearInterval(idleChecker)
          reject(err)
        })
        fileStream.on('finish', () => {
          // 校验
          const expected = input.sha256.toLowerCase()
          const actual = hash.digest('hex').toLowerCase()
          if (expected !== actual) {
            reject(new Error(`SHA-256 校验失败：expected=${expected.slice(0, 16)}... actual=${actual.slice(0, 16)}...`))
            return
          }
          if (downloaded !== total) {
            reject(new Error(`下载字节数不匹配：expected=${total} actual=${downloaded}`))
            return
          }
          // 校验通过，发送 verifying → completed
          this.emitProgress({
            jobId: input.jobId,
            packageType: input.packageType,
            fileName: input.fileName,
            fileSize: total,
            downloaded,
            speed: 0,
            status: 'verifying',
          })
          setTimeout(() => {
            this.emitComplete({
              jobId: input.jobId,
              packageType: input.packageType,
              fileName: input.fileName,
              fileSize: total,
              savePath: targetPath,
            })
            resolve()
          }, 100)
        })
        res.pipe(fileStream)
      })
      request.on('error', (err) => {
        if (job.cancelled) {
          reject(new Error('已取消'))
        } else {
          reject(err)
        }
      })
    })
  }

  private emitProgress(progress: UpdateDownloadProgress): void {
    try {
      pushUpdateDownloadProgress(progress)
    } catch (err) {
      log.warn('emitProgress failed:', err)
    }
  }

  private emitComplete(payload: { jobId: string; packageType: 'nsis' | 'portable'; fileName: string; fileSize: number; savePath: string }): void {
    try {
      pushUpdateDownloadComplete(payload)
    } catch (err) {
      log.warn('emitComplete failed:', err)
    }
  }
}

export const updateDownloader = new UpdateDownloader()
