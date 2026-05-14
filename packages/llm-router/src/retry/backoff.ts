export interface BackoffOpts { baseMs: number; capMs: number }

/**
 * Exponential backoff with jitter: base * 2^(attempt-1), capped, with random jitter.
 * Attempt is 1-indexed.
 */
export function backoffMs(attempt: number, opts: BackoffOpts): number {
  const exp = opts.baseMs * Math.pow(2, attempt - 1)
  const capped = Math.min(exp, opts.capMs)
  const jitter = Math.random() * (capped * 0.25)
  return Math.min(capped + jitter, opts.capMs)
}

export const DEFAULT_BACKOFF: BackoffOpts = { baseMs: 1000, capMs: 30_000 }
export const OVERLOAD_BACKOFF: BackoffOpts = { baseMs: 5000, capMs: 60_000 }
