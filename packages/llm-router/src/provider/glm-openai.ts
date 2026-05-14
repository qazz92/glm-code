import type { IRRequest } from '../ir/types.js'
import type { StreamEvent } from '../stream/sse.js'
import type { LLMProvider } from './provider.js'
import { estimateTokens } from './token-count.js'
import { endpointBaseUrl } from './endpoint-map.js'
import { readSSE } from '../stream/sse.js'
import { parseOpenAIStream } from '../stream/openai-parser.js'
import { request as undiciRequest } from 'undici'

export interface OpenAIProviderOpts {
  apiKey: string
  baseUrl?: string
}

/**
 * Provider for OpenAI-compatible API (z.ai proxy).
 * Uses Bearer auth, /v1/chat/completions.
 * No prompt caching (cache_control dropped).
 */
export class GLMOpenAIProvider implements LLMProvider {
  private readonly apiKey: string
  private readonly baseUrl: string

  constructor(opts: OpenAIProviderOpts) {
    this.apiKey = opts.apiKey
    this.baseUrl = opts.baseUrl ?? endpointBaseUrl('openai')
  }

  async *call(req: IRRequest, signal?: AbortSignal): AsyncIterable<StreamEvent> {
    const url = `${this.baseUrl}/v1/chat/completions`
    const body = this.buildBody(req)

    const resp = await undiciRequest(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    })

    if (resp.statusCode >= 400) {
      const text = await resp.body.text()
      const err: any = new Error(`openai ${resp.statusCode}: ${text}`)
      err.status = resp.statusCode
      throw err
    }

    const sseEvents = readSSE(resp.body as AsyncIterable<Uint8Array>, signal)
    yield* parseOpenAIStream(sseEvents)
  }

  countTokens(req: IRRequest): number {
    return estimateTokens(req)
  }

  private buildBody(req: IRRequest): Record<string, unknown> {
    const messages: Record<string, unknown>[] = []

    // System → role:system message
    if (req.system) {
      messages.push({ role: 'system', content: req.system })
    }

    for (const m of req.messages) {
      if (m.role === 'assistant') {
        const textBlocks = m.content.filter(b => b.type === 'text')
        const toolBlocks = m.content.filter(b => b.type === 'tool_use')
        const text = textBlocks.map(b => (b as { text: string }).text).join('\n')
        const toolCalls = toolBlocks.map(b => {
          const tu = b as import('../ir/types.js').IRToolUseBlock
          return {
            id: tu.toolUseId,
            type: 'function' as const,
            function: { name: tu.toolName, arguments: JSON.stringify(tu.toolInput ?? {}) },
          }
        })
        messages.push({
          role: 'assistant',
          content: toolCalls.length > 0 ? (text || null) : text,
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        })
      } else if (m.role === 'tool') {
        for (const b of m.content) {
          if (b.type === 'tool_result') {
            messages.push({ role: 'tool', tool_call_id: b.toolUseId, content: b.content })
          }
        }
      } else {
        // user — flatten text blocks, drop thinking/tool blocks
        const text = m.content
          .filter(b => b.type === 'text')
          .map(b => (b as { text: string }).text)
          .join('\n')
        messages.push({ role: m.role, content: text })
      }
    }

    const body: Record<string, unknown> = {
      model: req.model,
      stream: true,
      messages,
    }
    if (req.tools) {
      body.tools = req.tools.map(t => ({
        type: 'function' as const,
        function: { name: t.name, description: t.description, parameters: t.inputSchema },
      }))
    }
    if (req.maxTokens !== undefined) body.max_tokens = req.maxTokens
    if (req.temperature !== undefined) body.temperature = req.temperature
    if (req.topP !== undefined) body.top_p = req.topP
    if (req.stopSequences) body.stop = req.stopSequences
    return body
  }
}
