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
import { ApprovalMode, appendYoloAudit } from '@glm-code/core';
import { t } from '../../i18n/index.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

type WorkflowReturn = MessageActionReturn | SubmitPromptActionReturn;

/** Wrap a workflow instruction string as a prompt submission. */
function submitWorkflowPrompt(
  instruction: string,
): SubmitPromptActionReturn {
  return {
    type: 'submit_prompt',
    content: [{ text: instruction }],
  };
}

/** Return an error message. */
function errorMsg(text: string): MessageActionReturn {
  return { type: 'message', messageType: 'error', content: text };
}

// ---------------------------------------------------------------------------
// /autopilot — end-to-end autonomous execution
// ---------------------------------------------------------------------------

const AUTOPILOT_INSTRUCTION = `[SYSTEM INSTRUCTION — AUTOPILOT MODE]

You are now in **autopilot mode**. Work autonomously through these phases, in order:

1. **Analyze** — Read the codebase, understand context, identify what needs to change.
2. **Design** — Propose an architecture for the solution.
3. **Plan** — Break the work into atomic, ordered steps.
4. **Implement** — Execute each step, writing real code (no stubs, no TODOs).
5. **QA** — Write tests and verify they pass.
6. **Verify** — Run build, typecheck, and tests. Evidence before assertions.

Rules:
- Never ask for permission — proceed through every phase.
- If a phase reveals the task is impossible, explain why and stop.
- Always run verification commands and include their output.
- Keep a running list of what is done vs. remaining.
`;

export const autopilotCommand: SlashCommand = {
  name: 'autopilot',
  get description() {
    return t(
      'End-to-end autonomous mode: analyze → design → plan → implement → QA → verify',
    );
  },
  argumentHint: '<task description>',
  kind: CommandKind.BUILT_IN,
  supportedModes: ['interactive'] as const,
  action: async (
    _context: CommandContext,
    args: string,
  ): Promise<WorkflowReturn> => {
    const task = args.trim();
    if (!task) {
      return errorMsg(
        t('Usage: /autopilot <task description>'),
      );
    }
    return submitWorkflowPrompt(AUTOPILOT_INSTRUCTION + `\nTask: ${task}\n`);
  },
};

// ---------------------------------------------------------------------------
// /ralph — PRD-driven persistence loop
// ---------------------------------------------------------------------------

const RALPH_INSTRUCTION = `[SYSTEM INSTRUCTION — RALPH MODE]

You are now in **ralph mode** — a PRD-driven persistence loop.

Workflow:
1. Read the PRD or task specification (provided below or in referenced files).
2. Extract acceptance criteria as a checklist of verifiable stories.
3. Implement the first incomplete story.
4. Verify the story passes (tests, manual checks).
5. If it fails, fix the root cause and re-verify (up to 3 retries per story).
6. Mark the story done and move to the next.
7. Repeat until all stories pass or a story is blocked after 3 retries.

Rules:
- Never skip a story or mark it done without evidence.
- Never ask for permission between stories.
- If blocked, report exactly what failed and why.
- Produce a final summary: passed stories, failed stories, blockers.
`;

export const ralphCommand: SlashCommand = {
  name: 'ralph',
  get description() {
    return t(
      'PRD-driven persistence loop: implement stories until all verified',
    );
  },
  argumentHint: '<PRD or task spec>',
  kind: CommandKind.BUILT_IN,
  supportedModes: ['interactive'] as const,
  action: async (
    _context: CommandContext,
    args: string,
  ): Promise<WorkflowReturn> => {
    const spec = args.trim();
    if (!spec) {
      return errorMsg(t('Usage: /ralph <PRD or task specification>'));
    }
    return submitWorkflowPrompt(RALPH_INSTRUCTION + `\nSpecification: ${spec}\n`);
  },
};

// ---------------------------------------------------------------------------
// /ultrawork — parallel execution engine
// ---------------------------------------------------------------------------

