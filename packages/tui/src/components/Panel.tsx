import React from 'react'
import { Box, Text } from 'ink'
import type { Theme } from '../theme/theme.js'

export interface PanelProps {
  theme: Theme
  title: string
  width?: number | string
  height?: number | string
  children?: React.ReactNode
}

export function Panel({ theme, title, width, height, children }: PanelProps): React.ReactElement {
  return (
    <Box
      borderStyle="round"
      borderColor={theme.colors.panelBorder}
      flexDirection="column"
      width={width}
      height={height}
      paddingX={1}
    >
      <Box>
        <Text color={theme.colors.accent} bold>{title}</Text>
      </Box>
      <Box flexDirection="column" flexGrow={1}>
        {children}
      </Box>
    </Box>
  )
}
