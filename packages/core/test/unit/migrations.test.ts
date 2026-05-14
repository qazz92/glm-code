import { afterEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { openDb } from '../../src/storage/db.js'
import { runMigrations, runMigrationsForDb } from '../../src/storage/migrations.js'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

let tmpdir: string
afterEach(() => { if (tmpdir) rmSync(tmpdir, { recursive: true, force: true }) })

describe('runMigrations', () => {
  test('applies 001_initial and bumps schema_version to 1', () => {
    tmpdir = mkdtempSync(path.join(os.tmpdir(), 'glm-mig-'))
    const db = openDb(path.join(tmpdir, 'test.db'))
    const v = runMigrations(db)
    expect(v).toBeGreaterThanOrEqual(1)
    const cnt = db.prepare(`SELECT COUNT(*) as n FROM sqlite_master WHERE type='table' AND name='sessions'`).get() as { n: number }
    expect(cnt.n).toBe(1)
    db.close()
  })

  test('is idempotent (rerun = no-op)', () => {
    tmpdir = mkdtempSync(path.join(os.tmpdir(), 'glm-mig-'))
    const db = openDb(path.join(tmpdir, 'test.db'))
    runMigrations(db)
    const v2 = runMigrations(db)
    expect(v2).toBeGreaterThanOrEqual(1)
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

describe('runMigrations 003', () => {
  test('creates llm_cache table via migration 003', () => {
    tmpdir = mkdtempSync(path.join(os.tmpdir(), 'glm-mig003-'))
    const db = openDb(path.join(tmpdir, 'test.db'))
    const v = runMigrations(db)
    expect(v).toBeGreaterThanOrEqual(3)
    const tables = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
    ).all() as { name: string }[]
    const names = tables.map(t => t.name)
    expect(names).toContain('llm_cache')
    db.close()
  })

  test('llm_cache has expected columns', () => {
    tmpdir = mkdtempSync(path.join(os.tmpdir(), 'glm-mig003-'))
    const db = openDb(path.join(tmpdir, 'test.db'))
    runMigrations(db)
    const cols = db.pragma('table_info(llm_cache)') as { name: string }[]
    const colNames = cols.map(c => c.name)
    expect(colNames).toContain('key')
    expect(colNames).toContain('model')
    expect(colNames).toContain('endpoint')
    expect(colNames).toContain('request_json')
    expect(colNames).toContain('response_json')
    expect(colNames).toContain('usage_input')
    expect(colNames).toContain('usage_output')
    expect(colNames).toContain('created_at')
    expect(colNames).toContain('last_hit_at')
    expect(colNames).toContain('hit_count')
    db.close()
  })
})

describe('runMigrationsForDb quota-migrations', () => {
  const HERE = dirname(fileURLToPath(import.meta.url))

  test('creates quota_usage and quota_pools tables', () => {
    tmpdir = mkdtempSync(path.join(os.tmpdir(), 'glm-quota-'))
    const db = openDb(path.join(tmpdir, 'quota.db'))
    const quotaDir = join(HERE, '..', '..', 'src', 'storage', 'quota-migrations')
    const v = runMigrationsForDb(db, quotaDir)
    expect(v).toBeGreaterThanOrEqual(1)
    const tables = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
    ).all() as { name: string }[]
    const names = tables.map(t => t.name)
    expect(names).toContain('quota_usage')
    expect(names).toContain('quota_pools')
    db.close()
  })

  test('quota_pools has expected columns', () => {
    tmpdir = mkdtempSync(path.join(os.tmpdir(), 'glm-quota-'))
    const db = openDb(path.join(tmpdir, 'quota.db'))
    const quotaDir = join(HERE, '..', '..', 'src', 'storage', 'quota-migrations')
    runMigrationsForDb(db, quotaDir)
    const cols = db.pragma('table_info(quota_pools)') as { name: string }[]
    const colNames = cols.map(c => c.name)
    expect(colNames).toContain('pool')
    expect(colNames).toContain('budget_input')
    expect(colNames).toContain('budget_output')
    expect(colNames).toContain('window_start')
    expect(colNames).toContain('window_end')
    db.close()
  })
})