const ULTRAWORK_INSTRUCTION = `[SYSTEM INSTRUCTION — ULTRAWORK MODE]

You are now in **ultrawork mode** — a parallel execution engine for independent tasks.

Workflow:
1. Parse the user's task list into independent work items.
2. For each item, determine file scope and dependencies.
3. Execute independent items in parallel where possible (batch file reads, then batch edits).
4. For dependent items, sequence them correctly.
5. Verify all items completed: build, typecheck, tests.

Rules:
- Maximize parallelism — never wait when you can proceed.
- Each work item must be atomic: either fully done or not started.
- Report completion as a checklist at the end.
`;

export const ultraworkCommand: SlashCommand = {
  name: 'ultrawork',
  get description() {
    return t('Parallel execution engine for independent tasks');
  },
  argumentHint: '<task1>; <task2>; ...',
  kind: CommandKind.BUILT_IN,
  supportedModes: ['interactive'] as const,
  action: async (
    _context: CommandContext,
    args: string,
  ): Promise<WorkflowReturn> => {
    const tasks = args.trim();
    if (!tasks) {
      return errorMsg(t('Usage: /ultrawork <task1>; <task2>; ...'));
    }
    return submitWorkflowPrompt(ULTRAWORK_INSTRUCTION + `\nTasks: ${tasks}\n`);
  },
};

// ---------------------------------------------------------------------------
// /team — N coordinated agents on shared task list
// ---------------------------------------------------------------------------

const TEAM_INSTRUCTION = `[SYSTEM INSTRUCTION — TEAM MODE]

You are now in **team mode** — coordinating N agents on a shared task list.

Workflow:
1. Break the work into discrete, assignable tasks.
2. Assign each task to a logical agent role (e.g., "executor", "reviewer", "tester").
3. Execute tasks in dependency order, parallelizing where possible.
4. Each agent produces output that downstream agents consume.
5. Verify integration at the end.

Rules:
- Define the team composition and task board upfront.
- Track which agent owns which task.
- Resolve merge conflicts and integration issues as they arise.
- Final verification: all tasks done, build passes, tests pass.
`;

export const teamCommand: SlashCommand = {
  name: 'team',
  get description() {
    return t('N coordinated agents on a shared task list');
  },
  argumentHint: '<objective>',
  kind: CommandKind.BUILT_IN,
  supportedModes: ['interactive'] as const,
  action: async (
    _context: CommandContext,
    args: string,
  ): Promise<WorkflowReturn> => {
    const objective = args.trim();
    if (!objective) {
      return errorMsg(t('Usage: /team <objective>'));
    }
    return submitWorkflowPrompt(TEAM_INSTRUCTION + `\nObjective: ${objective}\n`);
  },
};

// ---------------------------------------------------------------------------
// /plan — strategic planning with optional interview
// ---------------------------------------------------------------------------

const PLAN_INSTRUCTION = `[SYSTEM INSTRUCTION — PLAN MODE]

You are now in **plan mode** — produce a strategic implementation plan.

Workflow:
1. **Clarify** — If requirements are ambiguous, ask clarifying questions (interview mode). If args contain "no-interview", skip questions.
2. **Analyze** — Read relevant code, map dependencies, identify constraints.
3. **Design** — Propose architecture, data flow, API contracts.
4. **Plan** — Break into ordered phases with file-level change lists.
5. **Estimate risk** — Identify risky changes and mitigation strategies.

Output format:
- Phase breakdown with ordered steps
- File change list per phase
- Risk assessment
- Verification strategy

Rules:
- Plans must be grounded in actual code — read before proposing.
- Each step must name the specific file(s) and function(s) affected.
- Never start implementation — this mode only produces the plan.
`;

export const planWorkflowCommand: SlashCommand = {
  name: 'strategic-plan',
  get description() {
    return t('Strategic planning with optional interview workflow');
  },
  argumentHint: '<objective or "no-interview <objective>">',
  kind: CommandKind.BUILT_IN,
  supportedModes: ['interactive'] as const,
  action: async (
    _context: CommandContext,
    args: string,
  ): Promise<WorkflowReturn> => {
    const objective = args.trim();
    if (!objective) {
      return errorMsg(
        t('Usage: /strategic-plan <objective> or /strategic-plan no-interview <objective>'),
      );
    }
    return submitWorkflowPrompt(PLAN_INSTRUCTION + `\nObjective: ${objective}\n`);
  },
};

