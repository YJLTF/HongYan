import net from 'net'
import { getTcpPortDefault, getTcpPortMax } from '@shared/constants'
import { addConnection } from './connection-manager'
import type { ProtocolPacket } from '@shared/types'
import log from 'electron-log'

let server: net.Server | null = null
// initial value is overwritten in tryListen() before being read by getTcpPort()
let actualPort = 0
let onDataReceived: ((data: ProtocolPacket, peerIp: string) => void) | null = null

function extractPeerIdFromPacket(packet: any): string {
  return packet.data?.fromPeerId || packet.data?.peerId || ''
}

export function startTcpServer(
  onPacket: (data: ProtocolPacket, peerIp: string) => void
): Promise<number> {
  return new Promise((resolve, reject) => {
    onDataReceived = onPacket
    server = net.createServer((socket) => {
      let buffer = ''
      let peerId = ''
      let managed = false
      let firstPacket: ProtocolPacket | null = null
      socket.on('data', (chunk) => {
        if (managed) return
        buffer += chunk.toString('utf-8')
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (line.trim()) {
            try {
              const packet = JSON.parse(line) as ProtocolPacket
              if (!peerId) {
                peerId = extractPeerIdFromPacket(packet)
                if (peerId) {
                  managed = true
                  firstPacket = packet
                  addConnection(peerId, socket, firstPacket ? [firstPacket] : undefined)
                  buffer = ''
                }
              }
              if (!managed) {
                onDataReceived?.(packet, socket.remoteAddress || '')
              }
            } catch (err) {
              log.warn('Failed to parse TCP packet:', err)
            }
          }
        }
      })
      socket.on('error', (err) => {
        log.error('TCP socket error:', err)
      })
    })

    function tryListen(port: number): void {
      if (port > getTcpPortMax()) {
        reject(new Error('No available TCP port'))
        return
      }
      server!.listen(port, () => {
        actualPort = port
        log.info('TCP server started on port', port)
        resolve(port)
      })
      server!.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          log.info(`Port ${port} in use, trying ${port + 1}`)
          tryListen(port + 1)
        } else {
          reject(err)
        }
      })
    }

    tryListen(getTcpPortDefault())
  })
}

export function stopTcpServer(): void {
  if (server) {
    server.close()
    server = null
    log.info('TCP server stopped')
  }
}

export function getTcpPort(): number {
  return actualPort
}

export function sendTcpPacket(ip: string, port: number, packet: ProtocolPacket): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(port, ip, () => {
      const data = JSON.stringify(packet) + '\n'
      socket.write(data, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
    socket.on('error', (err) => {
      log.error('TCP send error:', err)
      reject(err)
    })
    socket.setTimeout(10000, () => {
      socket.destroy()
      reject(new Error('TCP connection timeout'))
    })
  })
}

export function sendTcpPacketAndConnect(ip: string, port: number, packet: ProtocolPacket): Promise<net.Socket | null> {
  return new Promise((resolve) => {
    const socket = net.createConnection(port, ip, () => {
      socket.setTimeout(0)
      const data = JSON.stringify(packet) + '\n'
      socket.write(data, (err) => {
        if (err) {
          socket.destroy()
          resolve(null)
        } else {
          resolve(socket)
        }
      })
    })
    socket.on('error', (err) => {
      log.error('TCP connect error:', err)
      resolve(null)
    })
    socket.setTimeout(10000, () => {
      socket.destroy()
      resolve(null)
    })
  })
}
