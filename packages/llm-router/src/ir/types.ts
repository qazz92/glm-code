import type { LLMModel, LLMEndpoint, LLMUsage } from '@glm/shared'

export type IRRole = 'system' | 'user' | 'assistant' | 'tool'

export interface IRTextBlock {
  type: 'text'
  text: string
}

export interface IRThinkingBlock {
  type: 'thinking'
  text: string
}

export interface IRToolUseBlock {
  type: 'tool_use'
  toolUseId: string
  toolName: string
  toolInput: Record<string, unknown>
}

export interface IRToolResultBlock {
  type: 'tool_result'
  toolUseId: string
  content: string
  isError?: boolean
}

export type IRBlock = IRTextBlock | IRThinkingBlock | IRToolUseBlock | IRToolResultBlock

export interface IRMessage {
  role: IRRole
  content: IRBlock[]
}

export interface IRToolDef {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface IRRequest {
  model: LLMModel
  endpoint: LLMEndpoint
  system?: string
  messages: IRMessage[]
  tools?: IRToolDef[]
  maxTokens?: number
  temperature?: number
  topP?: number
  stopSequences?: string[]
  cacheControl?: 'ephemeral'
}

export interface IREvent {
  type: 'content_block_start' | 'content_block_delta' | 'content_block_stop' | 'message_stop'
  block?: IRBlock
  delta?: string
}

export interface IRResponse {
  model: LLMModel
  content: IRBlock[]
  usage: LLMUsage
  stopReason?: string
}
