import { describe, expect, test } from 'vitest'
import { parseOpenAIStream } from '../../src/stream/openai-parser.js'
import type { StreamEvent } from '../../src/stream/sse.js'
import type { SSEEvent } from '../../src/stream/sse.js'

async function* fromSSE(lines: unknown[]): AsyncIterable<SSEEvent> {
  for (const l of lines) yield { event: undefined, data: typeof l === 'string' ? l : JSON.stringify(l) }
}

async function collect(iter: AsyncIterable<StreamEvent>): Promise<StreamEvent[]> {
  const out: StreamEvent[] = []
  for await (const e of iter) out.push(e)
  return out
}

describe('parseOpenAIStream', () => {
  test('text deltas + finish_reason=stop', async () => {
    const events = await collect(parseOpenAIStream(fromSSE([
      { id: 'c1', model: 'GLM-4.5-Air', choices: [{ index: 0, delta: { role: 'assistant' } }] },
      { id: 'c1', model: 'GLM-4.5-Air', choices: [{ index: 0, delta: { content: 'Hel' } }] },
      { id: 'c1', model: 'GLM-4.5-Air', choices: [{ index: 0, delta: { content: 'lo' } }] },
      { id: 'c1', model: 'GLM-4.5-Air', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 4, completion_tokens: 2 } },
      '[DONE]',
    ])))
    expect(events[0]).toMatchObject({ type: 'message_start', messageId: 'c1' })
    expect(events.filter(e => e.type === 'text_delta').map(e => (e as Extract<StreamEvent, { type: 'text_delta' }>).text)).toEqual(['Hel', 'lo'])
    expect(events.find(e => e.type === 'message_stop')).toMatchObject({ stopReason: 'end_turn' })
    expect(events.find(e => e.type === 'usage')).toMatchObject({ usage: { inputTokens: 4, outputTokens: 2 } })
  })

  test('tool_calls accumulation across chunks', async () => {
    const events = await collect(parseOpenAIStream(fromSSE([
      { id: 'c2', model: 'GLM-4.5-Air', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'Read', arguments: '' } }] } }] },
      { id: 'c2', model: 'GLM-4.5-Air', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '{"pa' } }] } }] },
      { id: 'c2', model: 'GLM-4.5-Air', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: 'th":"x"}' } }] } }] },
      { id: 'c2', model: 'GLM-4.5-Air', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 3, completion_tokens: 5 } },
      '[DONE]',
    ])))
    expect(events.find(e => e.type === 'tool_use_start')).toMatchObject({ id: 'call_1', name: 'Read' })
    const deltas = events.filter(e => e.type === 'tool_use_input_delta')
    expect(deltas.length).toBe(2)
    expect(events.find(e => e.type === 'message_stop')).toMatchObject({ stopReason: 'tool_use' })
  })
})
