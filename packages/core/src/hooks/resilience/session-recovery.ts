/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { createDebugLogger } from '../../utils/debugLogger.js';
import { findLatestCheckpoint } from '../../orchestrator/checkpoint.js';
import { HookEventName } from '../types.js';
import type { HookContext, HookResult } from './types.js';

const debugLogger = createDebugLogger('SESSION-RECOVERY');

/** Maximum messages to scan backwards for missing tool results. */
const SCAN_DEPTH = 5;

/**
 * SessionStart hook: detect previous-session checkpoints and missing tool
 * results so the user can resume without data loss.
 */
export function sessionRecoveryHook(context: HookContext): HookResult {
  if (context.event !== HookEventName.SessionStart) {
    return { action: 'skip', reason: 'Not a SessionStart event' };
  }

  const parts: string[] = [];

  // ── Check for previous session checkpoint ──────────────────────────
  try {
    const checkpoint = findLatestCheckpoint(context.sessionId);
    if (checkpoint) {
      debugLogger.info(
        `Found checkpoint at turn ${checkpoint.turnNumber}`,
      );
      parts.push(
        `Previous session checkpoint found (turn ${checkpoint.turnNumber}). Type /resume to continue from checkpoint.`,
      );
    }
  } catch (err) {
    debugLogger.error('Failed to check for checkpoints', err);
  }

  // ── Detect missing tool results ────────────────────────────────────
  const messages = context.messages;
  if (messages && messages.length > 0) {
    const tail = messages.slice(-SCAN_DEPTH);
    const gaps = detectMissingToolResults(tail);
    if (gaps.length > 0) {
      debugLogger.info(
        `Found ${gaps.length} tool_use(s) without results`,
      );
      const toolNames = gaps.join(', ');
      parts.push(
        `Missing tool results detected for: ${toolNames}. Consider re-executing these tools.`,
      );
    }
  }

  if (parts.length === 0) {
    return { action: 'allow', reason: 'No recovery needed' };
  }

  return {
    action: 'inject',
    reason: 'Session recovery suggestions',
    systemMessage: parts.join('\n\n'),
  };
}

/**
 * Scan the last N messages for `tool_use` entries that lack a matching
 * `tool_result` (same `tool_use_id`).
 */
function detectMissingToolResults(
  messages: Array<Record<string, unknown>>,
): string[] {
  const toolUseIds = new Set<string>();
  const toolResultIds = new Set<string>();
  const toolNames: Map<string, string> = new Map();

  for (const msg of messages) {
    const role = msg['role'] as string | undefined;
    const content = msg['content'] as
      | Array<Record<string, unknown>>
      | undefined;

    if (!Array.isArray(content)) continue;

    for (const block of content) {
      if (block['type'] === 'tool_use' && typeof block['id'] === 'string') {
        toolUseIds.add(block['id']);
        toolNames.set(block['id'], (block['name'] as string) ?? 'unknown');
      }
      if (block['type'] === 'tool_result' && typeof block['tool_use_id'] === 'string') {
        toolResultIds.add(block['tool_use_id']);
      }
    }

    // Also check top-level fields for older message formats
    if (role === 'tool_use' && typeof msg['id'] === 'string') {
      toolUseIds.add(msg['id']);
      toolNames.set(msg['id'], (msg['name'] as string) ?? 'unknown');
    }
    if (role === 'tool_result' && typeof msg['tool_use_id'] === 'string') {
      toolResultIds.add(msg['tool_use_id'] as string);
    }
  }

  const missing: string[] = [];
  for (const id of toolUseIds) {
    if (!toolResultIds.has(id)) {
      missing.push(toolNames.get(id) ?? 'unknown');
    }
  }

  return missing;
}
