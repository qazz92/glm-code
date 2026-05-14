import { readdirSync, readFileSync, copyFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Database } from 'better-sqlite3'

const HERE = dirname(fileURLToPath(import.meta.url))

function currentSchemaVersion(db: Database): number {
  db.exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`)
  return Number(
    (db.prepare(`SELECT value FROM meta WHERE key='schema_version'`).get() as { value?: string } | undefined)?.value
    ?? '0'
  )
}

export function runMigrationsForDb(db: Database, dir: string): number {
  const cur = currentSchemaVersion(db)
  const files = readdirSync(dir).filter(f => f.endsWith('.sql')).sort()
  const pending = files.filter(f => {
    const n = Number(f.split('_')[0])
    return !Number.isNaN(n) && n > cur
  })

  if (pending.length > 0) {
    const dbFile = db.name
    if (dbFile && existsSync(dbFile)) {
      const bak = `${dbFile}.pre_migration_v${cur}.bak`
      if (!existsSync(bak)) copyFileSync(dbFile, bak)
    }
  }

  let applied = cur
  for (const f of pending) {
    const n = Number(f.split('_')[0])
    const sql = readFileSync(join(dir, f), 'utf8')
    db.exec('BEGIN')
    try {
      db.exec(sql)
      db.prepare(`INSERT OR REPLACE INTO meta(key,value) VALUES ('schema_version', ?)`).run(String(n))
      db.exec('COMMIT')
      applied = n
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
  }
  return applied
}
export function runMigrations(db: Database): number {
  return runMigrationsForDb(db, join(HERE, 'migrations'))
}

export function runQuotaMigrations(db: Database): number {
  return runMigrationsForDb(db, join(HERE, 'quota-migrations'))
}
