import type { QuotaPool } from '@glm/shared'

export type Tier = 'lite' | 'pro' | 'max'

export interface PoolLimit {
  daily: number | null
  monthly: number | null
}

/**
 * Pool limits per tier × pool.
 * null means unlimited for that period.
 */
export const POOL_LIMITS: Record<Tier, Record<QuotaPool, PoolLimit>> = {
  lite: {
    coding: { daily: 50,  monthly: 500 },
    web:    { daily: 30,  monthly: 300 },
    vision: { daily: 10,  monthly: 100 },
  },
  pro: {
    coding: { daily: 200, monthly: 2000 },
    web:    { daily: 100, monthly: 1000 },
    vision: { daily: 50,  monthly: 500 },
  },
  max: {
    coding: { daily: null, monthly: null },
    web:    { daily: null, monthly: null },
    vision: { daily: null, monthly: null },
  },
}
