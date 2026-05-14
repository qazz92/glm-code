import type { SlashCommand } from '../registry.js'

interface DaemonStatus { pid: number; uptimeMs: number; version: string }

export const daemonCommand: SlashCommand = {
  name: 'daemon',
  summary: 'Daemon controls (status | restart)',
  usage: '/daemon status | restart',
  async run(args, ctx) {
    const sub = args[0] ?? 'status'
    if (sub === 'status') {
      const s = await ctx.rpc.call<DaemonStatus>('daemon.status')
      return { kind: 'system', text: `daemon pid=${s.pid} uptime=${Math.round(s.uptimeMs/1000)}s v=${s.version}` }
    }
    if (sub === 'restart') {
      return { kind: 'error', text: 'restart from within TUI not supported in P2 — run `glm daemon restart` from a shell' }
    }
    return { kind: 'error', text: `unknown subcommand: /daemon ${sub}` }
  }
}
