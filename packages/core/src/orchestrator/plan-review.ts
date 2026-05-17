/**
 * @license
 * Copyright 2026 GLM Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * Native plan-review routing — specialized orchestration for reviewing plans
 * through multiple isolated sub-agents instead of loading a plain skill body
 * into the main conversation context.
 */

export const PLAN_REVIEW_ORCHESTRATION_MARKER = 'PLAN_REVIEW_ORCHESTRATION';

const PLAN_TERMS = [
  /\bplan(?:\.md)?\b/i,
  /\bdesign(?:\.md)?\b/i,
  /\bproposal\b/i,
  /\bspec\b/i,
  /\broadmap\b/i,
  /기획/,
  /계획/,
  /설계/,
  /플랜/,
];

const REVIEW_TERMS = [
  /\breview\b/i,
  /\bcritique\b/i,
  /\bfeedback\b/i,
  /\bevaluate\b/i,
  /리뷰/,
  /검토/,
  /봐줘/,
  /피드백/,
  /평가/,
];

export function isPlanReviewRequest(prompt: string): boolean {
  if (prompt.includes(PLAN_REVIEW_ORCHESTRATION_MARKER)) {
    return true;
  }

  const mentionsPlan = PLAN_TERMS.some((pattern) => pattern.test(prompt));
  const asksForReview = REVIEW_TERMS.some((pattern) => pattern.test(prompt));
  return mentionsPlan && asksForReview;
}

export function buildPlanReviewOrchestrationInstruction(): string {
  return [
    `SYSTEM: ${PLAN_REVIEW_ORCHESTRATION_MARKER}`,
    '',
    'This user request is a plan-review workflow. Route it through native sub-agent fan-out to preserve the main context window.',
    '',
    'Mandatory workflow:',
    '1. Resolve the plan path with minimal main-context inspection only. If the prompt names a file, use that. Otherwise prefer PLAN.md, DESIGN.md, recent .glm/design/*.md, then recent docs/plans/*.md.',
    '2. Select review lenses from the request flags and plan scope:',
    '   - product-plan-reviewer: product value, scope, rollout, adoption, compatibility, success metrics, positioning, packaging, onboarding, customer-facing behavior.',
    '   - ux-plan-reviewer: CLI/TUI/web UI, command names, prompts, output formatting, error messages, docs, onboarding, accessibility, user journeys.',
    '   - technical-plan-reviewer: architecture, code/API/data-flow changes, lifecycle, permissions, migrations, testing, performance, packaging, CI, compatibility.',
    '   - If the request has --all, run all three. If it has explicit --product/--ux/--technical flags, run exactly those lenses. Without explicit flags, prefer all three for product-feature plans; for purely internal maintenance, technical-only is acceptable if you briefly state why.',
    '3. Your first assistant action after resolving the plan path MUST be Agent tool calls for the selected reviewers. Do not perform the full review in the main thread.',
    '4. When more than one reviewer is selected, launch all selected Agent tool calls in the same assistant turn so they run concurrently.',
    '5. Use these subagent_type values exactly: product-plan-reviewer, ux-plan-reviewer, technical-plan-reviewer.',
    '6. Each reviewer prompt must include the absolute plan path, why that lens was selected, instructions to read the plan and minimal relevant context themselves, review-only/no edits, and a required verdict of APPROVE, REQUEST_CHANGES, or NEEDS_CLARIFICATION with concrete plan changes.',
    '7. After reviewers return, synthesize a concise final report with: Verdict, Lenses Run, Blocking Issues, Important Improvements, Cross-Lens Conflicts, Recommended Plan Revisions, and Acceptance Criteria Fixes.',
    '',
    'Do not use the Skill tool for plan-review. This is native orchestration, not a skill-body review.',
  ].join('\n');
}