// ---------------------------------------------------------------------------
// /deep-dive — trace + deep-interview 2-stage pipeline
// ---------------------------------------------------------------------------

const DEEP_DIVE_INSTRUCTION = `[SYSTEM INSTRUCTION — DEEP DIVE MODE]

You are now in **deep-dive mode** — a 2-stage pipeline.

**Stage 1: Trace**
- Investigate the problem using evidence-driven causal tracing.
- Form hypotheses, gather evidence for/against each.
- Track uncertainty and refine hypotheses.
- Produce a trace report.

**Stage 2: Deep Interview**
- Based on the trace, ask targeted questions to crystallize requirements.
- Use Socratic questioning to resolve ambiguity.
- Gate on mathematical precision — if numbers are involved, pin them down.
- Produce a crystallized requirements document.

Rules:
- Never skip Stage 1 — the trace must complete before interviewing.
- Cite code evidence (file:line) for every claim.
- If Stage 1 resolves the issue fully, report findings and skip Stage 2.
`;

export const deepDiveCommand: SlashCommand = {
  name: 'deep-dive',
  get description() {
    return t('2-stage pipeline: trace (causal investigation) → deep interview');
  },
  argumentHint: '<topic or question>',
  kind: CommandKind.BUILT_IN,
  supportedModes: ['interactive'] as const,
  action: async (
    _context: CommandContext,
    args: string,
  ): Promise<WorkflowReturn> => {
    const topic = args.trim();
    if (!topic) {
      return errorMsg(t('Usage: /deep-dive <topic or question>'));
    }
    return submitWorkflowPrompt(DEEP_DIVE_INSTRUCTION + `\nTopic: ${topic}\n`);
  },
};

// ---------------------------------------------------------------------------
// /trace — evidence-driven causal tracing
// ---------------------------------------------------------------------------

const TRACE_INSTRUCTION = `[SYSTEM INSTRUCTION — TRACE MODE]

You are now in **trace mode** — perform evidence-driven causal tracing.

Method:
1. Observe the symptom or behavior to explain.
2. Form 2–3 competing hypotheses for the root cause.
3. For each hypothesis, identify evidence that would confirm or refute it.
4. Gather evidence by reading code, logs, and test output.
5. Score each hypothesis based on evidence.
6. Report findings with confidence levels.

Rules:
- Every claim must cite file:line evidence.
- Track uncertainty explicitly — "likely", "possible", "unlikely".
- If evidence is insufficient, say so rather than guessing.
- Produce a structured trace report.
`;

export const traceCommand: SlashCommand = {
  name: 'trace',
  get description() {
    return t('Evidence-driven causal tracing with competing hypotheses');
  },
  argumentHint: '<symptom or behavior to investigate>',
  kind: CommandKind.BUILT_IN,
  supportedModes: ['interactive'] as const,
  action: async (
    _context: CommandContext,
    args: string,
  ): Promise<WorkflowReturn> => {
    const symptom = args.trim();
    if (!symptom) {
      return errorMsg(t('Usage: /trace <symptom or behavior>'));
    }
    return submitWorkflowPrompt(TRACE_INSTRUCTION + `\nSymptom: ${symptom}\n`);
  },
};

// ---------------------------------------------------------------------------
// /ultraqa — QA cycling workflow
// ---------------------------------------------------------------------------

const ULTRAQA_INSTRUCTION = `[SYSTEM INSTRUCTION — ULTRAQA MODE]

You are now in **ultraqa mode** — a QA cycling workflow.

Cycle:
1. **Test** — Run the existing test suite or write new tests for the target area.
2. **Verify** — Check test output, identify failures.
3. **Fix** — Address failures in production code (not test hacks).
4. **Repeat** — Re-run tests until all pass.

Stopping criteria:
- All tests pass with zero failures.
- No test was modified to pass — only production code was changed.
- Coverage of the changed area is adequate.

Rules:
- Test behavior, not implementation details.
- Never suppress a test failure — fix the root cause.
- Report cycle count and final test results.
`;

