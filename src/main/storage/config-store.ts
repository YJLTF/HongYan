import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { APP_DATA_DIR, CONFIG_FILE } from '@shared/constants'
import type { AppConfig } from '@shared/types'
import log from 'electron-log'

const configPath = path.join(app.getPath('appData'), APP_DATA_DIR, CONFIG_FILE)

export function loadConfig(): AppConfig | null {
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8')
      return JSON.parse(raw) as AppConfig
    }
    return null
  } catch (err) {
    log.warn('Failed to load config:', err)
    return null
  }
}

export function saveConfig(config: AppConfig): void {
  try {
    const dir = path.dirname(configPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
  } catch (err) {
    log.error('Failed to save config:', err)
    throw err
  }
}
