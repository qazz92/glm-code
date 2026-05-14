import { describe, expect, test } from 'vitest'
import { framesFromChunk } from '../../src/rpc/server.js'

describe('framesFromChunk', () => {
  test('splits newline-delimited JSON into frames', () => {
    const { frames, leftover } = framesFromChunk(Buffer.from('{"a":1}\n{"b":2}\n'), '')
    expect(frames).toEqual(['{"a":1}', '{"b":2}'])
    expect(leftover).toBe('')
  })

  test('preserves partial frame as leftover', () => {
    const { frames, leftover } = framesFromChunk(Buffer.from('{"a":1}\n{"b":'), '')
    expect(frames).toEqual(['{"a":1}'])
    expect(leftover).toBe('{"b":')
  })

  test('joins with previous leftover', () => {
    const { frames, leftover } = framesFromChunk(Buffer.from('2}\n'), '{"b":')
    expect(frames).toEqual(['{"b":2}'])
    expect(leftover).toBe('')
  })
})
