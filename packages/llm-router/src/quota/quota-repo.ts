import type { Database } from 'better-sqlite3'
import type { QuotaPool } from '@glm/shared'
import type { Tier } from './pools.js'
import { POOL_LIMITS } from './pools.js'

export interface UsageRow {
  pool: QuotaPool
  requests: number
  inputTok: number
  outputTok: number
}

export interface PoolRow {
  pool: QuotaPool
  budgetInput: number
  budgetOutput: number
  windowStart: string
  windowEnd: string
}

/**
 * QuotaRepo — CRUD over the quota_usage and quota_pools tables.
 *
 * The actual migration schema (001_quota.sql) is:
 *   quota_usage(id, pool, model, input_tokens, output_tokens, ts)
 *   quota_pools(pool PK, budget_input, budget_output, window_start, window_end)
 */
export class QuotaRepo {
  constructor(private db: Database) {}

  /** Ensure pool row exists with default budget for the given tier. */
  ensurePool(pool: QuotaPool, tier: Tier): void {
    const limits = POOL_LIMITS[tier][pool]
    const now = new Date().toISOString()
    const dayEnd = new Date(Date.now() + 86400000).toISOString()
    this.db.prepare(`
      INSERT INTO quota_pools (pool, budget_input, budget_output, window_start, window_end)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(pool) DO UPDATE SET
        budget_input = excluded.budget_input,
        budget_output = excluded.budget_output,
        window_end = excluded.window_end
    `).run(
      pool,
      limits.daily ?? 0,
      limits.monthly ?? 0,
      now,
      dayEnd,
    )
  }

  /** Record a usage event. */
  recordUsage(pool: QuotaPool, inputTok: number, outputTok: number, model?: string, tool?: string): void {
    const now = new Date().toISOString()
    this.db.prepare(`
      INSERT INTO quota_usage (ts, pool, model, input_tokens, output_tokens)
      VALUES (?, ?, ?, ?, ?)
    `).run(now, pool, model ?? 'unknown', inputTok, outputTok)
  }

  /** Get current pool state. */
  getPool(pool: QuotaPool): PoolRow | undefined {
    const row = this.db.prepare(`SELECT * FROM quota_pools WHERE pool = ?`).get(pool) as Record<string, unknown> | undefined
    if (!row) return undefined
    return {
      pool: row.pool as QuotaPool,
      budgetInput: row.budget_input as number,
      budgetOutput: row.budget_output as number,
      windowStart: row.window_start as string,
      windowEnd: row.window_end as string,
    }
  }

  /** Get aggregated usage for a pool within a time window. */
  getUsageSince(pool: QuotaPool, since: string): UsageRow {
    const row = this.db.prepare(`
      SELECT COUNT(*) as n,
             COALESCE(SUM(input_tokens), 0) as in_tok,
             COALESCE(SUM(output_tokens), 0) as out_tok
      FROM quota_usage WHERE pool = ? AND ts >= ?
    `).get(pool, since) as { n: number; in_tok: number; out_tok: number }
    return { pool, requests: row.n, inputTok: row.in_tok, outputTok: row.out_tok }
  }

  /** Get total usage count for a pool (all time). */
  getTotalUsage(pool: QuotaPool): number {
    const row = this.db.prepare(
      `SELECT COUNT(*) as n FROM quota_usage WHERE pool = ?`
    ).get(pool) as { n: number }
    return row.n
  }

  /** Reset a pool's window. */
  resetPool(pool: QuotaPool): void {
    const now = new Date().toISOString()
    const dayEnd = new Date(Date.now() + 86400000).toISOString()
    this.db.prepare(`
      UPDATE quota_pools SET budget_input = 0, budget_output = 0, window_start = ?, window_end = ?
      WHERE pool = ?
    `).run(now, dayEnd, pool)
  }
}
