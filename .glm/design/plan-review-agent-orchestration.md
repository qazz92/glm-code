# Plan Review Agent Orchestration

## Problem statement

GLM Code can already write plans (`planner`) and review changed code (`/review`,
`critic`, `code-reviewer`), but it does not have a first-class product feature
for reviewing a plan before implementation. In practice, users ask things like
"review PLAN.md" and the model may opportunistically delegate to the generic
`critic` agent, but that behavior is not explicit, discoverable, or
multi-perspective.

We want an OpenAgent-style plan review workflow that reads a plan artifact and
routes review work to the relevant specialist lenses before implementation
starts.

## Current state

- Built-in subagents live in `packages/core/src/subagents/builtin-agents.ts`.
  Existing relevant agents are `planner`, `architect`, `critic`, and
  `code-reviewer`.
- Bundled slash-command skills live in
  `packages/core/src/skills/bundled/<name>/SKILL.md` and are loaded by
  `BundledSkillLoader` as `/name` commands. `/review` is implemented this way.
- The Agent tool dynamically exposes built-in, project, user, session, and
  extension subagents.
- The long-horizon pipeline is `plan -> scaffold -> execute -> verify -> test ->
review`, but the review phase is code-review oriented; there is no explicit
  plan-review phase or specialist plan reviewer.

## Proposed user-facing feature

Add a native `/plan-review` orchestration command that reviews plan documents
before coding.

Example invocations:

```bash
/plan-review PLAN.md
/plan-review .glm/design/my-feature.md --all
/plan-review PLAN.md --technical --ux
/plan-review --product .glm/design/strategy.md
```

If no path is provided, the command should instruct the model to discover likely
plan files in this order:

1. `PLAN.md`
2. `DESIGN.md`
3. recent files under `.glm/design/*.md`
4. recent files under `docs/plans/*.md`

## Review lenses and routing

The workflow uses three specialist built-in subagents:

| Lens      | Subagent                  | Use when                                                                                    |
| --------- | ------------------------- | ------------------------------------------------------------------------------------------- |
| Product   | `product-plan-reviewer`   | user value, scope, rollout, positioning, success criteria, business/product tradeoffs       |
| UX        | `ux-plan-reviewer`        | CLI/TUI/web interaction, command names, output formatting, accessibility, docs/user journey |
| Technical | `technical-plan-reviewer` | architecture, data flow, migration, failure modes, tests, compatibility, performance        |

Default mode is automatic routing: read the plan, classify which lenses are
materially relevant, and launch only those reviewers. If classification is
ambiguous, prefer inclusion over omission. `--all` forces all three lenses.
Explicit lens flags (`--product`, `--ux`, `--technical`) restrict the run to
those lenses.

## Orchestration behavior

The `/plan-review` command emits a native orchestration marker. The core
orchestrator detects either that marker or a natural-language plan-review
request and injects a mandatory fan-out instruction that makes the main agent:

1. Resolve the plan target and read it.
2. Identify relevant lenses from plan content and command flags.
3. Launch selected specialist subagents concurrently using one Agent-tool batch.
4. Aggregate the returned reviews into a single concise report.
5. Produce a verdict:
   - `APPROVE` — plan is ready to execute.
   - `REQUEST_CHANGES` — plan has blocking issues.
   - `NEEDS_CLARIFICATION` — missing decisions prevent useful review.
6. Highlight cross-lens conflicts and recommend concrete plan revisions.

The command is review-only by default: it must not edit the plan unless a future
explicit write/update flag is introduced.

## Design decisions

### Native command vs bundled skill

Use a hard-coded slash command plus a core orchestrator detector. A bundled skill
was too weak for this product goal because it only loaded instructions into the
main context and relied on the model to decide whether to delegate. Native
orchestration makes plan review an explicit route: `/plan-review` injects a
marker, and natural-language "review PLAN.md" prompts can also receive the same
sub-agent fan-out instruction.

Keep the bundled skill body only as a fallback/documentation copy and mark it
`disable-model-invocation: true` so model routing does not surface as
`Skill Use skill: "plan-review"`.

### Built-in subagents vs one monolithic reviewer

Use separate built-in subagents for product, UX, and technical review. This makes
routing explicit, improves Agent-tool discovery, and lets the main workflow run
only matching lenses instead of always paying for every review.

### Automatic routing default

Defaulting to automatic routing matches the user's preference: review all lenses
when appropriate, but avoid irrelevant reviews for purely technical or purely
product plans. The prompt will bias toward inclusion when uncertain to reduce
false negatives.

### No plan mutation in v1

The first version only reports. Updating or rewriting the plan is deliberately
left out to avoid surprising edits and to keep the review workflow safe in plan
mode.

## Files affected

- `packages/core/src/subagents/builtin-agents.ts`
  - add `product-plan-reviewer`, `ux-plan-reviewer`, and
    `technical-plan-reviewer` built-in subagents.
- `packages/core/src/subagents/builtin-agents.test.ts`
  - assert that the new built-ins exist and are read-only scoped.
- `packages/core/src/skills/bundled/plan-review/SKILL.md`
  - keep fallback workflow copy, hidden from model invocation.
- `packages/core/src/orchestrator/plan-review.ts`
  - detect plan-review requests and build the native fan-out instruction.
- `packages/core/src/orchestrator/orchestrator.ts`
  - inject specialized plan-review fan-out instead of generic executor fan-out.
- `packages/cli/src/ui/commands/planReviewCommand.ts`
  - add the built-in `/plan-review` command that emits the native marker.
- `packages/cli/src/services/BundledSkillLoader.ts`
  - keep the bundled fallback from overriding the native command.
- `packages/core/src/skills/skill-manager.test.ts`
  - extend bundled-skill parsing coverage for `plan-review`.
- `docs/users/features/plan-review.md`
  - document the feature.
- `docs/users/features/_meta.ts`
  - expose docs navigation.

## Scope boundaries

In scope:

- A discoverable `/plan-review` command.
- Three built-in plan-review specialist agents.
- Automatic lens routing instructions.
- Focused tests for registry and bundled skill loading.
- User documentation.

Out of scope for v1:

- A new low-level deterministic plan-review engine.
- Persisted review reports.
- Auto-editing/revising plan files.
- Changing the long-horizon pipeline phase order.
- Running the reviewers without LLM/tool orchestration.

## Open questions

- Should the long-horizon pipeline insert a mandatory `plan-review` gate after
  enough real-world usage validates the workflow?
- Should `/plan-review --update` later rewrite the plan with accepted changes?
- Should project-level teams be able to define additional lenses beyond product,
  UX, and technical?
