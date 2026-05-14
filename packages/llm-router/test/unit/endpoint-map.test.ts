import { describe, expect, test } from 'vitest'
import { preferredEndpoint, endpointBaseUrl } from '../../src/provider/endpoint-map.js'

describe('endpoint map', () => {
  test('GLM-5.x and 4.x (5+turbo+5+4.7+4.6) → anthropic', () => {
    expect(preferredEndpoint('GLM-5.1')).toBe('anthropic')
    expect(preferredEndpoint('GLM-5-Turbo')).toBe('anthropic')
    expect(preferredEndpoint('GLM-5')).toBe('anthropic')
    expect(preferredEndpoint('GLM-4.7')).toBe('anthropic')
    expect(preferredEndpoint('GLM-4.6')).toBe('anthropic')
  })

  test('GLM-4.5 family → openai', () => {
    expect(preferredEndpoint('GLM-4.5-Air')).toBe('openai')
    expect(preferredEndpoint('GLM-4.5-AirX')).toBe('openai')
    expect(preferredEndpoint('GLM-4.5')).toBe('openai')
  })

  test('endpointBaseUrl returns z.ai paths', () => {
    expect(endpointBaseUrl('anthropic')).toBe('https://api.z.ai/api/anthropic')
    expect(endpointBaseUrl('openai')).toBe('https://api.z.ai/api/coding')
  })
})
