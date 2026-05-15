/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * DelegationEnforcer detects patterns in user prompts that suggest
 * delegation to sub-agents would be beneficial. It returns system
 * instruction fragments that encourage the LLM to use the Task tool
 * for parallel agent delegation.
 */

export interface DelegationHint {
  shouldDelegate: boolean;
  reason: string;
  instruction: string;
}

/**
 * Pattern → delegation hint mapping.
 * Each pattern is checked against the user prompt + recent assistant response.
 */
const DELEGATION_PATTERNS: Array<{
  pattern: RegExp;
  reason: string;
  instruction: string;
}> = [
  {
    pattern: /\b(also|too|as well|simultaneously|in parallel)\b.*\b(modif|chang|updat|edit|fix)\b/i,
    reason: 'User requests changes to multiple files',
    instruction:
      'SYSTEM: The user is requesting changes that span multiple files. Consider using the Task tool to delegate independent file changes to sub-agents for parallel execution.',
  },
  {
    pattern: /\b(write|add|create)\s+(tests?|specs?)\b.*\b(also|and|too)\b.*\b(implement|code|feature)\b/i,
    reason: 'User requests both implementation and tests',
    instruction:
      'SYSTEM: The user is requesting both implementation and tests. Consider delegating test writing to a sub-agent while you handle the implementation.',
  },
  {
    pattern: /\b(parallel|concurrent|at the same time|simultaneously)\b/i,
    reason: 'User explicitly requests parallel execution',
    instruction:
      'SYSTEM: The user explicitly requested parallel execution. Use the Task tool to spawn multiple sub-agents for independent work items.',
  },
  {
    pattern: /\b(review|audit|analyze)\b.*\b(entire|whole|all|complete)\s+(codebase|repo|project|module)\b/i,
    reason: 'User requests broad codebase analysis',
    instruction:
      'SYSTEM: The user is requesting a broad analysis. Consider using sub-agents to explore different parts of the codebase in parallel.',
  },
  {
    pattern: /\b(multiple|several|many)\s+(files|modules|components|packages)\b/i,
    reason: 'User mentions multiple targets',
    instruction:
      'SYSTEM: The user is working with multiple targets. Consider delegating independent targets to sub-agents.',
  },
];

/**
 * Check if a prompt suggests delegation would be beneficial.
 * Returns a DelegationHint with instructions to inject, or null if no delegation needed.
 */
export function checkDelegationNeed(prompt: string): DelegationHint | null {
  for (const { pattern, reason, instruction } of DELEGATION_PATTERNS) {
    if (pattern.test(prompt)) {
      return { shouldDelegate: true, reason, instruction };
    }
  }
  return null;
}
