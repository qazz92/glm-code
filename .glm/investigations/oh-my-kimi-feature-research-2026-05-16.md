# oh-my-kimi feature research — 2026-05-16

## Scope

Research `dmae97/oh-my-kimi` as an inspiration source for GLM Code/OMX-style UX: HUD, sidecar cockpit, graph memory, Open Design bridge, and parallel execution.

Sources inspected:

- GitHub repo: https://github.com/dmae97/oh-my-kimi
- npm package metadata: `@oh-my-kimi/cli@1.1.15`
- Local shallow clone at `/tmp/oh-my-kimi-research` for source review only.

## Current upstream snapshot

- Repository: `dmae97/oh-my-kimi`
- License: MIT
- Latest release / npm package: `v1.1.15`, published 2026-05-13.
- README explicitly labels stable daily-use core vs alpha/experimental orchestration.
- Package shape: TypeScript ESM CLI with optional `kuzu` graph backend and a small Rust native-safety crate.

## Feature findings

### 1. HUD

Relevant files:

- `/tmp/oh-my-kimi-research/src/commands/hud.ts`
- `/tmp/oh-my-kimi-research/src/util/run-view-model.ts`
- `/tmp/oh-my-kimi-research/docs/hud-and-parallel-ux.md`

Pattern:

- Read-only terminal dashboard.
- Aggregates system usage, provider quota/usage, git status, active/latest run, TODOs, changed files.
- Uses a shared `RunViewModel` so HUD and parallel UI render the same state interpretation.
- Explicit state-error UX: missing/corrupt/invalid run state produces recovery hints instead of crashes.

Why it matters:

- The important portable idea is not the colors; it is the normalized state model. GLM already has statusline, runtime status, arena status, dual-output, memory, and orchestrator state. A GLM HUD should sit on a unified read model rather than scraping UI internals.

### 2. Sidecar cockpit

Relevant files:

- `/tmp/oh-my-kimi-research/src/commands/cockpit.ts`
- `/tmp/oh-my-kimi-research/readmeasset/readmeomkcockpit.png`

Pattern:

- Read-only sidecar for active run state.
- Shows root terminal/work stream on the left and a compact right rail with health/progress, TODOs, changed files, evidence.
- Caches expensive probes such as git changes, provider state, MCP/resources, system usage.

Portability:

- GLM already has `dualOutput` JSON sidecar support and Arena panes. A cockpit could consume structured events/status files rather than require a separate agent harness.

### 3. Graph memory

Relevant files:

- `/tmp/oh-my-kimi-research/docs/local-graph-memory.md`
- `/tmp/oh-my-kimi-research/src/memory/local-graph-memory-store.ts`
- `/tmp/oh-my-kimi-research/src/memory/graph-viewer.ts`
- `/tmp/oh-my-kimi-research/src/commands/graph.ts`

Pattern:

- Project-local graph state defaults to `.omk/memory/graph-state.json`.
- Markdown mirrors remain human-readable, but graph JSON is the source of truth.
- Ontology classes include Project, Session, Run, Goal, Decision, Task, Risk, Command, File, Evidence, ProviderRoute/Fallback, Question/Answer, Concept.
- Optional embedded Kuzu backend exists for Cypher-style queries, but local JSON graph avoids external daemon/secrets.
- Graph viewer emits local HTML/Cytoscape-style visualization.

Portability:

- GLM already has auto-memory markdown/topic files and memory recall. The next step is likely a graph overlay/index, not replacing existing memory.
- Strong candidate schema: Session, Turn, Goal, Task, Decision, File, ToolCall, Evidence, Agent, Worktree, MemoryEntry.

### 4. Open Design bridge

Relevant files:

- `/tmp/oh-my-kimi-research/docs/design-md.md`
- `/tmp/oh-my-kimi-research/src/commands/design.ts`
- `/tmp/oh-my-kimi-research/src/commands/open-design-agent.ts`

Pattern:

- `design open-design --open` clones/updates `nexu-io/open-design`, patches it to register an OMK agent adapter, adds an env setting, adds a visual identity, and launches local ports.
- It treats `DESIGN.md` as a first-class source for product/style intent and funnels design output back through implementation gates.

Portability:

- The bridge is highly reusable conceptually, but direct patching of Open Design internals is brittle. For GLM, prefer a version-gated adapter or a generated connector directory with checksums.

