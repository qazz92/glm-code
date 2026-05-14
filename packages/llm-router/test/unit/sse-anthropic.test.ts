import { describe, expect, test } from 'vitest'
import { parseAnthropicStream } from '../../src/stream/anthropic-parser.js'
import type { StreamEvent } from '../../src/stream/sse.js'
import type { SSEEvent } from '../../src/stream/sse.js'

async function* fromSSE(frames: { event: string; data: unknown }[]): AsyncIterable<SSEEvent> {
  for (const f of frames) yield { event: f.event, data: typeof f.data === 'string' ? f.data : JSON.stringify(f.data) }
}

async function collect(iter: AsyncIterable<StreamEvent>): Promise<StreamEvent[]> {
  const out: StreamEvent[] = []
  for await (const e of iter) out.push(e)
  return out
}

describe('parseAnthropicStream', () => {
  test('text-only completion', async () => {
    const events = await collect(parseAnthropicStream(fromSSE([
      { event: 'message_start', data: { type: 'message_start', message: { id: 'msg_1', model: 'GLM-5.1', usage: { input_tokens: 10, output_tokens: 0 } } } },
      { event: 'content_block_start', data: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } } },
      { event: 'content_block_delta', data: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hel' } } },
      { event: 'content_block_delta', data: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'lo' } } },
      { event: 'content_block_stop', data: { type: 'content_block_stop', index: 0 } },
      { event: 'message_delta', data: { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 2 } } },
      { event: 'message_stop', data: { type: 'message_stop' } },
    ])))
    expect(events[0]).toMatchObject({ type: 'message_start', messageId: 'msg_1' })
    expect(events.filter(e => e.type === 'text_delta')).toEqual([
      { type: 'text_delta', text: 'Hel' },
      { type: 'text_delta', text: 'lo' },
    ])
    expect(events.find(e => e.type === 'message_stop')).toMatchObject({ type: 'message_stop', stopReason: 'end_turn' })
    const usage = events.find(e => e.type === 'usage') as Extract<StreamEvent, { type: 'usage' }>
    expect(usage.usage.inputTokens).toBe(10)
    expect(usage.usage.outputTokens).toBe(2)
  })

  test('tool_use start + input deltas + stop', async () => {
    const events = await collect(parseAnthropicStream(fromSSE([
      { event: 'message_start', data: { type: 'message_start', message: { id: 'msg_2', model: 'GLM-5.1', usage: { input_tokens: 5, output_tokens: 0 } } } },
      { event: 'content_block_start', data: { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'tu_1', name: 'Read', input: {} } } },
      { event: 'content_block_delta', data: { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"pa' } } },
      { event: 'content_block_delta', data: { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: 'th":"x"}' } } },
      { event: 'content_block_stop', data: { type: 'content_block_stop', index: 0 } },
      { event: 'message_delta', data: { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 4 } } },
      { event: 'message_stop', data: { type: 'message_stop' } },
    ])))
    expect(events.find(e => e.type === 'tool_use_start')).toMatchObject({ id: 'tu_1', name: 'Read' })
    const deltas = events.filter(e => e.type === 'tool_use_input_delta')
    expect(deltas.length).toBe(2)
    expect(events.find(e => e.type === 'tool_use_stop')).toMatchObject({ id: 'tu_1' })
    expect(events.find(e => e.type === 'message_stop')).toMatchObject({ stopReason: 'tool_use' })
  })

  test('thinking deltas', async () => {
    const events = await collect(parseAnthropicStream(fromSSE([
      { event: 'message_start', data: { type: 'message_start', message: { id: 'msg_3', model: 'GLM-5.1', usage: { input_tokens: 1, output_tokens: 0 } } } },
      { event: 'content_block_start', data: { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } } },
      { event: 'content_block_delta', data: { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'reasoning' } } },
      { event: 'content_block_stop', data: { type: 'content_block_stop', index: 0 } },
      { event: 'message_stop', data: { type: 'message_stop' } },
    ])))
    expect(events.find(e => e.type === 'thinking_delta')).toMatchObject({ text: 'reasoning' })
  })
})
