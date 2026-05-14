import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { GLMAnthropicProvider } from '../../src/provider/glm-anthropic.js'
import { startMockZai, type MockHandle } from '../fixtures/mock-zai-server.js'
import type { IRRequest } from '../../src/ir/types.js'

let mock: MockHandle
beforeEach(async () => { mock = await startMockZai() })
afterEach(async () => { await mock.close() })

describe('GLMAnthropicProvider (integration)', () => {
  test('streams text from mock z.ai server', async () => {
    const p = new GLMAnthropicProvider({ apiKey: 'test', baseUrl: `${mock.baseUrl}/api/anthropic` })
    const req: IRRequest = {
      model: 'GLM-5.1',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    }
    const events: any[] = []
    for await (const e of p.call(req)) events.push(e)
    const text = events.filter(e => e.type === 'text_delta').map((e: any) => e.text).join('')
    expect(text).toBe('Hello world')
    expect(events.find(e => e.type === 'message_stop')).toBeDefined()
  })

  test('surfaces HTTP error as throwable', async () => {
    await mock.close()
    mock = await startMockZai({ failNTimesWith: { count: 1, status: 401, body: 'unauth' } })
    const p = new GLMAnthropicProvider({ apiKey: 'bad', baseUrl: `${mock.baseUrl}/api/anthropic` })
    const req: IRRequest = {
      model: 'GLM-5.1',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    }
    await expect(async () => {
      for await (const _ of p.call(req)) void _
    }).rejects.toThrow(/401/)
  })
})
