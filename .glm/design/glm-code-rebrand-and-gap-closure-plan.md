# GLM Code Rebrand and Feature Gap Closure Plan

- Status: Draft
- Date: 2026-05-15
- Scope: Full GLM-to-GLM rebrand plus implementation-gap closure for the GLM Code claims currently documented in `README.md`.
- Current convention note: this plan is saved under `.glm/design/` because the active repository instructions still designate `.glm/design/` for design artifacts. Phase 3 migrates project artifact paths to `.glm/` as part of the rebrand.

## 1. Requirements Summary

### Primary goals

1. Remove GLM branding and namespaces from the product, source tree, package metadata, scripts, docs, tests, SDKs, and editor extensions.
2. Align implementation with the GLM Code product claims in `README.md` or explicitly downgrade claims that will not ship in this cycle.
3. Preserve repository safety: do not modify `repos/`, do not overwrite unrelated working-tree changes, and keep generated output separate from source changes.
4. Leave the repo in a releasable state: buildable packages, updated tests, no stale GLM references except explicitly approved third-party/reference exceptions.

### Explicit product decision for this plan

The requested direction is **complete GLM-only rebrand**.

Therefore the target state is:

- CLI binary: `glm` only.
- Product namespace: `GLM Code` only.
- Config/home paths: `.glm`, `GLM_HOME`, `GLM_SANDBOX`, `GLM_RUNTIME_DIR`, etc.
- Package scopes: `@glm-code/*` only.
- SDK import/package names: GLM naming only.
- No public `glm`, `.glm`, `GLM_*`, `@glm-code/*`, `glm-code`, or `glm-code` compatibility aliases unless the user later changes the policy.

## 2. Evidence Baseline

These facts motivate the work plan and should be re-checked before implementation begins.

### README claims to satisfy or revise

- GLM key features are documented at `README.md:22-33`.
- `/action` and `/thinking` are documented as user commands at `README.md:131-139`.
- The architecture diagram claims automatic fanout and a 6-phase long-horizon pipeline at `README.md:35-53`.

### Current partial implementations

- Orchestrator is instantiated and wired into the client at `packages/core/src/core/client.ts:214-215` and initialized at `packages/core/src/core/client.ts:242-247`.
- Orchestrator output is injected into requests at `packages/core/src/core/client.ts:1364-1391`.
- Pipeline advancement currently happens after turns at `packages/core/src/core/client.ts:1484-1504`.
- Fanout currently creates instructions, not workers: `packages/core/src/orchestrator/fanout.ts:30-34` and `packages/core/src/orchestrator/fanout.ts:101-109`.
- Pipeline phase data exists at `packages/core/src/orchestrator/pipeline.ts:36-65`, but phase advancement only changes state at `packages/core/src/orchestrator/pipeline.ts:88-95`.
- Acceptance checks mostly delegate or auto-pass at `packages/core/src/workflows/acceptance.ts:30-73`.
- Action registry exists at `packages/core/src/models/action-registry.ts:20-28` and `packages/core/src/models/action-registry.ts:42-115`, but command/hot-path usage is missing.
- Thinking config exists at `packages/core/src/models/thinking-config.ts:15-24` and `packages/core/src/models/thinking-config.ts:51-94`, but command/hot-path usage is missing.
- Permission tier model exists at `packages/core/src/permissions/tool-tiers.ts:6-17` and `packages/core/src/permissions/tool-tiers.ts:65-83`, but current search only found exports, not approval-flow integration.
- Hook SDK `defineHook()` exists at `packages/core/src/hooks/plugin-sdk.ts:61-80`.
- Checkpoint save/load exists at `packages/core/src/orchestrator/checkpoint.ts:48-135`, and long-horizon checkpointing is called at `packages/core/src/orchestrator/orchestrator.ts:286-300`.
- Process recycler class exists at `packages/core/src/core/process-recycler.ts:33-134`, but no usage outside its own file was found.

### Rebrand debt baseline

A case-insensitive scan excluding `.git`, `node_modules`, `coverage`, `repos`, and `dist` found approximately:

- 4,442 GLM references
- 381 files

Largest categories:

- docs: 2,163
- SDK/editor extension files: 849
- scripts/install/release: 620
- integration tests: 355
- other packages: 300
- `.glm`/`.glm` agent artifacts: 104
- root/GitHub metadata: 51

Concrete examples:

