/**
 * @license
 * Copyright 2025 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  CommandContext,
  SlashCommand,
  MessageActionReturn,
} from './types.js';
import { CommandKind } from './types.js';
import { t } from '../../i18n/index.js';

async function reloadMcpServers(
  context: CommandContext,
): Promise<MessageActionReturn> {
  const config = context.services.config;
  if (!config) {
    return {
      type: 'message',
      messageType: 'error',
      content: t('Config not available.'),
    };
  }

  const toolRegistry = config.getToolRegistry();
  if (!toolRegistry) {
    return {
      type: 'message',
      messageType: 'error',
      content: t('Tool registry not available.'),
    };
  }

  try {
    await toolRegistry.restartMcpServers();
    return {
      type: 'message',
      messageType: 'info',
      content: t('MCP servers reloaded successfully.'),
    };
  } catch (err) {
    return {
      type: 'message',
      messageType: 'error',
      content: t('Failed to reload MCP servers: {{error}}', {
        error: err instanceof Error ? err.message : String(err),
      }),
    };
  }
}

export const mcpReloadCommand: SlashCommand = {
  name: 'reload',
  get description() {
    return t('Reload MCP servers');
  },
  kind: CommandKind.BUILT_IN,
  supportedModes: ['interactive'] as const,
  action: reloadMcpServers,
};
