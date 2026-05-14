import type { SlashCommand } from '../registry.js'

export const helpCommand = (allCommands: () => SlashCommand[]): SlashCommand => ({
  name: 'help',
  summary: 'List slash commands',
  async run() {
    const lines = allCommands()
      .map(c => `  /${c.name.padEnd(10)} ${c.summary}${c.usage ? `  (${c.usage})` : ''}`)
    return {
      kind: 'system',
      text: ['Available commands:', ...lines].join('\n')
    }
  }
})
