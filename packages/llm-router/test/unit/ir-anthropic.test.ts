import { describe, expect, test } from 'vitest'
import type { IRRequest, IRResponse } from '../../src/ir/types.js'
import { irToAnthropic } from '../../src/ir/to-anthropic.js'
import { anthropicToIRResponse } from '../../src/ir/from-anthropic.js'

describe('irToAnthropic', () => {
  test('maps system + user/assistant messages with cache_control', () => {
    const req: IRRequest = {
      model: 'GLM-5.1',
      endpoint: 'anthropic',
      system: 'You are helpful.',
      cacheControl: 'ephemeral',
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'hello' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'hi there' }] },
      ],
    }
    const wire = irToAnthropic(req)
    expect(wire.model).toBe('GLM-5.1')
    expect(wire.max_tokens).toBe(4096)
    expect(wire.system).toEqual([{ type: 'text', text: 'You are helpful.', cache_control: { type: 'ephemeral' } }])
    expect(wire.messages[0].role).toBe('user')
    expect(wire.messages[0].content[0]).toEqual({ type: 'text', text: 'hello' })
    expect(wire.messages[1].role).toBe('assistant')
  })

  test('maps tool role to user and includes tool definitions', () => {
    const req: IRRequest = {
      model: 'GLM-5.1',
      endpoint: 'anthropic',
      messages: [
        { role: 'assistant', content: [{ type: 'tool_use', toolUseId: 'tu1', toolName: 'bash', toolInput: { cmd: 'ls' } }] },
        { role: 'tool', content: [{ type: 'tool_result', toolUseId: 'tu1', content: 'file.txt' }] },
      ],
      tools: [{ name: 'bash', description: 'Run shell', inputSchema: { type: 'object', properties: { cmd: { type: 'string' } } } }],
    }
    const wire = irToAnthropic(req)
    // tool role → user
    expect(wire.messages[1].role).toBe('user')
    expect(wire.messages[1].content[0]).toEqual({ type: 'tool_result', tool_use_id: 'tu1', content: 'file.txt' })
    // tool_use block preserved
    expect(wire.messages[0].content[0]).toEqual({ type: 'tool_use', id: 'tu1', name: 'bash', input: { cmd: 'ls' } })
    // tools array mapped
    expect(wire.tools?.[0]).toEqual({ name: 'bash', description: 'Run shell', input_schema: { type: 'object', properties: { cmd: { type: 'string' } } } })
  })

  test('round-trip through to-anthropic → from-anthropic preserves content types', () => {
    const wire = {
      content: [
        { type: 'thinking', thinking: 'hmm' },
        { type: 'text', text: 'answer' },
        { type: 'tool_use', id: 'id1', name: 'search', input: { q: 'test' } },
      ],
      model: 'GLM-5.1',
      usage: { input_tokens: 100, output_tokens: 50 },
      stop_reason: 'end_turn',
    }
    const ir = anthropicToIRResponse(wire)
    expect(ir.content).toHaveLength(3)
    expect(ir.content[0]).toEqual({ type: 'thinking', text: 'hmm' })
    expect(ir.content[1]).toEqual({ type: 'text', text: 'answer' })
    expect(ir.content[2]).toEqual({ type: 'tool_use', toolUseId: 'id1', toolName: 'search', toolInput: { q: 'test' } })
    expect(ir.usage.inputTokens).toBe(100)
    expect(ir.stopReason).toBe('end_turn')
  })
})
