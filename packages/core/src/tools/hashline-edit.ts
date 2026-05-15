/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import { createDebugLogger } from '../utils/debugLogger.js';

const log = createDebugLogger('HASHLINE_EDIT');

// ---------------------------------------------------------------------------
// FNV-1a hash — fast non-crypto hash producing a 6-char base36 ID.
// ---------------------------------------------------------------------------

export function fnv1a(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // Mask to 6 base36 digits max (36^6 - 1 = 2176782335)
  const masked = (hash >>> 0) % 2176782336;
  const raw = masked.toString(36).padStart(6, '0');
  // Ensure first character is a letter so that LINE+HASH is unambiguous
  // when concatenated (digits belong to line number, letters start the hash).
  const first = raw.charCodeAt(0);
  const c = first >= 48 && first <= 57 // '0'-'9'
    ? String.fromCharCode(first - 48 + 97) // map 0→a, 1→b, ..., 9→j
    : raw[0];
  return c + raw.slice(1);
}

// ---------------------------------------------------------------------------
// Anchor types
// ---------------------------------------------------------------------------

export interface Anchor {
  hash: string;
  text: string;
}

// ---------------------------------------------------------------------------
// parseAnchors — extract LINE+HASH|TEXT anchors from file content
// ---------------------------------------------------------------------------

const ANCHOR_RE = /^(\d+)([a-z][a-z0-9]{5})\|(.*)$/;

