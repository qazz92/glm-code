/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * Notification system — sends alerts via Telegram, Discord, Slack.
 */

import { createDebugLogger } from '../utils/debugLogger.js';

const debugLogger = createDebugLogger('notifier');

export interface NotificationConfig {
  telegram?: { botToken: string; chatId: string };
  discord?: { webhookUrl: string };
  slack?: { webhookUrl: string };
}

export interface NotificationPayload {
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'error' | 'success';
}

/**
 * Send a notification to all configured channels.
 */
export async function sendNotification(
  config: NotificationConfig,
  payload: NotificationPayload,
): Promise<void> {
  const emoji = { info: 'ℹ️', warning: '⚠️', error: '❌', success: '✅' }[payload.severity];
  const text = `${emoji} **${payload.title}**\n${payload.message}`;

  const promises: Promise<void>[] = [];

  if (config.telegram) {
    promises.push(sendTelegram(config.telegram.botToken, config.telegram.chatId, text));
  }
  if (config.discord) {
    promises.push(sendDiscord(config.discord.webhookUrl, payload));
  }
  if (config.slack) {
    promises.push(sendSlack(config.slack.webhookUrl, payload));
  }

  await Promise.allSettled(promises);
}

async function sendTelegram(botToken: string, chatId: string, text: string): Promise<void> {
  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    });
    if (!resp.ok) {
      debugLogger.warn(`Telegram notification failed: ${resp.status}`);
    }
  } catch (err) {
    debugLogger.warn('Telegram notification error:', err);
  }
}

async function sendDiscord(webhookUrl: string, payload: NotificationPayload): Promise<void> {
  try {
    const color = { info: 0x3498db, warning: 0xf39c12, error: 0xe74c3c, success: 0x2ecc71 }[payload.severity];
    const resp = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{ title: payload.title, description: payload.message, color }],
      }),
    });
    if (!resp.ok) {
      debugLogger.warn(`Discord notification failed: ${resp.status}`);
    }
  } catch (err) {
    debugLogger.warn('Discord notification error:', err);
  }
}

async function sendSlack(webhookUrl: string, payload: NotificationPayload): Promise<void> {
  try {
    const resp = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `[${payload.severity.toUpperCase()}] ${payload.title}: ${payload.message}`,
      }),
    });
    if (!resp.ok) {
      debugLogger.warn(`Slack notification failed: ${resp.status}`);
    }
  } catch (err) {
    debugLogger.warn('Slack notification error:', err);
  }
}
