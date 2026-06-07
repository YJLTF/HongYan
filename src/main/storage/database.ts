import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import { Low } from 'lowdb'
import { JSONFile } from 'lowdb/node'
import { DB_NAME, APP_DATA_DIR, FILES_DIR, LOGS_DIR } from '@shared/constants'
import type { ChatRecord, Friend, FileTransferRecord, AppConfig } from '@shared/types'
import log from 'electron-log'

interface DatabaseSchema {
  chatRecords: ChatRecord[]
  friends: Friend[]
  fileTransfers: FileTransferRecord[]
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
  return path.join(app.getPath('appData'), APP_DATA_DIR)
}

// 根据配置获取数据目录
export function getDataDir(config?: AppConfig): string {
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
  }
  
  const adapter = new JSONFile<DatabaseSchema>(dbPath)
  db = new Low<DatabaseSchema>(adapter, defaultData)
  
  await db.read()
  if (!db.data) {
    db.data = defaultData
  }
  
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
