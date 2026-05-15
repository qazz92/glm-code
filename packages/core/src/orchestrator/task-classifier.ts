/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * Task classifier — categorizes user requests by complexity
 * to determine appropriate execution strategy.
 */

export type TaskSize = 'SMALL' | 'MEDIUM' | 'LARGE' | 'LONG_HORIZON';

export interface TaskClassification {
  size: TaskSize;
  confidence: number;
  suggestedAgents: number;
  reason: string;
}

const SIZE_HEURISTICS: Array<{
  patterns: RegExp[];
  size: TaskSize;
  agents: number;
  reason: string;
}> = [
  {
    patterns: [/\b(fix typo|rename|format|lint|small fix|quick fix)\b/i],
    size: 'SMALL',
    agents: 1,
    reason: 'Single-file, low-complexity change',
  },
  {
    patterns: [
      /\b(add error handling|refactor|update|modify|change)\b.*\b(function|method|module|file)\b/i,
      /\b(implement|add)\b.*\b(feature|function|method)\b/i,
    ],
    size: 'MEDIUM',
    agents: 2,
    reason: '2-5 files, moderate complexity',
  },
  {
    patterns: [
      /\b(migrate|rewrite|restructure|rebuild)\b.*\b(module|system|component)\b/i,
      /\b(implement|build|create)\b.*\b(feature|system|service)\b.*\b(from scratch|end.to.end|complete)\b/i,
      /\b(multiple|several|all)\s+(files|modules|components|packages)\b/i,
    ],
    size: 'LARGE',
    agents: 4,
    reason: '6-20 files, high complexity',
  },
  {
    patterns: [
      /\b(build|create|implement)\b.*\b(from scratch|entire|whole|complete)\b/i,
      /\b(migrate|port)\b.*\b(entire|whole|complete)\s+(codebase|project|application)\b/i,
      /\b(redesign|overhaul|rearchitecture)\b/i,
    ],
    size: 'LONG_HORIZON',
    agents: 8,
    reason: '20+ files, multi-phase, long-running',
  },
];

/**
 * Classify a task based on the user prompt.
 */
export function classifyTask(prompt: string): TaskClassification {
  let bestMatch: TaskClassification = {
    size: 'MEDIUM',
    confidence: 0.5,
    suggestedAgents: 2,
    reason: 'Default: moderate complexity assumed',
  };

  let bestScore = 0;

  for (const heuristic of SIZE_HEURISTICS) {
    for (const pattern of heuristic.patterns) {
      if (pattern.test(prompt)) {
        const score = pattern.source.length / 100; // Longer patterns = more specific
        if (score > bestScore) {
          bestScore = score;
          bestMatch = {
            size: heuristic.size,
            confidence: Math.min(0.95, 0.6 + score),
            suggestedAgents: heuristic.agents,
            reason: heuristic.reason,
          };
        }
      }
    }
  }

  return bestMatch;
}
