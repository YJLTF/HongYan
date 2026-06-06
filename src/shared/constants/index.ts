const envUdpPort = process.env.HONGYAN_UDP_PORT ? parseInt(process.env.HONGYAN_UDP_PORT, 10) : 19876
const envTcpPort = process.env.HONGYAN_TCP_PORT ? parseInt(process.env.HONGYAN_TCP_PORT, 10) : 19877

export const UDP_PORT = envUdpPort
export const TCP_PORT_DEFAULT = envTcpPort
export const TCP_PORT_MAX = envTcpPort + 9
// 生产环境广播间隔调整为 10 秒，减少网络流量
export const BROADCAST_INTERVAL_MS = process.env.NODE_ENV === 'development' ? 5000 : 10000
export const ONLINE_TIMEOUT_MS = 30000
export const SCAN_TIMEOUT_MS = 10000
export const KEY_EXPIRY_MS = 3600000
export const FILE_CHUNK_SIZE = 65536
export const MAX_FILE_SIZE = 2147483648
export const APP_DATA_DIR = process.env.HONGYAN_DATA_DIR || 'HongYan'
export const DB_NAME = 'hongyan.db'
export const MASTER_KEY_FILE = 'master.key'
export const CONFIG_FILE = 'identity.json'
export const FILES_DIR = 'files'
export const LOGS_DIR = 'logs'
