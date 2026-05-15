/**
 * @license
 * Copyright 2025 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * Audit log entry for yolo mode auto-approved actions.
 * Written as one JSON line per entry to ~/.glm/yolo-audit.jsonl.
 */
export interface YoloAuditFileEntry {
  /** ISO-8601 timestamp. */
  timestamp: string;
  /** Yolo tier that authorized the decision: 1=conservative, 2=moderate, 3=full. */
  tier: number;
  /** Tool name that was auto-approved (e.g. "edit", "shell", "write"). */
  tool: string;
  /** Approval decision: "auto" (approved by tier policy) or "ask" (escalated to user). */
  decision: 'auto' | 'ask';
  /** Optional file path affected by the tool invocation. */
  file?: string;
}

const AUDIT_DIR = '.glm';
const AUDIT_FILENAME = 'yolo-audit.jsonl';

/**
 * Resolve the audit log file path: ~/.glm/yolo-audit.jsonl
 */
function resolveAuditFilePath(): string {
  return path.join(os.homedir(), AUDIT_DIR, AUDIT_FILENAME);
}

/** Ensure the audit directory exists. Idempotent. */
function ensureAuditDir(): void {
  const dir = path.join(os.homedir(), AUDIT_DIR);
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // Directory likely already exists or is not creatable; append will surface the error.
  }
}

/**
 * Append a single audit entry to ~/.glm/yolo-audit.jsonl.
 *
 * Each call writes exactly one line in append mode. Failures are swallowed
 * so that audit I/O never blocks or crashes the host process.
 */
export function appendYoloAudit(entry: YoloAuditFileEntry): void {
  try {
    ensureAuditDir();
    const line = JSON.stringify(entry) + '\n';
    fs.appendFileSync(resolveAuditFilePath(), line, 'utf8');
  } catch {
    // Audit logging is best-effort. Never block tool execution.
  }
}
