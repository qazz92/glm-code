import React from 'react'
import { describe, expect, test } from 'vitest'
import { render } from 'ink-testing-library'
import { ChatView } from '../../src/components/ChatView.js'
import { themes } from '../../src/theme/theme.js'
import { createChatLog } from '../../src/state/chatLog.js'
import { createSessionState } from '../../src/state/sessionState.js'
import { createViewRouter } from '../../src/state/viewRouter.js'
import { buildDefaultRegistry } from '../../src/slash/index.js'
import { TuiRpcClient } from '../../src/rpc/TuiRpcClient.js'
import { EventEmitter } from 'node:events'

function fakeRpc(): TuiRpcClient {
  const e = new EventEmitter() as any
  e.write = () => true
  e.end = () => e.emit('close')
  return new TuiRpcClient({ socket: e })
}

describe('<ChatView>', () => {
  test('renders empty state hint when no messages', () => {
    const log = createChatLog()
    const session = createSessionState()
    const view = createViewRouter()
    const reg = buildDefaultRegistry()
    const out = render(
      <ChatView
        theme={themes.dark}
        chatLog={log}
        session={session}
        viewRouter={view}
        registry={reg}
        rpc={fakeRpc()}
        exit={() => {}}
      />
    )
    const frame = out.lastFrame() ?? ''
    expect(frame).toContain('› ')
  })

  test('renders accumulated messages', () => {
    const log = createChatLog()
    log.appendUserMessage('hello')
    log.appendAssistantMessage('hi back')
    const out = render(
      <ChatView
        theme={themes.dark}
        chatLog={log}
        session={createSessionState()}
        viewRouter={createViewRouter()}
        registry={buildDefaultRegistry()}
        rpc={fakeRpc()}
        exit={() => {}}
      />
    )
    const frame = out.lastFrame() ?? ''
    expect(frame).toContain('hello')
    expect(frame).toContain('hi back')
  })
})
