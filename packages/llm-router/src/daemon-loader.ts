/**
 * LLM Router subsystem — LoaderHub registration.
 *
 * Registers llm.call / llm.cancel RPC handlers on the daemon
 * and rewires message.send to use the real LLM instead of the echo stub.
 *
 * Side-effect import: importing this module triggers LoaderHub.registerSubsystem().
 */
import { ulid } from '@glm/shared'
import { LoaderHub, openDb, runQuotaMigrations } from '@glm/core'
import type { Daemon } from '@glm/core'
import {
  LLMService, GLMAnthropicProvider, GLMOpenAIProvider,
  preferredEndpoint, IdempotencyCache, QuotaRepo, QuotaTracker,
  resolveCredentials,
  type LLMProvider, type RunHandle, type IRRequest,
} from './index.js'
import { pushLlmEvent } from './rpc/events.js'

LoaderHub.registerSubsystem('llm-router', async (daemon: Daemon) => {
  const cred = resolveCredentials({
    credentialsFile: `${daemon.glmPaths.root}/credentials.json`,
  })
  if (!cred.apiKey) {
    daemon.logger.warn('no GLM credentials resolved; llm.call will return error events')
  }

  const defaultModel = (process.env.GLM_DEFAULT_MODEL as string) ?? 'GLM-5-Turbo'
  const providerAnth = new GLMAnthropicProvider({ apiKey: cred.apiKey ?? '' })
  const providerOAI  = new GLMOpenAIProvider({ apiKey: cred.apiKey ?? '' })
  const pickProvider = (model: string): LLMProvider =>
    preferredEndpoint(model as any) === 'anthropic' ? providerAnth : providerOAI

  const db = daemon.database!
  const cache = new IdempotencyCache(db)

  // Quota DB is separate
  let quotaTracker: QuotaTracker | undefined
  try {
    const quotaDb = openDb(`${daemon.glmPaths.root}/quota.db`)
    runQuotaMigrations(quotaDb)
    quotaTracker = new QuotaTracker(new QuotaRepo(quotaDb))
    daemon.onShutdown(() => { try { quotaDb.close() } catch { /* ignore */ } })
  } catch {
    daemon.logger.warn('quota DB unavailable; running without quota guards')
  }

  const buildService = (model: string): LLMService => new LLMService({
    provider: pickProvider(model),
    cache,
    quotaTracker,
  })

  // Active stream tracking for cancel support
  const streams = new Map<string, { handle: RunHandle; socket: import('node:net').Socket }>()

  daemon.registerRpc('llm.call', async (params: any, ctx: any) => {
    const request = { ...params?.request } as Record<string, any>
    const model = (request.model as string) ?? defaultModel
    if (!request.endpoint) request.endpoint = preferredEndpoint(model as any)
    const handle = buildService(model).run(request as IRRequest)
    const streamId = ulid()
    streams.set(streamId, { handle, socket: ctx.socket })
    ;(async () => {
      try {
        for await (const event of handle.stream()) {
          pushLlmEvent(ctx.socket, streamId, event)
        }
      } finally {
        streams.delete(streamId)
      }
    })()
    return { streamId }
  })

  daemon.registerRpc('llm.cancel', async (params: any) => {
    const s = streams.get(params?.streamId)
    if (!s) return { cancelled: false }
    s.handle.cancel()
    streams.delete(params.streamId)
    return { cancelled: true }
  })

  // Rewire message.send to use the real LLM
  daemon.registerRpc('message.send', async (p: any) => {
    const { sessionId, text, model: override } = p ?? {}
    const model = (override ?? defaultModel) as string
    const endpoint = preferredEndpoint(model as any)
    const svc = buildService(model)
    const req: IRRequest = {
      model: model as any,
      endpoint,
      messages: [{ role: 'user', content: [{ type: 'text', text }] }],
      maxTokens: 2048,
    }
    const handle = svc.run(req)
    // Consume stream synchronously and return concatenated text
    let content = ''
    for await (const e of handle.stream()) {
      if (e.type === 'text_delta') content += (e as any).text
      if (e.type === 'error') throw new Error(`${(e as any).code}: ${(e as any).message}`)
    }
    return {
      sessionId,
      role: 'assistant',
      content,
      model,
      ts: new Date().toISOString()
    }
  })
})
