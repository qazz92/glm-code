import type { Database } from 'better-sqlite3'
import { ulid, type SessionId } from '@glm/shared'

export interface SessionRow {
  id: SessionId
  createdAt: string
  updatedAt: string
  cwd: string
  worktree: string
  initialTask: string | null
  active: boolean
}

export interface CreateInput {
  cwd: string
  worktree: string
  initialTask?: string
}

export class SessionRepo {
  constructor(private db: Database) {}

  create(input: CreateInput): SessionRow {
    const id = ulid()
    const now = new Date().toISOString()
    this.db.prepare(`
      INSERT INTO sessions(id, created_at, updated_at, cwd, worktree, initial_task, active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(id, now, now, input.cwd, input.worktree, input.initialTask ?? null)
    return { id, createdAt: now, updatedAt: now, cwd: input.cwd, worktree: input.worktree,
             initialTask: input.initialTask ?? null, active: true }
  }

  get(id: SessionId): SessionRow | undefined {
    const r = this.db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(id) as Record<string, unknown> | undefined
    if (!r) return undefined
    return rowToSession(r)
  }

  list(opts: { limit?: number; activeOnly?: boolean } = {}): SessionRow[] {
    const where = opts.activeOnly ? 'WHERE active = 1' : ''
    const limit = opts.limit ?? 50
    const rows = this.db.prepare(`SELECT * FROM sessions ${where} ORDER BY updated_at DESC LIMIT ?`).all(limit) as Record<string, unknown>[]
    return rows.map(rowToSession)
  }

  touch(id: SessionId): void {
    this.db.prepare(`UPDATE sessions SET updated_at = ? WHERE id = ?`).run(new Date().toISOString(), id)
  }

  markInactive(id: SessionId): void {
    this.db.prepare(`UPDATE sessions SET active = 0, updated_at = ? WHERE id = ?`).run(new Date().toISOString(), id)
  }
}

function rowToSession(r: Record<string, unknown>): SessionRow {
  return {
    id: r.id as string,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    cwd: r.cwd as string,
    worktree: r.worktree as string,
    initialTask: (r.initial_task as string | null) ?? null,
    active: (r.active as number) === 1
  }
}