export const ultraqaCommand: SlashCommand = {
  name: 'ultraqa',
  get description() {
    return t('QA cycling workflow: test → verify → fix → repeat');
  },
  argumentHint: '<target area or test command>',
  kind: CommandKind.BUILT_IN,
  supportedModes: ['interactive'] as const,
  action: async (
    _context: CommandContext,
    args: string,
  ): Promise<WorkflowReturn> => {
    const target = args.trim();
    if (!target) {
      return errorMsg(t('Usage: /ultraqa <target area or test command>'));
    }
    return submitWorkflowPrompt(ULTRAQA_INSTRUCTION + `\nTarget: ${target}\n`);
  },
};

// ---------------------------------------------------------------------------
// /debug — diagnose current session or repo state
// ---------------------------------------------------------------------------

const DEBUG_INSTRUCTION = `[SYSTEM INSTRUCTION — DEBUG MODE]

You are now in **debug mode** — diagnose the current session or repository state.

Steps:
1. **Reproduce** — Confirm the issue exists by running the relevant command or test.
2. **Isolate** — Narrow the scope: which module, function, or configuration is involved.
3. **Diagnose** — Read source code, check logs, inspect state. Form a root-cause hypothesis.
4. **Verify** — Confirm the hypothesis by making a minimal change and re-running.
5. **Report** — Summarize: root cause, affected files, recommended fix.

Rules:
- Always reproduce before theorizing.
- Read error messages and stack traces carefully — they usually contain the answer.
- Check for common pitfalls: env vars, config files, dependency versions.
- If you cannot reproduce, report that honestly.
`;

export const debugWorkflowCommand: SlashCommand = {
  name: 'debug',
  get description() {
    return t('Diagnose current session or repository state');
  },
  argumentHint: '<issue description>',
  kind: CommandKind.BUILT_IN,
  supportedModes: ['interactive'] as const,
  action: async (
    _context: CommandContext,
    args: string,
  ): Promise<WorkflowReturn> => {
    const issue = args.trim();
    if (!issue) {
      return errorMsg(t('Usage: /debug <issue description>'));
    }
    return submitWorkflowPrompt(DEBUG_INSTRUCTION + `\nIssue: ${issue}\n`);
  },
};

// ---------------------------------------------------------------------------
// /verify — evidence collection for completion claims
// ---------------------------------------------------------------------------

const VERIFY_INSTRUCTION = `[SYSTEM INSTRUCTION — VERIFY MODE]

You are now in **verify mode** — collect evidence to support or refute a completion claim.

Steps:
1. **Parse the claim** — What exactly is asserted to be done?
2. **Identify evidence** — What would prove or disprove the claim? (tests, build output, file contents)
3. **Collect evidence** — Run commands, read files, check test output.
4. **Verdict** — For each claim, state: CONFIRMED (with evidence) or UNCONFIRMED (with what's missing).

Rules:
- Every claim gets an explicit verdict with supporting evidence.
- "Build passes" requires fresh build output, not assumptions.
- "Tests pass" requires fresh test output.
- "Feature works" requires demonstration, not code reading.
- Never mark UNCONFIRMED without saying what evidence is missing.
`;

export const verifyCommand: SlashCommand = {
  name: 'verify',
  get description() {
    return t('Evidence collection for completion claims');
  },
  argumentHint: '<claim to verify>',
  kind: CommandKind.BUILT_IN,
  supportedModes: ['interactive'] as const,
  action: async (
    _context: CommandContext,
    args: string,
  ): Promise<WorkflowReturn> => {
    const claim = args.trim();
    if (!claim) {
      return errorMsg(t('Usage: /verify <claim to verify>'));
    }
    return submitWorkflowPrompt(VERIFY_INSTRUCTION + `\nClaim: ${claim}\n`);
  },
};

// ---------------------------------------------------------------------------
// /yolo — 3-tier auto-approve (yolo) mode
// ---------------------------------------------------------------------------

