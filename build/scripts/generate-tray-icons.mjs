import sharp from 'sharp'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const repoRoot = path.resolve(__dirname, '../..')
const srcIcon = path.join(repoRoot, 'src/renderer/public/icons/icon-256x256.png')
const outDir = path.join(repoRoot, 'build/tray')

if (!fs.existsSync(srcIcon)) {
  console.error('Source icon not found:', srcIcon)
  process.exit(1)
}

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true })
}

const TRAY_SIZE = 32

async function generateNormal() {
  const out = path.join(outDir, 'tray-normal.png')
  await sharp(srcIcon)
    .resize(TRAY_SIZE, TRAY_SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(out)
  console.log('Generated:', out)
}

async function generateActive() {
  const base = await sharp(srcIcon)
    .resize(TRAY_SIZE, TRAY_SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()

  const badgeSize = 12
  const badgeX = TRAY_SIZE - badgeSize
  const badgeY = 0

  const badge = Buffer.from(
    `<svg width="${badgeSize}" height="${badgeSize}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${badgeSize / 2}" cy="${badgeSize / 2}" r="${badgeSize / 2 - 1}" fill="#ff4d4f" stroke="#ffffff" stroke-width="1.5"/>
    </svg>`
  )

  const out = path.join(outDir, 'tray-active.png')
  await sharp(base)
    .composite([{ input: badge, top: badgeY, left: badgeX }])
    .png()
    .toFile(out)
  console.log('Generated:', out)
}

async function generateIco() {
  const normalPng = path.join(outDir, 'tray-normal.png')
  const pngToIcoMod = await import('png-to-ico')
  const pngToIco = pngToIcoMod.default || pngToIcoMod
  const buf = await pngToIco([normalPng])
  const icoOut = path.join(outDir, 'tray.ico')
  fs.writeFileSync(icoOut, buf)
  console.log('Generated:', icoOut)
}

await generateNormal()
await generateActive()
await generateIco()
console.log('Tray icon generation complete.')
