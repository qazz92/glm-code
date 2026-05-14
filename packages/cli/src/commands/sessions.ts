import { Command } from 'commander'
import kleur from 'kleur'
import { ensureDaemonRunning } from '../auto-spawn.js'
import { RpcClient } from '../rpc-client.js'
import { registerCommand } from '../registry.js'

interface SessionRow {
  id: string; createdAt: string; updatedAt: string;
  cwd: string; worktree: string; initialTask: string | null; active: boolean
}

export function registerSessionsCommand(program: Command): void {
  program.command('sessions')
    .description('List sessions')
    .option('--limit <n>', 'max rows', '20')
    .option('--all', 'include inactive', false)
    .action(async (opts: { limit: string; all: boolean }) => {
      await ensureDaemonRunning()
      const cli = new RpcClient(); await cli.connect()
      const rows = await cli.call<SessionRow[]>('session.list', { limit: Number(opts.limit), activeOnly: !opts.all })
      cli.close()
      if (rows.length === 0) { console.log(kleur.gray('(no sessions)')); return }
      for (const r of rows) {
        const flag = r.active ? kleur.green('●') : kleur.gray('○')
        console.log(`${flag} ${r.id.slice(0,10)}  ${r.updatedAt}  ${kleur.dim(r.cwd)}  ${r.initialTask ?? ''}`)
      }
    })
}

registerCommand(registerSessionsCommand)
