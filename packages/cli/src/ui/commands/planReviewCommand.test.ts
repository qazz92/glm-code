/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { PLAN_REVIEW_ORCHESTRATION_MARKER } from '@glm-code/core';
import { planReviewCommand } from './planReviewCommand.js';
import type { SubmitPromptActionReturn } from './types.js';

describe('planReviewCommand', () => {
  it('submits a native orchestration marker prompt with args', async () => {
    const result = (await planReviewCommand.action!(
      {
        invocation: {
          raw: '/plan-review PLAN.md --all',
          name: 'plan-review',
          args: 'PLAN.md --all',
        },
      } as never,
      'PLAN.md --all',
    )) as SubmitPromptActionReturn;

    expect(result).toEqual({
      type: 'submit_prompt',
      content: [
        {
          text: [
            PLAN_REVIEW_ORCHESTRATION_MARKER,
            '',
            'Run native plan-review orchestration with sub-agent fan-out.',
            'Arguments: PLAN.md --all',
            '',
            '/plan-review PLAN.md --all',
          ].join('\n'),
        },
      ],
    });
  });

  it('supports auto-detection when no args are provided', async () => {
    const result = (await planReviewCommand.action!(
      {
        invocation: {
          raw: '/plan-review',
          name: 'plan-review',
          args: '',
        },
      } as never,
      '',
    )) as SubmitPromptActionReturn;

    expect(result.type).toBe('submit_prompt');
    expect(JSON.stringify(result.content)).toContain(
      '(auto-detect plan file and lenses)',
    );
  });
});
