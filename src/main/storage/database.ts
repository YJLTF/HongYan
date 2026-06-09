import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import { Low } from 'lowdb'
import { JSONFile } from 'lowdb/node'
import { DB_NAME, getAppDataDir, FILES_DIR, LOGS_DIR } from '@shared/constants'
import { ConversationType } from '@shared/types'
import type { ChatRecord, Friend, FileTransferRecord, AppConfig, Group } from '@shared/types'
import log from 'electron-log'

interface DatabaseSchema {
  chatRecords: ChatRecord[]
  friends: Friend[]
  fileTransfers: FileTransferRecord[]
  // V1.4.0: 群组
  groups: Group[]
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
// 优先级：HONGYAN_DATA_DIR 环境变量 > config.userDataDir > 默认目录
// 环境变量优先级最高，目的是支持多实例测试/dev 模式下的目录隔离
export function getDataDir(config?: AppConfig): string {
  if (process.env.HONGYAN_DATA_DIR) {
    return path.join(app.getPath('appData'), process.env.HONGYAN_DATA_DIR)
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
