/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  fnv1a,
  parseAnchors,
  generateAnchor,
  containsAnchors,
  applyAnchorEdits,
  type AnchorEditOp,
} from './hashline-edit.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// fnv1a
// ---------------------------------------------------------------------------

describe('fnv1a', () => {
  it('produces a 6-char base36 string', () => {
    const h = fnv1a('hello');
    expect(h).toHaveLength(6);
    expect(h).toMatch(/^[a-z0-9]{6}$/);
  });

  it('is deterministic', () => {
    expect(fnv1a('hello')).toBe(fnv1a('hello'));
  });

  it('produces different hashes for different inputs', () => {
    expect(fnv1a('hello')).not.toBe(fnv1a('world'));
  });

  it('handles empty string', () => {
    const h = fnv1a('');
    expect(h).toHaveLength(6);
    expect(h).toMatch(/^[a-z0-9]{6}$/);
  });

  it('handles unicode', () => {
    const h = fnv1a('こんにちは');
    expect(h).toHaveLength(6);
  });
});

// ---------------------------------------------------------------------------
// parseAnchors
// ---------------------------------------------------------------------------

describe('parseAnchors', () => {
  it('parses anchor lines', () => {
    const h1 = fnv1a('hello');
    const h2 = fnv1a('world');
    const h3 = fnv1a('foo');
    const content = `1${h1}|hello\n2${h2}|world\n3${h3}|foo`;
    const anchors = parseAnchors(content);
    expect(anchors.size).toBe(3);
    expect(anchors.get(1)).toEqual({ hash: h1, text: 'hello' });
    expect(anchors.get(2)).toEqual({ hash: h2, text: 'world' });
    expect(anchors.get(3)).toEqual({ hash: h3, text: 'foo' });
  });

  it('ignores non-anchor lines', () => {
    const h = fnv1a('anchored');
    const content = `just a line\n42${h}|anchored\nanother line`;
    const anchors = parseAnchors(content);
    expect(anchors.size).toBe(1);
    expect(anchors.get(42)).toEqual({ hash: h, text: 'anchored' });
  });

  it('returns empty map for no anchors', () => {
    expect(parseAnchors('no anchors\nhere').size).toBe(0);
  });

  it('handles empty content', () => {
    expect(parseAnchors('').size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// generateAnchor
// ---------------------------------------------------------------------------

describe('generateAnchor', () => {
  it('produces LINE+HASH|TEXT format', () => {
    const anchor = generateAnchor(42, 'some text');
    expect(anchor).toBe(`42${fnv1a('some text')}|some text`);
  });

  it('is consistent with parseAnchors', () => {
    const anchor = generateAnchor(10, 'test line');
    const parsed = parseAnchors(anchor);
    expect(parsed.get(10)).toEqual({
      hash: fnv1a('test line'),
      text: 'test line',
    });
  });
});

// ---------------------------------------------------------------------------
// containsAnchors
// ---------------------------------------------------------------------------

describe('containsAnchors', () => {
  it('detects anchor lines', () => {
    expect(containsAnchors(generateAnchor(42, 'hello'))).toBe(true);
  });

  it('detects anchors among mixed content', () => {
    expect(containsAnchors(`some text\n${generateAnchor(10, 'foo')}\nmore text`)).toBe(true);
  });

  it('returns false for plain text', () => {
    expect(containsAnchors('just regular text\nno anchors')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(containsAnchors('')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyAnchorEdits
// ---------------------------------------------------------------------------

function tmpFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hashline-test-'));
  const file = path.join(dir, 'test.txt');
  return file;
}

function cleanup(file: string): void {
  try {
    fs.rmSync(path.dirname(file), { recursive: true });
  } catch {
    // ignore
  }
}

describe('applyAnchorEdits', () => {
  it('replaces an anchor line', () => {
    const file = tmpFile();
    try {
      const original = [
        generateAnchor(1, 'line one'),
        generateAnchor(2, 'line two'),
        generateAnchor(3, 'line three'),
      ].join('\n') + '\n';
      fs.writeFileSync(file, original, 'utf-8');

      const ops: AnchorEditOp[] = [
        {
          type: 'replace',
          line: 2,
          hash: fnv1a('line two'),
          oldText: 'line two',
          newText: 'LINE TWO CHANGED',
        },
      ];

      const result = applyAnchorEdits(file, ops);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const lines = result.content.split('\n').filter(Boolean);
      expect(lines[1]).toContain('LINE TWO CHANGED');
    } finally {
      cleanup(file);
    }
  });

  it('detects hash mismatch', () => {
    const file = tmpFile();
    try {
      const original = generateAnchor(1, 'original') + '\n';
      fs.writeFileSync(file, original, 'utf-8');

      const ops: AnchorEditOp[] = [
        {
          type: 'replace',
          line: 1,
          hash: 'badhas',
          oldText: 'original',
          newText: 'changed',
        },
      ];

      const result = applyAnchorEdits(file, ops);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Hash mismatch');
        expect(result.expectedHash).toBe('badhas');
      }
    } finally {
      cleanup(file);
    }
  });

  it('inserts after an anchor', () => {
    const file = tmpFile();
    try {
      const original = [
        generateAnchor(1, 'first'),
        generateAnchor(2, 'second'),
      ].join('\n') + '\n';
      fs.writeFileSync(file, original, 'utf-8');

      const ops: AnchorEditOp[] = [
        {
          type: 'insert_after',
          line: 1,
          hash: fnv1a('first'),
          lines: ['inserted line'],
        },
      ];

      const result = applyAnchorEdits(file, ops);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const lines = result.content.split('\n').filter(Boolean);
      // Original: [anchor1, anchor2], after insert: [anchor1, inserted, anchor2]
      expect(lines).toHaveLength(3);
      expect(lines[1]).toBe('inserted line');
    } finally {
      cleanup(file);
    }
  });

  it('deletes a range of anchors', () => {
    const file = tmpFile();
    try {
      const original = [
        generateAnchor(1, 'first'),
        generateAnchor(2, 'second'),
        generateAnchor(3, 'third'),
      ].join('\n') + '\n';
      fs.writeFileSync(file, original, 'utf-8');

      const ops: AnchorEditOp[] = [
        {
          type: 'delete',
          startLine: 2,
          endLine: 2,
        },
      ];

      const result = applyAnchorEdits(file, ops);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const lines = result.content.split('\n').filter(Boolean);
      expect(lines).toHaveLength(2);
      expect(lines[0]).toContain('first');
      expect(lines[1]).toContain('third');
    } finally {
      cleanup(file);
    }
  });

  it('replaces a range', () => {
    const file = tmpFile();
    try {
      const original = [
        generateAnchor(1, 'first'),
        generateAnchor(2, 'second'),
        generateAnchor(3, 'third'),
      ].join('\n') + '\n';
      fs.writeFileSync(file, original, 'utf-8');

      const ops: AnchorEditOp[] = [
        {
          type: 'replace_range',
          startLine: 2,
          startHash: fnv1a('second'),
          endLine: 3,
          endHash: fnv1a('third'),
          newLines: ['replacement a', 'replacement b'],
        },
      ];

      const result = applyAnchorEdits(file, ops);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const lines = result.content.split('\n').filter(Boolean);
      expect(lines).toHaveLength(3);
      expect(lines[0]).toContain('first');
      expect(lines[1]).toBe('replacement a');
      expect(lines[2]).toBe('replacement b');
    } finally {
      cleanup(file);
    }
  });

  it('fails on missing file', () => {
    const result = applyAnchorEdits('/nonexistent/path/file.txt', [
      {
        type: 'replace',
        line: 1,
        hash: 'abc',
        oldText: 'x',
        newText: 'y',
      },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Failed to read file');
    }
  });

  it('fails when anchor not found', () => {
    const file = tmpFile();
    try {
      fs.writeFileSync(file, 'plain content\n', 'utf-8');

      const result = applyAnchorEdits(file, [
        {
          type: 'replace',
          line: 99,
          hash: 'abc',
          oldText: 'x',
          newText: 'y',
        },
      ]);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('No anchor found');
      }
    } finally {
      cleanup(file);
    }
  });
});
