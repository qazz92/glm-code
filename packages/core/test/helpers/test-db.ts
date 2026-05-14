import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import Database, { type Database as Db } from 'better-sqlite3'
import { openDb } from '../../src/storage/db.js'
import { runMigrations } from '../../src/storage/migrations.js'

let counter = 0

export function createTestDb(): { db: Db; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), `glm-test-${process.pid}-${counter++}-`))
  const db = openDb(join(dir, 'test.db'))
  runMigrations(db)
  return {
    db,
    cleanup: () => {
      db.close()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}
