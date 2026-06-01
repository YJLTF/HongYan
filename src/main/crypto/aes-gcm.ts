import crypto from 'crypto'
import type { EncryptedData } from '@shared/types'

export function encrypt(key: Buffer, plaintext: string, aad?: string): EncryptedData {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 })
  if (aad) {
    cipher.setAAD(Buffer.from(aad, 'utf-8'))
  }
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    iv: iv.toString('base64'),
    ciphertext: encrypted.toString('base64'),
    tag: tag.toString('base64'),
    aad,
  }
}

export function decrypt(key: Buffer, data: EncryptedData): string {
  const iv = Buffer.from(data.iv, 'base64')
  const ciphertext = Buffer.from(data.ciphertext, 'base64')
  const tag = Buffer.from(data.tag, 'base64')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 })
  decipher.setAuthTag(tag)
  if (data.aad) {
    decipher.setAAD(Buffer.from(data.aad, 'utf-8'))
  }
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return decrypted.toString('utf-8')
}
