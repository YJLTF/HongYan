export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  FILE = 'file',
}

export enum MessageStatus {
  SENDING = 'sending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  FAILED = 'failed',
}

export enum FileTransferStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  TRANSFERRING = 'transferring',
  COMPLETED = 'completed',
  FAILED = 'failed',
  INTERRUPTED = 'interrupted',
}

export interface PresenceAnnouncement {
  version: number
  peerId: string
  nickname: string
  ip: string
  tcpPort: number
  timestamp: number
}

export interface Friend {
  peerId: string
  nickname: string
  remark?: string
  avatar?: string
  ip: string
  tcpPort: number
  online: boolean
  lastSeen: number
}

export interface NetworkSegment {
  address: string
  mask: string
  broadcast: string
  cidr: string
}

export interface MessagePacket {
  version: number
  type: MessageType
  messageId: string
  fromPeerId: string
  toPeerId: string
  timestamp: number
  payload: string
  thumbnail?: string
  fileName?: string
  fileSize?: number
}

export interface ChatRecord {
  id: string
  peerId: string
  type: MessageType
  direction: 'sent' | 'received'
  content: string
  thumbnail?: string
  fileName?: string
  fileSize?: number
  status: MessageStatus
  timestamp: number
}

export interface FileTransferRecord {
  transferId: string
  peerId: string
  direction: 'send' | 'receive'
  fileName: string
  fileSize: number
  status: FileTransferStatus
  progress: number
  md5?: string
  savePath?: string
  timestamp: number
}

export interface AppConfig {
  peerId: string
  nickname: string
  avatar?: string
  defaultSegment?: string
  scanSegments?: string[] // 需要扫描的网段列表
}

export interface EncryptedData {
  iv: string
  ciphertext: string
  tag: string
  aad?: string
}

export interface FileRequestPacket {
  version: number
  transferId: string
  fromPeerId: string
  toPeerId: string
  fileName: string
  fileSize: number
  md5: string
  timestamp: number
}

export interface FileAcceptPacket {
  version: number
  transferId: string
  accepted: boolean
}

export interface FileChunkPacket {
  version: number
  transferId: string
  sequence: number
  data: string
}

export interface FileCompletePacket {
  version: number
  transferId: string
  md5: string
}

export interface KeyNegotiationRequest {
  version: number
  fromPeerId: string
  publicKey: string
  timestamp: number
}

export interface KeyNegotiationResponse {
  version: number
  fromPeerId: string
  publicKey: string
  timestamp: number
}

export interface MessageAckPacket {
  version: number
  messageId: string
  timestamp: number
}

export interface ProtocolPacket {
  kind: string
  data: unknown
}

export interface IFriendDiscoveryService {
  start(): void
  stop(): void
  scanSegment(cidr: string): Promise<Friend[]>
  getFriends(): Friend[]
  getFriend(peerId: string): Friend | undefined
}

export interface IMessageService {
  sendText(peerId: string, content: string): Promise<string>
  sendImage(peerId: string, filePath: string): Promise<string>
  loadHistory(peerId: string, limit?: number, offset?: number): Promise<ChatRecord[]>
}

export interface IFileTransferService {
  sendFile(peerId: string, filePath: string): Promise<string>
  acceptTransfer(transferId: string, savePath: string): void
  rejectTransfer(transferId: string): void
  getTransfers(): FileTransferRecord[]
}

export interface ICryptoService {
  negotiateKey(peerId: string, remotePublicKey?: string): Promise<string | null>
  encryptForTransmission(peerId: string, plaintext: string): EncryptedData
  decryptFromTransmission(peerId: string, encrypted: EncryptedData): string
  encryptForStorage(plaintext: string): EncryptedData
  decryptFromStorage(encrypted: EncryptedData): string
  getPublicKey(): string
}

export interface IStorageService {
  saveChatRecord(record: ChatRecord): void
  saveChatRecords(records: ChatRecord[]): void
  queryChatRecords(peerId: string, limit?: number, offset?: number): ChatRecord[]
  saveFriend(friend: Friend): void
  queryFriends(): Friend[]
  updateFriendOnlineStatus(peerId: string, online: boolean): void
  saveFileTransfer(record: FileTransferRecord): void
  updateFileTransferStatus(transferId: string, status: FileTransferStatus, progress?: number): void
  queryFileTransfers(peerId?: string): FileTransferRecord[]
  saveConfig(config: AppConfig): void
  loadConfig(): AppConfig | null
}

export const MainToRendererChannels = {
  FRIEND_ONLINE: 'friend:online',
  FRIEND_OFFLINE: 'friend:offline',
  MESSAGE_RECEIVED: 'message:received',
  MESSAGE_STATUS_UPDATED: 'message:status-updated',
  FILE_TRANSFER_REQUEST: 'file:transfer-request',
  FILE_PROGRESS: 'file:progress',
  FILE_COMPLETED: 'file:completed',
  FILE_FAILED: 'file:failed',
} as const

export const RendererToMainChannels = {
  FRIEND_SCAN_SEGMENT: 'friend:scan-segment',
  MESSAGE_SEND_TEXT: 'message:send-text',
  MESSAGE_SEND_IMAGE: 'message:send-image',
  CHAT_LOAD_HISTORY: 'chat:load-history',
  FILE_SEND: 'file:send',
  FILE_ACCEPT: 'file:accept',
  FILE_REJECT: 'file:reject',
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',
} as const

export const PROTOCOL_VERSION = 1
