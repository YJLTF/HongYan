# 鸿雁 (HongYan) - 局域网点对点即时通讯工具

一款基于 Electron 构建的局域网（LAN）点对点（P2P）即时通讯桌面应用，无需中心服务器，同一局域网内的用户可以自动发现彼此并进行加密通讯与文件传输。

## 功能特性

- **好友自动发现** - 通过 UDP 广播智能发现同一局域网内的其他鸿雁用户，支持手动扫描指定网段，生产环境优化网络流量
- **点对点加密通讯** - 使用 ECDH (x25519) 密钥协商 + AES-256-GCM 端到端加密，所有传输数据均加密
- **消息收发** - 支持文字消息和图片消息，完整的消息状态追踪（发送中 → 已发送 → 已送达 → 已读）
- **消息撤回** - 支持撤回已发送的消息，双方同步显示"已撤回"提示
- **文件传输** - 分块传输，支持接受/拒绝，MD5 完整性校验，最大支持 2GB 文件
- **本地加密存储** - 聊天记录和配置数据使用 AES-256-GCM 加密存储于本地 SQLite 数据库
- **离线检测** - 30 秒无心跳自动判定好友离线
- **现代化UI** - 精美的渐变界面、流畅的动画效果、专业的通讯工具体验
- **好友备注** - 支持为联系人设置自定义备注名
- **安全优化** - 生产环境自动优化网络广播策略，适合安全内网部署

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Electron 33 |
| 前端 | Vue 3 + TypeScript + Pinia |
| 构建 | electron-vite + Vite 6 |
| 数据库 | lowdb (JSON 文件存储) |
| 加密 | Node.js crypto (ECDH x25519 + AES-256-GCM + HKDF) |
| 打包 | electron-builder (NSIS + Portable) |

## 项目结构

```
src/
├── main/                    # Electron 主进程
│   ├── index.ts             # 应用入口
│   ├── crypto/              # 加密模块（密钥协商、传输加密、存储加密）
│   ├── network/             # 网络模块（UDP 广播、TCP 通讯、连接管理、协议）
│   ├── services/            # 业务服务（好友发现、消息、文件传输）
│   ├── storage/             # 数据持久化（SQLite、配置存储）
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

1. 启动应用后，自动生成唯一的 Peer ID 和默认昵称（主机名）
2. 应用自动在当前局域网 UDP 广播，发现同一网段内的其他鸿雁用户
3. 左侧好友列表显示已发现的好友，绿色圆点表示在线（带脉冲动画）
4. 点击好友即可开始聊天，支持发送文字、图片、文件
5. 点击「扫描网段」按钮可手动扫描指定网段（输入 CIDR，如 `192.168.1.0/24`）
6. 点击「设置」可修改昵称、查看 Peer ID
7. 点击「传输」可查看文件传输进度，接收方可接受或拒绝文件

### 生产环境注意事项

- 生产打包版本自动优化网络策略，减少不必要的广播流量
- 生产环境仅使用标准端口（UDP 19876，TCP 19877-19886）
- 内网部署建议配置防火墙允许上述端口通信
- 如需修改默认端口，可通过环境变量 `HONGYAN_UDP_PORT` 和 `HONGYAN_TCP_PORT` 指定

## 网络协议

| 协议 | 端口 | 用途 |
|------|------|------|
| UDP 广播 | 19876 | 好友发现、在线状态检测 |
| TCP 直连 | 19877 ~ 19886 | 消息传输、文件传输、密钥协商 |

数据包格式为 JSON + 换行符分隔（`\n`），通过 `kind` 字段标识包类型：

| kind | 说明 |
|------|------|
| `announcement` | UDP 存在公告 |
| `message` | 加密消息 |
| `ack` | 消息确认 |
| `file-request` | 文件传输请求 |
| `file-accept` | 文件传输接受/拒绝 |
| `file-chunk` | 文件分块数据 |
| `file-complete` | 文件传输完成 |
| `key-negotiation` | 密钥协商 |

## 安全特性

- **端到端加密** - ECDH (x25519) 密钥协商 + AES-256-GCM 加密所有传输数据
- **存储加密** - 本地数据使用 AES-256-GCM 加密存储
- **会话密钥过期** - 1 小时后自动重新协商
- **密钥清零** - 应用退出时内存中的密钥缓冲区填零清除
- **Context Isolation** - Electron 启用 `contextIsolation: true`，`nodeIntegration: false`
- **生产环境优化** - 自动减少网络广播频率，降低内网流量，适合安全内网部署
- **智能端口扫描** - 生产环境仅使用标准端口，避免不必要的网络探测

## 关键配置

| 常量 | 值 | 说明 |
|------|----|------|
| `UDP_PORT` | 19876 | UDP 广播端口 |
| `TCP_PORT_DEFAULT` | 19877 | TCP 默认端口 |
| `TCP_PORT_MAX` | 19886 | TCP 最大端口 |
| `BROADCAST_INTERVAL_MS` | 开发: 5000 / 生产: 10000 | 广播间隔（开发5秒/生产10秒） |
| `ONLINE_TIMEOUT_MS` | 30000 | 在线超时（30 秒） |
| `KEY_EXPIRY_MS` | 3600000 | 密钥过期时间（1 小时） |
| `FILE_CHUNK_SIZE` | 65536 | 文件分块大小（64 KB） |
| `MAX_FILE_SIZE` | 2147483648 | 最大文件大小（2 GB） |

### 环境变量配置

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `NODE_ENV` | 运行环境（development/production） | - |
| `HONGYAN_UDP_PORT` | 自定义 UDP 端口 | 19876 |
| `HONGYAN_TCP_PORT` | 自定义 TCP 起始端口 | 19877 |
| `HONGYAN_DATA_DIR` | 自定义数据存储目录 | `%APPDATA%/HongYan/` |

### 开发测试

项目包含测试脚本，可同时启动两个实例进行本地测试：

```bash
# PowerShell (推荐)
npm run test:two

# Windows Batch
npm run test:two:bat
```

## 数据存储

应用数据目录：`%APPDATA%/HongYan/`

| 文件 | 说明 |
|------|------|
| `hongyan.json` | lowdb 数据库（聊天记录、好友、文件传输记录） |
| `master.key` | 主密钥文件 |
| `identity.json` | 身份配置（Peer ID、昵称） |
| `files/` | 接收文件存储目录 |
| `logs/` | 日志目录 |

## 许可证

ISC