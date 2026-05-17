# Plan Review Agent Orchestration E2E Test Plan

## Goal

Verify that GLM Code exposes a native `/plan-review` orchestration command and
built-in specialist plan-review agents for product, UX, and technical lenses.

## Baseline dry-run against global `glm`

Command run before implementation:

```bash
glm --auth-type openai --openai-api-key dummy \
  --openai-base-url http://127.0.0.1:9 \
  --bare --output-format json -p "/plan-review PLAN.md"
```

Observed baseline:

- In bare mode, bundled skills are skipped; the `slash_commands` init event did
  not include `/plan-review`.
- The baseline then attempted a model call and failed against the dummy endpoint,
  which is expected and not a command-level assertion.

A non-bare baseline would be expected to include existing bundled commands such
as `/review` but not `/plan-review`. Use the local post-build command below for
final verification because it inspects the structured init event before the dummy
API error.

## Test group 1 — command discovery

Temp/session: `glm-plan-review-discovery`

Command after local build and bundle:

```bash
node dist/cli.js --auth-type openai --openai-api-key dummy \
  --openai-base-url http://127.0.0.1:9 \
  --output-format json -p "/plan-review PLAN.md"
```

Expected post-implementation behavior:

- The first `system/init` JSON event includes `plan-review` in
  `slash_commands`.
- The same init event includes these agent names in `agents`:
  - `product-plan-reviewer`
  - `ux-plan-reviewer`
  - `technical-plan-reviewer`
- The run may end with a dummy endpoint API connection error; that is acceptable
  because this test only verifies command/agent discovery.

## Test group 2 — native command routing

Temp/session: `glm-plan-review-command-loader`

Focused unit test:

```bash
cd packages/cli && npx vitest run \
  src/ui/commands/planReviewCommand.test.ts \
  src/services/BundledSkillLoader.test.ts
```

Expected:

- `/plan-review PLAN.md --all` submits the native
  `PLAN_REVIEW_ORCHESTRATION` marker prompt.
- The bundled fallback skill does not register as the slash command route.
- Bundled skill commands other than plan-review still submit their skill body.

## Test group 3 — built-in agent registry

Temp/session: `glm-plan-review-agent-registry`

Focused unit test:

```bash
cd packages/core && npx vitest run src/subagents/builtin-agents.test.ts
```

Expected:

- Registry includes all three plan-reviewer agents.
- Each has a read-only tool allowlist and a useful description.

## Test group 4 — bundled skill parsing

Temp/session: `glm-plan-review-skill-manager`

Focused unit test:

```bash
cd packages/core && npx vitest run \
  src/skills/skill-manager.test.ts \
  src/orchestrator/plan-review.test.ts
```

Expected:

- Bundled skill loading still works.
- The `plan-review` bundled skill parses with its argument hint and
  model-invocation metadata.
- Natural-language and marker-based plan-review requests inject specialized
  product/UX/technical fan-out instructions from the core orchestrator.

## Regression checks

Run before declaring done:

```bash
npm run build
npm run typecheck
npm run bundle
```

Optional smoke:

```bash
node dist/cli.js --auth-type openai --openai-api-key dummy \
  --openai-base-url http://127.0.0.1:9 \
  --output-format json -p "/plan-review PLAN.md --all" \
  | head -n 5
```

## Post-implementation results

### Focused unit tests

Passed:

```bash
cd packages/core && npx vitest run src/subagents/builtin-agents.test.ts src/skills/skill-manager.test.ts
# 2 files passed, 77 tests passed

cd packages/cli && npx vitest run src/services/BundledSkillLoader.test.ts
# 1 file passed, 15 tests passed
```

Updated native-orchestration focused tests passed:

```bash
cd packages/core && npx vitest run src/orchestrator/plan-review.test.ts src/subagents/builtin-agents.test.ts src/skills/skill-manager.test.ts src/telemetry/uiTelemetry.test.ts
# 4 files passed, 111 tests passed

cd packages/cli && npx vitest run src/ui/commands/planReviewCommand.test.ts src/services/BundledSkillLoader.test.ts src/services/BuiltinCommandLoader.test.ts
# 3 files passed, 27 tests passed
```

### Build checks

Passed:

```bash
npm run build
npm run typecheck
npm run bundle
```

### Local smoke

Command:

```bash
node dist/cli.js --auth-type openai --openai-api-key dummy \
  --openai-base-url http://127.0.0.1:9 \
  --output-format json -p "/plan-review PLAN.md --all"
```

Parsed init event results:

- `plan-review` command present: yes
- `product-plan-reviewer` agent present: yes
- `ux-plan-reviewer` agent present: yes
- `technical-plan-reviewer` agent present: yes

Observed workflow behavior:

- The native command expansion emits `PLAN_REVIEW_ORCHESTRATION`.
- The core orchestrator turns that marker into a system instruction containing
  `product-plan-reviewer`, `ux-plan-reviewer`, and
  `technical-plan-reviewer`.
- The bundled fallback skill has `disable-model-invocation: true`.
