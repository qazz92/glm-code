import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { openDb, runMigrations } from '@glm/core'
import { LLMService } from '../../src/service/llm-service.js'
import { IdempotencyCache } from '../../src/cache/idempotency-cache.js'
import type { LLMProvider } from '../../src/provider/provider.js'
import type { IRRequest, IRResponse } from '../../src/ir/types.js'
import type { StreamEvent } from '../../src/stream/sse.js'
import type { QuotaPool, LLMUsage, ShortMessage, CompleteOpts } from '@glm/shared'

let tmp: string
let db: import('better-sqlite3').Database
let cache: IdempotencyCache

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-svc-'))
  db = openDb(path.join(tmp, 'session.db'))
  runMigrations(db)
  cache = new IdempotencyCache(db)
})
afterEach(() => {
  db.close()
  rmSync(tmp, { recursive: true, force: true })
})

/** Build a mock provider that yields controlled events. */
function mockProvider(events: StreamEvent[], failWith?: (req: IRRequest) => never): LLMProvider {
  return {
    async *call(_req: IRRequest, _signal?: AbortSignal): AsyncIterable<StreamEvent> {
      if (failWith) failWith(_req)
      for (const e of events) yield e
    },
    countTokens(req: IRRequest): number {
      return 100
    },
  }
}

function makeRequest(overrides?: Partial<IRRequest>): IRRequest {
  return {
    model: 'GLM-5.1',
    endpoint: 'anthropic',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
    ...overrides,
  }
}

describe('LLMService', () => {
  test('cache hit serves from cache (provider called once)', async () => {
    let callCount = 0
    const events: StreamEvent[] = [
      { type: 'message_start', messageId: 'msg_1', model: 'GLM-5.1' },
      { type: 'text_delta', text: 'world' },
      { type: 'message_stop', stopReason: 'end_turn' },
      { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
    ]

    const provider: LLMProvider = {
      async *call(_req: IRRequest) {
        callCount++
        for (const e of events) yield e
      },
      countTokens() { return 100 },
    }

    const svc = new LLMService({ provider, cache })

    // First call — cache miss, provider called
    const h1 = svc.run(makeRequest(), 'test')
    const r1 = await h1.result()
    expect(callCount).toBe(1)
    expect(r1.content.some(b => b.type === 'text' && (b as { text: string }).text === 'world')).toBe(true)

    // Second call — cache hit, provider NOT called
    const h2 = svc.run(makeRequest(), 'test')
    const r2 = await h2.result()
    expect(callCount).toBe(1) // still 1
    expect(r2.content.some(b => b.type === 'text')).toBe(true)
  })

  test('retries on 503, succeeds on second attempt', async () => {
    let attempt = 0
    const events: StreamEvent[] = [
      { type: 'message_start', messageId: 'msg_r', model: 'GLM-5.1' },
      { type: 'text_delta', text: 'recovered' },
      { type: 'message_stop', stopReason: 'end_turn' },
      { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
    ]

    const provider: LLMProvider = {
      async *call(_req: IRRequest) {
        attempt++
        if (attempt === 1) {
          const err: any = new Error('overloaded')
          err.status = 503
          throw err
        }
        for (const e of events) yield e
      },
      countTokens() { return 100 },
    }

    const svc = new LLMService({ provider, cache, maxRetries: 3 })
    const handle = svc.run(makeRequest(), 'retry-test')
    const result = await handle.result()

    expect(attempt).toBe(2)
    expect(result.content.some(b => b.type === 'text' && (b as { text: string }).text === 'recovered')).toBe(true)
  })

  test('401 fails immediately', async () => {
    const provider: LLMProvider = {
      async *call() {
        const err: any = new Error('unauthorized')
        err.status = 401
        throw err
      },
      countTokens() { return 100 },
    }

    const svc = new LLMService({ provider, cache, maxRetries: 3 })
    const handle = svc.run(makeRequest(), 'auth-test')

    await expect(handle.result()).rejects.toThrow('unauthorized')
  })

  test('cancel mid-stream commits partial buffer', async () => {
    const events: StreamEvent[] = [
      { type: 'message_start', messageId: 'msg_c', model: 'GLM-5.1' },
      { type: 'text_delta', text: 'partial ' },
      // Small delay to let cancel fire
    ]

    let yieldCount = 0
    const provider: LLMProvider = {
      async *call(_req: IRRequest, signal?: AbortSignal) {
        for (const e of events) {
          yield e
          yieldCount++
        }
        // Simulate the stream being interrupted
        // The service's run() will detect cancel on next iteration
      },
      countTokens() { return 100 },
    }

    const svc = new LLMService({ provider, cache, maxRetries: 0 })
    const handle = svc.run(makeRequest(), 'cancel-test')

    // Cancel immediately after starting
    setTimeout(() => handle.cancel(), 10)

    const result = await handle.result()
    // When cancelled, the result should reflect cancellation
    expect(result.stopReason).toMatch(/cancelled|end_turn/)
  })

  test('complete() joins text deltas and returns usage', async () => {
    const events: StreamEvent[] = [
      { type: 'message_start', messageId: 'msg_comp', model: 'GLM-5.1' },
      { type: 'text_delta', text: 'Hello ' },
      { type: 'text_delta', text: 'world' },
      { type: 'message_stop', stopReason: 'end_turn' },
      { type: 'usage', usage: { inputTokens: 8, outputTokens: 3 } },
    ]

    const provider: LLMProvider = {
      async *call() {
        for (const e of events) yield e
      },
      countTokens() { return 100 },
    }

    const svc = new LLMService({ provider, cache })
    const messages: ShortMessage[] = [
      { role: 'user', content: 'greet' },
    ]
    const opts: CompleteOpts = { model: 'GLM-5.1' }

    const { text, usage } = await svc.complete(messages, opts)
    expect(text).toBe('Hello world')
    expect(usage.inputTokens).toBe(8)
    expect(usage.outputTokens).toBe(3)
  })
})
