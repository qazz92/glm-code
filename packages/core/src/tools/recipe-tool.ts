/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import type { ToolResult } from './tools.js';
import { BaseDeclarativeTool, BaseToolInvocation } from './tools.js';
import { ToolNames, ToolDisplayNames } from './tool-names.js';
import { Kind } from './tools.js';
import { createDebugLogger } from '../utils/debugLogger.js';

const debugLogger = createDebugLogger('RECIPE');

export interface RecipeToolParams {
  action: 'detect' | 'run' | 'list';
  target?: string;
  args?: string[];
}

export type RunnerKind =
  | 'pnpm'
  | 'yarn'
  | 'npm'
  | 'cargo'
  | 'make'
  | 'just'
  | 'go'
  | 'bazel';

interface RunnerInfo {
  runner: RunnerKind;
}

/**
 * Run a shell command, returning trimmed stdout. Returns null on failure.
 */
function shell(cmd: string, cwd?: string): string | null {
  try {
    const result = execSync(cmd, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      ...(cwd ? { cwd } : {}),
    });
    return result.trim();
  } catch {
    return null;
  }
}

/**
 * Detect which build/task runner is present in the given directory.
 */
export function detectRunner(cwd: string): RunnerInfo | null {
  const hasFile = (name: string) => fs.existsSync(path.join(cwd, name));

  // Priority order: lock-file specificity wins
  if (hasFile('package.json') && hasFile('pnpm-lock.yaml')) {
    return { runner: 'pnpm' };
  }
  if (hasFile('package.json') && hasFile('yarn.lock')) {
    return { runner: 'yarn' };
  }
  if (hasFile('package.json')) {
    return { runner: 'npm' };
  }
  if (hasFile('Cargo.toml')) {
    return { runner: 'cargo' };
  }
  if (hasFile('Makefile') || hasFile('GNUmakefile')) {
    return { runner: 'make' };
  }
  if (hasFile('justfile') || hasFile('Justfile')) {
    return { runner: 'just' };
  }
  if (hasFile('go.mod')) {
    return { runner: 'go' };
  }
  if (hasFile('WORKSPACE') || hasFile('WORKSPACE.bazel')) {
    return { runner: 'bazel' };
  }
  return null;
}

/**
 * Build the command string for a given runner/target/args combo.
 */
function buildCommand(
  runner: RunnerKind,
  target: string,
  args?: string[],
): string {
  const argStr = args?.length ? ` ${args.join(' ')}` : '';
  switch (runner) {
    case 'pnpm':
    case 'yarn':
    case 'npm':
      return `${runner} run ${target}${argStr ? ` --${argStr}` : ''}`;
    case 'cargo':
      return `cargo ${target}${argStr}`;
    case 'make':
      return `make ${target}${args?.length ? ` ARGS='${args.join(' ')}'` : ''}`;
    case 'just':
      return `just ${target}${argStr}`;
    case 'go':
      return `go ${target}${argStr}`;
    case 'bazel':
      return `bazel ${target}${argStr}`;
  }
}

/**
 * List available targets for the given runner.
 */
function listTargets(runner: RunnerKind, cwd: string): string[] {
  switch (runner) {
    case 'pnpm':
    case 'yarn':
    case 'npm': {
      const pkgPath = path.join(cwd, 'package.json');
      try {
        const raw = fs.readFileSync(pkgPath, 'utf-8');
        const pkg = JSON.parse(raw) as { scripts?: Record<string, string> };
        return Object.keys(pkg.scripts ?? {});
      } catch {
        return [];
      }
    }
    case 'cargo': {
      const output = shell('cargo --list', cwd);
      if (!output) return [];
      return output
        .split('\n')
        .slice(1) // skip header
        .map((l) => l.trim().split(/\s+/)[0])
        .filter(Boolean);
    }
    case 'make': {
      const output = shell('make -pq', cwd);
      if (!output) return [];
      const targets = new Set<string>();
      for (const line of output.split('\n')) {
        const match = line.match(/^([a-zA-Z0-9_.-]+)\s*:/);
        if (match && !match[1].includes('.')) {
          targets.add(match[1]);
        }
      }
      return [...targets];
    }
    case 'just': {
      const output = shell('just --list', cwd);
      if (!output) return [];
      return output
        .split('\n')
        .slice(1) // skip "Available recipes:" header
        .map((l) => l.trim().split(/\s+/)[0])
        .filter(Boolean);
    }
    case 'go':
      return ['build', 'test', 'run', 'vet', 'fmt'];
    case 'bazel':
      return ['build', 'test', 'run', 'query', 'coverage'];
  }
}

