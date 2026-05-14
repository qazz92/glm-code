import { afterAll, afterEach, beforeEach, describe, expect, test } from 'vitest'
import { createConnection } from 'node:net'
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'
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

describe('Read → Write → Edit round-trip (integration)', () => {
  let d: Awaited<ReturnType<typeof spawnDaemonProcess>>
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(os.tmpdir(), 'glm-roundtrip-'))
    d = await spawnDaemonProcess()
  })

  afterEach(async () => {
    await d.shutdown()
    try { rmSync(tmpDir, { recursive: true, force: true }) } catch { /* best effort */ }
  })

  test('write then read returns written content', async () => {
    const file = join(tmpDir, 'test.txt')

    // Write
    const writeResult = await rpcCall(d.socket, 'tool.call', {
      name: 'write', params: { path: file, content: 'hello world\n' },
    }) as { ok: boolean; data?: { path: string; bytes: number } }
    expect(writeResult.ok).toBe(true)
    expect(writeResult.data!.path).toBe(file)
    expect(writeResult.data!.bytes).toBeGreaterThan(0)

    // Read back — data is a hashlined string, check content is present
    const readResult = await rpcCall(d.socket, 'tool.call', {
      name: 'read', params: { path: file },
    }) as { ok: boolean; data?: string }
    expect(readResult.ok).toBe(true)
    expect(readResult.data).toContain('hello world')
  })

  test('write → edit → read round-trip applies edit correctly', async () => {
    const file = join(tmpDir, 'edit-target.txt')

    // Write initial content
    await rpcCall(d.socket, 'tool.call', {
      name: 'write', params: { path: file, content: 'alpha\nbeta\ngamma\n' },
    })

    // Edit: replace line 2 (beta → BETA)
    const editResult = await rpcCall(d.socket, 'tool.call', {
      name: 'edit', params: { path: file, ops: [{ anchor: '2', kind: 'replace', payload: ['~BETA'] }] },
    }) as { ok: boolean; data?: { path: string; opsApplied: number } }
    expect(editResult.ok).toBe(true)
    // Verify no double-wrap: data should be { path, opsApplied }, not { ok: true, data: { path, opsApplied } }
    expect(editResult.data).toEqual({ path: file, opsApplied: 1 })

    // Verify via read
    const readResult = await rpcCall(d.socket, 'tool.call', {
      name: 'read', params: { path: file },
    }) as { ok: boolean; data?: string }
    expect(readResult.ok).toBe(true)
    expect(readResult.data).toContain('BETA')
    expect(readResult.data).not.toContain('beta')
  })

  test('edit returns RUNTIME_ERROR for non-existent file', async () => {
    const result = await rpcCall(d.socket, 'tool.call', {
      name: 'edit', params: { path: join(tmpDir, 'nope.txt'), ops: [{ anchor: '1', kind: 'replace', payload: ['~x'] }] },
    }) as { ok: boolean; error?: { code: string; message: string } }
    expect(result.ok).toBe(false)
    expect(result.error!.code).toBe('RUNTIME_ERROR')
    expect(result.error!.message).toContain('Failed to read')
  })

  test('edit returns RUNTIME_ERROR for invalid anchor', async () => {
    const file = join(tmpDir, 'bad-anchor.txt')
    await rpcCall(d.socket, 'tool.call', {
      name: 'write', params: { path: file, content: 'only one line\n' },
    })
    const result = await rpcCall(d.socket, 'tool.call', {
      name: 'edit', params: { path: file, ops: [{ anchor: '99', kind: 'replace', payload: ['~x'] }] },
    }) as { ok: boolean; error?: { code: string; message: string } }
    expect(result.ok).toBe(false)
    expect(result.error!.code).toBe('RUNTIME_ERROR')
    expect(result.error!.message).toContain('exceeds file length')
  })
})
