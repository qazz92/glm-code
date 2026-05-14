import React from 'react'
import { describe, expect, test } from 'vitest'
import { render } from 'ink-testing-library'
import { InputBox } from '../../src/components/InputBox.js'
import { themes } from '../../src/theme/theme.js'

describe('<InputBox>', () => {
  test('renders an empty prompt with caret', () => {
    const out = render(<InputBox theme={themes.dark} value="" onChange={() => {}} onSubmit={() => {}} disabled={false} />)
    const frame = out.lastFrame() ?? ''
    expect(frame).toContain('›')
  })

  test('shows submitted value as it grows', () => {
    const out = render(<InputBox theme={themes.dark} value="hello" onChange={() => {}} onSubmit={() => {}} disabled={false} />)
    expect(out.lastFrame()).toContain('hello')
  })

  test('dims when disabled', () => {
    const out = render(<InputBox theme={themes.dark} value="x" onChange={() => {}} onSubmit={() => {}} disabled={true} />)
    expect(out.lastFrame()).toContain('(waiting…)')
  })
})
