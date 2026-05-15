/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * LoopGuard prevents infinite hook triggering by tracking invocations
 * per (event, hookName) pair within a single turn.
 */

const MAX_INVOCATIONS_PER_TURN = 5;


export class LoopGuard {
  private readonly counts = new Map<string, number>();
  private readonly disabled = new Set<string>();
  private readonly maxInvocations: number;

  constructor(maxInvocations = MAX_INVOCATIONS_PER_TURN) {
    this.maxInvocations = maxInvocations;
  }

  /**
   * Reset all counters for a new turn.
   */
  beginTurn(): void {
    this.counts.clear();
    // Don't clear disabled set — stays disabled for the session
  }

  /**
   * Try to acquire an invocation slot for the given (event, hookName) pair.
   * Returns true if allowed, false if the limit has been exceeded.
   * Auto-disables the hook after MAX_INVOCATIONS_PER_TURN calls.
   */
  tryAcquire(event: string, hookName: string): boolean {
    const key = `${event}::${hookName}`;
    if (this.disabled.has(key)) return false;

    const count = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, count);

    if (count > this.maxInvocations) {
      this.disabled.add(key);
      return false;
    }

    return true;
  }

  /**
   * Check if a hook was recently disabled.
   */
  isDisabled(event: string, hookName: string): boolean {
    return this.disabled.has(`${event}::${hookName}`);
  }

  /**
   * Get the current invocation count for a key.
   */
  getCount(event: string, hookName: string): number {
    return this.counts.get(`${event}::${hookName}`) ?? 0;
  }
}
