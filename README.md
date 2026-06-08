# 鸿雁 (HongYan) - 局域网点对点即时通讯工具

一款基于 Electron 构建的局域网（LAN）点对点（P2P）即时通讯桌面应用，无需中心服务器，同一局域网内的用户可以自动发现彼此并进行加密通讯与文件传输。

## 功能特性

- **好友自动发现** - 通过事件驱动 UDP 广播智能发现同一局域网内的其他鸿雁用户，支持手动扫描指定网段
- **点对点加密通讯** - 使用 ECDH (x25519) 密钥协商 + AES-256-GCM 端到端加密，所有传输数据均加密
- **广播包签名验证 (V1.2.0)** - Ed25519 身份密钥签名 UDP 公告包，防止局域网内任意设备伪造 peerId；TOFU 信任链自动识别冒充行为
- **事件驱动广播 (V1.2.0)** - 仅在上线/下线/资料变更/手动刷新/消息发送失败时广播，配 60s 兜底心跳（可配置为关闭），流量较 V1.1.0 下降 8~12 倍
- **双向发现 (V1.2.0)** - 点「刷新」后本机广播，**收到不认识的对方公告时自动回播一次**，让对方也能看到本机。200ms 合并间隔防回播死循环
- **优雅下线通知 (V1.2.0)** - `announcement-leaving` 公告包使好友立即知道你已离线，不再等超时
- **TCP 状态即时感知 (V1.2.0)** - TCP 连接断开立即标记好友离线，比 UDP 心跳更可靠
- **动态离线超时 (V1.2.0)** - 在线超时跟随心跳间隔动态计算（`max(30s, heartbeat × 2)`），心跳关闭时退回 60s + TCP 兜底
- **消息收发** - 支持文字消息和图片消息
- **文件传输** - 分块传输，支持接受/拒绝，MD5 完整性校验，最大支持 2GB 文件
- **本地加密存储** - 聊天记录和配置数据使用 AES-256-GCM 加密存储于本地 JSON 文件 (lowdb)
- **现代化UI** - 精美的渐变界面、流畅的动画效果、专业的通讯工具体验
- **好友备注** - 支持为联系人设置自定义备注名
- **安全优化** - 生产环境自动优化网络广播策略，适合安全内网部署
- **DPAPI 主密钥保护加固 (V1.2.0)** - 显式 PowerShell 错误处理 + 临时 `.ps1` 脚本文件 + 输出校验，杜绝静默写入损坏文件

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Electron 42 |
| 前端 | Vue 3 + TypeScript + Pinia |
| 构建 | electron-vite + Vite 6 |
| 数据库 | lowdb (JSON 文件存储) |
| 加密 | Node.js crypto (ECDH x25519 + AES-256-GCM + HKDF + Ed25519) |
| 打包 | electron-builder (NSIS + Portable) |

## 项目结构

```
src/
├── main/                    # Electron 主进程
│   ├── index.ts             # 应用入口
│   ├── crypto/              # 加密模块（密钥协商、传输加密、存储加密、Ed25519 身份）
│   ├── network/             # 网络模块（UDP 广播、TCP 通讯、连接管理、协议）
│   ├── services/            # 业务服务（好友发现、消息、文件传输）
│   ├── storage/             # 数据持久化（JSON 文件存储、配置存储）
│   └── ipc/                 # IPC 通讯（主进程 ↔ 渲染进程）
├── preload/                 # 预加载脚本
├── renderer/                # 渲染进程（Vue 3 前端）
│   ├── components/          # UI 组件
│   └── stores/              # Pinia 状态管理
└── shared/                  # 主进程与渲染进程共享
    ├── types/               # 类型定义与 IPC 通道常量
    └── constants/           # 常量配置
```

## 快速开始

### 环境要求

- Node.js >= 18
- Windows 操作系统

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

### 构建项目

```bash
npm run build
```

### 打包发布

```bash
# 打包 Windows 安装程序（NSIS + Portable）
npm run package

# 仅打包便携版
npm run package:portable

# 仅打包 NSIS 安装版
npm run package:nsis
```

打包产物输出到 `out/` 目录。

## 使用说明

### 基本使用

1. 启动应用后，自动生成唯一的 Peer ID、Ed25519 身份密钥对和默认昵称（主机名）
2. 应用**事件驱动**地在当前局域网广播 UDP 公告：上线广播一次、修改昵称/头像广播一次、手动刷新广播一次、消息发送失败时也会重广播一次
3. 左侧好友列表显示已发现的好友，绿色圆点表示在线（带脉冲动画）
4. 点击好友即可开始聊天，支持发送文字、图片、文件
5. 点击侧边栏「刷新」按钮可立即触发一次 UDP 广播，对方回播后双方列表都会更新（**双向发现**）
6. 点击「扫描」按钮可手动扫描指定网段（输入 CIDR，如 `192.168.1.0/24`）
7. 点击「设置」可修改昵称、查看 Peer ID、配置心跳间隔（关闭 / 30s / 60s / 2min / 5min）
8. 点击「传输」可查看文件传输进度，接收方可接受或拒绝文件
9. 关闭应用时会自动广播 `announcement-leaving` 公告，好友可立即看到你已下线

