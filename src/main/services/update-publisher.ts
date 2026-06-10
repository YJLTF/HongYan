import http from 'http'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import os from 'os'
import { app, net } from 'electron'
import log from 'electron-log'
import {
  HTTP_SERVER_PORT_DEFAULT,
  HTTP_SERVER_PORT_MAX_TRY,
  HTTP_MAX_FILE_SIZE,
  HTTP_IDLE_TIMEOUT_MS,
  VERSION_BROADCAST_REPEAT_MS,
} from '@shared/constants'
import type {
  PublishedUpdate, UpdatePackageMeta, VersionAnnouncementPayload, PublishStatus,
} from '@shared/types'
import { storageService } from '../storage/storage-service'
import { friendDiscoveryService } from './friend-discovery-service'
import { udpBroadcaster } from '../network/udp-broadcaster'

export interface StartPublishInput {
  targetVersion: string
  nsis?: { filePath: string; size: number; sha256: string }
  portable?: { filePath: string; size: number; sha256: string }
  note?: string
}

class UpdatePublisher {
  private server: http.Server | null = null
  private currentPublish: PublishedUpdate | null = null
  private currentMeta: { nsis?: UpdatePackageMeta & { localPath: string }; portable?: UpdatePackageMeta & { localPath: string } } = {}
  private idleTimer: NodeJS.Timeout | null = null
  private rebroadcastTimer: NodeJS.Timeout | null = null
  private statusListeners = new Set<(s: PublishStatus) => void>()
  private lastActivityAt = 0

  getStatus(): PublishStatus {
    if (!this.currentPublish) {
      return { running: false }
    }
    return {
      running: true,
      httpPort: this.currentPublish.httpPort,
      publishedUpdateId: this.currentPublish.id,
      targetVersion: this.currentPublish.version,
    }
  }

  onStatusChange(cb: (s: PublishStatus) => void): () => void {
    this.statusListeners.add(cb)
    return () => this.statusListeners.delete(cb)
  }

  private emitStatus(): void {
    const s = this.getStatus()
    for (const cb of this.statusListeners) {
      try { cb(s) } catch (err) { log.warn('Status listener threw:', err) }
    }
  }

  /**
   * 启动发布：占用 HTTP 端口、入库 PublishedUpdate、广播一次
   * 注意：必须在 friendDiscoveryService.start() 之后调用（依赖 udp broadcaster）
   */
  async startPublish(input: StartPublishInput): Promise<PublishedUpdate> {
    // V1.5.0 修复: 同一时刻只允许一条 active 广播。新发布会自动 stop 旧的（广播 stop 信号让收端清理）
    if (this.currentPublish) {
      log.info('Replacing active publish:', this.currentPublish.version, '→', input.targetVersion)
      // 必须 await：server.close 是异步的，没等完成就 findAvailablePort 会把同一端口算成"占用"
      // 然后用 19891；但更糟的是若 TIME_WAIT 释放慢，下一次 bind 也可能直接报 EADDRINUSE
      await this.stopPublish()
    }
    if (!input.nsis && !input.portable) {
      throw new Error('至少选择一个分发包（NSIS 或 Portable）')
    }
    if (input.nsis && input.nsis.size > HTTP_MAX_FILE_SIZE) {
      throw new Error(`NSIS 包超过最大限制 ${HTTP_MAX_FILE_SIZE} 字节`)
    }
    if (input.portable && input.portable.size > HTTP_MAX_FILE_SIZE) {
      throw new Error(`Portable 包超过最大限制 ${HTTP_MAX_FILE_SIZE} 字节`)
    }

    const port = await this.findAvailablePort()
    if (port === null) {
      throw new Error(`无法在 ${HTTP_SERVER_PORT_DEFAULT}~${HTTP_SERVER_PORT_DEFAULT + HTTP_SERVER_PORT_MAX_TRY - 1} 范围内找到可用端口`)
    }

    const nsisMeta = input.nsis
      ? { filename: path.basename(input.nsis.filePath), size: input.nsis.size, sha256: input.nsis.sha256, localPath: input.nsis.filePath }
      : undefined
    const portableMeta = input.portable
      ? { filename: path.basename(input.portable.filePath), size: input.portable.size, sha256: input.portable.sha256, localPath: input.portable.filePath }
      : undefined

    const id = `pub_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`
    const selfPeerId = storageService.loadConfig()?.peerId || ''
    const record: PublishedUpdate = {
      id,
      version: input.targetVersion,
      nsis: nsisMeta,
      portable: portableMeta,
      httpPort: port,
      publishedAt: Date.now(),
      downloadCount: 0,
      note: input.note,
    }
    this.currentPublish = record
    this.currentMeta = { nsis: nsisMeta, portable: portableMeta }
    this.lastActivityAt = Date.now()

    await new Promise<void>((resolve, reject) => {
      const srv = http.createServer((req, res) => this.handleRequest(req, res))
      srv.once('error', reject)
      srv.listen(port, '0.0.0.0', () => {
        this.server = srv
        log.info('Update publisher HTTP server listening on port', port)
        resolve()
      })
    })

    // 自检：确认本地确实能连上自己的 HTTP 服务（防止"绑了端口但 loopback 不通"之类的诡异情况）
    const reachable = await this.selfTestReachable(port)
    if (!reachable) {
      // 把已经起来的 server 关掉，避免泄漏端口
      if (this.server) {
        try { this.server.close() } catch { /* ignore */ }
        this.server = null
      }
      this.currentPublish = null
      this.currentMeta = {}
      throw new Error(`HTTP 服务自检失败：本机无法连接 127.0.0.1:${port}，请检查防火墙或杀软规则`)
    }

    storageService.savePublishedUpdate(record)

    // 首次广播
    this.broadcastOnce()

    // 启动 idle 计时器
    this.restartIdleTimer()

    // 启动周期重广播（兜底断网恢复的 LAN 节点）
    if (this.rebroadcastTimer) clearInterval(this.rebroadcastTimer)
    this.rebroadcastTimer = setInterval(() => this.broadcastOnce(), VERSION_BROADCAST_REPEAT_MS)

    this.emitStatus()
    log.info('Publish started:', id, 'version=', record.version, 'port=', port, 'peerId=', selfPeerId)
    return record
  }

