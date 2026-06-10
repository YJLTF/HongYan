# 鸿雁 (HongYan) - 局域网点对点即时通讯工具

一款基于 Electron 构建的局域网（LAN）点对点（P2P）即时通讯桌面应用，无需中心服务器，同一局域网内的用户可以自动发现彼此并进行加密通讯与文件传输。

---

## 目录

- [应用特性](#应用特性)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
- [使用说明](#使用说明)
- [网络协议](#网络协议)
- [安全特性](#安全特性)
- [关键配置](#关键配置)
- [数据存储](#数据存储)
- [多实例本地测试](#多实例本地测试)
- [已知问题与恢复](#已知问题与恢复)
- [版本记录](#版本记录)
- [许可证](#许可证)

---

## 应用特性

### 通讯能力

- **好友自动发现** — 事件驱动 UDP 广播，同一局域网内自动感知其他鸿雁用户
- **点对点加密通讯** — ECDH (x25519) 密钥协商 + AES-256-GCM 端到端加密
- **文字 / 图片 / 文件消息** — 文字消息与图片消息一对一收发；文件支持分块传输、接受/拒绝、MD5 完整性校验，单文件最大 2 GB
- **仿微信群聊** — 创建/邀请/退出/解散群、@ 提及、群消息加密、群密钥轮换、群文件共享，单群最多 50 人
- **局域网版本分发** — 发布方挂载新版本分发包（NSIS + Portable），向低版本好友广播升级通知；收端从发布方 LAN 临时 HTTP 服务直接拉取并 SHA-256 校验

### 发现与连接

- **双向发现** — 收到不认识的对方公告时自动回播一次，让对方也能看到本机
- **手动扫描指定网段** — 支持 CIDR 格式（如 `192.168.1.0/24`）
- **TCP 连接状态即时感知** — TCP 断开立即标记好友离线，不依赖超时
- **优雅下线通知** — 关闭应用时主动广播 `announcement-leaving`，好友立即看到
- **动态在线超时** — 跟随心跳间隔动态计算，关闭心跳时退回 60s + TCP 兜底

### 安全

- **UDP 广播包签名** — Ed25519 身份密钥签名所有公告包，TOFU 信任链防 peerId 伪造和冒充
- **端到端加密** — 所有传输数据均加密
- **本地加密存储** — 聊天记录与配置使用 AES-256-GCM 加密存于本地 JSON
- **HKDF 派生隔离** — storage / identity / transfer / session 四类密钥独立派生
- **重放保护** — 公告包时间戳偏离 > 5 分钟视为重放并丢弃
- **会话密钥自动过期** — 1 小时后自动重新协商
- **退出清零** — 应用退出时内存中的密钥缓冲区填零清除
- **Context Isolation** — 启用 `contextIsolation: true`，`nodeIntegration: false`

### 提醒与体验

- **系统托盘常驻** — 关闭主窗口默认最小化到托盘，可从托盘菜单唤起或退出
- **多源消息提醒** — Windows 横幅通知 + 任务栏闪烁 + 托盘闪烁，按用户设置与窗口状态自动取舍
- **免打扰时段** — 设置页可指定不弹通知/不闪烁的时段（支持跨午夜）
- **好友备注** — 自定义备注名
- **自定义数据目录** — 设置页或环境变量指定主数据目录
- **现代化 UI** — 渐变界面、流畅动画

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Electron 42 |
| 前端 | Vue 3 + TypeScript + Pinia |
| 构建 | electron-vite + Vite 6 |
| 数据库 | lowdb (JSON 文件存储) |
| 加密 | Node.js crypto (ECDH x25519 + AES-256-GCM + HKDF + Ed25519) |
| 打包 | electron-builder (NSIS + Portable) |

---

## 项目结构

```
src/
├── main/                       # Electron 主进程
│   ├── index.ts                # 应用入口
│   ├── tray.ts                 # 系统托盘
│   ├── crypto/                 # 加密模块（密钥协商、传输加密、存储加密、Ed25519 身份）
│   ├── network/                # 网络模块（UDP 广播、TCP 通讯、连接管理、协议）
│   ├── services/               # 业务服务（好友发现、消息、文件传输、版本分发）
│   ├── storage/                # 数据持久化（JSON 文件存储、配置存储）
│   ├── notifications/          # 系统通知 / 任务栏 / 托盘闪烁
│   ├── ipc/                    # IPC 通讯（主进程 ↔ 渲染进程）
│   └── utils/                  # app-info（版本号）+ file-hash（流式 MD5/SHA-256）
├── preload/                    # 预加载脚本（contextBridge）
├── renderer/                   # 渲染进程（Vue 3 前端）
│   ├── components/             # UI 组件
│   ├── stores/                 # Pinia 状态管理（含 app-store 跨页共享版本号）
│   ├── assets/ / public/       # 图标资源
│   └── App.vue / main.ts       # 入口
└── shared/                     # 主进程与渲染进程共享
    ├── types/                  # 类型定义与 IPC 通道常量
    ├── constants/              # 端口 / 心跳 / 加密等常量
    ├── format.ts               # 字节数 / 时间格式化
    ├── version.ts              # semver 比较工具
    └── file-transfer.ts        # 文件传输状态文案
```

---

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

---

## 使用说明

### 基本流程

1. 启动应用后，自动生成唯一的 Peer ID、Ed25519 身份密钥对和默认昵称（主机名）
2. 应用**事件驱动**地在当前局域网广播 UDP 公告：上线广播一次、修改昵称/头像广播一次、手动刷新广播一次、消息发送失败时也会重广播一次
3. 左侧好友列表显示已发现的好友，绿色圆点表示在线（带脉冲动画）
4. 点击好友即可开始聊天，支持发送文字、图片、文件
5. 点击侧边栏「刷新」按钮可立即触发一次 UDP 广播（双向发现）
6. 点击「扫描」按钮可手动扫描指定网段（输入 CIDR）
7. 点击「设置」可修改昵称、查看 Peer ID、配置心跳间隔（关闭 / 30s / 60s / 2min / 5min）
8. 点击「传输」可查看文件传输进度，接收方可接受或拒绝文件
9. 关闭主窗口默认**最小化到系统托盘**；通过托盘菜单的「显示主窗口 / 退出鸿雁」唤起或彻底退出
10. 窗口未聚焦时收到新消息会触发**任务栏闪烁 + Windows 横幅通知**，可在「设置 → 消息提醒」中关闭
11. 关闭应用时会自动广播 `announcement-leaving` 公告

### 消息提醒设置

打开「设置」页的「消息提醒」分组，可分别控制：

| 设置项 | 默认 | 作用 |
|---|---|---|
| 关闭按钮最小化到托盘 | ✅ | 关闭主窗口时是否隐藏到托盘（关闭后必须用托盘菜单退出） |
| 启用 Windows 横幅通知 | ✅ | 收到消息/文件请求时弹原生 Toast 通知 |
| 启用任务栏闪烁 | ✅ | 窗口未聚焦时让任务栏图标闪烁 |
| 启用托盘图标闪烁 | ✅ | 主窗口最小化到托盘后让托盘图标带红点闪烁 |
| 免打扰时段 | ❌ | 在指定时段内不弹横幅、不闪烁（仅记录） |

**点击行为**：

- 点击 Toast 通知 → 唤起主窗口并自动切换到对应聊天 / 文件传输页
- 任务栏闪烁 → 点击主窗口任意位置自动停止闪烁
- 托盘图标闪烁 → 双击托盘图标唤起主窗口自动停止

### 生产环境注意事项

- 生产打包版本自动优化网络策略，减少不必要的广播流量
- 生产环境仅使用标准端口（UDP 19876，TCP 19877-19886）
- 内网部署建议配置防火墙允许上述端口通信
- 如需修改默认端口，可通过环境变量 `HONGYAN_UDP_PORT` 和 `HONGYAN_TCP_PORT` 指定
- 如需修改数据目录，可通过设置页「自定义数据目录」或环境变量 `HONGYAN_DATA_DIR` 指定
- `HONGYAN_DATA_DIR` 的优先级高于 `identity.json` 里的 `userDataDir` 设置（用于多实例测试隔离）

---

## 网络协议

| 协议 | 端口 | 用途 |
|------|------|------|
| UDP 广播 | 19876 | 好友发现、在线状态检测 |
| TCP 直连 | 19877 ~ 19886 | 消息传输、文件传输、密钥协商 |
| HTTP（版本分发） | 19890 ~ 19899 | 发布方向收端提供下载元信息与文件流 |

数据包格式为 JSON + 换行符分隔（`\n`），通过 `kind` 字段标识包类型：

| kind | 说明 |
|------|------|
| `announcement` | UDP 存在公告（带 Ed25519 签名） |
| `announcement-leaving` | 优雅下线公告，验签后立即标记对方离线 |
| `version-announcement` | 版本发布公告（带签名、nsis/portable 元信息、HTTP 端口） |
| `message` | 加密消息 |
| `ack` | 消息确认 |
| `file-request` / `file-accept` / `file-chunk` / `file-complete` | 文件传输 |
| `key-negotiation` | 密钥协商 |
| `group-create` / `group-invite` / `group-join-accept` / `group-leave` / `group-kick` / `group-dismiss` / `group-update` / `group-message` / `group-ack` / `group-recall` | 群聊协议 |

### UDP 公告包结构

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
    "appVersion": "1.5.0",
    "publicKey": "<base64 Ed25519 SPKI>",
    "signature": "<base64 Ed25519 signature>"
  }
}
```

签名覆盖除 `publicKey` 和 `signature` 之外的全部字段。接收端：

- 拒绝 `version > 2` 的未知未来版本
- `|now - timestamp| > 5min` 视为重放，丢弃
- 强制验签，签名失败丢弃
- 已知 peerId 的 `publicKey` 与本次不一致 → 视为冒充，丢弃
- 旧版 V1.1.0 (`version: 1`) 包按 legacy 接受，标记 `untrusted: true`

### 广播触发汇总

| 触发 | 包类型 | 触发位置 |
|---|---|---|
| 应用启动 | `announcement` | `UdpBroadcaster.start()` |
| 优雅退出 | `announcement-leaving` | `shutdownApp({graceful:true})` |
| 昵称/头像修改 | `announcement` | `setSelfInfo()` |
| 手动点「刷新」 | `announcement` | `friend:refresh` IPC → `refresh()` |
| 消息发送失败 | `announcement` | `message-service.sendText/sendImage` catch |
| 低频心跳（默认 60s） | `announcement` | `startHeartbeat()` |
| 收到新好友公告（双向发现） | `announcement` | `handleMessage()` 对 `isNew`/`justCameOnline` 触发回播 |

### 在线超时计算

V1.2.0 之前的固定 `ONLINE_TIMEOUT_MS = 30000` 是给 5-10s 周期广播设计的，配合默认 60s 心跳会出现"刚收到心跳就被判离线"的反复跳动。改为动态计算：

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

---

## 安全特性

- **端到端加密** — ECDH (x25519) 密钥协商 + AES-256-GCM 加密所有传输数据
- **UDP 广播包签名** — Ed25519 身份密钥签名公告包，TOFU 信任链防止 peerId 伪造和冒充攻击
- **存储加密** — 本地数据使用 AES-256-GCM 加密存储
- **身份密钥保护** — Ed25519 私钥用 master.key (DPAPI + AES-256-GCM) 二次加密后存盘
- **重放保护** — 公告包 timestamp 偏离 > 5 分钟视为重放，丢弃
- **DPAPI 加固** — PowerShell 脚本改用临时 `.ps1` 文件 + 显式 try/catch + exit code + 输出校验，杜绝空 buffer 静默写入损坏 `master.key`
- **HKDF 派生隔离** — storage / identity / transfer / session 四类 key 通过 HKDF 独立派生，互不影响
- **会话密钥过期** — 1 小时后自动重新协商
- **密钥清零** — 应用退出时内存中的密钥缓冲区填零清除
- **Context Isolation** — Electron 启用 `contextIsolation: true`，`nodeIntegration: false`
- **生产环境优化** — 自动减少网络广播频率，降低内网流量
- **智能端口扫描** — 生产环境仅使用标准端口

---

## 关键配置

> 环境变量相关的"常量"（UDP 端口、TCP 端口、数据目录）已改为 getter 函数，**每次调用时**才读取 `process.env`，避免在 npx/electron 子进程链中环境变量晚于模块加载生效的问题。

| 常量 / Getter | 默认值 | 说明 |
|------|----|------|
| `getUdpPort()` | 19876 | UDP 广播端口（可被 `HONGYAN_UDP_PORT` 覆盖） |
| `getTcpPortDefault()` | 19877 | TCP 起始端口（可被 `HONGYAN_TCP_PORT` 覆盖） |
| `getTcpPortMax()` | `getTcpPortDefault() + 9` | TCP 端口范围上限 |
| `getAppDataDir()` | `HongYan` | 数据目录名（可被 `HONGYAN_DATA_DIR` 覆盖） |
| `DEFAULT_HEARTBEAT_INTERVAL_MS` | 60000 | 低频心跳兜底间隔（0 = 关闭） |
| `calculateOnlineTimeoutMs()` | 函数 | 动态计算在线超时，公式 `max(30s, heartbeat × 2)` |
| `SIGNATURE_MAX_AGE_MS` | 300000 | 签名包允许的最大时间偏移（5 分钟） |
| `KEY_EXPIRY_MS` | 3600000 | 密钥过期时间（1 小时） |
| `FILE_CHUNK_SIZE` | 65536 | 文件分块大小（64 KB） |
| `MAX_FILE_SIZE` | 2147483648 | 最大文件大小（2 GB） |
| `IDENTITY_KEY_FILE` | `identity.key` | Ed25519 身份密钥文件（私钥加密存储） |

心跳间隔可通过用户配置 (`AppConfig.heartbeatIntervalMs`) 调整，UI 在「设置 → UDP 广播配置」中可设 关闭 / 30s / 60s / 2min / 5min。

### 环境变量配置

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `NODE_ENV` | 运行环境（development/production），影响广播频率和扫描端口策略 | - |
| `HONGYAN_UDP_PORT` | 自定义 UDP 端口 | 19876 |
| `HONGYAN_TCP_PORT` | 自定义 TCP 起始端口 | 19877 |
| `HONGYAN_DATA_DIR` | 自定义数据目录名（追加在 `%APPDATA%/` 下）；设置后自动进入多实例模式 | `HongYan` |

---

## 数据存储

应用数据目录：`%APPDATA%/<HONGYAN_DATA_DIR>/`（默认 `HongYan`）

> 优先级：`HONGYAN_DATA_DIR` 环境变量 > `identity.json` 中的 `userDataDir` > 默认 `HongYan`

| 文件 | 说明 |
|------|------|
| `hongyan.json` | lowdb 数据库（聊天记录、好友、文件传输记录、群组、发布/可用更新） |
| `master.key` | 主密钥文件 (DPAPI 加密) |
| `identity.json` | 身份配置（Peer ID、昵称、userDataDir、heartbeatIntervalMs） |
| `identity.key` | Ed25519 身份密钥（公钥明文 + 私钥 AES-256-GCM 加密） |
| `group-keys.json` | 群密钥持久化（AES-256-GCM + master key + aad） |
| `files/` | 接收文件 / 群文件暂存目录 |
| `logs/` | 日志目录 |

---

## 多实例本地测试

项目内置测试脚本可同时启动三个隔离的实例（不同数据目录 + 不同端口 + 互不干扰），用于本地验证 P2P、群聊与版本分发功能：

```bash
# PowerShell（推荐）
npm run test:multi

# Windows Batch
npm run test:multi:bat
```

三个实例的端口与数据目录：

| 实例 | 数据目录 | UDP 端口 | TCP 端口 |
|------|----------|----------|----------|
| Instance 1 | `%APPDATA%/HongYan-Test1/` | 19876 | 19877 |
| Instance 2 | `%APPDATA%/HongYan-Test2/` | 19878 | 19879 |
| Instance 3 | `%APPDATA%/HongYan-Test3/` | 19880 | 19881 |

### 工作原理

- **数据隔离**：`HONGYAN_DATA_DIR` 优先级最高，覆盖 `identity.json` 里的 `userDataDir` 设置，让三个实例的数据库/主密钥/日志完全分开
- **端口隔离**：每个实例绑定独立的 UDP/TCP 端口，不会冲突
- **自动发现**：检测到 `HONGYAN_DATA_DIR` 被设置时，自动切换到多实例广播模式
  - 广播目标端口范围扩大为 19876-19880（每个实例都往所有端口发）
  - 同时往 `127.0.0.1` 发，绕开 LAN 路由器/防火墙，确保同机多个实例能互相发现
  - 10 秒内双方应自动出现在好友列表里

如果 Windows 防火墙拦截了 UDP 广播，需要为 `node.exe` 添加入站规则放行 UDP 19876-19880。

### 重置测试环境

```bash
rd /s /q "%APPDATA%\HongYan-Test1"
rd /s /q "%APPDATA%\HongYan-Test2"
rd /s /q "%APPDATA%\HongYan-Test3"
```

---

## 已知问题与恢复

### V1.1.0 遗留：`master.key` 0 字节损坏

V1.1.0 的 `encryptWithDPAPI` 在某些 PowerShell 环境下会返回空 buffer，导致 `master.key` 写入 0 字节。V1.1.0 时代未被检测（因为 `deriveStorageKey()` 走 HKDF 把 0 字节转成确定性 32 字节，掩盖了问题），但 V1.2.0 起的身份密钥加密一旦直接用 `getMasterKey()` 就会立即报错。

**兼容处理**：

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

后续版本已加固 `master-key.ts`：临时 `.ps1` 文件 + 显式 try/catch + 节点层多次校验，杜绝 V1.1.0 的空 buffer 写入 bug 复发。

---

## 版本记录

> 按发布版本倒序排列。每个版本记录该次发版的主要变更、架构演进、协议/兼容性影响和测试要点。

### V1.5.0 — 局域网版本分发

**新增能力**：发布方在 UI 挂载新版本分发包（NSIS + Portable），发布后向所有低版本好友广播升级通知；好友通过发布方 LAN 内的临时 HTTP 服务直接下载并 SHA-256 校验。

#### 新增功能

| 功能 | 说明 |
|---|---|
| 版本发布页 | 侧边栏新增「版本分发」入口；选择 NSIS / Portable 分发包 + 目标版本号 + 更新说明 + 一键发布 |
| LAN 广播 | 通过 UDP 广播 `version-announcement`（带 Ed25519 签名），仅向 `appVersion < targetVersion` 的好友推送 |
| HTTP 下载服务 | 发布方在 LAN 内启用临时 HTTP 服务（默认端口 19890），提供 `/meta` 和 `/files/:name` 两个端点；收端用 SHA-256 校验下载完整性 |
| 收端横幅 | 收端右上角出「XX 发布了新版本 vX.Y.Z」横幅；点击进入下载对话框 |
| 收端下载对话框 | 选择 NSIS / Portable、进度条、速度显示、SHA-256 校验；完成后调系统 `shell.openPath` 打开安装器 |
| 历史发布 | 同一发布方同一版本只显示一条；新广播来时自动 upsert |
| 5 分钟无活动自动停止 | 防止发布方长时间挂起 HTTP 服务；用户可手动停止 |
| 主动停止广播 | 发布方点停止时广播 `stopped=true`，收端自动清理 |
| 周期重广播 | 5 分钟一次兜底断网恢复的 LAN 节点 |

#### 架构变更

| 维度 | V1.4.0 | V1.5.0 |
|---|---|---|
| 协议 kind | `announcement` / `announcement-leaving` / `group-*` / `message` / `file-*` | + `version-announcement` |
| presence 包 | `version=2`（6 字段签名） | + `appVersion` 字段（仅 V1.5.0+ 携带；签名仍走 Ed25519） |
| 协议版本 | `PROTOCOL_VERSION = 2` / `GROUP_PROTOCOL_VERSION = 3` | 不变；`version-announcement` 走 `version=3` |
| 网络端口 | UDP 19876 / TCP 19877-19886 | + HTTP 19890-19899（发布方开） |
| 数据库 | `chatRecords` / `friends` / `fileTransfers` / `groups` | + `publishedUpdates` / `availableUpdates` |
| 导航 | 聊天 / 联系人 / 群聊 / 传输 / 设置 | + 「版本分发」 tab |

#### 协议包结构

```json
{
  "kind": "version-announcement",
  "data": {
    "version": 3,
    "targetVersion": "1.5.0",
    "publisherPeerId": "<uuid>",
    "publisherNickname": "Alice",
    "httpPort": 19890,
    "nsis":     { "filename": "HongYan-1.5.0-x64.exe",     "size": 12345678, "sha256": "<hex>" },
    "portable": { "filename": "HongYan-1.5.0-portable.exe", "size": 12345678, "sha256": "<hex>" },
    "note": "修复群文件下载问题",
    "timestamp": 1700000000000,
    "stopped": false,
    "publicKey": "<base64 Ed25519 SPKI>",
    "signature": "<base64 Ed25519 signature>"
  }
}
```

签名覆盖除 `publicKey` 和 `signature` 之外的全部字段。`stopped=true` 时仅 `targetVersion` + `publisherPeerId` 用于收端清理。

#### HTTP 下载服务（发布方）

| 端点 | 方法 | 作用 |
|---|---|---|
| `/meta` | GET | 返回 JSON 元信息（包名、大小、SHA-256、发布方信息、更新时间、note） |
| `/files/:name` | GET | 流式返回文件，附 `Content-Disposition: attachment` |
| `/health` | GET | 返回 `ok` 用于收端存活探测 |

安全控制：

- LAN 访问控制：仅放行与本机任一接口同网段的源 IP
- 文件名白名单：只暴露 `nsis.filename` / `portable.filename` 中登记的两个
- 路径校验：`fs.createReadStream` + `Content-Length` 严格匹配登记大小
- 大小限制：单文件 ≤ 1 GB
- 5 分钟无活动自动停止

#### 收端下载流程

1. 收端从 `version-announcement` 取出 `publisherIp` + `httpPort` + `nsis/portable` 元信息
2. 渲染端选 NSIS 或 Portable，调 `update:start-download` IPC
3. 主进程 `update-downloader.ts` 通过 `http.get` 流式下载到 `%TEMP%/HongYanUpdate/<jobId>/`
4. 边下边算 SHA-256，进度通过 `update:download-progress` 推送
5. 校验通过 → `update:download-complete` → 渲染端调 `update:open-installer` 触发 `shell.openPath`

#### 兼容性

- **完全兼容 V1.4.0**：presence 包 V1.5.0+ 携带 `appVersion`，V1.4.0 客户端按额外字段忽略（签名仍走 Ed25519 对称，验签通过）
- **V1.4.0 客户端收到 `version-announcement`**：未识别的 kind 走 `default` 分支记 warn 日志，不影响其他功能
- **V1.5.0 客户端收到 V1.4.0 客户端的 presence**：`appVersion` 字段缺失，`getLowerVersionFriends()` 视对方为 0.0.0（不会被推送，但不会报错）
- **数据库自动迁移**：旧库无 `publishedUpdates` / `availableUpdates` 时初始化为空数组
- **HTTP 端口冲突**：默认 19890 被占时自动 +1 试，最多 10 次；用尽后报错给用户

#### 测试场景

1. 3 个实例：实例 1 升到 V1.5.0，发布 1.5.0；实例 2、3 保持 V1.4.0
2. 实例 1 启动发布 → 5 秒内实例 2、3 右上角出现横幅
3. 实例 2 点横幅 → 选 NSIS → 下载 → SHA-256 通过 → 弹安装器
4. 实例 3 点横幅 → 选 Portable → 同上
5. 实例 1 点停止发布 → 实例 2、3 横幅立即消失
6. 5 分钟无下载后实例 1 自动停止（开发测试可改短）
7. LAN 段外访问实例 1 的 HTTP 服务 → 403
8. V1.4.0 客户端不识别 `version-announcement` 走 warn 日志，其他功能正常
9. 实例 1 重启 → 已停止的发布不会自动恢复（避免「幽灵发布」）

---

### V1.4.0 — 仿微信群聊

**新增能力**：在保留 1:1 私聊的同时支持多人群组消息。

#### 新增功能

| 功能 | 说明 |
|---|---|
| 创建/解散群 | 群主创建群并指定初始成员；群主可随时解散群（不可恢复） |
| 邀请新成员 | 群主在群信息页可邀请好友加入；加入时自动轮换群密钥 |
| 踢人/退出 | 群主可踢出成员（自动轮换密钥防被踢者解密后续消息）；非群主可主动退出 |
| 群消息 | 支持文字、图片、文件（群文件由 owner 暂存于本地 `files/`，接收方按需触发 `file-share-request` 拉取） |
| @ 提及 | 输入 `@` 触发成员选择浮层，可 @ 指定成员或 @所有人；被 @ 的消息在 UI 高亮 |
| 群信息/成员 | 群信息对话框展示成员列表、在线状态；群主可重命名群 |
| 群消息系统通知 | 群消息复用 Windows 横幅通知（标题前缀群名），免打扰时段同样生效 |
| 未读计数 | 群列表显示未读红点，进入群后清零 |
| 群密钥轮换 | 成员变更（加入/退出/踢人）时自动生成新群密钥，旧成员无法解密后续消息 |
| 离线补发 | 群密钥分发失败时进入待重试队列，好友上线时自动重试 |

#### 架构变更

| 维度 | V1.3.0 | V1.4.0 |
|---|---|---|
| 会话类型 | 仅 1:1 私聊 | 1:1 + 群聊（`conversationType: p2p/group`） |
| 消息加密 | ECDH 会话密钥 | ECDH × 群密钥双重加密（外层 ECDH、内层 AES-256-GCM） |
| 群密钥 | 无 | AES-256 群密钥；群主负责生成/分发/轮换 |
| 消息扇出 | 点对点 | 发送方独立扇出到所有成员（去中心化） |
| 数据库 | `chatRecords` / `friends` / `fileTransfers` | + `groups: Group[]`（群元信息） |
| 协议版本 | `version: 2` | 群聊包 `version: 3`，1:1 仍为 `version: 2` |
| 协议 kind | `key-negotiation / message / ack / file-*` | + `group-*` 一整套 |
| 导航 | 聊天 / 联系人 / 传输 | + 群聊 tab |
| 多实例测试 | 2 个实例 | 3 个实例 |

#### 关键设计决策

1. **群密钥管理**：群主生成 AES-256 群密钥，用各成员的 ECDH 会话密钥加密分发（`groupKeyPayload`）。所有群消息用群密钥 AES-256-GCM 加密后，再用每个成员的 ECDH 会话密钥二次封装
2. **去中心化扇出**：发送方独立给每个成员发包，群主不承担消息中转（群主仅负责成员管理 + 密钥分发）
3. **密钥轮换**：成员变更触发 `keyVersion++`，被踢者/退出者无法解密后续消息
4. **群 ID 命名**：`grp_<uuid>` 前缀，便于一眼区分
5. **离线补发**：群主维护 `pendingKeyDeliveries[groupId] = Set<peerId>`，好友上线时自动重试
6. **大小限制**：单群最大 50 成员，防止扇出风暴

#### 兼容性

- **1:1 私聊完全兼容** V1.3.0（应用层协议、文件格式、加密方式未变）
- **群聊协议独立** (`version: 3`)，老版本客户端收到 `group-*` 包按未知包忽略
- **数据库自动迁移**：旧库无 `groups` 集合时初始化为空数组；旧 `chatRecords` 补 `conversationType: p2p` 默认值
- 旧 `master.key` 损坏检测逻辑保留
- V1.3.0 客户端在 V1.4.0 群中只能接收 1:1 消息；群消息会被忽略（INFO 日志，不报错）

#### 测试场景清单

1. 三实例同时启动，10 秒内互见
2. Instance 1 在群聊 tab 点 "+" → 选 Instance 2、3 → 命名 → 创建
3. Instance 2、3 收到横幅邀请 → 点击接受
4. 任意成员发消息 → 其他人实时收到
5. @ 提及：发送方输入 `@` 选成员 → 接收方消息高亮
6. 退出/踢人：被踢者/退出者从群列表移除；其他成员群成员列表更新
7. 解散群：群主解散 → 所有成员群列表清空
8. 离线补发：Instance 1 邀请离线的好友 → 好友上线后自动收到 invite
9. 重启后群列表/消息/成员关系正确恢复
10. 与 1:1 私聊并行使用互不干扰
11. 群文件共享：A 在群中发文件 → B/C 看到文件气泡 → B 点"下载" → 收到 A 分发的文件
12. 群密钥持久化：建群后任意实例重启 → 发消息/文件正常（密钥从 `group-keys.json` 恢复）

#### V1.4.0 后续修复（合并在同分支，未单独发版）

V1.4.0 主功能发布后，在三实例实测中又迭代了一轮：

| 修复 | 说明 |
|---|---|
| **群密钥磁盘持久化** | 原实现群密钥仅存内存，应用重启后丢失，发文件报 `No group key available`。改为 AES-256-GCM 加密存到 `${dataDir}/group-keys.json`（用 master key + aad `hongyan-group-keys-v1`），启动时 `loadAllGroupKeys()` 恢复 |
| **密钥自动重同步** | 即使双方密钥都丢失（如老群在持久化修复前建的），成员发消息时会自动 `KEY_RESYNC` 请求 owner，owner 收到后用现有 key 回传（若 owner 也没 key 则发 nack 让请求方秒失败） |
| **群文件共享** | 完整实现：owner 把文件 md5+暂存到 `files/<messageId>_<name>`，广播群消息（type=`file`），成员点"下载"触发 `file-share-request`，owner 复用现有 file-transfer-service 走 `file-request`（带 `fromGroupShare:true`，接收方静默接收不弹私聊 UI） |
| **@ 浮层不打开 bug** | 原 watcher 加了 `cursor > lastMentionEnd` 守卫，但 `lastMentionEnd` 初值 0 误判了"首次输入 @"：导致用户第一次按 `@` 时就被强制关闭浮层。移除该守卫，只保留 `suppressMentionWatch` 标志位（selectMention 触发 text 变化时跳过 watcher）+ `nextTick` 移光标 + `textareaRef.value.value === newText` 保护 |
| **@ 浮层不关闭 bug** | selectMention 同步 `setSelectionRange` 时 DOM 还未更新，watcher 读旧 DOM 光标看不到新插入的尾随空格，误判为"还在 @ 输入中"重开。改在 `nextTick` 中移光标（此时 DOM 已同步），并加 `if (textareaRef.value.value === newText)` 保护避免覆盖用户后续输入 |
| **侧边栏图标区分** | 联系人 tab 之前是 2 人头，和群聊 tab 视觉冲突。改为联系人 = 单人剪影，群聊 = 3 人头 + 粉色渐变背景；群聊列表项和群聊视图头部同步替换 |
| **群文件类型支持** | 私聊和群聊都补全 `selectFile` + `file:select` IPC，MessageBubble 对群消息用单独的"下载"按钮（不弹私聊接收/拒绝 UI） |
| **错误信息可读化** | `No group key available` 原是统一文案，owner 离线/owner 也丢密钥/会话密钥失败/超时 全部混在一起。现区分 7 种 `reason`，主进程日志加 `[KeyResync]` 前缀，错误文案带可读原因 + 修复建议（如"请重新创建群以恢复"） |

---

### V1.3.0 — 系统托盘 + 多源消息提醒

#### 用户行为变化（重要）

V1.3.0 改变了**关闭窗口**的默认行为：

| 行为 | V1.2.0 | V1.3.0（默认）|
|---|---|---|
| 点窗口右上角 × | 退出整个应用 | **最小化到系统托盘** |
| 真正退出 | × / Alt+F4 | 托盘菜单 → 退出鸿雁 |

这是**有意设计**——让应用像微信、QQ 等通讯工具一样常驻托盘，确保新消息能被及时收到。

如果更喜欢旧行为，可在「设置 → 消息提醒 → 关闭按钮最小化到托盘」中关闭。

#### 新增功能

| 功能 | 说明 |
|---|---|
| 系统托盘 | 托盘图标 + 上下文菜单（显示主窗口 / 退出鸿雁） |
| 任务栏闪烁 | 窗口未聚焦时收到新消息，任务栏图标持续闪烁 |
| Windows Toast 横幅 | 收到消息/文件请求时弹原生系统通知，点击唤起窗口 |
| 托盘图标闪烁 | 最小化到托盘后收到新消息，托盘图标带红点闪烁 |
| 免打扰时段 | 设置页可指定不弹通知/不闪烁的时段（支持跨午夜） |

#### 架构变更

| 维度 | V1.2.0 | V1.3.0 |
|---|---|---|
| 提醒机制 | 仅 in-app toast | 三源提醒：横幅 + 任务栏 + 托盘 |
| 窗口关闭 | 直接退出 | 默认隐藏到托盘，菜单/quit IPC 退出 |
| AppUserModelID | 未设置（Windows Toast 归到 electron.exe）| `com.hongyan.messenger`，toast 归到 HongYan 名下 |
| 配置项 | nickname / heartbeat / userDataDir | + closeToTray / enableNotifications / enableTaskbarFlash / enableTrayFlash / dndEnabled / dndStart / dndEnd |

#### 兼容性

V1.3.0 与 V1.2.0 完全兼容（应用层协议、文件格式、加密方式未变），混合部署时仍能正常通讯。

---

### V1.2.0 — 安全加固 + Ed25519 签名 + 事件驱动广播

**核心目标**：在 V1.1.0 基础上补齐安全短板，根治"周期广播浪费流量 + 局域网可被任意伪造 peerId"两大问题。

#### 主要变更

| 维度 | V1.1.0 | V1.2.0 |
|---|---|---|
| 广播频率 | 5-10s 周期 | 事件触发 + 60s 心跳（流量下降 8~12 倍）|
| 广播签名 | 无 | Ed25519 必签（V2 协议）|
| 互发现 | 周期广播自然发现 | 双向发现（点刷新 + 回播）|
| 协议版本 | 1 | 2 |
| 离线判定 | 30s 写死超时 | 动态（`max(30s, heartbeat × 2)`）|
| 下线通知 | 等超时 | 立即（`announcement-leaving`）|
| TCP 断连 | 不感知 | 立即标离线 |
| 身份密钥 | 无 | Ed25519 密钥对（公钥广播，私钥加密存盘）|
| master.key 损坏 | 静默 | ERROR 日志提示 + 检测 |

#### 新增安全特性

- **UDP 广播包签名** — Ed25519 身份密钥签名公告包，TOFU 信任链防 peerId 伪造
- **身份密钥保护** — Ed25519 私钥用 master.key (DPAPI + AES-256-GCM) 二次加密后存盘
- **重放保护** — 公告包 timestamp 偏离 > 5 分钟丢弃
- **DPAPI 加固** — 临时 `.ps1` 文件 + 显式 try/catch + 输出校验，杜绝 V1.1.0 的空 buffer 写入 bug

#### 兼容性

- V1.2.0 接收 V1.1.0 包 → 接受为 `untrusted: true`（仅做轻量兼容）
- V1.1.0 接收 V1.2.0 包 → V1.1.0 的严格版本检查会拒绝（这是已知不对称，需升级两端）

---

### V1.1.0 — 初始版本

首个可用版本。功能要点：

- 局域网 UDP 周期广播（5-10s）实现好友自动发现
- ECDH (x25519) 密钥协商 + AES-256-GCM 端到端加密
- 文字 / 图片消息
- 文件分块传输 + MD5 校验
- 好友备注
- 本地聊天记录加密存储（lowdb + AES-256-GCM）
- 已知缺陷：DPAPI 调用在某些 PowerShell 环境下会写入 0 字节 `master.key`（在 V1.2.0 修复并提供恢复方案，见"已知问题与恢复"）

---

## 许可证

ISC
