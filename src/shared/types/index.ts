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

// V1.4.0: 区分 1:1 私聊和群聊会话
export enum ConversationType {
  P2P = 'p2p',
  GROUP = 'group',
}

// V1.4.0: 群成员角色
export enum GroupRole {
  OWNER = 'owner',
  MEMBER = 'member',
}

export interface PresenceAnnouncement {
  version: number
  peerId: string
  nickname: string
  ip: string
  tcpPort: number
  timestamp: number
  // V1.2.0: UDP 广播包签名（防伪造）
  // publicKey 暴露给接收方用于验签；signature 是对其他所有字段的 Ed25519 签名
  // 旧版 V1.1.0 客户端不发送这两个字段，V1.2.0 接收时按 legacy 处理
  publicKey?: string
  signature?: string
  // V1.5.0: 应用版本（用于收端判断「是否提示更新」）。旧版客户端不携带此字段
  appVersion?: string
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
  // V1.2.0: 持久化对方公钥用于 TOFU 信任链
  publicKey?: string
  // V1.2.0: 标记签名不可验证的旧版客户端（warning 但不阻止）
  untrusted?: boolean
  // V1.5.0: 好友当前的应用版本（来自 presence 包的 appVersion 字段；缺失视为 1.0.0）
  appVersion?: string
}

// V1.4.0: 群成员
export interface GroupMember {
  peerId: string
  nickname: string
  remark?: string
  avatar?: string
  joinedAt: number
  role: GroupRole
  // 持有群密钥的版本号（用于群密钥轮换时识别需要重新分发的成员）
  keyVersion: number
}

// V1.4.0: 群
export interface Group {
  groupId: string         // grp_<uuid> 命名空间前缀
  groupName: string
  ownerPeerId: string
  members: GroupMember[]
  avatar?: string
  createdAt: number
  updatedAt: number
  // 当前群密钥版本号；成员加入/退出触发 +1
  keyVersion: number
  // 备注（仅本地显示）
  remark?: string
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
  // 1:1 场景：peerId 为对方 peerId，groupId 为空
  // 群聊场景：groupId 为群 ID，peerId 为空（或保留发送者方便查询）
  peerId?: string
  type: MessageType
  direction: 'sent' | 'received'
  content: string
  thumbnail?: string
  fileName?: string
  fileSize?: number
  status: MessageStatus
  timestamp: number
  recalled?: boolean
  // V1.4.0: 会话类型
  conversationType?: ConversationType
  // V1.4.0: 群聊时为群 ID
  groupId?: string
  // V1.4.0: 群聊时为消息发送者 peerId（1:1 时可省略：发送=自己，接收=peerId）
  senderPeerId?: string
  // V1.4.0: @ 提及的成员 peerId
  mentions?: string[]
  // V1.4.0: @ 所有人
  mentionedAll?: boolean
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
  userDataDir?: string   // 自定义数据目录（需要重启应用生效）
  downloadPath?: string   // 默认下载路径
  // V1.2.0：低频心跳间隔（ms），用于检测对方静默崩溃；0 = 完全关闭心跳
  heartbeatIntervalMs?: number
  // V1.3.0 消息提醒相关配置
  closeToTray?: boolean         // 关闭按钮是否最小化到托盘（默认 true）
  enableNotifications?: boolean // 启用系统横幅通知（默认 true）
  enableTaskbarFlash?: boolean  // 启用 Windows 任务栏闪烁（默认 true）
  enableTrayFlash?: boolean     // 启用托盘图标闪烁（默认 true）
  dndEnabled?: boolean          // 是否启用免打扰时段（默认 false）
  dndStart?: string             // 免打扰起始时间 HH:mm（默认 '22:00'）
  dndEnd?: string               // 免打扰结束时间 HH:mm（默认 '08:00'）
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
  // V1.4.0: 群文件分享标识。true 时接收方自动接收（无 UI 弹窗、无私聊记录）
  fromGroupShare?: boolean
}

