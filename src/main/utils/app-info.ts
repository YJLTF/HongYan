import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import log from 'electron-log'

/**
 * V1.5.0: 提取 readAppVersion 到共享 utils（之前是 ipc-handlers.ts 的本地函数）
 *
 * 优先级：
 *   1. `app.getVersion()` — 在 packaged build 中返回 asar 中 package.json 的 version
 *   2. 排除 `process.versions.electron` 后再用 — 在 npx electron dist/main/index.js 模式下
 *      Electron 找不到 app 的 package.json，会回退到自身版本号
 *   3. 文件系统候选路径：app.getAppPath() / __dirname / process.cwd() 各试一次
 *   4. 最后返回 'unknown'
 *
 * V1.5.0 合并：备忘录化避免每次 IPC 调用都重新解析 package.json
 */
let cached: string | null = null

export function getAppVersion(): string {
  if (cached !== null) return cached

  try {
    const v = app.getVersion()
    if (v && v !== process.versions.electron) {
      cached = v
      return cached
    }
  } catch {
    // ignore
  }

  const candidates = [
    path.join(app.getAppPath(), 'package.json'),
    path.join(__dirname, '../../package.json'),
    path.join(__dirname, '../../../package.json'),
    path.join(process.cwd(), 'package.json'),
  ]
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const pkg = JSON.parse(fs.readFileSync(p, 'utf-8')) as { version?: string }
        if (pkg.version) {
          cached = pkg.version
          return cached
        }
      }
    } catch (err) {
      log.debug('Failed to read package.json at', p, err)
    }
  }
  cached = 'unknown'
  return cached
}