- Root sandbox image still references GLM: `package.json:25-27`.
- Root integration scripts still use `GLM_SANDBOX`: `package.json:46-58`.
- CLI package repository and sandbox metadata still reference GLM: `packages/cli/package.json:5-8` and `packages/cli/package.json:39-51`.
- Public OSS setup intentionally started with core-only CI: `.glm/design/public-oss-github-setup.md:17-20`; current CI only runs metadata checks and core build at `.github/workflows/ci.yml:16-67`.

## 3. Non-Goals

- Do not edit or rebrand anything under `repos/`; it is reference/research material only.
- Do not hand-edit generated `dist/` output as the primary source of truth. Clean/rebuild generated files after source changes if this repo intentionally tracks them.
- Do not add compatibility aliases unless the product decision changes from complete rebrand to migration-friendly rebrand.
- Do not change external GitHub repository settings in this implementation plan; verify them separately with `gh` if needed.

## 4. Workstreams and Implementation Steps

### Phase 0 — Safety, branch hygiene, and baseline inventory

1. Record current working tree before changes.
   - Use `git status --short --branch`.
   - Identify existing modified/untracked files so implementation does not overwrite unrelated user work.
2. Create a dedicated implementation branch.
   - Suggested branch: `rebrand/glm-code-complete`.
3. Generate a machine-readable GLM inventory.
   - Suggested output: `.glm/rebrand/glm-inventory.json` or `.glm/rebrand/glm-inventory.md`.
   - Exclude `.git`, `node_modules`, `coverage`, `repos`, and generated `dist` on the first pass.
   - Re-run after each major phase.
4. Classify each remaining GLM hit as:
   - source/product string
   - package metadata
   - test fixture/snapshot
   - docs
   - generated artifact
   - third-party/reference exception

Acceptance criteria:

- Inventory exists and includes file path, line number, match string, category, and planned action.
- No source edit occurs before inventory classification is complete.
- `repos/` is explicitly excluded from implementation changes.

### Phase 1 — Canonical GLM naming and package identity

1. Root package metadata.
   - Keep `package.json` name as `@glm-code/glm-code`.
   - Replace sandbox image config at `package.json:25-27` with a GLM-owned image name or remove it until a GLM image is published.
   - Rename GLM-specific npm scripts in `package.json:46-58` to GLM env vars and GLM test names.
2. Workspace package metadata.
   - Fix `packages/cli/package.json:7` repository URL from GLM path to the actual GLM repo.
   - Fix `packages/cli/package.json:40` sandbox image.
   - Rename `@glm-code/core` at `packages/cli/package.json:51` to `@glm-code/core` and update imports/lockfile accordingly.
   - Audit all `packages/*/package.json` files for name, description, keywords, repository, bugs, homepage, bin, exports, and package scopes.
3. TypeScript SDK.
   - Rename docs/metadata from GLM to GLM.
   - Ensure import examples use `@glm-code/sdk`.
4. Python SDK.
   - Rename package from `glm-code-sdk` to a GLM name such as `glm-code-sdk`.
   - Rename import module from `glm_code_sdk` to `glm_code_sdk`.
   - Update tests, docs, build config, pyproject metadata, and examples.
5. Java SDK.
   - Rename Maven artifact and Java package away from `glm-code-sdk` / `ai.glm.code`.
   - Suggested target: artifact `glm-code-sdk`, package `ai.glm.code` or the final owner-approved namespace.
6. Editor extensions.
   - VS Code: change publisher/name/display identifiers, commands, settings, views, activation events, and docs from `glm-code.*` / `glm.diff.*` to `glm-code.*` / `glm.diff.*`.
   - Zed: change extension id, name, repository, archive/package references.
7. Regenerate lockfile after package metadata and workspace dependency changes.

Acceptance criteria:

- `npm install` completes without `@glm-code/*` workspace package references.
- Package metadata scan returns no GLM refs outside approved generated/reference exceptions.
- `npm run build --workspace=packages/core` and `npm run build --workspace=packages/cli` pass after dependency rename.

### Phase 2 — Runtime namespace migration

1. Environment variables.
   - Rename `GLM_SANDBOX` to `GLM_SANDBOX`.
   - Rename `GLM_HOME` to `GLM_HOME`.
   - Rename `GLM_RUNTIME_DIR` to `GLM_RUNTIME_DIR`.
   - Rename any `GLM_CODE_*`, `GLM_SERVER_TOKEN`, package archive env vars, or telemetry namespace env vars to `GLM_*`.
2. Filesystem paths.
   - Rename `.glm` runtime/config references to `.glm`.
   - Rename `.glmignore` to `.glmignore` if present.
   - Update settings schema, config loading, tests, docs, and integration helpers.
