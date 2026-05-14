import React from 'react'
import { render } from 'ink'
import { App } from './components/App.js'
import { TuiRpcClient } from './rpc/TuiRpcClient.js'
import { buildDefaultRegistry } from './slash/index.js'
import { resolveTheme } from './theme/theme.js'
import { createChatLog } from './state/chatLog.js'
import { createSessionState, type SessionMeta } from './state/sessionState.js'
import { createViewRouter } from './state/viewRouter.js'

export interface RunTuiOpts {
  /** If set, attach to this session id; otherwise attach to most recent or create one. */
  sessionId?: string
}

interface SessionRow { id: string; cwd: string; initialTask: string | null }

export async function runTui(opts: RunTuiOpts = {}): Promise<void> {
  const theme = resolveTheme(process.env)
  const rpc = new TuiRpcClient()
  await rpc.connect()

  const chatLog = createChatLog()
  const session = createSessionState()
  const viewRouter = createViewRouter()
  const registry = buildDefaultRegistry()

  // bootstrap session
  let target: SessionMeta | null = null
  if (opts.sessionId) {
    const row = await rpc.call<SessionRow | null>('session.get', { sessionId: opts.sessionId })
    if (row) target = { id: row.id, cwd: row.cwd, initialTask: row.initialTask }
  }
  if (!target) {
    const recents = await rpc.call<SessionRow[]>('session.list', { limit: 1 })
    if (recents[0]) {
      target = { id: recents[0].id, cwd: recents[0].cwd, initialTask: recents[0].initialTask }
      await rpc.call('session.touch', { sessionId: target.id })
    }
  }
  if (!target) {
    const created = await rpc.call<SessionRow>('session.create', {
      cwd: process.cwd(),
      worktree: process.cwd(),
      initialTask: null
    })
    target = { id: created.id, cwd: created.cwd, initialTask: created.initialTask }
  }
  session.set(target)
  chatLog.appendSystemMessage(`attached to session ${target.id.slice(-8)} (${target.cwd})`)
  chatLog.appendSystemMessage('type /help for commands, Tab for dashboard, Ctrl-D to quit.')

  const { waitUntilExit } = render(
    React.createElement(App, { theme, chatLog, session, viewRouter, registry, rpc })
  )
  await waitUntilExit()
  rpc.close()
}
