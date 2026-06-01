import net from 'net'
import { sendTcpPacketAndConnect } from './tcp-communication'
import type { ProtocolPacket, Friend } from '@shared/types'
import log from 'electron-log'

interface ManagedConnection {
  socket: net.Socket
  peerId: string
  buffer: string
}

const connections = new Map<string, ManagedConnection>()
let onPacketReceived: ((data: ProtocolPacket, peerId: string) => void) | null = null

export function setPacketHandler(
  handler: (data: ProtocolPacket, peerId: string) => void
): void {
  onPacketReceived = handler
}

export function getConnection(peerId: string): ManagedConnection | undefined {
  return connections.get(peerId)
}

export function addConnection(peerId: string, socket: net.Socket, initialPackets?: ProtocolPacket[]): void {
  const existing = connections.get(peerId)
  if (existing && existing.socket !== socket && !existing.socket.destroyed) {
    existing.socket.destroy()
  }

  const conn: ManagedConnection = {
    socket,
    peerId,
    buffer: '',
  }
  connections.set(peerId, conn)

  if (initialPackets) {
    for (const packet of initialPackets) {
      onPacketReceived?.(packet, peerId)
    }
  }

  socket.on('data', (chunk) => {
    conn.buffer += chunk.toString('utf-8')
    const lines = conn.buffer.split('\n')
    conn.buffer = lines.pop() || ''
    for (const line of lines) {
      if (line.trim()) {
        try {
          const packet = JSON.parse(line) as ProtocolPacket
          onPacketReceived?.(packet, peerId)
        } catch (err) {
          log.warn('Failed to parse packet from peer:', peerId, err)
        }
      }
    }
  })

  socket.on('close', () => {
    connections.delete(peerId)
    log.info('Connection closed for peer:', peerId)
  })

  socket.on('error', (err) => {
    log.error('Connection error for peer:', peerId, err)
    connections.delete(peerId)
  })
}

export async function sendToPeer(friend: Friend, packet: ProtocolPacket): Promise<void> {
  const conn = connections.get(friend.peerId)
  if (conn && !conn.socket.destroyed) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(packet) + '\n'
      conn.socket.write(data, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }
  const socket = await sendTcpPacketAndConnect(friend.ip, friend.tcpPort, packet)
  if (socket) {
    addConnection(friend.peerId, socket)
  }
}

export function removeConnection(peerId: string): void {
  const conn = connections.get(peerId)
  if (conn) {
    conn.socket.destroy()
    connections.delete(peerId)
  }
}

export function closeAll(): void {
  for (const [peerId, conn] of connections) {
    conn.socket.destroy()
  }
  connections.clear()
  log.info('All connections closed')
}
