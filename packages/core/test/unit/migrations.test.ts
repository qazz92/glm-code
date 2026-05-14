import { afterEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { openDb } from '../../src/storage/db.js'
import { runMigrations } from '../../src/storage/migrations.js'

let tmpdir: string
afterEach(() => { if (tmpdir) rmSync(tmpdir, { recursive: true, force: true }) })

describe('runMigrations', () => {
  test('applies 001_initial and bumps schema_version to 1', () => {
    tmpdir = mkdtempSync(path.join(os.tmpdir(), 'glm-mig-'))
    const db = openDb(path.join(tmpdir, 'test.db'))
    const v = runMigrations(db)
    expect(v).toBe(1)
    const cnt = db.prepare(`SELECT COUNT(*) as n FROM sqlite_master WHERE type='table' AND name='sessions'`).get() as { n: number }
    expect(cnt.n).toBe(1)
    db.close()
  })

  test('is idempotent (rerun = no-op)', () => {
    tmpdir = mkdtempSync(path.join(os.tmpdir(), 'glm-mig-'))
    const db = openDb(path.join(tmpdir, 'test.db'))
    runMigrations(db)
    const v2 = runMigrations(db)
    expect(v2).toBe(1)
    db.close()
  })

  test('writes pre_migration_v<N>.bak when pending migrations exist on an existing db', async () => {
    const { existsSync } = await import('node:fs')
    tmpdir = mkdtempSync(path.join(os.tmpdir(), 'glm-mig-bak-'))
    const file = path.join(tmpdir, 'test.db')
    const db = openDb(file)
    runMigrations(db)
    expect(existsSync(`${file}.pre_migration_v0.bak`)).toBe(true)
    db.close()
  })
})
