/**
 * Grep tool — tries ripgrep first, falls back to pure JS implementation.
 */

import { z } from 'zod'
import type { ToolHandler } from '../registry.js'
import { toolOk } from '../errors.js'
import { jsGrep } from './js.js'
import { rgGrep, rgAvailable } from './rg.js'

// ── Schema ────────────────────────────────────────────────────────────

const GrepSchema = z.object({
  pattern: z.string().min(1),
  cwd: z.string().optional(),
  include: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
  caseInsensitive: z.boolean().optional().default(false),
})

// ── Tool ──────────────────────────────────────────────────────────────

export const grepTool: ToolHandler = {
  name: 'grep',
  description: 'Search for pattern across files. Uses ripgrep when available, JS fallback otherwise.',
  schema: GrepSchema,
  async run(params: unknown, ctx) {
    const { pattern, cwd, include, exclude, caseInsensitive } = GrepSchema.parse(params)
    const searchCwd = cwd ?? ctx.cwd

    // Try rg first
    if (await rgAvailable()) {
      try {
        const result = await rgGrep({ pattern, cwd: searchCwd, include, exclude, caseInsensitive })
        return toolOk(result)
      } catch {
        // Fall through to JS
      }
    }

    // JS fallback
    const result = await jsGrep({ pattern, cwd: searchCwd, include, exclude, caseInsensitive })
    return toolOk(result)
  },
}
