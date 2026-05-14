import type { IRRequest, IRResponse } from '../ir/types.js'
import type { LLMProvider } from '../provider/provider.js'
import type { IdempotencyCache } from '../cache/idempotency-cache.js'
import type { QuotaTracker, GuardLevel } from '../quota/quota-tracker.js'
import type { Tier } from '../quota/pools.js'
import type { QuotaPool, LLMUsage, ShortMessage, CompleteOpts } from '@glm/shared'
import { CancellationToken } from './cancellation.js'
import { PartialBuffer } from './call-context.js'
import { classifyError, computeNextWait } from '../retry/policy.js'
import { backoffMs, DEFAULT_BACKOFF } from '../retry/backoff.js'

export interface LLMServiceOpts {
  provider: LLMProvider
  cache: IdempotencyCache
  quotaTracker?: QuotaTracker
  pool?: QuotaPool
  tier?: Tier
  maxRetries?: number
}

export interface RunHandle {
  stream(): AsyncIterable<import('../stream/sse.js').StreamEvent>
  cancel(): void
  result(): Promise<IRResponse>
}

export class LLMService {
  private readonly provider: LLMProvider
  private readonly cache: IdempotencyCache
  private readonly quotaTracker?: QuotaTracker
  private readonly pool: QuotaPool
  private readonly tier: Tier
  private readonly maxRetries: number
  private consecutiveFailures = 0

  constructor(opts: LLMServiceOpts) {
    this.provider = opts.provider
    this.cache = opts.cache
    this.quotaTracker = opts.quotaTracker
    this.pool = opts.pool ?? 'coding'
    this.tier = opts.tier ?? 'pro'
    this.maxRetries = opts.maxRetries ?? 3
  }

  /**
   * Run a streaming LLM call with cache check, quota guard, retry.
   */
  run(req: IRRequest, role = 'default'): RunHandle {
    const token = new CancellationToken()
    let responsePromise: Promise<IRResponse> | null = null

    const self = this

    responsePromise = (async () => {
      // 1) Cache check
      const cached = self.cache.get(role, req)
      if (cached) return cached

      // 2) Quota guard
      if (self.quotaTracker) {
        const level = self.quotaTracker.guard(self.pool, self.tier)
        if (level === 'red') {
          return {
            model: req.model,
            content: [{ type: 'text' as const, text: '[quota exceeded]' }],
            usage: { inputTokens: 0, outputTokens: 0 },
            stopReason: 'max_tokens',
          }
        }
      }

      // 3) Call with retry
      let lastError: Error | null = null
      for (let attempt = 0; attempt <= self.maxRetries; attempt++) {
        if (token.cancelled) {
          // Return partial if we have one
          return {
            model: req.model,
            content: [],
            usage: { inputTokens: 0, outputTokens: 0 },
            stopReason: 'cancelled' as string,
          }
        }

        try {
          const buf = new PartialBuffer()
          const events = self.provider.call(req, token.signal)
          let usage: LLMUsage = { inputTokens: 0, outputTokens: 0 }
          let stopReason = 'end_turn'
          let messageId = ''

          for await (const ev of events) {
            if (token.cancelled) break
            switch (ev.type) {
              case 'message_start': messageId = ev.messageId; break
              case 'text_delta': buf.appendText(ev.text); break
              case 'thinking_delta': buf.appendThinking(ev.text); break
              case 'tool_use_start': buf.appendToolStart(ev.id, ev.name); break
              case 'tool_use_input_delta': buf.appendToolInput(ev.id, ev.partialJson); break
              case 'message_stop': stopReason = ev.stopReason; break
              case 'usage': usage = ev.usage; break
              case 'error': throw new Error(`${ev.code}: ${ev.message}`)
            }
          }

          const response: IRResponse = {
            model: req.model,
            content: buf.toBlocks(),
            usage,
            stopReason: token.cancelled ? 'cancelled' : stopReason,
          }

          // Cache on success
          self.cache.put(role, req, response)

          // Record quota
          if (self.quotaTracker) {
            self.quotaTracker.record(self.pool, usage.inputTokens, usage.outputTokens, req.model)
          }

          self.consecutiveFailures = 0
          return response
        } catch (e: any) {
          lastError = e
          const action = classifyError({
            status: e.status,
            code: e.code,
            message: e.message,
          })

          if (action.kind === 'fail' || action.kind === 'refused' || action.kind === 'user') {
            throw e
          }

          if (action.kind === 'retry' && attempt >= self.maxRetries) {
            throw e
          }

          // Wait before retry
          self.consecutiveFailures++
          const baseWait = action.waitMs ?? backoffMs(attempt + 1, DEFAULT_BACKOFF)
          const waitMs = computeNextWait({
            attempt: attempt + 1,
            consecutiveFailures: self.consecutiveFailures,
            baseWait,
          })

          await new Promise<void>(resolve => {
            const timer = setTimeout(resolve, waitMs)
            token.signal.addEventListener('abort', () => { clearTimeout(timer); resolve() }, { once: true })
          })
        }
      }

      throw lastError ?? new Error('unexpected retry loop exit')
    })()

    return {
      stream() {
        // Return a re-stream from provider (or from cache if hit)
        throw new Error('Use run().result() for aggregated results; streaming passthrough not yet supported via this handle')
      },
      cancel() { token.cancel() },
      result() { return responsePromise! },
    }
  }

  /**
   * Convenience: complete a multi-turn conversation and return final text + usage.
   * Used by compactors and batch consumers.
   */
  async complete(messages: ShortMessage[], opts: CompleteOpts): Promise<{ text: string; usage: LLMUsage }> {
    const req: IRRequest = {
      model: opts.model,
      endpoint: opts.model.startsWith('GLM-4.5') ? 'openai' : 'anthropic',
      messages: messages.map(m => ({
        role: m.role,
        content: [{ type: 'text' as const, text: m.content }],
      })),
      maxTokens: opts.maxOutputTokens,
      temperature: opts.temperature,
      topP: opts.topP,
      stopSequences: opts.stopSequences,
    }

    const handle = this.run(req, opts.metadata?.phase ?? 'complete')
    const response = await handle.result()
    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as { text: string }).text)
      .join('')

    return { text, usage: response.usage }
  }
}
