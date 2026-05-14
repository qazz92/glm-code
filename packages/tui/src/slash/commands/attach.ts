import type { SlashCommand } from '../registry.js'

interface SessionRow { id: string; cwd: string; initialTask: string | null }

export const attachCommand: SlashCommand = {
  name: 'attach',
  summary: 'Attach to an existing session by id (or short suffix)',
  usage: '/attach <id-or-suffix>',
  async run(args, ctx) {
    if (!args[0]) return { kind: 'error', text: 'usage: /attach <id>' }
    const needle = args[0]
    const rows = await ctx.rpc.call<SessionRow[]>('session.list', { limit: 200 })
    const match = rows.find(r => r.id === needle) ?? rows.find(r => r.id.endsWith(needle))
    if (!match) return { kind: 'error', text: `no session matches "${needle}"` }
    ctx.session.set({ id: match.id, cwd: match.cwd, initialTask: match.initialTask })
    await ctx.rpc.call('session.touch', { sessionId: match.id })
    return { kind: 'system', text: `attached to ${match.id.slice(-8)} (${match.cwd})` }
  }
}
