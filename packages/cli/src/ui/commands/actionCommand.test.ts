/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { getActiveAction, setActiveAction } from '@glm-code/core';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { actionCommand } from './actionCommand.js';
import { CommandKind, type MessageActionReturn } from './types.js';

describe('actionCommand', () => {
  beforeEach(() => {
    setActiveAction('default');
  });

  it('has command metadata', () => {
    expect(actionCommand.name).toBe('action');
    expect(actionCommand.kind).toBe(CommandKind.BUILT_IN);
    expect(actionCommand.argumentHint).toBe('<action>');
  });

  it('prints current action and available actions with no argument', async () => {
    const result = (await actionCommand.action?.(
      createMockCommandContext(),
      '',
    )) as MessageActionReturn;

    expect(result.type).toBe('message');
    expect(result.messageType).toBe('info');
    expect(result.content).toContain('Current action: default');
    expect(result.content).toContain('plan');
  });

  it('sets action preset case-insensitively', async () => {
    const result = (await actionCommand.action?.(
      createMockCommandContext(),
      ' PLAN ',
    )) as MessageActionReturn;

    expect(result.messageType).toBe('info');
    expect(result.content).toContain('Action set to plan');
    expect(result.content).toContain('model=GLM-5.1');
    expect(result.content).toContain('thinking=high');
    expect(result.content).toContain('temperature=0.2');
    expect(getActiveAction()).toBe('plan');
  });

  it('rejects invalid actions without mutating state', async () => {
    setActiveAction('smol');

    const result = (await actionCommand.action?.(
      createMockCommandContext(),
      'invalid',
    )) as MessageActionReturn;

    expect(result.messageType).toBe('error');
    expect(result.content).toContain('Valid actions');
    expect(getActiveAction()).toBe('smol');
  });

  it('completes available action names', async () => {
    await expect(
      actionCommand.completion?.(createMockCommandContext(), 'p'),
    ).resolves.toEqual(['plan']);
  });
});
