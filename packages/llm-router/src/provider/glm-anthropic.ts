import type { IRRequest } from '../ir/types.js'
import type { StreamEvent } from '../stream/sse.js'
import type { LLMProvider } from './provider.js'
import { estimateTokens } from './token-count.js'
import { endpointBaseUrl } from './endpoint-map.js'
import { readSSE } from '../stream/sse.js'
import { parseAnthropicStream } from '../stream/anthropic-parser.js'
import { request as undiciRequest } from 'undici'

export interface AnthropicProviderOpts {
  apiKey: string
  baseUrl?: string
}

/**
 * Provider for Anthropic-compatible API (z.ai proxy).
 * Streams SSE via parseAnthropicStream(readSSE(...)).
 */
export class GLMAnthropicProvider implements LLMProvider {
  private readonly apiKey: string
  private readonly baseUrl: string

  constructor(opts: AnthropicProviderOpts) {
    this.apiKey = opts.apiKey
    this.baseUrl = opts.baseUrl ?? endpointBaseUrl('anthropic')
  }

  async *call(req: IRRequest, signal?: AbortSignal): AsyncIterable<StreamEvent> {
    const url = `${this.baseUrl}/v1/messages`
    const body = this.buildBody(req)

    const resp = await undiciRequest(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal,
    })

    if (resp.statusCode >= 400) {
      const text = await resp.body.text()
      const err: any = new Error(`anthropic ${resp.statusCode}: ${text}`)
      err.status = resp.statusCode
      throw err
    }

    const sseEvents = readSSE(resp.body as AsyncIterable<Uint8Array>, signal)
    yield* parseAnthropicStream(sseEvents)
  }

  countTokens(req: IRRequest): number {
    return estimateTokens(req)
  }

  private buildBody(req: IRRequest): Record<string, unknown> {
    const messages: { role: string; content: unknown[] }[] = []
    for (const m of req.messages) {
      if (m.role === 'tool') {
        // Anthropic: tool_result blocks are user-role messages
        messages.push({
          role: 'user',
          content: m.content.map(b => {
            if (b.type === 'tool_result') {
              return { type: 'tool_result', tool_use_id: b.toolUseId, content: b.content, ...(b.isError ? { is_error: true } : {}) }
            }
            return blockToAnthropic(b)
          }),
        })
      } else {
        messages.push({
          role: m.role,
          content: m.content.map(blockToAnthropic),
        })
      }
    }

    const body: Record<string, unknown> = {
      model: req.model,
      max_tokens: req.maxTokens ?? 16_000,
      stream: true,
      messages,
    }
    if (req.system) body.system = [{ type: 'text', text: req.system, ...(req.cacheControl ? { cache_control: { type: req.cacheControl } } : {}) }]
    if (req.tools) body.tools = req.tools.map(t => ({ name: t.name, description: t.description, input_schema: t.inputSchema }))
    if (req.temperature !== undefined) body.temperature = req.temperature
    if (req.topP !== undefined) body.top_p = req.topP
    if (req.stopSequences) body.stop_sequences = req.stopSequences
    return body
  }
}

function blockToAnthropic(b: import('../ir/types.js').IRBlock): Record<string, unknown> {
  switch (b.type) {
    case 'text':
      return { type: 'text', text: b.text }
    case 'thinking':
      return { type: 'thinking', thinking: b.text }
    case 'tool_use':
      return { type: 'tool_use', id: b.toolUseId, name: b.toolName, input: b.toolInput }
    case 'tool_result':
      return { type: 'tool_result', tool_use_id: b.toolUseId, content: b.content, ...(b.isError ? { is_error: true } : {}) }
  }
}
