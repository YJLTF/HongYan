import crypto from 'crypto'
import { deriveSessionKey } from './key-derivation'
import type { KeyNegotiationRequest, KeyNegotiationResponse } from '@shared/types'
import { PROTOCOL_VERSION } from '@shared/types'
import log from 'electron-log'

const ecdhInstances = new Map<string, crypto.ECDH>()

export function generateKeyPair(peerId: string): { publicKey: string; privateKey: string } {
  const ecdh = crypto.createECDH('prime256v1')
  ecdh.generateKeys()
  ecdhInstances.set(peerId, ecdh)
  return {
    publicKey: ecdh.getPublicKey('base64'),
    privateKey: ecdh.getPrivateKey('base64'),
  }
}

export function createNegotiationRequest(peerId: string, fromPeerId: string): KeyNegotiationRequest {
  const keyPair = generateKeyPair(peerId)
  return {
    version: PROTOCOL_VERSION,
    fromPeerId,
    publicKey: keyPair.publicKey,
    timestamp: Date.now(),
  }
}

export function computeSessionKey(peerId: string, remotePublicKey: string): Buffer | null {
  try {
    const ecdh = ecdhInstances.get(peerId)
    if (!ecdh) {
      log.warn('No ECDH instance for peer:', peerId)
      return null
    }
    const sharedSecret = ecdh.computeSecret(remotePublicKey, 'base64')
    const sessionKey = deriveSessionKey(sharedSecret)
    ecdhInstances.delete(peerId)
    return sessionKey
  } catch (err) {
    log.error('Key negotiation failed for peer:', peerId, err)
    return null
  }
}

export function handleNegotiationRequest(
  request: KeyNegotiationRequest,
  selfPeerId: string
): { response: KeyNegotiationResponse; sessionKey: Buffer } | null {
  try {
    const ecdh = crypto.createECDH('prime256v1')
    ecdh.generateKeys()
    const sharedSecret = ecdh.computeSecret(request.publicKey, 'base64')
    const sessionKey = deriveSessionKey(sharedSecret)
    return {
      response: {
        version: PROTOCOL_VERSION,
        fromPeerId: selfPeerId,
        publicKey: ecdh.getPublicKey('base64'),
        timestamp: Date.now(),
      },
      sessionKey,
    }
  } catch (err) {
    log.error('Failed to handle key negotiation request:', err)
    return null
  }
}

export function cleanupNegotiation(peerId: string): void {
  ecdhInstances.delete(peerId)
}

export function hasPendingNegotiation(peerId: string): boolean {
  return ecdhInstances.has(peerId)
}
