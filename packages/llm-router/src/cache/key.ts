import type { IRRequest } from '../ir/types.js'
import { stableHash } from '../ir/hash.js'

/**
 * Deterministic cache key: sha256 of (role + canonicalized request).
 * Role distinguishes the same request used for different purposes
 * (e.g. completion vs. streaming prefetch).
 */
export function cacheKey(role: string, req: IRRequest): string {
  // Hash only the fields that affect the response
  const core = {
    model: req.model,
    system: req.system ?? '',
    messages: req.messages,
    tools: req.tools ?? [],
    maxTokens: req.maxTokens,
    temperature: req.temperature,
    topP: req.topP,
    stopSequences: req.stopSequences ?? [],
  }
  return stableHash({ role, ...core })
}
