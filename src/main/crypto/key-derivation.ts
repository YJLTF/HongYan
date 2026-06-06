import crypto from 'crypto'
import { getMasterKey } from './master-key'

export function deriveStorageKey(): Buffer {
  return Buffer.from(crypto.hkdfSync('sha256', getMasterKey(), '', 'storage', 32))
}

export function deriveTransferKey(sessionKey: Buffer, transferId: string): Buffer {
  return Buffer.from(crypto.hkdfSync('sha256', sessionKey, '', `transfer-${transferId}`, 32))
}

export function deriveSessionKey(sharedSecret: Buffer): Buffer {
  return Buffer.from(crypto.hkdfSync('sha256', sharedSecret, '', 'session', 32))
}
