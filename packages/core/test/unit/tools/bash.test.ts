import { describe, expect, test } from 'vitest'
import { bashTool } from '../../../src/tools/bash/tool.js'
import { makeNullContext } from '../../../src/tools/context.js'

describe('bash tool', () => {
  const ctx = makeNullContext()

  test('captures stdout', async () => {
    const result = await bashTool.run({ command: 'echo hello' }, ctx) as { stdout: string; exitCode: number }
    expect(result.stdout.trim()).toBe('hello')
    expect(result.exitCode).toBe(0)
  })

  test('non-zero exit reflected', async () => {
    const result = await bashTool.run({ command: 'exit 42' }, ctx) as { exitCode: number }
    expect(result.exitCode).toBe(42)
  })

  test('timeout kills process', async () => {
    await expect(bashTool.run({ command: 'sleep 60', timeoutMs: 500 }, ctx))
      .rejects.toThrow('timed out')
  })

  test('captures stderr separately', async () => {
    const result = await bashTool.run({ command: 'echo err >&2 && echo out' }, ctx) as { stdout: string; stderr: string }
    expect(result.stdout.trim()).toBe('out')
    expect(result.stderr.trim()).toBe('err')
  })

  test('cwd overrides ctx.cwd', async () => {
    const result = await bashTool.run({ command: 'pwd', cwd: '/tmp' }, ctx) as { stdout: string }
    expect(result.stdout.trim()).toMatch(/\/tmp$/)
  })

  test('emits stdout events', async () => {
    const events: Array<{ event: string; data: unknown }> = []
    const emitCtx = { ...ctx, emit: (event: string, data: unknown) => events.push({ event, data }) }
    await bashTool.run({ command: 'echo hello' }, emitCtx)
    expect(events.length).toBeGreaterThanOrEqual(1)
    expect(events.some(e => e.event === 'stdout')).toBe(true)
  })
})
