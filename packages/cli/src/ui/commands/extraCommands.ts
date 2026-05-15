/**
 * @license
 * Copyright 2025 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type CommandContext,
  type SlashCommand,
  type MessageActionReturn,
  type SubmitPromptActionReturn,
  CommandKind,
} from './types.js';
import { t } from '../../i18n/index.js';

type WorkflowReturn = MessageActionReturn | SubmitPromptActionReturn;

/** Wrap a workflow instruction string as a prompt submission. */
function submitWorkflowPrompt(
  instruction: string,
): SubmitPromptActionReturn {
  return { type: 'submit_prompt', content: [{ text: instruction }] };
}

/** Return an error message. */
function errorMsg(text: string): MessageActionReturn {
  return { type: 'message', messageType: 'error', content: text };
}

/** Return an info message. */
function infoMsg(text: string): MessageActionReturn {
  return { type: 'message', messageType: 'info', content: text };
}

// ---------------------------------------------------------------------------
// /budget tokens <N> — set context token budget
// ---------------------------------------------------------------------------

const BUDGET_INSTRUCTION = `[SYSTEM INSTRUCTION — BUDGET MODE]
The user is setting a context token budget. Adjust the context window to respect the specified token limit.
Prioritize recent conversation, active file context, and essential system instructions.
Trim older history, reduce tool output retention, and compress memory segments as needed.
Always confirm the new budget and current usage.
`;

export const budgetCommand: SlashCommand = {
  name: 'budget',
  get description() {
    return t('Set context token budget (e.g. /budget tokens 8000)');
  },
  kind: CommandKind.BUILT_IN,
  supportedModes: ['interactive'] as const,
  action: async (
    _context: CommandContext,
    args: string,
  ): Promise<WorkflowReturn> => {
    if (!args.trim()) {
      return errorMsg(t('Usage: /budget tokens <N>'));
    }
    return submitWorkflowPrompt(
      `${BUDGET_INSTRUCTION}\nUser request: Set context budget to ${args.trim()} tokens.`,
    );
  },
};

// ---------------------------------------------------------------------------
// /route <model> — manual model routing
// ---------------------------------------------------------------------------

export const routeCommand: SlashCommand = {
  name: 'route',
  get description() {
    return t('Route to a specific model (alias for /model)');
  },
  altNames: ['model-route'],
  kind: CommandKind.BUILT_IN,
  supportedModes: ['interactive'] as const,
  action: async (
    _context: CommandContext,
    args: string,
  ): Promise<WorkflowReturn> => {
    if (!args.trim()) {
      return errorMsg(t('Usage: /route <model-name>'));
    }
    return submitWorkflowPrompt(
      `Switch to model: ${args.trim()}. Use the /model command internally to change the active model.`,
    );
  },
};

// ---------------------------------------------------------------------------
// /pause — pause session, save checkpoint
// ---------------------------------------------------------------------------

const PAUSE_INSTRUCTION = `[SYSTEM INSTRUCTION — PAUSE MODE]
Pause the current session. Save a checkpoint of the current state including:
1. Current task progress and pending items
2. Files modified so far
3. Key decisions made
4. Next steps to resume
Provide a brief summary of what was accomplished and what remains.
`;

export const pauseCommand: SlashCommand = {
  name: 'pause',
  get description() {
    return t('Pause session and save checkpoint');
  },
  kind: CommandKind.BUILT_IN,
  supportedModes: ['interactive'] as const,
  action: async (): Promise<WorkflowReturn> => {
    return submitWorkflowPrompt(PAUSE_INSTRUCTION);
  },
};

// ---------------------------------------------------------------------------
// /resume — resume session from latest checkpoint
// ---------------------------------------------------------------------------

const RESUME_INSTRUCTION = `[SYSTEM INSTRUCTION — RESUME MODE]
Resume the session from the latest checkpoint. Look for the most recent checkpoint
and restore the workflow state. Summarize where we left off and continue from the
next pending step.
`;

export const resumeSessionCommand: SlashCommand = {
  name: 'resume-session',
  get description() {
    return t('Resume session from latest checkpoint');
  },
  kind: CommandKind.BUILT_IN,
  supportedModes: ['interactive'] as const,
  action: async (): Promise<WorkflowReturn> => {
    return submitWorkflowPrompt(RESUME_INSTRUCTION);
  },
};

// ---------------------------------------------------------------------------
// /auto — promote task to LONG_HORIZON pipeline
// ---------------------------------------------------------------------------

const AUTO_INSTRUCTION = `[SYSTEM INSTRUCTION — AUTO MODE]
The user has requested autonomous long-horizon execution. Promote the current task to a
LONG_HORIZON pipeline with the following behavior:
1. Break the task into clear phases
2. Execute each phase fully before proceeding
3. Self-verify each phase's output
4. Only request human input when genuinely blocked by ambiguity
5. Report progress after each phase
Execute with maximum autonomy and thoroughness.
`;

export const autoCommand: SlashCommand = {
  name: 'auto',
  get description() {
    return t('Promote task to autonomous long-horizon pipeline');
  },
  kind: CommandKind.BUILT_IN,
  supportedModes: ['interactive'] as const,
  action: async (): Promise<WorkflowReturn> => {
    return submitWorkflowPrompt(AUTO_INSTRUCTION);
  },
};

