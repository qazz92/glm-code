import type { Command } from 'commander'
import { registerCommand } from '../registry.js'
export function registerDoctorCommand(p: Command): void { p.command('doctor').action(() => {}) }
registerCommand(registerDoctorCommand)
