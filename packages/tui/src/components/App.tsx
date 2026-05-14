import React from 'react'
import { Box, useApp } from 'ink'
import type { Theme } from '../theme/theme.js'
import { ChatView } from './ChatView.js'
import { DashboardView } from './DashboardView.js'
import { StatusLine } from './StatusLine.js'
import { ErrorBoundary } from './ErrorBoundary.js'
import type { ChatLog } from '../state/chatLog.js'
import type { SessionState } from '../state/sessionState.js'
import type { ViewRouter } from '../state/viewRouter.js'
import type { SlashRegistry } from '../slash/registry.js'
import type { TuiRpcClient } from '../rpc/TuiRpcClient.js'
import { useStore } from '../hooks/useStore.js'
import { useKeyBindings } from '../hooks/useKeyBindings.js'

export interface AppProps {
  theme: Theme
  chatLog: ChatLog
  session: SessionState
  viewRouter: ViewRouter
  registry: SlashRegistry
  rpc: TuiRpcClient
}

export function App(props: AppProps): React.ReactElement {
  const { theme, chatLog, session, viewRouter, registry, rpc } = props
  const ink = useApp()

  const currentView = useStore({ get: viewRouter.get, subscribe: viewRouter.subscribe })
  const currentSession = useStore({ get: session.get, subscribe: session.subscribe })

  useKeyBindings({
    onTab: () => viewRouter.toggle(),
    onEscape: () => { /* per-component cancel handled inside views */ },
    onCtrlD: () => { rpc.close(); ink.exit() }
  })

  return (
    <ErrorBoundary>
      <Box flexDirection="column" height="100%">
        <Box flexDirection="column" flexGrow={1}>
          {currentView === 'chat' ? (
            <ChatView
              theme={theme}
              chatLog={chatLog}
              session={session}
              viewRouter={viewRouter}
              registry={registry}
              rpc={rpc}
              exit={() => { rpc.close(); ink.exit() }}
            />
          ) : (
            <DashboardView theme={theme} rpc={rpc} />
          )}
        </Box>
        <StatusLine
          theme={theme}
          model="stub-echo"
          sessionId={currentSession?.id ?? null}
          ctxPercent={0}
          view={currentView}
        />
      </Box>
    </ErrorBoundary>
  )
}
