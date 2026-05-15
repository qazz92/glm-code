/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * Session journal — human-readable progress log for long-horizon workflows.
 * Appends timestamped entries to ~/.glm/sessions/{id}/journal.md.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import process from 'node:process';
import { createDebugLogger } from '../utils/debugLogger.js';

const debugLogger = createDebugLogger('journal');

function getSessionsDir(): string {
  const homeDir = process.env['HOME'] || process.env['USERPROFILE'] || '/tmp';
  return path.join(homeDir, '.glm', 'sessions');
}

function getJournalPath(sessionId: string): string {
  return path.join(getSessionsDir(), sessionId, 'journal.md');
}

/**
 * Append a journal entry to the session's journal.md file.
 * Creates the file and directory on first write.
 *
 * Entry format: `## HH:MM — {action}\n{details}\n`
 */
export function appendJournalEntry(
  sessionId: string,
  entry: { action: string; details: string },
): void {
  const journalPath = getJournalPath(sessionId);
  const dir = path.dirname(journalPath);

  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const now = new Date();
    const timestamp = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const heading = `## ${timestamp} — ${entry.action}`;
    const block = `${heading}\n${entry.details}\n\n`;

    fs.appendFileSync(journalPath, block, 'utf-8');
    debugLogger.info(`Journal entry appended: ${entry.action}`);
  } catch (err) {
    debugLogger.warn('Failed to append journal entry:', err);
  }
}

/**
 * Read the full journal contents for a session.
 * Returns empty string if no journal exists.
 */
export function readJournal(sessionId: string): string {
  const journalPath = getJournalPath(sessionId);
  try {
    if (fs.existsSync(journalPath)) {
      return fs.readFileSync(journalPath, 'utf-8');
    }
  } catch (err) {
    debugLogger.warn('Failed to read journal:', err);
  }
  return '';
}
