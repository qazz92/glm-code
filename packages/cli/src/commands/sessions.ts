import type { Command } from 'commander'
import { registerCommand } from '../registry.js'
export function registerSessionsCommand(p: Command): void { p.command('sessions').action(() => {}) }
registerCommand(registerSessionsCommand)
