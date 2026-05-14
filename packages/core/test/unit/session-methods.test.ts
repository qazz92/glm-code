import { describe, expect, test, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { Database } from 'better-sqlite3'
import { openDb, runMigrations } from '../../src/storage/index.js'
import { SessionRepo } from '../../src/storage/session-repo.js'
import { makeSessionHandlers } from '../../src/rpc/methods/session.js'

let tmpdir: string
let db: Database
let handlers: Record<string, Function>

beforeEach(() => {
  tmpdir = mkdtempSync(path.join(os.tmpdir(), 'glm-sess-'))
  db = openDb(path.join(tmpdir, 's.db'))
  runMigrations(db)
  handlers = makeSessionHandlers(new SessionRepo(db))
})
afterEach(() => { db.close(); rmSync(tmpdir, { recursive: true, force: true }) })

describe('session RPC methods', () => {
  test('session.create returns a session with all fields', async () => {
    const s = await handlers['session.create']({ cwd: '/x', worktree: '/y', initialTask: 'test' }) as any
    expect(s.cwd).toBe('/x')
    expect(s.worktree).toBe('/y')
    expect(s.initialTask).toBe('test')
    expect(s.active).toBe(true)
    expect(s.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
  })

  test('session.create defaults worktree to cwd', async () => {
    const s = await handlers['session.create']({ cwd: '/abc' }) as any
    expect(s.worktree).toBe('/abc')
  })

  test('session.create validates params', async () => {
    await expect(handlers['session.create']({})).rejects.toMatchObject({ code: -32602 })
  })

  test('session.get returns the created session', async () => {
    const created = await handlers['session.create']({ cwd: '/x', worktree: '/x' }) as any
    const got = await handlers['session.get']({ sessionId: created.id }) as any
    expect(got.id).toBe(created.id)
    expect(got.cwd).toBe('/x')
  })

  test('session.get validates params', async () => {
    await expect(handlers['session.get']({})).rejects.toMatchObject({ code: -32602 })
  })

  test('session.list returns sessions', async () => {
    await handlers['session.create']({ cwd: '/a', worktree: '/a' })
    await handlers['session.create']({ cwd: '/b', worktree: '/b' })
    const list = await handlers['session.list']({ limit: 10 }) as any[]
    expect(list.length).toBe(2)
  })

  test('session.list with activeOnly', async () => {
    const s = await handlers['session.create']({ cwd: '/x', worktree: '/x' }) as any
    await handlers['session.markInactive']({ sessionId: s.id })
    const list = await handlers['session.list']({ activeOnly: true }) as any[]
    expect(list.length).toBe(0)
  })

  test('session.touch updates timestamp', async () => {
    const s = await handlers['session.create']({ cwd: '/x', worktree: '/x' }) as any
    const result = await handlers['session.touch']({ sessionId: s.id })
    expect(result).toEqual({ ok: true })
  })

  test('session.markInactive sets active=false', async () => {
    const s = await handlers['session.create']({ cwd: '/x', worktree: '/x' }) as any
    await handlers['session.markInactive']({ sessionId: s.id })
    const got = await handlers['session.get']({ sessionId: s.id }) as any
    expect(got.active).toBe(false)
  })
})