export function parseAnchors(content: string): Map<number, Anchor> {
  const map = new Map<number, Anchor>();
  const lines = content.split('\n');
  for (const line of lines) {
    const m = ANCHOR_RE.exec(line);
    if (m) {
      const lineNum = Number(m[1]);
      map.set(lineNum, { hash: m[2], text: m[3] });
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// generateAnchor — produce a LINE+HASH|TEXT anchor string
// ---------------------------------------------------------------------------

export function generateAnchor(line: number, text: string): string {
  return `${line}${fnv1a(text)}|${text}`;
}

// ---------------------------------------------------------------------------
// Edit operations
// ---------------------------------------------------------------------------

export interface ReplaceAnchorOp {
  type: 'replace';
  line: number;
  hash: string;
  oldText: string;
  newText: string;
}

export interface InsertAfterAnchorOp {
  type: 'insert_after';
  line: number;
  hash: string;
  lines: string[];
}

export interface DeleteAnchorsOp {
  type: 'delete';
  startLine: number;
  endLine: number;
}

export interface ReplaceRangeOp {
  type: 'replace_range';
  startLine: number;
  startHash: string;
  endLine: number;
  endHash: string;
  newLines: string[];
}

export type AnchorEditOp =
  | ReplaceAnchorOp
  | InsertAfterAnchorOp
  | DeleteAnchorsOp
  | ReplaceRangeOp;

export interface AnchorEdit {
  filePath: string;
  ops: AnchorEditOp[];
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface EditResultOk {
  ok: true;
  content: string;
}

export interface EditResultErr {
  ok: false;
  error: string;
  line?: number;
  expectedHash?: string;
  actualHash?: string;
}

export type EditResult = EditResultOk | EditResultErr;

// ---------------------------------------------------------------------------
// Anchor detection helper — used by edit.ts to route hashline mode
// ---------------------------------------------------------------------------

const ANCHOR_LINE_RE = /^\d+[a-z][a-z0-9]{5}\|/;

/**
 * Returns true when `text` contains at least one line matching the
 * LINE+HASH|TEXT anchor pattern. Used to decide whether the edit tool
 * should enter hashline mode.
 */
export function containsAnchors(text: string): boolean {
  const lines = text.split('\n');
  for (const line of lines) {
    if (ANCHOR_LINE_RE.test(line)) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// applyAnchorEdits — apply anchor-based edits to a file
// ---------------------------------------------------------------------------

export function applyAnchorEdits(
  filePath: string,
  edits: AnchorEditOp[],
): EditResult {
  // Read file
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn('read failed', { path: filePath, error: msg });
    return { ok: false, error: `Failed to read file: ${msg}` };
  }

  const lines = raw.split('\n');
  // Preserve trailing newline invariant
  const trailingNewline = raw.endsWith('\n');
  if (trailingNewline && lines[lines.length - 1] === '') {
    lines.pop();
  }

  // Parse anchors from current content
  const anchors = new Map<number, Anchor>();
  for (let i = 0; i < lines.length; i++) {
    const m = ANCHOR_RE.exec(lines[i]);
    if (m) {
      const lineNum = Number(m[1]);
      anchors.set(lineNum, { hash: m[2], text: m[3] });
    }
  }

  // Verify & collect mutations; apply in reverse line order
  interface Mutation {
    startLine: number; // 0-based index in `lines`
    endLine: number; // inclusive
    replacement: string[];
  }

  const mutations: Mutation[] = [];

  for (const op of edits) {
    switch (op.type) {
      case 'replace': {
        const anchor = anchors.get(op.line);
        if (!anchor) {
          return {
            ok: false,
            error: `No anchor found at line ${op.line}`,
            line: op.line,
          };
        }
        if (anchor.hash !== op.hash) {
          const actual = fnv1a(anchor.text);
          return {
            ok: false,
            error: `Hash mismatch at line ${op.line}: expected ${op.hash}, file has ${actual}`,
            line: op.line,
            expectedHash: op.hash,
            actualHash: actual,
          };
        }
        // Find 0-based index: the line number in anchors is 1-based.
        // Scan lines array for a line whose anchor matches.
        let idx = -1;
        for (let i = 0; i < lines.length; i++) {
          const m = ANCHOR_RE.exec(lines[i]);
          if (m && Number(m[1]) === op.line && m[2] === op.hash) {
            idx = i;
            break;
          }
        }
        if (idx === -1) {
          return {
            ok: false,
            error: `Anchor line ${op.line} not found in file content`,
            line: op.line,
          };
        }
        mutations.push({
          startLine: idx,
          endLine: idx,
          replacement: [generateAnchor(op.line, op.newText)],
        });
        break;
      }

      case 'insert_after': {
        const anchor = anchors.get(op.line);
        if (!anchor) {
          return {
            ok: false,
            error: `No anchor found at line ${op.line}`,
            line: op.line,
          };
        }
        if (anchor.hash !== op.hash) {
          const actual = fnv1a(anchor.text);
          return {
            ok: false,
            error: `Hash mismatch at line ${op.line}: expected ${op.hash}, file has ${actual}`,
            line: op.line,
            expectedHash: op.hash,
            actualHash: actual,
          };
        }
        let idx = -1;
        for (let i = 0; i < lines.length; i++) {
          const m = ANCHOR_RE.exec(lines[i]);
          if (m && Number(m[1]) === op.line && m[2] === op.hash) {
            idx = i;
            break;
          }
        }
        if (idx === -1) {
          return {
            ok: false,
            error: `Anchor line ${op.line} not found in file content`,
            line: op.line,
          };
        }
        mutations.push({
          startLine: idx + 1,
          endLine: idx, // insert: no deletion, endLine < startLine
          replacement: op.lines,
        });
        break;
      }

      case 'delete': {
        // Find the 0-based range covering startLine..endLine (anchor line numbers)
        let startIdx = -1;
        let endIdx = -1;
        for (let i = 0; i < lines.length; i++) {
          const m = ANCHOR_RE.exec(lines[i]);
          if (m) {
            const ln = Number(m[1]);
            if (ln === op.startLine) startIdx = i;
            if (ln === op.endLine) endIdx = i;
          }
        }
        if (startIdx === -1 || endIdx === -1) {
          return {
            ok: false,
            error: `Delete range ${op.startLine}-${op.endLine}: anchor not found`,
          };
        }
        mutations.push({
          startLine: startIdx,
          endLine: endIdx,
          replacement: [],
        });
        break;
      }

      case 'replace_range': {
        let startIdx = -1;
        let endIdx = -1;
        for (let i = 0; i < lines.length; i++) {
          const m = ANCHOR_RE.exec(lines[i]);
          if (m) {
            const ln = Number(m[1]);
            const h = m[2];
            if (ln === op.startLine && h === op.startHash) startIdx = i;
            if (ln === op.endLine && h === op.endHash) endIdx = i;
          }
        }
        if (startIdx === -1) {
          return {
            ok: false,
            error: `Replace range start anchor not found: line ${op.startLine} hash ${op.startHash}`,
            line: op.startLine,
          };
        }
        if (endIdx === -1) {
          return {
            ok: false,
            error: `Replace range end anchor not found: line ${op.endLine} hash ${op.endHash}`,
            line: op.endLine,
          };
        }
        mutations.push({
          startLine: startIdx,
          endLine: endIdx,
          replacement: op.newLines,
        });
        break;
      }
    }
  }

  // Sort mutations in reverse line order to preserve indices
  mutations.sort((a, b) => b.startLine - a.startLine);

  for (const mut of mutations) {
    if (mut.startLine > mut.endLine) {
      // Insert operation (startLine = idx+1, endLine = idx)
      const before = lines.slice(0, mut.startLine);
      const after = lines.slice(mut.startLine);
      lines.length = 0;
      lines.push(...before, ...mut.replacement, ...after);
    } else {
      // Replace or delete
      const before = lines.slice(0, mut.startLine);
      const after = lines.slice(mut.endLine + 1);
      lines.length = 0;
      lines.push(...before, ...mut.replacement, ...after);
    }
  }

  let result = lines.join('\n');
  if (trailingNewline) result += '\n';

  try {
    fs.writeFileSync(filePath, result, 'utf-8');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn('write failed', { path: filePath, error: msg });
    return { ok: false, error: `Failed to write file: ${msg}` };
  }

  return { ok: true, content: result };
}
