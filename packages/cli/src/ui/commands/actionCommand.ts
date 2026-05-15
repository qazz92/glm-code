/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ACTION_MAP,
  ACTION_NAMES,
  getActiveAction,
  isValidAction,
  setActiveAction,
} from '@glm-code/core';
import type {
  CommandContext,
  MessageActionReturn,
  SlashCommand,
} from './types.js';
import { CommandKind } from './types.js';

function formatActionList(): string {
  return ACTION_NAMES.map((name) => {
    const config = ACTION_MAP[name];
    return `${name} (${config.model}, thinking=${config.thinking}, temperature=${config.temperature}) — ${config.description}`;
  }).join('\n');
}

function formatActionSetMessage(action: (typeof ACTION_NAMES)[number]): string {
  const config = ACTION_MAP[action];
  return `Action set to ${action}: model=${config.model}, thinking=${config.thinking}, temperature=${config.temperature}.`;
}

export const actionCommand: SlashCommand = {
  name: 'action',
  description: 'View or change the active GLM action preset',
  argumentHint: '<action>',
  kind: CommandKind.BUILT_IN,
  supportedModes: ['interactive', 'non_interactive', 'acp'] as const,
  action: async (
    _context: CommandContext,
    args: string,
  ): Promise<MessageActionReturn> => {
    const requestedAction = args.trim().toLowerCase();

    if (!requestedAction) {
      return {
        type: 'message',
        messageType: 'info',
        content: `Current action: ${getActiveAction()}\nAvailable actions:\n${formatActionList()}`,
      };
    }

    if (!isValidAction(requestedAction)) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Invalid action "${args.trim()}". Valid actions: ${ACTION_NAMES.join(', ')}`,
      };
    }

    setActiveAction(requestedAction);

    return {
      type: 'message',
      messageType: 'info',
      content: formatActionSetMessage(requestedAction),
    };
  },
  completion: async (_context, partialArg) => {
    const partial = partialArg.trim().toLowerCase();
    return ACTION_NAMES.filter((name) => name.startsWith(partial));
  },
};
