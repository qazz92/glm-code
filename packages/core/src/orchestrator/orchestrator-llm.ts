/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * Orchestrator LLM — delegates task routing decisions to GLM-5.1.
 * Falls back to regex-based classifyTask() on failure.
 */

import type { BaseLlmClient } from '../core/baseLlmClient.js';
import type { TaskClassification } from './task-classifier.js';
import { classifyTask } from './task-classifier.js';
import { createDebugLogger } from '../utils/debugLogger.js';

const debugLogger = createDebugLogger('orchestrator-llm');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OrchestratorInput {
  taskDescription: string;
  recentSteps: Array<{
    summary: string;
    result: string;
    tokens: number;
  }>;
  contextPercent: number;
  activeWorkers: Array<{
    id: string;
    model: string;
    task: string;
    elapsed: number;
  }>;
  modelQuota: Record<string, { used: number; max: number }>;
}

export type OrchestratorDecisionType =
  | 'INLINE'
  | 'DELEGATE'
  | 'FAN_OUT'
  | 'PIPELINE_PROMOTE'
  | 'COMPACT'
  | 'RECYCLE';

export interface OrchestratorDecision {
  decision: OrchestratorDecisionType;
  next_action?: {
    type: string;
    task: string;
    model: string;
    depth: number;
    max_output_tokens: number;
    context_to_pass: string[];
  };
  reasoning: string;
  estimated_tokens: number;
}

// ---------------------------------------------------------------------------
// System prompt (~2K tokens)
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are the GLM Code orchestrator. Analyze the given task context and return a JSON routing decision.

## Decision types

1. **INLINE** — Simple task, handle in the main conversation thread. Use for single-file edits, quick fixes, and questions.
2. **DELEGATE** — Moderately complex task that should be sent to a single sub-agent. Use for 2-5 file changes with clear boundaries.
3. **FAN_OUT** — Complex task that should be split into parallel sub-agents. Use for 6-20 file changes with independent workstreams.
4. **PIPELINE_PROMOTE** — Long-horizon task requiring the 6-phase pipeline (plan→scaffold→execute→verify→test→review). Use for 20+ file changes, multi-phase work, or greenfield features.
5. **COMPACT** — Context window is nearly full. Summarize and continue. Use when contextPercent > 80.
6. **RECYCLE** — Task is a retry or refinement of recent work. Use when the task closely matches a recently completed step.

## Response format

Return ONLY a JSON object with this structure:
{
  "decision": "<one of: INLINE, DELEGATE, FAN_OUT, PIPELINE_PROMOTE, COMPACT, RECYCLE>",
  "next_action": {
    "type": "<agent role: executor, architect, planner, verifier, test-engineer, code-reviewer>",
    "task": "<refined task description>",
    "model": "<recommended model>",
    "depth": <1-3>,
    "max_output_tokens": <4096-65536>,
    "context_to_pass": ["<key files or concepts to include>"]
  },
  "reasoning": "<1-3 sentence explanation>",
  "estimated_tokens": <estimated token count for the task>
}