/**
 * Yolo tier levels controlling how aggressive auto-approval is.
 *
 * Tier 1 (conservative): Auto-approve reads, searches, file creation.
 *                         Ask before edits/deletes.
 * Tier 2 (moderate):     Auto-approve reads, searches, file creation, edits.
 *                         Ask before bash/deletes.
 * Tier 3 (full):         Auto-approve everything — no prompts.
 */
export enum YoloTier {
  CONSERVATIVE = 1,
  MODERATE = 2,
  FULL = 3,
}

export const DEFAULT_YOLO_TIER = YoloTier.MODERATE;

/** Human-readable descriptions for each yolo tier. */
const YOLO_TIER_INFO: Record<YoloTier, { label: string; description: string }> = {
  [YoloTier.CONSERVATIVE]: {
    label: 'Tier 1 — Conservative',
    description:
      'Auto-approve reads, searches, file creation. Ask before edits/deletes.',
  },
  [YoloTier.MODERATE]: {
    label: 'Tier 2 — Moderate',
    description:
      'Auto-approve reads, searches, file creation, edits. Ask before bash/deletes.',
  },
  [YoloTier.FULL]: {
    label: 'Tier 3 — Full',
    description: 'Auto-approve everything — no prompts.',
  },
};

/**
 * Audit log entry for auto-approved actions when yolo mode is active.
 */
export interface YoloAuditEntry {
  /** Monotonic counter for this session. */
  seq: number;
  /** ISO-8601 timestamp. */
  timestamp: string;
  /** Action that was auto-approved (e.g. tool name). */
  action: string;
  /** The tier that authorized the auto-approval. */
  tier: YoloTier;
  /** Tool name that was auto-approved (e.g. "edit", "shell", "write"). */
  tool: string;
  /** Approval decision: "auto" (approved by tier policy) or "ask" (escalated to user). */
  decision: 'auto' | 'ask';
  /** Optional file path affected by the tool invocation. */
  file?: string;
}

// Module-level yolo state (persists across invocations within a session).
let activeYoloTier: YoloTier | null = null;
let lastYoloTier: YoloTier = DEFAULT_YOLO_TIER;
let yoloAuditLog: YoloAuditEntry[] = [];
let yoloAuditSeq = 0;

/** Reset yolo state — intended for tests. */
export function resetYoloState(): void {
  activeYoloTier = null;
  lastYoloTier = DEFAULT_YOLO_TIER;
  yoloAuditLog = [];
  yoloAuditSeq = 0;
}

/** Get the current yolo tier, or null if yolo mode is disabled. */
export function getActiveYoloTier(): YoloTier | null {
  return activeYoloTier;
}

/** Record an auto-approved action to the yolo audit log. */
export function recordYoloAudit(
  action: string,
  tool: string = action,
  decision: 'auto' | 'ask' = 'auto',
  file?: string,
): void {
  if (activeYoloTier === null) return;
  yoloAuditSeq += 1;
  const entry: YoloAuditEntry = {
    seq: yoloAuditSeq,
    timestamp: new Date().toISOString(),
    action,
    tier: activeYoloTier,
    tool,
    decision,
    ...(file !== undefined && { file }),
  };
  yoloAuditLog.push(entry);

  // Persist to ~/.glm/yolo-audit.jsonl (best-effort, non-blocking on failure).
  appendYoloAudit({
    timestamp: entry.timestamp,
    tier: entry.tier,
    tool: entry.tool,
    decision: entry.decision,
    ...(file !== undefined && { file }),
  });
}

/** Return a snapshot of the current yolo audit log. */
export function getYoloAuditLog(): readonly YoloAuditEntry[] {
  return yoloAuditLog;
}

/**
 * Map a yolo tier to the core ApprovalMode.
 * Tiers 1 and 2 use AUTO_EDIT (the permission system refines behavior at a
 * higher level); tier 3 uses YOLO (full auto-approve).
 */
