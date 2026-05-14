import { describe, expect, test } from 'vitest'
import { messageSendStub } from '../../src/rpc/methods/chat.js'

describe('messageSendStub (echo)', () => {
  test('echoes input text back', async () => {
    const r = await messageSendStub({ sessionId: 'abc', text: 'hello world' }, {} as any) as any
    expect(r.content).toBe('hello world')
    expect(r.model).toBe('stub-echo')
    expect(r.role).toBe('assistant')
    expect(r.sessionId).toBe('abc')
    expect(r.ts).toBeTruthy()
  })

  test('validates params', async () => {
    await expect(messageSendStub({}, {} as any)).rejects.toMatchObject({ code: -32602 })
    await expect(messageSendStub({ sessionId: 'x' }, {} as any)).rejects.toMatchObject({ code: -32602 })
    await expect(messageSendStub({ text: 'x' }, {} as any)).rejects.toMatchObject({ code: -32602 })
  })
})
