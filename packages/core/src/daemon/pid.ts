import { readFileSync, writeFileSync, mkdirSync, unlinkSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'

export function writePid(file: string, pid: number): void {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, String(pid), { mode: 0o600 })
}

export function readPid(file: string): number | undefined {
  if (!existsSync(file)) return undefined
  const raw = readFileSync(file, 'utf8').trim()
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

export function removePid(file: string): void {
  try { unlinkSync(file) } catch { /* ignore */ }
}

export function isPidAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true } catch { return false }
}
