import React, { useMemo, useState } from 'react'
import { Box } from 'ink'
import type { Theme } from '../theme/theme.js'
import { ChatLog } from './ChatLog.js'
import { InputBox } from './InputBox.js'
import { SlashMenu, type SlashMenuItem } from './SlashMenu.js'
import type { ChatLog as ChatLogStore } from '../state/chatLog.js'
import type { SessionState } from '../state/sessionState.js'
import type { ViewRouter } from '../state/viewRouter.js'
import type { SlashRegistry, SlashContext } from '../slash/registry.js'
import { createDispatcher } from '../slash/dispatcher.js'
import { useStore } from '../hooks/useStore.js'
import { useStreamingMessage } from '../hooks/useStreamingMessage.js'
import type { TuiRpcClient } from '../rpc/TuiRpcClient.js'

export interface ChatViewProps {
  theme: Theme
  chatLog: ChatLogStore
  session: SessionState
  viewRouter: ViewRouter
  registry: SlashRegistry
  rpc: TuiRpcClient
  exit: () => void
}

export function ChatView(props: ChatViewProps): React.ReactElement {
  const { theme, chatLog, session, viewRouter, registry, rpc, exit } = props
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)

  // re-render when messages mutate
  useStore({
    get: () => chatLog.snapshot(),
    subscribe: chatLog.subscribe
  })
  useStreamingMessage(rpc, chatLog)

  // workflow + command-loader registries don't exist yet at P2 (P9 / P4); pass undefined.
  const dispatch = useMemo(
    () => createDispatcher({ builtin: registry }),
    [registry]
  )

  const completions: SlashMenuItem[] = useMemo(() => {
    if (!input.startsWith('/')) return []
    const prefix = input.slice(1).split(' ')[0] ?? ''
    return registry.completions(prefix).map(c => ({ name: c.name, summary: c.summary }))
  }, [input, registry])

  async function handleSubmit(text: string): Promise<void> {
    if (!text.trim() || sending) return
    setInput('')
    if (text.startsWith('/')) {
      const ctx: SlashContext = { rpc, chatLog, session, viewRouter, exit }
      const result = await dispatch(text, ctx)
      if (result && result.kind === 'system') chatLog.appendSystemMessage(result.text)
      else if (result && result.kind === 'error') chatLog.appendError(result.text)
      return
    }
    // Plain chat → call P1 stub `message.send` (echo). Real streaming arrives in P6.
    chatLog.appendUserMessage(text)
    const s = session.get()
    if (!s) { chatLog.appendError('no active session'); return }
    setSending(true)
    try {
      const resp = await rpc.call<{ content: string; model: string }>('message.send', {
        sessionId: s.id,
        text
      })
      chatLog.appendAssistantMessage(resp.content)
    } catch (e) {
      chatLog.appendError((e as Error).message)
    } finally {
      setSending(false)
    }
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      <ChatLog theme={theme} messages={chatLog.snapshot()} />
      {completions.length > 0 && (
        <SlashMenu theme={theme} items={completions} selectedIndex={0} />
      )}
      <InputBox
        theme={theme}
        value={input}
        onChange={setInput}
        onSubmit={handleSubmit}
        disabled={sending}
      />
    </Box>
  )
}
