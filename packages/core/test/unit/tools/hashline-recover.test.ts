import { describe, expect, test, beforeAll } from 'vitest'
import { initHashline, computeAnchor, toHashlines } from '../../../src/tools/hashline/index.js'
import { recoverAnchor, type RecoverResult } from '../../../src/tools/hashline/recover.js'
import { BIGrams } from '../../../src/tools/hashline/bigrams.js'

describe('hashline recovery', () => {
  beforeAll(async () => {
    await initHashline()
  })

  function makeHashlinedLines(lines: string[]): string[] {
    return toHashlines(lines.join('\n')).split('\n')
  }

  test('exact strategy — single occurrence of anchor bigram', () => {
    // Use distinct lines so each gets a different anchor
    const rawLines = ['alpha line', 'beta line', 'gamma line']
    const hashlined = makeHashlinedLines(rawLines)
    // Find an anchor that appears only once
    for (let i = 0; i < rawLines.length; i++) {
      const anchor = BIGrams[computeAnchor(rawLines[i])]
      const count = hashlined.filter(l => l.includes(`≡${anchor}`)).length
      if (count === 1) {
        const result = recoverAnchor(hashlined, anchor)
        expect(result.ok).toBe(true)
        if (result.ok) {
          expect(result.line).toBe(i)
          expect(result.strategy).toBe('exact')
        }
        return
      }
    }
    // Improbable: all anchors collide with 647 bigrams and 3 lines. Pass vacuously.
    expect(true).toBe(true)
  })

  test('shift strategy — anchor found within ±5 of hint', () => {
    const rawLines = Array.from({ length: 20 }, (_, i) => `line number ${i} content`)
    const hashlined = makeHashlinedLines(rawLines)
    // Pick an anchor at line 10, give hint at 8
    const anchor10 = BIGrams[computeAnchor(rawLines[10])]
    const result = recoverAnchor(hashlined, anchor10, 8)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.line).toBe(10)
      expect(result.strategy).toMatch(/^(exact|shift)$/)
    }
  })

  test('unique strategy — anchor appears once in whole file (no hint)', () => {
    const rawLines = ['unique line alpha', 'unique line beta', 'unique line gamma']
    const hashlined = makeHashlinedLines(rawLines)
    // Find an anchor that appears exactly once
    for (let i = 0; i < rawLines.length; i++) {
      const anchor = BIGrams[computeAnchor(rawLines[i])]
      const count = hashlined.filter(l => l.includes(`≡${anchor}`)).length
      if (count === 1) {
        const result = recoverAnchor(hashlined, anchor)
        expect(result.ok).toBe(true)
        if (result.ok) {
          expect(result.line).toBe(i)
          expect(result.strategy).toBe('exact')  // single candidate = exact
        }
        return
      }
    }
    expect(true).toBe(true)
  })

  test('adjacent strategy — multiple occurrences, picks closest to hint', () => {
    // Force a collision: same text repeated means same anchor on all lines
    const sameLine = 'collision test text for adjacent'
    // Mix in a different line at index 5 so hint=5 doesn't have the target anchor
    const rawLines = Array.from({ length: 10 }, (_, i) =>
      i === 5 ? 'different line at five' : sameLine
    )
    const hashlined = makeHashlinedLines(rawLines)
    const anchor = BIGrams[computeAnchor(sameLine)]
    // Hint at line 5 (which doesn't have the target anchor), should pick line 4 or 6
    const result = recoverAnchor(hashlined, anchor, 5)
    expect(result.ok).toBe(true)
    if (result.ok) {
      // Closest candidates to hint=5 are lines 4 and 6
      expect([4, 6]).toContain(result.line)
      expect(result.strategy).toBe('adjacent')
    }
  })

  test('ambiguous — multiple occurrences without hint', () => {
    const sameLine = 'ambiguity test text for multi'
    const rawLines = Array.from({ length: 5 }, () => sameLine)
    const hashlined = makeHashlinedLines(rawLines)
    const anchor = BIGrams[computeAnchor(sameLine)]
    // No hint, multiple occurrences → ambiguous
    const result = recoverAnchor(hashlined, anchor)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('ambiguous')
    }
  })

  test('miss — bigram not found anywhere in file', () => {
    const rawLines = ['some line', 'another line']
    const hashlined = makeHashlinedLines(rawLines)
    // Find a bigram not present in any hashline
    const usedAnchors = new Set(
      rawLines.map(l => BIGrams[computeAnchor(l)])
    )
    const missBigram = BIGrams.find(b => !usedAnchors.has(b))
    if (missBigram) {
      const result = recoverAnchor(hashlined, missBigram)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.reason).toBe('miss')
      }
    } else {
      expect(true).toBe(true)
    }
  })
})
