import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { getAppDataDir, MASTER_KEY_FILE } from '@shared/constants'
import log from 'electron-log'

let masterKey: Buffer | null = null

function getMasterKeyPath(): string {
  return path.join(app.getPath('appData'), getAppDataDir(), MASTER_KEY_FILE)
}

function encryptWithDPAPI(plaintext: Buffer): Buffer {
  try {
    const { execSync } = require('child_process') as typeof import('child_process')
    const base64 = plaintext.toString('base64')
    const script = `
      Add-Type -AssemblyName System.Security
      $bytes = [Convert]::FromBase64String('${base64}')
      $encrypted = [System.Security.Cryptography.ProtectedData]::Protect($bytes, $null, 'CurrentUser')
      [Convert]::ToBase64String($encrypted)
    `
    const result = execSync(`powershell -NoProfile -Command "${script.replace(/"/g, '\\"')}"`, {
      encoding: 'utf-8',
    }).trim()
    return Buffer.from(result, 'base64')
  } catch (err) {
    log.error('DPAPI encryption failed:', err)
    throw new Error('Failed to encrypt master key with DPAPI')
  }
}

function decryptWithDPAPI(ciphertext: Buffer): Buffer {
  try {
    const { execSync } = require('child_process') as typeof import('child_process')
    const base64 = ciphertext.toString('base64')
    const script = `
      Add-Type -AssemblyName System.Security
      $bytes = [Convert]::FromBase64String('${base64}')
      $decrypted = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, 'CurrentUser')
      [Convert]::ToBase64String($decrypted)
    `
    const result = execSync(`powershell -NoProfile -Command "${script.replace(/"/g, '\\"')}"`, {
      encoding: 'utf-8',
    }).trim()
    return Buffer.from(result, 'base64')
  } catch (err) {
    log.error('DPAPI decryption failed:', err)
    throw new Error('Failed to decrypt master key with DPAPI')
  }
}

export function initMasterKey(): Buffer {
  const keyPath = getMasterKeyPath()
  if (fs.existsSync(keyPath)) {
    const encryptedKey = fs.readFileSync(keyPath)
    masterKey = decryptWithDPAPI(encryptedKey)
    // V1.2.0: 检测到 0 字节 master.key（V1.1.0 encryptWithDPAPI 偶发返回空 buffer 的 bug）
    // HKDF 派生后虽然能用，但安全性严重下降（攻击者可推算）
    if (masterKey.length === 0) {
      log.error('!!! master.key is corrupt (0 bytes). V1.1.0 DPAPI bug.')
      log.error('!!! Storage/identity encryption is using a deterministic insecure key.')
      log.error('!!! Recommend: backup your data, then delete master.key and identity.key to regenerate.')
    }
    log.info('Master key loaded from disk, length:', masterKey.length, 'bytes')
  } else {
    masterKey = crypto.randomBytes(32)
    const encryptedKey = encryptWithDPAPI(masterKey)
    // 防御性检查：拒绝写入空加密结果
    if (encryptedKey.length === 0) {
      throw new Error('DPAPI encryption returned empty buffer; refusing to write corrupt master.key')
    }
    const dir = path.dirname(keyPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(keyPath, encryptedKey)
    log.info('Master key generated and saved')
  }
  return masterKey
}

export function getMasterKey(): Buffer {
  if (!masterKey) {
    throw new Error('Master key not initialized')
  }
  return masterKey
}

export function clearMasterKey(): void {
  if (masterKey) {
    masterKey.fill(0)
    masterKey = null
  }
  log.info('Master key cleared from memory')
}
