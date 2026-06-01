import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import { DB_NAME, APP_DATA_DIR, FILES_DIR, LOGS_DIR } from '@shared/constants'
import log from 'electron-log'

let db: Database.Database | null = null

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized')
  }
  return db
}

export function initDatabase(): Database.Database {
  const dataDir = path.join(app.getPath('appData'), APP_DATA_DIR)
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

  const dbPath = path.join(dataDir, DB_NAME)
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  createTables()
  log.info('Database initialized at', dbPath)
  return db
}

function createTables(): void {
  const d = getDatabase()
  
  // 创建表（如果不存在）
  d.exec(`
    CREATE TABLE IF NOT EXISTS chat_records (
      id TEXT PRIMARY KEY,
      peer_id TEXT NOT NULL,
      type TEXT NOT NULL,
      direction TEXT NOT NULL,
      content TEXT NOT NULL,
      thumbnail TEXT,
      file_name TEXT,
      file_size INTEGER,
      status TEXT NOT NULL DEFAULT 'sending',
      timestamp INTEGER NOT NULL,
      recalled INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_chat_records_peer ON chat_records(peer_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_chat_records_timestamp ON chat_records(timestamp);

    CREATE TABLE IF NOT EXISTS friends (
      peer_id TEXT PRIMARY KEY,
      nickname TEXT NOT NULL,
      remark TEXT,
      avatar TEXT,
      ip TEXT NOT NULL,
      tcp_port INTEGER NOT NULL,
      online INTEGER NOT NULL DEFAULT 0,
      last_seen INTEGER NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS file_transfers (
      transfer_id TEXT PRIMARY KEY,
      peer_id TEXT NOT NULL,
      direction TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      progress REAL NOT NULL DEFAULT 0,
      md5 TEXT,
      save_path TEXT,
      timestamp INTEGER NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );
  `)
  
  // 为旧数据库添加新列（使用 PRAGMA 检查列是否存在）
  try {
    // 检查并添加 chat_records.recalled 列
    const chatColumns = d.pragma("table_info(chat_records)") as any[]
    const hasRecalled = chatColumns.some(col => col.name === 'recalled')
    if (!hasRecalled) {
      d.exec('ALTER TABLE chat_records ADD COLUMN recalled INTEGER DEFAULT 0')
    }
    
    // 检查并添加 friends.remark 列
    const friendColumns = d.pragma("table_info(friends)") as any[]
    const hasRemark = friendColumns.some(col => col.name === 'remark')
    if (!hasRemark) {
      d.exec('ALTER TABLE friends ADD COLUMN remark TEXT')
    }
    
    // 检查并添加 friends.avatar 列
    const hasAvatar = friendColumns.some(col => col.name === 'avatar')
    if (!hasAvatar) {
      d.exec('ALTER TABLE friends ADD COLUMN avatar TEXT')
    }
  } catch (err) {
    log.error('Error during database migration:', err)
  }
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
    log.info('Database closed')
  }
}

export function getDataDir(): string {
  return path.join(app.getPath('appData'), APP_DATA_DIR)
}