### 5. Parallel execution / DAG executor

Relevant files:

- `/tmp/oh-my-kimi-research/src/commands/parallel.ts`
- `/tmp/oh-my-kimi-research/src/orchestration/dag.ts`
- `/tmp/oh-my-kimi-research/src/orchestration/task-graph.ts`
- `/tmp/oh-my-kimi-research/src/orchestration/scheduler.ts`
- `/tmp/oh-my-kimi-research/src/orchestration/executor.ts`
- `/tmp/oh-my-kimi-research/src/orchestration/parallel-ui.ts`

Pattern:

- Turns a goal into a DAG: bootstrap → coordinator → workers/advisory nodes → review/merge → quality/security/design gates.
- Scheduler uses topological ordering, dependency checks, retry/fallback/skip/block policies, and prioritizes runnable nodes by critical path/downstream/evidence score.
- Executor persists run state, emits state-change events, handles node timeout, heartbeat/stall detection, evidence gates, fallback nodes, and final success/failure.
- Parallel UI has cockpit/table/compact views and consumes the same `RunViewModel` as the HUD.

Portability:

- GLM already has `orchestrator/fanout.ts`, `worker-state.ts`, `GitWorktreeService`, and Arena. OMK's DAG executor is more explicit about durable run state, evidence gates, and UI view models. The highest-value adoption path is to add these layers to GLM's existing fanout/Arena primitives instead of transplanting OMK's Kimi runner.

## GLM Code comparison

Existing GLM touchpoints found:

- Parallel planning: `packages/core/src/orchestrator/fanout.ts`
- Long-horizon orchestration: `packages/core/src/orchestrator/orchestrator.ts`, `pipeline.ts`, `worker-state.ts`
- Worktree isolation: `packages/core/src/services/gitWorktreeService.ts`
- Competitive multi-agent UI/runtime: `packages/core/src/agents/arena/*`, `packages/cli/src/ui/commands/arenaCommand.ts`
- Statusline setup: `packages/cli/src/ui/commands/statuslineCommand.ts`
- Dual sidecar structured stream: `packages/cli/src/dualOutput/DualOutputBridge.ts`
- Auto-memory: `packages/core/src/memory/*`, `packages/cli/src/ui/commands/memoryCommand.ts`

## Recommended adoption order

1. **Unified run/agent view model**: define a GLM `RunViewModel` over orchestrator, Arena, tool calls, memory, and git status.
2. **Read-only HUD MVP**: terminal command/panel that renders system + project + active run + memory status from the view model.
3. **Sidecar cockpit on dual-output**: use existing JSON events/status files to render a read-only cockpit, avoiding risky TUI coupling.
4. **Evidence-gated fanout**: extend `FanoutResult`/worker state with explicit evidence contracts and persisted state.
5. **Graph memory overlay**: add project-local graph JSON as an index over existing memory and run artifacts; keep markdown as user-editable source.
6. **Open Design bridge**: add after HUD/cockpit because it depends on clean run/state/design contracts.

## Risks / cautions

- Do not copy Kimi-specific runner assumptions into GLM. Preserve GLM's provider/model architecture.
- Avoid adopting OMK's current alpha surfaces as stable API. Its own maturity matrix marks `parallel`, `graph view`, `run`, and `verify` as alpha.
- Direct patching of Open Design source may be fragile; use checksums/version detection if ported.
- Graph memory needs privacy controls and clear user affordances; project-local default is safer than daemon/secrets.
- `repos/` is reference-only in this workspace; keep external clone under `/tmp` or documentation artifacts only.

## Concrete next design questions

- Should GLM HUD be built into interactive TUI, separate `glm hud`, or both?
- Should cockpit consume `--json-file/--json-fd` dual-output events, a persisted run-state file, or both?
- Should graph memory live under existing `~/.glm/projects/<project>/memory/` or project `.glm/memory/` when `GLM_CODE_MEMORY_LOCAL=1`?
- Should Arena become the first backend for a DAG/evidence UI, or should orchestrator fanout get a new durable executor first?

## Fresh verification evidence — 2026-05-16T20:14+09:00

Acceptance criteria for this research continuation:

