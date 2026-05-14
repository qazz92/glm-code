import { describe, expect, test } from 'vitest'
import { resolveTheme, themes } from '../../src/theme/index.js'

describe('resolveTheme', () => {
  test('returns dark by default', () => {
    const t = resolveTheme({})
    expect(t.name).toBe('dark')
    expect(t.colors.fg).toBeDefined()
  })

  test('honors GLM_THEME=light', () => {
    const t = resolveTheme({ GLM_THEME: 'light' })
    expect(t.name).toBe('light')
  })

  test('falls back to dark for unknown value', () => {
    const t = resolveTheme({ GLM_THEME: 'amoled-neon' })
    expect(t.name).toBe('dark')
  })

  test('exposes a known palette key set', () => {
    expect(Object.keys(themes).sort()).toEqual(['dark', 'light'])
    for (const t of Object.values(themes)) {
      expect(t.colors).toHaveProperty('fg')
      expect(t.colors).toHaveProperty('dim')
      expect(t.colors).toHaveProperty('accent')
      expect(t.colors).toHaveProperty('userMsg')
      expect(t.colors).toHaveProperty('assistantMsg')
      expect(t.colors).toHaveProperty('errorMsg')
      expect(t.colors).toHaveProperty('panelBorder')
    }
  })
})
