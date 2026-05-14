import type { Command } from 'commander'

const registrations: Array<(p: Command) => void> = []

export function registerCommand(fn: (p: Command) => void): void {
  registrations.push(fn)
}

export function registerAll(program: Command): void {
  for (const fn of registrations) fn(program)
}

export function _resetRegistry(): void {
  registrations.length = 0
}
