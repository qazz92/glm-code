/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Rate Limiter — 429 response classification and retry decisions.
 *
 * Distinguishes three types of 429 responses:
 * - concurrent_429: remaining=0 but reset is soon → queue + retry
 * - quota_429: reset is far (>1h) or no reset → stop + user prompt
 * - unknown_429: no clear headers → treat as concurrent (conservative)
 */

import { createDebugLogger } from '../utils/debugLogger.js';

const debugLogger = createDebugLogger('RATE-LIMIT');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RateLimitDecision {
  /** What the caller should do. */
  type: 'queue' | 'stop' | 'user_prompt';
  /** Seconds to wait before retrying (if applicable). */
  retryAfter?: number;
  /** Human-readable message for user_prompt decisions. */
  message?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** If reset_at is more than 1 hour away, treat it as a quota 429. */
const QUOTA_THRESHOLD_MS = 60 * 60 * 1000;

/** Header name constants (lowercased for comparison). */
const HDR_RETRY_AFTER = 'retry-after';
const HDR_RATELIMIT_REMAINING = 'x-ratelimit-remaining';
const HDR_RATELIMIT_RESET = 'x-ratelimit-reset';

// ---------------------------------------------------------------------------
// RateLimiter
// ---------------------------------------------------------------------------

export class RateLimiter {
  /**
   * Analyse HTTP 429 response headers and return a retry decision.
   *
   * @param statusCode  HTTP status code (expected 429, but accepts any).
   * @param headers     Response headers (keys are compared case-insensitively).
   */
  handle429Response(
    statusCode: number,
    headers: Record<string, string>,
  ): RateLimitDecision {
    if (statusCode !== 429) {
      // Not a 429 — not our concern.
      return { type: 'stop', message: `Unexpected status ${statusCode}` };
    }

    const normalized = normalizeHeaders(headers);

    const retryAfter = parseRetryAfter(normalized[HDR_RETRY_AFTER]);
    const remaining = parseRemaining(normalized[HDR_RATELIMIT_REMAINING]);
    const resetAt = parseResetAt(normalized[HDR_RATELIMIT_RESET]);

    debugLogger.debug(
      `429 headers: retryAfter=${retryAfter}s remaining=${remaining} resetAt=${resetAt}`,
    );

    // --- concurrent_429: remaining=0, reset is soon ---
    if (remaining === 0 && resetAt !== null) {
      const timeUntilReset = resetAt * 1000 - Date.now();
      if (timeUntilReset > 0 && timeUntilReset <= QUOTA_THRESHOLD_MS) {
        const waitSec = retryAfter ?? Math.ceil(timeUntilReset / 1000);
        debugLogger.info(
          `concurrent_429 — queueing for ${waitSec}s`,
        );
        return {
          type: 'queue',
          retryAfter: waitSec,
        };
      }
    }

    // --- quota_429: reset is far away or missing ---
    if (resetAt !== null) {
      const timeUntilReset = resetAt * 1000 - Date.now();
      if (timeUntilReset > QUOTA_THRESHOLD_MS || timeUntilReset <= 0) {
        debugLogger.info('quota_429 — reset too far or already past');
        return {
          type: 'user_prompt',
          message:
            'Daily API quota exhausted. Quota resets later — please try again later or switch to a different plan.',
        };
      }
    }

    // If retry-after is present and reasonable, use it as a queue signal.
    if (retryAfter !== null && retryAfter > 0) {
      debugLogger.info(`429 with retry-after=${retryAfter}s — queueing`);
      return {
        type: 'queue',
        retryAfter,
      };
    }

    // --- unknown_429: no clear headers → conservative (queue) ---
    if (remaining === null && resetAt === null && retryAfter === null) {
      debugLogger.info('unknown_429 — no rate-limit headers, queueing conservatively');
      return {
        type: 'queue',
        retryAfter: 5, // conservative 5s backoff
      };
    }

    // Fallback: treat remaining=0 with no other signal as quota exhaustion.
    if (remaining === 0) {
      return {
        type: 'user_prompt',
        message: 'Rate limit reached with no reset information. Please try again later.',
      };
    }

    // If remaining > 0, it might be a transient spike.
    return {
      type: 'queue',
      retryAfter: retryAfter ?? 2,
    };
  }
}

// ---------------------------------------------------------------------------
// Header parsing helpers
// ---------------------------------------------------------------------------

function normalizeHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k.toLowerCase()] = v;
  }
  return out;
}

/**
 * Parse Retry-After header. Can be seconds (integer) or an HTTP date.
 * Returns seconds, or null if absent/invalid.
 */
function parseRetryAfter(value: string | undefined): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  // Try integer seconds first.
  const asNum = Number(trimmed);
  if (Number.isFinite(asNum) && asNum >= 0) return asNum;
  // Try HTTP date.
  const asDate = new Date(trimmed).getTime();
  if (Number.isFinite(asDate)) {
    return Math.max(0, Math.ceil((asDate - Date.now()) / 1000));
  }
  return null;
}

/** Parse x-ratelimit-remaining (integer count). */
function parseRemaining(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number(value.trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse x-ratelimit-reset. Can be a Unix timestamp (seconds) or an HTTP date.
 * Returns epoch seconds, or null if absent/invalid.
 */
function parseResetAt(value: string | undefined): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  // Unix timestamp in seconds.
  const asNum = Number(trimmed);
  if (Number.isFinite(asNum) && asNum > 1_000_000_000) return asNum;
  // HTTP date.
  const ms = new Date(trimmed).getTime();
  if (Number.isFinite(ms)) return Math.floor(ms / 1000);
  return null;
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _instance: RateLimiter | null = null;

export function getRateLimiter(): RateLimiter {
  if (!_instance) {
    _instance = new RateLimiter();
  }
  return _instance;
}

/** Reset singleton (tests only). */
export function _resetRateLimiter(): void {
  _instance = null;
}