### 生产环境注意事项

- 生产打包版本自动优化网络策略，减少不必要的广播流量
- 生产环境仅使用标准端口（UDP 19876，TCP 19877-19886）
- 内网部署建议配置防火墙允许上述端口通信
- 如需修改默认端口，可通过环境变量 `HONGYAN_UDP_PORT` 和 `HONGYAN_TCP_PORT` 指定
- 如需修改数据目录，可通过设置页「自定义数据目录」或环境变量 `HONGYAN_DATA_DIR` 指定
- `HONGYAN_DATA_DIR` 的优先级高于 `identity.json` 里的 `userDataDir` 设置（用于多实例测试隔离）

## 网络协议

| 协议 | 端口 | 用途 |
|------|------|------|
| UDP 广播 | 19876 | 好友发现、在线状态检测 |
| TCP 直连 | 19877 ~ 19886 | 消息传输、文件传输、密钥协商 |

数据包格式为 JSON + 换行符分隔（`\n`），通过 `kind` 字段标识包类型：

| kind | 说明 |
|------|------|
| `announcement` | UDP 存在公告 (V1.2.0 起带 Ed25519 签名) |
| `announcement-leaving` | V1.2.0 优雅下线公告，验签后立即标记对方离线 |
| `message` | 加密消息 |
| `ack` | 消息确认 |
| `file-request` | 文件传输请求 |
| `file-accept` | 文件传输接受/拒绝 |
| `file-chunk` | 文件分块数据 |
| `file-complete` | 文件传输完成 |
| `key-negotiation` | 密钥协商 |

### UDP 公告包结构 (V1.2.0)

```json
{
  "kind": "announcement",
  "data": {
    "version": 2,
    "peerId": "<uuid>",
    "nickname": "<昵称>",
    "ip": "<本机IP>",
    "tcpPort": 19877,
    "timestamp": 1700000000000,
    "publicKey": "<base64 Ed25519 SPKI>",
    "signature": "<base64 Ed25519 signature>"
  }
}
```

签名覆盖 `{version, peerId, nickname, ip, tcpPort, timestamp}` 规范化 JSON。接收端：
- 拒绝 `version > 2` 的未知未来版本
- `|now - timestamp| > 5min` 视为重放，丢弃
- 强制验签，签名失败丢弃
- 已知 peerId 的 `publicKey` 与本次不一致 → 视为冒充，丢弃
- 旧版 V1.1.0 (`version: 1`) 包按 legacy 接受，标记 `untrusted: true`

### 广播触发汇总 (V1.2.0)

| 触发 | 包类型 | 触发位置 |
|---|---|---|
| 应用启动 | `announcement` | `UdpBroadcaster.start()` |
| 优雅退出 | `announcement-leaving` | `shutdownApp({graceful:true})` |
| 昵称/头像修改 | `announcement` | `setSelfInfo()` |
| 手动点「刷新」 | `announcement` | `friend:refresh` IPC → `refresh()` |
| 消息发送失败 | `announcement` | `message-service.sendText/sendImage` catch |
| 低频心跳 (默认 60s) | `announcement` | `startHeartbeat()` |
| 收到新好友公告 (双向发现) | `announcement` | `handleMessage()` 对 `isNew`/`justCameOnline` 触发回播 |

### 在线超时计算 (V1.2.0)

V1.1.0 写死的 `ONLINE_TIMEOUT_MS = 30000` 是给 5-10s 周期广播设计的，配合 V1.2.0 的 60s 心跳会出现"刚收到心跳就被判离线"的反复跳动。V1.2.0 改为动态计算：

```
calculateOnlineTimeoutMs(heartbeat):
  heartbeat > 0  → max(30s, heartbeat × 2)  // 容忍 1 次心跳丢失 + 网络抖动
  heartbeat = 0  → 60s                       // 关闭心跳时靠 TCP 兜底
```

| 心跳 | 旧 timeout (30s) | 新 timeout |
|---|---|---|
| 30s | 临界，无容错 | 60s |
| 60s（默认）| ❌ 必误判 | 120s |
| 120s | ❌ 必误判 | 240s |
| 300s | ❌ 灾难 | 600s |
| 关闭 | 30s (TCP 兜底) | 60s (TCP 兜底) |

