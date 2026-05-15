/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import open from 'open';
import process from 'node:process';
import {
  type CommandContext,
  type SlashCommand,
  CommandKind,
} from './types.js';
import { MessageType } from '../types.js';
import { t, getCurrentLanguage } from '../../i18n/index.js';

export const docsCommand: SlashCommand = {
  name: 'docs',
  get description() {
    return t('open full GLM Code documentation in your browser');
  },
  kind: CommandKind.BUILT_IN,
  supportedModes: ['interactive', 'non_interactive', 'acp'] as const,
  action: async (context: CommandContext) => {
    const langPath = getCurrentLanguage()?.startsWith('zh') ? 'zh' : 'en';
    const docsUrl = `https://docs.z.ai/glm-code-docs/${langPath}`;

    // Non-interactive/ACP: return URL directly, no browser, no addItem
    if (context.executionMode !== 'interactive') {
      return {
        type: 'message' as const,
        messageType: 'info' as const,
        content: `GLM Code documentation: ${docsUrl}`,
      };
    }

    if (process.env['SANDBOX'] && process.env['SANDBOX'] !== 'sandbox-exec') {
      context.ui.addItem(
        {
          type: MessageType.INFO,
          text: t(
            'Please open the following URL in your browser to view the documentation:\n{{url}}',
            {
              url: docsUrl,
            },
          ),
        },
        Date.now(),
      );
    } else {
      context.ui.addItem(
        {
          type: MessageType.INFO,
          text: t('Opening documentation in your browser: {{url}}', {
            url: docsUrl,
          }),
        },
        Date.now(),
      );
      await open(docsUrl);
    }
    return;
  },
};
