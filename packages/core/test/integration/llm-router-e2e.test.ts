import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createConnection } from 'node:net'
import { setTimeout as wait } from 'node:timers/promises'
import { spawnDaemonProcess } from './_helper.js'
import { startMockZai, type MockHandle } from '../../../llm-router/test/fixtures/mock-zai-server.js'

let mock: MockHandle
let daemon: Awaited<ReturnType<typeof spawnDaemonProcess>>
let home: string

beforeEach(async () => {
  home = mkdtempSync(path.join(os.tmpdir(), 'glm-e2e-'))
  const glm = path.join(home, '.glm')
  mkdirSync(glm, { recursive: true })

  // Start mock first so we know its URL
  mock = await startMockZai({ anthropicSequence: 'text' })

  // Seed credentials pointing at mock
  writeFileSync(path.join(glm, 'credentials.json'), JSON.stringify({
    defaultProfile: 'default',
    profiles: {
      default: { apiKey: 'test-key', tier: 'lite', baseUrl: `${mock.baseUrl}/api/anthropic` }
    }
  }))

  // Spawn daemon with env cleared of GLM_ vars (so it reads credentials.json)
  daemon = await spawnDaemonProcess({
    home,
    env: { GLM_API_KEY: undefined, ZAI_API_KEY: undefined, ANTHROPIC_API_KEY: undefined }
  })
})

afterEach(async () => {
  await daemon.shutdown()
  await mock.close()
  rmSync(home, { recursive: true, force: true })
})

async function rpc(socket: string, method: string, params?: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const s = createConnection(socket)
    let leftover = ''
    s.on('connect', () => s.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) + '\n'))
    s.on('data', (chunk) => {
      leftover += chunk.toString('utf8')
      let nl = leftover.indexOf('\n')
      while (nl >= 0) {
        const frame = leftover.slice(0, nl)
        leftover = leftover.slice(nl + 1)
        try {
          const msg = JSON.parse(frame) as { id?: number; method?: string; result?: unknown; error?: { message: string } }
          if (msg.id === 1) {
            if (msg.error) { s.end(); reject(new Error(msg.error.message)); return }
            s.end(); resolve(msg.result); return
          }
          // ignore notifications (llm.events) here
        } catch { /* partial frame */ }
        nl = leftover.indexOf('\n')
      }
    })
    s.on('error', reject)
  })
}

describe('LLM Router end-to-end (daemon + mock z.ai)', { timeout: 15_000 }, () => {
  test('message.send returns text from mock LLM', async () => {
    const s = await rpc(daemon.socket, 'session.create', { cwd: '/tmp' }) as { id: string }
    const r = await rpc(daemon.socket, 'message.send', {
      sessionId: s.id,
      text: 'hi',
      model: 'GLM-5.1'
    }) as { content: string; model: string }
    expect(r.content).toBe('Hello world')
    expect(r.model).toBe('GLM-5.1')
    expect(mock.requestsReceived).toBeGreaterThanOrEqual(1)
  })

  test('llm.call streams events via llm.events notifications', async () => {
    // Open a persistent connection to receive notifications
    const events: any[] = []
    const sock = createConnection(daemon.socket)
    let leftover = ''
    await new Promise<void>(r => sock.once('connect', () => r()))

    sock.write(JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'llm.call',
      params: {
        request: {
          model: 'GLM-5.1',
          messages: [{ role: 'user', content: [{ type: 'text', text: 'go' }] }]
        }
      }
    }) + '\n')

    // Collect events for up to 5 seconds
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => { sock.end(); resolve() }, 5000)
      sock.on('data', (chunk) => {
        leftover += chunk.toString('utf8')
        let nl = leftover.indexOf('\n')
        while (nl >= 0) {
          const frame = leftover.slice(0, nl); leftover = leftover.slice(nl + 1)
          try {
            const m = JSON.parse(frame)
            if (m.method === 'llm.events') events.push(m.params.event)
            if (m.method === 'llm.events' && m.params.event?.type === 'message_stop') {
              clearTimeout(timer); sock.end(); resolve(); return
            }
          } catch { /* */ }
          nl = leftover.indexOf('\n')
        }
      })
    })

    const types = events.map((e: any) => e.type)
    expect(types.length).toBeGreaterThan(0)
    expect(types).toContain('text_delta')
  })
})
