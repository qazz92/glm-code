import { afterAll, afterEach, beforeEach, describe, expect, test } from 'vitest'
import { createConnection } from 'node:net'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
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
        const msg = JSON.parse(frame) as { error?: { message: string; code: number }; result?: unknown }
        if (msg.error) reject(new Error(`${msg.error.code}: ${msg.error.message}`))
        else resolve(msg.result)
      } finally { s.end() }
    })
    s.on('error', reject)
  })
}

describe('tool RPC (integration)', () => {
  let d: Awaited<ReturnType<typeof spawnDaemonProcess>>
  let tmpDir: string

  beforeEach(async () => {
    d = await spawnDaemonProcess()
  })

  afterEach(async () => {
    await d.shutdown()
    if (tmpDir) {
      try { rmSync(tmpDir, { recursive: true, force: true }) } catch { /* best effort */ }
    }
  })

  test('tool.list returns tools', async () => {
    const result = await rpcCall(d.socket, 'tool.list') as Array<{ name: string }>
    expect(result.length).toBeGreaterThanOrEqual(8)
    const names = result.map(t => t.name)
    expect(names).toContain('bash')
    expect(names).toContain('read')
    expect(names).toContain('write')
    expect(names).toContain('edit')
    expect(names).toContain('grep')
    expect(names).toContain('glob')
  })

  test('tool.call bash returns exit code', async () => {
    const result = await rpcCall(d.socket, 'tool.call', {
      name: 'bash',
      params: { command: 'echo integration-test' },
    }) as { ok: boolean; data?: { exitCode: number; stdout: string } }
    expect(result.ok).toBe(true)
    expect(result.data!.stdout.trim()).toBe('integration-test')
    expect(result.data!.exitCode).toBe(0)
  })

  test('tool.call unknown tool returns NOT_FOUND', async () => {
    const result = await rpcCall(d.socket, 'tool.call', {
      name: 'nonexistent_tool',
      params: {},
    }) as { ok: boolean; error?: { code: string } }
    expect(result.ok).toBe(false)
    expect(result.error!.code).toBe('NOT_FOUND')
  })
})
