import { PROTOCOL_VERSION } from '@shared/types'
import type { ProtocolPacket } from '@shared/types'

export function serialize(packet: ProtocolPacket): string {
  return JSON.stringify(packet) + '\n'
}

export function deserialize(raw: string): ProtocolPacket | null {
  try {
    const packet = JSON.parse(raw) as ProtocolPacket
    if (!packet.kind) return null
    return packet
  } catch {
    return null
  }
}

export function createPacket(kind: string, data: unknown): ProtocolPacket {
  return { kind, data }
}
