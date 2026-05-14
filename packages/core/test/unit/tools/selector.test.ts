import { describe, expect, test } from 'vitest'
import { parseSelector, splitPathSelector } from '../../../src/tools/read/selector.js'

describe('parseSelector', () => {
  test('returns null for empty/undefined input', () => {
    expect(parseSelector(undefined)).toBeNull()
    expect(parseSelector(null)).toBeNull()
    expect(parseSelector('')).toBeNull()
  })

  test('parses single line selector', () => {
    expect(parseSelector('42')).toEqual({ type: 'single', line: 42 })
  })

  test('parses inclusive range selector', () => {
    expect(parseSelector('10-20')).toEqual({ type: 'inclusive', start: 10, end: 20 })
  })

  test('parses count range selector', () => {
    expect(parseSelector('50+150')).toEqual({ type: 'count', start: 50, count: 150 })
  })

  test('parses raw selector', () => {
    expect(parseSelector('raw')).toEqual({ type: 'raw' })
  })

  test('rejects invalid selectors', () => {
    expect(() => parseSelector('abc')).toThrow(/cannot parse/)
    expect(() => parseSelector('0')).toThrow(/start at 1/)
    expect(() => parseSelector('5-3')).toThrow(/end.*< start/)
  })

  test('rejects count < 1', () => {
    expect(() => parseSelector('5+0')).toThrow(/count must be >= 1/)
  })
})

describe('splitPathSelector', () => {
  test('splits path:selector', () => {
    const [path, sel] = splitPathSelector('src/foo.ts:50-100')
    expect(path).toBe('src/foo.ts')
    expect(sel).toBe('50-100')
  })

  test('returns undefined selector when no colon', () => {
    const [path, sel] = splitPathSelector('src/foo.ts')
    expect(path).toBe('src/foo.ts')
    expect(sel).toBeUndefined()
  })

  test('handles Windows drive-letter paths', () => {
    const [path, sel] = splitPathSelector('C:\\foo\\bar.ts:42')
    expect(path).toBe('C:\\foo\\bar.ts')
    expect(sel).toBe('42')
  })
})
