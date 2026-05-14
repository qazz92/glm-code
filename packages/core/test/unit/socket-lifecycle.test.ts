import { describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createSocketServer, closeSocketServer } from '../../src/daemon/socket.js'
import { createLogger } from '../../src/log.js'

let tmpdir: string

describe('socket lifecycle', () => {
  test('createSocketServer creates socket file', async () => {
    tmpdir = mkdtempSync(path.join(os.tmpdir(), 'glm-sock-'))
    const sockPath = path.join(tmpdir, 'test.sock')
    const log = createLogger('test', { level: 'silent' })
    const server = createSocketServer({
      path: sockPath,
      log,
      onConnection: () => {}
    })
    // Wait for listen callback
    await new Promise(r => setTimeout(r, 100))
    expect(existsSync(sockPath)).toBe(true)
    await closeSocketServer(server, sockPath)
    expect(existsSync(sockPath)).toBe(false)
    rmSync(tmpdir, { recursive: true, force: true })
  })

  test('closeSocketServer resolves even if already closed', async () => {
    tmpdir = mkdtempSync(path.join(os.tmpdir(), 'glm-sock2-'))
    const sockPath = path.join(tmpdir, 'test.sock')
    const log = createLogger('test', { level: 'silent' })
    const server = createSocketServer({
      path: sockPath,
      log,
      onConnection: () => {}
    })
    await new Promise(r => setTimeout(r, 100))
    await closeSocketServer(server, sockPath)
    // Closing again should not throw
    rmSync(tmpdir, { recursive: true, force: true })
  })
})
