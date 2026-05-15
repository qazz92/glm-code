/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * Orchestrator facade — ties TaskClassifier, Fanout, PipelineRouter,
 * and RateScheduler into a single entry point consumed by the session loop.
 */

import {
  classifyTask,
  type TaskClassification,
  type TaskSize,
} from './task-classifier.js';
import {
  planFanout,
  buildFanoutInstruction,
  type FanoutResult,
} from './fanout.js';
import {
  createPipeline,
  advancePhase,
  completePhase,
  failPhase,
  getCurrentAgentRole,
  buildPipelineInstruction,
  isPipelineComplete,
  getModelForPhase,
  type PipelineState,
} from './pipeline.js';
import { RateScheduler, type ModelSlot } from './rate-scheduler.js';
import {
  shouldCheckpoint,
  saveCheckpoint,
  type Checkpoint,
} from './checkpoint.js';
import { shouldSplitStep, formatSplitInstruction } from './step-limiter.js';
import { askOrchestrator, type OrchestratorInput } from './orchestrator-llm.js';
import type { BaseLlmClient } from '../core/baseLlmClient.js';
import { createDebugLogger } from '../utils/debugLogger.js';

const debugLogger = createDebugLogger('orchestrator');

/** Context passed by the session loop on every user prompt. */
export interface OrchestratorContext {
  /** The model the session intends to use for this turn. */
  model: string;
  /** Current session turn count (for checkpoint gating). */
  turnCount: number;
  /** Session identifier for checkpoint scoping. */
  sessionId: string;
  /** Optional project root for file-relative operations. */
  projectRoot?: string;
  /** Number of files modified in the current step (for step-limiter gating). */
  filesTouched?: number;
}

/** The result returned by {@link Orchestrator.orchestrate}. */
export interface OrchestratorResult {
  /** Classification produced by TaskClassifier — always present. */
  classification: TaskClassification;
  /** System instruction to prepend, if any. */
  systemInstruction: string;
  /** Model to actually use (may differ from requested due to rate limiting). */
  model: string;
  /** Whether a fallback model was selected. */
  isModelFallback: boolean;
  /** Pipeline state, created only for LONG_HORIZON tasks. */
  pipeline?: PipelineState;
  /** Fanout result, created only for LARGE/LONG_HORIZON tasks. */
  fanout?: FanoutResult;
  /** Step-split instruction when turn/file limits exceeded. */
  stepSplitInstruction?: string;
  /**
   * Model override from the orchestrator (e.g. pipeline phase model).
   * When set, the client should use this model instead of the session default.
   */
  modelOverride?: string;
}

/** Thresholds for auto-promoting to LONG_HORIZON. */
const AUTO_PROMOTE_THRESHOLDS = {
  minSteps: 20,
  maxDurationMs: 3_600_000, // 1 hour
  fileAwareMinSteps: 10,
  fileAwareMinFiles: 3,
} as const;

/**
 * Check if the current session should auto-promote to LONG_HORIZON.
 * One-time promotion — once triggered, won't re-trigger.
 */
function shouldAutoPromote(state: {
  stepCount: number;
  sessionDurationMs: number;
  filesTouched: number;
  currentSize: TaskSize;
}): boolean {
  if (state.currentSize === 'LONG_HORIZON') return false;
  return (
    state.stepCount >= AUTO_PROMOTE_THRESHOLDS.minSteps ||
    state.sessionDurationMs >= AUTO_PROMOTE_THRESHOLDS.maxDurationMs ||
    (state.filesTouched >= AUTO_PROMOTE_THRESHOLDS.fileAwareMinFiles &&
      state.stepCount >= AUTO_PROMOTE_THRESHOLDS.fileAwareMinSteps)
  );
}

/**
 * Facade that coordinates task classification, fanout planning,
 * pipeline routing, and rate scheduling.
 *
 * Usage:
 *   const result = orchestrator.orchestrate(prompt, ctx);
 *   // result.systemInstruction → prepend to request
 *   // result.model → pass to Turn.run()
 *   // result.pipeline → track across turns
 *   // result.modelOverride → use instead of session model when set
 */
export class Orchestrator {
  private readonly scheduler: RateScheduler;
  private activePipeline?: PipelineState;
  private baseLlmClient?: BaseLlmClient;
  private sessionStartTime: number = Date.now();
  private totalSteps: number = 0;
  private hasAutoPromoted: boolean = false;

