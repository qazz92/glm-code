import { describe, expect, test } from 'vitest'
import { z } from 'zod'
import { ToolRegistry } from '../../../src/tools/registry.js'
import { makeNullContext } from '../../../src/tools/context.js'

describe('ToolRegistry', () => {
  test('register + list returns descriptor', () => {
    const reg = new ToolRegistry()
    reg.register({
      name: 'ping', description: 'returns pong', schema: z.object({}),
      run: async () => ({ ok: true, data: 'pong' }),
    })
    const list = reg.list()
    expect(list).toHaveLength(1)
    expect(list[0]?.name).toBe('ping')
  })

  test('duplicate register throws', () => {
    const reg = new ToolRegistry()
    const tool = { name: 'x', description: '', schema: z.object({}), run: async () => 1 }
    reg.register(tool)
    expect(() => reg.register(tool)).toThrow(/already registered/i)
  })

  test('unregister removes a tool by name', () => {
    const reg = new ToolRegistry()
    const tool = { name: 'unreg', description: '', schema: z.object({}), run: async () => 1 }
    reg.register(tool)
    expect(reg.has('unreg')).toBe(true)
    reg.unregister('unreg')
    expect(reg.has('unreg')).toBe(false)
    expect(() => reg.register(tool)).not.toThrow()
  })

  test('call validates params against zod schema', async () => {
    const reg = new ToolRegistry()
    reg.register({
      name: 'echo', description: '', schema: z.object({ msg: z.string() }),
      run: async (p) => (p as any).msg,
    })
    const ok = await reg.call('echo', { msg: 'hi' }, makeNullContext())
    expect(ok.ok).toBe(true)
    expect(ok.ok && ok.data).toBe('hi')
    const bad = await reg.call('echo', { msg: 42 }, makeNullContext())
    expect(bad.ok).toBe(false)
    expect(!bad.ok && bad.error.code).toBe('VALIDATION_ERROR')
  })

  test('call returns NOT_FOUND for unknown tool', async () => {
    const reg = new ToolRegistry()
    const r = await reg.call('nope', {}, makeNullContext())
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error.code).toBe('NOT_FOUND')
  })

  test('run errors are caught and shaped as RUNTIME_ERROR', async () => {
    const reg = new ToolRegistry()
    reg.register({
      name: 'boom', description: '', schema: z.object({}),
      run: async () => { throw new Error('kaboom') },
    })
    const r = await reg.call('boom', {}, makeNullContext())
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error.code).toBe('RUNTIME_ERROR')
  })
})
