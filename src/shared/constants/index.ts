// 注意：HONGYAN_UDP_PORT / HONGYAN_TCP_PORT / HONGYAN_DATA_DIR 这些环境变量
// 在 npx / electron 子进程链中可能比本模块的加载晚生效，因此必须以函数形式
// 在调用时读取，而不能在模块加载时缓存为常量。

export function getUdpPort(): number {
  return process.env.HONGYAN_UDP_PORT ? parseInt(process.env.HONGYAN_UDP_PORT, 10) : 19876
}

export function getTcpPortDefault(): number {
  return process.env.HONGYAN_TCP_PORT ? parseInt(process.env.HONGYAN_TCP_PORT, 10) : 19877
}

export function getTcpPortMax(): number {
  return getTcpPortDefault() + 9
}

export function getAppDataDir(): string {
  return process.env.HONGYAN_DATA_DIR || 'HongYan'
}

export const BROADCAST_INTERVAL_MS = process.env.NODE_ENV === 'development' ? 5000 : 10000

// V1.2.0：低频心跳仅作为"对方静默崩溃"的兜底检测；0 表示关闭
// 事件驱动广播：上线/下线/昵称头像变更/手动刷新/消息发送失败 各自触发一次广播
export const DEFAULT_HEARTBEAT_INTERVAL_MS = 60000
export const ONLINE_TIMEOUT_MS = 30000
export const SCAN_TIMEOUT_MS = 10000
// V1.2.0: signature 时间戳超过此值视为重放，丢弃
export const SIGNATURE_MAX_AGE_MS = 300000

export const ANNOUNCEMENT_KIND = {
  PRESENCE: 'announcement',
  LEAVING: 'announcement-leaving',
} as const
export const KEY_EXPIRY_MS = 3600000
export const FILE_CHUNK_SIZE = 65536
export const MAX_FILE_SIZE = 2147483648
export const DB_NAME = 'hongyan.db'
export const MASTER_KEY_FILE = 'master.key'
export const CONFIG_FILE = 'identity.json'
// V1.2.0: Ed25519 身份密钥文件（私钥用 master.key 加密后存储）
export const IDENTITY_KEY_FILE = 'identity.key'
export const FILES_DIR = 'files'
export const LOGS_DIR = 'logs'
