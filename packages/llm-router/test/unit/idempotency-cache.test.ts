import { afterEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { openDb, runMigrations } from '@glm/core'
import { IdempotencyCache } from '../../src/cache/idempotency-cache.js'
import type { IRRequest, IRResponse } from '../../src/ir/types.js'

let tmpdir: string
afterEach(() => { if (tmpdir) rmSync(tmpdir, { recursive: true, force: true }) })

function makeCache(): { cache: IdempotencyCache; close: () => void } {
  tmpdir = mkdtempSync(path.join(os.tmpdir(), 'glm-cache-'))
  const db = openDb(path.join(tmpdir, 'test.db'))
  runMigrations(db)
  return { cache: new IdempotencyCache(db), close: () => db.close() }
}

const sampleReq: IRRequest = {
  model: 'GLM-5.1',
  endpoint: 'anthropic',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
}

const sampleRes: IRResponse = {
  model: 'GLM-5.1',
  content: [{ type: 'text', text: 'hi' }],
  usage: { inputTokens: 10, outputTokens: 5 },
}

describe('IdempotencyCache', () => {
  test('put then get returns the cached response', () => {
    const { cache, close } = makeCache()
    cache.put('complete', sampleReq, sampleRes)
    const hit = cache.get('complete', sampleReq)
    expect(hit).not.toBeNull()
    expect(hit!.content[0]).toEqual({ type: 'text', text: 'hi' })
    expect(hit!.usage.inputTokens).toBe(10)
    close()
  })

  test('get on empty cache returns null and tracks stats', () => {
    const { cache, close } = makeCache()
    const hit = cache.get('complete', sampleReq)
    expect(hit).toBeNull()
    const s = cache.stats()
    expect(s.misses).toBe(1)
    expect(s.hits).toBe(0)
    expect(s.entries).toBe(0)
    close()
  })

  test('clear removes all entries and resets stats', () => {
    const { cache, close } = makeCache()
    cache.put('complete', sampleReq, sampleRes)
    expect(cache.stats().entries).toBe(1)
    cache.clear()
    expect(cache.stats().entries).toBe(0)
    expect(cache.stats().hits).toBe(0)
    expect(cache.stats().misses).toBe(0)
    close()
  })
})
