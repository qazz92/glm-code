---
name: plan-review
description: Review implementation plans before coding by automatically routing to product, UX, and technical plan-review agents.
when_to_use: Use when the user asks to review PLAN.md, a design doc, an implementation plan, roadmap, spec, or proposal before implementation; also use when the user asks for product/UX/technical critique of a plan.
argument-hint: '[plan-path] [--all|--product|--ux|--technical]'
disable-model-invocation: true
allowedTools:
  - agent
  - read_file
  - grep_search
  - glob
  - list_directory
---

# Plan Review

Prefer the native `/plan-review` orchestration route. This bundled skill is a
fallback copy of the workflow only; the model should not invoke it directly.

You are orchestrating a multi-perspective review of a plan before implementation.
Your job is to read the plan, choose the relevant specialist lenses, delegate the
review work, and synthesize the final answer. This is a review-only workflow.
Do not edit files unless the user explicitly asks for a follow-up rewrite after
the review is complete.

## Arguments

The raw slash-command invocation is appended after this skill body. Parse it for:

- `plan-path`: optional path to a plan file.
- `--all`: force product, UX, and technical reviews.
- `--product`: include only the product lens, unless combined with other lens flags.
- `--ux`: include only the UX lens, unless combined with other lens flags.
- `--technical`: include only the technical lens, unless combined with other lens flags.

If one or more explicit lens flags are present, run exactly those lenses. If no
lens flags are present, use automatic routing.

## Step 1 — Resolve and read the plan

If the invocation includes a path, read that file. If no path is provided, find a
likely plan file in this order:

1. `PLAN.md`
2. `DESIGN.md`
3. recent `.glm/design/*.md`
4. recent `docs/plans/*.md`

If no plan file can be found, ask the user for the path and stop.

Read the full plan before launching reviewers. If the plan references key files
or docs needed to understand scope, inspect only the minimum context needed for
routing and reviewer prompts.

## Step 2 — Select review lenses

Available lenses:

| Lens      | Agent                     | Include when                                                                                                                                                             |
| --------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Product   | `product-plan-reviewer`   | The plan changes user value, product scope, rollout, adoption, positioning, compatibility, success metrics, pricing, packaging, onboarding, or customer-facing behavior. |
| UX        | `ux-plan-reviewer`        | The plan affects CLI/TUI/web UI, commands, prompts, output formatting, error messages, docs, onboarding, accessibility, or any user journey.                             |
| Technical | `technical-plan-reviewer` | The plan changes architecture, code, APIs, state, data flow, migrations, permissions, lifecycle, testing, performance, packaging, CI, or compatibility.                  |

Automatic routing rules:

- Include `technical-plan-reviewer` for any implementation plan that touches code
  or architecture.
- Include `ux-plan-reviewer` for any user-facing command, UI, output, error,
  documentation, workflow, or onboarding change.
- Include `product-plan-reviewer` for any plan with user-visible value, scope,
  rollout, compatibility, adoption, or strategic tradeoffs.
- If a lens is plausibly relevant and the cost of missing it is higher than the
  cost of running it, include it.
- For ambiguous product-feature plans, prefer all three lenses.
- For purely internal maintenance plans, it is acceptable to run only the
  technical lens and explain that product/UX were not materially relevant.

## Step 3 — Launch reviewers concurrently

Launch the selected reviewers with the Agent tool. When launching more than one,
use a single assistant message containing multiple Agent tool calls so they run
concurrently.

Each reviewer prompt must include:

- The absolute plan path.
- The reason this lens was selected.
- The instruction to read the plan and any minimal relevant context themselves.
- The instruction to return `APPROVE`, `REQUEST_CHANGES`, or
  `NEEDS_CLARIFICATION` with concrete plan changes.
- The instruction that this is review-only and they must not edit files.

Use these subagent types exactly:

- `product-plan-reviewer`
- `ux-plan-reviewer`
- `technical-plan-reviewer`

If a selected specialist is unavailable, fall back to `critic` and explicitly
state which lens the critic should perform.

## Step 4 — Aggregate the result

After the reviewers return, synthesize one final report for the user. Do not dump
raw reviewer output. Deduplicate findings and identify cross-lens conflicts.

Use this output shape:

```md
# Plan Review

## Verdict

APPROVE | REQUEST_CHANGES | NEEDS_CLARIFICATION

## Lenses Run

- Product: run/skipped — reason
- UX: run/skipped — reason
- Technical: run/skipped — reason

## Blocking Issues

- [Lens] Issue — why it matters — concrete plan change

## Important Improvements

- [Lens] Improvement — why it matters — concrete plan change

## Cross-Lens Conflicts

- Conflict or "None"

## Recommended Plan Revisions

1. Concrete revision to make in the plan
2. ...

## Acceptance Criteria Fixes

- Add/replace acceptance criteria that make completion objectively verifiable
```

Verdict rules:

- `REQUEST_CHANGES` if any reviewer reports a blocking flaw or if the plan is
  internally inconsistent.
- `NEEDS_CLARIFICATION` if reviewers cannot evaluate the plan because key
  decisions are missing.
- `APPROVE` only when the selected lenses find no blocking issues and acceptance
  criteria are testable.

Keep the report concise. Prioritize issues that should change the plan before
implementation.
