import type { LLMModel, LLMUsage } from '@glm/shared'
import type { IRBlock, IRResponse } from './types.js'

export interface OpenAIWireToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface OpenAIWireChoice {
  message: {
    role: string
    content: string | null
    tool_calls?: OpenAIWireToolCall[]
  }
  finish_reason?: string
}

export interface OpenAIWireUsage {
  prompt_tokens: number
  completion_tokens: number
}

export interface OpenAIWireResponse {
  model: string
  choices: OpenAIWireChoice[]
  usage: OpenAIWireUsage
}

export function openaiToIRResponse(wire: OpenAIWireResponse): IRResponse {
  const choice = wire.choices[0]
  if (!choice) {
    return { model: wire.model as LLMModel, content: [], usage: { inputTokens: 0, outputTokens: 0 } }
  }

  const blocks: IRBlock[] = []

  if (choice.message.content) {
    blocks.push({ type: 'text', text: choice.message.content })
  }

  if (choice.message.tool_calls?.length) {
    for (const tc of choice.message.tool_calls) {
      let input: Record<string, unknown> = {}
      try { input = JSON.parse(tc.function.arguments) } catch { /* leave empty */ }
      blocks.push({
        type: 'tool_use',
        toolUseId: tc.id,
        toolName: tc.function.name,
        toolInput: input,
      })
    }
  }

  return {
    model: wire.model as LLMModel,
    content: blocks,
    usage: {
      inputTokens: wire.usage.prompt_tokens,
      outputTokens: wire.usage.completion_tokens,
    },
    stopReason: choice.finish_reason,
  }
}
