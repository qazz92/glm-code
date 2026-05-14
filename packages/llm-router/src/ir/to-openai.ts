import type { IRRequest, IRMessage, IRBlock } from './types.js'

export interface OpenAIWireMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: OpenAIWireToolCall[]
}

export interface OpenAIWireToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface OpenAIWireTool {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}

export interface OpenAIWireRequest {
  model: string
  max_tokens?: number
  messages: OpenAIWireMessage[]
  tools?: OpenAIWireTool[]
  temperature?: number
  top_p?: number
  stop?: string[]
  stream?: boolean
}

function textOf(blocks: IRBlock[]): string {
  return blocks
    .filter((b): b is Extract<IRBlock, { type: 'text' }> => b.type === 'text')
    .map(b => b.text)
    .join('\n')
}

function mapMessage(msg: IRMessage): OpenAIWireMessage | OpenAIWireMessage[] {
  // system → separate message
  if (msg.role === 'system') {
    return { role: 'system', content: textOf(msg.content) }
  }

  // assistant with tool_use → tool_calls
  if (msg.role === 'assistant') {
    const hasToolUse = msg.content.some(b => b.type === 'tool_use')
    if (hasToolUse) {
      const textBlocks = msg.content.filter((b): b is Extract<IRBlock, { type: 'text' }> => b.type === 'text')
      const toolCalls: OpenAIWireToolCall[] = msg.content
        .filter((b): b is Extract<IRBlock, { type: 'tool_use' }> => b.type === 'tool_use')
        .map(b => ({
          id: b.toolUseId,
          type: 'function' as const,
          function: { name: b.toolName, arguments: JSON.stringify(b.toolInput) },
        }))
      return {
        role: 'assistant',
        content: textBlocks.length > 0 ? textBlocks.map(b => b.text).join('\n') : null,
        tool_calls: toolCalls,
      }
    }
    return { role: 'assistant', content: textOf(msg.content) }
  }

  // tool result → role: tool
  if (msg.role === 'tool') {
    const results = msg.content.filter((b): b is Extract<IRBlock, { type: 'tool_result' }> => b.type === 'tool_result')
    if (results.length === 1) {
      return { role: 'tool', content: results[0].content }
    }
    return results.map(r => ({ role: 'tool' as const, content: r.content, tool_call_id: r.toolUseId }))
  }

  // user
  return { role: 'user', content: textOf(msg.content) }
}

export function irToOpenAI(req: IRRequest): OpenAIWireRequest {
  const rawMessages: (OpenAIWireMessage | OpenAIWireMessage[])[] = []

  if (req.system) {
    rawMessages.push({ role: 'system', content: req.system })
  }

  for (const msg of req.messages) {
    // Drop thinking blocks (OpenAI doesn't support them)
    const filtered: IRMessage = {
      ...msg,
      content: msg.content.filter(b => b.type !== 'thinking'),
    }
    if (filtered.content.length === 0 && msg.content.length > 0) continue
    rawMessages.push(mapMessage(filtered))
  }

  const messages: OpenAIWireMessage[] = rawMessages.flat()

  const out: OpenAIWireRequest = {
    model: req.model,
    messages,
  }

  if (req.maxTokens !== undefined) out.max_tokens = req.maxTokens
  if (req.temperature !== undefined) out.temperature = req.temperature
  if (req.topP !== undefined) out.top_p = req.topP
  if (req.stopSequences?.length) out.stop = req.stopSequences

  if (req.tools?.length) {
    out.tools = req.tools.map(t => ({
      type: 'function' as const,
      function: { name: t.name, description: t.description, parameters: t.inputSchema },
    }))
  }

  return out
}
