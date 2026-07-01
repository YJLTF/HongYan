import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { encrypt as aesEncrypt, decrypt as aesDecrypt } from './aes-gcm'
import { GROUP_KEY_VERSION_RETENTION } from '@shared/constants'
import { getDataDir } from '../storage/database'
import { getMasterKey } from './master-key'
import type { EncryptedData } from '@shared/types'
import log from 'electron-log'

interface GroupKeyEntry {
  key: Buffer
  createdAt: number
}

const groupKeys = new Map<string, Map<number, GroupKeyEntry>>()
const pendingKeyDeliveries = new Map<string, Set<string>>()

// V1.4.0 修复：群密钥原本只在内存，重启后丢失导致"No group key available"。
// 改为加密持久化到 ${dataDir}/group-keys.json，启动时由 loadAllGroupKeys() 恢复。
const GROUP_KEYS_FILE = 'group-keys.json'
const GROUP_KEYS_AAD = 'abcd-group-keys-v1'
// V1.6.0 改名遗留：旧版用 hongyan-group-keys-v1 作为 AES-GCM AAD。
// loadAllGroupKeys() 在新 AAD 解密失败时回退到旧 AAD，并立即用新 AAD 重新加密落盘，保证平滑迁移。
const LEGACY_GROUP_KEYS_AAD = 'hongyan-group-keys-v1'
const GROUP_KEYS_FORMAT_VERSION = 1

function getGroupKeysPath(): string {
  return path.join(getDataDir(), GROUP_KEYS_FILE)
}

function persistGroupKeys(): void {
  try {
    const masterKey = getMasterKey()
    if (masterKey.length === 0) {
      log.warn('Master key is empty, skip persisting group keys')
      return
    }
    const data: Record<string, Record<string, { key: string; createdAt: number }>> = {}
    for (const [groupId, versions] of groupKeys.entries()) {
      data[groupId] = {}
      for (const [v, entry] of versions.entries()) {
        data[groupId][String(v)] = { key: entry.key.toString('base64'), createdAt: entry.createdAt }
      }
    }
    const plaintext = JSON.stringify(data)
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv)
    cipher.setAAD(Buffer.from(GROUP_KEYS_AAD, 'utf-8'))
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()])
    const tag = cipher.getAuthTag()
    const payload = {
      v: GROUP_KEYS_FORMAT_VERSION,
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      data: ciphertext.toString('base64'),
    }
    const filePath = getGroupKeysPath()
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(payload), 'utf-8')
  } catch (err) {
    log.error('Failed to persist group keys:', err)
  }
}

// 用指定 AAD 解密 group-keys.json 负载，成功返回明文，失败抛出
function decryptGroupKeysPayload(masterKey: Buffer, payload: any, aad: string): string {
  const iv = Buffer.from(payload.iv, 'base64')
  const tag = Buffer.from(payload.tag, 'base64')
  const ciphertext = Buffer.from(payload.data, 'base64')
  const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, iv)
  decipher.setAAD(Buffer.from(aad, 'utf-8'))
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf-8')
}

export function loadAllGroupKeys(): void {
  try {
    const filePath = getGroupKeysPath()
    if (!fs.existsSync(filePath)) {
      log.info('No persisted group keys file found')
      return
    }
    const masterKey = getMasterKey()
    if (masterKey.length === 0) {
      log.warn('Master key is empty, cannot load group keys')
      return
    }
    const raw = fs.readFileSync(filePath, 'utf-8')
    const payload = JSON.parse(raw)
    if (payload.v !== GROUP_KEYS_FORMAT_VERSION) {
      log.warn(`Unknown group-keys file version: ${payload.v}, skip`)
      return
    }

    // V1.6.0: 优先用新 AAD 解密；失败则回退到旧 AAD，并用新 AAD 重新加密落盘
    let plaintext: string
    let usedLegacyAad = false
    try {
      plaintext = decryptGroupKeysPayload(masterKey, payload, GROUP_KEYS_AAD)
    } catch (e) {
      log.info('Group keys decrypt with new AAD failed, trying legacy AAD:', (e as Error).message)
      plaintext = decryptGroupKeysPayload(masterKey, payload, LEGACY_GROUP_KEYS_AAD)
      usedLegacyAad = true
    }

    const data = JSON.parse(plaintext) as Record<string, Record<string, { key: string; createdAt: number }>>
    let totalKeys = 0
    for (const [groupId, versions] of Object.entries(data)) {
      const vMap = new Map<number, GroupKeyEntry>()
      for (const [v, entry] of Object.entries(versions)) {
        vMap.set(Number(v), {
          key: Buffer.from(entry.key, 'base64'),
          createdAt: entry.createdAt,
        })
        totalKeys++
      }
      groupKeys.set(groupId, vMap)
    }
    log.info(`Loaded ${groupKeys.size} groups (${totalKeys} keys) from ${GROUP_KEYS_FILE}`)

    // 用旧 AAD 解密成功 → 用新 AAD 重新加密落盘，避免每次启动都回退
    if (usedLegacyAad) {
      log.info('Re-encrypting group keys with new AAD after legacy migration')
      persistGroupKeys()
    }
  } catch (err) {
    log.error('Failed to load group keys:', err)
  }
}

