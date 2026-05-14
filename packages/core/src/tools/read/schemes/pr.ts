/**
 * GitHub PR scheme handler (pr://).
 * Delegates to `gh` CLI for fetching PR content.
 */

import { toolErr, type ToolResult } from '../../errors.js'
import type { ParsedUrl, SchemeHandler } from '../url-router.js'

async function execGh(args: string[]): Promise<string> {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const execFileAsync = promisify(execFile)
  const { stdout } = await execFileAsync('gh', args, { maxBuffer: 10 * 1024 * 1024 })
  return stdout
}

function parsePrRef(ref: string): { owner?: string; repo?: string; number: number } {
  const withSlash = ref.match(/^([^/\s]+)\/([^/\s]+)\/(\d+)$/)
  if (withSlash) {
    return { owner: withSlash[1], repo: withSlash[2], number: Number(withSlash[3]) }
  }
  const withHash = ref.match(/^([^/\s]+)\/([^/\s]+)#(\d+)$/)
  if (withHash) {
    return { owner: withHash[1], repo: withHash[2], number: Number(withHash[3]) }
  }
  const bare = ref.match(/^(\d+)$/)
  if (bare) return { number: Number(bare[1]) }
  throw new Error(`Invalid PR ref: '${ref}'`)
}

export const prHandler: SchemeHandler = async (parsed: ParsedUrl): Promise<ToolResult<string>> => {
  try {
    const ref = parsePrRef(parsed.path)
    const repoFlag = ref.owner && ref.repo ? [`-R`, `${ref.owner}/${ref.repo}`] : []
    const body = await execGh(['pr', 'view', String(ref.number), ...repoFlag, '--comments'])
    return { ok: true as const, data: body }
  } catch (e) {
    return toolErr('RUNTIME_ERROR', `gh pr failed: ${(e as Error).message}`)
  }
}
