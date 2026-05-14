import { describe, expect, test } from 'vitest'
import { createConnection } from 'node:net'
import { spawnDaemonProcess } from './_helper.js'

async function rpcCall(socket: string, method: string, params?: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const s = createConnection(socket)
    let leftover = ''
    s.on('connect', () => s.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) + '\n'))
    s.on('data', (chunk) => {
      leftover += chunk.toString('utf8')
      const i = leftover.indexOf('\n')
      if (i < 0) return
      const frame = leftover.slice(0, i)
      try {
        const msg = JSON.parse(frame) as { error?: { message: string }; result?: unknown }
        if (msg.error) reject(new Error(msg.error.message))
        else resolve(msg.result)
      } finally { s.end() }
    })
    s.on('error', reject)
  })
}

describe('daemon lifecycle (integration)', () => {
  test('starts, responds to ping, status, shuts down', async () => {
    const d = await spawnDaemonProcess()
    try {
      const ping = await rpcCall(d.socket, 'ping')
      expect(ping).toMatchObject({ pong: true })
      const status = await rpcCall(d.socket, 'daemon.status') as { version: string }
      expect(status.version).toMatch(/^0\.1\.0/)
    } finally {
      await d.shutdown()
    }
  })
})
