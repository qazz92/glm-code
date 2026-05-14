import { BIGrams } from './bigrams.js'
import { computeAnchor } from './hash.js'

/**
 * Prepend a hashline anchor (// ≡XX) to every line in `text`.
 * Lines are separated by `\n`; the anchor is the first non-whitespace token.
 */
export function toHashlines(text: string): string {
  const lines = text.split('\n')
  return lines.map(line => {
    if (line === '') return ''
    const idx = computeAnchor(line)
    const bigram = BIGrams[idx]
    return `// ≡${bigram} ${line}`
  }).join('\n')
}

/** Match a hashline anchor at the start of a string. Group 1 = bigram. */
const ANCHOR_RE = /^\/\/\s*≡([a-z]{2})\b/

/** Match a range of anchors like `≡aa-≡bz`. Groups 1=start, 2=end. */
const ANCHOR_RANGE_RE = /^≡([a-z]{2})-≡([a-z]{2})$/

/**
 * Parse the anchor bigram from a hashline string.
 * Returns the 2-char bigram or null if no anchor found.
 */
export function parseAnchor(s: string): string | null {
  const m = ANCHOR_RE.exec(s)
  return m?.[1] ?? null
}

/**
 * Split an anchor range string like "≡aa-≡bz" into [start, end] bigrams.
 * Returns null if the string is not a valid range.
 */
export function splitAnchorRange(s: string): [string, string] | null {
  const m = ANCHOR_RANGE_RE.exec(s)
  if (!m || m[1] === undefined || m[2] === undefined) return null
  return [m[1], m[2]]
}

/**
 * Check whether a string looks like a hashline (starts with // ≡XX).
 */
export function isAnchor(s: string): boolean {
  return ANCHOR_RE.test(s)
}
