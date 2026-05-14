import type { IRRequest } from '../ir/types.js'
import type { StreamEvent } from '../stream/sse.js'

export interface LLMProvider {
  /** Stream events from the LLM for the given request. */
  call(req: IRRequest, signal?: AbortSignal): AsyncIterable<StreamEvent>

  /** Estimate token count for a request (heuristic). */
  countTokens(req: IRRequest): number
}
