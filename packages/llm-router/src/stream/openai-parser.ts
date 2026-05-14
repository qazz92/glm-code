import type { StreamEvent, SSEEvent } from './sse.js'
import type { LLMModel } from '@glm/shared'

interface ToolAcc { id: string; name: string; argsBuf: string }

export async function* parseOpenAIStream(events: AsyncIterable<SSEEvent>): AsyncIterable<StreamEvent> {
  const tools = new Map<number, ToolAcc>()
  let sentStart = false
  let lastFinish: string | undefined
  let lastUsage: { prompt_tokens: number; completion_tokens: number } | undefined

  for await (const sse of events) {
    if (sse.data === '[DONE]') continue
    let payload: any
    try { payload = JSON.parse(sse.data) } catch { continue }

    if (!sentStart) {
      sentStart = true
      yield { type: 'message_start', messageId: payload.id ?? '', model: (payload.model ?? 'GLM-4.5-Air') as LLMModel }
    }

    const choice = payload.choices?.[0]
    if (!choice) continue
    const d = choice.delta ?? {}

    if (typeof d.content === 'string' && d.content.length > 0) {
      yield { type: 'text_delta', text: d.content }
    }

    if (Array.isArray(d.tool_calls)) {
      for (const tc of d.tool_calls) {
        const idx = tc.index ?? 0
        let acc = tools.get(idx)
        if (!acc) {
          acc = { id: tc.id ?? '', name: tc.function?.name ?? '', argsBuf: '' }
          tools.set(idx, acc)
          yield { type: 'tool_use_start', id: acc.id, name: acc.name }
        }
        const partial = tc.function?.arguments
        if (typeof partial === 'string' && partial.length > 0) {
          acc.argsBuf += partial
          yield { type: 'tool_use_input_delta', id: acc.id, partialJson: partial }
        }
      }
    }

    if (choice.finish_reason) lastFinish = choice.finish_reason
    if (payload.usage) lastUsage = payload.usage
  }

  for (const t of tools.values()) yield { type: 'tool_use_stop', id: t.id }

  const stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' =
    lastFinish === 'tool_calls' ? 'tool_use'
      : lastFinish === 'length' ? 'max_tokens'
      : 'end_turn'
  yield { type: 'message_stop', stopReason }
  if (lastUsage) yield { type: 'usage', usage: { inputTokens: lastUsage.prompt_tokens, outputTokens: lastUsage.completion_tokens } }
}
