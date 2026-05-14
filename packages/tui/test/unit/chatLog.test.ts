import { describe, expect, test } from 'vitest'
import { createChatLog } from '../../src/state/chatLog.js'

describe('chatLog', () => {
  test('append adds messages in order', () => {
    const log = createChatLog()
    log.appendUserMessage('hello')
    log.appendAssistantMessage('world')
    expect(log.snapshot().map(m => m.text)).toEqual(['hello', 'world'])
    expect(log.snapshot().map(m => m.role)).toEqual(['user', 'assistant'])
  })

  test('streaming partial accumulates and finalizes', () => {
    const log = createChatLog()
    log.beginAssistantStream('msg-1')
    log.appendStreamChunk('msg-1', 'Hel')
    log.appendStreamChunk('msg-1', 'lo, ')
    log.appendStreamChunk('msg-1', 'world')
    log.endStream('msg-1')
    expect(log.snapshot()).toHaveLength(1)
    expect(log.snapshot()[0]!.text).toBe('Hello, world')
    expect(log.snapshot()[0]!.streaming).toBe(false)
  })

  test('endStream with no chunks still finalizes empty message', () => {
    const log = createChatLog()
    log.beginAssistantStream('m-2')
    log.endStream('m-2')
    expect(log.snapshot()).toHaveLength(1)
    expect(log.snapshot()[0]!.text).toBe('')
  })

  test('error messages are flagged', () => {
    const log = createChatLog()
    log.appendError('boom')
    expect(log.snapshot()[0]!.role).toBe('error')
    expect(log.snapshot()[0]!.text).toBe('boom')
  })

  test('subscribe receives change notifications', () => {
    const log = createChatLog()
    let calls = 0
    log.subscribe(() => { calls++ })
    log.appendUserMessage('x')
    log.appendUserMessage('y')
    expect(calls).toBe(2)
  })
})
