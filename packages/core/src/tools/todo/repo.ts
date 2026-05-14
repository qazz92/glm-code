import type { Database } from 'better-sqlite3'
import { ulid } from '@glm/shared'

export interface TodoRow {
  id: string
  sessionId: string
  content: string
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  activeForm: string | null
  position: number
  createdAt: number
  updatedAt: number
}

export interface TodoInput {
  id?: string
  content: string
  status?: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  activeForm?: string
  position: number
}

function rowToTodo(r: Record<string, unknown>): TodoRow {
  return {
    id: r.id as string,
    sessionId: r.session_id as string,
    content: r.content as string,
    status: r.status as TodoRow['status'],
    activeForm: (r.active_form as string | null) ?? null,
    position: r.position as number,
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number,
  }
}

export class TodoRepo {
  constructor(private db: Database) {}

  replaceAll(sessionId: string, items: TodoInput[]): TodoRow[] {
    const now = Date.now()
    const deleteStmt = this.db.prepare('DELETE FROM todos WHERE session_id = ?')
    const insertStmt = this.db.prepare(
      `INSERT INTO todos(id, session_id, content, status, active_form, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )

    const txn = this.db.transaction(() => {
      deleteStmt.run(sessionId)
      const rows: TodoRow[] = []
      for (const item of items) {
        const id = item.id ?? ulid()
        const status = item.status ?? 'pending'
        insertStmt.run(id, sessionId, item.content, status, item.activeForm ?? null, item.position, now, now)
        rows.push({
          id,
          sessionId,
          content: item.content,
          status,
          activeForm: item.activeForm ?? null,
          position: item.position,
          createdAt: now,
          updatedAt: now,
        })
      }
      return rows
    })

    return txn()
  }

  listBySession(sessionId: string): TodoRow[] {
    const rows = this.db.prepare(
      'SELECT * FROM todos WHERE session_id = ? ORDER BY position ASC'
    ).all(sessionId) as Record<string, unknown>[]
    return rows.map(rowToTodo)
  }

  updateStatus(id: string, status: TodoRow['status']): void {
    this.db.prepare(
      'UPDATE todos SET status = ?, updated_at = ? WHERE id = ?'
    ).run(status, Date.now(), id)
  }
}
