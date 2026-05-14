import xxhash from 'xxhash-wasm'
import { BIGRAM_COUNT } from './bigrams.js'

let _api: Awaited<ReturnType<typeof xxhash>> | null = null

/**
 * Initialize the xxhash WASM module. Must be called once before computeAnchor.
 * Returns the same API on repeated calls (idempotent).
 */
export async function initHashline(): Promise<void> {
  if (_api) return
  _api = await xxhash()
}

/**
 * Compute the anchor bigram index for a line of text.
 * Uses xxhash h32 (unsigned 32-bit) modulo BIGRAM_COUNT.
 * Callers MUST ensure initHashline() has resolved first.
 */
export function computeAnchor(line: string): number {
  if (!_api) throw new Error('hashline not initialized — call initHashline() first')
  return (_api.h32(line) >>> 0) % BIGRAM_COUNT
}