function tierToApprovalMode(tier: YoloTier): ApprovalMode {
  switch (tier) {
    case YoloTier.CONSERVATIVE:
    case YoloTier.MODERATE:
      return ApprovalMode.AUTO_EDIT;
    case YoloTier.FULL:
      return ApprovalMode.YOLO;
  }
}

/** Parse a string argument into a YoloTier, or return undefined. */
function parseYoloTier(arg: string): YoloTier | undefined {
  const normalized = arg.trim().toLowerCase();
  if (normalized === '1' || normalized === 'conservative') return YoloTier.CONSERVATIVE;
  if (normalized === '2' || normalized === 'moderate') return YoloTier.MODERATE;
  if (normalized === '3' || normalized === 'full') return YoloTier.FULL;
  return undefined;
}

/** Build a status message for the current yolo state. */
function yoloStatusMessage(tier: YoloTier): string {
  const info = YOLO_TIER_INFO[tier];
  const auditCount = yoloAuditLog.length;
  return t(
    `Yolo mode enabled (${info.label}): ${info.description} [${auditCount} actions auto-approved]`,
  );
}

export const yoloCommand: SlashCommand = {
  name: 'yolo',
  get description() {
    return t(
      'Enable or disable yolo mode with 3 tiers: conservative (1), moderate (2), full (3)',
    );
  },
  argumentHint: '[on|off|1|2|3|conservative|moderate|full]',
  kind: CommandKind.BUILT_IN,
  supportedModes: ['interactive'] as const,
  action: async (
    context: CommandContext,
    args: string,
  ): Promise<WorkflowReturn> => {
    const { config } = context.services;
    if (!config) {
      return errorMsg(t('Config not loaded.'));
    }
    const trimmed = args.trim().toLowerCase();

    // Explicit off
    if (trimmed === 'off' || trimmed === 'disable') {
      activeYoloTier = null;
      config.setApprovalMode(ApprovalMode.DEFAULT);
      const summary =
        yoloAuditLog.length > 0
          ? t(
              `Yolo mode disabled — approval restored to default. ${yoloAuditLog.length} actions were auto-approved during this session.`,
            )
          : t('Yolo mode disabled — approval restored to default.');
      yoloAuditLog = [];
      yoloAuditSeq = 0;
      return { type: 'message', messageType: 'info', content: summary };
    }

    // Explicit on (uses last tier or default tier 2)
    if (trimmed === 'on' || trimmed === 'enable') {
      const tier = lastYoloTier;
      activeYoloTier = tier;
      config.setApprovalMode(tierToApprovalMode(tier));
      return { type: 'message', messageType: 'info', content: yoloStatusMessage(tier) };
    }

    // Explicit tier selection
    if (trimmed.length > 0) {
      const tier = parseYoloTier(trimmed);
      if (tier === undefined) {
        return errorMsg(
          t(
            `Unknown yolo tier "${args.trim()}". Use: 1/conservative, 2/moderate, 3/full, on, or off.`,
          ),
        );
      }
      activeYoloTier = tier;
      lastYoloTier = tier;
      config.setApprovalMode(tierToApprovalMode(tier));
      return { type: 'message', messageType: 'info', content: yoloStatusMessage(tier) };
    }

    // No args — toggle
    if (activeYoloTier !== null) {
      // Currently active → disable
      lastYoloTier = activeYoloTier;
      activeYoloTier = null;
      config.setApprovalMode(ApprovalMode.DEFAULT);
      const summary =
        yoloAuditLog.length > 0
          ? t(
              `Yolo mode disabled — approval restored to default. ${yoloAuditLog.length} actions were auto-approved during this session.`,
            )
          : t('Yolo mode disabled — approval restored to default.');
      yoloAuditLog = [];
      yoloAuditSeq = 0;
      return { type: 'message', messageType: 'info', content: summary };
    }

    // Currently inactive → enable with last tier
    const tier = lastYoloTier;
    activeYoloTier = tier;
    config.setApprovalMode(tierToApprovalMode(tier));
    return { type: 'message', messageType: 'info', content: yoloStatusMessage(tier) };
  },
};

