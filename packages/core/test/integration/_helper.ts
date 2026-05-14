import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { setTimeout as wait } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { spawn, type ChildProcess } from 'node:child_process'

const HERE = path.dirname(fileURLToPath(import.meta.url))

export interface SpawnedDaemon {
  home: string
  socket: string
  child: ChildProcess
  shutdown: () => Promise<void>
}

export interface SpawnOpts {
  home?: string
}

export async function spawnDaemonProcess(opts: SpawnOpts = {}): Promise<SpawnedDaemon> {
  const home = opts.home ?? mkdtempSync(path.join(os.tmpdir(), 'glm-int-'))
  const glmHome = path.join(home, '.glm')
  const socket = path.join(glmHome, 'daemon.sock')
  const entry = path.resolve(HERE, '../../../cli/dist/daemon-entry.js')
  const child = spawn(process.execPath, [entry], {
    detached: false,
    stdio: 'pipe',
    env: { ...process.env, GLM_HOME: glmHome }
  })
  for (let i = 0; i < 80; i++) {
    if (existsSync(socket)) break
    await wait(50)
  }
  if (!existsSync(socket)) {
    child.kill('SIGTERM')
    throw new Error(`daemon socket did not appear at ${socket}`)
  }
  return {
    home,
    socket,
    child,
    shutdown: async () => {
      child.kill('SIGTERM')
      await new Promise<void>((resolve) => child.once('exit', () => resolve()))
      if (!opts.home) rmSync(home, { recursive: true, force: true })
    }
  }
}
