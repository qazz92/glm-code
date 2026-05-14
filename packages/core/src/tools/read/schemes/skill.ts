import { toolErr } from '../../errors.js'
import type { ParsedUrl, SchemeHandler } from '../url-router.js'

export const skillHandler: SchemeHandler = async (_parsed: ParsedUrl) =>
  toolErr('NOT_FOUND', 'skill:// scheme not yet implemented')
