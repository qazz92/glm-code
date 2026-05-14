import type { LLMModel, LLMUsage } from '@glm/shared'
import type { IRBlock, IRResponse } from './types.js'

export interface AnthropicWireContentBlock {
  type: string
  text?: string
  thinking?: string
  id?: string
  name?: string
  input?: Record<string, unknown>
}

export interface AnthropicWireUsage {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

export interface AnthropicWireResponse {
  content: AnthropicWireContentBlock[]
  model: string
  usage: AnthropicWireUsage
  stop_reason?: string
}

function mapBlock(b: AnthropicWireContentBlock): IRBlock | null {
  switch (b.type) {
    case 'text':
      return { type: 'text', text: b.text ?? '' }
    case 'thinking':
      return { type: 'thinking', text: b.thinking ?? '' }
    case 'tool_use':
      return {
        type: 'tool_use',
        toolUseId: b.id ?? '',
        toolName: b.name ?? '',
        toolInput: b.input ?? {},
      }
    default:
      return null
  }
}

export function anthropicToIRResponse(wire: AnthropicWireResponse): IRResponse {
  const blocks: IRBlock[] = []
  for (const b of wire.content) {
    const mapped = mapBlock(b)
    if (mapped) blocks.push(mapped)
  }

  const usage: LLMUsage = {
    inputTokens: wire.usage.input_tokens,
    outputTokens: wire.usage.output_tokens,
  }
  if (wire.usage.cache_read_input_tokens !== undefined) {
    usage.cacheReadTokens = wire.usage.cache_read_input_tokens
  }
  if (wire.usage.cache_creation_input_tokens !== undefined) {
    usage.cacheCreationTokens = wire.usage.cache_creation_input_tokens
  }

  return {
    model: wire.model as LLMModel,
    content: blocks,
    usage,
    stopReason: wire.stop_reason,
  }
}