// ---------------------------------------------------------------------------
// /visual-verdict — screenshot comparison verification
// ---------------------------------------------------------------------------

export const visualVerdictCommand: SlashCommand = {
  name: 'visual-verdict',
  get description() {
    return t('Compare two screenshots for visual verification');
  },
  argumentHint: '<actual> <expected>',
  kind: CommandKind.BUILT_IN,
  supportedModes: ['interactive'] as const,
  action: async (
    _context: CommandContext,
    args: string,
  ): Promise<WorkflowReturn> => {
    const parts = args.trim().split(/\s+/);
    if (parts.length < 2) {
      return errorMsg(
        t('Usage: /visual-verdict <actual-screenshot> <expected-screenshot>'),
      );
    }
    return submitWorkflowPrompt(
      `[VISUAL VERDICT] Compare these two screenshots:
- Actual: ${parts[0]}
- Expected: ${parts[1]}

Analyze and report:
1. Visual differences (layout, colors, spacing, content)
2. Severity of each difference (critical/major/minor)
3. Overall verdict: PASS / FAIL / NEEDS REVIEW
Provide specific coordinates or regions where differences are found.`,
    );
  },
};

// ---------------------------------------------------------------------------
// /ai-slop-cleaner — AI slop cleanup
// ---------------------------------------------------------------------------

const AI_SLOP_CLEANER_INSTRUCTION = `[SYSTEM INSTRUCTION — AI SLOP CLEANER]
Clean AI-generated code slop from the current project. Follow this deletion-first workflow:
1. Scan recent changes for common AI slop patterns:
   - Unnecessary abstractions and wrapper functions
   - Over-engineered type hierarchies
   - Redundant comments that restate the code
   - Excessive error handling for trivial cases
   - Unused imports and dead code
   - Overly verbose variable names
   - Unnecessary async/await
   - Gratuitous use of design patterns
2. For each finding, determine if it's safe to remove
3. Remove slop, preferring deletion over refactoring
4. Run existing tests to verify no regressions
5. Report what was cleaned and what was left (with reasoning)
Do NOT add new features, improve performance, or refactor working code.
`;

export const aiSlopCleanerCommand: SlashCommand = {
  name: 'ai-slop-cleaner',
  get description() {
    return t('Clean AI-generated code slop');
  },
  kind: CommandKind.BUILT_IN,
  supportedModes: ['interactive'] as const,
  action: async (): Promise<WorkflowReturn> => {
    return submitWorkflowPrompt(AI_SLOP_CLEANER_INSTRUCTION);
  },
};

// ---------------------------------------------------------------------------
// /external-context — external document search
// ---------------------------------------------------------------------------

export const externalContextCommand: SlashCommand = {
  name: 'external-context',
  get description() {
    return t('Fetch and search external documents (URLs)');
  },
  argumentHint: '<url>',
  kind: CommandKind.BUILT_IN,
  supportedModes: ['interactive'] as const,
  action: async (
    _context: CommandContext,
    args: string,
  ): Promise<WorkflowReturn> => {
    const url = args.trim();
    if (!url) {
      return errorMsg(t('Usage: /external-context <url>'));
    }
    return submitWorkflowPrompt(
      `Fetch and analyze the content from this URL: ${url}\n\n` +
        `Read the full page content, extract key information, and summarize it in the context of the current conversation. ` +
        `Use the web_fetch or browser tools to retrieve the content.`,
    );
  },
};

// ---------------------------------------------------------------------------
// /ccg — Claude-Codex-Gemini tri-model orchestration
// ---------------------------------------------------------------------------

const CCG_INSTRUCTION = `[SYSTEM INSTRUCTION — CCG TRI-MODEL ORCHESTRATION]
Claude-Codex-Gemini (CCG) tri-model orchestration mode activated.

Process:
1. Analyze the current task and decompose it into sub-problems
2. For each sub-problem, consider three perspectives:
   - Claude perspective: Thoughtful analysis, careful reasoning, creative solutions
   - Codex perspective: Code-focused, efficient implementation, test-driven
   - Gemini perspective: Fast prototyping, broad knowledge synthesis
3. Synthesize the best elements from each perspective
4. Present the unified solution with rationale for chosen approaches
5. Implement the synthesized solution

Apply this tri-model thinking to the current task or conversation context.
`;

export const ccgCommand: SlashCommand = {
  name: 'ccg',
  get description() {
    return t('Claude-Codex-Gemini tri-model orchestration');
  },
  kind: CommandKind.BUILT_IN,
  supportedModes: ['interactive'] as const,
  action: async (): Promise<WorkflowReturn> => {
    return submitWorkflowPrompt(CCG_INSTRUCTION);
  },
};

// ---------------------------------------------------------------------------
// /plugin — alias for /extensions
// ---------------------------------------------------------------------------

export const pluginCommand: SlashCommand = {
  name: 'plugin',
  get description() {
    return t('Manage plugins (alias for /extensions)');
  },
  kind: CommandKind.BUILT_IN,
  supportedModes: ['interactive'] as const,
  action: async (
    _context: CommandContext,
    _args: string,
  ): Promise<WorkflowReturn> => {
    return infoMsg(
      t('Use /extensions <install|uninstall|update|enable|disable> <name>'),
    );
  },
};
