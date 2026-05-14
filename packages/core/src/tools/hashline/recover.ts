import { parseAnchor } from './format.js'

export type RecoverResult =
  | { ok: true; line: number; strategy: 'exact' | 'shift' | 'unique' | 'adjacent' }
  | { ok: false; reason: 'ambiguous' | 'miss' }

/**
 * Recover a line number for `target` bigram in `lines`.
 *
 * `lines` are hashlined strings (each starting with `// ≡XX ...`).
 * `target` is the 2-char bigram to locate.
 * `hint` is an optional expected line index to bias recovery.
 *
 * Strategies (in order):
 *  1. exact   — target appears exactly once as a parsed anchor
 *  2. shift   — target found within ±5 of hint (hint given)
 *  3. unique  — whole-file scan finds exactly one (redundant with exact, kept for spec)
 *  4. adjacent— multiple candidates exist, pick closest to hint
 *  5. ambiguous / miss — cannot resolve
 */
export function recoverAnchor(
  lines: readonly string[],
  target: string,
  hint?: number,
): RecoverResult {
  // Gather all candidate line indices where the parsed anchor equals target
  const candidates: number[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line !== undefined && parseAnchor(line) === target) {
      candidates.push(i)
    }
  }

  // Strategy 1: exact — exactly one candidate in the whole file
  if (candidates.length === 1) {
    const line = candidates[0]!
    return { ok: true, line, strategy: 'exact' }
  }

  // Strategy 2: shift — target found within ±5 of hint
  if (hint !== undefined) {
    const near = candidates.filter(c => Math.abs(c - hint) <= 5)
    if (near.length === 1) {
      return { ok: true, line: near[0]!, strategy: 'shift' }
    }
    // If multiple near hint, fall through to adjacent
  }

  // Strategy 3: unique — whole-file unique (same check as exact, for completeness)
  if (candidates.length === 1) {
    return { ok: true, line: candidates[0]!, strategy: 'unique' }
  }

  // Strategy 4: adjacent — multiple candidates, pick closest to hint
  if (candidates.length > 1 && hint !== undefined) {
    let best = candidates[0]!
    let bestDist = Math.abs(best - hint)
    for (let c = 1; c < candidates.length; c++) {
      const candidate = candidates[c]!
      const d = Math.abs(candidate - hint)
      if (d < bestDist) {
        best = candidate
        bestDist = d
      }
    }
    return { ok: true, line: best, strategy: 'adjacent' }
  }

  // Strategy 5: ambiguous or miss
  return { ok: false, reason: candidates.length > 1 ? 'ambiguous' : 'miss' }
}
