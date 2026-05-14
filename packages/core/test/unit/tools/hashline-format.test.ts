import { describe, expect, test, beforeAll } from 'vitest'
import { initHashline, computeAnchor, toHashlines, parseAnchor, splitAnchorRange, isAnchor } from '../../../src/tools/hashline/index.js'

describe('hashline format', () => {
  beforeAll(async () => {
    await initHashline()
  })

  test('toHashlines prepends anchors to each non-empty line', () => {
    const input = 'hello\nworld\n'
    const result = toHashlines(input)
    const lines = result.split('\n')
    // "hello" line gets an anchor
    expect(lines[0]).toMatch(/^\/\/ ≡[a-z]{2} hello$/)
    // "world" line gets an anchor
    expect(lines[1]).toMatch(/^\/\/ ≡[a-z]{2} world$/)
    // trailing empty stays empty
    expect(lines[2]).toBe('')
  })

  test('toHashlines is deterministic — same input yields same output', () => {
    const input = 'determinism test line'
    const a = toHashlines(input)
    const b = toHashlines(input)
    expect(a).toBe(b)
  })

  test('computeAnchor result matches anchor in toHashlines output', async () => {
    const { BIGrams } = await import('../../../src/tools/hashline/bigrams.js')
    const line = 'match check'
    const idx = computeAnchor(line)
    const result = toHashlines(line)
    // result is "// ≡XX match check" — bigram at chars 4-5
    const anchorBigram = result.slice(4, 6)
    expect(anchorBigram).toMatch(/^[a-z]{2}$/)
    // Verify the bigram comes from BIGrams at the computed index
    expect(BIGrams[idx]).toBe(anchorBigram)
  })

  test('parseAnchor extracts bigram from hashline', () => {
    expect(parseAnchor('// ≡ab some code')).toBe('ab')
    expect(parseAnchor('// ≡zz function foo() {}')).toBe('zz')
  })

  test('parseAnchor returns null for non-hashline strings', () => {
    expect(parseAnchor('no anchor here')).toBeNull()
    expect(parseAnchor('')).toBeNull()
    expect(parseAnchor('// not an anchor')).toBeNull()
    expect(parseAnchor('≡ab missing prefix')).toBeNull()
  })

  test('splitAnchorRange parses valid range and rejects invalid', () => {
    expect(splitAnchorRange('≡aa-≡bz')).toEqual(['aa', 'bz'])
    expect(splitAnchorRange('≡mn-≡pq')).toEqual(['mn', 'pq'])
    expect(splitAnchorRange('not a range')).toBeNull()
    expect(splitAnchorRange('≡aa')).toBeNull()
    expect(splitAnchorRange('≡aa-≡')).toBeNull()
  })
})
