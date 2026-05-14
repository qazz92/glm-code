import type { StreamEvent } from './sse.js'
import type { SSEEvent } from './sse.js'
import type { LLMModel } from '@glm/shared'

interface OpenBlock { kind: 'text' | 'thinking' | 'tool_use'; id?: string; name?: string }

export async function* parseAnthropicStream(events: AsyncIterable<SSEEvent>): AsyncIterable<StreamEvent> {
  const blocks: Record<number, OpenBlock> = {}
  let accInput = 0
  let accOutput = 0
  for await (const sse of events) {
    let payload: any
    try { payload = JSON.parse(sse.data) } catch { continue }
    const t: string = payload?.type ?? sse.event ?? ''

    if (t === 'message_start') {
      const msg = payload.message ?? {}
      accInput = msg.usage?.input_tokens ?? 0
      accOutput = msg.usage?.output_tokens ?? 0
      yield { type: 'message_start', messageId: msg.id ?? '', model: (msg.model ?? 'GLM-5.1') as LLMModel }
      continue
    }

    if (t === 'content_block_start') {
      const i = payload.index ?? 0
      const cb = payload.content_block ?? {}
      if (cb.type === 'tool_use') {
        blocks[i] = { kind: 'tool_use', id: cb.id, name: cb.name }
        yield { type: 'tool_use_start', id: cb.id, name: cb.name }
      } else if (cb.type === 'thinking') {
        blocks[i] = { kind: 'thinking' }
      } else {
        blocks[i] = { kind: 'text' }
      }
      continue
    }

    if (t === 'content_block_delta') {
      const i = payload.index ?? 0
      const d = payload.delta ?? {}
      const b = blocks[i]
      if (!b) continue
      if (d.type === 'text_delta' && b.kind === 'text') {
        yield { type: 'text_delta', text: d.text ?? '' }
      } else if (d.type === 'thinking_delta' && b.kind === 'thinking') {
        yield { type: 'thinking_delta', text: d.thinking ?? '' }
      } else if (d.type === 'input_json_delta' && b.kind === 'tool_use' && b.id) {
        yield { type: 'tool_use_input_delta', id: b.id, partialJson: d.partial_json ?? '' }
      }
      continue
    }

    if (t === 'content_block_stop') {
      const i = payload.index ?? 0
      const b = blocks[i]
      if (b?.kind === 'tool_use' && b.id) yield { type: 'tool_use_stop', id: b.id }
      delete blocks[i]
      continue
    }

    if (t === 'message_delta') {
      if (payload.usage?.output_tokens !== undefined) accOutput = payload.usage.output_tokens
      if (payload.delta?.stop_reason) {
        const sr = payload.delta.stop_reason
        const stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' =
          sr === 'tool_use' || sr === 'max_tokens' || sr === 'stop_sequence' ? sr : 'end_turn'
        yield { type: 'message_stop', stopReason }
      }
      continue
    }

    if (t === 'message_stop') {
      yield { type: 'usage', usage: { inputTokens: accInput, outputTokens: accOutput } }
      continue
    }

    if (t === 'error') {
      yield { type: 'error', code: payload.error?.type ?? 'unknown', message: payload.error?.message ?? '' }
      continue
    }
  }
}
