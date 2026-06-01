import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { APP_DATA_DIR, MASTER_KEY_FILE } from '@shared/constants'
import log from 'electron-log'

let masterKey: Buffer | null = null

function getMasterKeyPath(): string {
  return path.join(app.getPath('appData'), APP_DATA_DIR, MASTER_KEY_FILE)
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
    log.info('Master key loaded from disk')
  } else {
    masterKey = crypto.randomBytes(32)
    const encryptedKey = encryptWithDPAPI(masterKey)
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
