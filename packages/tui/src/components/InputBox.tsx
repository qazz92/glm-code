import React from 'react'
import { Box, Text } from 'ink'
import TextInput from 'ink-text-input'
import type { Theme } from '../theme/theme.js'

export interface InputBoxProps {
  theme: Theme
  value: string
  onChange: (v: string) => void
  onSubmit: (v: string) => void
  disabled: boolean
  placeholder?: string
}

export function InputBox({ theme, value, onChange, onSubmit, disabled, placeholder }: InputBoxProps): React.ReactElement {
  return (
    <Box
      borderStyle="round"
      borderColor={theme.colors.panelBorder}
      paddingX={1}
    >
      <Text color={theme.colors.accent}>{'› '}</Text>
      {disabled ? (
        <Text color={theme.colors.dim}>(waiting…)</Text>
      ) : (
        <TextInput
          value={value}
          placeholder={placeholder ?? 'type a message or /command, Enter to send'}
          onChange={onChange}
          onSubmit={onSubmit}
        />
      )}
    </Box>
  )
}
