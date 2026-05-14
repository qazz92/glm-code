/**
 * MultiEdit tool — multiple operations atomically applied to a single file.
 * All ops resolve against the same snapshot. If any fails, no write occurs.
 */

import { z } from 'zod'
import { readFile, writeFile, mkdir, rename, unlink } from 'node:fs/promises'
import { resolve, dirname, basename } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { ToolHandler } from '../registry.js'
import { planOps, applyPlan, type RawEditOp, type EditOpKind } from './apply.js'
import { stripPayloadPrefix } from './prefixes.js'

// ── Schema ────────────────────────────────────────────────────────────

const EditOpSchema = z.object({
  anchor: z.string().min(1),
  kind: z.enum(['replace', 'insert_after', 'insert_before', 'delete', 'replace_range']),
  payload: z.array(z.string()).optional().default([]),
})

const MultiEditSchema = z.object({
  path: z.string().min(1),
  ops: z.array(EditOpSchema).min(1),
})

// ── Tool ──────────────────────────────────────────────────────────────

export const multiEditTool: ToolHandler = {
  name: 'multi_edit',
  description: 'Apply multiple edit operations atomically to a single file. All or nothing.',
  schema: MultiEditSchema,
  async run(params: unknown) {
    const { path: rawPath, ops } = MultiEditSchema.parse(params)
    const filePath = resolve(rawPath)

    // Read file
    let content: string
    try {
      content = await readFile(filePath, 'utf-8')
    } catch (e) {
      throw new Error(`Failed to read ${filePath}: ${(e as Error).message}`)
    }

    const lines = content.split('\n')

    // Strip payload prefixes
    const rawOps: RawEditOp[] = ops.map(op => ({
      anchor: op.anchor,
      kind: op.kind as EditOpKind,
      payload: (op.payload ?? []).map(stripPayloadPrefix),
    }))

    // Plan — if any op fails, abort
    const planResult = planOps(rawOps, lines)
    if (!planResult.ok || !planResult.data) {
      const msg = !planResult.ok && planResult.error ? planResult.error.message : 'Edit plan failed'
      throw new Error(msg)
    }

    // Apply all ops against the original snapshot
    const plan = planResult.data
    const newLines = applyPlan(plan, lines)
    const newContent = newLines.join('\n')

    // Atomic write
    const dir = dirname(filePath)
    const tmpPath = resolve(dir, `.~${basename(filePath)}.${randomUUID()}.tmp`)
    try {
      await mkdir(dir, { recursive: true })
      await writeFile(tmpPath, newContent, 'utf-8')
      await rename(tmpPath, filePath)
    } catch (e) {
      try { await unlink(tmpPath) } catch { /* best effort */ }
      throw new Error(`Failed to write ${filePath}: ${(e as Error).message}`)
    }

    return {
      path: filePath,
      opsApplied: plan.ops.length,
    }
  },
}
