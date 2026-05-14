/**
 * URL-like scheme router for the read tool.
 *
 * Schemes: file (default), issue, pr, skill, rule, agent, artifact,
 *          memory, mcp, conflict
 */

import { parseSelector, splitPathSelector, type LineRange } from './selector.js'
import { toolErr, type ToolResult } from '../errors.js'

export interface ParsedUrl {
  scheme: string
  /** The path component (after scheme:). */
  path: string
  selector: LineRange | null
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
    return dispatch(input)
  }

  return { parse, register, dispatch, read }
}