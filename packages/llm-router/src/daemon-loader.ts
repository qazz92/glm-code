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
  type LLMProvider, type IRRequest,
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
  const providerAnth = new GLMAnthropicProvider({ apiKey: cred.apiKey ?? '', baseUrl: cred.baseUrlOverride })
  const providerOAI  = new GLMOpenAIProvider({ apiKey: cred.apiKey ?? '', baseUrl: cred.baseUrlOverride })
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

  // Active stream tracking for cancel
  const abortControllers = new Map<string, AbortController>()

  daemon.registerRpc('llm.call', async (params: any, ctx: any) => {
    const request = { ...params?.request } as Record<string, any>
    const model = (request.model as string) ?? defaultModel
    if (!request.endpoint) request.endpoint = preferredEndpoint(model as any)
    const provider = pickProvider(model)
    const streamId = ulid()
    const ac = new AbortController()
    abortControllers.set(streamId, ac)

    ;(async () => {
      try {
        for await (const event of provider.call(request as IRRequest, ac.signal)) {
          pushLlmEvent(ctx.socket, streamId, event)
        }
      } catch (e) {
        pushLlmEvent(ctx.socket, streamId, {
          type: 'error',
          code: 'stream_error',
          message: (e as Error).message,
        })
      } finally {
        abortControllers.delete(streamId)
      }
    })()
    return { streamId }
  })

  daemon.registerRpc('llm.cancel', async (params: any) => {
    const ac = abortControllers.get(params?.streamId)
    if (!ac) return { cancelled: false }
    ac.abort()
    abortControllers.delete(params.streamId)
    return { cancelled: true }
  })

  // Rewire message.send to use the real LLM (falls back to echo when no credentials)
  daemon.registerRpc('message.send', async (p: any) => {
    const { sessionId, text, model: override } = p ?? {}
    const model = (override ?? defaultModel) as string

    // No credentials → fall back to echo stub
    if (!cred.apiKey) {
      return {
        sessionId,
        role: 'assistant',
        content: text,
        model: 'stub-echo',
        ts: new Date().toISOString()
      }
    }

    const endpoint = preferredEndpoint(model as any)
    const svc = new LLMService({ provider: pickProvider(model), cache, quotaTracker })
    const req: IRRequest = {
      model: model as any,
      endpoint,
      messages: [{ role: 'user', content: [{ type: 'text', text }] }],
      maxTokens: 2048,
    }
    const handle = svc.run(req)
    const response = await handle.result()
    // Extract text from response content blocks
    const content = response.content
      ?.filter((b: any) => b.type === 'text')
      ?.map((b: any) => b.text)
      ?.join('') ?? ''
    return {
      sessionId,
      role: 'assistant',
      content,
      model,
      ts: new Date().toISOString()
    }
  })
})
