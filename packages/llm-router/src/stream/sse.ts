import { createParser, type EventSourceMessage } from 'eventsource-parser'
import type { LLMUsage } from '@glm/shared'
import type { IRBlock } from '../ir/types.js'

export interface SSEEvent { event?: string; data: string }

/**
 * Rich streaming event vocabulary produced by SSE parsers.
 * Distinct from IREvent (which is the IR module's minimal event type).
 */
export type StreamEvent =
  | { type: 'message_start'; messageId: string; model: string }
  | { type: 'thinking_delta'; text: string }
  | { type: 'text_delta'; text: string }
  | { type: 'tool_use_start'; id: string; name: string }
  | { type: 'tool_use_input_delta'; id: string; partialJson: string }
  | { type: 'tool_use_stop'; id: string }
  | { type: 'message_stop'; stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' | 'cancelled' }
  | { type: 'usage'; usage: LLMUsage }
  | { type: 'error'; code: string; message: string }

/**
 * Turn an async byte stream into SSE events.
 * Uses eventsource-parser, which handles multi-line `data:` correctly.
 */
export async function* readSSE(body: AsyncIterable<Uint8Array>, signal?: AbortSignal): AsyncIterable<SSEEvent> {
  const queue: SSEEvent[] = []
  const parser = createParser({
    onEvent: (e: EventSourceMessage) => queue.push({ event: e.event, data: e.data }),
  })
  const decoder = new TextDecoder()
  for await (const chunk of body) {
    if (signal?.aborted) break
    parser.feed(decoder.decode(chunk, { stream: true }))
    while (queue.length > 0) yield queue.shift()!
  }
  while (queue.length > 0) yield queue.shift()!
}
