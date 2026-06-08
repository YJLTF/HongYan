import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { getAppDataDir, IDENTITY_KEY_FILE } from '@shared/constants'
import { encrypt, decrypt } from './aes-gcm'
import { getMasterKey } from './master-key'
import log from 'electron-log'

// V1.2.0: 每个 peer 的长期 Ed25519 身份密钥对
// 用于签名 UDP 广播 announcement 包，防止局域网内任意设备伪造 peerId
// 私钥用 master.key (DPAPI + AES-256-GCM) 加密后存盘
//
// 关键安全特性：
//   1. 公钥 base64 长度 ~88 字符（Ed25519 SPKI DER = 44 字节），适合放 UDP 广播包
//   2. 签名 base64 长度 ~88 字符（Ed25519 signature = 64 字节）
//   3. 签名输入为规范 JSON（key 排序、无空白），保证跨实现一致

export interface IdentityKeyPair {
  publicKey: string   // base64, Ed25519 SPKI DER
  privateKey: string  // base64, Ed25519 PKCS8 DER
}

let cached: { publicKeyObj: crypto.KeyObject; privateKeyObj: crypto.KeyObject; publicKeyB64: string; privateKeyB64: string } | null = null

function getIdentityKeyPath(): string {
  return path.join(app.getPath('appData'), getAppDataDir(), IDENTITY_KEY_FILE)
}

// 规范 JSON 序列化：key 按字典序排序，无空白
// 用于签名输入，确保发送方/接收方序列化结果一致
export function canonicalJSON(obj: unknown): string {
  if (obj === null || obj === undefined) return 'null'
  if (typeof obj === 'number' || typeof obj === 'boolean') return JSON.stringify(obj)
  if (typeof obj === 'string') return JSON.stringify(obj)
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalJSON).join(',') + ']'
  }
  if (typeof obj === 'object') {
    const keys = Object.keys(obj as Record<string, unknown>).sort()
    const parts = keys.map((k) => JSON.stringify(k) + ':' + canonicalJSON((obj as Record<string, unknown>)[k]))
    return '{' + parts.join(',') + '}'
  }
  return JSON.stringify(obj)
}

// 初始化：加载或生成 Ed25519 身份密钥对
// 必须在 cryptoService.init() 之后调用（依赖 master.key）
export function initIdentity(): IdentityKeyPair {
  if (cached) {
    return { publicKey: cached.publicKeyB64, privateKey: cached.privateKeyB64 }
  }

  const keyPath = getIdentityKeyPath()
  let publicKeyB64: string
  let privateKeyB64: string

  if (fs.existsSync(keyPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(keyPath, 'utf-8')) as {
        publicKey: string
        encryptedPrivateKey: { iv: string; ciphertext: string; tag: string; aad?: string }
      }
      const masterKey = getMasterKey()
      const privateKeyJson = decrypt(masterKey, raw.encryptedPrivateKey as any)
      const parsed = JSON.parse(privateKeyJson) as { publicKey: string; privateKey: string }
      publicKeyB64 = parsed.publicKey
      privateKeyB64 = parsed.privateKey
      log.info('Identity key loaded from disk, publicKey:', publicKeyB64.slice(0, 16) + '...')
    } catch (err) {
      log.warn('Failed to load identity key, generating new one:', err)
      const generated = generateAndSave()
      publicKeyB64 = generated.publicKey
      privateKeyB64 = generated.privateKey
    }
  } else {
    const generated = generateAndSave()
    publicKeyB64 = generated.publicKey
    privateKeyB64 = generated.privateKey
  }

  cached = {
    publicKeyObj: importPublicKey(publicKeyB64),
    privateKeyObj: importPrivateKey(privateKeyB64),
    publicKeyB64,
    privateKeyB64,
  }
  log.info('Identity initialized')
  return { publicKey: publicKeyB64, privateKey: privateKeyB64 }
}

function generateAndSave(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
  const publicKeyB64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64')
  const privateKeyB64 = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64')

  const masterKey = getMasterKey()
  const plainJson = JSON.stringify({ publicKey: publicKeyB64, privateKey: privateKeyB64 })
  const encrypted = encrypt(masterKey, plainJson, 'identity-key')

  const keyPath = getIdentityKeyPath()
  const dir = path.dirname(keyPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(keyPath, JSON.stringify({ publicKey: publicKeyB64, encryptedPrivateKey: encrypted }, null, 2), 'utf-8')
  log.info('Identity key generated and saved')
  return { publicKey: publicKeyB64, privateKey: privateKeyB64 }
}

function importPublicKey(publicKeyB64: string): crypto.KeyObject {
  return crypto.createPublicKey({
    key: Buffer.from(publicKeyB64, 'base64'),
    format: 'der',
    type: 'spki',
  })
}

function importPrivateKey(privateKeyB64: string): crypto.KeyObject {
  return crypto.createPrivateKey({
    key: Buffer.from(privateKeyB64, 'base64'),
    format: 'der',
    type: 'pkcs8',
  })
}

export function getIdentityPublicKey(): string {
  if (!cached) {
    throw new Error('Identity not initialized; call initIdentity() first')
  }
  return cached.publicKeyB64
}

// 用当前身份密钥对 payload 的规范 JSON 进行签名
// payload 应为不包含 signature/publicKey 字段的 announcement 主体
export function signPayload(payload: Record<string, unknown>): string {
  if (!cached) {
    throw new Error('Identity not initialized; call initIdentity() first')
  }
  const data = Buffer.from(canonicalJSON(payload), 'utf-8')
  return crypto.sign(null, data, cached.privateKeyObj).toString('base64')
}

// 验证签名
// 返回 true 表示签名有效；返回 false 表示签名无效、密钥格式错误、payload 损坏
export function verifyPayload(payload: Record<string, unknown>, signatureB64: string, publicKeyB64: string): boolean {
  try {
    const publicKey = importPublicKey(publicKeyB64)
    const data = Buffer.from(canonicalJSON(payload), 'utf-8')
    const signature = Buffer.from(signatureB64, 'base64')
    return crypto.verify(null, data, publicKey, signature)
  } catch (err) {
    log.debug('Signature verification failed:', err)
    return false
  }
}

// 退出时清理内存
export function clearIdentity(): void {
  cached = null
  log.info('Identity cleared from memory')
}
