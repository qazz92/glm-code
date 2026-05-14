import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { Database } from 'better-sqlite3'
import { openDb, runMigrations, SessionRepo } from '../../src/storage/index.js'

let tmpdir: string
let db: Database
let repo: SessionRepo

beforeEach(() => {
  tmpdir = mkdtempSync(path.join(os.tmpdir(), 'glm-srepo-'))
  db = openDb(path.join(tmpdir, 's.db'))
  runMigrations(db)
  repo = new SessionRepo(db)
})
afterEach(() => { db.close(); rmSync(tmpdir, { recursive: true, force: true }) })

describe('SessionRepo', () => {
  test('create + get round-trip', () => {
    const s = repo.create({ cwd: '/tmp/x', worktree: '/tmp/x', initialTask: 'hello' })
    const got = repo.get(s.id)
    expect(got).toBeDefined()
    expect(got!.cwd).toBe('/tmp/x')
    expect(got!.initialTask).toBe('hello')
    expect(got!.active).toBe(true)
  })

  test('list returns most recent first', () => {
    const a = repo.create({ cwd: '/a', worktree: '/a' })
    const b = repo.create({ cwd: '/b', worktree: '/b' })
    const all = repo.list({ limit: 10 })
    expect(all.map(s => s.id)).toEqual([b.id, a.id])
  })

  test('markInactive sets active=false', () => {
    const s = repo.create({ cwd: '/x', worktree: '/x' })
    repo.markInactive(s.id)
    expect(repo.get(s.id)!.active).toBe(false)
  })

  test('updateTimestamp refreshes updated_at', async () => {
    const s = repo.create({ cwd: '/x', worktree: '/x' })
    const t0 = repo.get(s.id)!.updatedAt
    await new Promise(r => setTimeout(r, 10))
    repo.touch(s.id)
    expect(repo.get(s.id)!.updatedAt > t0).toBe(true)
  })
})
