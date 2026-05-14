import { toolErr } from '../../errors.js'
import type { ParsedUrl, SchemeHandler } from '../url-router.js'

export const ruleHandler: SchemeHandler = async (_parsed: ParsedUrl) =>
  toolErr('NOT_FOUND', 'rule:// scheme not yet implemented')
