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
export const ONLINE_TIMEOUT_MS = 30000
export const SCAN_TIMEOUT_MS = 10000
export const KEY_EXPIRY_MS = 3600000
export const FILE_CHUNK_SIZE = 65536
export const MAX_FILE_SIZE = 2147483648
export const DB_NAME = 'hongyan.db'
export const MASTER_KEY_FILE = 'master.key'
export const CONFIG_FILE = 'identity.json'
export const FILES_DIR = 'files'
export const LOGS_DIR = 'logs'
