/**
 * Edit tool — single-operation file edit with anchor resolution.
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

const EditSchema = z.object({
  path: z.string().min(1),
  ops: z.array(EditOpSchema).min(1).max(1),
})

// ── Tool ──────────────────────────────────────────────────────────────

export const editTool: ToolHandler = {
  name: 'edit',
  description: 'Edit a file with a single anchored operation (replace, insert, delete)',
  schema: EditSchema,
  async run(params: unknown) {
    const { path: rawPath, ops } = EditSchema.parse(params)
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

    // Plan
    const planResult = planOps(rawOps, lines)
    if (!planResult.ok || !planResult.data) {
      const msg = !planResult.ok && planResult.error ? planResult.error.message : 'Edit plan failed'
      throw new Error(msg)
    }

    // Apply
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