## 安全特性

- **端到端加密** - ECDH (x25519) 密钥协商 + AES-256-GCM 加密所有传输数据
- **UDP 广播包签名 (V1.2.0)** - Ed25519 身份密钥签名公告包，TOFU 信任链防止 peerId 伪造和冒充攻击
- **存储加密** - 本地数据使用 AES-256-GCM 加密存储
- **身份密钥保护 (V1.2.0)** - Ed25519 私钥用 master.key (DPAPI + AES-256-GCM) 二次加密后存盘
- **重放保护 (V1.2.0)** - 公告包 timestamp 偏离 > 5 分钟视为重放，丢弃
- **DPAPI 加固 (V1.2.0)** - PowerShell 脚本改用临时 `.ps1` 文件 + 显式 try/catch + exit code + 输出校验，杜绝空 buffer 静默写入损坏 `master.key`
- **HKDF 派生隔离** - storage / identity / transfer / session 四类 key 通过 HKDF 独立派生，互不影响
- **会话密钥过期** - 1 小时后自动重新协商
- **密钥清零** - 应用退出时内存中的密钥缓冲区填零清除
- **Context Isolation** - Electron 启用 `contextIsolation: true`，`nodeIntegration: false`
- **生产环境优化** - 自动减少网络广播频率，降低内网流量，适合安全内网部署
- **智能端口扫描** - 生产环境仅使用标准端口，避免不必要的网络探测

## 关键配置

> 环境变量相关的"常量"（UDP 端口、TCP 端口、数据目录）已改为 getter 函数，**每次调用时**才读取 `process.env`，避免在 npx/electron 子进程链中环境变量晚于模块加载生效的问题。

| 常量 / Getter | 默认值 | 说明 |
|------|----|------|
| `getUdpPort()` | 19876 | UDP 广播端口（可被 `HONGYAN_UDP_PORT` 覆盖） |
| `getTcpPortDefault()` | 19877 | TCP 起始端口（可被 `HONGYAN_TCP_PORT` 覆盖） |
| `getTcpPortMax()` | `getTcpPortDefault() + 9` | TCP 端口范围上限 |
| `getAppDataDir()` | `HongYan` | 数据目录名（可被 `HONGYAN_DATA_DIR` 覆盖） |
| `DEFAULT_HEARTBEAT_INTERVAL_MS` | 60000 | V1.2.0 低频心跳兜底间隔（0=关闭） |
| `ONLINE_TIMEOUT_MS` | (deprecated) | V1.2.0 起改用 `calculateOnlineTimeoutMs(heartbeat)`，在线超时 = max(30s, heartbeat × 2) |
| `calculateOnlineTimeoutMs()` | 函数 | V1.2.0 动态计算在线超时，必须 > 心跳间隔 |
| `SIGNATURE_MAX_AGE_MS` | 300000 | V1.2.0 签名包允许的最大时间偏移（5 分钟） |
| `KEY_EXPIRY_MS` | 3600000 | 密钥过期时间（1 小时） |
| `FILE_CHUNK_SIZE` | 65536 | 文件分块大小（64 KB） |
| `MAX_FILE_SIZE` | 2147483648 | 最大文件大小（2 GB） |
| `IDENTITY_KEY_FILE` | `identity.key` | V1.2.0 Ed25519 身份密钥文件（私钥加密存储） |

> V1.2.0 起心跳间隔可通过用户配置 (`AppConfig.heartbeatIntervalMs`) 调整，UI 在「设置 → UDP 广播配置」中可设 关闭 / 30s / 60s / 2min / 5min。

### 环境变量配置

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `NODE_ENV` | 运行环境（development/production），影响广播频率和扫描端口策略 | - |
| `HONGYAN_UDP_PORT` | 自定义 UDP 端口 | 19876 |
| `HONGYAN_TCP_PORT` | 自定义 TCP 起始端口 | 19877 |
| `HONGYAN_DATA_DIR` | 自定义数据目录名（追加在 `%APPDATA%/` 下） | `HongYan` |
| `HONGYAN_DATA_DIR` 设置 | 进入多实例模式，自动启用 dev 风格的广播策略 | - |

### 多实例本地测试

项目内置测试脚本可同时启动两个隔离的实例（不同数据目录 + 不同端口 + 互不干扰）：

```bash
# PowerShell（推荐）
npm run test:two

# Windows Batch
npm run test:two:bat
```

两个实例会分别启动：

| 实例 | 数据目录 | UDP 端口 | TCP 端口 |
|------|----------|----------|----------|
| Instance 1 | `%APPDATA%/HongYan-Test1/` | 19876 | 19877 |
| Instance 2 | `%APPDATA%/HongYan-Test2/` | 19878 | 19879 |

