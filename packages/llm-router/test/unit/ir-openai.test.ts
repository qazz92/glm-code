import { describe, expect, test } from 'vitest'
import type { IRRequest } from '../../src/ir/types.js'
import { irToOpenAI } from '../../src/ir/to-openai.js'
import { openaiToIRResponse } from '../../src/ir/from-openai.js'

describe('irToOpenAI', () => {
  test('maps system prompt to role:system and drops thinking blocks', () => {
    const req: IRRequest = {
      model: 'GLM-5.1',
      endpoint: 'openai',
      system: 'You are helpful.',
      messages: [
        {
          role: 'assistant',
          content: [
            { type: 'thinking', text: 'internal monologue' },
            { type: 'text', text: 'the answer is 42' },
          ],
        },
      ],
    }
    const wire = irToOpenAI(req)
    expect(wire.messages[0]).toEqual({ role: 'system', content: 'You are helpful.' })
    // thinking dropped, only text remains
    expect(wire.messages[1]).toEqual({ role: 'assistant', content: 'the answer is 42' })
  })

  test('maps tool_use to tool_calls and tool_result to role:tool', () => {
    const req: IRRequest = {
      model: 'GLM-5.1',
      endpoint: 'openai',
      messages: [
        {
          role: 'assistant',
          content: [{ type: 'tool_use', toolUseId: 'call_1', toolName: 'bash', toolInput: { cmd: 'ls' } }],
        },
        {
          role: 'tool',
          content: [{ type: 'tool_result', toolUseId: 'call_1', content: 'file.txt' }],
        },
      ],
      tools: [{ name: 'bash', description: 'Run shell', inputSchema: { type: 'object', properties: {} } }],
    }
    const wire = irToOpenAI(req)
    expect(wire.messages[0].role).toBe('assistant')
    expect(wire.messages[0].tool_calls).toBeDefined()
    expect(wire.messages[0].tool_calls![0]).toEqual({
      id: 'call_1',
      type: 'function',
      function: { name: 'bash', arguments: '{"cmd":"ls"}' },
    })
    expect(wire.messages[1].role).toBe('tool')
    expect(wire.tools?.[0]).toEqual({
      type: 'function',
      function: { name: 'bash', description: 'Run shell', parameters: { type: 'object', properties: {} } },
    })
  })

  test('round-trip preserves content and tool_calls', () => {
    const wire = {
      model: 'GLM-5.1',
      choices: [{
        message: {
          role: 'assistant',
          content: 'Sure thing',
          tool_calls: [{ id: 'tc1', type: 'function' as const, function: { name: 'search', arguments: '{"q":"hi"}' } }],
        },
        finish_reason: 'stop',
      }],
      usage: { prompt_tokens: 50, completion_tokens: 20 },
    }
    const ir = openaiToIRResponse(wire)
    expect(ir.content).toHaveLength(2)
    expect(ir.content[0]).toEqual({ type: 'text', text: 'Sure thing' })
    expect(ir.content[1]).toEqual({ type: 'tool_use', toolUseId: 'tc1', toolName: 'search', toolInput: { q: 'hi' } })
    expect(ir.usage.inputTokens).toBe(50)
    expect(ir.stopReason).toBe('stop')
  })

  test('handles empty choices gracefully', () => {
    const wire = {
      model: 'GLM-5.1',
      choices: [],
      usage: { prompt_tokens: 0, completion_tokens: 0 },
    }
    const ir = openaiToIRResponse(wire)
    expect(ir.content).toEqual([])
    expect(ir.usage.inputTokens).toBe(0)
  })
})
