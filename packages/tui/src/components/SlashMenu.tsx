import React from 'react'
import { Box, Text } from 'ink'
import type { Theme } from '../theme/theme.js'

export interface SlashMenuItem {
  name: string
  summary: string
}

export interface SlashMenuProps {
  theme: Theme
  items: SlashMenuItem[]
  selectedIndex: number
}

export function SlashMenu({ theme, items, selectedIndex }: SlashMenuProps): React.ReactElement | null {
  if (items.length === 0) return null
  return (
    <Box
      borderStyle="round"
      borderColor={theme.colors.panelBorder}
      flexDirection="column"
      paddingX={1}
    >
      {items.map((it, i) => {
        const selected = i === selectedIndex
        return (
          <Box key={it.name}>
            <Text color={selected ? theme.colors.accent : theme.colors.fg} bold={selected}>
              {selected ? '› ' : '  '}/{it.name}
            </Text>
            <Text color={theme.colors.dim}>{`  ${it.summary}`}</Text>
          </Box>
        )
      })}
    </Box>
  )
}
