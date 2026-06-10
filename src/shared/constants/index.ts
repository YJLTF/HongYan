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
// V1.2.0: ONLINE_TIMEOUT_MS 不再写死——必须 > heartbeat 间隔，否则必误判
// 见 calculateOnlineTimeoutMs()。30s 是 V1.1.0 给 5-10s 周期广播设计的，
// 配合 V1.2.0 的 60s 心跳会导致 B 反复离线-上线
export const ONLINE_TIMEOUT_MS = 30000
export const SCAN_TIMEOUT_MS = 10000

// V1.2.0: 在线超时必须基于当前心跳间隔计算
//   规则：timeout = max(30s, heartbeat * 2)，容忍一次心跳丢失 + 网络抖动
//   heartbeat = 0（关闭）时给固定 60s 兜底（依赖 TCP 连接状态判活）
//   用户改心跳间隔后必须重新计算
export function calculateOnlineTimeoutMs(heartbeatMs: number): number {
  if (heartbeatMs <= 0) {
    return 60000
  }
  return Math.max(30000, heartbeatMs * 2)
}
// V1.2.0: signature 时间戳超过此值视为重放，丢弃
export const SIGNATURE_MAX_AGE_MS = 300000

export const ANNOUNCEMENT_KIND = {
  PRESENCE: 'announcement',
  LEAVING: 'announcement-leaving',
  // V1.5.0: 版本发布广播（携带 nsis/portable 元信息 + HTTP 端口）
  VERSION: 'version-announcement',
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

// V1.3.0 托盘图标资源名（位于 src/renderer/public/icons/，由 electron-vite 打包进 dist/renderer/icons/）
// 主进程通过 __dirname + getTrayIconRelative() 解析到具体路径（dev 与 prod 分支见 tray.ts）
export const TRAY_ICON_NORMAL = 'tray-normal.png'
export const TRAY_ICON_ACTIVE = 'tray-active.png'
export const TRAY_TOOLTIP = '鸿雁 HongYan'

// ============================================================
// V1.4.0: 群聊相关常量
// ============================================================

// 群 ID 命名空间前缀，便于一眼区分
export const GROUP_ID_PREFIX = 'grp_'

// 单群最大成员数（防止扇出风暴）
export const MAX_GROUP_MEMBERS = 50

// 群密钥版本保留数（旧版本密钥保留多少代用于解密在途消息）
export const GROUP_KEY_VERSION_RETENTION = 1

// 群密钥轮换后未送达成员的离线补发重试间隔（ms）
export const GROUP_KEY_RETRY_INTERVAL_MS = 30000

// 群密钥轮换最大重试次数
export const GROUP_KEY_MAX_RETRIES = 5

// 群消息发送失败时的最大重试次数
export const GROUP_MESSAGE_MAX_RETRIES = 3

// 多实例测试时扩展的 UDP 扫描端口
// V1.4.0: 支持 3 实例，UDP 19876/78/80 + TCP 19877/79/81
// 多实例模式（设置了 HONGYAN_DATA_DIR）下扫描范围
export const MULTI_INSTANCE_UDP_PORTS = [19876, 19878, 19880]
export const MULTI_INSTANCE_UDP_SCAN_PORTS = [19876, 19878, 19880]

// ============================================================
// V1.5.0: 局域网版本分发
// ============================================================

// 发布方开 HTTP 文件服务用的端口（避开 UDP 19876、TCP 19877-19886 现有范围）
export const HTTP_SERVER_PORT_DEFAULT = 19890
export const HTTP_SERVER_PORT_MAX_TRY = 10
// 单文件上限 1 GB（NSIS 一般 < 200 MB、Portable < 300 MB，留余量）
export const HTTP_MAX_FILE_SIZE = 1024 * 1024 * 1024
// 5 分钟无下载活动自动关闭发布服务
export const HTTP_IDLE_TIMEOUT_MS = 5 * 60 * 1000
// 客户端下载超时（30s 无字节视为断流）
export const HTTP_DOWNLOAD_IDLE_TIMEOUT_MS = 30 * 1000
// 版本重广播周期（兜底断网恢复的 LAN 节点）
export const VERSION_BROADCAST_REPEAT_MS = 5 * 60 * 1000

