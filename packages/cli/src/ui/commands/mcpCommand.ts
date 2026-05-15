/**
 * @license
 * Copyright 2025 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SlashCommand, OpenDialogActionReturn } from './types.js';
import { CommandKind } from './types.js';
import { t } from '../../i18n/index.js';
import { mcpReloadCommand } from './mcpReloadCommand.js';

export const mcpCommand: SlashCommand = {
  name: 'mcp',
  get description() {
    return t('Open MCP management dialog');
  },
  argumentHint: 'desc|nodesc|schema|auth|noauth',
  kind: CommandKind.BUILT_IN,
  supportedModes: ['interactive'] as const,
  subCommands: [mcpReloadCommand],
  action: async (): Promise<OpenDialogActionReturn> => ({
    type: 'dialog',
    dialog: 'mcp',
  }),
};
