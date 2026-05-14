import React from 'react'
import { Box, Text } from 'ink'
import type { Theme } from '../theme/theme.js'
import type { ChatMessage as ChatMessageType } from '../state/chatLog.js'

export interface ChatMessageProps {
  theme: Theme
  message: ChatMessageType
}

const ROLE_LABEL: Record<ChatMessageType['role'], string> = {
  user: 'you',
  assistant: 'glm',
  system: 'sys',
  error: 'err'
}

export function ChatMessage({ theme, message }: ChatMessageProps): React.ReactElement {
  const colorByRole: Record<ChatMessageType['role'], string> = {
    user: theme.colors.userMsg,
    assistant: theme.colors.assistantMsg,
    system: theme.colors.systemMsg,
    error: theme.colors.errorMsg
  }
  const label = ROLE_LABEL[message.role]
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color={colorByRole[message.role]} bold>{`${label} ›`}</Text>
        {message.streaming && (
          <Text color={theme.colors.dim}>{' …'}</Text>
        )}
      </Box>
      <Box paddingLeft={2}>
        <Text color={colorByRole[message.role]}>{message.text || ' '}</Text>
      </Box>
    </Box>
  )
}
