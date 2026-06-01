import { encrypt, decrypt } from './aes-gcm'
import type { EncryptedData } from '@shared/types'

let storageKey: Buffer | null = null

export function initStorageEncryption(key: Buffer): void {
  storageKey = key
}

export function encryptForStorage(plaintext: string): EncryptedData {
  if (!storageKey) throw new Error('Storage encryption not initialized')
  return encrypt(storageKey, plaintext, 'storage')
}

export function decryptFromStorage(data: EncryptedData): string {
  if (!storageKey) throw new Error('Storage encryption not initialized')
  return decrypt(storageKey, data)
}
