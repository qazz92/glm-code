/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * Memory capacity limits and score-based eviction.
 */

export interface MemoryCaps {
  maxLinesPerMemory: number;
  maxBytesPerMemory: number;
  maxFiles: number;
  maxTotalBytes: number;
  maxBodyBytes: number;
}

export const DEFAULT_MEMORY_CAPS: MemoryCaps = {
  maxLinesPerMemory: 200,
  maxBytesPerMemory: 25 * 1024,      // 25KB
  maxFiles: 200,
  maxTotalBytes: 5 * 1024 * 1024,    // 5MB
  maxBodyBytes: 4 * 1024,            // 4KB body limit
};

export interface EvictionScore {
  id: string;
  score: number;
  reason: string;
}

/**
 * Compute eviction score for a memory entry.
 * Higher score = more likely to be evicted.
 */
export function computeEvictionScore(params: {
  ageDays: number;
  type: string;
  accessCount: number;
  lastAccessedDaysAgo: number;
  isPinned: boolean;
}): number {
  const { ageDays, type, lastAccessedDaysAgo, isPinned } = params;

  if (isPinned) return -Infinity; // Never evict pinned

  const ageDecay = Math.min(ageDays / 30, 1) * 0.4; // 0-0.4
  const typeWeight = type === 'auto' ? 0.3 : type === 'manual' ? 0.1 : 0.2;
  const accessRecency = Math.min(lastAccessedDaysAgo / 7, 1) * 0.3; // 0-0.3

  return ageDecay + typeWeight + accessRecency;
}

/**
 * Check if memory caps are exceeded.
 */
export function isOverCap(
  current: { fileCount: number; totalBytes: number },
  caps: MemoryCaps = DEFAULT_MEMORY_CAPS,
): boolean {
  return current.fileCount > caps.maxFiles || current.totalBytes > caps.maxTotalBytes;
}

/**
 * Select entries for eviction to bring usage under caps.
 */
export function selectForEviction(
  entries: Array<{
    id: string;
    ageDays: number;
    type: string;
    accessCount: number;
    lastAccessedDaysAgo: number;
    isPinned: boolean;
  }>,
  targetCount: number,
): string[] {
  const scored = entries
    .filter((e) => !e.isPinned)
    .map((e) => ({
      id: e.id,
      score: computeEvictionScore(e),
    }))
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, targetCount).map((e) => e.id);
}