  constructor(slots?: ModelSlot[]) {
    this.scheduler = new RateScheduler(slots);
  }

  /**
   * Inject the BaseLlmClient for orchestrator LLM calls.
   * Must be called before orchestrateAsync is used.
   */
  setBaseLlmClient(client: BaseLlmClient): void {
    this.baseLlmClient = client;
  }

  /**
   * Async variant of orchestrate that first attempts an LLM-based decision
   * via {@link askOrchestrator}, falling back to regex-based classifyTask().
   *
   * This is the preferred entry point when a BaseLlmClient is available.
   */
  async orchestrateAsync(
    prompt: string,
    context: OrchestratorContext,
  ): Promise<OrchestratorResult> {
    let classification: TaskClassification;

    if (this.baseLlmClient) {
      // Build orchestrator input from current state
      const orchestratorInput: OrchestratorInput = {
        taskDescription: prompt,
        recentSteps: [],
        contextPercent: 0,
        activeWorkers: [],
        modelQuota: Object.fromEntries(
          this.scheduler
            .getUsage()
            .map((s) => [s.model, { used: s.used, max: s.max }]),
        ),
      };

      try {
        const llmResult = await askOrchestrator(
          orchestratorInput,
          this.baseLlmClient,
        );
        classification = llmResult.classification;
        debugLogger.info(
          `LLM classified prompt as ${classification.size} (decision: ${llmResult.decision.decision})`,
        );
      } catch {
        classification = classifyTask(prompt);
        debugLogger.info(
          `Fallback classified prompt as ${classification.size}: ${classification.reason}`,
        );
      }
    } else {
      classification = classifyTask(prompt);
      debugLogger.info(
        `Classified prompt as ${classification.size} (confidence ${classification.confidence.toFixed(2)}): ${classification.reason}`,
      );
    }

    return this.buildResult(prompt, context, classification);
  }

  /**
   * Classify a user prompt and produce the corresponding execution plan.
   *
   * - Every prompt is classified via {@link classifyTask}.
   * - LARGE / LONG_HORIZON tasks get a fanout plan.
   * - LONG_HORIZON tasks additionally enter the pipeline.
   * - The model slot is acquired via {@link RateScheduler} (with fallback).
   *
   * This method is synchronous and side-effect-free aside from rate-slot
   * bookkeeping — safe to call in the hot path before every LLM turn.
   */
  orchestrate(
    prompt: string,
    context: OrchestratorContext,
  ): OrchestratorResult {
    const classification = classifyTask(prompt);
    debugLogger.info(
      `Classified prompt as ${classification.size} (confidence ${classification.confidence.toFixed(2)}): ${classification.reason}`,
    );
    return this.buildResult(prompt, context, classification);
  }

