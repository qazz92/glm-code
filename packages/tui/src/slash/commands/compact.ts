import type { SlashCommand } from '../registry.js'

interface CompactResp {
  before?: number
  after?: number
  summary?: string
}

function isMethodNotFound(err: unknown): boolean {
  const msg = (err as Error)?.message ?? ''
  return /method not found|unknown method|-32601/i.test(msg)
}

export const compactCommand: SlashCommand = {
  name: 'compact',
  summary: 'Compact context with optional focus hint',
  usage: '/compact [focus]',
  async run(args, ctx) {
    const focus = args.join(' ').trim() || undefined
    try {
      const resp = await ctx.rpc.call<CompactResp>('context.compact', { focus })
      const beforeAfter = resp.before != null && resp.after != null
        ? ` ${resp.before}t → ${resp.after}t`
        : ''
      return {
        kind: 'system',
        text: `compacted${beforeAfter}${resp.summary ? `: ${resp.summary}` : ''}`
      }
    } catch (e) {
      if (isMethodNotFound(e)) {
        return { kind: 'system', text: 'compact not ready (P7 not yet implemented)' }
      }
      return { kind: 'error', text: (e as Error).message }
    }
  }
}
