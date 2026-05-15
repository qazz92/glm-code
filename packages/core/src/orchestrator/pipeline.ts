/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pipeline router — 6-phase execution pipeline with acceptance gates.
 * plan → scaffold → execute → verify → test → review
 */

import { createDebugLogger } from '../utils/debugLogger.js';

const debugLogger = createDebugLogger('pipeline');

export type PipelinePhase =
  | 'plan'
  | 'scaffold'
  | 'execute'
  | 'verify'
  | 'test'
  | 'review';

export interface PipelineState {
  currentPhase: PipelinePhase;
  phases: Record<PipelinePhase, PhaseResult>;
  retryBudget: number;
  maxRetries: number;
}

export interface PhaseResult {
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  output?: string;
  startedAt?: number;
  completedAt?: number;
}

export const PHASE_COMPLETION_MARKER = 'PHASE_COMPLETE';

const PHASE_ORDER: PipelinePhase[] = [
  'plan',
  'scaffold',
  'execute',
  'verify',
  'test',
  'review',
];

const PHASE_AGENT_MAP: Record<PipelinePhase, string> = {
  plan: 'planner',
  scaffold: 'architect',
  execute: 'executor',
  verify: 'verifier',
  test: 'test-engineer',
  review: 'code-reviewer',
};

/**
 * Model assignment per pipeline phase.
 * Heavier models for planning/execution/review; lighter models for scaffolding/verification.
 */
export const PHASE_MODEL_MAP: Record<PipelinePhase, string> = {
  plan: 'GLM-5.1',
  scaffold: 'GLM-5-Turbo',
  execute: 'GLM-5.1',
  verify: 'GLM-4.5-Air',
  test: 'GLM-5.1',
  review: 'GLM-5.1',
};

/**
 * Get the model to use for a given pipeline phase.
 */
export function getModelForPhase(phase: PipelinePhase): string {
  return PHASE_MODEL_MAP[phase];
}

/**
 * Marker a model must emit to explicitly finish the current pipeline phase.
 * This keeps phase advancement tied to an intentional completion signal rather
 * than to the mere end of an LLM turn.
 */
export function getPhaseCompletionMarker(phase: PipelinePhase): string {
  return `${PHASE_COMPLETION_MARKER}: ${phase}`;
}

/**
 * Detect an explicit phase completion marker in model output.
 */
export function hasPhaseCompletionMarker(
  output: string,
  phase: PipelinePhase,
): boolean {
  const markerPattern = new RegExp(
    `^${PHASE_COMPLETION_MARKER}\\s*:\\s*${phase}\\s*$`,
    'i',
  );
  return output
    .split(/\r?\n/)
    .some((line) => markerPattern.test(line.trim()));
}

/**
 * Create initial pipeline state.
 */
export function createPipeline(maxRetries = 3): PipelineState {
  const phases = {} as Record<PipelinePhase, PhaseResult>;
  for (const phase of PHASE_ORDER) {
    phases[phase] = { status: 'pending' };
  }
  return { currentPhase: 'plan', phases, retryBudget: maxRetries, maxRetries };
}

/**
 * Mark the current phase as running without clobbering existing output.
 */
export function startPhase(state: PipelineState): PipelineState {
  const current = state.phases[state.currentPhase];
  if (current.status === 'pending') {
    state.phases[state.currentPhase] = {
      ...current,
      status: 'running',
      startedAt: Date.now(),
    };
    debugLogger.info(`Phase '${state.currentPhase}' started`);
  }
  return state;
}

/**
 * Advance to the next phase.
 */
export function advancePhase(state: PipelineState): PipelineState {
  const currentIndex = PHASE_ORDER.indexOf(state.currentPhase);
  if (currentIndex < PHASE_ORDER.length - 1) {
    state.currentPhase = PHASE_ORDER[currentIndex + 1];
    if (state.phases[state.currentPhase].status !== 'completed') {
      state.phases[state.currentPhase].status = 'pending';
    }
  }
  return state;
}

/**
 * Mark current phase as completed.
 */
export function completePhase(state: PipelineState, output?: string): PipelineState {
  state.phases[state.currentPhase] = {
    status: 'completed',
    output,
    completedAt: Date.now(),
  };
  debugLogger.info(`Phase '${state.currentPhase}' completed`);
  return state;
}

/**
 * Mark current phase as failed. Returns true if retry is available.
 */
export function failPhase(state: PipelineState, error: string): boolean {
  state.phases[state.currentPhase] = {
    status: 'failed',
    output: error,
    completedAt: Date.now(),
  };

  if (state.retryBudget > 0) {
    state.retryBudget--;
    state.phases[state.currentPhase].status = 'pending';
    debugLogger.warn(`Phase '${state.currentPhase}' failed, retrying (${state.retryBudget} retries left)`);
    return true;
  }

  debugLogger.error(`Phase '${state.currentPhase}' failed, no retries left`);
  return false;
}

/**
 * Get the agent role for the current phase.
 */
export function getCurrentAgentRole(state: PipelineState): string {
  return PHASE_AGENT_MAP[state.currentPhase];
}

/**
 * Build a system instruction for the current pipeline phase.
 */
export function buildPipelineInstruction(state: PipelineState): string {
  const phase = state.currentPhase;
  const agent = getCurrentAgentRole(state);
  const completionMarker = getPhaseCompletionMarker(phase);
  const currentIndex = PHASE_ORDER.indexOf(phase);
  const priorOutputs = PHASE_ORDER.slice(0, currentIndex)
    .map((priorPhase) => {
      const result = state.phases[priorPhase];
      return result?.output
        ? `Previous ${priorPhase} output:\n${result.output}`
        : '';
    })
    .filter(Boolean)
    .join('\n\n');

  return [
    `SYSTEM: Pipeline execution — Phase: ${phase} (Agent: ${agent})`,
    `Progress: ${PHASE_ORDER.indexOf(phase) + 1}/${PHASE_ORDER.length}`,
    priorOutputs,
    `Focus ONLY on the ${phase} phase. Do not execute other phases.`,
    `When the ${phase} phase acceptance criteria are fully satisfied, end your response with exactly: ${completionMarker}`,
    `If the ${phase} phase is not complete, omit ${PHASE_COMPLETION_MARKER} and explain what remains.`,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Check if pipeline is complete.
 */
export function isPipelineComplete(state: PipelineState): boolean {
  return state.phases['review']?.status === 'completed';
}
