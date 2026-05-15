/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * Fanout orchestrator — splits large tasks into subtasks
 * and delegates to specialized agents via SubagentManager.
 */

import { classifyTask, type TaskClassification } from './task-classifier.js';
import { buildContractPrompt } from './subagent-contract.js';
import { createDebugLogger } from '../utils/debugLogger.js';

const debugLogger = createDebugLogger('fanout');

export interface Subtask {
  id: string;
  description: string;
  agentRole: string;
  files?: string[];
  dependencies?: string[];
}

export interface FanoutResult {
  subtasks: Subtask[];
  classification: TaskClassification;
  parallelGroups: Subtask[][];
}

/**
 * Analyze a task and create a fanout plan.
 * This produces subtask descriptions but does NOT execute them —
 * execution is delegated to the existing SubagentManager via the Task tool.
 */
export function planFanout(prompt: string, files?: string[]): FanoutResult {
  const classification = classifyTask(prompt);

  // For SMALL/MEDIUM tasks, no fanout needed
  if (classification.size === 'SMALL' || classification.size === 'MEDIUM') {
    return {
      subtasks: [],
      classification,
      parallelGroups: [],
    };
  }

  // For LARGE/LONG_HORIZON, produce a fanout plan.
  // Generate meaningful task descriptions by slicing the prompt scope.
  const subtasks: Subtask[] = [];
  const agentCount = classification.suggestedAgents;

  for (let i = 0; i < agentCount; i++) {
    const isVerifier = i === agentCount - 1;

    subtasks.push({
      id: `subtask-${i + 1}`,
      description: isVerifier
        ? `Verify and integrate results from ${agentCount - 1} executor sub-agents for: "${prompt}"`
        : `Execute part ${i + 1} of ${agentCount - 1} for: "${prompt}"`,
      agentRole: isVerifier ? 'verifier' : 'executor',
      files: isVerifier
        ? files
        : files?.slice(
            i * Math.ceil((files.length ?? 0) / (agentCount - 1)),
            (i + 1) * Math.ceil((files.length ?? 0) / (agentCount - 1)),
          ),
    });
  }

  // Group into parallel execution waves
  const parallelGroups = groupByDependencies(subtasks);

  debugLogger.info(
    `Fanout plan: ${classification.size} task → ${subtasks.length} subtasks in ${parallelGroups.length} waves`,
  );

  return { subtasks, classification, parallelGroups };
}

/**
 * Build a system instruction that tells the LLM how to fan out.
 * Uses buildContractPrompt to enforce structured output from each sub-agent.
 */
export function buildFanoutInstruction(result: FanoutResult): string {
  if (result.subtasks.length === 0) {
    return '';
  }

  // Build the contract for each subtask and compose the instruction.
  const subtaskContracts = result.subtasks
    .map((st) => {
      const contract = buildContractPrompt(
        st.description,
        /* depth */ 1,
        st.files ?? [],
      );
      return `### ${st.id} (${st.agentRole})\n${contract}`;
    })
    .join('\n\n');

  return [
    'SYSTEM: This task has been classified as a LARGE/LONG_HORIZON task.',
    `Suggested execution: ${result.subtasks.length} sub-agents in ${result.parallelGroups.length} wave(s).`,
    'Break the task into independent subtasks and delegate each to a sub-agent using the Task tool.',
    'Each sub-agent must follow the output contract below.',
    'Aggregate all sub-agent results before presenting the final output.',
    '',
    subtaskContracts,
  ].join('\n');
}

function groupByDependencies(subtasks: Subtask[]): Subtask[][] {
  // Simple 2-wave strategy: all executors in wave 1, verifier in wave 2
  const executors = subtasks.filter((s) => s.agentRole === 'executor');
  const verifiers = subtasks.filter((s) => s.agentRole !== 'executor');

  const groups: Subtask[][] = [];
  if (executors.length > 0) groups.push(executors);
  if (verifiers.length > 0) groups.push(verifiers);
  return groups;
}
