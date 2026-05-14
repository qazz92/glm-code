import { Command } from 'commander'
import kleur from 'kleur'
import { ensureDaemonRunning } from '../auto-spawn.js'
import { RpcClient } from '../rpc-client.js'
import { registerCommand } from '../registry.js'

export function registerChatCommand(program: Command): void {
  program
    .argument('[text...]', 'text to send (P1: echoes back)')
    .option('-s, --session <id>', 'existing session to use')
    .description('Send a chat turn (default command)')
    .action(async (textParts: string[], opts: { session?: string }) => {
      const text = textParts.join(' ').trim()
      if (!text) {
        program.help()
        return
      }
      await ensureDaemonRunning()
      const cli = new RpcClient(); await cli.connect()
      let sid = opts.session
      if (!sid) {
        const s = await cli.call<{ id: string }>('session.create', { cwd: process.cwd(), initialTask: text })
        sid = s.id
      }
      const r = await cli.call<{ content: string; model: string }>('message.send', { sessionId: sid, text })
      cli.close()
      console.log(`${kleur.cyan('assistant')} [${r.model}]  ${r.content}`)
      console.log(kleur.gray(`session ${sid?.slice(0,10)}…`))
    })
}

registerCommand(registerChatCommand)