export function generateGroupKey(): Buffer {
  return crypto.randomBytes(32)
}

export function encryptGroupKeyPayload(groupKey: Buffer, groupId: string, keyVersion: number): string {
  const payload = JSON.stringify({
    groupId,
    keyVersion,
    groupKey: groupKey.toString('base64'),
  })
  return payload
}

export function decryptGroupKeyPayload(payload: string): { groupId: string; keyVersion: number; groupKey: Buffer } {
  const obj = JSON.parse(payload)
  return {
    groupId: obj.groupId,
    keyVersion: obj.keyVersion,
    groupKey: Buffer.from(obj.groupKey, 'base64'),
  }
}

export function registerGroupKey(groupId: string, keyVersion: number, key: Buffer): void {
  let versions = groupKeys.get(groupId)
  if (!versions) {
    versions = new Map()
    groupKeys.set(groupId, versions)
  }
  versions.set(keyVersion, { key, createdAt: Date.now() })

  // 清理超过保留数量的旧版本
  const retention = GROUP_KEY_VERSION_RETENTION + 1
  if (versions.size > retention) {
    const sortedVersions = Array.from(versions.keys()).sort((a, b) => a - b)
    const toDelete = sortedVersions.slice(0, versions.size - retention)
    for (const v of toDelete) {
      versions.delete(v)
    }
  }

  persistGroupKeys()
  log.info(`Registered group key: groupId=${groupId} version=${keyVersion}`)
}

export function getGroupKey(groupId: string, keyVersion: number): Buffer | null {
  const versions = groupKeys.get(groupId)
  if (!versions) return null
  const entry = versions.get(keyVersion)
  return entry ? entry.key : null
}

export function getCurrentGroupKey(groupId: string): Buffer | null {
  const versions = groupKeys.get(groupId)
  if (!versions || versions.size === 0) return null
  let maxVersion = -1
  for (const v of versions.keys()) {
    if (v > maxVersion) maxVersion = v
  }
  return maxVersion >= 0 ? versions.get(maxVersion)!.key : null
}

export function hasGroupKey(groupId: string, keyVersion: number): boolean {
  return getGroupKey(groupId, keyVersion) !== null
}

export function dropGroupKeys(groupId: string): void {
  const versions = groupKeys.get(groupId)
  if (versions) {
    for (const entry of versions.values()) {
      entry.key.fill(0)
    }
    versions.clear()
    groupKeys.delete(groupId)
  }
  pendingKeyDeliveries.delete(groupId)
  persistGroupKeys()
  log.info(`Dropped all keys for group: ${groupId}`)
}

export function dropAllGroupKeys(): void {
  for (const groupId of Array.from(groupKeys.keys())) {
    dropGroupKeys(groupId)
  }
  pendingKeyDeliveries.clear()
  persistGroupKeys()
}

export function markPendingKeyDelivery(groupId: string, peerId: string): void {
  let set = pendingKeyDeliveries.get(groupId)
  if (!set) {
    set = new Set()
    pendingKeyDeliveries.set(groupId, set)
  }
  set.add(peerId)
}

export function clearPendingKeyDelivery(groupId: string, peerId: string): void {
  pendingKeyDeliveries.get(groupId)?.delete(peerId)
}

export function getPendingKeyDeliveries(groupId: string): string[] {
  return Array.from(pendingKeyDeliveries.get(groupId) || [])
}

// 群密钥的 AES-256-GCM 加密/解密
// aad 用 groupId 防止跨群重放
export function encryptWithGroupKey(groupKey: Buffer, plaintext: string, groupId: string): EncryptedData {
  return aesEncrypt(groupKey, plaintext, groupId)
}

export function decryptWithGroupKey(groupKey: Buffer, encrypted: EncryptedData, groupId: string): string {
  // aad 不一致时 GCM 验签会失败
  if (encrypted.aad && encrypted.aad !== groupId) {
    throw new Error('Group key AAD mismatch')
  }
  return aesDecrypt(groupKey, encrypted)
}
