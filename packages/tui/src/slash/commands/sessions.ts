import type { SlashCommand } from '../registry.js'

interface SessionRow { id: string; updatedAt: string; cwd: string; initialTask: string | null }

export const sessionsCommand: SlashCommand = {
  name: 'sessions',
  summary: 'List recent sessions',
  async run(_args, ctx) {
    const rows = await ctx.rpc.call<SessionRow[]>('session.list', { limit: 20 })
    if (!rows.length) return { kind: 'system', text: 'No sessions yet.' }
    const lines = rows.map(r => {
      const shortId = r.id.slice(-8)
      const task = r.initialTask ? ` — ${r.initialTask}` : ''
      return `  ${shortId}  ${r.updatedAt}  ${r.cwd}${task}`
    })
    return { kind: 'system', text: ['Recent sessions:', ...lines].join('\n') }
  }
}
