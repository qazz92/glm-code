import { describe, expect, test } from 'vitest'
import { resolvePaths } from '../src/paths'

describe('resolvePaths', () => {
  test('returns expected ~/.glm subtree', () => {
    const p = resolvePaths({ home: '/Users/test', env: {} })
    expect(p.root).toBe('/Users/test/.glm')
    expect(p.socket).toBe('/Users/test/.glm/daemon.sock')
    expect(p.pid).toBe('/Users/test/.glm/daemon.pid')
    expect(p.log).toBe('/Users/test/.glm/daemon.log')
    expect(p.sessionsDir).toBe('/Users/test/.glm/sessions')
    expect(p.quotaDb).toBe('/Users/test/.glm/quota.db')
  })

  test('honors GLM_HOME env override', () => {
    const p = resolvePaths({ home: '/Users/test', env: { GLM_HOME: '/tmp/x' } })
    expect(p.root).toBe('/tmp/x')
  })
})
