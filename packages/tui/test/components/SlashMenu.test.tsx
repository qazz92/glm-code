import React from 'react'
import { describe, expect, test } from 'vitest'
import { render } from 'ink-testing-library'
import { SlashMenu } from '../../src/components/SlashMenu.js'
import { themes } from '../../src/theme/theme.js'

describe('<SlashMenu>', () => {
  test('renders list of completions with the first highlighted', () => {
    const out = render(
      <SlashMenu
        theme={themes.dark}
        items={[
          { name: 'help', summary: 'List commands' },
          { name: 'history', summary: 'Show input history' }
        ]}
        selectedIndex={0}
      />
    )
    const frame = out.lastFrame() ?? ''
    expect(frame).toContain('/help')
    expect(frame).toContain('/history')
    expect(frame).toContain('List commands')
  })

  test('renders nothing when items is empty', () => {
    const out = render(<SlashMenu theme={themes.dark} items={[]} selectedIndex={0} />)
    expect((out.lastFrame() ?? '').trim()).toBe('')
  })
})
