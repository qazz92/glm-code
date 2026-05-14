import React from 'react'
import { describe, expect, test } from 'vitest'
import { render } from 'ink-testing-library'
import { StatusLine } from '../../src/components/StatusLine.js'
import { themes } from '../../src/theme/theme.js'

describe('<StatusLine>', () => {
  test('renders model, session suffix, ctx %, and hints', () => {
    const out = render(
      <StatusLine
        theme={themes.dark}
        model="stub-echo"
        sessionId="01JABCDEFGHJKMNPQRSTVWXYZ0"
        ctxPercent={0}
        view="chat"
      />
    )
    const frame = out.lastFrame() ?? ''
    expect(frame).toContain('stub-echo')
    expect(frame).toContain('TVWXYZ0')          // session id suffix (last 8 chars)
    expect(frame).toContain('0%')
    expect(frame).toContain('Tab')
    expect(frame).toContain('Esc')
    expect(frame).toContain('Ctrl-D')
  })

  test('shows DASHBOARD label when view=dashboard', () => {
    const out = render(
      <StatusLine
        theme={themes.dark}
        model="stub-echo"
        sessionId="abc"
        ctxPercent={42}
        view="dashboard"
      />
    )
    expect(out.lastFrame()).toContain('DASHBOARD')
  })

  test('renders gracefully without a session', () => {
    const out = render(
      <StatusLine
        theme={themes.dark}
        model="stub-echo"
        sessionId={null}
        ctxPercent={0}
        view="chat"
      />
    )
    expect(out.lastFrame()).toContain('no session')
  })
})
