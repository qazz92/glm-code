/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Retry Policy Table — maps error types to retry behaviour.
 *
 * Usage: retry.ts should delegate to `getRetryPolicy()` for policy selection
 * instead of hardcoding retry parameters inline.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RetryPolicy {
  maxRetries: number;
  backoff: 'exponential' | 'fixed' | 'none';
  initialDelay: number;
  maxDelay: number;
  /** Human action hint for the caller (e.g. "Daily quota exhausted"). */
  userAction?: string;
}

export interface RetryableError {
  statusCode: number;
  /** When true, the 429 has been classified as a quota (not concurrent) 429. */
  isQuota?: boolean;
}

// ---------------------------------------------------------------------------
// Policy table
// ---------------------------------------------------------------------------

export const RETRY_POLICIES: Record<string, RetryPolicy> = {
  network: {
    maxRetries: 3,
    backoff: 'exponential',
    initialDelay: 1000,
    maxDelay: 4000,
  },
  '429_concurrent': {
    maxRetries: Infinity,
    backoff: 'none',
    initialDelay: 0,
    maxDelay: 0,
  },
  '429_quota': {
    maxRetries: 0,
    backoff: 'none',
    initialDelay: 0,
    maxDelay: 0,
    userAction: 'Daily quota exhausted',
  },
  '400': {
    maxRetries: 0,
    backoff: 'none',
    initialDelay: 0,
    maxDelay: 0,
  },
  '401_403': {
    maxRetries: 0,
    backoff: 'none',
    initialDelay: 0,
    maxDelay: 0,
    userAction: 'Authentication error',
  },
  '408': {
    maxRetries: 1,
    backoff: 'none',
    initialDelay: 0,
    maxDelay: 0,
    userAction: 'Preserve partial response',
  },
  '503': {
    maxRetries: 3,
    backoff: 'exponential',
    initialDelay: 5000,
    maxDelay: 45_000,
  },
  safety: {
    maxRetries: 0,
    backoff: 'none',
    initialDelay: 0,
    maxDelay: 0,
    userAction: 'Safety refusal',
  },
} as const;

// ---------------------------------------------------------------------------
// Policy selection
// ---------------------------------------------------------------------------

/**
 * Select a retry policy based on error characteristics.
 *
 * Classification order:
 * 1. Safety refusals (statusCode 400 + safety context) → 'safety'
 * 2. 401/403 → '401_403'
 * 3. 429 quota → '429_quota'
 * 4. 429 concurrent → '429_concurrent'
 * 5. 400 → '400'
 * 6. 408 → '408'
 * 7. 503 → '503'
 * 8. Network errors (statusCode 0 / ECONNRESET etc.) → 'network'
 */
export function getRetryPolicy(error: RetryableError): RetryPolicy {
  const { statusCode, isQuota } = error;

  // Auth errors
  if (statusCode === 401 || statusCode === 403) {
    return RETRY_POLICIES['401_403']!;
  }

  // Rate limiting
  if (statusCode === 429) {
    return isQuota
      ? RETRY_POLICIES['429_quota']!
      : RETRY_POLICIES['429_concurrent']!;
  }

  // Bad request
  if (statusCode === 400) {
    return RETRY_POLICIES['400']!;
  }

  // Request timeout — preserve partial
  if (statusCode === 408) {
    return RETRY_POLICIES['408']!;
  }

  // Service unavailable
  if (statusCode === 503) {
    return RETRY_POLICIES['503']!;
  }

  // Network-level errors (no status / connection reset etc.)
  if (statusCode === 0) {
    return RETRY_POLICIES['network']!;
  }

  // Default: treat 5xx as network-retryable, everything else as no-retry.
  if (statusCode >= 500) {
    return RETRY_POLICIES['network']!;
  }

  return RETRY_POLICIES['400']!;
}

// ---------------------------------------------------------------------------
// Backoff calculation
// ---------------------------------------------------------------------------

/**
 * Compute the delay in milliseconds for the given attempt number and policy.
 * Attempt is 0-indexed (first retry = attempt 0).
 */
export function calculateBackoff(
  attempt: number,
  policy: RetryPolicy,
): number {
  if (policy.backoff === 'none' || policy.maxRetries === 0) {
    return 0;
  }

  switch (policy.backoff) {
    case 'exponential': {
      const delay = Math.min(
        policy.initialDelay * Math.pow(2, attempt),
        policy.maxDelay,
      );
      // Add ±25% jitter to avoid thundering herd.
      const jitter = delay * 0.25 * (Math.random() * 2 - 1);
      return Math.max(0, Math.round(delay + jitter));
    }
    case 'fixed':
      return policy.initialDelay;
    default:
      return 0;
  }
}
