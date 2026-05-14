#!/usr/bin/env node
import { Command } from 'commander'
import { registerAll } from './registry.js'
import { ensureDaemonRunning } from './auto-spawn.js'
import { runTui } from '@glm/tui'
import './commands/index.js'

async function main(): Promise<void> {
  const program = new Command()
  program.name('glm').description('GLM coding agent CLI').version('0.1.0-alpha.1')

  registerAll(program)

  // process.argv = [node, script, ...userArgs]
  const userArgs = process.argv.slice(2)

  if (userArgs.length === 0) {
    // bare `glm` → launch TUI
    await ensureDaemonRunning()
    await runTui({})
    return
  }

  await program.parseAsync(process.argv)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