class RecipeToolInvocation extends BaseToolInvocation<
  RecipeToolParams,
  ToolResult
> {
  private cwd: string;

  constructor(params: RecipeToolParams, cwd: string) {
    super(params);
    this.cwd = cwd;
  }

  getDescription(): string {
    const target = this.params.target ?? 'unknown';
    return `Recipe ${this.params.action}${this.params.target ? ` ${target}` : ''}`;
  }

  async execute(): Promise<ToolResult> {
    try {
      const runnerInfo = detectRunner(this.cwd);
      if (!runnerInfo) {
        return {
          llmContent:
            'No task runner detected. Looked for: pnpm, yarn, npm, cargo, make, just, go, bazel.',
          returnDisplay: 'No task runner detected',
        };
      }

      const { runner } = runnerInfo;

      switch (this.params.action) {
        case 'detect':
          return this.handleDetect(runner);
        case 'list':
          return this.handleList(runner);
        case 'run':
          return this.handleRun(runner);
        default:
          return {
            llmContent: `Unknown action: ${this.params.action}. Use 'detect', 'run', or 'list'.`,
            returnDisplay: `Unknown action: ${this.params.action}`,
            error: { message: `Unknown action: ${this.params.action}` },
          };
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      debugLogger.error('Recipe failed:', msg);
      return {
        llmContent: `Error: ${msg}`,
        returnDisplay: `Error: ${msg}`,
        error: { message: msg },
      };
    }
  }

  private handleDetect(runner: RunnerKind): ToolResult {
    return {
      llmContent: `Detected task runner: ${runner}`,
      returnDisplay: `Runner: ${runner}`,
    };
  }

  private handleList(runner: RunnerKind): ToolResult {
    const targets = listTargets(runner, this.cwd);
    return {
      llmContent: `Available targets (${runner}): ${targets.join(', ')}`,
      returnDisplay: `${runner} targets: ${targets.join(', ')}`,
    };
  }

  private handleRun(runner: RunnerKind): ToolResult {
    const target = this.params.target;
    if (!target) {
      return {
        llmContent: 'No target specified. Use the "target" parameter.',
        returnDisplay: 'No target specified',
        error: { message: 'Missing target parameter' },
      };
    }

    const cmd = buildCommand(runner, target, this.params.args);
    debugLogger.debug(`Running: ${cmd}`);

    try {
      const output = execSync(cmd, {
        encoding: 'utf-8',
        cwd: this.cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 600_000, // 10 min max
      });
      return {
        llmContent: output.trim() || `Completed: ${cmd}`,
        returnDisplay: `Ran: ${cmd}`,
      };
    } catch (e: unknown) {
      const err = e as { stdout?: string; stderr?: string; message?: string };
      const stdout = typeof err.stdout === 'string' ? err.stdout.trim() : '';
      const stderr = typeof err.stderr === 'string' ? err.stderr.trim() : '';
      const parts = [stdout, stderr].filter(Boolean).join('\n');
      return {
        llmContent: parts || `Command failed: ${cmd}`,
        returnDisplay: `Failed: ${cmd}`,
        error: { message: err.message ?? `Command failed: ${cmd}` },
      };
    }
  }
}

function getRecipeToolDescription(): string {
  return `Detects and runs project task runners (pnpm, yarn, npm, cargo, make, just, go, bazel).

Actions:
- detect: Identify which task runner is available in the project
- list: Show available targets/tasks
- run: Execute a specific target with optional arguments`;
}

export class RecipeTool extends BaseDeclarativeTool<
  RecipeToolParams,
  ToolResult
> {
  static Name: string = ToolNames.RECIPE;

  private readonly cwd: string;

  constructor(cwd: string) {
    super(
      RecipeTool.Name,
      ToolDisplayNames.RECIPE,
      getRecipeToolDescription(),
      Kind.Execute,
      {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['detect', 'run', 'list'],
            description:
              "Action to perform: 'detect' the task runner, 'run' a target, or 'list' available targets.",
          },
          target: {
            type: 'string',
            description:
              "Target/task to run (required for 'run' action, e.g. 'test', 'build').",
          },
          args: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional arguments to pass to the target.',
          },
        },
        required: ['action'],
      },
      false,
      false,
      true, // shouldDefer — recipe tool is infrequent
    );
    this.cwd = cwd;
  }

  protected createInvocation(
    params: RecipeToolParams,
  ): BaseToolInvocation<RecipeToolParams, ToolResult> {
    return new RecipeToolInvocation(params, this.cwd);
  }
}
