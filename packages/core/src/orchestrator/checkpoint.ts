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
  const filePath = path.join(dir, `${checkpoint.sessionId}-${checkpoint.turnNumber}.json`);
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

  const files = fs.readdirSync(dir)
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

  const files = fs.readdirSync(dir)
    .filter((f) => f.startsWith(`${sessionId}-`))
    .sort();

  const toDelete = files.slice(0, Math.max(0, files.length - keepCount));
  for (const f of toDelete) {
    try { fs.unlinkSync(path.join(dir, f)); } catch { /* ignore */ }
  }
}
