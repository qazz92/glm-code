/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * PostEdit diagnostics — automatically runs type checking and linting
 * after file edits to catch errors early.
 */



export interface DiagnosticResult {
  hasErrors: boolean;
  errorCount: number;
  warningCount: number;
  messages: Array<{ file: string; line: number; severity: 'error' | 'warning'; message: string }>;
}

/**
 * Run post-edit diagnostics on modified files.
 * Returns a summary of any issues found.
 */
export function runPostEditDiagnostics(
  _editedFiles: string[],
  _projectRoot: string,
): DiagnosticResult {
  // Stub implementation — actual execution happens via Bash tool
  // The LLM will be instructed to run tsc --noEmit and eslint
  // after edits when post-edit diagnostics are enabled.
  return {
    hasErrors: false,
    errorCount: 0,
    warningCount: 0,
    messages: [],
  };
}

/**
 * Build a system instruction for post-edit diagnostics.
 */
export function buildPostEditInstruction(editedFiles: string[]): string {
  if (editedFiles.length === 0) return '';

  return [
    'SYSTEM: Post-edit diagnostics are enabled.',
    `You just edited: ${editedFiles.join(', ')}`,
    'After making edits, you should:',
    '1. Run `tsc --noEmit` to check for type errors (if TypeScript project)',
    '2. Run `eslint` to check for lint errors (if configured)',
    '3. Fix any errors found before proceeding',
    '4. Do NOT report completion until all diagnostics pass',
  ].join('\n');
}

/**
 * Parse tsc --noEmit output into diagnostic messages.
 */
export function parseTscOutput(output: string): DiagnosticResult {
  const messages: DiagnosticResult['messages'] = [];
  const lines = output.split('\n');

  for (const line of lines) {
    const match = line.match(/^(.+?)\((\d+),(\d+)\):\s*(error|warning)\s+TS\d+:\s*(.+)$/);
    if (match) {
      messages.push({
        file: match[1],
        line: parseInt(match[2], 10),
        severity: match[4] as 'error' | 'warning',
        message: match[5],
      });
    }
  }

  return {
    hasErrors: messages.some((m) => m.severity === 'error'),
    errorCount: messages.filter((m) => m.severity === 'error').length,
    warningCount: messages.filter((m) => m.severity === 'warning').length,
    messages,
  };
}
