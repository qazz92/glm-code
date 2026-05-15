/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * Process recycling — monitors memory usage and schedules
 * graceful process restarts at natural boundaries (between turns,
 * never during an in-flight LLM call).
 *
 * Recycling strategy:
 *   1. After each turn, check heap usage via process.memoryUsage()
 *   2. If heap > 512MB, mark a recycle as pending
 *   3. On the next turn boundary (before LLM call), execute recycle
 *   4. Recycle = graceful shutdown + respawn via IPC
 */

import { createDebugLogger } from '../utils/debugLogger.js';

const debugLogger = createDebugLogger('PROCESS_RECYCLER');

/** Maximum heap size before triggering a recycle (512MB). */
const HEAP_LIMIT_MB = 512;

/** State of the recycler. */
export type RecyclerState = 'idle' | 'pending' | 'recycling';

/** Callback to invoke when a recycle should happen. */
export type RecycleCallback = () => Promise<void>;

/**
 * Process recycler that monitors memory and schedules graceful restarts.
 */
export class ProcessRecycler {
  private state: RecyclerState = 'idle';
  private readonly recycleCallback?: RecycleCallback;
  private inFlightLlmCall = false;

  constructor(recycleCallback?: RecycleCallback) {
    this.recycleCallback = recycleCallback;
  }

  /**
   * Mark that an LLM call is currently in progress.
   * While in-flight, no recycle will be triggered.
   */
  setLlmCallInProgress(inProgress: boolean): void {
    this.inFlightLlmCall = inProgress;
    if (!inProgress && this.state === 'pending') {
      debugLogger.info('LLM call completed — executing pending recycle');
      this.executeRecycle().catch((err) => {
        debugLogger.warn(`Recycle failed: ${err}`);
      });
    }
  }

  /**
   * Check memory usage after a turn completes.
   * Marks a recycle as pending if heap exceeds the limit.
   */
  checkAfterTurn(): void {
    if (this.state !== 'idle') return;

    const mem = process.memoryUsage();
    const heapMb = Math.round(mem.heapUsed / (1024 * 1024));

    if (heapMb > HEAP_LIMIT_MB) {
      debugLogger.warn(
        `Heap at ${heapMb}MB exceeds limit of ${HEAP_LIMIT_MB}MB — scheduling recycle`,
      );
      this.state = 'pending';

      // If no LLM call is in progress, recycle immediately
      if (!this.inFlightLlmCall) {
        this.executeRecycle().catch((err) => {
          debugLogger.warn(`Recycle failed: ${err}`);
        });
      }
    } else {
      debugLogger.debug(`Heap at ${heapMb}MB — within limits`);
    }
  }

  /**
   * Get the current memory usage summary.
   */
  getMemoryStats(): { heapUsedMb: number; heapTotalMb: number; rssMb: number } {
    const mem = process.memoryUsage();
    return {
      heapUsedMb: Math.round(mem.heapUsed / (1024 * 1024)),
      heapTotalMb: Math.round(mem.heapTotal / (1024 * 1024)),
      rssMb: Math.round(mem.rss / (1024 * 1024)),
    };
  }

  /**
   * Get the current recycler state.
   */
  getState(): RecyclerState {
    return this.state;
  }

  /**
   * Force an immediate recycle (for testing or manual trigger).
   */
  async forceRecycle(): Promise<void> {
    await this.executeRecycle();
  }

  /**
   * Execute the recycle process.
   * Calls the recycle callback if provided, otherwise logs a warning.
   */
  private async executeRecycle(): Promise<void> {
    if (this.state === 'recycling') return;

    this.state = 'recycling';
    debugLogger.info('Executing process recycle...');

    if (this.recycleCallback) {
      try {
        await this.recycleCallback();
        debugLogger.info('Recycle completed successfully');
      } catch (err) {
        debugLogger.warn(`Recycle callback error: ${err}`);
      }
    } else {
      debugLogger.warn(
        'No recycle callback configured — memory pressure detected but no action taken',
      );
    }

    this.state = 'idle';
  }
}
