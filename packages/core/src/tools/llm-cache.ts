/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * LLM Cache — JSON-file-backed cache for LLM responses.
 * Stores responses keyed by a SHA-256 hash of the request parameters.
 *
 * Uses a simple JSON file instead of SQLite for zero-dependency operation.
 * The file is stored at ~/.glm/cache/llm-cache.json.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createHash } from 'node:crypto';
import { createDebugLogger } from '../utils/debugLogger.js';

const debugLogger = createDebugLogger('LLM_CACHE');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CacheEntry {
  response: string;
  usage: string;
  timestamp: number;
}

interface CacheData {
  entries: Record<string, CacheEntry>;
}

// ---------------------------------------------------------------------------
// Key Generation
// ---------------------------------------------------------------------------

export interface CacheKeyParams {
  role?: string;
  model?: string;
  endpoint?: string;
  systemHash?: string;
  messagesHash?: string;
  toolsHash?: string;
  seed?: number;
  temperature?: number;
}

/**
 * Generate a deterministic cache key from request parameters.
 */
export function generateCacheKey(params: CacheKeyParams): string {
  const normalized = {
    role: params.role ?? '',
    model: params.model ?? '',
    endpoint: params.endpoint ?? '',
    systemHash: params.systemHash ?? '',
    messagesHash: params.messagesHash ?? '',
    toolsHash: params.toolsHash ?? '',
    seed: params.seed ?? 0,
    temperature: params.temperature ?? 0,
  };
  return createHash('sha256')
    .update(JSON.stringify(normalized))
    .digest('hex');
}

// ---------------------------------------------------------------------------
// LLMCache
// ---------------------------------------------------------------------------

export class LLMCache {
  private filePath: string;
  private data: CacheData;
  private dirty = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(cacheDir?: string) {
    const dir = cacheDir ?? path.join(os.homedir(), '.glm', 'cache');
    this.filePath = path.join(dir, 'llm-cache.json');
    this.data = { entries: {} };
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw) as CacheData;
        if (parsed && typeof parsed.entries === 'object') {
          this.data = parsed;
        }
      }
    } catch (err) {
      debugLogger.warn('failed to load cache', {
        error: String(err),
      });
      this.data = { entries: {} };
    }
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flush();
      this.flushTimer = null;
    }, 1000);
  }

  private flush(): void {
    if (!this.dirty) return;
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.data), 'utf-8');
      this.dirty = false;
      debugLogger.debug('flushed cache to disk');
    } catch (err) {
      debugLogger.warn('failed to flush cache', { error: String(err) });
    }
  }

  /**
   * Get a cached response by key.
   */
  get(key: string): CacheEntry | null {
    const entry = this.data.entries[key];
    if (!entry) return null;
    return { ...entry };
  }

  /**
   * Store a response in the cache.
   */
  set(key: string, response: string, usage: string): void {
    this.data.entries[key] = {
      response,
      usage,
      timestamp: Date.now(),
    };
    this.dirty = true;
    this.scheduleFlush();
    debugLogger.debug('cached response', { key: key.slice(0, 16) });
  }

  /**
   * Check if a key exists in the cache.
   */
  has(key: string): boolean {
    return key in this.data.entries;
  }

  /**
   * Remove entries older than the given age in milliseconds.
   */
  cleanup(sessionAgeMs: number): number {
    const cutoff = Date.now() - sessionAgeMs;
    let removed = 0;
    for (const [key, entry] of Object.entries(this.data.entries)) {
      if (entry.timestamp < cutoff) {
        delete this.data.entries[key];
        removed++;
      }
    }
    if (removed > 0) {
      this.dirty = true;
      this.scheduleFlush();
      debugLogger.info('cleaned up stale entries', { removed });
    }
    return removed;
  }

  /**
   * Clear all entries from the cache.
   */
  clear(): void {
    this.data.entries = {};
    this.dirty = true;
    this.scheduleFlush();
    debugLogger.info('cleared all entries');
  }

  /**
   * Get the number of cached entries.
   */
  size(): number {
    return Object.keys(this.data.entries).length;
  }

  /**
   * Force immediate write to disk.
   */
  sync(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush();
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _instance: LLMCache | null = null;

export function getLLMCache(): LLMCache {
  if (!_instance) {
    _instance = new LLMCache();
  }
  return _instance;
}

/** Reset singleton (tests only). */
export function _resetLLMCache(): void {
  if (_instance) {
    _instance.sync();
  }
  _instance = null;
}
