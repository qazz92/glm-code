import type { TuiRpcClient } from '../rpc/TuiRpcClient.js'
import type { ChatLog } from '../state/chatLog.js'
import type { SessionState } from '../state/sessionState.js'
import type { ViewRouter } from '../state/viewRouter.js'

export interface SlashContext {
  rpc: TuiRpcClient
  chatLog: ChatLog
  session: SessionState
  viewRouter: ViewRouter
  exit: () => void
}

export interface SlashResult {
  kind: 'system' | 'error' | 'silent'
  text: string
}

export interface SlashCommand {
  name: string
  summary: string
  usage?: string
  run: (args: string[], ctx: SlashContext) => Promise<SlashResult>
}

export interface SlashRegistry {
  register(cmd: SlashCommand): void
  get(name: string): SlashCommand | undefined
  list(): SlashCommand[]
  completions(prefix: string): SlashCommand[]
  dispatch(parsed: { name: string; args: string[] }, ctx: SlashContext): Promise<SlashResult>
}

export function createRegistry(): SlashRegistry {
  const map = new Map<string, SlashCommand>()
  return {
    register(cmd) { map.set(cmd.name, cmd) },
    get: (name) => map.get(name),
    list: () => [...map.values()].sort((a, b) => a.name.localeCompare(b.name)),
    completions(prefix) {
      return [...map.values()]
        .filter(c => c.name.startsWith(prefix))
        .sort((a, b) => a.name.localeCompare(b.name))
    },
    async dispatch({ name, args }, ctx) {
      const cmd = map.get(name)
      if (!cmd) return { kind: 'error', text: `unknown command: /${name}` }
      try { return await cmd.run(args, ctx) }
      catch (e) { return { kind: 'error', text: (e as Error).message } }
    }
  }
}
