/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Quota Tracker — daily usage tracking per pool/model.
 *
 * Persistence is JSON-based (consistent with the rest of the codebase which
 * avoids native deps).  The logical schema mirrors the spec's two-table design:
 *
 *   quota_usage  (timestamp, pool, model, tokensIn, tokensOut, requestCount)
 *   quota_pools  (pool PK, dailyLimit, used, resetAt)
 *
 * File: ~/.glm/quota.json
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createDebugLogger } from '../utils/debugLogger.js';

const debugLogger = createDebugLogger('QUOTA');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const POOLS = ['coding', 'web', 'vision'] as const;
export type Pool = (typeof POOLS)[number];

export interface QuotaUsageRow {
  timestamp: number;
  pool: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  requestCount: number;
}

export interface QuotaPoolRow {
  pool: string;
  dailyLimit: number;
  used: number;
  resetAt: number; // epoch ms
}

export interface QuotaStatus {
  pool: string;
  dailyLimit: number;
  used: number;
  remaining: number;
  percent: number;
  resetAt: number;
}

export type ThresholdLevel = 'ok' | 'warning' | 'critical' | 'exhausted';

// ---------------------------------------------------------------------------
// Persistence schema (JSON file)
// ---------------------------------------------------------------------------

interface QuotaData {
  pools: Record<string, QuotaPoolRow>;
  usage: QuotaUsageRow[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function quotaFilePath(): string {
  return path.join(os.homedir(), '.glm', 'quota.json');
}

function nextMidnight(): number {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d.getTime();
}

function ensureDataDir(): void {
  const dir = path.join(os.homedir(), '.glm');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function emptyData(): QuotaData {
  return { pools: {}, usage: [] };
}

// ---------------------------------------------------------------------------
// QuotaTracker
// ---------------------------------------------------------------------------

export class QuotaTracker {
  private data: QuotaData;
  private dirty = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.data = this.load();
  }

  // -- Public API ----------------------------------------------------------

  /** Initialize quota_pools with daily limits if they don't exist yet. */
  initDefaults(limits: Record<string, number>): void {
    let changed = false;
    for (const pool of POOLS) {
      if (!(pool in this.data.pools)) {
        this.data.pools[pool] = {
          pool,
          dailyLimit: limits[pool] ?? 0,
          used: 0,
          resetAt: nextMidnight(),
        };
        changed = true;
      }
    }
    if (changed) {
      this.dirty = true;
      this.scheduleFlush();
    }
  }

  /**
   * Record token usage for a pool/model combination.
   * Inserts a usage row and increments the pool's used counter.
   */
  recordUsage(
    pool: Pool,
    model: string,
    tokensIn: number,
    tokensOut: number,
  ): void {
    this.resetIfNeeded();

    const row: QuotaUsageRow = {
      timestamp: Date.now(),
      pool,
      model,
      tokensIn,
      tokensOut,
      requestCount: 1,
    };
    this.data.usage.push(row);

    // Keep only last 10 000 usage rows to avoid unbounded growth.
    if (this.data.usage.length > 10_000) {
      this.data.usage = this.data.usage.slice(-8_000);
    }

    // Increment pool counter.
    const poolRow = this.data.pools[pool];
    if (poolRow) {
      poolRow.used += tokensIn + tokensOut;
    }

    this.dirty = true;
    this.scheduleFlush();
    debugLogger.debug(
      `recordUsage pool=${pool} model=${model} in=${tokensIn} out=${tokensOut}`,
    );
  }

  /** Get quota status for a pool. */
  getQuotaStatus(pool: Pool): QuotaStatus {
    this.resetIfNeeded();

    const row = this.data.pools[pool];
    if (!row) {
      return {
        pool,
        dailyLimit: 0,
        used: 0,
        remaining: 0,
        percent: 0,
        resetAt: 0,
      };
    }

    const remaining = Math.max(0, row.dailyLimit - row.used);
    const percent =
      row.dailyLimit > 0 ? (row.used / row.dailyLimit) * 100 : 0;

    return {
      pool: row.pool,
      dailyLimit: row.dailyLimit,
      used: row.used,
      remaining,
      percent,
      resetAt: row.resetAt,
    };
  }

  /**
   * Check threshold level for a pool.
   * 80% = warning, 95% = critical, 100% = exhausted.
   */
  checkThreshold(pool: Pool): ThresholdLevel {
    this.resetIfNeeded();
    const status = this.getQuotaStatus(pool);
    if (status.dailyLimit === 0) return 'ok';
    if (status.percent >= 100) return 'exhausted';
    if (status.percent >= 95) return 'critical';
    if (status.percent >= 80) return 'warning';
    return 'ok';
  }

  /**
   * If the current time is past resetAt, reset used to 0 and set the next
   * resetAt to the following midnight.
   */
  resetIfNeeded(): void {
    const now = Date.now();
    for (const pool of POOLS) {
      const row = this.data.pools[pool];
      if (row && now >= row.resetAt) {
        row.used = 0;
        row.resetAt = nextMidnight();
        this.dirty = true;
        debugLogger.info(`Pool "${pool}" reset for new day`);
      }
    }
    if (this.dirty) {
      this.scheduleFlush();
    }
  }

  // -- Persistence ---------------------------------------------------------

  private load(): QuotaData {
    try {
      const fp = quotaFilePath();
      if (fs.existsSync(fp)) {
        const raw = fs.readFileSync(fp, 'utf-8');
        return JSON.parse(raw) as QuotaData;
      }
    } catch (err) {
      debugLogger.warn('Failed to load quota data, starting fresh', err);
    }
    return emptyData();
  }

  private flush(): void {
    if (!this.dirty) return;
    try {
      ensureDataDir();
      fs.writeFileSync(quotaFilePath(), JSON.stringify(this.data), 'utf-8');
      this.dirty = false;
    } catch (err) {
      debugLogger.warn('Failed to flush quota data', err);
    }
  }

  private scheduleFlush(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    // Coalesce writes — flush after 2 seconds of inactivity.
    this.flushTimer = setTimeout(() => this.flush(), 2000);
    // Prevent the timer from keeping the process alive.
    if (this.flushTimer && typeof this.flushTimer === 'object' && 'unref' in this.flushTimer) {
      this.flushTimer.unref();
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _instance: QuotaTracker | null = null;

export function getQuotaTracker(): QuotaTracker {
  if (!_instance) {
    _instance = new QuotaTracker();
  }
  return _instance;
}

/** Reset singleton (tests only). */
export function _resetQuotaTracker(): void {
  _instance = null;
}
