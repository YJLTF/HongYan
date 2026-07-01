import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { getAppDataDir, MASTER_KEY_FILE } from '@shared/constants'
import log from 'electron-log'

// V1.2.0 加固：解决 V1.1.0 的几个隐藏 bug
//   Bug #1: encryptWithDPAPI 在 PowerShell 偶发场景下返回空 buffer，
//           fs.writeFileSync 静默写入 0 字节 master.key
//   Bug #2: 0 字节 master.key 加载时不被检测，DPAPI Unprotect 对空输入行为未定义
//   Bug #3: 脚本用裸表达式输出，可能被 PowerShell 其他输出污染
//   Bug #4: 出错信息笼统，无法定位是 PowerShell 错误还是脚本逻辑错误
//
// 修复策略：
//   - PowerShell 脚本显式 try/catch + 显式 exit code + 显式 [Console]::Out.Write
//   - 节点层每次都对结果做非空校验，校验失败立即 throw 拒绝写入
//   - 加载 0 字节文件时 log.error 明确告警但不 throw，保留向后兼容
//     （HKDF 派生后虽然能用但安全等级下降，由用户在知情前提下决定是否清理）

let masterKey: Buffer | null = null

function getMasterKeyPath(): string {
  return path.join(app.getPath('appData'), getAppDataDir(), MASTER_KEY_FILE)
}

interface DpapiResult {
  ok: boolean
  buffer: Buffer
  errorMsg?: string
}

// 在临时 .ps1 文件里跑脚本，避免 -Command 长字符串在多行/引号转义上的坑
// 写文件 + 执行 + 删除全过程 try/finally 保证清理
function runPowerShellScript(script: string): string {
  const { execFileSync } = require('child_process') as typeof import('child_process')
  const os = require('os') as typeof import('os')
  const scriptPath = path.join(os.tmpdir(), `message-dpapi-${process.pid}-${Date.now()}.ps1`)
  fs.writeFileSync(scriptPath, script, { encoding: 'utf-8' })
  try {
    return execFileSync('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-NonInteractive',
      '-File', scriptPath,
    ], { encoding: 'utf-8' }).trim()
  } finally {
    try { fs.unlinkSync(scriptPath) } catch { /* ignore */ }
  }
}

function buildEncryptScript(base64Plaintext: string): string {
  return `$ErrorActionPreference = 'Stop'
try {
  Add-Type -AssemblyName System.Security
  $bytes = [Convert]::FromBase64String('${base64Plaintext}')
  $encrypted = [System.Security.Cryptography.ProtectedData]::Protect($bytes, $null, 'CurrentUser')
  if ($null -eq $encrypted -or $encrypted.Length -eq 0) {
    [Console]::Error.WriteLine('DPAPI.Protect returned null or empty')
    exit 2
  }
  [Console]::Out.Write([Convert]::ToBase64String($encrypted))
  exit 0
} catch {
  [Console]::Error.WriteLine($_.Exception.GetType().FullName + ': ' + $_.Exception.Message)
  exit 1
}`
}

function buildDecryptScript(base64Ciphertext: string): string {
  return `$ErrorActionPreference = 'Stop'
try {
  Add-Type -AssemblyName System.Security
  $bytes = [Convert]::FromBase64String('${base64Ciphertext}')
  $decrypted = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, 'CurrentUser')
  if ($null -eq $decrypted -or $decrypted.Length -eq 0) {
    [Console]::Error.WriteLine('DPAPI.Unprotect returned null or empty')
    exit 2
  }
  [Console]::Out.Write([Convert]::ToBase64String($decrypted))
  exit 0
} catch {
  [Console]::Error.WriteLine($_.Exception.GetType().FullName + ': ' + $_.Exception.Message)
  exit 1
}`
}

function encryptWithDPAPI(plaintext: Buffer): Buffer {
  if (!Buffer.isBuffer(plaintext) || plaintext.length === 0) {
    throw new Error('DPAPI encrypt: plaintext is empty or not a Buffer')
  }
  try {
    const script = buildEncryptScript(plaintext.toString('base64'))
    const result = runPowerShellScript(script)
    if (!result) {
      throw new Error('PowerShell produced empty stdout (DPAPI bug?)')
    }
    const decoded = Buffer.from(result, 'base64')
    if (decoded.length === 0) {
      throw new Error('PowerShell output decoded to empty buffer')
    }
    return decoded
  } catch (err) {
    log.error('DPAPI encryption failed:', err)
    throw new Error('Failed to encrypt master key with DPAPI: ' + (err as Error).message)
  }
}

function decryptWithDPAPI(ciphertext: Buffer): Buffer {
  if (!Buffer.isBuffer(ciphertext) || ciphertext.length === 0) {
    throw new Error('DPAPI decrypt: ciphertext is empty or not a Buffer (master.key may be corrupt)')
  }
  try {
    const script = buildDecryptScript(ciphertext.toString('base64'))
    const result = runPowerShellScript(script)
    if (!result) {
      throw new Error('PowerShell produced empty stdout (DPAPI bug?)')
    }
    const decoded = Buffer.from(result, 'base64')
    if (decoded.length === 0) {
      throw new Error('PowerShell output decoded to empty buffer')
    }
    return decoded
  } catch (err) {
    log.error('DPAPI decryption failed:', err)
    throw new Error('Failed to decrypt master key with DPAPI: ' + (err as Error).message)
  }
}

export function initMasterKey(): Buffer {
  const keyPath = getMasterKeyPath()
  if (fs.existsSync(keyPath)) {
    // V1.2.0: 文件大小预检，避免把 0 字节文件喂给 DPAPI Unprotect
    const stat = fs.statSync(keyPath)
    if (stat.size === 0) {
      log.error('!!! master.key is corrupt: 0 bytes on disk (V1.1.0 DPAPI bug artifact).')
      log.error('!!! Will use HKDF-derived deterministic key (insecure but functional).')
      log.error('!!! To recover: backup your data, then delete master.key and identity.key to regenerate.')
      masterKey = Buffer.alloc(0)
      return masterKey
    }
    const encryptedKey = fs.readFileSync(keyPath)
    masterKey = decryptWithDPAPI(encryptedKey)
    if (masterKey.length === 0) {
      log.error('!!! Decrypted master key is 0 bytes (unexpected — DPAPI returned empty).')
      log.error('!!! Will use HKDF-derived deterministic key (insecure but functional).')
    } else {
      log.info('Master key loaded from disk, length:', masterKey.length, 'bytes')
    }
  } else {
    masterKey = crypto.randomBytes(32)
    const encryptedKey = encryptWithDPAPI(masterKey)
    // 防御性检查：encryptWithDPAPI 内部已校验，这里再 double-check
    if (encryptedKey.length === 0) {
      throw new Error('DPAPI encryption returned empty buffer; refusing to write corrupt master.key')
    }
    const dir = path.dirname(keyPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(keyPath, encryptedKey)
    log.info('Master key generated and saved, encrypted length:', encryptedKey.length, 'bytes')
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
