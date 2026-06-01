import crypto from 'crypto'
import { KEY_EXPIRY_MS } from '@shared/constants'
import { createNegotiationRequest, computeSessionKey, handleNegotiationRequest, cleanupNegotiation } from './key-negotiation'
import { encryptForTransmission, decryptFromTransmission } from './transmission-crypto'
import { encryptForStorage, decryptFromStorage } from './storage-crypto'
import { deriveStorageKey, deriveTransferKey } from './key-derivation'
import { initMasterKey, getMasterKey, clearMasterKey } from './master-key'
import { initStorageEncryption } from './storage-crypto'
import type { ICryptoService, EncryptedData } from '@shared/types'
import log from 'electron-log'

interface SessionKeyEntry {
  key: Buffer
  createdAt: number
  needsRenegotiation: boolean
}

const sessionKeys = new Map<string, SessionKeyEntry>()
const pendingNegotiations = new Map<string, { resolve: (key: Buffer) => void; reject: (err: Error) => void; timer: NodeJS.Timeout }>()
let selfPeerId = ''

class CryptoService implements ICryptoService {
  init(peerId: string): void {
    selfPeerId = peerId
    const masterKey = initMasterKey()
    const storageKey = deriveStorageKey()
    initStorageEncryption(storageKey)
    log.info('Crypto service initialized for peer:', peerId)
  }

  async negotiateKey(peerId: string, remotePublicKey?: string): Promise<string | null> {
    if (remotePublicKey) {
      const sessionKey = computeSessionKey(peerId, remotePublicKey)
      if (sessionKey) {
        sessionKeys.set(peerId, { key: sessionKey, createdAt: Date.now(), needsRenegotiation: false })
        log.info('Session key established with peer:', peerId)
        const pending = pendingNegotiations.get(peerId)
        if (pending) {
          clearTimeout(pending.timer)
          pending.resolve(sessionKey)
          pendingNegotiations.delete(peerId)
        }
        return sessionKey.toString('base64')
      }
      return null
    }
    const request = createNegotiationRequest(peerId, selfPeerId)
    return JSON.stringify(request)
  }

  waitForSessionKey(peerId: string, timeoutMs = 10000): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingNegotiations.delete(peerId)
        reject(new Error('Key negotiation timeout'))
      }, timeoutMs)
      pendingNegotiations.set(peerId, { resolve, reject, timer })
    })
  }

  handleIncomingNegotiation(request: any): { response: any; sessionKey: Buffer } | null {
    return handleNegotiationRequest(request, selfPeerId)
  }

  encryptForTransmission(peerId: string, plaintext: string): EncryptedData {
    const entry = this.getValidSessionKey(peerId)
    if (!entry) throw new Error(`No valid session key for peer: ${peerId}`)
    return encryptForTransmission(entry.key, plaintext, peerId)
  }

  decryptFromTransmission(peerId: string, encrypted: EncryptedData): string {
    const entry = sessionKeys.get(peerId)
    if (!entry) throw new Error(`No session key for peer: ${peerId}`)
    return decryptFromTransmission(entry.key, encrypted)
  }

  encryptForStorage(plaintext: string): EncryptedData {
    return encryptForStorage(plaintext)
  }

  decryptFromStorage(encrypted: EncryptedData): string {
    return decryptFromStorage(encrypted)
  }

  getPublicKey(): string {
    return getMasterKey().toString('base64')
  }

  setSessionKey(peerId: string, key: Buffer): void {
    sessionKeys.set(peerId, { key, createdAt: Date.now(), needsRenegotiation: false })
  }

  getSessionKey(peerId: string): Buffer | null {
    const entry = sessionKeys.get(peerId)
    return entry ? entry.key : null
  }

  removeSessionKey(peerId: string): void {
    sessionKeys.delete(peerId)
    cleanupNegotiation(peerId)
  }

  needsRenegotiation(peerId: string): boolean {
    const entry = sessionKeys.get(peerId)
    if (!entry) return true
    if (Date.now() - entry.createdAt > KEY_EXPIRY_MS) {
      entry.needsRenegotiation = true
      return true
    }
    return entry.needsRenegotiation
  }

  destroy(): void {
    for (const [_, entry] of sessionKeys) {
      entry.key.fill(0)
    }
    sessionKeys.clear()
    for (const [_, pending] of pendingNegotiations) {
      clearTimeout(pending.timer)
      pending.reject(new Error('Crypto service destroyed'))
    }
    pendingNegotiations.clear()
    clearMasterKey()
    log.info('Crypto service destroyed, all keys cleared')
  }

  private getValidSessionKey(peerId: string): SessionKeyEntry | null {
    const entry = sessionKeys.get(peerId)
    if (!entry) return null
    if (Date.now() - entry.createdAt > KEY_EXPIRY_MS) {
      entry.needsRenegotiation = true
      return null
    }
    return entry
  }
}

export const cryptoService = new CryptoService()
