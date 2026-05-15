/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * Bidirectional notification reply daemon.
 * Receives replies from Telegram/Discord/Slack and injects them
 * into the active session as user messages.
 */

import { createDebugLogger } from '../utils/debugLogger.js';

const debugLogger = createDebugLogger('REPLY_DAEMON');

/** Configuration for a reply channel. */
export interface ReplyChannelConfig {
  /** Channel type. */
  type: 'telegram' | 'discord' | 'slack';
  /** Channel-specific credentials. */
  credentials: Record<string, string>;
  /** Whether this channel is enabled. */
  enabled: boolean;
}

/** A reply received from a notification channel. */
export interface ReplyMessage {
  /** Channel type that sent the reply. */
  channel: 'telegram' | 'discord' | 'slack';
  /** The reply text. */
  text: string;
  /** Sender identifier. */
  senderId: string;
  /** Timestamp of the reply. */
  timestamp: number;
  /** Session ID this reply is for. */
  sessionId: string;
}

/** Callback for when a reply is received. */
export type ReplyCallback = (reply: ReplyMessage) => void;

/**
 * Reply daemon that polls for replies from notification channels.
 * Runs in the background and invokes the callback when a reply arrives.
 */
export class ReplyDaemon {
  private readonly channels: ReplyChannelConfig[] = [];
  private readonly callback: ReplyCallback;
  private running = false;
  private pollInterval?: ReturnType<typeof setInterval>;

  constructor(channels: ReplyChannelConfig[], callback: ReplyCallback) {
    this.channels = channels.filter((c) => c.enabled);
    this.callback = callback;
  }

  /**
   * Start polling for replies.
   * @param intervalMs - Poll interval in milliseconds (default 5000)
   */
  start(intervalMs = 5000): void {
    if (this.running) return;
    this.running = true;

    debugLogger.info(
      `Starting reply daemon for ${this.channels.length} channel(s)`,
    );

    this.pollInterval = setInterval(() => {
      this.poll().catch((err) => {
        debugLogger.warn(`Poll error: ${err}`);
      });
    }, intervalMs);
  }

  /** Stop polling for replies. */
  stop(): void {
    if (!this.running) return;
    this.running = false;

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = undefined;
    }

    debugLogger.info('Reply daemon stopped');
  }

  /** Check if the daemon is running. */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Poll all channels for new replies.
   * In production, each channel type would have its own polling logic.
   */
  private async poll(): Promise<void> {
    for (const channel of this.channels) {
      try {
        const replies = await this.pollChannel(channel);
        for (const reply of replies) {
          debugLogger.info(
            `Reply from ${channel.type}: "${reply.text.slice(0, 50)}"`,
          );
          this.callback(reply);
        }
      } catch (err) {
        debugLogger.warn(`Failed to poll ${channel.type}: ${err}`);
      }
    }
  }

  /**
   * Poll a single channel for replies.
   * Returns an array of new replies since the last poll.
   */
  private async pollChannel(
    channel: ReplyChannelConfig,
  ): Promise<ReplyMessage[]> {
    switch (channel.type) {
      case 'telegram':
        return this.pollTelegram(channel.credentials);
      case 'discord':
        return this.pollDiscord(channel.credentials);
      case 'slack':
        return this.pollSlack(channel.credentials);
      default:
        return [];
    }
  }

  /** Poll Telegram for replies via getUpdates. */
  private async pollTelegram(
    _creds: Record<string, string>,
  ): Promise<ReplyMessage[]> {
    // Placeholder: in production, use Telegram Bot API getUpdates
    debugLogger.debug('Telegram poll (stub)');
    return [];
  }

  /** Poll Discord for replies via WebSocket gateway. */
  private async pollDiscord(
    _creds: Record<string, string>,
  ): Promise<ReplyMessage[]> {
    // Placeholder: in production, use Discord.js or gateway WebSocket
    debugLogger.debug('Discord poll (stub)');
    return [];
  }

  /** Poll Slack for replies via Web API. */
  private async pollSlack(
    _creds: Record<string, string>,
  ): Promise<ReplyMessage[]> {
    // Placeholder: in production, use Slack Web API conversations.history
    debugLogger.debug('Slack poll (stub)');
    return [];
  }
}