3. CLI binary and release artifacts.
   - Ensure all shims and package archives produce `glm`, not `glm`.
   - Update standalone package scripts under `scripts/`.
   - Update install scripts under `scripts/installation/` from GLM-specific filenames and release URLs to GLM-specific ones.
4. Docker/sandbox.
   - Rename sandbox image, container labels, default command, and docs.
   - Decide whether the GLM sandbox image is published now or sandbox build remains source-only until publishing.

Acceptance criteria:

- New clean HOME starts with `~/.glm`, not `~/.glm`.
- Integration helpers create `.glm/settings.json`, not `.glm/settings.json`.
- `glm --version` or equivalent package command works from built output.
- No root script requires `GLM_*` env vars.

### Phase 3 — Documentation, repo artifacts, and agent artifacts

1. Migrate project artifact convention.
   - Update `AGENTS.md` project directories from `.glm/*` to `.glm/*`.
   - Move current planning/design artifacts to `.glm/design/` after repo instruction update.
   - Update any command/skill docs that create `.glm/issues`, `.glm/e2e-tests`, `.glm/pr-drafts`, etc.
2. User docs.
   - Update `docs/users/**` for GLM install, config, auth, memory, headless, extension, GitHub Action, and quickstart.
   - Rename or remove `docs/users/glm-serve.md` depending on final server command naming.
3. Developer docs.
   - Update `docs/developers/**` for GLM package names, release process, telemetry, SDK docs, and roadmap.
   - Change `docs/developers/roadmap.md:1` from GLM Code roadmap to GLM Code roadmap.
4. Internal `.glm` agent/skill artifacts.
   - Rebrand `.glm/agents/test-engineer.md`, `.glm/skills/e2e-testing`, `.glm/commands/qc/*`, and remove/rename `.glm/skills/glm-code-claw`.
5. GitHub/community files.
   - Ensure issue templates, support, security, CodeQL, Dependabot, CODEOWNERS, and CI use GLM naming consistently.

Acceptance criteria:

- Docs scan has no GLM references except an explicitly approved changelog/history section, if any.
- `AGENTS.md` no longer tells agents to use GLM Code, global `glm`, or `.glm` artifacts.
- All local automation docs invoke `glm`.

### Phase 4 — Feature gap closure for README claims

This phase either implements the claim or downgrades the documentation. The default target is to implement the claim where feasible.

#### 4.1 `/action` command

Tasks:

1. Add a CLI command for `/action` using existing command patterns in `packages/cli/src/ui/commands/` and command loader registration.
2. Use `ACTION_NAMES`, `ACTION_MAP`, and `setActiveAction()` from `packages/core/src/models/action-registry.ts`.
3. Apply action model/thinking/temperature to the active session request path.
4. Show current action and available actions in command output/help.
5. Add unit tests for valid action, invalid action, and persistence/session behavior.

Acceptance criteria:

- `/action plan` changes the effective model/thinking/temperature for subsequent requests.
- Invalid action prints valid names and does not mutate state.
- `/help` lists `/action` accurately.

#### 4.2 `/thinking` command

Tasks:

1. Add `/thinking <level>` command.
2. Use `THINKING_LEVELS`, `setThinkingLevel()`, and `buildThinkingConfig()` from `packages/core/src/models/thinking-config.ts`.
3. Wire resolved thinking budget into the actual LLM API request configuration for GLM/OpenAI-compatible generation.
4. Add tests for each level and invalid input.

Acceptance criteria:

- `/thinking high` changes the request thinking budget to 65,536 tokens where supported.
- `/thinking off` sends no thinking budget.
- `/help` lists `/thinking` accurately.

#### 4.3 Fanout execution

Tasks:

1. Decide whether fanout should be automatic executor behavior or only model guidance.
2. If automatic, connect `planFanout()` output to the existing subagent/task execution path rather than only injecting an instruction.
3. Enforce dependency waves: executors in wave 1, verifier/integrator in wave 2.
4. Capture subagent results in a structured aggregation object.
5. Add tests for LARGE classification resulting in subagent execution, not just prompt text.

Acceptance criteria:

- A LARGE task creates and executes multiple subagents in independent waves.
- Failure in one subagent is visible to the verifier and final result.
- If automatic fanout is not implemented this cycle, README must be changed to state “fanout guidance” rather than “parallel sub-agent waves.”

#### 4.4 Pipeline acceptance gates

Tasks:

