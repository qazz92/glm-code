import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { setTimeout as wait } from 'node:timers/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolvePaths } from '@glm/shared'

const HERE = path.dirname(fileURLToPath(import.meta.url))

export async function ensureDaemonRunning(opts: { timeoutMs?: number } = {}): Promise<void> {
  const paths = resolvePaths()
  if (existsSync(paths.socket)) return

  const daemonBin = path.join(HERE, 'daemon-entry.js')
  const child = spawn(process.execPath, [daemonBin], {
    detached: true,
    stdio: 'ignore',
    env: process.env
  })
  child.unref()

  const deadline = Date.now() + (opts.timeoutMs ?? 4000)
  while (Date.now() < deadline) {
    if (existsSync(paths.socket)) return
    await wait(50)
  }
  throw new Error(`Daemon socket did not appear at ${paths.socket} within ${opts.timeoutMs ?? 4000}ms`)
}
