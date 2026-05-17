/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  PLAN_REVIEW_ORCHESTRATION_MARKER,
  appendToLastTextPart,
} from '@glm-code/core';
import { t } from '../../i18n/index.js';
import {
  CommandKind,
  type CommandContext,
  type SlashCommand,
  type SubmitPromptActionReturn,
} from './types.js';

function buildPlanReviewPrompt(args: string): string {
  const trimmedArgs = args.trim();
  return [
    PLAN_REVIEW_ORCHESTRATION_MARKER,
    '',
    'Run native plan-review orchestration with sub-agent fan-out.',
    `Arguments: ${trimmedArgs || '(auto-detect plan file and lenses)'}`,
  ].join('\n');
}

export const planReviewCommand: SlashCommand = {
  name: 'plan-review',
  get description() {
    return t(
      'Review plans through native product/UX/technical sub-agent orchestration',
    );
  },
  argumentHint: '[plan-path] [--all|--product|--ux|--technical]',
  kind: CommandKind.BUILT_IN,
  supportedModes: ['interactive', 'non_interactive', 'acp'] as const,
  action: async (
    context: CommandContext,
    args: string,
  ): Promise<SubmitPromptActionReturn> => {
    const prompt = buildPlanReviewPrompt(args);
    const content = context.invocation?.raw
      ? appendToLastTextPart([{ text: prompt }], context.invocation.raw)
      : [{ text: prompt }];

    return {
      type: 'submit_prompt',
      content,
    };
  },
};
