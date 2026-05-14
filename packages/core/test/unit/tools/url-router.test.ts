import { describe, expect, test } from 'vitest'
import { makeUrlRouter } from '../../../src/tools/read/url-router.js'
import { toolErr } from '../../../src/tools/errors.js'

describe('UrlRouter', () => {
  function router() {
    const r = makeUrlRouter()
    // Register a test handler that just returns the path
    r.register('file', async (parsed) => ({ ok: true as const, data: `file:${parsed.path}` }))
    r.register('echo', async (parsed) => ({ ok: true as const, data: `echo:${parsed.path}` }))
    return r
  }

  test('parse detects scheme:// prefix', () => {
    const r = router()
    const parsed = r.parse('echo://hello/world')
    expect(parsed.scheme).toBe('echo')
    expect(parsed.path).toBe('hello/world')
    expect(parsed.selector).toBeNull()
  })

  test('parse defaults to file scheme', () => {
    const r = router()
    const parsed = r.parse('some/path.txt')
    expect(parsed.scheme).toBe('file')
    expect(parsed.path).toBe('some/path.txt')
  })

  test('parse strips :selector', () => {
    const r = router()
    const parsed = r.parse('echo://data:42')
    expect(parsed.scheme).toBe('echo')
    expect(parsed.path).toBe('data')
    expect(parsed.selector).toEqual({ type: 'single', line: 42 })
  })

  test('dispatch calls registered handler', async () => {
    const r = router()
    const result = await r.dispatch('echo://test')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data).toBe('echo:test')
  })

  test('dispatch returns error for unknown scheme', async () => {
    const r = router()
    const result = await r.dispatch('unknown://test')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND')
  })

  test('read applies selector to content', async () => {
    const r = makeUrlRouter()
    r.register('multiline', async () => ({
      ok: true as const,
      data: 'line1\nline2\nline3\nline4\nline5',
    }))
    const result = await r.read('multiline://x:2-4')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data).toBe('line2\nline3\nline4')
  })
})
