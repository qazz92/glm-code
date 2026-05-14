import { describe, expect, test } from 'vitest'
import { Daemon } from '../../src/daemon/daemon.js'

describe('Daemon constructor', () => {
  test('creates with default paths', () => {
    const d = new Daemon()
    // Should not throw; internal paths resolved
    expect(d).toBeDefined()
  })

  test('creates with custom home', () => {
    const d = new Daemon({ home: '/tmp/glm-test-ctor' })
    expect(d).toBeDefined()
  })
})
