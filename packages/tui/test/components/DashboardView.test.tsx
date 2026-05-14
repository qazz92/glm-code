import React from 'react'
import { describe, expect, test } from 'vitest'
import { render } from 'ink-testing-library'
import { DashboardView } from '../../src/components/DashboardView.js'
import { themes } from '../../src/theme/theme.js'
import { EventEmitter } from 'node:events'
import { TuiRpcClient } from '../../src/rpc/TuiRpcClient.js'

function fakeRpc(): TuiRpcClient {
  const e = new EventEmitter() as any
  e.write = () => true
  e.end = () => e.emit('close')
  return new TuiRpcClient({ socket: e })
}

describe('<DashboardView>', () => {
  test('renders four labelled panels', () => {
    const out = render(
      <DashboardView theme={themes.dark} rpc={fakeRpc()} />
    )
    const frame = out.lastFrame() ?? ''
    expect(frame).toContain('Orchestrator')
    expect(frame).toContain('Main')
    expect(frame).toContain('Workers')
    expect(frame).toContain('Status')
  })

  test('shows "no orchestrator yet (P8)" placeholder', () => {
    const out = render(<DashboardView theme={themes.dark} rpc={fakeRpc()} />)
    expect(out.lastFrame()).toContain('P8')
  })
})