// V1.4.0: 群成员向文件发送方请求下载文件（不含内容，仅请求）
export interface FileShareRequestPacket {
  version: number
  transferId: string  // = group messageId
  fromPeerId: string  // 群消息发送方（文件拥有者）
  toPeerId: string    // 请求方
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

// ============================================================
// V1.4.0: 群聊相关协议包
// ============================================================

// 群消息业务包（被 groupKey 加密的内容）
export interface GroupMessagePacket {
  version: number
  type: MessageType
  messageId: string
  groupId: string
  fromPeerId: string
  senderNickname: string
  timestamp: number
  payload: string
  thumbnail?: string
  fileName?: string
  fileSize?: number
  mentions?: string[]
  mentionedAll?: boolean
}

// 群创建（owner → 初始成员；owner 本地也存一份）
export interface GroupCreatePacket {
  version: number
  groupId: string
  groupName: string
  ownerPeerId: string
  fromPeerId: string
  timestamp: number
  // 初始成员（不含 owner 自己），用于受邀者建立本地群组副本
  initialMembers: GroupMemberSnapshot[]
  // 用每个成员的 ECDH 会话密钥加密的 groupKey（base64 → EncryptedData JSON）
  encryptedGroupKeys: Record<string, EncryptedData>
  keyVersion: number
  // owner 的昵称/头像快照
  ownerNickname: string
  ownerAvatar?: string
}

export interface GroupMemberSnapshot {
  peerId: string
  nickname: string
  avatar?: string
  role: GroupRole
  joinedAt: number
  keyVersion: number
}

// 群邀请（owner → 被邀请者）
export interface GroupInvitePacket {
  version: number
  groupId: string
  groupName: string
  fromPeerId: string    // sender (owner)
  inviterPeerId: string // owner
  inviteePeerId: string
  timestamp: number
  // owner 用 invitee 的 ECDH 会话密钥加密的 groupKey
  encryptedGroupKey: EncryptedData
  keyVersion: number
  inviterNickname: string
  // V1.4.0: 被邀请者接受邀请时需要用这些数据建立本地群组
  initialMembers: GroupMemberSnapshot[]
  ownerNickname: string
  ownerAvatar?: string
}

// 接受加入（被邀请者 → owner）
export interface GroupJoinAcceptPacket {
  version: number
  groupId: string
  fromPeerId: string
  joinerPeerId: string
  joinerNickname: string
  joinerPublicKey?: string
  timestamp: number
}

// 拒绝邀请（被邀请者 → owner）
export interface GroupInviteRejectPacket {
  version: number
  groupId: string
  fromPeerId: string
  inviteePeerId: string
  reason?: string
  timestamp: number
}

// 主动退出（成员 → owner，owner 再 fan-out 给其他成员）
export interface GroupLeavePacket {
  version: number
  groupId: string
  fromPeerId: string
  leaverPeerId: string
  timestamp: number
}

// 踢人（owner → 被踢者 + 其他成员）
export interface GroupKickPacket {
  version: number
  groupId: string
  fromPeerId: string
  kickedPeerId: string
  timestamp: number
}

// 解散群（owner → 所有成员）
export interface GroupDismissPacket {
  version: number
  groupId: string
  fromPeerId: string
  timestamp: number
}

// 群信息更新（owner → 所有成员）
export type GroupUpdateType =
  | 'name'
  | 'avatar'
  | 'add-members'
  | 'remove-members'
  | 'key-rotate'

export interface GroupUpdatePacket {
  version: number
  groupId: string
  fromPeerId: string
  updateType: GroupUpdateType
  timestamp: number
  // name
  newName?: string
  // avatar
  newAvatar?: string
  // add-members（新成员的快照 + 用每个新成员 ECDH 加密的新 groupKey）
  newMembers?: GroupMemberSnapshot[]
  encryptedGroupKeys?: Record<string, EncryptedData>
  // remove-members（被移除的成员 peerId）
  removedMembers?: string[]
  // key-rotate
  newKeyVersion?: number
  newEncryptedGroupKeys?: Record<string, EncryptedData>
}

// 群消息 ACK（接收者 → 发送者）
export interface GroupMessageAckPacket {
  version: number
  groupId: string
  messageId: string
  fromPeerId: string
  ackerPeerId: string
  timestamp: number
}

// 群消息已读（用户 → 群主，V1.4.0 仅做可选记录）
export interface GroupMessageReadPacket {
  version: number
  groupId: string
  fromPeerId: string
  readerPeerId: string
  messageIds: string[]
  timestamp: number
}

// 群消息撤回
export interface GroupRecallPacket {
  version: number
  groupId: string
  fromPeerId: string
  messageId: string
  timestamp: number
}

// 群邀请响应（接受/拒绝）的渲染端调用
export interface GroupInviteResponse {
  inviteId: string
  accept: boolean
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

// V1.4.0: 群服务接口
export interface IGroupService {
  createGroup(groupName: string, memberPeerIds: string[]): Promise<Group>
  inviteMembers(groupId: string, memberPeerIds: string[]): Promise<void>
  leaveGroup(groupId: string): Promise<void>
  kickMember(groupId: string, peerId: string): Promise<void>
  dismissGroup(groupId: string): Promise<void>
  updateGroupName(groupId: string, newName: string): Promise<void>
  sendText(groupId: string, content: string, mentions?: string[], mentionedAll?: boolean): Promise<string>
  sendImage(groupId: string, filePath: string): Promise<string>
  sendFile(groupId: string, filePath: string): Promise<string>
  loadHistory(groupId: string, limit?: number, offset?: number): Promise<ChatRecord[]>
  getGroups(): Group[]
  getGroup(groupId: string): Group | undefined
  respondInvite(inviterPeerId: string, groupId: string, accept: boolean): Promise<void>
}

export interface IFileTransferService {
  sendFile(peerId: string, filePath: string): Promise<string>
  sendSharedFile(peerId: string, transferId: string, fileName: string, fileSize: number, md5: string): Promise<void>
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
  // V1.2.0: TOFU 信任链：根据 peerId 查询已持久化的公钥
  getStoredPublicKey(peerId: string): string | undefined
  saveFileTransfer(record: FileTransferRecord): void
  updateFileTransferStatus(transferId: string, status: FileTransferStatus, progress?: number): void
  queryFileTransfers(peerId?: string): FileTransferRecord[]
  saveConfig(config: AppConfig): void
  loadConfig(): AppConfig | null
  // V1.4.0: 群组管理
  saveGroup(group: Group): void
  queryGroups(): Group[]
  getGroup(groupId: string): Group | undefined
  deleteGroup(groupId: string): void
  // V1.4.0: 群消息（复用 ChatRecord，扩展支持 groupId）
  queryGroupChatRecords(groupId: string, limit?: number, offset?: number): ChatRecord[]
  // V1.5.0: 发布方
  savePublishedUpdate(record: PublishedUpdate): void
  listPublishedUpdates(): PublishedUpdate[]
  getPublishedUpdate(id: string): PublishedUpdate | undefined
  incrementPublishedUpdateDownloadCount(id: string): void
  findPublishedUpdateByVersion(version: string): PublishedUpdate | undefined
  // V1.5.0: 收端
  upsertAvailableUpdate(record: AvailableUpdate): void
  listAvailableUpdates(): AvailableUpdate[]
  setAvailableUpdateDismissed(publisherPeerId: string, targetVersion: string, dismissed: boolean): void
  removeAvailableUpdate(publisherPeerId: string, targetVersion: string): void
}

export const MainToRendererChannels = {
  FRIEND_ONLINE: 'friend:online',
  FRIEND_OFFLINE: 'friend:offline',
  FRIEND_UPDATED: 'friend:updated',
  MESSAGE_RECEIVED: 'message:received',
  MESSAGE_STATUS_UPDATED: 'message:status-updated',
  FILE_TRANSFER_REQUEST: 'file:transfer-request',
  FILE_PROGRESS: 'file:progress',
  FILE_UPDATED: 'file:updated',
  FILE_COMPLETED: 'file:completed',
  FILE_FAILED: 'file:failed',
  // V1.4.0: 群相关推送
  GROUP_CREATED: 'group:created',
  GROUP_UPDATED: 'group:updated',
  GROUP_DISSOLVED: 'group:dissolved',
  GROUP_INVITE_RECEIVED: 'group:invite-received',
  GROUP_INVITE_RESPONDED: 'group:invite-responded',
  GROUP_MEMBER_CHANGED: 'group:member-changed',
  GROUP_MESSAGE_RECEIVED: 'group:message-received',
  GROUP_MESSAGE_STATUS_UPDATED: 'group:message-status-updated',
  // V1.5.0: 版本分发相关推送
  UPDATE_AVAILABLE: 'update:available',                  // 收端：发现新版本
  UPDATE_DOWNLOAD_PROGRESS: 'update:download-progress',  // 收端：下载进度
  UPDATE_DOWNLOAD_COMPLETE: 'update:download-complete',  // 收端：下载完成
  UPDATE_DOWNLOAD_FAILED: 'update:download-failed',      // 收端：下载失败
  UPDATE_PUBLISH_STATUS: 'update:publish-status',        // 发布方：状态变化
  UPDATE_REMOVED: 'update:removed',                      // 收端：发布方停止
} as const

export const RendererToMainChannels = {
  FRIEND_SCAN_SEGMENT: 'friend:scan-segment',
  FRIEND_REFRESH: 'friend:refresh',
  MESSAGE_SEND_TEXT: 'message:send-text',
  MESSAGE_SEND_IMAGE: 'message:send-image',
  CHAT_LOAD_HISTORY: 'chat:load-history',
  FILE_SEND: 'file:send',
  FILE_ACCEPT: 'file:accept',
  FILE_REJECT: 'file:reject',
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',
  // V1.4.0: 群相关调用
  GROUP_CREATE: 'group:create',
  GROUP_INVITE: 'group:invite',
  GROUP_RESPOND_INVITE: 'group:respond-invite',
  GROUP_LEAVE: 'group:leave',
  GROUP_KICK: 'group:kick',
  GROUP_DISMISS: 'group:dismiss',
  GROUP_LIST: 'group:list',
  GROUP_LOAD_HISTORY: 'group:load-history',
  GROUP_SEND_TEXT: 'group:send-text',
  GROUP_SEND_IMAGE: 'group:send-image',
  GROUP_SEND_FILE: 'group:send-file',
  GROUP_UPDATE_NAME: 'group:update-name',
  FILE_REQUEST_GROUP_FILE: 'file:request-group-file',
  // V1.5.0: 版本分发相关调用
  UPDATE_PICK_FILES: 'update:pick-files',
  UPDATE_START_PUBLISH: 'update:start-publish',
  UPDATE_STOP_PUBLISH: 'update:stop-publish',
  UPDATE_GET_PUBLISH_STATUS: 'update:get-publish-status',
  UPDATE_LIST_PUBLISHED: 'update:list-published',
  UPDATE_LIST_AVAILABLE: 'update:list-available',
  UPDATE_DISMISS_AVAILABLE: 'update:dismiss-available',
  UPDATE_START_DOWNLOAD: 'update:start-download',
  UPDATE_CANCEL_DOWNLOAD: 'update:cancel-download',
  UPDATE_OPEN_INSTALLER: 'update:open-installer',
  UPDATE_GET_LOWER_VERSION_FRIENDS: 'update:get-lower-version-friends',
} as const

export const PROTOCOL_VERSION = 2
// V1.4.0: 群协议版本（独立于 1:1 协议版本）
export const GROUP_PROTOCOL_VERSION = 3

// V1.4.0: 群数据包 kind 注册（TCP/UDP 路由前缀）
export const GROUP_PACKET_KINDS = {
  CREATE: 'group-create',
  INVITE: 'group-invite',
  JOIN_ACCEPT: 'group-join-accept',
  INVITE_REJECT: 'group-invite-reject',
  LEAVE: 'group-leave',
  KICK: 'group-kick',
  DISMISS: 'group-dismiss',
  UPDATE: 'group-update',
  MESSAGE: 'group-message',
  ACK: 'group-ack',
  READ: 'group-read',
  RECALL: 'group-recall',
  // V1.4.0 修复：成员向 owner 请求重发当前群密钥（解决重启后老群密钥丢失）
  KEY_RESYNC: 'group-key-resync',
} as const

export type GroupPacketKind = typeof GROUP_PACKET_KINDS[keyof typeof GROUP_PACKET_KINDS]

// ============================================================
// V1.5.0: 局域网版本分发相关类型
// ============================================================

// 单个分发包元信息（NSIS 或 Portable 任选其一，两项均可存在）
export interface UpdatePackageMeta {
  filename: string
  size: number
  sha256: string
}

// 发布方在 UDP 广播的版本公告载荷（不含签名/signature/publicKey 三字段由签名层加）
export interface VersionAnnouncementPayload {
  version: number                 // 协议版本（V1.5.0 = 3）
  targetVersion: string           // 目标版本号（semver x.y.z）
  publisherPeerId: string         // 发布方 peerId（收端用其作为唯一 key）
  publisherNickname: string       // 发布方昵称（UI 展示）
  httpPort: number                // 发布方 HTTP 服务端口
  nsis?: UpdatePackageMeta        // NSIS 安装包
  portable?: UpdatePackageMeta    // Portable 便携版
  note?: string                   // 更新说明（≤500 字）
  timestamp: number               // 防重放窗口
  // V1.5.0: 当 httpPort=0 且 stopped=true 时，表示发布方主动停止
  // 此时收端应从 availableUpdates 中移除该 publisherPeerId+targetVersion 记录
  stopped?: boolean
}

// 完整签名后的 VersionAnnouncement（包络）
export interface VersionAnnouncement extends VersionAnnouncementPayload {
  publicKey: string
  signature: string
}

// 收端入库的「可用更新」记录
export interface AvailableUpdate {
  publisherPeerId: string
  publisherNickname: string
  targetVersion: string
  httpPort: number
  publisherIp?: string            // 最近一次收到广播时的来源 IP（用于 HTTP GET）
  nsis?: UpdatePackageMeta
  portable?: UpdatePackageMeta
  note?: string
  receivedAt: number              // 最近一次收到广播的时间
  // 同一发布方同一版本只保留一条；新广播来时只更新 receivedAt
  dismissed?: boolean             // 用户主动忽略（不再提示）
}

// 发布方入库的「已发布更新」记录
export interface PublishedUpdate {
  id: string
  version: string
  nsis?: UpdatePackageMeta & { localPath: string }
  portable?: UpdatePackageMeta & { localPath: string }
  httpPort: number
  publishedAt: number
  stoppedAt?: number
  downloadCount: number
  note?: string
}

// 渲染端订阅的发布状态
export interface PublishStatus {
  running: boolean
  httpPort?: number
  publishedUpdateId?: string
  targetVersion?: string
  error?: string
}

// 收端下载进度
export interface UpdateDownloadProgress {
  jobId: string
  packageType: 'nsis' | 'portable'
  fileName: string
  fileSize: number
  downloaded: number
  speed: number                   // bytes/s
  status: 'downloading' | 'verifying' | 'completed' | 'failed' | 'cancelled'
  savePath?: string
  error?: string
}

// 版本发布包的选择（渲染端 → 主进程）
export interface PickUpdateFilesResult {
  nsis?: { filePath: string; size: number; sha256: string }
  portable?: { filePath: string; size: number; sha256: string }
}

// 发布操作的入参（渲染端 → 主进程）
export interface StartPublishInput {
  targetVersion: string
  nsis?: { filePath: string; size: number; sha256: string }
  portable?: { filePath: string; size: number; sha256: string }
  note?: string
}
