import { describe, expect, test } from 'vitest'
import { createViewRouter } from '../../src/state/viewRouter.js'

describe('viewRouter', () => {
  test('starts at chat', () => {
    const r = createViewRouter()
    expect(r.get()).toBe('chat')
  })

  test('toggle flips chat ↔ dashboard', () => {
    const r = createViewRouter()
    r.toggle()
    expect(r.get()).toBe('dashboard')
    r.toggle()
    expect(r.get()).toBe('chat')
  })

  test('setView is idempotent', () => {
    const r = createViewRouter()
    r.setView('dashboard')
    r.setView('dashboard')
    expect(r.get()).toBe('dashboard')
  })

  test('subscribers fire on change only', () => {
    const r = createViewRouter()
    let calls = 0
    r.subscribe(() => { calls++ })
    r.setView('chat')          // no change — no fire
    r.setView('dashboard')     // fires
    r.setView('dashboard')     // no change — no fire
    r.toggle()                  // fires (→ chat)
    expect(calls).toBe(2)
  })
})
