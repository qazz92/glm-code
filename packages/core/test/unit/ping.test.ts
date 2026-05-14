import { describe, expect, test } from 'vitest'
import { pingHandler } from '../../src/rpc/methods/ping.js'

describe('pingHandler', () => {
  test('returns pong with timestamp', async () => {
    const r = await pingHandler({}, {} as any) as any
    expect(r.pong).toBe(true)
    expect(r.ts).toBeTruthy()
    expect(() => new Date(r.ts)).not.toThrow()
  })
})
