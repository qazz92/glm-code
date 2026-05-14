import { Command } from 'commander'
import { registerCommand } from '../registry.js'
import { RpcClient } from '../rpc-client.js'
import { ensureDaemonRunning } from '../auto-spawn.js'
import kleur from 'kleur'

export function registerToolCommand(program: Command): void {
  const cmd = program.command('tool').description('tool registry interaction (developer surface)')

  cmd.command('list').description('list all registered tools').action(async () => {
    await ensureDaemonRunning()
    const client = new RpcClient()
    await client.connect()
    const tools = await client.call<Array<{ name: string; description: string }>>('tool.list')
    for (const t of tools) {
      console.log(`${kleur.cyan(t.name.padEnd(14))}  ${t.description}`)
    }
    client.close()
  })

  cmd
    .command('call <name>')
    .description('call a tool with JSON params (from --params or stdin)')
    .option('-p, --params <json>', 'JSON params payload')
    .option('-s, --session <id>', 'session id (for session-scoped tools)')
    .action(async (name: string, opts: { params?: string; session?: string }) => {
      const params = opts.params ? JSON.parse(opts.params) : await readStdinJson()
      await ensureDaemonRunning()
      const client = new RpcClient()
      await client.connect()
      const r = await client.call('tool.call', { name, params, sessionId: opts.session ?? undefined })
      console.log(JSON.stringify(r, null, 2))
      client.close()
    })
}

async function readStdinJson(): Promise<unknown> {
  if (process.stdin.isTTY) return {}
  const chunks: Buffer[] = []
  for await (const c of process.stdin) chunks.push(c as Buffer)
  const text = Buffer.concat(chunks).toString('utf-8').trim()
  return text ? JSON.parse(text) : {}
}

registerCommand(registerToolCommand)
