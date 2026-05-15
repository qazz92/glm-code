/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import process from 'node:process';

import { createDebugLogger } from '../../utils/debugLogger.js';
import { HookEventName } from '../types.js';
import type { HookContext, HookResult, TodoItem } from './types.js';

const debugLogger = createDebugLogger('CONTINUATION-ENFORCEMENT');

function preservePath(sessionId: string): string {
  return path.join(
    process.env['HOME'] ?? '~',
    '.glm',
    'workflows',
    sessionId,
    'todo-preserve.json',
  );
}

/**
 * Stop hook: prevent premature session termination when there are remaining
 * (non-done) todo items.
 *
 * Reads the persisted todo list and, if any items are incomplete, injects a
 * system message prompting the user to continue.
 */
export function continuationEnforcementHook(context: HookContext): HookResult {
  if (context.event !== HookEventName.Stop) {
    return { action: 'skip', reason: 'Not a Stop event' };
  }

  let todos: TodoItem[];
  try {
    const raw = fs.readFileSync(preservePath(context.sessionId), 'utf-8');
    todos = JSON.parse(raw) as TodoItem[];
  } catch {
    // No todo file or unreadable — nothing to enforce
    return { action: 'allow', reason: 'No todo state found' };
  }

  const remaining = todos.filter((t) => !t.done);
  if (remaining.length === 0) {
    return { action: 'allow', reason: 'All todos complete' };
  }

  debugLogger.info(
    `${remaining.length} tasks remaining, requesting continuation`,
  );

  return {
    action: 'inject',
    reason: `${remaining.length} incomplete tasks`,
    systemMessage: `[GLM] ${remaining.length} tasks remaining. Continue? (y/n)`,
    data: {
      remainingCount: remaining.length,
      remainingItems: remaining.map((t) => t.text),
    },
  };
}
