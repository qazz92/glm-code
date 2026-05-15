/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildThinkingConfig,
  getThinkingBudget,
  getThinkingLevel,
  isValidThinkingLevel,
  setThinkingLevel,
  THINKING_BUDGETS,
  THINKING_LEVELS,
} from './thinking-config.js';

describe('thinking config', () => {
  beforeEach(() => {
    setThinkingLevel('inherit');
  });

  it('defines the supported levels and budgets', () => {
    expect(THINKING_LEVELS).toEqual([
      'inherit',
      'off',
      'min',
      'low',
      'medium',
      'high',
      'xhigh',
    ]);
    expect(THINKING_BUDGETS.high).toBe(65_536);
  });

  it('sets and resolves a thinking level', () => {
    setThinkingLevel('high');

    expect(getThinkingLevel()).toBe('high');
    expect(getThinkingBudget()).toBe(65_536);
    expect(buildThinkingConfig()).toEqual({
      includeThoughts: true,
      thinkingBudget: 65_536,
    });
  });

  it('builds explicit configs without mutating the session level', () => {
    expect(buildThinkingConfig('low')).toEqual({
      includeThoughts: true,
      thinkingBudget: 4096,
    });
    expect(getThinkingLevel()).toBe('inherit');
  });

  it('sends no thinking budget for inherit and off', () => {
    expect(buildThinkingConfig('inherit')).toBeUndefined();
    expect(buildThinkingConfig('off')).toBeUndefined();
  });

  it('rejects invalid levels without mutating the active level', () => {
    setThinkingLevel('medium');

    expect(isValidThinkingLevel('turbo')).toBe(false);
    expect(() => setThinkingLevel('turbo' as never)).toThrow(
      /Invalid thinking level/,
    );
    expect(getThinkingLevel()).toBe('medium');
  });
});
