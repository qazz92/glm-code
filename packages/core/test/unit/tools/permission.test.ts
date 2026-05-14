import { describe, expect, test } from 'vitest'
import { checkPermission } from '../../../src/tools/permission.js'

describe('checkPermission', () => {
  test('allows when no settings', () => {
    expect(checkPermission('Bash', {})).toBe(true)
  })

  test('denies matching deny pattern', () => {
    expect(checkPermission('Bash', {}, { deny: ['Bash'] })).toBe(false)
  })

  test('allows matching allow pattern', () => {
    expect(checkPermission('Read', {}, { allow: ['Read', 'Glob'] })).toBe(true)
  })

  test('denies non-matching allow list', () => {
    expect(checkPermission('Bash', {}, { allow: ['Read', 'Glob'] })).toBe(false)
  })

  test('deny takes priority over allow', () => {
    expect(checkPermission('Bash', {}, { allow: ['Bash'], deny: ['Bash'] })).toBe(false)
  })
})
