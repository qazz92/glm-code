import raw from './bigrams.json' with { type: 'json' }

/** Deterministic 2-char bigram table — first 647 entries of aa..zz in alphabetical order. */
export const BIGrams: readonly string[] = raw

/** Must equal 647. Checked at load time to guard against truncation. */
export const BIGRAM_COUNT = raw.length

if (BIGRAM_COUNT !== 647) {
  throw new Error(`bigrams.json: expected 647 entries, got ${BIGRAM_COUNT}`)
}
