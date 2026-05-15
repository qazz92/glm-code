/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * Token Economics Tracker — per-model cumulative usage tracking
 * for input/output tokens, cache hits/misses, and estimated cost.
 */

import { createDebugLogger } from '../utils/debugLogger.js';

const debugLogger = createDebugLogger('TOKEN_ECON');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TokenMetrics {
  inputTokens: number;
  outputTokens: number;
  cacheHits: number;
  cacheMisses: number;
  callCount: number;
  cost: number;
}

interface ModelMetricsInternal {
  inputTokens: number;
  outputTokens: number;
  cacheHits: number;
  cacheMisses: number;
  callCount: number;
  cost: number;
  /** Bytes of parent context estimated as stable. */
  parentContextStableBytes: number;
  /** Total bytes of parent context observed. */
  parentContextTotalBytes: number;
}

// Default cost per 1M tokens (configurable per model).
const DEFAULT_COST_PER_MILLION = {
  input: 3.0,
  output: 15.0,
};

const MODEL_COSTS: Record<string, { input: number; output: number }> = {};

function getCostPerMillion(
  model: string,
): { input: number; output: number } {
  return MODEL_COSTS[model] ?? DEFAULT_COST_PER_MILLION;
}

// ---------------------------------------------------------------------------
// TokenEconomicsTracker
// ---------------------------------------------------------------------------

export class TokenEconomicsTracker {
  private metrics = new Map<string, ModelMetricsInternal>();

  /**
   * Record token usage for a model after an LLM response.
   */
  recordUsage(
    model: string,
    inputTokens: number,
    outputTokens: number,
    cachedTokens: number = 0,
  ): void {
    let entry = this.metrics.get(model);
    if (!entry) {
      entry = {
        inputTokens: 0,
        outputTokens: 0,
        cacheHits: 0,
        cacheMisses: 0,
        callCount: 0,
        cost: 0,
        parentContextStableBytes: 0,
        parentContextTotalBytes: 0,
      };
      this.metrics.set(model, entry);
    }

    entry.inputTokens += inputTokens;
    entry.outputTokens += outputTokens;
    entry.callCount += 1;

    if (cachedTokens > 0) {
      entry.cacheHits += cachedTokens;
    } else {
      entry.cacheMisses += inputTokens;
    }

    // Estimate cost
    const costConfig = getCostPerMillion(model);
    const inputCost = (inputTokens / 1_000_000) * costConfig.input;
    const outputCost = (outputTokens / 1_000_000) * costConfig.output;
    entry.cost += inputCost + outputCost;

    debugLogger.debug('recorded', {
      model,
      inputTokens,
      outputTokens,
      cachedTokens,
    });
  }

  /**
   * Record parent context stability estimate for a model.
   */
  recordParentContext(
    model: string,
    stableBytes: number,
    totalBytes: number,
  ): void {
    let entry = this.metrics.get(model);
    if (!entry) {
      entry = {
        inputTokens: 0,
        outputTokens: 0,
        cacheHits: 0,
        cacheMisses: 0,
        callCount: 0,
        cost: 0,
        parentContextStableBytes: 0,
        parentContextTotalBytes: 0,
      };
      this.metrics.set(model, entry);
    }
    entry.parentContextStableBytes += stableBytes;
    entry.parentContextTotalBytes += totalBytes;
  }

  /**
   * Get metrics for a specific model, or aggregate across all models.
   */
  getMetrics(model?: string): TokenMetrics {
    if (model) {
      const entry = this.metrics.get(model);
      if (!entry) {
        return {
          inputTokens: 0,
          outputTokens: 0,
          cacheHits: 0,
          cacheMisses: 0,
          callCount: 0,
          cost: 0,
        };
      }
      return {
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
        cacheHits: entry.cacheHits,
        cacheMisses: entry.cacheMisses,
        callCount: entry.callCount,
        cost: entry.cost,
      };
    }

    // Aggregate all models
    let inputTokens = 0;
    let outputTokens = 0;
    let cacheHits = 0;
    let cacheMisses = 0;
    let callCount = 0;
    let cost = 0;

    for (const entry of this.metrics.values()) {
      inputTokens += entry.inputTokens;
      outputTokens += entry.outputTokens;
      cacheHits += entry.cacheHits;
      cacheMisses += entry.cacheMisses;
      callCount += entry.callCount;
      cost += entry.cost;
    }

    return {
      inputTokens,
      outputTokens,
      cacheHits,
      cacheMisses,
      callCount,
      cost,
    };
  }

  /**
   * Overall cache hit rate (0..1).
   */
  getCacheHitRate(): number {
    const metrics = this.getMetrics();
    const total = metrics.cacheHits + metrics.cacheMisses;
    if (total === 0) return 0;
    return metrics.cacheHits / total;
  }

  /**
   * Estimated % of parent context that stays stable across calls.
   */
  getParentContextRetention(): number {
    let stableBytes = 0;
    let totalBytes = 0;
    for (const entry of this.metrics.values()) {
      stableBytes += entry.parentContextStableBytes;
      totalBytes += entry.parentContextTotalBytes;
    }
    if (totalBytes === 0) return 1.0;
    return stableBytes / totalBytes;
  }

  /**
   * Formatted report suitable for /stats command output.
   */
  getReport(): string {
    const lines: string[] = [];
    lines.push('=== Token Economics Report ===');
    lines.push('');

    const aggregate = this.getMetrics();
    lines.push(
      `Total: ${aggregate.callCount} calls, ` +
        `${formatNumber(aggregate.inputTokens)} in / ` +
        `${formatNumber(aggregate.outputTokens)} out tokens, ` +
        `cost $${aggregate.cost.toFixed(4)}`,
    );
    lines.push(
      `Cache hit rate: ${(this.getCacheHitRate() * 100).toFixed(1)}%`,
    );
    lines.push(
      `Parent context retention: ${(
        this.getParentContextRetention() * 100
      ).toFixed(1)}%`,
    );

    if (this.metrics.size > 1) {
      lines.push('');
      lines.push('Per-model breakdown:');
      for (const [model, entry] of this.metrics) {
        lines.push(
          `  ${model}: ${entry.callCount} calls, ` +
            `${formatNumber(entry.inputTokens)} in / ` +
            `${formatNumber(entry.outputTokens)} out, ` +
            `$${entry.cost.toFixed(4)}`,
        );
      }
    }

    lines.push('');
    lines.push('===');
    return lines.join('\n');
  }

  /**
   * Reset all metrics (useful for testing).
   */
  reset(): void {
    this.metrics.clear();
  }
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _instance: TokenEconomicsTracker | null = null;

export function getTokenEconomicsTracker(): TokenEconomicsTracker {
  if (!_instance) {
    _instance = new TokenEconomicsTracker();
  }
  return _instance;
}

/** Reset singleton (tests only). */
export function _resetTokenEconomicsTracker(): void {
  _instance = null;
}
