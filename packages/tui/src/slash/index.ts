import { createRegistry, type SlashRegistry } from './registry.js'
import { helpCommand } from './commands/help.js'
import { quitCommand } from './commands/quit.js'
import { sessionsCommand } from './commands/sessions.js'
import { attachCommand } from './commands/attach.js'
import { daemonCommand } from './commands/daemon.js'
import { historyCommand } from './commands/history.js'
import { contextCommand } from './commands/context.js'
import { compactCommand } from './commands/compact.js'

export * from './parse.js'
export * from './registry.js'
export * from './dispatcher.js'

export function buildDefaultRegistry(): SlashRegistry {
  const r = createRegistry()
  r.register(helpCommand(() => r.list()))
  r.register(quitCommand)
  r.register(sessionsCommand)
  r.register(attachCommand)
  r.register(daemonCommand)
  r.register(historyCommand)
  r.register(contextCommand)
  r.register(compactCommand)
  return r
}
