import crypto from 'crypto'
import { getMasterKey } from './master-key'

export function deriveStorageKey(): Buffer {
  return Buffer.from(crypto.hkdfSync('sha256', getMasterKey(), '', 'storage', 32))
}

// V1.2.0: 用于 Ed25519 身份私钥加密的派生 key
// 与 storage/transfer/session 派生 key 完全独立（info 不同）
// 这样 master key 即使是异常值（如 0 字节）也能通过 HKDF 输出标准 32 字节
export function deriveIdentityKey(): Buffer {
  return Buffer.from(crypto.hkdfSync('sha256', getMasterKey(), '', 'identity', 32))
}

export function deriveTransferKey(sessionKey: Buffer, transferId: string): Buffer {
  return Buffer.from(crypto.hkdfSync('sha256', sessionKey, '', `transfer-${transferId}`, 32))
}

export function deriveSessionKey(sharedSecret: Buffer): Buffer {
  return Buffer.from(crypto.hkdfSync('sha256', sharedSecret, '', 'session', 32))
}
