import os from 'os'
import type { NetworkSegment } from '@shared/types'

export function getNetworkInterfaces(): NetworkSegment[] {
  const interfaces = os.networkInterfaces()
  const segments: NetworkSegment[] = []

  for (const name of Object.keys(interfaces)) {
    const nets = interfaces[name]
    if (!nets) continue
    for (const net of nets) {
      if (net.family !== 'IPv4' || net.internal) continue
      const ip = net.address
      const mask = net.netmask
      const ipParts = ip.split('.').map(Number)
      const maskParts = mask.split('.').map(Number)
      const networkParts = ipParts.map((p, i) => p & maskParts[i])
      const broadcastParts = ipParts.map((p, i) => p | (~maskParts[i] & 255))
      const address = networkParts.join('.')
      const broadcast = broadcastParts.join('.')
      const cidr = `${address}/${maskToCIDR(mask)}`
      segments.push({ address, mask, broadcast, cidr })
    }
  }
  return segments
}

function maskToCIDR(mask: string): number {
  return mask
    .split('.')
    .map(Number)
    .reduce((acc, octet) => acc + octet.toString(2).split('').filter(b => b === '1').length, 0)
}

export function parseCIDR(cidr: string): NetworkSegment | null {
  const match = cidr.match(/^(\d+\.\d+\.\d+\.\d+)\/(\d+)$/)
  if (!match) return null
  const ip = match[1]
  const prefix = parseInt(match[2], 10)
  if (prefix < 0 || prefix > 32) return null
  const ipParts = ip.split('.').map(Number)
  const maskParts = [0, 0, 0, 0]
  let bits = prefix
  for (let i = 0; i < 4; i++) {
    if (bits >= 8) {
      maskParts[i] = 255
      bits -= 8
    } else if (bits > 0) {
      maskParts[i] = 256 - Math.pow(2, 8 - bits)
      bits = 0
    }
  }
  const networkParts = ipParts.map((p, i) => p & maskParts[i])
  const broadcastParts = ipParts.map((p, i) => p | (~maskParts[i] & 255))
  return {
    address: networkParts.join('.'),
    mask: maskParts.join('.'),
    broadcast: broadcastParts.join('.'),
    cidr,
  }
}
