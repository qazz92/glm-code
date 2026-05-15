/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * Context-aware delegation heuristics — evaluates tool results
 * and context pressure to suggest delegating work to sub-agents.
 */

import { createDebugLogger } from '../utils/debugLogger.js';

const debugLogger = createDebugLogger('delegation-heuristics');

/** Metadata about a completed tool call. */
export interface ToolResultInfo {
  toolName: string;
  /** Size of the tool output (e.g. line count for Read, byte count for file writes). */
  resultSize: number;
  /** Number of matches returned by search/grep tools. */
  matchCount?: number;
}

/** Suggestion produced by the delegation evaluator. */
export interface DelegationSuggestion {
  /** Whether delegation is recommended. */
  shouldDelegate: boolean;
  /** Whether delegation is mandatory (exploratory tasks). */
  mustDelegate: boolean;
  /** Human-readable reason for the suggestion. */
  reason: string;
  /** Suggested model tier for the sub-agent. */
  suggestedModel: string;
}

const READ_THRESHOLD_LINES = 1000;
const MATCH_THRESHOLD = 50;
const CONTEXT_PRESSURE_THRESHOLD = 60;

/**
 * Evaluate whether the current tool result and context pressure
 * warrant delegating subsequent work to a sub-agent.
 *
 * Rules (evaluated in order; first match wins):
 * 1. Exploratory tool (find/search/explore) → MUST delegate
 * 2. Large Read result (>1000 lines) → should delegate
 * 3. Many grep matches (>50) → should delegate
 * 4. Context pressure (>60%) → should delegate
 *
 * Returns null when no rule fires (no delegation needed).
 */
export function evaluateDelegationNeed(
  toolResult: ToolResultInfo,
  contextPercent: number,
): DelegationSuggestion | null {
  // Rule 1: Exploratory tasks must be delegated.
  const nameLower = toolResult.toolName.toLowerCase();
  if (
    nameLower.includes('find') ||
    nameLower.includes('search') ||
    nameLower.includes('explore')
  ) {
    debugLogger.info(
      `Must-delegate: exploratory tool "${toolResult.toolName}"`,
    );
    return {
      shouldDelegate: true,
      mustDelegate: true,
      reason: 'Exploratory task',
      suggestedModel: 'sonnet',
    };
  }

  // Rule 2: Large file reads benefit from isolated context.
  if (toolResult.toolName === 'Read' && toolResult.resultSize > READ_THRESHOLD_LINES) {
    debugLogger.info(
      `Should-delegate: large file read (${toolResult.resultSize} lines)`,
    );
    return {
      shouldDelegate: true,
      mustDelegate: false,
      reason: `Large file read (${toolResult.resultSize} lines)`,
      suggestedModel: 'sonnet',
    };
  }

  // Rule 3: Many search matches — sub-agent can filter in isolation.
  if (
    toolResult.matchCount !== undefined &&
    toolResult.matchCount > MATCH_THRESHOLD
  ) {
    debugLogger.info(
      `Should-delegate: many matches (${toolResult.matchCount})`,
    );
    return {
      shouldDelegate: true,
      mustDelegate: false,
      reason: `Many matches (${toolResult.matchCount})`,
      suggestedModel: 'sonnet',
    };
  }

  // Rule 4: Context pressure — delegate to preserve main-agent context.
  if (contextPercent > CONTEXT_PRESSURE_THRESHOLD) {
    debugLogger.info(
      `Should-delegate: context pressure (${contextPercent.toFixed(1)}%)`,
    );
    return {
      shouldDelegate: true,
      mustDelegate: false,
      reason: `Context high (${contextPercent.toFixed(0)}%)`,
      suggestedModel: 'sonnet',
    };
  }

  return null;
}
