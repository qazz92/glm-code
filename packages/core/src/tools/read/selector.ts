/**
 * Line selectors for the read tool.
 *
 * Syntax:  `<path>[:<selector>]`
 *
 * Selectors:
 *   `42`          → single line
 *   `42-100`      → inclusive range (lines 42 through 100)
 *   `42+150`      → count range (150 lines starting at 42)
 *   `raw`         → raw mode, no hashlines
 */

export type LineRange =
  | { type: 'single'; line: number }
  | { type: 'inclusive'; start: number; end: number }
  | { type: 'count'; start: number; count: number }
  | { type: 'raw' }

const SINGLE_RE = /^(\d+)$/
const INCLUSIVE_RE = /^(\d+)-(\d+)$/
const COUNT_RE = /^(\d+)\+(\d+)$/

/**
 * Parse a selector string into a LineRange descriptor.
 * Returns `null` when `input` is empty/undefined (no selector).
 * Throws on syntactically invalid selectors.
 */
export function parseSelector(input: string | undefined | null): LineRange | null {
  if (!input) return null

  if (input === 'raw') return { type: 'raw' }

  let m: RegExpMatchArray | null

  m = input.match(SINGLE_RE)
  if (m) {
    const line = Number(m[1])
    if (line < 1) throw new Error(`Selector: line numbers start at 1, got ${line}`)
    return { type: 'single', line }
  }

  m = input.match(INCLUSIVE_RE)
  if (m) {
    const start = Number(m[1])
    const end = Number(m[2])
    if (start < 1) throw new Error(`Selector: start line must be >= 1, got ${start}`)
    if (end < start) throw new Error(`Selector: end (${end}) < start (${start})`)
    return { type: 'inclusive', start, end }
  }

  m = input.match(COUNT_RE)
  if (m) {
    const start = Number(m[1])
    const count = Number(m[2])
    if (start < 1) throw new Error(`Selector: start line must be >= 1, got ${start}`)
    if (count < 1) throw new Error(`Selector: count must be >= 1, got ${count}`)
    return { type: 'count', start, count }
  }

  throw new Error(`Selector: cannot parse '${input}'`)
}

/**
 * Split `path:selector` into [path, selector].
 * A bare path (no colon, or colon in a Windows drive letter) returns [path, undefined].
 */
export function splitPathSelector(input: string): [path: string, selector: string | undefined] {
  // Don't split on Windows drive-letter colon (e.g. C:\foo)
  const driveMatch = input.match(/^([A-Za-z]:)(.*)$/s)
  if (driveMatch) {
    const rest = driveMatch[2]!
    const colonIdx = rest.indexOf(':')
    if (colonIdx === -1) return [input, undefined]
    return [input.slice(0, 2 + colonIdx), rest.slice(colonIdx + 1)]
  }

  const colonIdx = input.indexOf(':')
  if (colonIdx === -1) return [input, undefined]
  return [input.slice(0, colonIdx), input.slice(colonIdx + 1)]
}
