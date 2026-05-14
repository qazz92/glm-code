/**
 * Pure JavaScript grep fallback — walks directory tree, skips common ignore dirs,
 * binary-probes files, and matches via RegExp.
 */

import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import picomatch from 'picomatch'

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.hg', '.svn', 'dist', '.next', '.turbo', 'build', 'out', '.cache',
])

export interface GrepMatch {
  file: string
  line: number
  column: number
  text: string
}

export interface GrepResult {
  matches: GrepMatch[]
  truncated: boolean
}

const MAX_MATCHES = 500
const BINARY_PROBE_BYTES = 8192

function isBinary(buffer: Buffer): boolean {
  for (let i = 0; i < Math.min(buffer.length, BINARY_PROBE_BYTES); i++) {
    const byte = buffer[i]
    if (byte === 0) return true
  }
  return false
}

async function walkDir(
  dir: string,
  rootDir: string,
  includeMatcher: ((f: string) => boolean) | null,
  excludeMatcher: ((f: string) => boolean) | null,
): Promise<string[]> {
  const results: string[] = []
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return results
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    const relPath = relative(rootDir, fullPath)

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      if (excludeMatcher?.(relPath + sep)) continue
      results.push(...await walkDir(fullPath, rootDir, includeMatcher, excludeMatcher))
    } else if (entry.isFile()) {
      if (includeMatcher && !includeMatcher(relPath)) continue
      if (excludeMatcher?.(relPath)) continue
      results.push(fullPath)
    }
  }

  return results
}

export async function jsGrep(opts: {
  pattern: string | RegExp
  cwd: string
  include?: string[]
  exclude?: string[]
  caseInsensitive?: boolean
}): Promise<GrepResult> {
  const { cwd, include, exclude, caseInsensitive } = opts
  const pattern = typeof opts.pattern === 'string'
    ? new RegExp(opts.pattern, caseInsensitive ? 'gi' : 'g')
    : opts.pattern

  const includeMatcher = include?.length ? picomatch(include) : null
  const excludeMatcher = exclude?.length ? picomatch(exclude) : null

  const files = await walkDir(cwd, cwd, includeMatcher, excludeMatcher)
  const matches: GrepMatch[] = []
  let truncated = false

  for (const filePath of files) {
    if (truncated) break

    let buf: Buffer
    try {
      buf = await readFile(filePath) as Buffer
    } catch {
      continue
    }

    if (isBinary(buf)) continue

    const content = buf.toString('utf-8')
    const lines = content.split('\n')

    for (let i = 0; i < lines.length; i++) {
      if (matches.length >= MAX_MATCHES) {
        truncated = true
        break
      }

      const line = lines[i]!
      // Reset lastIndex for stateful regexps
      pattern.lastIndex = 0
      const m = pattern.exec(line)
      if (m) {
        matches.push({
          file: relative(cwd, filePath),
          line: i + 1,
          column: m.index + 1,
          text: line,
        })
      }
    }
  }

  return { matches, truncated }
}
