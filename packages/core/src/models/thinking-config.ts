/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * Thinking effort configuration — 7 levels with token budget mapping.
 * Controls how many tokens the model spends on chain-of-thought reasoning.
 */

import type { ThinkingConfig } from '@google/genai';
import type { ThinkingLevel } from './action-registry.js';
import { createDebugLogger } from '../utils/debugLogger.js';

const debugLogger = createDebugLogger('THINKING_CONFIG');

/** Token budgets for each thinking level. null = use model default. */
export const THINKING_BUDGETS: Record<ThinkingLevel, number | null> = {
  inherit: null, // Use model default
  off: 0, // No thinking tokens
  min: 1024, // Minimal reasoning
  low: 4096, // Light reasoning
  medium: 16384, // Standard reasoning
  high: 65536, // Deep reasoning
  xhigh: 131072, // Maximum reasoning
};

/** All valid thinking level names. */
export const THINKING_LEVELS: readonly ThinkingLevel[] = [
  'inherit',
  'off',
  'min',
  'low',
  'medium',
  'high',
  'xhigh',
] as const;

/** Current thinking level for the session. */
let currentLevel: ThinkingLevel = 'inherit';

/**
 * Get the current thinking level.
 */
export function getThinkingLevel(): ThinkingLevel {
  return currentLevel;
}

/**
 * Set the thinking level.
 * @throws Error if level is invalid
 */
export function setThinkingLevel(level: ThinkingLevel): void {
  if (!(level in THINKING_BUDGETS)) {
    throw new Error(
      `Invalid thinking level: ${level}. Valid: ${THINKING_LEVELS.join(', ')}`,
    );
  }
  currentLevel = level;
  debugLogger.info(
    `Thinking level set to: ${level} (budget: ${THINKING_BUDGETS[level] ?? 'default'} tokens)`,
  );
}

/**
 * Get the token budget for the current thinking level.
 * Returns null if 'inherit' (use model default).
 */
export function getThinkingBudget(): number | null {
  return THINKING_BUDGETS[currentLevel];
}

/**
 * Resolve the thinking budget for a specific level.
 * Falls back to the current level if none specified.
 */
export function resolveThinkingBudget(level?: ThinkingLevel): number | null {
  return THINKING_BUDGETS[level ?? currentLevel];
}

/**
 * Check if a string is a valid thinking level.
 */
export function isValidThinkingLevel(name: string): name is ThinkingLevel {
  return name in THINKING_BUDGETS;
}

/**
 * Build thinking config for LLM API calls.
 * Returns an object suitable for `thinkingConfig` parameter.
 */
export function buildThinkingConfig(
  level?: ThinkingLevel,
): ThinkingConfig | undefined {
  const budget = resolveThinkingBudget(level);
  if (budget === null) return undefined; // inherit = use model default
  if (budget === 0) return undefined; // off = send no thinking budget
  return { includeThoughts: true, thinkingBudget: budget };
}
