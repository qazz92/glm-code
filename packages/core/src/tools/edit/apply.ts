/**
 * Edit operation planning and application.
 *
 * `planOps()` resolves anchor references in edit operations against the actual
 * file lines, validates that ranges don't overlap, and returns a concrete plan.
 * `applyPlan()` applies the plan in descending line order so that earlier
 * line numbers remain stable.
 */

import { toolOk, toolErr, type ToolResult } from '../errors.js'

// ── Op types ──────────────────────────────────────────────────────────

export type EditOpKind = 'replace' | 'insert_after' | 'insert_before' | 'delete' | 'replace_range'

export interface RawEditOp {
  /** Anchor reference: single bigram (e.g. "≡ab") or range ("≡ab-≡cd") or bare line number. */
  anchor: string
  kind: EditOpKind
  /** Payload lines (already prefix-stripped). For delete ops this is empty. */
  payload: string[]
}

interface ResolvedOp {
  kind: EditOpKind
  /** 0-based line index where the op applies. */
  startLine: number
  /** For replace_range / delete: the inclusive end line index. */
  endLine: number
  payload: string[]
}

export interface EditPlan {
  ops: ResolvedOp[]
}

// ── Anchor resolution ─────────────────────────────────────────────────

function parseLineRef(ref: string): number | null {
  const n = parseInt(ref, 10)
  return Number.isFinite(n) && n >= 1 ? n - 1 : null  // 1-indexed → 0-indexed
}

/**
 * Resolve a single anchor reference to a 0-based line index.
 * `lines` are the raw file lines (NOT hashlined).
 */
function resolveAnchor(
  anchor: string,
  lines: readonly string[],
): { ok: true; line: number } | { ok: false; error: string } {
  // Try numeric reference first (1-indexed)
  const numIdx = parseLineRef(anchor)
  if (numIdx !== null) {
    if (numIdx >= lines.length) {
      return { ok: false, error: `Line ${anchor} exceeds file length (${lines.length})` }
    }
    return { ok: true, line: numIdx }
  }

  // Strip leading `≡` if present
  const bigram = anchor.replace(/^≡/, '')
  if (bigram.length === 2 && /^[a-z]{2}$/.test(bigram)) {
    return {
      ok: false,
      error: `Cannot resolve hashline anchor "≡${bigram}" against raw file content. Use numeric line references for non-hashlined files.`,
    }
  }

  return { ok: false, error: `Invalid anchor: "${anchor}"` }
}

/**
 * Resolve an anchor range like "≡ab-≡cd" or "5-10" to [start, end] (0-based inclusive).
 */
function resolveRange(
  anchor: string,
  lines: readonly string[],
): { ok: true; start: number; end: number } | { ok: false; error: string } {
  const rangeMatch = anchor.match(/^(\d+)-(\d+)$/)
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1]!, 10) - 1
    const end = parseInt(rangeMatch[2]!, 10) - 1
    if (start < 0 || end >= lines.length || start > end) {
      return { ok: false, error: `Invalid range "${anchor}" for file with ${lines.length} lines` }
    }
    return { ok: true, start, end }
  }

  const rangeAnchorMatch = anchor.match(/^≡([a-z]{2})-≡([a-z]{2})$/)
  if (rangeAnchorMatch) {
    return {
      ok: false,
      error: `Hashline anchor ranges require hashlined file content. Use numeric ranges like "5-10".`,
    }
  }

  return { ok: false, error: `Invalid anchor range: "${anchor}"` }
}

// ── Overlap detection ─────────────────────────────────────────────────

interface Span {
  start: number
  end: number
}

function spansOverlap(a: Span, b: Span): boolean {
  return a.start <= b.end && b.start <= a.end
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Plan edit operations: resolve anchors, validate no overlaps.
 * Returns the resolved plan or an error.
 */
export function planOps(
  rawOps: readonly RawEditOp[],
  lines: readonly string[],
): ToolResult<EditPlan> {
  const resolved: ResolvedOp[] = []

  for (const op of rawOps) {
    if (op.kind === 'replace_range') {
      const rr = resolveRange(op.anchor, lines)
      if (!rr.ok) return toolErr('VALIDATION_ERROR', rr.error)
      resolved.push({ kind: op.kind, startLine: rr.start, endLine: rr.end, payload: op.payload })
    } else if (op.kind === 'delete' && op.anchor.includes('-')) {
      const rr = resolveRange(op.anchor, lines)
      if (!rr.ok) return toolErr('VALIDATION_ERROR', rr.error)
      resolved.push({ kind: op.kind, startLine: rr.start, endLine: rr.end, payload: op.payload })
    } else {
      const ar = resolveAnchor(op.anchor, lines)
      if (!ar.ok) return toolErr('VALIDATION_ERROR', ar.error)
      resolved.push({ kind: op.kind, startLine: ar.line, endLine: ar.line, payload: op.payload })
    }
  }

  // Validate no overlapping spans
  const spans: Span[] = resolved.map(op => ({
    start: op.kind === 'insert_after' ? op.startLine : op.startLine,
    end: op.kind === 'insert_before' ? op.startLine :
         op.kind === 'insert_after' ? op.startLine :
         op.endLine,
  }))

  for (let i = 0; i < spans.length; i++) {
    for (let j = i + 1; j < spans.length; j++) {
      if (spansOverlap(spans[i]!, spans[j]!)) {
        return toolErr('VALIDATION_ERROR',
          `Overlapping edit operations at ops[${i}] (${rawOps[i]?.anchor}) and ops[${j}] (${rawOps[j]?.anchor})`)
      }
    }
  }

  return toolOk({ ops: resolved })
}

/**
 * Apply an edit plan to the given lines, returning the new lines.
 * Operations are applied in descending line order for stability.
 */
export function applyPlan(plan: EditPlan, lines: readonly string[]): string[] {
  const result = [...lines]

  // Sort ops by start line descending (so line indices remain stable)
  const sorted = [...plan.ops].sort((a, b) => {
    const aKey = a.kind === 'insert_before' ? a.startLine - 0.5 : a.startLine
    const bKey = b.kind === 'insert_before' ? b.startLine - 0.5 : b.startLine
    return bKey - aKey
  })

  for (const op of sorted) {
    switch (op.kind) {
      case 'replace':
        result.splice(op.startLine, 1, ...op.payload)
        break
      case 'delete':
        result.splice(op.startLine, op.endLine - op.startLine + 1)
        break
      case 'replace_range':
        result.splice(op.startLine, op.endLine - op.startLine + 1, ...op.payload)
        break
      case 'insert_after':
        result.splice(op.startLine + 1, 0, ...op.payload)
        break
      case 'insert_before':
        result.splice(op.startLine, 0, ...op.payload)
        break
    }
  }

  return result
}