## Rules
- Always return valid JSON. No markdown fences, no commentary outside the JSON.
- Pick the simplest decision that covers the task. Do not over-engineer.
- If contextPercent > 80, prefer COMPACT regardless of task complexity.
- For "next_action.model", use "GLM-5.1" for complex work, "GLM-5-Turbo" for fast iteration, "GLM-4.5-Air" for verification.
- "estimated_tokens" should reflect total input+output budget needed.`;

// ---------------------------------------------------------------------------
// LLM call
// ---------------------------------------------------------------------------

/**
 * Ask the orchestrator model for a routing decision.
 *
 * Uses `BaseLlmClient.generateText` to make a non-streaming call to GLM-5.1.
 * Falls back to regex-based `classifyTask()` on any failure.
 */
export async function askOrchestrator(
  input: OrchestratorInput,
  baseLlmClient: BaseLlmClient,
): Promise<{ decision: OrchestratorDecision; classification: TaskClassification }> {
  const userMessage = [
    `## Task`,
    input.taskDescription,
    '',
    `## Recent Steps`,
    input.recentSteps.length > 0
      ? input.recentSteps
          .map(
            (s, i) =>
              `${i + 1}. ${s.summary} → ${s.result} (${s.tokens} tokens)`,
          )
          .join('\n')
      : '(none)',
    '',
    `## Context Usage`,
    `${input.contextPercent.toFixed(1)}%`,
    '',
    `## Active Workers`,
    input.activeWorkers.length > 0
      ? input.activeWorkers
          .map((w) => `- ${w.id} (${w.model}): ${w.task} [${w.elapsed}s]`)
          .join('\n')
      : '(none)',
    '',
    `## Model Quota`,
    Object.entries(input.modelQuota)
      .map(([m, q]) => `- ${m}: ${q.used}/${q.max}`)
      .join('\n'),
  ].join('\n');

  try {
    const result = await baseLlmClient.generateText({
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      model: 'GLM-5.1',
      systemInstruction: SYSTEM_PROMPT,
      config: {
        temperature: 0.3,
        maxOutputTokens: 2048,
      },
      abortSignal: AbortSignal.timeout(30_000),
      promptId: 'orchestrator-decision',
    });

    const raw = result.text.trim();
    // Strip markdown fences if the model wraps them despite instructions
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const parsed = JSON.parse(jsonStr) as OrchestratorDecision;

    if (!isValidDecision(parsed)) {
      debugLogger.warn('LLM returned invalid decision structure, falling back to classifyTask');
      return { decision: fallbackDecision(input.taskDescription), classification: classifyTask(input.taskDescription) };
    }

    debugLogger.info(`LLM decision: ${parsed.decision} — ${parsed.reasoning}`);

    // Map the LLM decision to a TaskClassification for compatibility
    const classification = decisionToClassification(parsed);
    return { decision: parsed, classification };
  } catch (err) {
    debugLogger.warn(
      `askOrchestrator failed (${err instanceof Error ? err.message : String(err)}), falling back to classifyTask`,
    );
    const classification = classifyTask(input.taskDescription);
    return { decision: fallbackDecision(input.taskDescription), classification };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isValidDecision(d: unknown): d is OrchestratorDecision {
  if (typeof d !== 'object' || d === null) return false;
  const obj = d as Record<string, unknown>;
  const validTypes: string[] = [
    'INLINE',
    'DELEGATE',
    'FAN_OUT',
    'PIPELINE_PROMOTE',
    'COMPACT',
    'RECYCLE',
  ];
  return (
    typeof obj['decision'] === 'string' &&
    validTypes.includes(obj['decision'] as string) &&
    typeof obj['reasoning'] === 'string' &&
    typeof obj['estimated_tokens'] === 'number'
  );
}

function decisionToClassification(
  decision: OrchestratorDecision,
): TaskClassification {
  switch (decision.decision) {
    case 'INLINE':
      return { size: 'SMALL', confidence: 0.8, suggestedAgents: 1, reason: decision.reasoning };
    case 'DELEGATE':
      return { size: 'MEDIUM', confidence: 0.8, suggestedAgents: 2, reason: decision.reasoning };
    case 'FAN_OUT':
      return { size: 'LARGE', confidence: 0.85, suggestedAgents: 4, reason: decision.reasoning };
    case 'PIPELINE_PROMOTE':
      return { size: 'LONG_HORIZON', confidence: 0.9, suggestedAgents: 8, reason: decision.reasoning };
    case 'COMPACT':
    case 'RECYCLE':
      return { size: 'MEDIUM', confidence: 0.7, suggestedAgents: 1, reason: decision.reasoning };
  }
}

function fallbackDecision(taskDescription: string): OrchestratorDecision {
  const classification = classifyTask(taskDescription);
  return {
    decision:
      classification.size === 'LONG_HORIZON'
        ? 'PIPELINE_PROMOTE'
        : classification.size === 'LARGE'
          ? 'FAN_OUT'
          : classification.size === 'SMALL'
            ? 'INLINE'
            : 'DELEGATE',
    reasoning: `Fallback classification: ${classification.reason}`,
    estimated_tokens: 8192,
  };
}
