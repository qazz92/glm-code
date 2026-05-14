import type { LLMEndpoint, LLMModel } from '@glm/shared'

const PREFERRED: Record<LLMModel, LLMEndpoint> = {
  'GLM-5.1': 'anthropic',
  'GLM-5-Turbo': 'anthropic',
  'GLM-5': 'anthropic',
  'GLM-4.7': 'anthropic',
  'GLM-4.6': 'anthropic',
  'GLM-4.5-Air': 'openai',
  'GLM-4.5-AirX': 'openai',
  'GLM-4.5': 'openai',
}

export function preferredEndpoint(model: LLMModel): LLMEndpoint {
  return PREFERRED[model]
}

export function endpointBaseUrl(ep: LLMEndpoint): string {
  return ep === 'anthropic'
    ? 'https://api.z.ai/api/anthropic'
    : 'https://api.z.ai/api/coding'
}

export const CONCURRENCY: Record<LLMModel, number> = {
  'GLM-5.1': 10,
  'GLM-5-Turbo': 1,
  'GLM-5': 2,
  'GLM-4.7': 2,
  'GLM-4.6': 3,
  'GLM-4.5-Air': 5,
  'GLM-4.5-AirX': 5,
  'GLM-4.5': 3,
}
