/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { getToolTier, shouldAutoApprove } from './tool-tiers.js';

describe('tool tiers', () => {
  it('classifies canonical tier A read-only tools', () => {
    expect(getToolTier('read_file')).toBe('A');
    expect(getToolTier('grep_search')).toBe('A');
    expect(getToolTier('tool_search')).toBe('A');
  });

  it('classifies canonical tier B workspace tools', () => {
    expect(getToolTier('edit')).toBe('B');
    expect(getToolTier('write_file')).toBe('B');
    expect(getToolTier('run_shell_command')).toBe('B');
  });

  it('classifies external, MCP, and unknown tools as tier C', () => {
    expect(getToolTier('web_fetch')).toBe('C');
    expect(getToolTier('mcp__server__tool')).toBe('C');
    expect(getToolTier('unknown_tool')).toBe('C');
  });

  it('auto-approves tier A in safe modes and tier B only in workspace tier-b mode', () => {
    expect(shouldAutoApprove('read_file', 'safe', false)).toBe(true);
    expect(shouldAutoApprove('edit', 'tier-b', true)).toBe(true);
    expect(shouldAutoApprove('edit', 'tier-b', false)).toBe(false);
    expect(shouldAutoApprove('web_fetch', 'tier-b', true)).toBe(false);
  });
});
