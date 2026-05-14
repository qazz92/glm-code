export type LLMModel =
  | 'GLM-5.1' | 'GLM-5-Turbo' | 'GLM-5'
  | 'GLM-4.7' | 'GLM-4.6'
  | 'GLM-4.5-Air' | 'GLM-4.5-AirX' | 'GLM-4.5'
export type LLMEndpoint = 'anthropic' | 'openai'
export type QuotaPool = 'coding' | 'web' | 'vision'

export interface LLMUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheCreationTokens?: number
}

export interface StreamRef {
  streamId: string
  sessionId: string
  model: LLMModel
  endpoint: LLMEndpoint
  cached: boolean
}

export interface ShortMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
}

export interface CompleteOpts {
  model: LLMModel
  maxOutputTokens?: number
  temperature?: number
  topP?: number
  stopSequences?: string[]
  metadata?: { sessionId?: string; workerId?: string; phase?: string }
}
