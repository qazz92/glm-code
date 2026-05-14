import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openDb, runMigrationsForDb } from '@glm/core'
import { QuotaRepo } from '../../src/quota/quota-repo.js'
import { QuotaTracker } from '../../src/quota/quota-tracker.js'
import { POOL_LIMITS } from '../../src/quota/pools.js'
import { parseRateHeaders } from '../../src/quota/rate-headers.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const QUOTA_MIG = join(HERE, '../../../core/src/storage/quota-migrations')

let tmp: string
let db: import('better-sqlite3').Database

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-quota-'))
  db = openDb(path.join(tmp, 'quota.db'))
  runMigrationsForDb(db, QUOTA_MIG)
})
afterEach(() => {
  db.close()
  rmSync(tmp, { recursive: true, force: true })
})

describe('QuotaRepo', () => {
  test('ensurePool + getPool', () => {
    const repo = new QuotaRepo(db)
    repo.ensurePool('coding', 'pro')
    const p = repo.getPool('coding')
    expect(p).toBeDefined()
    expect(p!.pool).toBe('coding')
  })

  test('recordUsage inserts rows', () => {
    const repo = new QuotaRepo(db)
    repo.ensurePool('coding', 'pro')
    repo.recordUsage('coding', 100, 50, 'GLM-5.1')
    const used = repo.getTotalUsage('coding')
    expect(used).toBe(1)
  })

  test('getUsageSince returns aggregated', () => {
    const repo = new QuotaRepo(db)
    repo.ensurePool('web', 'lite')
    repo.recordUsage('web', 10, 5)
    repo.recordUsage('web', 20, 10)
    const since = new Date(Date.now() - 60000).toISOString()
    const u = repo.getUsageSince('web', since)
    expect(u.requests).toBe(2)
    expect(u.inputTok).toBe(30)
    expect(u.outputTok).toBe(15)
  })

  test('resetPool clears budget', () => {
    const repo = new QuotaRepo(db)
    repo.ensurePool('coding', 'pro')
    repo.resetPool('coding')
    const p = repo.getPool('coding')
    expect(p!.budgetInput).toBe(0)
  })
})

describe('QuotaTracker', () => {
  test('guard returns green when under 80%', () => {
    const repo = new QuotaRepo(db)
    const tracker = new QuotaTracker(repo)
    const level = tracker.guard('coding', 'pro')
    expect(level).toBe('green')
  })

  test('guard returns red when daily limit exceeded', () => {
    const repo = new QuotaRepo(db)
    const tracker = new QuotaTracker(repo)
    // Pro coding: daily=200
    for (let i = 0; i < 201; i++) {
      repo.ensurePool('coding', 'pro')
      repo.recordUsage('coding', 1, 1)
    }
    const summary = tracker.summary('coding', 'pro')
    expect(summary.guard).toBe('red')
  })

  test('guard returns yellow at 80%+', () => {
    const repo = new QuotaRepo(db)
    const tracker = new QuotaTracker(repo)
    // Pro coding: daily=200, 80% = 160
    repo.ensurePool('coding', 'pro')
    for (let i = 0; i < 165; i++) {
      repo.recordUsage('coding', 1, 1)
    }
    const summary = tracker.summary('coding', 'pro')
    expect(summary.guard).toBe('yellow')
  })

  test('max tier is always green (null limits)', () => {
    const repo = new QuotaRepo(db)
    const tracker = new QuotaTracker(repo)
    repo.ensurePool('coding', 'max')
    repo.recordUsage('coding', 100, 100)
    const summary = tracker.summary('coding', 'max')
    expect(summary.guard).toBe('green')
  })

  test('record updates usage counters', () => {
    const repo = new QuotaRepo(db)
    const tracker = new QuotaTracker(repo)
    tracker.record('vision', 50, 25, 'GLM-4.5-Air')
    const summary = tracker.summary('vision', 'lite')
    expect(summary.used).toBeGreaterThanOrEqual(1)
  })
})

describe('parseRateHeaders', () => {
  test('parses x-ratelimit and retry-after', () => {
    const h = parseRateHeaders({
      'x-ratelimit-remaining-requests': '42',
      'x-ratelimit-limit-requests': '100',
      'x-ratelimit-remaining-tokens': '5000',
      'x-ratelimit-limit-tokens': '10000',
      'retry-after': '5',
    })
    expect(h.requestsRemaining).toBe(42)
    expect(h.requestsLimit).toBe(100)
    expect(h.tokensRemaining).toBe(5000)
    expect(h.tokensLimit).toBe(10000)
    expect(h.retryAfterMs).toBe(5000)
  })

  test('returns undefined for missing headers', () => {
    const h = parseRateHeaders({})
    expect(h.requestsRemaining).toBeUndefined()
    expect(h.retryAfterMs).toBeUndefined()
  })

  test('case-insensitive matching', () => {
    const h = parseRateHeaders({ 'X-RateLimit-Remaining-Requests': '10' })
    expect(h.requestsRemaining).toBe(10)
  })
})

describe('POOL_LIMITS', () => {
  test('lite has finite limits', () => {
    expect(POOL_LIMITS.lite.coding.daily).toBe(50)
    expect(POOL_LIMITS.lite.coding.monthly).toBe(500)
  })

  test('max has null limits (unlimited)', () => {
    expect(POOL_LIMITS.max.coding.daily).toBeNull()
    expect(POOL_LIMITS.max.coding.monthly).toBeNull()
  })
})