- Upstream repo metadata is current and sourced from GitHub CLI.
- npm package metadata is current and sourced from npm registry.
- Key OMK feature source files exist in the shallow clone used for inspection.
- GLM Code touchpoint files exist in `packages/` and no files under `repos/` were modified.

Verification commands run:

```bash
git -C /tmp/oh-my-kimi-research fetch --depth 1 origin main
git -C /tmp/oh-my-kimi-research rev-parse HEAD
git -C /tmp/oh-my-kimi-research log -1 --format='%H %cI %s'
gh repo view dmae97/oh-my-kimi --json nameWithOwner,description,stargazerCount,forkCount,defaultBranchRef,latestRelease,pushedAt,updatedAt,url,licenseInfo
npm view @oh-my-kimi/cli version time.modified dist.unpackedSize dist.fileCount license repository.url --json
```

Observed upstream evidence:

- Current `main` HEAD in local clone: `c7df6a4e69d4e9e5f38dc61c192785950a0af24f`.
- Commit date/title: `2026-05-13T15:01:50+09:00 docs(readme): note persistent fetch mcp startup`.
- GitHub repo metadata: `dmae97/oh-my-kimi`, MIT license, default branch `main`, latest release `v1.1.15`, release published `2026-05-13T05:45:47Z`, pushed `2026-05-13T06:02:00Z`, 76 stars, 6 forks at verification time.
- npm metadata: `@oh-my-kimi/cli@1.1.15`, modified `2026-05-13T05:45:44.517Z`, unpacked size `7,983,674`, file count `524`, MIT license.

OMK feature file checks:

- `src/commands/hud.ts` — present, 1174 lines.
- `src/commands/cockpit.ts` — present, 1178 lines.
- `src/orchestration/parallel-ui.ts` — present, 494 lines.
- `src/commands/parallel.ts` — present, 924 lines.
- `src/orchestration/executor.ts` — present, 616 lines.
- `src/memory/local-graph-memory-store.ts` — present, 941 lines.
- `src/memory/graph-viewer.ts` — present, 449 lines.
- `src/commands/design.ts` — present, 898 lines.
- `docs/hud-and-parallel-ux.md` — present, 148 lines.
- `docs/local-graph-memory.md` — present, 102 lines.
- `MATURITY.md` — present, 75 lines.

GLM Code touchpoint checks:

- `packages/core/src/orchestrator/fanout.ts` — present, 121 lines.
- `packages/core/src/orchestrator/worker-state.ts` — present, 160 lines.
- `packages/core/src/services/gitWorktreeService.ts` — present, 827 lines.
- `packages/core/src/agents/arena/ArenaManager.ts` — present, 1873 lines.
- `packages/cli/src/dualOutput/DualOutputBridge.ts` — present, 338 lines.
- `packages/core/src/memory/types.ts` — present, 43 lines.
- `packages/cli/src/ui/commands/statuslineCommand.ts` — present, 30 lines.

Conclusion after fresh verification:

- The earlier recommendation still holds: build GLM's HUD/cockpit effort around a shared run/agent view model first, then layer evidence-gated fanout and graph-memory indexing on top of existing GLM primitives.
- No source implementation changes were made for this research pass; only this investigation artifact was added/updated.

## Stop-hook verification pass — 2026-05-16T20:14:17+09:00

A stop-hook reported an older ultrawork planning state. I re-checked the runtime and found two stale active `ultrawork-state.json` files from earlier session IDs plus the current inactive state. Fresh evidence collected in this pass:

- Local clone HEAD remains `c7df6a4e69d4e9e5f38dc61c192785950a0af24f` (`2026-05-13T15:01:50+09:00 docs(readme): note persistent fetch mcp startup`).
- GitHub metadata remains release `v1.1.15`, published `2026-05-13T05:45:47Z`, pushed `2026-05-13T06:02:00Z`, 76 stars, 6 forks at check time.
- npm metadata remains `@oh-my-kimi/cli@1.1.15`, modified `2026-05-13T05:45:44.517Z`.
- Investigation artifact hash before this append was `302e2fd3ade98447e957ed10427aad2505cc7ef5b71af16e7976b90ddb636b94` with 176 lines.
- `git status --short repos` returned no entries, confirming no `repos/` modifications.

The stale ultrawork state files were then marked inactive with phase `verified` and evidence pointing to this artifact.
