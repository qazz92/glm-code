import { describe, expect, test, beforeAll } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { setTimeout as wait } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { spawn, type ChildProcess } from 'node:child_process'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CLI_BIN = path.resolve(HERE, '../../../cli/dist/bin.js')
const DAEMON_ENTRY = path.resolve(HERE, '../../../cli/dist/daemon-entry.js')

interface SpawnedDaemon {
  home: string
  socket: string
  child: ChildProcess
  shutdown: () => Promise<void>
}

async function spawnDaemon(homeOverride?: string): Promise<SpawnedDaemon> {
  const home = homeOverride ?? mkdtempSync(path.join(os.tmpdir(), 'glm-tui-int-'))
  const glmHome = path.join(home, '.glm')
  const socket = path.join(glmHome, 'daemon.sock')
  const child = spawn(process.execPath, [DAEMON_ENTRY], {
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
      if (!homeOverride) rmSync(home, { recursive: true, force: true })
    }
  }
}

function waitOutput(chunks: Buffer[], needle: string, deadlineMs: number): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const check = () => {
      const combined = Buffer.concat(chunks).toString('utf8')
      if (combined.includes(needle)) return resolve(combined)
      if (Date.now() > deadlineMs) return reject(new Error(`timed out waiting for "${needle}". Got:\n${combined}`))
      setTimeout(check, 50)
    }
    check()
  })
}

describe.skipIf(!process.stdin.isTTY)('TUI + daemon integration', { timeout: 30_000 }, () => {
  test('TUI launches, shows attached message, responds to /help, Tab toggles views, Ctrl-D exits', async () => {
    const daemon = await spawnDaemon()
    try {
      const glmHome = path.join(daemon.home, '.glm')
      const chunks: Buffer[] = []
      const tui = spawn(process.execPath, [CLI_BIN, 'tui'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          GLM_HOME: glmHome,
          CI: '1',
          FORCE_COLOR: '0',
          TERM: 'dumb'
        }
      })
      tui.stdout!.on('data', (c: Buffer) => chunks.push(c))
      tui.stderr!.on('data', (c: Buffer) => chunks.push(c))

      const deadline = Date.now() + 12_000

      // Wait for session attachment
      await waitOutput(chunks, 'attached to session', deadline)

      // Send /help
      tui.stdin!.write('/help\r')
      await waitOutput(chunks, 'Available commands', deadline)

      // Send Tab to switch to Dashboard
      tui.stdin!.write('\t')
      await waitOutput(chunks, 'DASHBOARD', deadline)

      // Send Tab again to switch back to Chat
      tui.stdin!.write('\t')
      await waitOutput(chunks, 'CHAT', deadline)

      // Send Ctrl-D to exit
      tui.stdin!.write('\x04')
      await new Promise<void>((resolve) => tui.once('exit', () => resolve()))

      expect(tui.exitCode).toBe(0)
    } finally {
      await daemon.shutdown()
    }
  })

  test('TUI sends text message and receives echo', async () => {
    const daemon = await spawnDaemon()
    try {
      const glmHome = path.join(daemon.home, '.glm')
      const chunks: Buffer[] = []
      const tui = spawn(process.execPath, [CLI_BIN, 'tui'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          GLM_HOME: glmHome,
          CI: '1',
          FORCE_COLOR: '0',
          TERM: 'dumb'
        }
      })
      tui.stdout!.on('data', (c: Buffer) => chunks.push(c))
      tui.stderr!.on('data', (c: Buffer) => chunks.push(c))

      const deadline = Date.now() + 12_000

      // Wait for session attachment
      await waitOutput(chunks, 'attached to session', deadline)

      // Send a text message (the P1 stub echoes it back)
      tui.stdin!.write('hello from integration test\r')
      await waitOutput(chunks, 'hello from integration test', deadline)

      // Clean exit
      tui.stdin!.write('\x04')
      await new Promise<void>((resolve) => tui.once('exit', () => resolve()))

      expect(tui.exitCode).toBe(0)
    } finally {
      await daemon.shutdown()
    }
  })
})
