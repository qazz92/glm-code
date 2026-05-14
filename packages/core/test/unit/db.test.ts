import { afterEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { openDb } from '../../src/storage/db.js'

let tmpdir: string

afterEach(() => { if (tmpdir) rmSync(tmpdir, { recursive: true, force: true }) })

describe('openDb', () => {
  test('creates file with WAL journal mode', () => {
    tmpdir = mkdtempSync(path.join(os.tmpdir(), 'glm-db-'))
    const db = openDb(path.join(tmpdir, 'test.db'))
    const mode = db.pragma('journal_mode', { simple: true })
    expect(mode).toBe('wal')
    db.close()
  })

  test('foreign_keys is on', () => {
    tmpdir = mkdtempSync(path.join(os.tmpdir(), 'glm-db-'))
    const db = openDb(path.join(tmpdir, 'test.db'))
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
    db.close()
  })
})