#### 工作原理

- **数据隔离**：`HONGYAN_DATA_DIR` 优先级最高，覆盖 `identity.json` 里的 `userDataDir` 设置，让两个实例的数据库/主密钥/日志完全分开
- **端口隔离**：每个实例绑定独立的 UDP/TCP 端口，不会冲突
- **自动发现**：检测到 `HONGYAN_DATA_DIR` 被设置时，自动切换到多实例广播模式
  - 广播目标端口范围扩大为 19876-19880（每个实例都往所有端口发）
  - 同时往 `127.0.0.1` 发，绕开 LAN 路由器/防火墙，确保同机两个实例能互相发现
  - 10 秒内双方应自动出现在好友列表里

如果 Windows 防火墙拦截了 UDP 广播，需要为 `node.exe` 添加入站规则放行 UDP 19876-19880。

#### 重置测试环境

如果想从干净状态重新测试，删除以下目录：

```bash
rd /s /q "%APPDATA%\HongYan-Test1"
rd /s /q "%APPDATA%\HongYan-Test2"
```

## 数据存储

应用数据目录：`%APPDATA%/<HONGYAN_DATA_DIR>/`（默认 `HongYan`）

> 优先级：`HONGYAN_DATA_DIR` 环境变量 > `identity.json` 中的 `userDataDir` > 默认 `HongYan`

| 文件 | 说明 |
|------|------|
| `hongyan.json` | lowdb 数据库（聊天记录、好友、文件传输记录） |
| `master.key` | 主密钥文件 (DPAPI 加密) |
| `identity.json` | 身份配置（Peer ID、昵称、userDataDir、heartbeatIntervalMs） |
| `identity.key` | V1.2.0 Ed25519 身份密钥（公钥明文 + 私钥 AES-256-GCM 加密） |
| `files/` | 接收文件存储目录 |
| `logs/` | 日志目录 |

## 已知问题与恢复

### V1.1.0 遗留：`master.key` 0 字节损坏

V1.1.0 的 `encryptWithDPAPI` 在某些 PowerShell 环境下会返回空 buffer，导致 `master.key` 写入 0 字节。V1.1.0 时代未被检测（因为 `deriveStorageKey()` 走 HKDF 把 0 字节转成确定性 32 字节，掩盖了问题），但 V1.2.0 的身份密钥加密一旦直接用 `getMasterKey()` 就会立即报错。

**V1.2.0 兼容处理**：

- 检测到 0 字节 `master.key` 后，记 `ERROR` 日志并继续运行（用 HKDF 派生确定性 key）
- 应用**功能正常**，但加密安全性下降（攻击者可推算派生 key）
- 启动日志会看到：
  ```
  !!! master.key is corrupt: 0 bytes on disk (V1.1.0 DPAPI bug artifact).
  !!! Will use HKDF-derived deterministic key (insecure but functional).
  ```

**手动恢复（推荐，对数据安全敏感的用户）**：

1. 关闭应用
2. 备份数据目录（特别是 `hongyan.json`）
3. 删除 `master.key` 和 `identity.key`
4. 重启应用 → 重新生成随机 32 字节 master key 和新的 Ed25519 身份
5. ⚠️ **旧聊天记录将无法解密**（因 master key 已变），但 Peer ID、好友列表、文件传输记录不受影响

V1.2.0 自身的 `master-key.ts` 已加固：临时 `.ps1` 文件 + 显式 try/catch + 节点层多次校验，杜绝 V1.1.0 的空 buffer 写入 bug 复发。

## 升级说明：V1.1.0 → V1.2.0

| 行为 | V1.1.0 | V1.2.0 |
|---|---|---|
| 广播频率 | 5-10s 周期 | 事件触发 + 60s 心跳 |
| 广播签名 | 无 | Ed25519 必签（V2 协议）|
| 互发现 | 周期广播自然发现 | 双向发现（点刷新+回播）|
| 协议版本 | 1 | 2 |
| 离线判定 | 30s 超时 | 动态（max(30s, heartbeat×2)）|
| 下线通知 | 等超时 | 立即 (`announcement-leaving`) |
| TCP 断连 | 不感知 | 立即标离线 |
| master.key 损坏 | 静默 | ERROR 日志提示 |

V1.2.0 与 V1.1.0 互通：
- V1.2.0 接收 V1.1.0 包 → 接受为 `untrusted: true`（仅做轻量兼容）
- V1.1.0 接收 V1.2.0 包 → V1.1.0 的严格版本检查会拒绝（这是已知不对称，需升级两端）

## 许可证

ISC