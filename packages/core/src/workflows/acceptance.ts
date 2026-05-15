/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * Acceptance DSL — evaluates whether a workflow phase has met its acceptance criteria.
 * Checks are run as shell commands and file inspections.
 */

import { createDebugLogger } from '../utils/debugLogger.js';
import type { WorkflowState } from './state-manager.js';

const debugLogger = createDebugLogger('acceptance');

export interface AcceptanceCheck {
  type: string;
  passed: boolean;
  message: string;
}

export interface AcceptanceResult {
  passed: boolean;
  checks: AcceptanceCheck[];
  summary: string;
}

function hasTrueEvidence(
  state: WorkflowState,
  ...keys: string[]
): boolean {
  return keys.some((key) => state.data[key] === true);
}

async function gitDiffContainsTodo(cwd: string): Promise<boolean> {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileAsync = promisify(execFile);

  const { stdout } = await execFileAsync(
    'git',
    ['diff', '--unified=0', '--', '.'],
    {
      cwd,
      // Keep acceptance checks bounded. Large diffs should be checked by
      // targeted test/lint phases, not by buffering unbounded output here.
      maxBuffer: 1024 * 1024,
    },
  );

  return stdout
    .split(/\r?\n/)
    .some((line) => /^\+[^+].*\b(?:TODO|FIXME)\b/i.test(line));
}

/**
 * Evaluate an acceptance criterion against current state.
 */
export async function evaluateAcceptance(
  criterion: string,
  state: WorkflowState,
  cwd: string,
): Promise<AcceptanceCheck> {
  try {
    // tests-pass: check if last test run succeeded
    if (criterion === 'tests-pass') {
      const passed = hasTrueEvidence(state, 'testsPass', 'lastTestRunPassed');
      return {
        type: criterion,
        passed,
        message: passed
          ? 'Recorded test run passed'
          : 'No recorded passing test run; failing closed',
      };
    }

    // lsp-clean: tsc --noEmit should have no errors
    if (criterion === 'lsp-clean') {
      const passed = hasTrueEvidence(state, 'lspClean', 'typecheckPassed');
      return {
        type: criterion,
        passed,
        message: passed
          ? 'Recorded LSP/typecheck result is clean'
          : 'No recorded clean LSP/typecheck result; failing closed',
      };
    }

    // no-todo-in-diff: check git diff for TODO/FIXME
    if (criterion === 'no-todo-in-diff') {
      const hasTodo = await gitDiffContainsTodo(cwd);
      return {
        type: criterion,
        passed: !hasTodo,
        message: hasTodo
          ? 'TODO/FIXME found in added diff lines'
          : 'No TODO/FIXME found in added diff lines',
      };
    }

    // file-exists(path)
    const fileExistsMatch = criterion.match(/^file-exists\((.+)\)$/);
    if (fileExistsMatch) {
      const filePath = fileExistsMatch[1];
      const { default: fs } = await import('node:fs');
      const { default: path } = await import('node:path');
      const fullPath = path.resolve(cwd, filePath);
      const exists = fs.existsSync(fullPath);
      return {
        type: criterion,
        passed: exists,
        message: exists ? `File exists: ${filePath}` : `File not found: ${filePath}`,
      };
    }

    // phase-completed
    if (criterion === 'phase-completed') {
      const passed =
        state.phase === 'completed' ||
        hasTrueEvidence(state, 'phaseCompleted', 'currentPhaseCompleted');
      return {
        type: criterion,
        passed,
        message: passed
          ? 'Phase completion evidence recorded'
          : 'Phase completion evidence missing; failing closed',
      };
    }

    // Unknown criterion — fail closed.
    debugLogger.warn(`Unknown acceptance criterion: ${criterion}`);
    return {
      type: criterion,
      passed: false,
      message: `Unknown criterion '${criterion}' is not implemented; failing closed`,
    };
  } catch (err) {
    return {
      type: criterion,
      passed: false,
      message: `Error evaluating '${criterion}': ${err}`,
    };
  }
}

/**
 * Evaluate multiple acceptance criteria with logical operators.
 * Supports: all([...]), any([...]), not(criterion)
 */
export async function evaluateCriteria(
  criteria: string[],
  operator: 'all' | 'any' = 'all',
  state: WorkflowState,
  cwd: string,
): Promise<AcceptanceResult> {
  const checks: AcceptanceCheck[] = [];

  for (const criterion of criteria) {
    // Handle not() operator
    if (criterion.startsWith('not(') && criterion.endsWith(')')) {
      const inner = criterion.slice(4, -1);
      const result = await evaluateAcceptance(inner, state, cwd);
      result.passed = !result.passed;
      result.message = `NOT(${result.message})`;
      checks.push(result);
      continue;
    }

    const result = await evaluateAcceptance(criterion, state, cwd);
    checks.push(result);
  }

  const passed = operator === 'all'
    ? checks.every((c) => c.passed)
    : checks.some((c) => c.passed);

  const summary = checks
    .map((c) => `${c.passed ? '✓' : '✗'} ${c.type}: ${c.message}`)
    .join('\n');

  return { passed, checks, summary };
}
