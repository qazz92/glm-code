import { Command } from 'commander'
import kleur from 'kleur'
import { existsSync, statSync } from 'node:fs'
import { resolvePaths } from '@glm/shared'
import { RpcClient } from '../rpc-client.js'
import { readPid, isPidAlive } from '@glm/core'
import { registerCommand } from '../registry.js'

interface Check { name: string; ok: boolean; detail: string }

export function registerDoctorCommand(program: Command): void {
  program.command('doctor')
    .description('Health check (P1: runtime + daemon + socket + db)')
    .action(async () => {
      const checks: Check[] = []
      const paths = resolvePaths()
      const major = Number(process.versions.node.split('.')[0])
      checks.push({ name: 'Node >= 22', ok: major >= 22, detail: process.versions.node })
      checks.push({ name: '~/.glm exists', ok: existsSync(paths.root), detail: paths.root })
      checks.push({ name: 'daemon.pid', ok: existsSync(paths.pid), detail: paths.pid })

      const pid = readPid(paths.pid)
      checks.push({ name: 'daemon PID alive', ok: !!pid && isPidAlive(pid), detail: pid ? `pid ${pid}` : '(no pid)' })
      checks.push({ name: 'daemon.sock exists', ok: existsSync(paths.socket), detail: paths.socket })

      if (existsSync(paths.socket)) {
        try {
          const cli = new RpcClient(); await cli.connect()
          const s = await cli.call<{ version: string }>('daemon.status')
          cli.close()
          checks.push({ name: 'RPC ping', ok: true, detail: `version ${s.version}` })
        } catch (e) {
          checks.push({ name: 'RPC ping', ok: false, detail: (e as Error).message })
        }
      } else {
        checks.push({ name: 'RPC ping', ok: false, detail: '(socket missing)' })
      }

      const dbFile = `${paths.root}/registry.db`
      checks.push({ name: 'registry.db', ok: existsSync(dbFile), detail: existsSync(dbFile) ? `${statSync(dbFile).size}B` : '(missing)' })

      let allOk = true
      for (const c of checks) {
        const mark = c.ok ? kleur.green('✓') : kleur.red('✗')
        console.log(`${mark} ${c.name.padEnd(24)} ${kleur.dim(c.detail)}`)
        if (!c.ok) allOk = false
      }
      console.log()
      console.log(allOk ? kleur.green('HEALTHY') : kleur.yellow('WARNINGS — see above'))
      process.exit(allOk ? 0 : 1)
    })
}

registerCommand(registerDoctorCommand)
