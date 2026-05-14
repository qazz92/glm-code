import type { StreamEvent } from './sse.js'
import type { IRBlock } from '../ir/types.js'
import type { LLMUsage } from '@glm/shared'

export interface CoalescedResult {
  content: IRBlock[]
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' | 'cancelled'
  usage: LLMUsage
  messageId: string
}

export async function coalesce(events: AsyncIterable<StreamEvent>): Promise<CoalescedResult> {
  let text = ''
  let thinking = ''
  const toolBufs = new Map<string, { name: string; args: string }>()
  let stopReason: CoalescedResult['stopReason'] = 'end_turn'
  let usage: LLMUsage = { inputTokens: 0, outputTokens: 0 }
  let messageId = ''
  for await (const e of events) {
    switch (e.type) {
      case 'message_start': messageId = e.messageId; break
      case 'text_delta': text += e.text; break
      case 'thinking_delta': thinking += e.text; break
      case 'tool_use_start': toolBufs.set(e.id, { name: e.name, args: '' }); break
      case 'tool_use_input_delta': { const b = toolBufs.get(e.id); if (b) b.args += e.partialJson; break }
      case 'message_stop': stopReason = e.stopReason; break
      case 'usage': usage = e.usage; break
      case 'error': throw new Error(`${e.code}: ${e.message}`)
    }
  }
  const content: IRBlock[] = []
  if (thinking) content.push({ type: 'thinking', text: thinking })
  if (text) content.push({ type: 'text', text })
  for (const [id, tb] of toolBufs.entries()) {
    let parsed: Record<string, unknown> = {}
    try { parsed = JSON.parse(tb.args || '{}') } catch { /* keep {} */ }
    content.push({ type: 'tool_use', toolUseId: id, toolName: tb.name, toolInput: parsed })
  }
  return { content, stopReason, usage, messageId }
}
