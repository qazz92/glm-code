export interface ErrorInfo {
  status?: number
  code?: string
  scope?: 'daily' | 'monthly' | 'concurrent'
  retryAfterSec?: number
  refusal?: boolean
  message?: string
}

export type ErrorAction =
  | { kind: 'retry'; maxAttempts: number; waitMs?: number; preservePartial?: boolean; reason: string }
  | { kind: 'user'; reason: string }
  | { kind: 'fail'; reason: string }
  | { kind: 'refused'; reason: string }

const NETWORK_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'ENETUNREACH', 'EPIPE'])

export function classifyError(e: ErrorInfo): ErrorAction {
  if (e.refusal) return { kind: 'refused', reason: 'safety refusal' }

  // Network-level
  if (e.code && NETWORK_CODES.has(e.code)) {
    return { kind: 'retry', maxAttempts: 3, reason: `network:${e.code}` }
  }

  // HTTP
  const s = e.status
  if (s === 429) {
    if (e.scope === 'daily' || e.scope === 'monthly') return { kind: 'user', reason: `quota:${e.scope}` }
    const waitMs = (e.retryAfterSec ?? 1) * 1000
    return { kind: 'retry', maxAttempts: 99, waitMs, reason: 'concurrent-limit' }
  }
  if (s === 503) return { kind: 'retry', maxAttempts: 3, reason: 'overloaded' }
  if (s === 502 || s === 504) return { kind: 'retry', maxAttempts: 3, reason: 'gateway' }
  if (s === 500) return { kind: 'retry', maxAttempts: 3, reason: '5xx' }
  if (s === 408) return { kind: 'retry', maxAttempts: 1, preservePartial: true, reason: 'stream-timeout' }
  if (s === 400) return { kind: 'fail', reason: '400 invalid request' }
  if (s === 401) return { kind: 'fail', reason: '401 unauthorized' }
  if (s === 403) return { kind: 'fail', reason: '403 forbidden' }

  return { kind: 'fail', reason: e.message ?? 'unknown' }
}

/**
 * P6-Fix-4: caller-side throttle. After PAUSE_AFTER_N_FAILURES consecutive
 * failures, the next wait is floored to PAUSE_FLOOR_MS.
 */
export const PAUSE_AFTER_N_FAILURES = 3
export const PAUSE_FLOOR_MS = 30_000

export function computeNextWait(input: {
  attempt: number
  consecutiveFailures: number
  baseWait: number
}): number {
  if (input.consecutiveFailures >= PAUSE_AFTER_N_FAILURES && input.attempt > PAUSE_AFTER_N_FAILURES) {
    return Math.max(input.baseWait, PAUSE_FLOOR_MS)
  }
  return input.baseWait
}
