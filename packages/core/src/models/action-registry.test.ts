/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  ACTION_MAP,
  ACTION_NAMES,
  getActiveAction,
  getActiveActionConfig,
  isValidAction,
  setActiveAction,
} from './action-registry.js';

describe('action registry', () => {
  beforeEach(() => {
    setActiveAction('default');
  });

  it('defines the seven supported actions', () => {
    expect(ACTION_NAMES).toEqual([
      'default',
      'smol',
      'slow',
      'plan',
      'designer',
      'commit',
      'task',
    ]);
  });

  it('sets and resolves the plan action preset', () => {
    const config = setActiveAction('plan');

    expect(getActiveAction()).toBe('plan');
    expect(getActiveActionConfig()).toBe(config);
    expect(config).toEqual(ACTION_MAP.plan);
    expect(config.model).toBe('GLM-5.1');
    expect(config.thinking).toBe('high');
    expect(config.temperature).toBe(0.2);
  });

  it('rejects invalid actions without mutating the active action', () => {
    setActiveAction('smol');

    expect(isValidAction('nope')).toBe(false);
    expect(() => setActiveAction('nope' as never)).toThrow(/Unknown action/);
    expect(getActiveAction()).toBe('smol');
  });
});
