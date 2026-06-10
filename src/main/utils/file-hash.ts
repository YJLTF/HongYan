import crypto from 'crypto'
import fs from 'fs'

/**
 * V1.5.0 合并: 统一文件哈希工具
 * 之前散落在多处（file-transfer-service 的整文件 readFileSync + group-service 的流式版本）
 * 这里统一提供流式实现，避免大文件（如 NSIS 200 MB、Portable 300 MB）一次性读入内存
 */

// 异步流式计算 MD5
export function computeFileMd5(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5')
    const stream = fs.createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

// 异步流式计算 SHA-256
export function computeFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}
