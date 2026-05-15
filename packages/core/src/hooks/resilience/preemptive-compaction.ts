/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { createDebugLogger } from '../../utils/debugLogger.js';
import { HookEventName } from '../types.js';
import type { HookContext, HookResult } from './types.js';

const debugLogger = createDebugLogger('PREEMPTIVE-COMPACTION');

const CONTEXT_THRESHOLD_PERCENT = 50;

/**
 * Matches a `## Memories` section up to the next `## ` heading or end of text.
 * Captures the entire block including the heading line.
 */
const MEMORIES_SECTION_RE = /(^|\n)(## Memories\b[\s\S]*?)(?=\n## |\n*$)/;

/**
 * PreCompact hook: gates compaction on context pressure and preserves the
 * `## Memories` section across compaction rounds.
 *
 * - If context usage ≤ 50 %, compaction is blocked (unnecessary).
 * - Otherwise the `## Memories` block is extracted from the system prompt
 *   and returned as `preservedContent` so the caller can re-inject it after
 *   the compact operation finishes.
 */
export function preemptiveCompactionHook(context: HookContext): HookResult {
  if (context.event !== HookEventName.PreCompact) {
    return { action: 'skip', reason: 'Not a PreCompact event' };
  }

  const contextPercent = context.contextPercent ?? 0;

  if (contextPercent <= CONTEXT_THRESHOLD_PERCENT) {
    debugLogger.info(
      `Skipping compaction: context at ${contextPercent.toFixed(1)}% (threshold: ${CONTEXT_THRESHOLD_PERCENT}%)`,
    );
    return {
      action: 'block',
      reason: `Context at ${contextPercent.toFixed(1)}%, below ${CONTEXT_THRESHOLD_PERCENT}% threshold`,
    };
  }

  // Extract Memories section from system prompt before compaction
  let preservedMemories: string | undefined;
  if (context.systemPrompt) {
    const match = context.systemPrompt.match(MEMORIES_SECTION_RE);
    if (match) {
      preservedMemories = match[2].trim();
      debugLogger.info('Preserving Memories section before compaction');
    }
  }

  debugLogger.info(
    `Allowing compaction: context at ${contextPercent.toFixed(1)}%`,
  );
  return {
    action: 'allow',
    reason: `Context at ${contextPercent.toFixed(1)}%, above threshold`,
    preservedContent: preservedMemories,
  };
}
