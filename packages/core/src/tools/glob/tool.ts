/**
 * Glob tool — file pattern matching using picomatch.
 *
 * For simple globs, picomatch is sufficient and avoids the fast-glob dependency.
 * Walks the directory tree manually and filters with picomatch.
 */

import { z } from 'zod'
import { readdir, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'
import picomatch from 'picomatch'
import type { ToolHandler } from '../registry.js'
import { toolOk } from '../errors.js'

// ── Schema ────────────────────────────────────────────────────────────

const GlobSchema = z.object({
  pattern: z.string().min(1),
  cwd: z.string().optional(),
  dot: z.boolean().optional().default(false),
  ignore: z.array(z.string()).optional(),
})

// ── Implementation ────────────────────────────────────────────────────

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.hg', '.svn', 'dist', '.next', '.turbo', 'build', 'out', '.cache',
])

async function walkAndMatch(
  dir: string,
  rootDir: string,
  matcher: (f: string) => boolean,
  ignoreMatcher: ((f: string) => boolean) | null,
  dot: boolean,
): Promise<string[]> {
  const results: string[] = []
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return results
  }

  for (const entry of entries) {
    if (!dot && entry.name.startsWith('.') && entry.name !== '.env') continue
    const fullPath = join(dir, entry.name)
    const relPath = relative(rootDir, fullPath)

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) && !dot) continue
      if (ignoreMatcher?.(relPath)) continue
      results.push(...await walkAndMatch(fullPath, rootDir, matcher, ignoreMatcher, dot))
    } else if (entry.isFile()) {
      if (ignoreMatcher?.(relPath)) continue
      if (matcher(relPath)) {
        results.push(relPath)
      }
    }
  }

  return results.sort()
}

// ── Tool ──────────────────────────────────────────────────────────────

export const globTool: ToolHandler = {
  name: 'glob',
  description: 'Find files matching a glob pattern',
  schema: GlobSchema,
  async run(params: unknown, ctx) {
    const { pattern, cwd, dot, ignore } = GlobSchema.parse(params)
    const searchCwd = cwd ?? ctx.cwd

    const matcher = picomatch(pattern, { dot })
    const ignoreMatcher = ignore?.length ? picomatch(ignore, { dot }) : null

    const files = await walkAndMatch(searchCwd, searchCwd, matcher, ignoreMatcher, dot)

    return toolOk({
      files,
      count: files.length,
    })
  },
}
