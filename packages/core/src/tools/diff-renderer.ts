/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * Diff renderer — shows only changed hunks after edit/write operations.
 * Returns diff when changes are < 20% of file; returns full file otherwise.
 */

import { createDebugLogger } from '../utils/debugLogger.js';

const debugLogger = createDebugLogger('DIFF_RENDERER');

/** Maximum context lines around each change hunk. */
const MAX_CONTEXT_LINES = 3;

/** If changes exceed this fraction of file, return full content instead of diff. */
const CHANGE_RATIO_THRESHOLD = 0.2;

/** Single diff hunk. */
interface DiffHunk {
  /** Starting line number in the original content. */
  startLine: number;
  /** Lines of context/content for this hunk. */
  lines: Array<{ type: 'added' | 'removed' | 'context'; text: string }>;
}

/**
 * Compute a simple line-based diff between original and new content.
 * Returns an array of hunks with surrounding context.
 */
function computeDiffHunks(
  originalLines: string[],
  newLines: string[],
  maxContext: number = MAX_CONTEXT_LINES,
): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let currentHunk: DiffHunk | null = null;

  // Track which original lines were matched
  const matched = new Array<boolean>(originalLines.length).fill(false);
  const newMatched = new Array<boolean>(newLines.length).fill(false);

  // Greedy match: find matches
  for (let i = 0; i < originalLines.length; i++) {
    for (let j = 0; j < newLines.length; j++) {
      if (!newMatched[j] && originalLines[i] === newLines[j]) {
        matched[i] = true;
        newMatched[j] = true;
        break;
      }
    }
  }

  // Build hunks from unmatched regions
  let inHunk = false;
  let contextBefore: Array<{ type: 'context'; text: string }> = [];

  for (let i = 0; i < originalLines.length; i++) {
    if (!matched[i]) {
      if (!inHunk) {
        // Start new hunk with context
        const contextStart = Math.max(0, i - maxContext);
        contextBefore = originalLines
          .slice(contextStart, i)
          .map((text) => ({ type: 'context' as const, text }));
        currentHunk = {
          startLine: contextStart + 1,
          lines: [...contextBefore],
        };
        inHunk = true;
      }
      currentHunk!.lines.push({ type: 'removed', text: originalLines[i] });
    } else {
      if (inHunk) {
        // Add a few context lines after the hunk
        const remainingContext = maxContext;
        for (
          let c = 0;
          c < remainingContext && i + c < originalLines.length;
          c++
        ) {
          currentHunk!.lines.push({
            type: 'context',
            text: originalLines[i + c],
          });
          if (!matched[i + c]) {
            // Another change nearby — continue hunk
            break;
          }
        }
        hunks.push(currentHunk!);
        currentHunk = null;
        inHunk = false;
      }
    }
  }

  if (inHunk && currentHunk) {
    hunks.push(currentHunk);
  }

  // Add additions from new lines not in original
  const additions = newLines.filter((line, idx) => !newMatched[idx]);
  if (additions.length > 0) {
    if (hunks.length > 0) {
      // Append to last hunk
      for (const line of additions) {
        hunks[hunks.length - 1].lines.push({ type: 'added', text: line });
      }
    } else {
      hunks.push({
        startLine: 1,
        lines: additions.map((text) => ({ type: 'added' as const, text })),
      });
    }
  }

  return hunks;
}

/**
 * Render an edit diff showing only changed hunks.
 * Returns diff when changes are small; returns full content otherwise.
 *
 * @param filePath - The file that was edited
 * @param originalContent - Content before edit
 * @param newContent - Content after edit
 * @returns Rendered diff string or full file
 */
export function renderEditDiff(
  filePath: string,
  originalContent: string,
  newContent: string,
): string {
  if (originalContent === newContent) {
    return `No changes in ${filePath}`;
  }

  const originalLines = originalContent.split('\n');
  const newLines = newContent.split('\n');

  // Calculate change ratio
  const changedLines = Math.abs(newLines.length - originalLines.length);
  const changeRatio = changedLines / Math.max(originalLines.length, 1);

  if (changeRatio > CHANGE_RATIO_THRESHOLD) {
    debugLogger.debug(
      `Change ratio ${(changeRatio * 100).toFixed(1)}% exceeds threshold — returning full file`,
    );
    return newContent;
  }

  const hunks = computeDiffHunks(originalLines, newLines);
  if (hunks.length === 0) {
    return newContent;
  }

  const parts: string[] = [`Edit: ${filePath}`];

  for (const hunk of hunks) {
    parts.push(`@@ Line ${hunk.startLine}`);
    for (const line of hunk.lines) {
      const prefix =
        line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';
      parts.push(`${prefix} ${line.text}`);
    }
  }

  return parts.join('\n');
}
