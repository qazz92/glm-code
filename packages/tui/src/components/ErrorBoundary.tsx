import React from 'react'
import { Box, Text } from 'ink'

interface State { error: Error | null }
interface Props { children: React.ReactNode }

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }
  static getDerivedStateFromError(error: Error): State { return { error } }
  componentDidCatch(error: Error): void {
    process.stderr.write(`[tui error] ${error.stack ?? error.message}\n`)
  }
  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <Box flexDirection="column" padding={1}>
          <Text color="red" bold>TUI crashed:</Text>
          <Text color="red">{this.state.error.message}</Text>
          <Text color="gray">(Press Ctrl-C to exit)</Text>
        </Box>
      )
    }
    return this.props.children
  }
}
