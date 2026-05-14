/**
 * Write tool — atomic write via tmp-rename with parent directory creation.
 */

import { z } from 'zod'
import { writeFile, mkdir, rename, unlink } from 'node:fs/promises'
import { resolve, dirname, basename } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { ToolHandler } from '../registry.js'

const WriteSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
  createParents: z.boolean().optional().default(true),
})

export const writeTool: ToolHandler = {
  name: 'write',
  description: 'Write content to a file atomically (tmp-rename). Creates parent dirs by default.',
  schema: WriteSchema,
  async run(params: unknown) {
    const { path: rawPath, content, createParents } = WriteSchema.parse(params)
    const filePath = resolve(rawPath)
    const dir = dirname(filePath)

    if (createParents) {
      await mkdir(dir, { recursive: true })
    }

    // Atomic write: write to temp file, then rename
    const tmpPath = resolve(dir, `.~${basename(filePath)}.${randomUUID()}.tmp`)
    try {
      await writeFile(tmpPath, content, 'utf-8')
      await rename(tmpPath, filePath)
    } catch (e) {
      // Clean up temp file on failure
      try { await unlink(tmpPath) } catch { /* best effort */ }
      throw e
    }

    return { path: filePath, bytes: Buffer.byteLength(content, 'utf-8') }
  },
}
