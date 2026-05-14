import type { SlashCommand } from '../registry.js'

export const historyCommand: SlashCommand = {
  name: 'history',
  summary: 'Show message history scrollback',
  async run(_args, ctx) {
    const messages = ctx.chatLog.snapshot()
    if (!messages.length) return { kind: 'system', text: 'no messages yet.' }
    const lines = messages.map((m: any, i: number) => {
      const role = m.role ?? m.kind ?? 'msg'
      const text = (m.text ?? m.content ?? '').toString().split('\n')[0]
      return `  ${String(i + 1).padStart(3)}. [${role}] ${text}`
    })
    return { kind: 'system', text: ['History:', ...lines].join('\n') }
  }
}
