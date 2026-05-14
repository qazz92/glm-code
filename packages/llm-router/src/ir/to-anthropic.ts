import type { IRRequest, IRMessage, IRBlock } from './types.js'

export interface AnthropicWireMessage {
  role: 'user' | 'assistant'
  content: AnthropicWireContent[]
}

export type AnthropicWireContent =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }
  | { type: 'thinking'; thinking: string }

export interface AnthropicWireTool {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

export interface AnthropicWireRequest {
  model: string
  max_tokens: number
  system?: string | { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }[]
  messages: AnthropicWireMessage[]
  tools?: AnthropicWireTool[]
  temperature?: number
  top_p?: number
  stop_sequences?: string[]
  stream?: boolean
}

function mapBlock(b: IRBlock): AnthropicWireContent {
  switch (b.type) {
    case 'text':
      return { type: 'text', text: b.text }
    case 'thinking':
      return { type: 'thinking', thinking: b.text }
    case 'tool_use':
      return { type: 'tool_use', id: b.toolUseId, name: b.toolName, input: b.toolInput }
    case 'tool_result':
      return { type: 'tool_result', tool_use_id: b.toolUseId, content: b.content, is_error: b.isError }
  }
}

function mapMessage(msg: IRMessage): AnthropicWireMessage {
  let role: 'user' | 'assistant' = msg.role === 'assistant' ? 'assistant' : 'user'
  const content = msg.content.map(mapBlock)
  return { role, content }
}

export function irToAnthropic(req: IRRequest): AnthropicWireRequest {
  const out: AnthropicWireRequest = {
    model: req.model,
    max_tokens: req.maxTokens ?? 4096,
    messages: req.messages.map(mapMessage),
  }

  if (req.system) {
    if (req.cacheControl) {
      out.system = [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }]
    } else {
      out.system = req.system
    }
  }

  if (req.tools?.length) {
    out.tools = req.tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
    }))
  }

  if (req.temperature !== undefined) out.temperature = req.temperature
  if (req.topP !== undefined) out.top_p = req.topP
  if (req.stopSequences?.length) out.stop_sequences = req.stopSequences

  return out
}
