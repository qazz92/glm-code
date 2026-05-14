import { toolErr } from '../../errors.js'
import type { ParsedUrl, SchemeHandler } from '../url-router.js'

export const artifactHandler: SchemeHandler = async (_parsed: ParsedUrl) =>
  toolErr('NOT_FOUND', 'artifact:// scheme not yet implemented')
