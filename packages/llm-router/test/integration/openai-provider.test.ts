import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { GLMOpenAIProvider } from '../../src/provider/glm-openai.js'
import { startMockZai, type MockHandle } from '../fixtures/mock-zai-server.js'
import type { IRRequest } from '../../src/ir/types.js'

let mock: MockHandle
beforeEach(async () => { mock = await startMockZai({ openaiSequence: 'tool_use' }) })
afterEach(async () => { await mock.close() })

describe('GLMOpenAIProvider (integration)', () => {
  test('streams text + tool_calls from mock z.ai server', async () => {
    const p = new GLMOpenAIProvider({ apiKey: 'test', baseUrl: `${mock.baseUrl}/api/coding` })
    const req: IRRequest = {
      model: 'GLM-4.5-Air',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'use the tool' }] }],
      tools: [{ name: 'read', description: 'read a file', inputSchema: { type: 'object', properties: { path: { type: 'string' } } } }],
    }
    const events: any[] = []
    for await (const e of p.call(req)) events.push(e)
    expect(events.find(e => e.type === 'tool_use_start')).toMatchObject({ id: 'call_mock', name: 'read' })
    expect(events.find(e => e.type === 'message_stop')).toMatchObject({ stopReason: 'tool_use' })
  })
})
