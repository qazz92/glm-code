/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * Step limiter — enforces step size boundaries for long-horizon workflows.
 * Each step must be ≤ 30 LLM turns and touch ≤ 3 files.
 * When exceeded, the step must be split into a subtask boundary.
 */

/** Maximum LLM turns per step before mandatory split. */
export const MAX_TURNS_PER_STEP = 30;

/** Maximum files touched per step before mandatory split. */
export const MAX_FILES_PER_STEP = 3;

/**
 * Check whether the current step should be split.
 * Returns true if turnCount > 30 or filesTouched > 3.
 */
export function shouldSplitStep(
  turnCount: number,
  filesTouched: number,
): { split: boolean; reason: string } {
  if (turnCount > MAX_TURNS_PER_STEP) {
    return {
      split: true,
      reason: `Turn count (${turnCount}) exceeds limit (${MAX_TURNS_PER_STEP})`,
    };
  }
  if (filesTouched > MAX_FILES_PER_STEP) {
    return {
      split: true,
      reason: `Files touched (${filesTouched}) exceeds limit (${MAX_FILES_PER_STEP})`,
    };
  }
  return { split: false, reason: '' };
}

/**
 * Build a system instruction that forces a step boundary.
 * This instruction tells the LLM to stop and checkpoint.
 */
export function formatSplitInstruction(reason: string): string {
  return [
    '## Step Boundary Reached',
    '',
    `Reason: ${reason}`,
    '',
    'You MUST checkpoint your current progress:',
    '1. Save any in-progress work to disk.',
    '2. Write a brief summary of what was accomplished.',
    '3. List remaining work as explicit next steps.',
    '4. Commit the checkpoint.',
    '',
    'Do NOT continue working past this boundary.',
    'The next step will pick up from your checkpoint.',
  ].join('\n');
}
