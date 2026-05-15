/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  HookEventName,
  PostCompactTrigger,
  PreCompactTrigger,
} from '../types.js';

/** A single todo tracking item. */
export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
}

/**
 * Unified context object passed to every resilience hook.
 * Callers populate only the fields relevant to the event.
 */
export interface HookContext {
  event: HookEventName;
  sessionId: string;

  /** Context window usage percent (0–100). Used by preemptive-compaction. */
  contextPercent?: number;

  /** Tool name for PreToolUse / PostToolUse events. */
  toolName?: string;
  /** Tool input payload. */
  toolInput?: Record<string, unknown>;
  /** Wall-clock duration of the tool call in ms. */
  toolDuration?: number;
  /** Short result summary from the tool call. */
  toolResult?: string;

  /** Raw user prompt for UserPromptSubmit. */
  prompt?: string;

  /** Current system prompt (available on compaction events). */
  systemPrompt?: string;

  /** Recent conversation messages (available on session events). */
  messages?: Array<Record<string, unknown>>;

  /** Compaction trigger. */
  trigger?: PreCompactTrigger | PostCompactTrigger;

  /** Summary produced by the compact operation (PostCompact). */
  compactSummary?: string;

  /** Current todo list items. */
  todos?: TodoItem[];

  /** File path of the edited file (PostToolUse for Edit/Write). */
  filePath?: string;
}

/** Return type for every resilience hook. */
export interface HookResult {
  action: 'allow' | 'block' | 'skip' | 'inject';
  reason?: string;
  systemMessage?: string;
  preservedContent?: string;
  data?: Record<string, unknown>;
}
