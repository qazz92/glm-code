/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * Long-horizon checkpoint system.
 * Saves state snapshots every N LLM turns for session resumption.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import process from 'node:process';

export interface Checkpoint {
  sessionId: string;
  turnNumber: number;
  timestamp: number;
  lastUserPrompt: string;
  filesModified: string[];
  workflowState?: string;

  // Full orchestrator state for crash recovery
  orchestrator_state?: {
    decision: string | null;
    pipeline_state: unknown | null;
    classification: unknown | null;
    model_override: string | null;
  };
  active_workers?: Array<{
    id: string;
    model: string;
    task: string;
    state: string;
    elapsed_ms: number;
  }>;
  context_state?: {
    messages_head_id: string | null;
    compact_summary_id: string | null;
    memory_loaded: string[];
    tokens_used: number;
    tokens_budget: number;
    context_percent: number;
  };
  rate_limits?: Record<string, { used: number; max: number }>;
  files_dirty?: string[];
}

const CHECKPOINT_DIR_NAME = 'checkpoints';
const CHECKPOINT_INTERVAL = 10; // every 10 turns

function getCheckpointDir(): string {
  const homeDir = process.env['HOME'] || process.env['USERPROFILE'] || '/tmp';
  return path.join(homeDir, '.glm', CHECKPOINT_DIR_NAME);
}

/**
 * Save a checkpoint.
 */
export function saveCheckpoint(checkpoint: Checkpoint): void {
  const dir = getCheckpointDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const filePath = path.join(
    dir,
    `${checkpoint.sessionId}-${checkpoint.turnNumber}.json`,
  );
  fs.writeFileSync(filePath, JSON.stringify(checkpoint, null, 2));
}

/**
 * Check if a checkpoint should be saved based on turn count.
 */
export function shouldCheckpoint(turnNumber: number): boolean {
  return turnNumber > 0 && turnNumber % CHECKPOINT_INTERVAL === 0;
}

/**
 * Find the latest checkpoint for a session.
 */
export function findLatestCheckpoint(sessionId: string): Checkpoint | null {
  const dir = getCheckpointDir();
  if (!fs.existsSync(dir)) return null;

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(`${sessionId}-`) && f.endsWith('.json'))
    .sort()
    .reverse();

  if (files.length === 0) return null;

  try {
    const raw = fs.readFileSync(path.join(dir, files[0]), 'utf-8');
    return JSON.parse(raw) as Checkpoint;
  } catch {
    return null;
  }
}

/**
 * Clean up old checkpoints for a session (keep last 3).
 */
export function cleanupCheckpoints(sessionId: string, keepCount = 3): void {
  const dir = getCheckpointDir();
  if (!fs.existsSync(dir)) return;

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(`${sessionId}-`))
    .sort();

  const toDelete = files.slice(0, Math.max(0, files.length - keepCount));
  for (const f of toDelete) {
    try {
      fs.unlinkSync(path.join(dir, f));
    } catch {
      /* ignore */
    }
  }
}

/**
 * Load the latest checkpoint and validate it has recoverable state.
 */
export function loadLatestCheckpoint(sessionId: string): Checkpoint | null {
  const checkpoint = findLatestCheckpoint(sessionId);
  if (checkpoint === null) return null;
  if (
    typeof checkpoint.sessionId !== 'string' ||
    typeof checkpoint.turnNumber !== 'number'
  ) {
    return null;
  }
  return checkpoint;
}
