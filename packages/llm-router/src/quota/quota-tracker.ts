import type { QuotaPool } from '@glm/shared'
import type { QuotaRepo } from './quota-repo.js'
import type { Tier } from './pools.js'
import { POOL_LIMITS } from './pools.js'

export type GuardLevel = 'green' | 'yellow' | 'red'

export interface QuotaSummary {
  pool: QuotaPool
  tier: Tier
  used: number
  dailyLimit: number | null
  guard: GuardLevel
}

/**
 * Tracks quota consumption across 3 pools (coding/web/vision).
 * Guard logic uses request counts relative to daily limits:
 *   green  — < 80% of daily limit
 *   yellow — 80–99% of daily limit
 *   red    — ≥ 100% of daily limit (or unlimited tier: always green)
 */
export class QuotaTracker {
  constructor(private repo: QuotaRepo) {}

  /** Record a single usage event. */
  record(pool: QuotaPool, inputTok: number, outputTok: number, model?: string, tool?: string): void {
    this.repo.recordUsage(pool, inputTok, outputTok, model, tool)
  }

  /** Get current summary for a pool. */
  summary(pool: QuotaPool, tier: Tier): QuotaSummary {
    const limits = POOL_LIMITS[tier][pool]
    this.repo.ensurePool(pool, tier)

    const used = this.repo.getTotalUsage(pool)
    const guard = this.computeGuard(used, limits.daily)

    return {
      pool,
      tier,
      used,
      dailyLimit: limits.daily,
      guard,
    }
  }

  /** Check if a request can proceed; returns the guard level. */
  guard(pool: QuotaPool, tier: Tier): GuardLevel {
    return this.summary(pool, tier).guard
  }

  private computeGuard(used: number, dailyLimit: number | null): GuardLevel {
    if (dailyLimit === null || dailyLimit === 0) return 'green'
    if (used >= dailyLimit) return 'red'
    const ratio = used / dailyLimit
    if (ratio >= 0.8) return 'yellow'
    return 'green'
  }
}