  /**
   * Shared result builder used by both orchestrate() and orchestrateAsync().
   */
  private buildResult(
    prompt: string,
    context: OrchestratorContext,
    classification: TaskClassification,
  ): OrchestratorResult {
    // Rate-limit aware model selection.
    const { model, isFallback: isModelFallback } = this.scheduler.acquireSlot(
      context.model,
    );

    let systemInstruction = '';
    let fanout: FanoutResult | undefined;
    let pipeline: PipelineState | undefined;
    let modelOverride: string | undefined;

    // Auto-promote to LONG_HORIZON based on step/time thresholds
    let effectiveSize = classification.size;
    this.totalSteps = context.turnCount;
    if (
      !this.hasAutoPromoted &&
      shouldAutoPromote({
        stepCount: this.totalSteps,
        sessionDurationMs: Date.now() - this.sessionStartTime,
        filesTouched: context.filesTouched ?? 0,
        currentSize: effectiveSize,
      })
    ) {
      effectiveSize = 'LONG_HORIZON' as TaskSize;
      this.hasAutoPromoted = true;
      debugLogger.info(
        `Auto-promoted to LONG_HORIZON (step=${this.totalSteps}, files=${context.filesTouched ?? 0})`,
      );
    }

    const isLarge =
      effectiveSize === ('LARGE' satisfies TaskSize) ||
      effectiveSize === ('LONG_HORIZON' satisfies TaskSize);

    // Fanout for LARGE / LONG_HORIZON tasks.
    if (isLarge) {
      fanout = planFanout(prompt);
      const fanoutInstruction = buildFanoutInstruction(fanout);
      if (fanoutInstruction) {
        systemInstruction += fanoutInstruction + '\n';
      }
      debugLogger.info(
        `Fanout plan: ${fanout.subtasks.length} subtasks in ${fanout.parallelGroups.length} wave(s)`,
      );
    }

    // Pipeline routing for LONG_HORIZON tasks.
    if (effectiveSize === ('LONG_HORIZON' satisfies TaskSize)) {
      if (!this.activePipeline) {
        this.activePipeline = createPipeline();
        debugLogger.info('Created new execution pipeline');
      }
      pipeline = this.activePipeline;
      const pipelineInstruction = buildPipelineInstruction(pipeline);
      if (pipelineInstruction) {
        systemInstruction += pipelineInstruction + '\n';
      }
    }

    // Pipeline model override: when a pipeline is active, use the phase-specific model.
    if (this.activePipeline) {
      modelOverride = getModelForPhase(this.activePipeline.currentPhase);
      debugLogger.info(
        `Pipeline phase '${this.activePipeline.currentPhase}' → model override: ${modelOverride}`,
      );
    }

    // Checkpoint for LONG_HORIZON tasks at the right cadence.
    if (
      effectiveSize === ('LONG_HORIZON' satisfies TaskSize) &&
      shouldCheckpoint(context.turnCount)
    ) {
      const checkpoint: Checkpoint = {
        sessionId: context.sessionId,
        turnNumber: context.turnCount,
        timestamp: Date.now(),
        lastUserPrompt: prompt,
        filesModified: [],
        workflowState: this.activePipeline?.currentPhase,
      };
      saveCheckpoint(checkpoint);
      debugLogger.info(`Saved checkpoint at turn ${context.turnCount}`);
    }

    // Step limiter — force split when turn/file boundaries exceeded.
    let stepSplitInstruction: string | undefined;
    const split = shouldSplitStep(context.turnCount, context.filesTouched ?? 0);
    if (split.split) {
      stepSplitInstruction = formatSplitInstruction(split.reason);
      debugLogger.warn(`Step boundary reached: ${split.reason}`);
    }

    return {
      classification,
      systemInstruction: systemInstruction.trim(),
      model,
      isModelFallback,
      pipeline,
      fanout,
      stepSplitInstruction,
      modelOverride,
    };
  }

  /**
   * Release the rate-limit slot acquired for a model.
   * Call after the LLM turn completes (success or failure).
   */
  releaseSlot(model: string): void {
    this.scheduler.releaseSlot(model);
  }

  /**
   * Handle a 429 response by backing off the affected model.
   */
  handle429(model: string, retryAfterMs?: number): void {
    this.scheduler.handle429(model, retryAfterMs);
  }

  /**
   * Advance the pipeline to the next phase.
   * Returns the updated state or undefined if no pipeline is active.
   */
  advancePipeline(): PipelineState | undefined {
    if (!this.activePipeline) return undefined;
    this.activePipeline = advancePhase(this.activePipeline);
    debugLogger.info(
      `Pipeline advanced to phase: ${this.activePipeline.currentPhase}`,
    );
    return this.activePipeline;
  }

  /**
   * Mark the current pipeline phase as completed.
   */
  completePipelinePhase(output?: string): PipelineState | undefined {
    if (!this.activePipeline) return undefined;
    this.activePipeline = completePhase(this.activePipeline, output);
    return this.activePipeline;
  }

  /**
   * Mark the current pipeline phase as failed.
   * Returns true if a retry is available.
   */
  failPipelinePhase(error: string): boolean {
    if (!this.activePipeline) return false;
    return failPhase(this.activePipeline, error);
  }

  /**
   * Get the agent role for the current pipeline phase.
   */
  getPipelineAgentRole(): string | undefined {
    if (!this.activePipeline) return undefined;
    return getCurrentAgentRole(this.activePipeline);
  }

  /**
   * Check if the active pipeline is complete.
   */
  isPipelineComplete(): boolean {
    if (!this.activePipeline) return false;
    return isPipelineComplete(this.activePipeline);
  }

  /**
   * Reset the active pipeline, clearing all phase state.
   */
  resetPipeline(): void {
    this.activePipeline = undefined;
  }

  /** Reset session state. Call when a new session starts. */
  resetSession(): void {
    this.sessionStartTime = Date.now();
    this.totalSteps = 0;
    this.hasAutoPromoted = false;
    this.activePipeline = undefined;
  }

  /** Current slot usage for observability. */
  getSlotUsage(): Array<{ model: string; used: number; max: number }> {
    return this.scheduler.getUsage();
  }
}
