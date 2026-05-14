import { parseSlash } from './parse.js'
import type { SlashContext, SlashRegistry, SlashResult } from './registry.js'

export interface WorkflowRegistry {
  has(name: string): boolean
  run(name: string, input: string, ctx: SlashContext): Promise<SlashResult>
}

export interface CommandLoaderRegistry {
  has(name: string): boolean
}

export interface DispatcherDeps {
  builtin: SlashRegistry
  /** P9 wires this; absent at P2 stage. */
  workflow?: WorkflowRegistry
  /** P4 wires this; absent at P2 stage. */
  commandLoader?: CommandLoaderRegistry
}

export type SlashDispatcher = (input: string, ctx: SlashContext) => Promise<SlashResult | null>

function isMethodNotFound(err: unknown): boolean {
  const msg = (err as Error)?.message ?? ''
  return /method not found|unknown method|-32601/i.test(msg)
}

/**
 * Catch-all slash dispatcher per FIX-MANIFEST §0.12.
 *
 * Order: built-in slash → workflow slash → command-loader render → CLI passthrough → 404.
 *
 * `workflowRegistry` and `commandLoaderRegistry` come from P9 and P4 respectively —
 * at P2's stage they don't exist yet, so the dispatcher uses optional resolution.
 * `rpc.call('cli.exec', ...)` returns method-not-found until P4 wires its handler;
 * we surface that to the user as "command not available yet".
 */
export function createDispatcher(deps: DispatcherDeps): SlashDispatcher {
  const { builtin, workflow, commandLoader } = deps
  return async function dispatch(input, ctx) {
    const parsed = parseSlash(input)
    if (!parsed) return null
    const { name: cmd, args } = parsed

    // 1. built-in slash
    if (builtin.get(cmd)) {
      return builtin.dispatch({ name: cmd, args }, ctx)
    }

    // 2. workflow slash (P9)
    if (workflow?.has(cmd)) {
      return workflow.run(cmd, args.join(' '), ctx)
    }

    // 3. command-loader render (P4)
    if (commandLoader?.has(cmd)) {
      try {
        const rendered = await ctx.rpc.call<{ rendered: string }>('command.render', { id: cmd, args })
        return { kind: 'system', text: rendered.rendered ?? '' }
      } catch (e) {
        if (isMethodNotFound(e)) {
          return { kind: 'error', text: `/${cmd} not available yet (command loader not wired)` }
        }
        return { kind: 'error', text: (e as Error).message }
      }
    }

    // 4. CLI passthrough — every CLI subcommand reachable as `/<cmd>`
    try {
      const r = await ctx.rpc.call<{ stdout: string; stderr: string; exitCode: number }>(
        'cli.exec',
        { cmd, args }
      )
      if (r.exitCode !== 0 && r.stderr) {
        return { kind: 'error', text: r.stderr.trim() }
      }
      return { kind: 'system', text: (r.stdout ?? '').trim() }
    } catch (e) {
      if (isMethodNotFound(e)) {
        return { kind: 'error', text: `/${cmd} not available yet (cli.exec handler arrives in P4)` }
      }
      return { kind: 'error', text: (e as Error).message }
    }
  }
}
