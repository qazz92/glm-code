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

const debugLogger = createDebugLogger('TODO-PRESERVER');

function workflowsDir(sessionId: string): string {
  return path.join(
    process.env['HOME'] ?? '~',
    '.glm',
    'workflows',
    sessionId,
  );
}

function preservePath(sessionId: string): string {
  return path.join(workflowsDir(sessionId), 'todo-preserve.json');
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Serialise todo items to disk on PreCompact and re-inject them on
 * PostCompact so that compaction never destroys task-tracking state.
 */
export function todoPreserverHook(context: HookContext): HookResult {
  // ── PreCompact: persist current todos to disk ──────────────────────
  if (context.event === HookEventName.PreCompact) {
    const todos = context.todos;
    if (!todos || todos.length === 0) {
      debugLogger.info('No todos to preserve');
      return { action: 'allow', reason: 'No todos to preserve' };
    }

    const dir = workflowsDir(context.sessionId);
    ensureDir(dir);

    const filePath = preservePath(context.sessionId);
    try {
      fs.writeFileSync(filePath, JSON.stringify(todos, null, 2), 'utf-8');
      debugLogger.info(
        `Preserved ${todos.length} todos to ${filePath}`,
      );
    } catch (err) {
      debugLogger.error('Failed to preserve todos', err);
      return {
        action: 'allow',
        reason: 'Todo preservation failed, continuing anyway',
      };
    }

    return { action: 'allow', reason: 'Todos preserved' };
  }

  // ── PostCompact: re-inject preserved todos ─────────────────────────
  if (context.event === HookEventName.PostCompact) {
    const filePath = preservePath(context.sessionId);
    let todos: TodoItem[];
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      todos = JSON.parse(raw) as TodoItem[];
    } catch {
      debugLogger.info('No preserved todos found');
      return { action: 'allow', reason: 'No preserved todos' };
    }

    if (todos.length === 0) {
      return { action: 'allow', reason: 'Preserved todo list is empty' };
    }

    const remaining = todos.filter((t) => !t.done);
    const lines = [
      '## Preserved Task List',
      '',
      ...todos.map((t) => `- [${t.done ? 'x' : ' '}] ${t.text}`),
      '',
      `(${remaining.length} remaining)`,
    ].join('\n');

    debugLogger.info(
      `Re-injecting ${todos.length} todos (${remaining.length} remaining)`,
    );

    return {
      action: 'inject',
      reason: 'Re-injected preserved todos after compaction',
      systemMessage: lines,
      preservedContent: JSON.stringify(todos),
    };
  }

  return { action: 'skip', reason: 'Not a compaction event' };
}
