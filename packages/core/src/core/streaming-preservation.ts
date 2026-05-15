/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Streaming Partial Preservation — accumulates streaming tokens and saves
 * them as a partial assistant message when the stream is interrupted.
 *
 * Usage: integrate in client.ts streaming loop. On abort/408, call
 * `preserver.cancel()` to save whatever content was received so far.
 * Partial messages are saved to session history with
 * `stopReason: 'partial_preserved'`.
 */

import { createDebugLogger } from '../utils/debugLogger.js';

const debugLogger = createDebugLogger('STREAM-PRESERVE');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PartialMessage {
  role: 'assistant';
  content: string;
  stopReason: 'partial_preserved';
  model: string;
  sessionId: string;
  preservedAt: number; // epoch ms
}

// ---------------------------------------------------------------------------
// StreamingPreserver
// ---------------------------------------------------------------------------

export class StreamingPreserver {
  private active = false;
  private sessionId = '';
  private model = '';
  private chunks: string[] = [];

  /** Start tracking a new stream. */
  beginStream(sessionId: string, model: string): void {
    this.active = true;
    this.sessionId = sessionId;
    this.model = model;
    this.chunks = [];
    debugLogger.debug(
      `beginStream session=${sessionId} model=${model}`,
    );
  }

  /** Accumulate a received chunk. */
  onChunk(chunk: string): void {
    if (!this.active) return;
    this.chunks.push(chunk);
  }

  /** Save accumulated content as a partial assistant message. */
  preserve(): PartialMessage | null {
    if (!this.active || this.chunks.length === 0) {
      return null;
    }
    const content = this.chunks.join('');
    const msg: PartialMessage = {
      role: 'assistant',
      content,
      stopReason: 'partial_preserved',
      model: this.model,
      sessionId: this.sessionId,
      preservedAt: Date.now(),
    };
    debugLogger.info(
      `Preserved ${content.length} chars of partial content for session=${this.sessionId}`,
    );
    // Reset state after preservation.
    this.active = false;
    this.chunks = [];
    return msg;
  }

  /** Whether a stream is currently being tracked. */
  isStreamActive(): boolean {
    return this.active;
  }

  /** Get the accumulated content so far without stopping the stream. */
  getPartialContent(): string {
    return this.chunks.join('');
  }

  /**
   * Cancel the stream: preserve whatever has been received so far and
   * signal that the stream is no longer active.
   */
  cancel(): PartialMessage | null {
    debugLogger.debug('cancel() called — preserving partial content');
    return this.preserve();
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _instance: StreamingPreserver | null = null;

export function getStreamingPreserver(): StreamingPreserver {
  if (!_instance) {
    _instance = new StreamingPreserver();
  }
  return _instance;
}

/** Reset singleton (tests only). */
export function _resetStreamingPreserver(): void {
  _instance = null;
}
