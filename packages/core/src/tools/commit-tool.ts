/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';
import path from 'node:path';

import type { ToolResult } from './tools.js';
import { BaseDeclarativeTool, BaseToolInvocation } from './tools.js';
import { ToolNames, ToolDisplayNames } from './tool-names.js';
import { Kind } from './tools.js';
import { createDebugLogger } from '../utils/debugLogger.js';

const debugLogger = createDebugLogger('COMMIT');

export interface CommitToolParams {
  message?: string;
  scope?: string;
  addAll?: boolean;
  splitByScope?: boolean;
  coAuthorMessage?: boolean;
}

interface DiffEntry {
  file: string;
  added: number;
  removed: number;
}

const CO_AUTHOR_TRAILER =
  '\n\nCo-authored-by: GLM Code <glm@z.ai>';

const SCOPE_GROUPS: Record<string, string[]> = {
  src: ['src/'],
  tests: ['tests/', 'test/', '__tests__/', 'spec/', '*.test.', '*.spec.'],
  docs: ['docs/', '*.md', '*.txt', '*.rst'],
};

/**
 * Run a git command via execSync, returning trimmed stdout.
 * Throws on non-zero exit.
 */
function git(args: string, cwd?: string): string {
  try {
    const result = execSync(`git ${args}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      ...(cwd ? { cwd } : {}),
    });
    return result.trim();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`git ${args} failed: ${msg}`);
  }
}

/**
 * Parse `git diff --stat` or `git diff --cached --stat` into file paths.
 */
function parseDiffStat(output: string): string[] {
  if (!output) return [];
  const lines = output.split('\n').filter(Boolean);
  // Last line is the summary "N files changed, ..."
  return lines.slice(0, -1).map((l) => l.split('|')[0].trim()).filter(Boolean);
}

/**
 * Parse `git diff --numstat` output into structured entries.
 */
function parseNumstat(output: string): DiffEntry[] {
  if (!output) return [];
  return output
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [added, removed, file] = line.split('\t');
      return {
        file,
        added: added === '-' ? 0 : parseInt(added, 10) || 0,
        removed: removed === '-' ? 0 : parseInt(removed, 10) || 0,
      };
    });
}

/**
 * Determine the conventional commit type from file paths and diff stats.
 */
function inferCommitType(entries: DiffEntry[]): string {
  const files = entries.map((e) => e.file);
  const allTests = files.every(
    (f) =>
      f.includes('.test.') ||
      f.includes('.spec.') ||
      f.includes('__tests__') ||
      f.startsWith('tests/') ||
      f.startsWith('test/'),
  );
  if (allTests) return 'test';

  const allDocs = files.every(
    (f) =>
      f.endsWith('.md') ||
      f.endsWith('.txt') ||
      f.endsWith('.rst') ||
      f.startsWith('docs/'),
  );
  if (allDocs) return 'docs';

  const hasSrc = files.some(
    (f) => f.startsWith('src/') || f.startsWith('lib/'),
  );
  const totalAdded = entries.reduce((s, e) => s + e.added, 0);
  const totalRemoved = entries.reduce((s, e) => s + e.removed, 0);

  if (totalAdded > 0 && totalRemoved === 0 && hasSrc) return 'feat';
  if (totalRemoved > totalAdded * 2 && hasSrc) return 'refactor';

  return 'chore';
}

/**
 * Determine scope from file paths — the longest common parent directory.
 */
function inferScope(files: string[]): string | undefined {
  if (files.length === 0) return undefined;
  if (files.length === 1) {
    const dir = path.dirname(files[0]);
    if (dir === '.') return undefined;
    return dir.replace(/\//g, '-');
  }
  const dirs = files.map((f) => {
    const parts = f.split('/');
    return parts.length > 1 ? parts.slice(0, -1).join('/') : '';
  });

  // Find common prefix
  const nonEmpty = dirs.filter(Boolean);
  if (nonEmpty.length === 0) return undefined;

  let prefix = nonEmpty[0];
  for (const d of nonEmpty) {
    while (!d.startsWith(prefix)) {
      prefix = prefix.slice(0, prefix.lastIndexOf('/'));
      if (!prefix) return undefined;
    }
  }
  return prefix ? prefix.replace(/\//g, '-') : undefined;
}

/**
 * Auto-generate a commit message from the diff.
 */
function autoGenerateMessage(
  entries: DiffEntry[],
  scopeOverride?: string,
): string {
  const type = inferCommitType(entries);
  const files = entries.map((e) => e.file);
  const scope = scopeOverride ?? inferScope(files) ?? '';

  // Build description from file paths
  const baseNames = files.map((f) => path.basename(f, path.extname(f)));
  const uniqueNames = [...new Set(baseNames)];
  const maxNames = 4;
  let description: string;
  if (uniqueNames.length <= maxNames) {
    description = `update ${uniqueNames.join(', ')}`;
  } else {
    description = `update ${uniqueNames.slice(0, maxNames).join(', ')} and ${uniqueNames.length - maxNames} more`;
  }

  const scopePart = scope ? `(${scope})` : '';
  return `${type}${scopePart}: ${description}`;
}

/**
 * Group files by scope (src/, tests/, docs/).
 */
function groupFilesByScope(
  files: string[],
): Map<string, string[]> {
  const groups = new Map<string, string[]>();

  for (const file of files) {
    let assigned = false;
    for (const [group, patterns] of Object.entries(SCOPE_GROUPS)) {
      if (patterns.some((p) => file.includes(p.replace('*', '')))) {
        const existing = groups.get(group) ?? [];
        existing.push(file);
        groups.set(group, existing);
        assigned = true;
        break;
      }
    }
    if (!assigned) {
      const existing = groups.get('other') ?? [];
      existing.push(file);
      groups.set('other', existing);
    }
  }
  return groups;
}

class CommitToolInvocation extends BaseToolInvocation<
  CommitToolParams,
  ToolResult
> {
  constructor(params: CommitToolParams) {
    super(params);
  }

  getDescription(): string {
    const parts: string[] = ['Commit'];
    if (this.params.message) parts.push(this.params.message);
    if (this.params.addAll) parts.push('(stage all)');
    if (this.params.splitByScope) parts.push('(split by scope)');
    return parts.join(' ');
  }

  async execute(): Promise<ToolResult> {
    try {
      // 1. Get changed and staged files
      const unstagedStat = git('diff --stat');
      const stagedStat = git('diff --cached --stat');

      const unstagedFiles = parseDiffStat(unstagedStat);
      const stagedFiles = parseDiffStat(stagedStat);

      if (unstagedFiles.length === 0 && stagedFiles.length === 0) {
        return {
          llmContent: 'Nothing to commit — no staged or unstaged changes.',
          returnDisplay: 'Nothing to commit',
        };
      }

      // 4. If addAll: stage everything
      if (this.params.addAll) {
        git('add -A');
        debugLogger.debug('Staged all changes with git add -A');
      }

      // 5. If splitByScope: commit each group separately
      if (this.params.splitByScope) {
        const allFiles = [...new Set([...unstagedFiles, ...stagedFiles])];
        const groups = groupFilesByScope(allFiles);
        const results: string[] = [];

        for (const [group, files] of groups) {
          git(`add -- ${files.map((f) => `"${f}"`).join(' ')}`);
          const numstat = git('diff --cached --numstat');
          const entries = parseNumstat(numstat);
          const msg = autoGenerateMessage(entries, group);
          const finalMsg = this.appendCoAuthor(msg);
          const hash = git(`commit -m "${finalMsg.replace(/"/g, '\\"')}"`);
          results.push(`${group}: ${hash} (${files.length} files)`);
          debugLogger.debug(`Committed ${group}: ${hash}`);
        }

        return {
          llmContent: results.join('\n'),
          returnDisplay: `Committed ${results.length} scope groups`,
        };
      }

      // 6-8. Standard single commit
      let message = this.params.message;
      if (!message) {
        const numstat = git('diff --cached --numstat') || git('diff --numstat');
        const entries = parseNumstat(numstat);
        message = autoGenerateMessage(entries, this.params.scope);
      }

      const finalMessage = this.appendCoAuthor(message);
      const hash = git(`commit -m "${finalMessage.replace(/"/g, '\\"')}"`);

      // 9. Build summary
      const allChanged = [
        ...new Set([...unstagedFiles, ...stagedFiles]),
      ];
      const summary = allChanged.join('\n');

      return {
        llmContent: `Committed ${hash}\n\nChanged files:\n${summary}`,
        returnDisplay: `Committed ${hash} (${allChanged.length} files)`,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      debugLogger.error('Commit failed:', msg);
      return {
        llmContent: `Error: ${msg}`,
        returnDisplay: `Error: ${msg}`,
        error: { message: msg },
      };
    }
  }

  private appendCoAuthor(msg: string): string {
    if (this.params.coAuthorMessage !== false) {
      return msg + CO_AUTHOR_TRAILER;
    }
    return msg;
  }
}