// ---------------------------------------------------------------------------
// /cancel — cancel all active workers
// ---------------------------------------------------------------------------

export const cancelCommand: SlashCommand = {
  name: 'cancel',
  get description() {
    return t('Cancel all active workers and running operations');
  },
  kind: CommandKind.BUILT_IN,
  supportedModes: ['interactive'] as const,
  action: async (
    context: CommandContext,
    _args: string,
  ): Promise<WorkflowReturn> => {
    const abortSignal = context.abortSignal;
    if (abortSignal && !abortSignal.aborted) {
      // Signal cancellation — the caller checks this
      return {
        type: 'message',
        messageType: 'info',
        content: t(
          'Cancellation requested. All active operations will be stopped.',
        ),
      };
    }

    return {
      type: 'message',
      messageType: 'info',
      content: t('No active operations to cancel.'),
    };
  },
};

// ---------------------------------------------------------------------------
// /ralplan — consensus planning entrypoint
// ---------------------------------------------------------------------------

const RALPLAN_INSTRUCTION = `[SYSTEM INSTRUCTION — RALPLAN MODE]

You are now in **ralplan mode** — a consensus planning entrypoint that auto-gates vague requests before execution.

Steps:
1. **Parse the request** — What is the user asking? Is it clear enough to act on, or does it need clarification?
2. **Gate check** — If the request is vague, ambiguous, or under-specified, enter interview mode to crystallize requirements before proceeding.
3. **Build consensus** — Present a structured plan with clear acceptance criteria. Confirm alignment with the user.
4. **Hand off** — Once consensus is reached, produce a clear execution brief for downstream workers.

Rules:
- Never execute on a vague request. Always gate first.
- Use the interview workflow to resolve ambiguity: ask targeted questions, present options, confirm understanding.
- Plans must include: scope, acceptance criteria, dependencies, and risk assessment.
- Keep the planning loop tight. Do not over-plan; aim for just enough structure to execute confidently.
`;

export const ralplanCommand: SlashCommand = {
  name: 'ralplan',
  get description() {
    return t(
      'Consensus planning entrypoint that auto-gates vague requests before execution',
    );
  },
  argumentHint: '<task or request>',
  kind: CommandKind.BUILT_IN,
  supportedModes: ['interactive'] as const,
  action: async (
    _context: CommandContext,
    args: string,
  ): Promise<WorkflowReturn> => {
    const task = args.trim();
    if (!task) {
      return errorMsg(t('Usage: /ralplan <task or request>'));
    }
    return submitWorkflowPrompt(RALPLAN_INSTRUCTION + `\nRequest: ${task}\n`);
  },
};

// ---------------------------------------------------------------------------
// /self-improve — autonomous evolutionary code improvement
// ---------------------------------------------------------------------------

const SELF_IMPROVE_INSTRUCTION = `[SYSTEM INSTRUCTION — SELF-IMPROVE MODE]

You are now in **self-improve mode** — an autonomous evolutionary code improvement engine with tournament selection.

Steps:
1. **Scan** — Analyze the codebase for improvement opportunities: dead code, redundant patterns, suboptimal abstractions, missing error handling, inconsistent naming.
2. **Score** — Rank candidates by impact (correctness, readability, performance, maintainability) and effort.
3. **Select** — Pick the top improvement using tournament selection: compare candidates pairwise, advance winners.
4. **Apply** — Make the targeted change with minimal diff. Preserve all existing behavior.
5. **Verify** — Run relevant tests or checks to confirm the improvement is sound.
6. **Repeat** — Continue until no high-value improvements remain or the user interrupts.

Rules:
- Each improvement must be independently correct. No cascading changes.
- Never break existing tests or behavior.
- Prefer deletion over addition. Remove code that is not pulling its weight.
- Document each improvement with a brief rationale.
- Stop after a reasonable number of improvements and present a summary.
`;

