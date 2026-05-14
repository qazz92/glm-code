import { describe, expect, test } from 'vitest'
import { canonicalize, stableHash } from '../../src/ir/hash.js'

describe('canonicalize', () => {
  test('sorts object keys deterministically', () => {
    const a = canonicalize({ z: 1, a: 2, m: 3 })
    const b = canonicalize({ a: 2, m: 3, z: 1 })
    expect(a).toBe(b)
    expect(a).toBe('{"a":2,"m":3,"z":1}')
  })

  test('handles nested structures', () => {
    const val = { b: [{ c: 1 }, { a: 2 }], a: 'x' }
    const c = canonicalize(val)
    expect(c).toBe('{"a":"x","b":[{"c":1},{"a":2}]}')
  })
})

describe('stableHash', () => {
  test('same input produces same hash', () => {
    const h1 = stableHash({ messages: ['a', 'b'], model: 'GLM-5.1' })
    const h2 = stableHash({ model: 'GLM-5.1', messages: ['a', 'b'] })
    expect(h1).toBe(h2)
    expect(h1).toMatch(/^[0-9a-f]{64}$/)
  })

  test('different input produces different hash', () => {
    const h1 = stableHash({ model: 'GLM-5.1' })
    const h2 = stableHash({ model: 'GLM-4.7' })
    expect(h1).not.toBe(h2)
  })
})