function getCommitToolDescription(): string {
  return `Creates git commits with auto-generated conventional commit messages.

Supports:
- Auto-generating commit messages from diff analysis (conventional commit format)
- Splitting commits by file scope (src/, tests/, docs/)
- Appending co-author trailers
- Staging all changes automatically

When no message is provided, analyzes file paths and diff stats to produce
a conventional commit message: type(scope): description`;
}

export class CommitTool extends BaseDeclarativeTool<
  CommitToolParams,
  ToolResult
> {
  static Name: string = ToolNames.COMMIT;

  constructor() {
    super(
      CommitTool.Name,
      ToolDisplayNames.COMMIT,
      getCommitToolDescription(),
      Kind.Execute,
      {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description:
              'Optional commit message. If omitted, one is auto-generated from the diff in conventional commit format.',
          },
          scope: {
            type: 'string',
            description:
              'Optional scope for the conventional commit (e.g. "core", "cli"). Overrides auto-detected scope.',
          },
          addAll: {
            type: 'boolean',
            description:
              'If true, run git add -A before committing to stage all changes.',
          },
          splitByScope: {
            type: 'boolean',
            description:
              'If true, group changed files by directory scope (src/, tests/, docs/) and create a separate commit per group.',
          },
          coAuthorMessage: {
            type: 'boolean',
            description:
              'If true (default), append "Co-authored-by: GLM Code <glm@z.ai>" to the commit message.',
          },
        },
        required: [],
      },
      false, // output is not markdown
      false, // output cannot be updated
      true, // shouldDefer — committing is infrequent
    );
  }

  protected createInvocation(
    params: CommitToolParams,
  ): BaseToolInvocation<CommitToolParams, ToolResult> {
    return new CommitToolInvocation(params);
  }
}
