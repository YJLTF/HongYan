import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import { Low } from 'lowdb'
import { JSONFile } from 'lowdb/node'
import { DB_NAME, getAppDataDir, FILES_DIR, LOGS_DIR } from '@shared/constants'
import { ConversationType } from '@shared/types'
import type { ChatRecord, Friend, FileTransferRecord, AppConfig, Group, PublishedUpdate, AvailableUpdate } from '@shared/types'
import log from 'electron-log'

interface DatabaseSchema {
  chatRecords: ChatRecord[]
  friends: Friend[]
  fileTransfers: FileTransferRecord[]
  // V1.4.0: 群组
  groups: Group[]
  // V1.5.0: 我作为发布方发起的版本更新
  publishedUpdates: PublishedUpdate[]
  // V1.5.0: 收端收到的可用更新
  availableUpdates: AvailableUpdate[]
}

let db: Low<DatabaseSchema> | null = null

export function getDatabase(): Low<DatabaseSchema> {
  if (!db) {
    throw new Error('Database not initialized')
  }
  return db
}

// 获取默认数据目录（不依赖配置）
export function getDefaultDataDir(): string {
  return path.join(app.getPath('appData'), getAppDataDir())
}

// 根据配置获取数据目录
// 优先级：ABCD_DATA_DIR 环境变量 > config.userDataDir > 默认目录
// 环境变量优先级最高，目的是支持多实例测试/dev 模式下的目录隔离
export function getDataDir(config?: AppConfig): string {
  if (process.env.ABCD_DATA_DIR) {
    return path.join(app.getPath('appData'), process.env.ABCD_DATA_DIR)
  }
  if (config?.userDataDir) {
    return config.userDataDir
  }
  return getDefaultDataDir()
}

export async function initDatabase(config?: AppConfig): Promise<Low<DatabaseSchema>> {
  const dataDir = getDataDir(config)
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
  const filesDir = path.join(dataDir, FILES_DIR)
  const logsDir = path.join(dataDir, LOGS_DIR)
  if (!fs.existsSync(filesDir)) {
    fs.mkdirSync(filesDir, { recursive: true })
  }
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true })
  }

  const dbPath = path.join(dataDir, DB_NAME.replace('.db', '.json'))

  // 默认数据
  const defaultData: DatabaseSchema = {
    chatRecords: [],
    friends: [],
    fileTransfers: [],
    groups: [],
    publishedUpdates: [],
    availableUpdates: [],
  }

  const adapter = new JSONFile<DatabaseSchema>(dbPath)
  db = new Low<DatabaseSchema>(adapter, defaultData)

  await db.read()
  if (!db.data) {
    db.data = defaultData
  }

  // V1.4.0: 旧库迁移 - 补 groups 字段
  if (!Array.isArray((db.data as any).groups)) {
    log.info('Migrating database: adding groups collection')
    ;(db.data as any).groups = []
  }

  // V1.5.0: 旧库迁移 - 补 publishedUpdates 字段
  if (!Array.isArray((db.data as any).publishedUpdates)) {
    log.info('Migrating database: adding publishedUpdates collection')
    ;(db.data as any).publishedUpdates = []
  }
  // V1.5.0 修复: availableUpdates 已改为纯内存（瞬态），清空磁盘上的残留
  // 否则上次运行残留的过期记录会让接收方重启后看到"幽灵更新通知"，点下载必 ECONNREFUSED
  if (Array.isArray((db.data as any).availableUpdates) && (db.data as any).availableUpdates.length > 0) {
    log.info('Clearing stale availableUpdates from disk:', (db.data as any).availableUpdates.length, 'entries')
  }
  ;(db.data as any).availableUpdates = []

  // V1.4.0: 旧库迁移 - 给 1:1 聊天记录补 conversationType
  let migratedCount = 0
  for (const record of db.data.chatRecords) {
    if (!record.conversationType) {
      record.conversationType = record.groupId
        ? ConversationType.GROUP
        : ConversationType.P2P
      migratedCount++
    }
  }
  if (migratedCount > 0) {
    log.info(`Migrated ${migratedCount} chat records with conversationType`)
  }

  await db.write()

  log.info('Database initialized at', dbPath)
  return db
}

export function closeDatabase(): void {
  if (db) {
    log.info('Database closed')
    db = null
  }
}

export function getDataDirPath(): string {
  return getDataDir()
}
