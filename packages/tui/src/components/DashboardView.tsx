import React, { useEffect, useState } from 'react'
import { Box, Text } from 'ink'
import type { Theme } from '../theme/theme.js'
import { Panel } from './Panel.js'
import type { TuiRpcClient } from '../rpc/TuiRpcClient.js'

export interface DashboardViewProps {
  theme: Theme
  rpc: TuiRpcClient
}

interface DaemonStatus { pid: number; uptimeMs: number; version: string }
interface SessionRow { id: string; updatedAt: string; cwd: string }

export function DashboardView({ theme, rpc }: DashboardViewProps): React.ReactElement {
  const [status, setStatus] = useState<DaemonStatus | null>(null)
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    async function refresh(): Promise<void> {
      try {
        const s = await rpc.call<DaemonStatus>('daemon.status')
        const list = await rpc.call<SessionRow[]>('session.list', { limit: 5 })
        if (!mounted) return
        setStatus(s)
        setSessions(list)
        setError(null)
      } catch (e) {
        if (!mounted) return
        setError((e as Error).message)
      }
    }
    refresh()
    const t = setInterval(refresh, 2000)
    return () => { mounted = false; clearInterval(t) }
  }, [rpc])

  return (
    <Box flexDirection="column" flexGrow={1} padding={1}>
      <Box flexDirection="row" flexGrow={1}>
        <Box flexDirection="column" width="50%">
          <Panel theme={theme} title="Orchestrator">
            <Text color={theme.colors.dim}>no orchestrator yet (P8)</Text>
            <Text color={theme.colors.dim}>decision log, fan-out tree, model routing will land here.</Text>
          </Panel>
          <Panel theme={theme} title="Main">
            <Text color={theme.colors.fg}>
              {sessions[0] ? `active session: ${sessions[0].id.slice(-8)} (${sessions[0].cwd})` : 'no sessions'}
            </Text>
          </Panel>
        </Box>
        <Box flexDirection="column" width="50%">
          <Panel theme={theme} title="Workers">
            <Text color={theme.colors.dim}>no workers yet (P8)</Text>
            <Text color={theme.colors.dim}>sub-agent fan-out + state machine will populate this panel.</Text>
          </Panel>
          <Panel theme={theme} title="Status">
            {error ? (
              <Text color={theme.colors.errorMsg}>error: {error}</Text>
            ) : status ? (
              <>
                <Text>pid: {status.pid}</Text>
                <Text>uptime: {Math.round(status.uptimeMs / 1000)}s</Text>
                <Text>version: {status.version}</Text>
                <Text color={theme.colors.dim}>sessions (5 most recent):</Text>
                {sessions.map(s => (
                  <Text key={s.id} color={theme.colors.dim}>{`  ${s.id.slice(-8)}  ${s.updatedAt}`}</Text>
                ))}
              </>
            ) : (
              <Text color={theme.colors.dim}>loading…</Text>
            )}
          </Panel>
        </Box>
      </Box>
    </Box>
  )
}
