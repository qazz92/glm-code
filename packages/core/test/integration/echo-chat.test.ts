import { describe, expect, test } from 'vitest'
import { spawnDaemonProcess } from './_helper.js'
import { createConnection } from 'node:net'

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

describe('chat echo round-trip (integration)', () => {
  test('create session + send message → echo response', async () => {
    const d = await spawnDaemonProcess()
    try {
      const s = await rpcCall(d.socket, 'session.create', { cwd: '/tmp', initialTask: 'hi' }) as { id: string }
      expect(s.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
      const r = await rpcCall(d.socket, 'message.send', { sessionId: s.id, text: 'hello world' }) as { content: string; model: string }
      expect(r.content).toBe('hello world')
      expect(r.model).toBe('stub-echo')
      const list = await rpcCall(d.socket, 'session.list') as { id: string }[]
      expect(list.find(x => x.id === s.id)).toBeTruthy()
    } finally {
      await d.shutdown()
    }
  })
})
