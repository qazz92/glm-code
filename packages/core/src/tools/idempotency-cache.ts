/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * Idempotency cache — avoids duplicate tool calls within a TTL window.
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import process from 'node:process';
import { createDebugLogger } from '../utils/debugLogger.js';

const debugLogger = createDebugLogger('idempotency');

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  key: string;
  result: string;
  createdAt: number;
}

export class IdempotencyCache {
  private readonly cachePath: string;
  private readonly ttlMs: number;
  private entries = new Map<string, CacheEntry>();
  private dirty = false;

  constructor(ttlMs = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;
    const homeDir = process.env['HOME'] || process.env['USERPROFILE'] || '/tmp';
    const cacheDir = path.join(homeDir, '.glm', 'cache');
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    this.cachePath = path.join(cacheDir, 'tool-calls.jsonl');
    this.load();
  }

  /**
   * Generate a cache key from tool call parameters.
   */
  static makeKey(toolName: string, args: Record<string, unknown>): string {
    const payload = JSON.stringify({ tool: toolName, args });
    return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);
  }

  /**
   * Check if a cached result exists for the key.
   */
  get(key: string): string | null {
    this.evictExpired();
    const entry = this.entries.get(key);
    if (!entry) return null;
    debugLogger.debug(`Cache hit: ${key}`);
    return entry.result;
  }

  /**
   * Store a result in the cache.
   */
  set(key: string, result: string): void {
    const entry: CacheEntry = { key, result, createdAt: Date.now() };
    this.entries.set(key, entry);
    this.dirty = true;
    this.persist();
    debugLogger.debug(`Cache set: ${key}`);
  }

  /**
   * Remove expired entries.
   */
  private evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (now - entry.createdAt > this.ttlMs) {
        this.entries.delete(key);
      }
    }
  }

  /**
   * Load cache from disk.
   */
  private load(): void {
    if (!fs.existsSync(this.cachePath)) return;
    try {
      const lines = fs.readFileSync(this.cachePath, 'utf-8').trim().split('\n');
      for (const line of lines) {
        if (!line) continue;
        const entry = JSON.parse(line) as CacheEntry;
        if (Date.now() - entry.createdAt <= this.ttlMs) {
          this.entries.set(entry.key, entry);
        }
      }
    } catch { /* ignore corrupted cache */ }
  }

  /**
   * Persist cache to disk.
   */
  private persist(): void {
    if (!this.dirty) return;
    try {
      const lines = Array.from(this.entries.values())
        .map((e) => JSON.stringify(e))
        .join('\n');
      fs.writeFileSync(this.cachePath, lines + '\n');
      this.dirty = false;
    } catch (err) {
      debugLogger.warn('Failed to persist idempotency cache:', err);
    }
  }
}
