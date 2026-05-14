import React from 'react'
import { Box } from 'ink'
import { ChatMessage } from './ChatMessage.js'
import type { Theme } from '../theme/theme.js'
import type { ChatMessage as ChatMessageType } from '../state/chatLog.js'

export interface ChatLogProps {
  theme: Theme
  messages: ReadonlyArray<ChatMessageType>
  maxRows?: number
}

export function ChatLog({ theme, messages, maxRows = 200 }: ChatLogProps): React.ReactElement {
  // Render the trailing window; the surrounding flex layout clips above.
  const window = messages.length > maxRows ? messages.slice(messages.length - maxRows) : messages
  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1} paddingY={1}>
      {window.map(m => (
        <ChatMessage key={m.id} theme={theme} message={m} />
      ))}
    </Box>
  )
}
