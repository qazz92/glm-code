/**
 * URL-like scheme router for the read tool.
 *
 * Schemes: file (default), issue, pr, skill, rule, agent, artifact,
 *          memory, mcp, conflict
 */

import { parseSelector, splitPathSelector, type Range } from './selector.js'
import { toolErr, type ToolResult } from '../errors.js'

export interface ParsedUrl {
  scheme: string
  /** The path component (after scheme:). */
  path: string
  selector: Range | null
}

export type SchemeHandler = (
  parsed: ParsedUrl,
) => Promise<ToolResult<string>>

export interface UrlRouter {
  parse(input: string): ParsedUrl
  register(scheme: string, handler: SchemeHandler): void
  dispatch(input: string): Promise<ToolResult<string>>
  /** Convenience: parse + dispatch + apply selector to content. */
  read(input: string): Promise<ToolResult<string>>
}

const KNOWN_SCHEMES = [
  'file',
  'issue',
  'pr',
  'skill',
  'rule',
  'agent',
  'artifact',
  'memory',
  'mcp',
  'conflict',
] as const

export function makeUrlRouter(): UrlRouter {
  const handlers = new Map<string, SchemeHandler>()

  function parse(input: string): ParsedUrl {
    // Try scheme detection first (e.g. "issue://123" or "file:path")
    const schemeMatch = input.match(/^([a-z][a-z0-9_-]*):(?:\/\/)?(.*)$/s)
    if (schemeMatch) {
      const scheme = schemeMatch[1]!
      const rest = schemeMatch[2]!
      // Selector is the last colon-separated segment in the rest
      const lastColon = rest.lastIndexOf(':')
      if (lastColon !== -1) {
        const maybeSel = rest.slice(lastColon + 1)
        const range = parseSelector(maybeSel)
        if (range) {
          return { scheme, path: rest.slice(0, lastColon), selector: range }
        }
      }
      return { scheme, path: rest, selector: null }
    }

    // No scheme prefix — treat as file path with optional :selector
    const [raw, selector] = splitPathSelector(input)
    const range = parseSelector(selector)
    return { scheme: 'file', path: raw, selector: range }
  }

  function register(scheme: string, handler: SchemeHandler): void {
    handlers.set(scheme, handler)
  }

  async function dispatch(input: string): Promise<ToolResult<string>> {
    const parsed = parse(input)
    const handler = handlers.get(parsed.scheme)
    if (!handler) {
      return toolErr('NOT_FOUND', `No handler registered for scheme '${parsed.scheme}'`)
    }
    return handler(parsed)
  }

  async function read(input: string): Promise<ToolResult<string>> {
    const parsed = parse(input)
    const result = await dispatch(input)
    if (!result.ok) return result

    // raw selector bypasses formatting
    if (parsed.selector?.type === 'raw') return result

    // Apply line-range selector if present (handler may already have done this)
    const content = result.data as string
    if (parsed.selector) {
      return applySelector(content, parsed.selector)
    }

    return result
  }

  return { parse, register, dispatch, read }
}

/**
 * Apply a Range selector to multi-line text content.
 * Returns a substring covering the selected lines (1-indexed).
 */
function applySelector(content: string, range: Range): ToolResult<string> {
  const lines = content.split('\n')

  switch (range.type) {
    case 'single': {
      if (range.line > lines.length) {
        return toolErr('VALIDATION_ERROR', `Line ${range.line} exceeds file length (${lines.length} lines)`)
      }
      return { ok: true, data: lines[range.line - 1]! }
    }
    case 'inclusive': {
      if (range.start > lines.length) {
        return toolErr('VALIDATION_ERROR', `Start line ${range.start} exceeds file length (${lines.length} lines)`)
      }
      const end = Math.min(range.end, lines.length)
      return { ok: true, data: lines.slice(range.start - 1, end).join('\n') }
    }
    case 'count': {
      if (range.start > lines.length) {
        return toolErr('VALIDATION_ERROR', `Start line ${range.start} exceeds file length (${lines.length} lines)`)
      }
      const end = Math.min(range.start - 1 + range.count, lines.length)
      return { ok: true, data: lines.slice(range.start - 1, end).join('\n') }
    }
    case 'raw':
      return { ok: true, data: content }
  }
}
