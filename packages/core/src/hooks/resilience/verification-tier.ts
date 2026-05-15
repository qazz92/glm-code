/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import { createDebugLogger } from '../../utils/debugLogger.js';
import { HookEventName } from '../types.js';
import type { HookContext, HookResult } from './types.js';

const debugLogger = createDebugLogger('VERIFICATION-TIER');

/** Tools that modify files and should trigger verification suggestions. */
const FILE_EDIT_TOOLS = new Set(['Edit', 'Write', 'edit_file', 'write_file']);

/** File-size tiers and their suggested verification level. */
const TIERS = [
  { maxLines: 100, label: 'typecheck only' },
  { maxLines: 500, label: 'typecheck + lint' },
  { maxLines: Infinity, label: 'full test suite' },
] as const;

/**
 * PostToolUse hook for Edit/Write tools: suggests a verification tier based
 * on the size of the edited file.
 *
 * - small (<100 lines): typecheck only
 * - medium (100–500 lines): typecheck + lint
 * - large (>500 lines): full test suite
 *
 * The suggestion is injected as a system reminder so the LLM can act on it
 * in subsequent turns.
 */
export function verificationTierHook(context: HookContext): HookResult {
  if (context.event !== HookEventName.PostToolUse) {
    return { action: 'skip', reason: 'Not a PostToolUse event' };
  }

  if (!context.toolName || !FILE_EDIT_TOOLS.has(context.toolName)) {
    return { action: 'skip', reason: 'Not a file-editing tool' };
  }

  const filePath = context.filePath ?? extractFilePath(context.toolInput);
  if (!filePath) {
    return { action: 'skip', reason: 'No file path in tool input' };
  }

  const stats = getFileStats(filePath);
  if (!stats) {
    return { action: 'skip', reason: `Cannot stat file: ${filePath}` };
  }

  const tier = TIERS.find((t) => stats.lines <= t.maxLines) ?? TIERS[TIERS.length - 1];

  debugLogger.info(
    `${filePath}: ${stats.lines} lines (${stats.bytes} bytes) → ${tier.label}`,
  );

  return {
    action: 'inject',
    reason: `File ${filePath} is ${stats.lines} lines, suggesting ${tier.label}`,
    systemMessage: `[GLM Verification] ${filePath} edited (${stats.lines} lines). Suggested verification: ${tier.label}`,
    data: {
      filePath,
      lineCount: stats.lines,
      byteSize: stats.bytes,
      suggestedTier: tier.label,
    },
  };
}

/** Extract file_path from standard tool input shapes. */
function extractFilePath(
  toolInput?: Record<string, unknown>,
): string | undefined {
  if (!toolInput) return undefined;
  return (
    (toolInput['file_path'] as string | undefined) ??
    (toolInput['path'] as string | undefined) ??
    (toolInput['filePath'] as string | undefined)
  );
}

/** Try to read line count and byte size of a file. Returns null on failure. */
function getFileStats(
  filePath: string,
): { lines: number; bytes: number } | null {
  try {
    const buf = fs.readFileSync(filePath, 'utf-8');
    const lines = buf.split('\n').length;
    const bytes = Buffer.byteLength(buf, 'utf-8');
    return { lines, bytes };
  } catch {
    return null;
  }
}
