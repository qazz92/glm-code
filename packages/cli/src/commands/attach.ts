import type { Command } from 'commander'
import { registerCommand } from '../registry.js'
export function registerAttachCommand(p: Command): void { p.command('attach <id>').action(() => {}) }
registerCommand(registerAttachCommand)