export const selfImproveCommand: SlashCommand = {
  name: 'self-improve',
  get description() {
    return t(
      'Autonomous evolutionary code improvement engine with tournament selection',
    );
  },
  argumentHint: '[scope or focus area]',
  kind: CommandKind.BUILT_IN,
  supportedModes: ['interactive'] as const,
  action: async (
    _context: CommandContext,
    args: string,
  ): Promise<WorkflowReturn> => {
    const scope = args.trim();
    const scopeHint = scope ? `\nFocus area: ${scope}\n` : '';
    return submitWorkflowPrompt(SELF_IMPROVE_INSTRUCTION + scopeHint);
  },
};

// ---------------------------------------------------------------------------
// /critic — structured code review across multiple perspectives
// ---------------------------------------------------------------------------

const CRITIC_INSTRUCTION = `[SYSTEM INSTRUCTION — CRITIC MODE]

You are now in **critic mode** — structured code review with severity-rated feedback across multiple perspectives.

Steps:
1. **Identify changes** — Determine what code was recently modified. Use git diff, file timestamps, or the user's description.
2. **Multi-perspective review** — Analyze the changes from each perspective:
   - **Correctness**: Logic errors, off-by-one, race conditions, null handling.
   - **Security**: Input validation, injection risks, credential exposure.
   - **Performance**: Unnecessary allocations, O(n²) where O(n) suffices, redundant work.
   - **Readability**: Naming, structure, cognitive load, self-documenting code.
   - **Maintainability**: Coupling, cohesion, test coverage, API surface area.
3. **Rate severity** — For each finding, assign: CRITICAL (must fix), HIGH (should fix), MEDIUM (recommended), LOW (nitpick).
4. **Report** — Present findings grouped by severity, with specific file:line references and actionable fix suggestions.

Rules:
- Every finding must reference specific code. No generic advice.
- Acknowledge what is done well, not just what needs fixing.
- Prioritize correctness and security over style.
- Do not suggest changes outside the scope of the review.
`;

export const criticCommand: SlashCommand = {
  name: 'critic',
  get description() {
    return t(
      'Structured code review with severity-rated feedback across multiple perspectives',
    );
  },
  argumentHint: '[files or diff range]',
  kind: CommandKind.BUILT_IN,
  supportedModes: ['interactive'] as const,
  action: async (
    _context: CommandContext,
    args: string,
  ): Promise<WorkflowReturn> => {
    const target = args.trim();
    const targetHint = target ? `\nReview target: ${target}\n` : '';
    return submitWorkflowPrompt(CRITIC_INSTRUCTION + targetHint);
  },
};

// ---------------------------------------------------------------------------
// /skillify — extract repeatable skill from conversation
// ---------------------------------------------------------------------------

const SKILLIFY_INSTRUCTION = `[SYSTEM INSTRUCTION — SKILLIFY MODE]

You are now in **skillify mode** — extract a repeatable skill from the current conversation.

Steps:
1. **Analyze the conversation** — Identify the core workflow or pattern that was executed. What problem was solved? What steps were taken? What tools were used?
2. **Generalize** — Abstract away specifics into reusable steps. Replace concrete file paths, names, and values with placeholders or descriptions.
3. **Define the skill** — Produce a skill definition including:
   - Name and description (when to trigger)
   - Trigger patterns (keywords, phrases)
   - Step-by-step instructions
   - Required tools and context
   - Expected inputs and outputs
4. **Validate** — Check that the skill is self-contained and could be applied to similar problems without the original conversation context.
5. **Output** — Present the skill definition in a structured format ready for registration.

Rules:
- The skill must be genuinely repeatable, not a one-off solution.
- Include guard conditions: when NOT to apply this skill.
- Keep instructions concrete and actionable. Avoid vague steps.
- The skill should work for a competent agent with no prior context.
`;

export const skillifyCommand: SlashCommand = {
  name: 'skillify',
  get description() {
    return t(
      'Extract a repeatable skill from the current conversation',
    );
  },
  kind: CommandKind.BUILT_IN,
  supportedModes: ['interactive'] as const,
  action: async (
    _context: CommandContext,
    _args: string,
  ): Promise<WorkflowReturn> => {
    return submitWorkflowPrompt(SKILLIFY_INSTRUCTION);
  },
};
