/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * Context assembler — builds the 6-block context structure
 * with token budget tracking, prompt caching annotations,
 * and cache hit rate telemetry.
 *
 * Block order (from most stable to most volatile):
 *   1. system    — core system prompt (static, always cached)
 *   2. skills    — skill catalog (changes rarely, cached)
 *   3. agents_md — AGENTS.md content (changes rarely, cached)
 *   4. summary   — compacted conversation summary (changes on compaction)
 *   5. history   — recent conversation turns (changes every turn)
 *   6. user_turn — current user message (changes every turn)
 */

import { createDebugLogger } from '../utils/debugLogger.js';

const debugLogger = createDebugLogger('context');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Cache control annotation for prompt caching (Claude-style ephemeral). */
export interface CacheControl {
  type: 'ephemeral';
}

/** A single context block sent to the LLM as part of the assembled prompt. */
export interface ContextBlock {
  /** Semantic role for this block. */
  role: 'system' | 'user';
  /** Block content text. */
  content: string;
  /** Optional cache control — when set, signals the API to cache this block. */
  cacheControl?: CacheControl;
}

/** Token budget tracking for the assembled context. */
export interface ContextBudget {
  totalTokens: number;
  maxTokens: number;
  usagePercent: number;
  blocks: TypedContextBlock[];
  needsCompaction: boolean;
}

/** Internal typed block with metadata for budget tracking. */
export interface TypedContextBlock {
  type: BlockType;
  content: string;
  tokenEstimate: number;
}

/** The 6 block types in stability order. */
export type BlockType =
  | 'system'
  | 'skills'
  | 'agents_md'
  | 'summary'
  | 'history'
  | 'user_turn';

/** All 6 block types in order. */
export const BLOCK_TYPES: readonly BlockType[] = [
  'system',
  'skills',
  'agents_md',
  'summary',
  'history',
  'user_turn',
] as const;

/** Cache hit rate telemetry from a single API response. */
export interface CacheHitRate {
  cachedTokens: number;
  totalTokens: number;
  hitRate: number;
}

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

/** Rough token estimate: ~4 chars per token */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ---------------------------------------------------------------------------
// Block construction
// ---------------------------------------------------------------------------

/**
 * Create a typed context block (internal, for budget tracking).
 */
export function createTypedBlock(
  type: BlockType,
  content: string,
): TypedContextBlock {
  return {
    type,
    content,
    tokenEstimate: estimateTokens(content),
  };
}

/**
 * Convert typed blocks to API-ready ContextBlock[] with cache_control
 * annotations. Each block gets `cache_control: { type: 'ephemeral' }`
 * to enable prompt caching at every boundary.
 */
export function toContextBlocks(typedBlocks: TypedContextBlock[]): ContextBlock[] {
  const result: ContextBlock[] = [];
  for (const block of typedBlocks) {
    if (!block.content) continue;
    // All blocks use 'system' role except history and user_turn which are 'user'
    const role: ContextBlock['role'] =
      block.type === 'history' || block.type === 'user_turn'
        ? 'user'
        : 'system';
    result.push({
      role,
      content: block.content,
      cacheControl: { type: 'ephemeral' },
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

/**
 * Assemble the full context from typed blocks and compute budget.
 */
export function assembleContext(
  blocks: TypedContextBlock[],
  maxContextTokens = 128000,
): ContextBudget {
  const totalTokens = blocks.reduce((sum, b) => sum + b.tokenEstimate, 0);
  const usagePercent = Math.round((totalTokens / maxContextTokens) * 100);
  const needsCompaction = usagePercent > 60;

  if (needsCompaction) {
    debugLogger.warn(
      `Context at ${usagePercent}% (${totalTokens}/${maxContextTokens} tokens) — compaction recommended`,
    );
  }

  return {
    totalTokens,
    maxTokens: maxContextTokens,
    usagePercent,
    blocks,
    needsCompaction,
  };
}

/**
 * Build the complete 6-layer context from individual content parts.
 * Returns typed blocks ready for budget analysis and API conversion.
 */
export function buildSixLayerContext(parts: {
  system: string;
  skills: string;
  agents_md: string;
  summary: string;
  history: string;
  user_turn: string;
}): TypedContextBlock[] {
  return BLOCK_TYPES.map((type) =>
    createTypedBlock(type, parts[type] || ''),
  ).filter((block) => block.content.length > 0);
}

// ---------------------------------------------------------------------------
// Cache hit rate tracking
// ---------------------------------------------------------------------------

/** Log cache hit rate from response headers/metadata. */
export function trackCacheHitRate(rate: CacheHitRate): void {
  if (rate.totalTokens === 0) return;
  debugLogger.info(
    `Cache hit rate: ${rate.hitRate.toFixed(1)}% (${rate.cachedTokens}/${rate.totalTokens} tokens)`,
  );
}

/**
 * Extract cache hit rate from API response metadata.
 * Accepts the usage metadata object from Gemini/Claude responses.
 */
export function extractCacheHitRate(usage: {
  cachedContentTokenCount?: number;
  promptTokenCount?: number;
  totalTokenCount?: number;
}): CacheHitRate | null {
  const cachedTokens = usage.cachedContentTokenCount ?? 0;
  const totalTokens = usage.promptTokenCount ?? usage.totalTokenCount ?? 0;
  if (totalTokens === 0) return null;
  return {
    cachedTokens,
    totalTokens,
    hitRate: (cachedTokens / totalTokens) * 100,
  };
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

/**
 * Get a formatted budget summary for display.
 */
export function formatBudgetSummary(budget: ContextBudget): string {
  const lines = budget.blocks.map(
    (b) => `  ${b.type.padEnd(12)} ${String(b.tokenEstimate).padStart(6)} tokens`,
  );
  return [
    `Context: ${budget.usagePercent}% (${budget.totalTokens.toLocaleString()}/${budget.maxTokens.toLocaleString()} tokens)`,
    ...lines,
    budget.needsCompaction ? '  ⚠ Auto-compaction recommended' : '',
  ]
    .filter(Boolean)
    .join('\n');
}

// ---------------------------------------------------------------------------
// Backward compatibility
// ---------------------------------------------------------------------------

/**
 * @deprecated Use createTypedBlock instead. Kept for existing callers.
 */
export function createBlock(
  type: string,
  content: string,
): TypedContextBlock {
  return createTypedBlock(type as BlockType, content);
}
