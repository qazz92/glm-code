import { describe, expect, test } from 'vitest'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { spawnDaemonProcess } from './_helper.js'
import { createConnection } from 'node:net'

async function pingViaSocket(socket: string): Promise<boolean> {
  return new Promise((resolve) => {
    const s = createConnection(socket)
    s.on('connect', () => { s.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }) + '\n') })
    s.on('data', () => { s.end(); resolve(true) })
    s.on('error', () => resolve(false))
    setTimeout(() => { s.destroy(); resolve(false) }, 1000)
  })
}

describe('crash recovery (integration)', () => {
  test('daemon starts even when stale PID file points to dead process', async () => {
    const homeDir = path.join('/tmp', `glm-crash-${process.pid}-${Date.now()}`)
    mkdirSync(path.join(homeDir, '.glm'), { recursive: true })
    writeFileSync(path.join(homeDir, '.glm', 'daemon.pid'), '2000000000')

    const d = await spawnDaemonProcess({ home: homeDir })
    try {
      expect(await pingViaSocket(d.socket)).toBe(true)
    } finally {
      await d.shutdown()
      rmSync(homeDir, { recursive: true, force: true })
    }
  })
})
