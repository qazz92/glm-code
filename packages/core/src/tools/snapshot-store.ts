/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * Content-addressable snapshot store.
 * Records before/after SHA for every edit step with dedup storage.
 * Blobs stored at ~/.glm/snapshots/XX/XXXX... (first 2 hex chars as dir).
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Storage } from '../config/storage.js';
import { createDebugLogger } from '../utils/debugLogger.js';

const debugLogger = createDebugLogger('SNAPSHOT_STORE');

/** Directory for snapshot blobs. */
const SNAPSHOTS_DIR_NAME = 'snapshots';

/** Metadata file for edit records. */
const EDITS_INDEX_FILE = 'edits.jsonl';

/** A single edit record. */
export interface EditRecord {
  sessionId: string;
  step: number;
  filePath: string;
  beforeHash: string;
  afterHash: string;
  timestamp: number;
}

/**
 * Content-addressable snapshot store.
 * Stores file content blobs keyed by SHA-256 hash,
 * with deduplication via hash identity.
 */
export class SnapshotStore {
  private readonly baseDir: string;
  private readonly editsPath: string;

  constructor() {
    this.baseDir = path.join(Storage.getGlobalGLMDir(), SNAPSHOTS_DIR_NAME);
    this.editsPath = path.join(this.baseDir, EDITS_INDEX_FILE);
  }

  /**
   * Store a content blob, returning its SHA-256 hash.
   * Deduplicates — if content already stored, returns existing hash.
   */
  async put(content: string): Promise<string> {
    const hash = this.hashContent(content);
    const blobPath = this.getBlobPath(hash);

    if (fs.existsSync(blobPath)) {
      return hash; // Already stored
    }

    const dir = path.dirname(blobPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(blobPath, content, 'utf-8');
    debugLogger.debug(
      `Stored blob: ${hash.slice(0, 12)}... (${content.length} chars)`,
    );

    return hash;
  }

  /**
   * Get content by hash.
   * Returns null if not found.
   */
  async get(hash: string): Promise<string | null> {
    const blobPath = this.getBlobPath(hash);
    if (!fs.existsSync(blobPath)) return null;
    return fs.readFileSync(blobPath, 'utf-8');
  }

  /**
   * Record an edit snapshot with before/after hashes.
   */
  async recordEdit(
    sessionId: string,
    step: number,
    filePath: string,
    beforeHash: string,
    afterHash: string,
  ): Promise<void> {
    const record: EditRecord = {
      sessionId,
      step,
      filePath,
      beforeHash,
      afterHash,
      timestamp: Date.now(),
    };

    // Ensure directory exists
    const dir = path.dirname(this.editsPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Append as JSONL
    fs.appendFileSync(this.editsPath, JSON.stringify(record) + '\n', 'utf-8');
    debugLogger.info(
      `Recorded edit: ${filePath} ${beforeHash.slice(0, 8)}→${afterHash.slice(0, 8)}`,
    );
  }

  /**
   * Get diff between two snapshots.
   * Returns both contents for comparison.
   */
  async getDiff(
    beforeHash: string,
    afterHash: string,
  ): Promise<{ before: string | null; after: string | null }> {
    const [before, after] = await Promise.all([
      this.get(beforeHash),
      this.get(afterHash),
    ]);
    return { before, after };
  }

  /**
   * Get recent edit records for a session.
   */
  getRecentEdits(sessionId: string, limit = 50): EditRecord[] {
    if (!fs.existsSync(this.editsPath)) return [];

    const lines = fs
      .readFileSync(this.editsPath, 'utf-8')
      .split('\n')
      .filter((line) => line.trim())
      .reverse(); // Most recent first

    const records: EditRecord[] = [];
    for (const line of lines) {
      try {
        const record = JSON.parse(line) as EditRecord;
        if (record.sessionId === sessionId) {
          records.push(record);
          if (records.length >= limit) break;
        }
      } catch {
        // Skip malformed lines
      }
    }

    return records;
  }

  /**
   * Compute SHA-256 hash of content.
   */
  private hashContent(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
  }

  /**
   * Get the file path for a blob hash.
   * Uses first 2 hex chars as directory for filesystem efficiency.
   */
  private getBlobPath(hash: string): string {
    return path.join(this.baseDir, hash.slice(0, 2), hash);
  }
}
