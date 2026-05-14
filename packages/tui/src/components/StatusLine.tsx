import React from 'react'
import { Box, Text } from 'ink'
import type { Theme } from '../theme/theme.js'

export interface StatusLineProps {
  theme: Theme
  model: string
  sessionId: string | null
  ctxPercent: number
  view: 'chat' | 'dashboard'
}

export function StatusLine({ theme, model, sessionId, ctxPercent, view }: StatusLineProps): React.ReactElement {
  const sessSuffix = sessionId ? sessionId.slice(-8) : 'no session'
  const label = view === 'dashboard' ? 'DASHBOARD' : 'CHAT'
  return (
    <Box paddingX={1}>
      <Text backgroundColor={theme.colors.statusBg} color={theme.colors.statusFg}>
        <Text bold>{label} </Text>
        <Text>· {model} </Text>
        <Text>· {sessSuffix} </Text>
        <Text>· ctx {ctxPercent}% </Text>
        <Text color={theme.colors.dim}>· Tab Dashboard · / Cmd · Esc Cancel · Ctrl-D Quit</Text>
      </Text>
    </Box>
  )
}
