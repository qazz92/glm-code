import type { LLMUsage } from '@glm/shared'

export interface RateHeaders {
  requestsRemaining?: number
  requestsLimit?: number
  tokensRemaining?: number
  tokensLimit?: number
  retryAfterMs?: number
}

/**
 * Parse X-RateLimit-* and Retry-After headers from an HTTP response.
 * Case-insensitive header matching.
 */
export function parseRateHeaders(headers: Record<string, string | string[] | undefined>): RateHeaders {
  const get = (name: string): string | undefined => {
    const lk = name.toLowerCase()
    for (const [k, v] of Object.entries(headers)) {
      if (k.toLowerCase() === lk) return Array.isArray(v) ? v[0] : v
    }
    return undefined
  }

  const retryAfter = get('retry-after')
  let retryAfterMs: number | undefined
  if (retryAfter !== undefined) {
    const n = Number(retryAfter)
    if (Number.isFinite(n)) {
      // If > 1000 treat as seconds, otherwise as ms — HTTP spec says seconds
      retryAfterMs = n > 1000 ? n : n * 1000
    }
  }

  return {
    requestsRemaining: toNumber(get('x-ratelimit-remaining-requests')),
    requestsLimit:     toNumber(get('x-ratelimit-limit-requests')),
    tokensRemaining:   toNumber(get('x-ratelimit-remaining-tokens')),
    tokensLimit:       toNumber(get('x-ratelimit-limit-tokens')),
    retryAfterMs,
  }
}

function toNumber(v: string | undefined): number | undefined {
  if (v === undefined) return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}
