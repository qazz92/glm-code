import { describe, expect, test } from 'vitest'
import { parseSlash } from '../../src/slash/parse.js'

describe('parseSlash', () => {
  test('returns null for plain text', () => {
    expect(parseSlash('hello world')).toBeNull()
  })

  test('parses /help with no args', () => {
    expect(parseSlash('/help')).toEqual({ name: 'help', args: [] })
  })

  test('parses /attach <id>', () => {
    expect(parseSlash('/attach 01J6...XYZ')).toEqual({ name: 'attach', args: ['01J6...XYZ'] })
  })

  test('parses /daemon status', () => {
    expect(parseSlash('/daemon status')).toEqual({ name: 'daemon', args: ['status'] })
  })

  test('trims trailing whitespace', () => {
    expect(parseSlash('/help   ')).toEqual({ name: 'help', args: [] })
  })

  test('rejects "/  " (slash with only spaces)', () => {
    expect(parseSlash('/  ')).toBeNull()
  })

  test('handles quoted args (basic)', () => {
    expect(parseSlash('/say "hello world" friend')).toEqual({ name: 'say', args: ['hello world', 'friend'] })
  })
})
