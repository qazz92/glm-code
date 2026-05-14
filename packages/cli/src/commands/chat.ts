import type { Command } from 'commander'
import { registerCommand } from '../registry.js'
export function registerChatCommand(p: Command): void { p.argument('[text]').action(() => {}) }
registerCommand(registerChatCommand)
