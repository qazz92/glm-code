import { describe, expect, test } from 'vitest'
import { classifyError, computeNextWait } from '../../src/retry/policy.js'
import { backoffMs } from '../../src/retry/backoff.js'

describe('classifyError', () => {
  test('5xx & ECONNRESET → retry 3', () => {
    expect(classifyError({ status: 503 }).kind).toBe('retry')
    expect(classifyError({ status: 502 }).kind).toBe('retry')
    expect(classifyError({ code: 'ECONNRESET' }).kind).toBe('retry')
  })

  test('429 with retry-after → wait & retry', () => {
    const r = classifyError({ status: 429, retryAfterSec: 5 })
    expect(r.kind).toBe('retry')
    if (r.kind === 'retry') expect(r.waitMs).toBeGreaterThanOrEqual(5000)
  })

  test('429 daily quota → user', () => {
    expect(classifyError({ status: 429, scope: 'daily' }).kind).toBe('user')
  })

  test('400 / 401 / 403 → fail', () => {
    expect(classifyError({ status: 400 }).kind).toBe('fail')
    expect(classifyError({ status: 401 }).kind).toBe('fail')
    expect(classifyError({ status: 403 }).kind).toBe('fail')
  })

  test('408 stream → retry with preservePartial', () => {
    const r = classifyError({ status: 408 })
    expect(r.kind).toBe('retry')
    if (r.kind === 'retry') {
      expect(r.maxAttempts).toBe(1)
      expect(r.preservePartial).toBe(true)
    }
  })

  test('safety refusal → refused', () => {
    expect(classifyError({ status: 200, refusal: true }).kind).toBe('refused')
  })
})

describe('backoffMs', () => {
  test('exponential growth with jitter, capped', () => {
    const a = backoffMs(1, { baseMs: 1000, capMs: 30_000 })
    const b = backoffMs(2, { baseMs: 1000, capMs: 30_000 })
    const c = backoffMs(8, { baseMs: 1000, capMs: 30_000 })
    expect(a).toBeGreaterThanOrEqual(1000); expect(a).toBeLessThan(2000)
    expect(b).toBeGreaterThanOrEqual(2000); expect(b).toBeLessThan(4000)
    expect(c).toBeLessThanOrEqual(30_000)
  })
})

// P6-Fix-4 — pause-after-N-consecutive-failures
describe('pauseAfterN (P6-Fix-4)', () => {
  test('after 3 consecutive failures the next wait is at least 30s', () => {
    expect(computeNextWait({ attempt: 1, consecutiveFailures: 1, baseWait: 100 })).toBe(100)
    expect(computeNextWait({ attempt: 2, consecutiveFailures: 2, baseWait: 200 })).toBe(200)
    expect(computeNextWait({ attempt: 3, consecutiveFailures: 3, baseWait: 400 })).toBe(400)
    // 4th attempt with 3 prior failures still standing — floor at 30s
    expect(computeNextWait({ attempt: 4, consecutiveFailures: 3, baseWait: 800 })).toBeGreaterThanOrEqual(30_000)
    expect(computeNextWait({ attempt: 5, consecutiveFailures: 4, baseWait: 800 })).toBeGreaterThanOrEqual(30_000)
  })

  test('counter resets after a successful event', () => {
    expect(computeNextWait({ attempt: 5, consecutiveFailures: 0, baseWait: 800 })).toBe(800)
  })
})
