/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import process from 'node:process';

import { createDebugLogger } from '../../utils/debugLogger.js';
import { HookEventName } from '../types.js';
import type { HookContext, HookResult } from './types.js';

const debugLogger = createDebugLogger('TRACE-TIMELINE');

function sessionsDir(sessionId: string): string {
  return path.join(
    process.env['HOME'] ?? '~',
    '.glm',
    'sessions',
    sessionId,
  );
}

function tracePath(sessionId: string): string {
  return path.join(sessionsDir(sessionId), 'trace.jsonl');
}

/** Single entry in the JSONL trace log. */
interface TraceEntry {
  timestamp: string;
  event: string;
  tool?: string;
  duration?: number;
  resultSummary?: string;
  promptHash?: string;
  classification?: string;
}

/**
 * Append-only trace hook that records every hook event to a JSONL file.
 *
 * - PostToolUse: records tool name, wall duration, result status
 * - UserPromptSubmit: records sha256(prompt).slice(0,16), classification
 * - All other events: records event name
 *
 * Uses `appendFile` for low overhead — no read-modify-write cycles.
 */
export function traceTimelineHook(context: HookContext): HookResult {
  const entry: TraceEntry = {
    timestamp: new Date().toISOString(),
    event: context.event,
  };

  // ── Event-specific enrichment ──────────────────────────────────────
  switch (context.event) {
    case HookEventName.PostToolUse: {
      entry.tool = context.toolName;
      entry.duration = context.toolDuration;
      entry.resultSummary =
        typeof context.toolResult === 'string'
          ? context.toolResult.slice(0, 120)
          : undefined;
      break;
    }
    case HookEventName.UserPromptSubmit: {
      if (context.prompt) {
        entry.promptHash = crypto
          .createHash('sha256')
          .update(context.prompt)
          .digest('hex')
          .slice(0, 16);
        entry.classification = classifyPrompt(context.prompt);
      }
      break;
    }
    default:
      break;
  }

  // ── Append to JSONL ────────────────────────────────────────────────
  const line = JSON.stringify(entry) + '\n';
  try {
    const dir = sessionsDir(context.sessionId);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.appendFileSync(tracePath(context.sessionId), line, 'utf-8');
  } catch (err) {
    // Trace is best-effort; never block the hook pipeline on I/O errors.
    debugLogger.error('Failed to append trace entry', err);
  }

  return { action: 'allow', reason: 'Trace entry recorded' };
}

/**
 * Very lightweight prompt classifier for trace metadata.
 * Returns one of a fixed set of labels.
 */
function classifyPrompt(prompt: string): string {
  const lower = prompt.toLowerCase();

  if (lower.startsWith('/') || lower.startsWith('run ') || lower.startsWith('build')) {
    return 'command';
  }
  if (/fix|bug|error|broken/i.test(prompt)) {
    return 'bugfix';
  }
  if (/add|create|implement|build|write/i.test(prompt)) {
    return 'feature';
  }
  if (/refactor|clean|rename|move/i.test(prompt)) {
    return 'refactor';
  }
  if (/test|spec|verify/i.test(prompt)) {
    return 'test';
  }
  if (/what|how|why|explain|show|list|status/i.test(prompt)) {
    return 'query';
  }
  return 'general';
}
