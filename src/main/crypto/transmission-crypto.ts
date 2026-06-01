import { encrypt, decrypt } from './aes-gcm'
import type { EncryptedData } from '@shared/types'

export function encryptForTransmission(key: Buffer, plaintext: string, aad?: string): EncryptedData {
  return encrypt(key, plaintext, aad ?? 'transmission')
}

export function decryptFromTransmission(key: Buffer, data: EncryptedData): string {
  return decrypt(key, data)
}
