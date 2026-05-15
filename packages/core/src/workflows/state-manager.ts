/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * Workflow state manager — tracks active workflow lifecycle
 * and persists state to ~/.glm/workflows/ for session resumption.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import process from 'node:process';
import { createDebugLogger } from '../utils/debugLogger.js';

const debugLogger = createDebugLogger('workflow');

export type WorkflowPhase = 'idle' | 'running' | 'paused' | 'completed' | 'failed';

export interface WorkflowState {
  name: string;
  phase: WorkflowPhase;
  startedAt: number;
  updatedAt: number;
  iteration: number;
  maxIterations: number;
  currentStep: string;
  data: Record<string, unknown>;
}

const WORKFLOWS_DIR_NAME = 'workflows';

function getWorkflowsDir(): string {
  const homeDir = process.env['HOME'] || process.env['USERPROFILE'] || '/tmp';
  return path.join(homeDir, '.glm', WORKFLOWS_DIR_NAME);
}

function getStatePath(sessionId: string): string {
  return path.join(getWorkflowsDir(), `${sessionId}.json`);
}

/**
 * Workflow state manager.
 * Tracks the lifecycle of a running workflow and persists state for resumption.
 */
export class WorkflowStateManager {
  private state: WorkflowState | null = null;
  private readonly sessionId: string;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  /**
   * Start a new workflow.
   */
  start(name: string, maxIterations = 50): WorkflowState {
    this.state = {
      name,
      phase: 'running',
      startedAt: Date.now(),
      updatedAt: Date.now(),
      iteration: 0,
      maxIterations,
      currentStep: 'init',
      data: {},
    };
    this.persist();
    debugLogger.info(`Workflow '${name}' started (max ${maxIterations} iterations)`);
    return this.state;
  }

  /**
   * Tick — advance one iteration.
   */
  tick(step: string, data?: Record<string, unknown>): WorkflowState {
    if (!this.state) throw new Error('No active workflow');
    this.state.iteration++;
    this.state.currentStep = step;
    this.state.updatedAt = Date.now();
    if (data) this.state.data = { ...this.state.data, ...data };
    this.persist();
    return this.state;
  }

  /**
   * Pause the workflow.
   */
  pause(): WorkflowState {
    if (!this.state) throw new Error('No active workflow');
    this.state.phase = 'paused';
    this.state.updatedAt = Date.now();
    this.persist();
    return this.state;
  }

  /**
   * Resume a paused workflow.
   */
  resume(): WorkflowState {
    if (!this.state) throw new Error('No active workflow');
    this.state.phase = 'running';
    this.state.updatedAt = Date.now();
    this.persist();
    return this.state;
  }

  /**
   * Complete the workflow successfully.
   */
  complete(summary?: string): WorkflowState {
    if (!this.state) throw new Error('No active workflow');
    this.state.phase = 'completed';
    this.state.updatedAt = Date.now();
    this.state.currentStep = 'done';
    if (summary) this.state.data['summary'] = summary;
    this.persist();
    debugLogger.info(`Workflow '${this.state.name}' completed after ${this.state.iteration} iterations`);
    return this.state;
  }

  /**
   * Fail the workflow.
   */
  fail(error: string): WorkflowState {
    if (!this.state) throw new Error('No active workflow');
    this.state.phase = 'failed';
    this.state.updatedAt = Date.now();
    this.state.data['error'] = error;
    this.persist();
    debugLogger.error(`Workflow '${this.state.name}' failed: ${error}`);
    return this.state;
  }

  /**
   * Get current state.
   */
  getState(): WorkflowState | null {
    return this.state;
  }

  /**
   * Check if max iterations reached.
   */
  isMaxedOut(): boolean {
    if (!this.state) return false;
    return this.state.iteration >= this.state.maxIterations;
  }

  /**
   * Restore state from a previous session.
   */
  restore(): WorkflowState | null {
    const statePath = getStatePath(this.sessionId);
    try {
      if (fs.existsSync(statePath)) {
        const raw = fs.readFileSync(statePath, 'utf-8');
        this.state = JSON.parse(raw) as WorkflowState;
        debugLogger.info(`Restored workflow '${this.state.name}' (phase: ${this.state.phase}, iteration: ${this.state.iteration})`);
        return this.state;
      }
    } catch (err) {
      debugLogger.warn('Failed to restore workflow state:', err);
    }
    return null;
  }

  /**
   * Persist state to disk.
   */
  private persist(): void {
    if (!this.state) return;
    const dir = getWorkflowsDir();
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(getStatePath(this.sessionId), JSON.stringify(this.state, null, 2));
    } catch (err) {
      debugLogger.warn('Failed to persist workflow state:', err);
    }
  }

  /**
   * Clean up persisted state.
   */
  cleanup(): void {
    const statePath = getStatePath(this.sessionId);
    try {
      if (fs.existsSync(statePath)) {
        fs.unlinkSync(statePath);
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}
