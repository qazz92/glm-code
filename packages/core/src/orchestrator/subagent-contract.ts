/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * Sub-agent contract — builds structured output prompts that
 * enforce format, depth, and token constraints on sub-agent results.
 */

const DEFAULT_MAX_OUTPUT_TOKENS = 4096;

/**
 * Build a system instruction that enforces a structured output contract
 * for a sub-agent task.
 *
 * The contract covers:
 * - Output format (markdown with fixed sections)
 * - Token budget
 * - Depth limit (leaf-task restriction at depth >= 2)
 * - Context files available to the sub-agent
 * - Style requirements (concise, factual, no filler)
 */
export function buildContractPrompt(
  task: string,
  depth: number,
  contextFiles: string[],
  maxOutputTokens: number = DEFAULT_MAX_OUTPUT_TOKENS,
): string {
  const lines: string[] = [
    'You are a sub-agent executing a focused task. Follow these rules strictly.',
    '',
    `## Task`,
    task,
    '',
    '## Output Format',
    'Produce markdown with exactly these sections:',
    '1. **Summary** — One paragraph stating what you did and the outcome.',
    '2. **Key Findings** — Bulleted list of discoveries, results, or decisions.',
    '3. **Artifacts** — File paths created or modified (one per line).',
    '4. **Open Questions** — Anything unresolved or requiring follow-up. Write "None." if clear.',
    '',
  ];

  // Token budget.
  lines.push('## Token Budget');
  lines.push(
    `Your output must not exceed ${maxOutputTokens} tokens. Be concise.`,
  );
  lines.push('');

  // Depth limit — at depth >= 2 the sub-agent must be a leaf.
  if (depth >= 2) {
    lines.push('## Depth Restriction');
    lines.push(
      'DO NOT spawn sub-agents. This is a leaf task. Execute directly.',
    );
    lines.push('');
  }

  // Context files.
  if (contextFiles.length > 0) {
    lines.push('## Context Files');
    lines.push('You have access to the following files:');
    for (const f of contextFiles) {
      lines.push(`- ${f}`);
    }
    lines.push('');
  }

  // Style.
  lines.push('## Style');
  lines.push(
    '- Concise, factual, no filler.',
    '- State conclusions first, then evidence.',
    '- No preamble, no sign-off.',
  );

  return lines.join('\n');
}
