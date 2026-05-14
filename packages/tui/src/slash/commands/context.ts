import type { SlashCommand } from '../registry.js'

interface ContextAssembleResp {
  tokens?: number
  parts?: Array<{ kind: string; tokens?: number; summary?: string }>
}

function isMethodNotFound(err: unknown): boolean {
  const msg = (err as Error)?.message ?? ''
  return /method not found|unknown method|-32601/i.test(msg)
}

export const contextCommand: SlashCommand = {
  name: 'context',
  summary: 'Show current context assembly (tokens + sources)',
  async run(_args, ctx) {
    try {
      const resp = await ctx.rpc.call<ContextAssembleResp>('context.assemble', {
        sessionId: ctx.session?.get?.()?.id
      })
      const head = `context tokens=${resp.tokens ?? '?'}`
      const parts = (resp.parts ?? []).map(p => `  - ${p.kind}${p.tokens ? ` (${p.tokens}t)` : ''}${p.summary ? `: ${p.summary}` : ''}`)
      return { kind: 'system', text: [head, ...parts].join('\n') }
    } catch (e) {
      if (isMethodNotFound(e)) {
        return { kind: 'system', text: 'context not ready (P7 not yet implemented)' }
      }
      return { kind: 'error', text: (e as Error).message }
    }
  }
}
