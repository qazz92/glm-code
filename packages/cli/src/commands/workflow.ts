/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * CLI subcommand: glm workflow <name> [options]
 * Provides headless execution of workflow commands via the existing
 * `--prompt` / positional-prompt infrastructure.
 */

import type { Argv, CommandModule } from 'yargs';

const WORKFLOW_COMMANDS = [
  'autopilot',
  'ralph',
  'ultrawork',
  'team',
  'plan',
  'deep-dive',
  'trace',
  'ultraqa',
  'debug',
  'verify',
  'yolo',
  'ralplan',
  'self-improve',
  'critic',
  'skillify',
] as const;

type WorkflowName = (typeof WORKFLOW_COMMANDS)[number];

const WORKFLOW_PROMPTS: Record<WorkflowName, string> = {
  autopilot:
    'SYSTEM INSTRUCTION: You are now in AUTOPILOT mode. Execute the following task end-to-end: analyze the request, design the solution, plan the implementation, write the code, run tests, and verify. Do not stop until the task is fully complete and verified.\n\n',
  ralph:
    'SYSTEM INSTRUCTION: You are now in RALPH mode. This is a PRD-driven persistence loop. Read any PRD or requirements document, implement each story/requirement one by one, verify each implementation, and do not stop until ALL stories are verified as complete.\n\n',
  ultrawork:
    'SYSTEM INSTRUCTION: You are now in ULTRAWORK mode. Break the following task into independent subtasks that can be executed in parallel. Use the Task tool to delegate each subtask to a sub-agent. Aggregate results when all sub-agents complete.\n\n',
  team:
    'SYSTEM INSTRUCTION: You are now in TEAM mode. Coordinate N agents on a shared task list. Break the work into assignable units, delegate to sub-agents via the Task tool, monitor progress, and aggregate results.\n\n',
  plan:
    'SYSTEM INSTRUCTION: You are now in PLAN mode. Analyze the request and produce a detailed implementation plan with specific files to create/modify, component designs, and execution steps. Do NOT implement — only plan.\n\n',
  'deep-dive':
    'SYSTEM INSTRUCTION: You are now in DEEP-DIVE mode. Stage 1: Trace and investigate the root cause. Stage 2: Conduct a deep interview to crystallize requirements.\n\n',
  trace:
    'SYSTEM INSTRUCTION: You are now in TRACE mode. Perform evidence-driven causal tracing with competing hypotheses. For each hypothesis, gather evidence for and against. Track uncertainty levels.\n\n',
  ultraqa:
    'SYSTEM INSTRUCTION: You are now in ULTRAQA mode. Run a QA cycle: test → verify → fix → repeat until all acceptance criteria are met. Do not stop until all tests pass.\n\n',
  debug:
    'SYSTEM INSTRUCTION: You are now in DEBUG mode. Diagnose the current session or repository state. Use systematic debugging: reproduce, isolate, identify root cause, propose fix.\n\n',
  verify:
    'SYSTEM INSTRUCTION: You are now in VERIFY mode. Collect concrete evidence that the implementation works as specified. Run tests, check outputs, verify edge cases. No claims without evidence.\n\n',
  yolo:
    'SYSTEM INSTRUCTION: YOLO mode activated — auto-approve all tool calls. Execute the task without asking for confirmation.\n\n',
  ralplan:
    'SYSTEM INSTRUCTION: You are now in RALPLAN mode. This is a consensus planning entrypoint. Analyze the request, consider multiple approaches, weigh tradeoffs, and produce a plan that the user can approve before execution.\n\n',
  'self-improve':
    'SYSTEM INSTRUCTION: You are now in SELF-IMPROVE mode. Analyze the current codebase for improvement opportunities. Focus on code quality, performance, error handling, and maintainability. Make targeted improvements.\n\n',
  critic:
    'SYSTEM INSTRUCTION: You are now in CRITIC mode. Review the recent changes critically. Look for bugs, design flaws, missing error handling, test gaps, and potential improvements. Be thorough and specific.\n\n',
  skillify:
    'SYSTEM INSTRUCTION: You are now in SKILLIFY mode. Analyze the current conversation for repeatable workflow patterns. Extract a reusable skill definition that can be applied to similar tasks in the future.\n\n',
};

/**
 * Build a yargs subcommand for a single workflow name.
 *
 * The handler composes the workflow's system-instruction prefix with the
 * user-supplied prompt text and writes the combined string to
 * `argv.prompt`. The top-level CLI config then picks this up and routes
 * it through the standard headless path — no argv mutation needed.
 */
function buildWorkflowCommand(name: WorkflowName): CommandModule {
  return {
    command: name,
    describe: `Run ${name} workflow in headless mode`,
    builder: (yargs: Argv) =>
      yargs.option('prompt', {
        alias: 'p',
        type: 'string',
        description: 'Prompt text for the workflow',
      }),
    handler: (argv) => {
      const prefix = WORKFLOW_PROMPTS[name];
      const userPrompt = (argv['prompt'] as string | undefined) ?? '';
      // Inject the composed prompt back into argv so the headless runner
      // in config.ts processes it. The top-level .check() validation
      // already ran by the time subcommand handlers execute, so mutating
      // argv.prompt here is safe.
      argv['prompt'] = `${prefix}USER REQUEST: ${userPrompt}`;
    },
  };
}

export const workflowCommand: CommandModule = {
  command: 'workflow',
  describe: 'Run workflow subcommands in headless mode',
  builder: (yargs: Argv) => {
    let y = yargs.version(false);
    for (const name of WORKFLOW_COMMANDS) {
      y = y.command(buildWorkflowCommand(name));
    }
    return y.demandCommand(
      1,
      'You need at least one workflow command before continuing.',
    );
  },
  handler: () => {},
};

export { WORKFLOW_COMMANDS, WORKFLOW_PROMPTS };