1. Replace turn-count phase advancement with explicit phase completion.
2. Require `completePhase()` only after phase-specific acceptance criteria pass.
3. Replace auto-pass checks in `acceptance.ts` with real checks or explicit “not implemented” failures.
4. Persist phase outputs so the next phase receives previous phase results.
5. Make `isPipelineComplete()` reachable only after review phase completion.
6. Add tests for pass, fail, retry budget, and no-auto-advance behavior.

Acceptance criteria:

- Pipeline does not advance from `plan` to `scaffold` unless plan acceptance passes.
- Unknown acceptance criteria fail closed, not pass open.
- Failed phases respect retry budget and expose failure reason.

#### 4.5 3-tier permission system integration

Tasks:

1. Wire `shouldAutoApprove()` into the actual approval/permission flow.
2. Map existing approval modes to `YoloMode` without surprising behavior.
3. Enforce workspace containment for Tier B.
4. Keep Tier C confirmation mandatory unless explicit full mode is chosen.
5. Add tests for Tier A read-only, Tier B workspace edit, Tier B outside workspace, Tier C destructive/external, and unknown tools.

Acceptance criteria:

- In default/safe mode, destructive tools still require confirmation.
- In tier-b/yolo mode, workspace edits can auto-approve but outside-workspace writes cannot.
- Unknown tools default to Tier C behavior.

#### 4.6 Crash recovery and checkpoint resume

Tasks:

1. Ensure checkpoint state includes full orchestrator/pipeline state, active workers, context summary, and dirty files.
2. Save checkpoints at deterministic boundaries for long-horizon work and before risky transitions.
3. Add startup/resume flow that finds and validates latest checkpoint.
4. Add a user-visible resume command or prompt.
5. Add tests for save, load, invalid checkpoint, and resume after interrupted long-horizon pipeline.

Acceptance criteria:

- A simulated crash during a long-horizon pipeline can resume with the same phase and prior outputs.
- Corrupt checkpoint is ignored safely with a clear message.
- Checkpoint cleanup preserves the newest recoverable checkpoints.

#### 4.7 Process recycling

Tasks:

1. Instantiate `ProcessRecycler` in the main CLI/session lifecycle.
2. Mark LLM calls in-flight before/after `turn.run()`.
3. Call `checkAfterTurn()` at safe turn boundaries.
4. Implement recycle callback for graceful restart or, if impossible in this runtime, downgrade README claim.
5. Add unit/integration tests using a low test heap threshold or injectable threshold.

Acceptance criteria:

- Memory threshold schedules recycle but never interrupts an in-flight LLM call.
- Callback is invoked at a turn boundary.
- If no callback is configured, product docs do not claim automatic restart.

#### 4.8 Notifications

Tasks:

1. Audit implemented channels.
2. Either implement Discord and Slack reply daemon support or revise README to list only supported channels.
3. Add channel tests for inbound reply routing if implemented.

Acceptance criteria:

- README notification claim exactly matches implemented channels.
- Telegram/Discord/Slack claims each have tests or are removed from docs.

### Phase 5 — Public OSS hardening

1. CI coverage.
   - Keep current `Repository hygiene` and `Core build` jobs.
   - Add staged jobs for CLI build, typecheck, lint, and targeted tests once workspace issues are fixed.
2. Branch protection.
   - After workflows land on `main`, use `gh` to verify required checks include `Repository hygiene` and `Core build`.
   - Later require full monorepo build/typecheck jobs.
3. Release workflow.
   - Ensure release scripts publish GLM artifacts and GLM package names only.
4. Security/community files.
   - Re-scan issue templates, security policy, support docs, and CodeQL for GLM refs.

Acceptance criteria:

- CI blocks regressions in package metadata and core/CLI build.
- Release process cannot publish GLM-named artifacts.
- Branch protection settings are verified separately and documented.

### Phase 6 — Generated artifacts and final cleanup

1. Clean generated outputs if tracked.
2. Rebuild from source.
   - `npm run build`
   - `npm run bundle`
   - SDK-specific builds as needed.
3. Re-run GLM inventory including generated outputs.
4. Regenerate snapshots/tests intentionally.
5. Review final diff for accidental unrelated changes.

Acceptance criteria:

- Final GLM scan is zero outside approved exceptions.
- Build output, package archives, and generated package metadata are GLM-branded.
- No files under `repos/` changed.

## 5. Verification Plan

### Fast checks during implementation

Run targeted checks from package directories, following repo instructions:

