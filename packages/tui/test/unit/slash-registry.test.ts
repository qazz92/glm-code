import { describe, expect, test, vi } from 'vitest'
import { createRegistry, type SlashCommand } from '../../src/slash/registry.js'

describe('slash registry', () => {
  test('register + lookup', () => {
    const r = createRegistry()
    const cmd: SlashCommand = { name: 'echo', summary: 'echo back', run: async () => ({ kind: 'system', text: 'pong' }) }
    r.register(cmd)
    expect(r.get('echo')?.summary).toBe('echo back')
  })

  test('list returns sorted command names', () => {
    const r = createRegistry()
    r.register({ name: 'zeta', summary: '', run: async () => ({ kind: 'system', text: '' }) })
    r.register({ name: 'alpha', summary: '', run: async () => ({ kind: 'system', text: '' }) })
    expect(r.list().map(c => c.name)).toEqual(['alpha', 'zeta'])
  })

  test('completions prefix match', () => {
    const r = createRegistry()
    r.register({ name: 'help',   summary: '', run: async () => ({ kind: 'system', text: '' }) })
    r.register({ name: 'history',summary: '', run: async () => ({ kind: 'system', text: '' }) })
    r.register({ name: 'quit',   summary: '', run: async () => ({ kind: 'system', text: '' }) })
    expect(r.completions('h').map(c => c.name)).toEqual(['help', 'history'])
    expect(r.completions('').map(c => c.name)).toEqual(['help', 'history', 'quit'])
  })

  test('dispatch invokes matching command', async () => {
    const r = createRegistry()
    const fn = vi.fn(async () => ({ kind: 'system' as const, text: 'ok' }))
    r.register({ name: 'ping', summary: '', run: fn })
    const out = await r.dispatch({ name: 'ping', args: ['a','b'] }, {} as any)
    expect(fn).toHaveBeenCalledWith(['a','b'], {})
    expect(out.text).toBe('ok')
  })

  test('dispatch on unknown returns error result', async () => {
    const r = createRegistry()
    const out = await r.dispatch({ name: 'nope', args: [] }, {} as any)
    expect(out.kind).toBe('error')
    expect(out.text).toContain('unknown')
  })

  test('default registry registers /history, /context, /compact', async () => {
    const { buildDefaultRegistry } = await import('../../src/slash/index.js')
    const r = buildDefaultRegistry()
    expect(r.get('history')?.summary).toMatch(/history|scrollback/i)
    expect(r.get('context')?.summary).toMatch(/context/i)
    expect(r.get('compact')?.summary).toMatch(/compact/i)
  })

  test('/context invokes rpc.call("context.assemble")', async () => {
    const { buildDefaultRegistry } = await import('../../src/slash/index.js')
    const r = buildDefaultRegistry()
    const rpc = { call: vi.fn(async () => ({ tokens: 42, parts: [] })) }
    const out = await r.dispatch({ name: 'context', args: [] }, { rpc, chatLog: {}, session: {}, viewRouter: {}, exit: () => {} } as any)
    expect(rpc.call).toHaveBeenCalledWith('context.assemble', expect.any(Object))
    expect(out.kind).toBe('system')
  })

  test('/context fails gracefully when context.assemble returns method-not-found', async () => {
    const { buildDefaultRegistry } = await import('../../src/slash/index.js')
    const r = buildDefaultRegistry()
    const rpc = { call: vi.fn(async () => { throw new Error('method not found: context.assemble') }) }
    const out = await r.dispatch({ name: 'context', args: [] }, { rpc, chatLog: {}, session: {}, viewRouter: {}, exit: () => {} } as any)
    expect(out.kind).toBe('system')
    expect(out.text).toMatch(/not ready|not yet implemented|P7/i)
  })

  test('/compact invokes rpc.call("context.compact") with focus', async () => {
    const { buildDefaultRegistry } = await import('../../src/slash/index.js')
    const r = buildDefaultRegistry()
    const rpc = { call: vi.fn(async () => ({ before: 1000, after: 200 })) }
    const out = await r.dispatch({ name: 'compact', args: ['planning'] }, { rpc, chatLog: {}, session: {}, viewRouter: {}, exit: () => {} } as any)
    expect(rpc.call).toHaveBeenCalledWith('context.compact', { focus: 'planning' })
    expect(out.kind).toBe('system')
  })

  test('/compact fails gracefully when context.compact returns method-not-found', async () => {
    const { buildDefaultRegistry } = await import('../../src/slash/index.js')
    const r = buildDefaultRegistry()
    const rpc = { call: vi.fn(async () => { throw new Error('method not found: context.compact') }) }
    const out = await r.dispatch({ name: 'compact', args: [] }, { rpc, chatLog: {}, session: {}, viewRouter: {}, exit: () => {} } as any)
    expect(out.kind).toBe('system')
    expect(out.text).toMatch(/not ready|not yet implemented|P7/i)
  })

  test('/history opens scrollback (sets viewRouter or returns system msg)', async () => {
    const { buildDefaultRegistry } = await import('../../src/slash/index.js')
    const r = buildDefaultRegistry()
    const chatLog = { snapshot: vi.fn(() => [{ role: 'user', text: 'hi' }]) }
    const out = await r.dispatch({ name: 'history', args: [] }, { rpc: {}, chatLog, session: {}, viewRouter: {}, exit: () => {} } as any)
    expect(out.kind).toBe('system')
  })

  test('default registry has all 8 commands', async () => {
    const { buildDefaultRegistry } = await import('../../src/slash/index.js')
    const r = buildDefaultRegistry()
    const names = r.list().map(c => c.name)
    expect(names).toContain('help')
    expect(names).toContain('quit')
    expect(names).toContain('sessions')
    expect(names).toContain('attach')
    expect(names).toContain('daemon')
    expect(names).toContain('history')
    expect(names).toContain('context')
    expect(names).toContain('compact')
    expect(names).toHaveLength(8)
  })

  test('/help lists all registered commands', async () => {
    const { buildDefaultRegistry } = await import('../../src/slash/index.js')
    const r = buildDefaultRegistry()
    const out = await r.dispatch({ name: 'help', args: [] }, { rpc: {}, chatLog: {}, session: {}, viewRouter: {}, exit: () => {} } as any)
    expect(out.kind).toBe('system')
    expect(out.text).toContain('/help')
    expect(out.text).toContain('/quit')
    expect(out.text).toContain('/sessions')
  })
})
