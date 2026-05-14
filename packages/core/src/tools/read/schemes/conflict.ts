import { toolErr } from '../../errors.js'
import type { ParsedUrl, SchemeHandler } from '../url-router.js'

export const conflictHandler: SchemeHandler = async (_parsed: ParsedUrl) =>
  toolErr('NOT_FOUND', 'conflict:// scheme not yet implemented')
