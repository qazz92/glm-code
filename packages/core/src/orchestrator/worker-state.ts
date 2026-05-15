/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * Worker state machine — tracks the lifecycle of sub-agent workers
 * from queueing through completion, with automatic retry on failure.
 */

import { createDebugLogger } from '../utils/debugLogger.js';

const debugLogger = createDebugLogger('worker-state');

/** Worker lifecycle states. */
export enum WorkerState {
  QUEUED = 'QUEUED',
  SPAWNING = 'SPAWNING',
  INITIALIZING = 'INITIALIZING',
  RUNNING = 'RUNNING',
  COMPLETING = 'COMPLETING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  RETRYING = 'RETRYING',
}

/** Maximum number of automatic retries before marking a worker as permanently failed. */
const MAX_RETRIES = 3;

/** A tracked worker. */
export interface Worker {
  id: string;
  task: string;
  model: string;
  state: WorkerState;
  retries: number;
  startTime: number;
  result?: string;
}

/**
 * State machine that manages a pool of sub-agent workers.
 *
 * Lifecycle:
 *   spawn()   → QUEUED → SPAWNING → INITIALIZING → RUNNING
 *   complete() → RUNNING → COMPLETING → COMPLETED
 *   fail()    → RUNNING → FAILED
 *              If retries < MAX_RETRIES: FAILED → RETRYING → QUEUED (auto-retry)
 *              If retries >= MAX_RETRIES: stays FAILED
 */
export class WorkerStateMachine {
  private readonly workers = new Map<string, Worker>();

  /**
   * Spawn a new worker. Transitions: QUEUED → SPAWNING → INITIALIZING → RUNNING.
   * Returns the created worker.
   */
  spawn(id: string, task: string, model: string): Worker {
    const worker: Worker = {
      id,
      task,
      model,
      state: WorkerState.QUEUED,
      retries: 0,
      startTime: Date.now(),
    };
    this.workers.set(id, worker);

    this.transition(id, WorkerState.SPAWNING);
    this.transition(id, WorkerState.INITIALIZING);
    this.transition(id, WorkerState.RUNNING);

    debugLogger.info(`Spawned worker ${id}: "${task}" on ${model}`);
    return worker;
  }

  /**
   * Mark a worker as completed with its result.
   * Transitions: RUNNING → COMPLETING → COMPLETED.
   */
  complete(id: string, result: string): void {
    this.ensureWorker(id);
    const worker = this.workers.get(id)!;

    if (worker.state !== WorkerState.RUNNING) {
      throw new Error(
        `Worker ${id} cannot complete from state ${worker.state} (expected RUNNING)`,
      );
    }

    worker.result = result;
    this.transition(id, WorkerState.COMPLETING);
    this.transition(id, WorkerState.COMPLETED);

    debugLogger.info(`Worker ${id} completed (${result.length} chars)`);
  }

  /**
   * Mark a worker as failed. If retries remain, auto-transitions back to QUEUED.
   * Transitions: RUNNING → FAILED → RETRYING → QUEUED (if retries remain)
   *              RUNNING → FAILED (if retries exhausted)
   */
  fail(id: string, error: string): void {
    this.ensureWorker(id);
    const worker = this.workers.get(id)!;

    if (worker.state !== WorkerState.RUNNING) {
      throw new Error(
        `Worker ${id} cannot fail from state ${worker.state} (expected RUNNING)`,
      );
    }

    this.transition(id, WorkerState.FAILED);
    worker.retries += 1;

    if (worker.retries <= MAX_RETRIES) {
      debugLogger.info(
        `Worker ${id} failed (attempt ${worker.retries}/${MAX_RETRIES}): ${error} — retrying`,
      );
      this.transition(id, WorkerState.RETRYING);
      this.transition(id, WorkerState.QUEUED);
    } else {
      debugLogger.info(
        `Worker ${id} permanently failed after ${MAX_RETRIES} retries: ${error}`,
      );
    }
  }

  /** Get the current state of a worker. */
  getState(id: string): WorkerState | undefined {
    return this.workers.get(id)?.state;
  }

  /** Get all workers currently in a non-terminal state. */
  getActiveWorkers(): Worker[] {
    const terminal: ReadonlySet<WorkerState> = new Set([
      WorkerState.COMPLETED,
      WorkerState.FAILED,
    ]);
    return [...this.workers.values()].filter((w) => !terminal.has(w.state));
  }

  /** Get all workers ever tracked. */
  getAllWorkers(): Worker[] {
    return [...this.workers.values()];
  }

  private transition(id: string, newState: WorkerState): void {
    const worker = this.workers.get(id);
    if (!worker) {
      throw new Error(`Worker ${id} not found`);
    }
    worker.state = newState;
  }

  private ensureWorker(id: string): void {
    if (!this.workers.has(id)) {
      throw new Error(`Worker ${id} not found`);
    }
  }
}
