/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * Rate-limit aware model scheduler.
 * Manages concurrent request slots per model and handles
 * 429 responses with automatic backoff and model fallback.
 */

import { createDebugLogger } from '../utils/debugLogger.js';

const debugLogger = createDebugLogger('scheduler');

export interface ModelSlot {
  model: string;
  maxSlots: number;
  usedSlots: number;
  fallback?: string;
}

/** §7.4 Model Matrix — concurrency limits per model. */
const DEFAULT_SLOTS: ModelSlot[] = [
  { model: 'GLM-5.1', maxSlots: 10, usedSlots: 0, fallback: 'GLM-4.7' },
  { model: 'GLM-5', maxSlots: 10, usedSlots: 0, fallback: 'GLM-4.7' },
  { model: 'GLM-5-Turbo', maxSlots: 1, usedSlots: 0, fallback: 'GLM-4.5-Air' },
  { model: 'GLM-4.7', maxSlots: 2, usedSlots: 0, fallback: 'GLM-4.6' },
  { model: 'GLM-4.6', maxSlots: 3, usedSlots: 0, fallback: 'GLM-4.5-Air' },
  { model: 'GLM-4.5-Air', maxSlots: 5, usedSlots: 0 },
  { model: 'GLM-4.5-AirX', maxSlots: 5, usedSlots: 0 },
  { model: 'GLM-4.5', maxSlots: 5, usedSlots: 0 },
];

export class RateScheduler {
  private slots: ModelSlot[];
  private backoffUntil = new Map<string, number>();

  constructor(slots?: ModelSlot[]) {
    this.slots = slots ?? [...DEFAULT_SLOTS];
  }

  /**
   * Try to acquire a slot for the given model.
   * Returns the model to actually use (may be a fallback).
   */
  acquireSlot(requestedModel: string): { model: string; isFallback: boolean } {
    // Check if requested model is available
    const slot = this.slots.find((s) => s.model === requestedModel);

    if (slot && slot.usedSlots < slot.maxSlots && !this.isBackedOff(slot.model)) {
      slot.usedSlots++;
      return { model: slot.model, isFallback: false };
    }

    // Try fallback chain
    let current = requestedModel;
    const tried = new Set<string>();
    while (current && !tried.has(current)) {
      tried.add(current);
      const fallbackSlot = this.slots.find((s) => s.model === current);
      if (!fallbackSlot) break;

      if (fallbackSlot.usedSlots < fallbackSlot.maxSlots && !this.isBackedOff(fallbackSlot.model)) {
        fallbackSlot.usedSlots++;
        debugLogger.info(`Using fallback model: ${fallbackSlot.model} (requested: ${requestedModel})`);
        return { model: fallbackSlot.model, isFallback: true };
      }

      current = fallbackSlot.fallback ?? '';
    }

    // All models exhausted — use requested anyway (will likely 429)
    debugLogger.warn(`No slots available for ${requestedModel}, using anyway`);
    if (slot) slot.usedSlots++;
    return { model: requestedModel, isFallback: false };
  }

  /**
   * Release a slot for the given model.
   * MUST be called after the LLM call completes (success, error, or abort)
   * to avoid slot leaks that block subsequent requests.
   */
  releaseSlot(model: string): void {
    const slot = this.slots.find((s) => s.model === model);
    if (slot && slot.usedSlots > 0) {
      slot.usedSlots--;
    }
  }

  /**
   * Handle a 429 response — back off the model.
   */
  handle429(model: string, retryAfterMs = 5000): void {
    this.backoffUntil.set(model, Date.now() + retryAfterMs);
    debugLogger.warn(`Model ${model} rate limited, backing off for ${retryAfterMs}ms`);
    // Release any held slots
    const slot = this.slots.find((s) => s.model === model);
    if (slot && slot.usedSlots > 0) slot.usedSlots = 0;
  }

  /**
   * Check if a model is in backoff period.
   */
  private isBackedOff(model: string): boolean {
    const until = this.backoffUntil.get(model);
    if (!until) return false;
    if (Date.now() >= until) {
      this.backoffUntil.delete(model);
      return false;
    }
    return true;
  }

  /**
   * Get current slot usage.
   */
  getUsage(): Array<{ model: string; used: number; max: number }> {
    return this.slots.map((s) => ({ model: s.model, used: s.usedSlots, max: s.maxSlots }));
  }
}
