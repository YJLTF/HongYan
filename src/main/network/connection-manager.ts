import net from 'net'
import { EventEmitter } from 'events'
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

// V1.2.0: 事件总线，供其他模块订阅 TCP 连接断开事件
// 应用：friend-discovery-service 订阅 peer:disconnected 以立即标记好友离线
const connectionEvents = new EventEmitter()

export function setPacketHandler(
  handler: (data: ProtocolPacket, peerId: string) => void
): void {
  onPacketReceived = handler
}

// V1.2.0: 导出事件总线
export function getConnectionEvents(): EventEmitter {
  return connectionEvents
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
    // V1.2.0: 主动 emit，供 friend-discovery-service 立即标记离线（不等 UDP 心跳超时）
    connectionEvents.emit('peer:disconnected', peerId)
  })

  socket.on('error', (err) => {
    log.error('Connection error for peer:', peerId, err)
    connections.delete(peerId)
    connectionEvents.emit('peer:disconnected', peerId)
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
