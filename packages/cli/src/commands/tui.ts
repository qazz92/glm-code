import { Command } from 'commander'
import { ensureDaemonRunning } from '../auto-spawn.js'
import { runTui } from '@glm/tui'
import { registerCommand } from '../registry.js'

export function registerTuiCommand(program: Command): void {
  program
    .command('tui')
    .description('Launch the Ink TUI (chat REPL + dashboard)')
    .option('--session <id>', 'attach to a specific session id')
    .action(async (opts: { session?: string }) => {
      await ensureDaemonRunning()
      await runTui({ sessionId: opts.session })
    })
}

registerCommand(registerTuiCommand)
