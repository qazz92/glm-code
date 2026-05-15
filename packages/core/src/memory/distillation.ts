/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * Distillation scheduler — periodically summarizes session turns into
 * reusable insights persisted to the memory bank.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { createDebugLogger } from '../utils/debugLogger.js';

const debugLogger = createDebugLogger('DISTILLATION');

const DEFAULT_INTERVAL_MS = 3_600_000; // 60 minutes
const MAX_TURNS = 10;
const MAX_LINES = 200;
const MAX_BYTES = 25 * 1024; // 25 KB
const INSIGHTS_MIN = 3;
const INSIGHTS_MAX = 5;

const DISTILLATION_PROMPT = `Summarize the key findings from this session. Extract ${INSIGHTS_MIN}-${INSIGHTS_MAX} reusable insights as bullet points. Each insight should be actionable and generalizable beyond this specific session. Focus on patterns, gotchas, and non-obvious discoveries.`;

interface TurnSummary {
  role: string;
  content: string;
}

export interface DistillationResult {
  insights: string[];
  filePath: string;
}

/**
 * Periodic distillation scheduler. Summarizes recent turn history into
 * reusable insights appended to a date-stamped file in the memory bank.
 *
 * Usage:
 *   const scheduler = new DistillationScheduler(llmClient);
 *   scheduler.start(sessionId);
 *   // ... later ...
 *   scheduler.stop();
 */
export class DistillationScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly getTurnSummaries: () => TurnSummary[];
  private readonly callLlm: (prompt: string) => Promise<string>;
  private readonly sessionId: string;

  /**
   * @param sessionId - Current session identifier for file naming.
   * @param getTurnSummaries - Callback that returns recent turn summaries.
   * @param callLlm - Callback that makes an LLM call and returns text.
   */
  constructor(
    sessionId: string,
    getTurnSummaries: () => TurnSummary[],
    callLlm: (prompt: string) => Promise<string>,
  ) {
    this.sessionId = sessionId;
    this.getTurnSummaries = getTurnSummaries;
    this.callLlm = callLlm;
  }

  /**
   * Start the periodic distillation timer.
   * @param intervalMs - Interval in milliseconds (default 60 min).
   */
  start(intervalMs: number = DEFAULT_INTERVAL_MS): void {
    if (this.timer !== null) {
      debugLogger.warn('DistillationScheduler already running');
      return;
    }
    debugLogger.info(
      `Starting distillation scheduler (every ${intervalMs / 1000}s)`,
    );
    this.timer = setInterval(() => {
      this.triggerDistillation().catch((err: unknown) => {
        debugLogger.error('Distillation failed:', err);
      });
    }, intervalMs);
    // Don't prevent process exit
    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  /** Stop the periodic timer. */
  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
      debugLogger.info('Distillation scheduler stopped');
    }
  }

  /** Whether the scheduler is currently active. */
  get isRunning(): boolean {
    return this.timer !== null;
  }

  /**
   * Run one distillation cycle:
   *  1. Collect last N turn summaries
   *  2. Call LLM for insight extraction
   *  3. Parse response
   *  4. Append to date-stamped file with frontmatter
   *  5. Enforce size cap
   */
  async triggerDistillation(): Promise<DistillationResult | null> {
    const turns = this.getTurnSummaries().slice(-MAX_TURNS);
    if (turns.length === 0) {
      debugLogger.debug('No turns to distill');
      return null;
    }

    const turnText = turns
      .map((t) => `[${t.role}]: ${t.content}`)
      .join('\n\n');

    debugLogger.info(
      `Distilling ${turns.length} turns for session ${this.sessionId}`,
    );

    const prompt = `${DISTILLATION_PROMPT}\n\n---\nSession turns:\n\n${turnText}`;
    const response = await this.callLlm(prompt);
    const insights = parseInsights(response);

    if (insights.length === 0) {
      debugLogger.warn('No insights extracted from LLM response');
      return null;
    }

    const filePath = await getDistillationFilePath();
    const entry = formatEntry(insights, this.sessionId);

    await appendWithCap(filePath, entry, MAX_LINES, MAX_BYTES);

    debugLogger.info(
      `Distilled ${insights.length} insights to ${filePath}`,
    );

    return { insights, filePath };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDistillationDir(): string {
  const home = os.homedir() || os.tmpdir();
  const base = process.env['GLM_HOME']
    ? path.resolve(process.env['GLM_HOME'])
    : path.join(home, '.glm');
  return path.join(base, 'memory', 'bank');
}

async function getDistillationFilePath(): Promise<string> {
  const dir = getDistillationDir();
  await fs.mkdir(dir, { recursive: true });
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return path.join(dir, `distillation-${date}.md`);
}

function formatEntry(insights: string[], sessionId: string): string {
  const now = new Date().toISOString();
  const frontmatter = [
    '---',
    `session: "${sessionId}"`,
    `created: "${now}"`,
    `insights: ${insights.length}`,
    '---',
  ].join('\n');

  const bullets = insights.map((i) => `- ${i}`).join('\n');
  return `${frontmatter}\n\n${bullets}\n\n`;
}

function parseInsights(text: string): string[] {
  const lines = text.split('\n');
  const insights: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      insights.push(trimmed.slice(2).trim());
    } else if (/^\d+\.\s/.test(trimmed)) {
      insights.push(trimmed.replace(/^\d+\.\s/, '').trim());
    }
    if (insights.length >= INSIGHTS_MAX) break;
  }
  return insights;
}

/**
 * Append content to a file, then enforce a line/byte cap by truncating
 * oldest entries (separated by `---` frontmatter blocks).
 */
async function appendWithCap(
  filePath: string,
  entry: string,
  maxLines: number,
  maxBytes: number,
): Promise<void> {
  let existing = '';
  try {
    existing = await fs.readFile(filePath, 'utf-8');
  } catch {
    // File doesn't exist yet — fine.
  }

  const combined = existing + entry;
  const enforced = enforceCap(combined, maxLines, maxBytes);
  await fs.writeFile(filePath, enforced, 'utf-8');
}

function enforceCap(content: string, maxLines: number, maxBytes: number): string {
  // Check byte cap first
  if (Buffer.byteLength(content, 'utf-8') <= maxBytes) {
    // Check line cap
    const lines = content.split('\n');
    if (lines.length <= maxLines) {
      return content;
    }
  }

  // Split by entry boundaries (frontmatter `---` lines)
  const entries: string[] = [];
  let current = '';
  let inFrontmatter = false;
  let fmCount = 0;

  for (const line of content.split('\n')) {
    if (line === '---') {
      fmCount++;
      if (fmCount === 1) {
        // Start of frontmatter
        inFrontmatter = true;
        current = line + '\n';
        continue;
      } else if (fmCount === 2 && inFrontmatter) {
        // End of frontmatter
        inFrontmatter = false;
        current += line + '\n';
        continue;
      }
    }

    if (!inFrontmatter && fmCount >= 2 && line === '---') {
      // New entry starting
      if (current.trim()) {
        entries.push(current);
      }
      current = '---\n';
      fmCount = 1;
      inFrontmatter = true;
      continue;
    }

    current += line + '\n';
  }
  if (current.trim()) {
    entries.push(current);
  }

  // Remove oldest entries until under caps
  while (entries.length > 1) {
    const joined = entries.join('\n');
    const lines = joined.split('\n');
    if (
      lines.length <= maxLines &&
      Buffer.byteLength(joined, 'utf-8') <= maxBytes
    ) {
      break;
    }
    entries.shift();
  }

  return entries.join('\n');
}
