/**
 * Local file scheme handler for the read tool.
 * Reads a file from disk, applies selector, and formats with hashlines.
 */

import { readFile } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
import { toolOk, toolErr, type ToolResult } from '../../errors.js'
import type { ParsedUrl, SchemeHandler } from '../url-router.js'
import { initHashline, toHashlines } from '../../hashline/index.js'
import type { Range } from '../selector.js'

/** Binary extensions that should not be read as text. */
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.avif',
  '.mp3', '.mp4', '.wav', '.ogg', '.flac', '.aac', '.m4a',
  '.zip', '.tar', '.gz', '.bz2', '.xz', '.zst', '.7z', '.rar',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.wasm',
])

function isBinaryPath(filePath: string): boolean {
  return BINARY_EXTENSIONS.has(extname(filePath).toLowerCase())
}

/** Apply a Range selector to multi-line text. Returns [selectedLines, fullLines]. */
function sliceContent(content: string, range: Range): string {
  const lines = content.split('\n')
  switch (range.type) {
    case 'single':
      return lines[range.line - 1] ?? ''
    case 'inclusive': {
      const end = Math.min(range.end, lines.length)
      return lines.slice(range.start - 1, end).join('\n')
    }
    case 'count': {
      const end = Math.min(range.start - 1 + range.count, lines.length)
      return lines.slice(range.start - 1, end).join('\n')
    }
    case 'raw':
      return content
  }
}

export const localHandler: SchemeHandler = async (parsed: ParsedUrl): Promise<ToolResult<string>> => {
  const filePath = resolve(parsed.path)

  if (isBinaryPath(filePath)) {
    return toolErr('VALIDATION_ERROR', `Cannot read binary file: ${filePath}`)
  }

  let content: string
  try {
    content = await readFile(filePath, 'utf-8')
  } catch (e) {
    const err = e as NodeJS.ErrnoException
    if (err.code === 'ENOENT') {
      return toolErr('NOT_FOUND', `File not found: ${filePath}`)
    }
    if (err.code === 'EISDIR') {
      return toolErr('VALIDATION_ERROR', `Path is a directory: ${filePath}`)
    }
    return toolErr('RUNTIME_ERROR', `Failed to read ${filePath}: ${err.message}`)
  }

  // Apply selector before hashline formatting
  if (parsed.selector) {
    content = sliceContent(content, parsed.selector)
  }

  // Apply hashline formatting (unless raw selector)
  if (parsed.selector?.type !== 'raw') {
    try {
      await initHashline()
      content = toHashlines(content)
    } catch {
      // If hashline init fails (e.g. wasm unavailable), return plain content
    }
  }

  return toolOk(content)
}