```bash
cd packages/core && npx vitest run src/models/action-registry.test.ts
cd packages/core && npx vitest run src/models/thinking-config.test.ts
cd packages/core && npx vitest run src/permissions/permission-manager.test.ts
cd packages/core && npx vitest run src/orchestrator/pipeline.test.ts
cd packages/cli && npx vitest run src/ui/commands/actionCommand.test.tsx
cd packages/cli && npx vitest run src/ui/commands/thinkingCommand.test.tsx
```

Adjust exact test filenames to match implementation.

### Rebrand scan

```bash
rg -n -i \
  "glm|glm-code|glm-code|@glm-code|GLM_|\\.glm|qazz92" \
  --glob '!node_modules/**' \
  --glob '!.git/**' \
  --glob '!coverage/**' \
  --glob '!repos/**'
```

Expected result after complete rebrand:

- No matches in source, docs, scripts, tests, package metadata, generated package files, or local agent artifacts.
- Any remaining match must be documented as an approved historical/reference exception. For a strict complete rebrand, the expected exception count is zero outside ignored `repos/`.

### Build/typecheck

```bash
npm run build
npm run typecheck
```

### Bundle/package

```bash
npm run bundle
npm run prepare:package
npm run package:standalone
```

### Integration smoke

```bash
npm run test:integration:cli:sandbox:none
npm run test:integration:interactive:sandbox:none
```

Use individual integration test files first if failures are expected during the migration.

## 6. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---:|---|
| Package rename breaks imports and lockfile | High | Rename package metadata and imports in one controlled phase; regenerate lockfile once. |
| Complete removal of GLM aliases breaks existing users | High | This plan intentionally chooses clean break. If compatibility becomes required, revise policy before Phase 2. |
| Editor extension IDs cannot be renamed in-place in marketplaces | Medium/High | Treat VS Code/Zed as new GLM extensions; document publishing implications. |
| Generated `dist/` contains stale GLM strings | Medium | Do not hand-edit first; rebuild from source after source migration. |
| Tests/snapshots encode GLM names | Medium | Update tests alongside behavior; regenerate snapshots intentionally. |
| Pipeline/fanout implementation becomes larger than rebrand scope | High | Keep feature-gap closure in Phase 4; if schedule is constrained, downgrade README claims rather than shipping false claims. |
| Permission tier auto-approval creates security regression | High | Fail closed for unknown tools; add Tier C destructive/external tests before enabling. |
| Crash recovery/process recycling can corrupt session state | High | Add resume tests with corrupt checkpoint and interrupted pipeline scenarios. |
| Existing dirty working tree causes accidental overwrite | High | Phase 0 branch hygiene and diff review before edits. |

## 7. Final Acceptance Criteria

The work is complete only when all of the following are true:

1. `rg -i "glm|glm-code|glm-code|@glm-code|GLM_|\.glm|qazz92"` returns no unapproved matches outside ignored reference/vendor areas.
2. `repos/` has no modifications.
3. Product docs, install scripts, package metadata, SDK docs, extension metadata, and CLI help consistently say GLM Code.
4. Runtime config uses `.glm` and `GLM_*` names.
5. `glm` is the documented and tested CLI entrypoint.
6. `/action` and `/thinking` either work end-to-end with tests or are removed/downgraded from README.
7. Pipeline/fanout/process-recycling/notifications claims either have implementation evidence and tests or are corrected in docs.
8. `npm run build && npm run typecheck` pass.
9. Targeted unit/integration tests for changed areas pass.
10. Final diff is reviewed for unrelated changes and generated-file noise.

## 8. Suggested PR Breakdown

To reduce review risk, split into small PRs if possible:

1. **PR 1: Inventory and package identity**
   - Inventory artifact, root/workspace package metadata, lockfile, package imports.
2. **PR 2: Runtime namespace**
   - `.glm`, `GLM_*`, CLI binary, scripts, Docker/sandbox.
3. **PR 3: Docs and agent artifacts**
   - `docs/**`, `AGENTS.md`, `.glm/**`, project artifact convention.
4. **PR 4: `/action` and `/thinking`**
   - Commands, core wiring, tests, README verification.
5. **PR 5: Orchestrator correctness**
   - Fanout execution or doc downgrade, pipeline gates, acceptance DSL.
6. **PR 6: Resilience and permissions**
   - Permission tier integration, crash recovery, process recycler.
7. **PR 7: SDK/editor/release final sweep**
   - Python/Java/TS SDK, VS Code/Zed, install/release scripts, final scan.

If a single PR is required, keep the same order in commits and make each commit independently reviewable.
