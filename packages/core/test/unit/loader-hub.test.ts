import { describe, expect, test } from 'vitest'
import { LoaderHub } from '../../src/daemon/loader-hub.js'

describe('LoaderHub', () => {
  test('runAll invokes registered subsystems', async () => {
    LoaderHub.reset()
    const calls: string[] = []
    LoaderHub.registerSubsystem('a', async () => { calls.push('a') })
    LoaderHub.registerSubsystem('b', async () => { calls.push('b') })
    await LoaderHub.runAll({} as any)
    expect(calls).toEqual(['a', 'b'])
    LoaderHub.reset()
  })

  test('runAll throws on subsystem failure', async () => {
    LoaderHub.reset()
    LoaderHub.registerSubsystem('bad', async () => { throw new Error('boom') })
    await expect(LoaderHub.runAll({} as any)).rejects.toThrow("LoaderHub subsystem 'bad' failed: boom")
    LoaderHub.reset()
  })

  test('reset clears subsystems', async () => {
    LoaderHub.reset()
    const calls: string[] = []
    LoaderHub.registerSubsystem('x', async () => { calls.push('x') })
    LoaderHub.reset()
    await LoaderHub.runAll({} as any)
    expect(calls).toEqual([])
  })
})
