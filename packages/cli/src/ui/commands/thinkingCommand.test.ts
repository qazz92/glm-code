/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { getThinkingLevel, setThinkingLevel } from '@glm-code/core';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { thinkingCommand } from './thinkingCommand.js';
import { CommandKind, type MessageActionReturn } from './types.js';

describe('thinkingCommand', () => {
  beforeEach(() => {
    setThinkingLevel('inherit');
  });

  it('has command metadata', () => {
    expect(thinkingCommand.name).toBe('thinking');
    expect(thinkingCommand.kind).toBe(CommandKind.BUILT_IN);
    expect(thinkingCommand.argumentHint).toBe('<level>');
  });

  it('prints current level and available levels with no argument', async () => {
    const result = (await thinkingCommand.action?.(
      createMockCommandContext(),
      '',
    )) as MessageActionReturn;

    expect(result.type).toBe('message');
    expect(result.messageType).toBe('info');
    expect(result.content).toContain('Current thinking level: inherit');
    expect(result.content).toContain('high (65,536 tokens)');
  });

  it('sets thinking level case-insensitively', async () => {
    const result = (await thinkingCommand.action?.(
      createMockCommandContext(),
      ' HIGH ',
    )) as MessageActionReturn;

    expect(result.messageType).toBe('info');
    expect(result.content).toContain('Thinking level set to high');
    expect(result.content).toContain('65,536 tokens');
    expect(getThinkingLevel()).toBe('high');
  });

  it('sets off to no thinking budget', async () => {
    const result = (await thinkingCommand.action?.(
      createMockCommandContext(),
      'off',
    )) as MessageActionReturn;

    expect(result.messageType).toBe('info');
    expect(result.content).toContain('no thinking budget');
    expect(getThinkingLevel()).toBe('off');
  });

  it('rejects invalid levels without mutating state', async () => {
    setThinkingLevel('medium');

    const result = (await thinkingCommand.action?.(
      createMockCommandContext(),
      'turbo',
    )) as MessageActionReturn;

    expect(result.messageType).toBe('error');
    expect(result.content).toContain('Valid levels');
    expect(getThinkingLevel()).toBe('medium');
  });

  it('completes available thinking levels', async () => {
    await expect(
      thinkingCommand.completion?.(createMockCommandContext(), 'h'),
    ).resolves.toEqual(['high']);
  });
});
