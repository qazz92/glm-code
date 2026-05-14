#!/usr/bin/env node
import { Command } from 'commander'
import { registerAll } from './registry.js'
import './commands/index.js'

const program = new Command()
program.name('glm').description('GLM coding agent CLI').version('0.1.0-alpha.1')

registerAll(program)

program.parseAsync(process.argv).catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
