import type { SlashCommand } from '../registry.js'

export const quitCommand: SlashCommand = {
  name: 'quit',
  summary: 'Exit the TUI',
  async run(_args, ctx) {
    ctx.exit()
    return { kind: 'silent', text: '' }
  }
}
