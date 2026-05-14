/**
 * TodoWrite tool — replaces all todos for a session.
 */

import { z } from 'zod'
import type { ToolHandler } from '../registry.js'
import { toolOk, toolErr } from '../errors.js'
import type { ToolContext } from '../context.js'
import { TodoRepo } from './repo.js'
import type { Database } from 'better-sqlite3'

const TodoItemSchema = z.object({
  id: z.string().optional(),
  content: z.string().min(1),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional(),
  activeForm: z.string().optional(),
  position: z.number().int().min(0),
})

const TodoWriteSchema = z.object({
  sessionId: z.string().min(1),
  todos: z.array(TodoItemSchema).min(1),
})

function getDb(ctx: ToolContext): Database {
  const db = (ctx as unknown as { settings?: { _db?: Database } }).settings?._db
  if (!db) throw new Error('TodoWrite requires a database connection')
  return db
}

export const todoWriteTool: ToolHandler = {
  name: 'todo_write',
  description: 'Replace all todos for a session with the given list',
  schema: TodoWriteSchema,
  async run(params, ctx) {
    const { sessionId, todos } = TodoWriteSchema.parse(params)
    const db = getDb(ctx)
    const repo = new TodoRepo(db)
    const result = repo.replaceAll(sessionId, todos)
    return toolOk(result)
  },
}
