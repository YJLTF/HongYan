// V1.5.0: 轻量级 semver 比较工具
// 仅支持 "x.y.z" 形式的版本号（不做 prerelease / build metadata 区分）
// 不引入第三方 semver 库以保持 zero-dependency

const DEFAULT_VERSION = '0.0.0'

export function isValidVersion(v: string | undefined | null): boolean {
  if (!v) return false
  return /^\d+\.\d+\.\d+$/.test(v.trim())
}

export function normalizeVersion(v: string | undefined | null): string {
  if (!v) return DEFAULT_VERSION
  const trimmed = v.trim()
  if (!isValidVersion(trimmed)) return DEFAULT_VERSION
  return trimmed
}

function parse(v: string): [number, number, number] {
  const parts = normalizeVersion(v).split('.').map(n => parseInt(n, 10))
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0]
}

export function compareVersion(a: string, b: string): number {
  const [a1, a2, a3] = parse(a)
  const [b1, b2, b3] = parse(b)
  if (a1 !== b1) return a1 - b1
  if (a2 !== b2) return a2 - b2
  return a3 - b3
}

export function isVersionLower(a: string, b: string): boolean {
  return compareVersion(a, b) < 0
}

export function isVersionHigher(a: string, b: string): boolean {
  return compareVersion(a, b) > 0
}

export function isVersionEqual(a: string, b: string): boolean {
  return compareVersion(a, b) === 0
}