  stopPublish(): Promise<void> {
    if (!this.currentPublish) return Promise.resolve()
    const id = this.currentPublish.id
    const targetVersion = this.currentPublish.version
    const srvToClose = this.server
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
      this.idleTimer = null
    }
    if (this.rebroadcastTimer) {
      clearInterval(this.rebroadcastTimer)
      this.rebroadcastTimer = null
    }
    // 标记已停止
    const stopped = { ...this.currentPublish, stoppedAt: Date.now() }
    storageService.savePublishedUpdate(stopped)
    this.currentPublish = null
    this.currentMeta = {}
    this.server = null
    this.emitStatus()
    // 广播"已停止"信号，让收端清理 availableUpdates
    try {
      udpBroadcaster.broadcastVersionAnnouncementStopped(targetVersion)
    } catch (err) {
      log.warn('Failed to broadcast stop announcement:', err)
    }
    log.info('Publish stopped:', id)
    return new Promise<void>((resolve) => {
      if (!srvToClose) {
        resolve()
        return
      }
      srvToClose.close(() => {
        log.info('Update publisher HTTP server closed')
        resolve()
      })
    })
  }

  listPublished(): PublishedUpdate[] {
    return storageService.listPublishedUpdates()
  }

  /**
   * 重新触发广播
   * - 当前正在发布且 id 匹配：仅重发 UDP 公告
   * - 其它情况（id 不同或已停止）：用历史记录里的 localPath 重新启动一次完整发布
   *   注意：必须保证文件仍在磁盘上，否则抛错让上层提示用户重新选包
   */
  async rebroadcast(id: string): Promise<void> {
    const rec = storageService.getPublishedUpdate(id)
    if (!rec) throw new Error('未找到该发布记录')
    if (this.currentPublish && this.currentPublish.id === id) {
      this.broadcastOnce()
      log.info('Rebroadcasted active publish:', id, 'version=', rec.version)
      return
    }
    // 历史发布或异版本：必须有 localPath 才能重启 HTTP 服务
    const nsisPath = rec.nsis?.localPath
    const portablePath = rec.portable?.localPath
    if (!nsisPath && !portablePath) {
      throw new Error('历史记录缺少本地文件路径，请重新发布')
    }
    if (nsisPath && !fs.existsSync(nsisPath)) {
      throw new Error(`NSIS 安装包已不存在：${nsisPath}`)
    }
    if (portablePath && !fs.existsSync(portablePath)) {
      throw new Error(`Portable 安装包已不存在：${portablePath}`)
    }
    // 转交给 startPublish 走完整流程（包含 stopPublish 旧的、HTTP 自检、UDP 公告）
    await this.startPublish({
      targetVersion: rec.version,
      nsis: rec.nsis && nsisPath
        ? { filePath: nsisPath, size: rec.nsis.size, sha256: rec.nsis.sha256 }
        : undefined,
      portable: rec.portable && portablePath
        ? { filePath: portablePath, size: rec.portable.size, sha256: rec.portable.sha256 }
        : undefined,
      note: rec.note,
    })
    log.info('Rebroadcast restarted publish:', id, 'version=', rec.version)
  }

  // === 内部方法 ===

  // 启动后自检：从本机用 HTTP 客户端访问 /health 一次，确认 server 真的可达
  private selfTestReachable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.get({ host: '127.0.0.1', port, path: '/health', timeout: 1500 }, (res) => {
        res.resume()
        resolve(res.statusCode === 200)
      })
      req.on('error', (err) => {
        log.warn('Self-test failed on 127.0.0.1:' + port + ':', err.message)
        resolve(false)
      })
      req.on('timeout', () => {
        req.destroy()
        log.warn('Self-test timeout on 127.0.0.1:' + port)
        resolve(false)
      })
    })
  }

  private async findAvailablePort(): Promise<number | null> {
    for (let i = 0; i < HTTP_SERVER_PORT_MAX_TRY; i++) {
      const port = HTTP_SERVER_PORT_DEFAULT + i
      if (await this.isPortFree(port)) return port
    }
    return null
  }

  private isPortFree(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const tester = http.createServer()
      tester.once('error', () => resolve(false))
      tester.once('listening', () => tester.close(() => resolve(true)))
      tester.listen(port, '0.0.0.0')
    })
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const clientIp = (req.socket.remoteAddress || '').replace(/^::ffff:/, '')
    if (!this.isLanAddress(clientIp)) {
      log.warn('Refusing non-LAN access from', clientIp, 'path:', req.url)
      res.statusCode = 403
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.end('Forbidden: LAN only')
      return
    }
    const url = req.url || '/'
    // 仅允许 GET
    if (req.method !== 'GET') {
      res.statusCode = 405
      res.end('Method Not Allowed')
      return
    }
    // 路由
    if (url === '/meta' || url.startsWith('/meta?')) {
      this.serveMeta(res)
      return
    }
    if (url === '/health' || url.startsWith('/health?')) {
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.end('ok')
      return
    }
    const fileMatch = url.match(/^\/files\/([A-Za-z0-9._\-+%]+)(\?.*)?$/)
    if (fileMatch) {
      const rawName = decodeURIComponent(fileMatch[1])
      this.serveFile(rawName, res)
      return
    }
    res.statusCode = 404
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end('Not Found')
  }

  private serveMeta(res: http.ServerResponse): void {
    if (!this.currentPublish) {
      res.statusCode = 503
      res.end('Not Publishing')
      return
    }
    const meta = {
      version: this.currentPublish.version,
      nsis: this.currentPublish.nsis
        ? { filename: this.currentPublish.nsis.filename, size: this.currentPublish.nsis.size, sha256: this.currentPublish.nsis.sha256 }
        : undefined,
      portable: this.currentPublish.portable
        ? { filename: this.currentPublish.portable.filename, size: this.currentPublish.portable.size, sha256: this.currentPublish.portable.sha256 }
        : undefined,
      publisher: storageService.loadConfig()?.peerId,
      publisherNickname: storageService.loadConfig()?.nickname,
      publishedAt: this.currentPublish.publishedAt,
      note: this.currentPublish.note,
    }
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.end(JSON.stringify(meta))
  }

  private serveFile(rawName: string, res: http.ServerResponse): void {
    if (!this.currentPublish) {
      res.statusCode = 503
      res.end('Not Publishing')
      return
    }
    // 仅匹配白名单中的两个文件名
    const candidates = [this.currentPublish.nsis, this.currentPublish.portable].filter(Boolean) as Array<UpdatePackageMeta & { localPath: string }>
    const target = candidates.find(c => c.filename === rawName)
    if (!target) {
      log.warn('File not in publish whitelist:', rawName)
      res.statusCode = 404
      res.end('File not offered')
      return
    }
    if (!fs.existsSync(target.localPath)) {
      log.error('File missing on disk:', target.localPath)
      res.statusCode = 410
      res.end('File missing on publisher disk')
      return
    }
    // 路径校验：必须是绝对路径且在允许的目录内（防止路径穿越）
    const resolved = path.resolve(target.localPath)
    if (resolved !== target.localPath) {
      log.error('Resolved path mismatch, possible traversal:', rawName)
      res.statusCode = 400
      res.end('Bad Request')
      return
    }
    const stat = fs.statSync(target.localPath)
    if (!stat.isFile() || stat.size !== target.size) {
      log.error('File size mismatch:', target.localPath, 'expected', target.size, 'actual', stat.size)
      res.statusCode = 500
      res.end('File size mismatch')
      return
    }
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Length', String(stat.size))
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(target.filename)}"`)
    res.setHeader('Access-Control-Allow-Origin', '*')
    const stream = fs.createReadStream(target.localPath)
    stream.on('error', (err) => {
      log.error('File stream error:', err)
      if (!res.headersSent) res.statusCode = 500
      res.end()
    })
    stream.pipe(res)
    // 记录活动 + 计数
    this.lastActivityAt = Date.now()
    this.restartIdleTimer()
    res.on('close', () => {
      if (this.currentPublish) {
        storageService.incrementPublishedUpdateDownloadCount(this.currentPublish.id)
        log.info('Download served:', target.filename, 'bytes=', stat.size)
      }
    })
  }

  private restartIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = setTimeout(() => {
      const idleFor = Date.now() - this.lastActivityAt
      if (idleFor >= HTTP_IDLE_TIMEOUT_MS) {
        log.info('Update publisher idle for', Math.round(idleFor / 1000), 's, auto-stopping')
        this.stopPublish()
      }
    }, HTTP_IDLE_TIMEOUT_MS + 1000)
  }

  /**
   * LAN 访问控制：仅放行与本机任一接口同网段的源 IP
   * 172.17.0.0/16 (docker)、192.168.0.0/16、10.0.0.0/8 等私有网段
   */
  private isLanAddress(addr: string): boolean {
    if (!addr) return false
    if (addr === '127.0.0.1' || addr === '::1') return true
    const interfaces = os.networkInterfaces()
    const localSubnets: Array<{ addr: string; prefix: number }> = []
    for (const name of Object.keys(interfaces)) {
      const nets = interfaces[name]
      if (!nets) continue
      for (const net of nets) {
        if (net.family === 'IPv4' && !net.internal) {
          // 计算前缀长度
          const prefix = netToPrefix(net.netmask || '255.255.255.0')
          localSubnets.push({ addr: net.address, prefix })
        }
      }
    }
    for (const sub of localSubnets) {
      if (sameSubnet(addr, sub.addr, sub.prefix)) return true
    }
    return false
  }

  private buildPayloadFromRecord(rec: PublishedUpdate): VersionAnnouncementPayload | null {
    const config = storageService.loadConfig()
    if (!config?.peerId) return null
    return {
      version: 3,
      targetVersion: rec.version,
      publisherPeerId: config.peerId,
      publisherNickname: config.nickname || 'User',
      httpPort: rec.httpPort,
      nsis: rec.nsis ? { filename: rec.nsis.filename, size: rec.nsis.size, sha256: rec.nsis.sha256 } : undefined,
      portable: rec.portable ? { filename: rec.portable.filename, size: rec.portable.size, sha256: rec.portable.sha256 } : undefined,
      note: rec.note,
      timestamp: Date.now(),
    }
  }

  private broadcastOnce(): void {
    if (!this.currentPublish) return
    const payload = this.buildPayloadFromRecord(this.currentPublish)
    if (payload) {
      udpBroadcaster.broadcastVersionAnnouncement(payload)
    }
  }
}

// === 工具函数 ===

function netToPrefix(mask: string): number {
  const parts = mask.split('.').map(p => parseInt(p, 10))
  let bits = 0
  for (const p of parts) {
    if (p === 0) break
    bits += p.toString(2).split('1').length - 1
  }
  return bits
}

function ipToInt(ip: string): number {
  const parts = ip.split('.').map(p => parseInt(p, 10))
  if (parts.length !== 4) return 0
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
}

function sameSubnet(ip1: string, ip2: string, prefix: number): boolean {
  if (prefix < 0 || prefix > 32) return false
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0
  return (ipToInt(ip1) & mask) === (ipToInt(ip2) & mask)
}

// 异步计算文件 SHA-256（流式）— V1.5.0 合并: 委托到 utils/file-hash
export { computeFileSha256 } from '../utils/file-hash'

// 异步获取文件大小
export async function getFileSize(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    fs.stat(filePath, (err, stat) => {
      if (err) reject(err)
      else resolve(stat.size)
    })
  })
}

export const updatePublisher = new UpdatePublisher()
