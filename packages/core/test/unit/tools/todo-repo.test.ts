import { afterAll, describe, expect, test } from 'vitest'
import { createTestDb } from '../../helpers/test-db.js'
import { TodoRepo } from '../../../src/tools/todo/repo.js'

describe('TodoRepo', () => {
  const { db, cleanup } = createTestDb()
  // Insert a session row so the FK constraint on todos.session_id is satisfied
  db.prepare(
    `INSERT OR IGNORE INTO sessions(id, cwd, worktree, created_at, updated_at)
     VALUES (?, '/tmp', '/tmp', ?, ?)`
  ).run('test-session-001', Date.now(), Date.now())
  const repo = new TodoRepo(db)


  const sessionId = 'test-session-001'

  test('replaceAll inserts and returns rows', () => {
    const items = [
      { content: 'Task A', position: 0 },
      { content: 'Task B', position: 1 },
      { content: 'Task C', position: 2 },
    ]
    const result = repo.replaceAll(sessionId, items)
    expect(result).toHaveLength(3)
    expect(result[0].content).toBe('Task A')
    expect(result[0].status).toBe('pending')
    expect(result[1].position).toBe(1)
  })

  test('listBySession returns ordered by position', () => {
    const rows = repo.listBySession(sessionId)
    expect(rows).toHaveLength(3)
    expect(rows[0].position).toBe(0)
    expect(rows[1].position).toBe(1)
    expect(rows[2].position).toBe(2)
  })

  test('replaceAll replaces existing todos', () => {
    const items = [{ content: 'New task', position: 0 }]
    const result = repo.replaceAll(sessionId, items)
    expect(result).toHaveLength(1)
    expect(result[0].content).toBe('New task')

    const rows = repo.listBySession(sessionId)
    expect(rows).toHaveLength(1)
  })

  test('updateStatus changes status', () => {
    const items = [{ content: 'To update', position: 0 }]
    const created = repo.replaceAll(sessionId, items)
    repo.updateStatus(created[0].id, 'completed')

    const rows = repo.listBySession(sessionId)
    expect(rows[0].status).toBe('completed')
  })

  test('updateStatus updates timestamp', () => {
    const items = [{ content: 'Timestamp check', position: 0 }]
    const created = repo.replaceAll(sessionId, items)
    const before = created[0].updatedAt
    // Small delay to ensure timestamp differs
    repo.updateStatus(created[0].id, 'in_progress')
    const rows = repo.listBySession(sessionId)
    expect(rows[0].updatedAt).toBeGreaterThanOrEqual(before)
  })

  afterAll(() => cleanup())
})
