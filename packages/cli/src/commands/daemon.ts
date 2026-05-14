import { Command } from 'commander'
import kleur from 'kleur'
import { existsSync, readFileSync } from 'node:fs'
import { resolvePaths } from '@glm/shared'
import { ensureDaemonRunning } from '../auto-spawn.js'
import { RpcClient } from '../rpc-client.js'
import { registerCommand } from '../registry.js'

export function registerDaemonCommand(program: Command): void {
  const daemon = program.command('daemon').description('Manage glm daemon')

  daemon.command('start').description('Start the daemon').action(async () => {
    await ensureDaemonRunning()
    console.log(kleur.green('✓') + ' daemon running')
  })

  daemon.command('status').description('Show daemon status').action(async () => {
    const paths = resolvePaths()
    if (!existsSync(paths.socket)) { console.log(kleur.gray('● daemon not running')); return }
    const cli = new RpcClient(); await cli.connect()
    const s = await cli.call<{ pid: number; uptimeMs: number; version: string }>('daemon.status')
    cli.close()
    const pidFromFile = readFileSync(paths.pid, 'utf8').trim()
    console.log(`${kleur.green('●')} pid ${s.pid} (file: ${pidFromFile})  uptime ${Math.round(s.uptimeMs/1000)}s  v${s.version}`)
  })

  daemon.command('stop').description('Stop the daemon').action(async () => {
    const paths = resolvePaths()
    if (!existsSync(paths.socket)) { console.log(kleur.gray('● not running')); return }
    const cli = new RpcClient(); await cli.connect()
    try { await cli.call('daemon.shutdown') } catch { /* normal: socket closes mid-flight */ }
    cli.close()
    console.log(kleur.green('✓') + ' stopped')
  })

  daemon.command('restart').description('Restart the daemon').action(async () => {
    const paths = resolvePaths()
    if (existsSync(paths.socket)) {
      const cli = new RpcClient(); await cli.connect()
      try { await cli.call('daemon.shutdown') } catch { /* ok */ }
      cli.close()
      await new Promise(r => setTimeout(r, 200))
    }
    await ensureDaemonRunning()
    console.log(kleur.green('✓') + ' restarted')
  })
}

registerCommand(registerDaemonCommand)
