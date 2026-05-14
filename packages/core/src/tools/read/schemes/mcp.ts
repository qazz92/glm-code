import { toolErr } from '../../errors.js'
import type { ParsedUrl, SchemeHandler } from '../url-router.js'

export const mcpHandler: SchemeHandler = async (_parsed: ParsedUrl) =>
  toolErr('NOT_FOUND', 'mcp:// scheme not yet implemented')
