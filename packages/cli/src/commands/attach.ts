import { Command } from 'commander'
import kleur from 'kleur'
import { ensureDaemonRunning } from '../auto-spawn.js'
import { RpcClient } from '../rpc-client.js'
import { registerCommand } from '../registry.js'

export function registerAttachCommand(program: Command): void {
  program.command('attach <sessionId>')
    .description('Attach to an existing session (P1: just verifies it exists)')
    .action(async (sessionId: string) => {
      await ensureDaemonRunning()
      const cli = new RpcClient(); await cli.connect()
      const s = await cli.call<{ id: string; cwd: string; initialTask: string | null } | undefined>('session.get', { sessionId })
      cli.close()
      if (!s) { console.error(kleur.red(`session ${sessionId} not found`)); process.exit(2) }
      console.log(`${kleur.green('●')} attached ${s.id}  cwd=${s.cwd}  task="${s.initialTask ?? ''}"`)
    })
}

registerCommand(registerAttachCommand)
