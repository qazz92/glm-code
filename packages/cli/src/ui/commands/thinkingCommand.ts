/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  getThinkingLevel,
  isValidThinkingLevel,
  setThinkingLevel,
  THINKING_BUDGETS,
  THINKING_LEVELS,
} from '@glm-code/core';
import type {
  CommandContext,
  MessageActionReturn,
  SlashCommand,
} from './types.js';
import { CommandKind } from './types.js';

function formatBudget(level: (typeof THINKING_LEVELS)[number]): string {
  const budget = THINKING_BUDGETS[level];
  if (budget === null) return 'model default';
  if (budget === 0) return 'no thinking budget';
  return `${new Intl.NumberFormat('en-US').format(budget)} tokens`;
}

function formatThinkingList(): string {
  return THINKING_LEVELS.map(
    (level) => `${level} (${formatBudget(level)})`,
  ).join('\n');
}

export const thinkingCommand: SlashCommand = {
  name: 'thinking',
  description: 'View or change the GLM thinking budget level',
  argumentHint: '<level>',
  kind: CommandKind.BUILT_IN,
  supportedModes: ['interactive', 'non_interactive', 'acp'] as const,
  action: async (
    _context: CommandContext,
    args: string,
  ): Promise<MessageActionReturn> => {
    const requestedLevel = args.trim().toLowerCase();

    if (!requestedLevel) {
      const current = getThinkingLevel();
      return {
        type: 'message',
        messageType: 'info',
        content: `Current thinking level: ${current} (${formatBudget(current)})\nAvailable levels:\n${formatThinkingList()}`,
      };
    }

    if (!isValidThinkingLevel(requestedLevel)) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Invalid thinking level "${args.trim()}". Valid levels: ${THINKING_LEVELS.join(', ')}`,
      };
    }

    setThinkingLevel(requestedLevel);

    return {
      type: 'message',
      messageType: 'info',
      content: `Thinking level set to ${requestedLevel} (${formatBudget(requestedLevel)}).`,
    };
  },
  completion: async (_context, partialArg) => {
    const partial = partialArg.trim().toLowerCase();
    return THINKING_LEVELS.filter((level) => level.startsWith(partial));
  },
};
