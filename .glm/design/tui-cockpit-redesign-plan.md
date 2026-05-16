# GLM Code Integrated TUI Cockpit Redesign Plan

**Date:** 2026-05-16 KST  
**Status:** Revised draft / 3-agent cross-checked / not coding-ready until Phase 0 gates pass  
**Scope:** Replace the current separate dashboard overlay with a polished, integrated terminal cockpit: `chat + sidecar + HUD`, solving GLM's operator visibility/control problem while using OpenCode and oh-my-kimi as pattern libraries, not as products to clone.

---

---

## -1. User problem, MVP, and success metrics

### Primary user

The first user is a **solo coding operator supervising one active GLM session**, with occasional subagents/background tasks. The multi-agent supervisor is the next user. IDE/web embedders are downstream consumers, not the first cockpit target.

### Moment of pain

The user is in the middle of a coding run and needs to answer, without leaving the chat flow:

- What is GLM doing right now?
- Is anything blocked on me?
- Are workers/subagents alive, stale, failed, or done?
- Which files changed?
- Is context, MCP/LSP, provider, memory, or permission state degraded?
- What should I do next?

The current dashboard makes this harder because it is transient, footer-owned, grid-like, partly estimated, and disconnected from the main transcript.

### Product MVP

The MVP is **not** graph memory, not Open Design, and not a renderer rewrite. The MVP proves one job:

> A user can understand and control an active GLM session from the main TUI without opening a separate dashboard.

MVP panels:

1. **Now** — current action, blocker, pending permission, next action.
2. **Workers summary** — active/background agents with stale/error/done state, sourced from existing background task view state.
3. **Files** — real changed files and counts from async git status, never line-count estimates.
4. **TODO** — incomplete sticky todos only.
5. **Health when degraded** — MCP/LSP/provider/memory only when attention is needed.

Deferred until after MVP proof:

- graph memory viewer and graph database choices
- Open Design bridge
- full per-worker evidence cockpit
- OpenTUI/Solid production migration
- IDE/web cockpit surfaces

### Success metrics

Quantitative signals:

- `cockpit_toggle_count` and `cockpit_pinned_duration_ms` during dogfood.
- Percentage of wide-terminal sessions where cockpit stays pinned for more than 60 seconds.
- Median time from permission prompt appearing to user action.
- Median time to identify a blocked/stale worker in manual QA scenarios.
- Render cadence during streaming: no visible chat width jump, no footer/composer jitter, no sidecar per-token repaint.
- Zero fake or estimated values in HUD/cockpit surfaces.

Qualitative gates:

- At 128 and 160 columns, the TUI feels like one composed cockpit, not a chat app plus dashboard bolted underneath.
- At 80 and 100 columns, cockpit does not steal space from core chat/composer work.
- Screen reader mode is quieter than the normal TUI, not noisier.

## 0. Executive decision

Yes: we should **deprecate the current separate dashboard overlay as a primary UX** and move to an integrated cockpit, but only after the MVP proves the sidecar/HUD can be real, stable, accessible, and feature-flagged.

The current GLM dashboard proves the right instinct — operators need visibility — but the implementation shape is wrong for a premium coding agent:

- It appears as a temporary bottom overlay instead of a persistent operator surface.
- It competes with the footer/shortcuts area rather than coexisting with chat.
- It contains estimated/fake-looking metrics in places, which immediately makes the product feel cheaper.
- It uses synchronous shell/git reads during render paths.
- It is not a true sidecar/cockpit mental model.

The new product surface should be:

```text
┌──────────────────────────────────────────────────────────┬──────────────────────┐
│ Chat / transcript / active tool stream                   │ Cockpit sidecar       │
│                                                          │  goal / workers       │
│                                                          │  todos / files        │
│                                                          │  memory / graph       │
│                                                          │  permissions          │
├──────────────────────────────────────────────────────────┴──────────────────────┤
│ HUD: model · cwd/git · context · MCP/LSP · workers · blocker · /status          │
├─────────────────────────────────────────────────────────────────────────────────┤
│ Composer                                                                         │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Non-negotiable bar:** no fake data, no layout jitter, no overstuffed dashboard, no cheap box-grid look. If data is not real, do not show it.

---

## 1. Fresh verification evidence

### OpenCode current state

Verified on **2026-05-16 20:26–20:30 KST**.

- Current official repo: `anomalyco/opencode`
- Latest release observed via `gh`: `v1.15.1`, published `2026-05-16T05:44:46Z`
- Repo pushed: `2026-05-16T11:24:26Z`
- Stars/forks observed: `161041` / `18907`
- npm package: `opencode-ai@1.15.1`, modified `2026-05-16T11:05:41.026Z`
- Local source clone: `/tmp/opencode-current-research`, commit `c5db39f`
- Official docs confirm OpenCode is available as terminal UI, desktop app, and IDE extension, and its TUI is a first-class usage mode.

Important note: older `opencode-ai/opencode` references are stale for our purposes. The current codebase to study is `anomalyco/opencode`.

### oh-my-kimi current state

Verified on **2026-05-16 20:30 KST**.

- Repo: `dmae97/oh-my-kimi`
- Latest release observed via `gh`: `v1.1.15`, published `2026-05-13T05:45:47Z`
- npm package: `@oh-my-kimi/cli@1.1.15`
- Local source clone: `/tmp/oh-my-kimi-research`, commit `c7df6a4`
- Public site still showed `v1.1.12`, so treat the GitHub/npm data as fresher than the website banner.

### GLM current TUI/dashboard state

Verified in this repo on **2026-05-16 20:26–20:34 KST**.

Key local files:

- `packages/cli/src/ui/components/GLMDashboard.tsx`
- `packages/cli/src/ui/components/DashboardOverlay.tsx`
- `packages/cli/src/ui/components/Composer.tsx`
- `packages/cli/src/ui/components/Footer.tsx`
- `packages/cli/src/ui/hooks/useOrchestratorState.ts`
- `packages/cli/src/dualOutput/DualOutputBridge.ts`
- `packages/core/src/utils/runtimeStatus.ts`
- `docs/users/features/dual-output.md`

GLM currently uses **Ink + React 19** for TUI rendering. OpenCode uses **OpenTUI + Solid**.

---

## 2. What OpenCode gets right

OpenCode’s TUI quality is not just styling. It comes from architecture.

### 2.1 Renderer and terminal discipline

OpenCode uses `@opentui/core`, `@opentui/solid`, and `@opentui/keymap` from a custom terminal renderer stack. In `packages/opencode/src/cli/cmd/tui/app.tsx` it configures:

- `targetFps: 60`
- `externalOutputMode: "passthrough"`
- Kitty keyboard support
- explicit mouse enable/disable
- custom copy binding
- error boundary and controlled shutdown

This means OpenCode is drawing a real terminal application, not only printing React boxes. That is a big reason it feels more like a premium product.

**Implication for GLM:** Ink can support a strong MVP, but OpenCode-level polish may require either a deeper Ink discipline pass or a next-gen OpenTUI renderer behind a flag.

### 2.2 Runtime/TUI separation

OpenCode’s TUI frontend talks to a worker/server process instead of entangling all runtime state directly into rendering. The `thread.ts` path handles internal worker startup, fetch/event-source bridges, session checks, and external server mode.

**Implication for GLM:** our existing `DualOutputBridge`, `runtimeStatus`, and JSON sidecar channels are valuable. We should formalize a renderer-neutral `OperatorViewModel` rather than let React components scrape files and shell out.

### 2.3 Persistent right sidebar, not a pop-up dashboard

OpenCode’s session route:

- auto-opens sidebar only when terminal width is wide enough (`width > 120`)
- uses a fixed sidebar width around 42 columns
- allows manual toggle
- hides/adapts in child sessions and narrow terminals
- computes chat content width from sidebar visibility

This is the exact pattern GLM should adopt: sidecar is present when it helps, invisible when it harms.

### 2.4 Slot/plugin-based sidebar

OpenCode’s `routes/session/sidebar.tsx` defines slots:

- `sidebar_title`
- `sidebar_content`
- `sidebar_footer`

Built-in content such as modified files, todos, LSP, MCP, and footer live as feature plugins. This prevents the sidebar from becoming a hardcoded junk drawer.

**Implication for GLM:** cockpit panels should be registered modules with priority and visibility rules, not one giant `DashboardOverlay.tsx`.

### 2.5 Minimal footer/HUD

OpenCode’s footer is deliberately restrained: directory/status left, permission/LSP/MCP status right, `/status` hint. It does not try to render every metric all the time.

**Implication for GLM:** the HUD should be a high-signal line. Detailed data belongs in sidecar panels or dialogs.

### 2.6 TUI customization is first-class

OpenCode has a dedicated `tui.json` with theme, keybinds, leader timeout, scroll speed, diff style, mouse, and attention settings. TUI config is separate from runtime/server config.

**Implication for GLM:** add `ui.cockpit` settings but keep them separate from model/provider/runtime config.

### 2.7 Keybinding discoverability

OpenCode’s `which-key` system shows keyboard shortcuts, supports overlay/dock layouts, adapts columns to terminal width, and groups commands. This is part of the perceived polish.

**Implication for GLM:** if we add sidecar/HUD controls, we need a discoverable command/keymap story. Do not add hidden shortcuts.

---

## 3. What oh-my-kimi gets right

oh-my-kimi’s UI is less polished than OpenCode’s renderer, but its operator model is excellent.

### 3.1 Read-only HUD and cockpit

OMK distinguishes:

- `omk hud`: read-only dashboard for system/project/run state
- `omk cockpit`: sidecar cockpit for run state, TODOs, ETA, workers, changed files

This separation is good, but for GLM the better default is OpenCode-style integration: HUD and cockpit visible in the same TUI when width allows.

### 3.2 Shared `RunViewModel`

OMK docs explicitly name `RunViewModel` as the shared abstraction between HUD and parallel UI. Source files such as `src/commands/hud.ts` and `src/orchestration/parallel-ui.ts` consume the same display-ready interpretation of run state.

**Implication for GLM:** this is the most important idea to adopt. Build the view model first; widgets come second.

### 3.3 Evidence-gated parallel execution

OMK’s parallel executor models DAG nodes, workers, retries, provider routing, evidence gates, stale workers, blockers, and repair policy. It does not accept “done” by narration alone.

**Implication for GLM:** sidecar should not merely show “agents running.” It should show evidence state:

- running / blocked / failed / done
- last evidence
- changed files
- tests/commands attached to completion
- stale heartbeat
- next action

### 3.4 Local graph memory

OMK’s graph memory is project-local by default:

- source of truth: `.omk/memory/graph-state.json`
- readable markdown mirrors for review/diffs
- ontology includes goals, decisions, tasks, risks, commands, files, evidence, concepts, provider routes, questions/answers
- optional Kuzu backend
- HTML graph viewer

**Implication for GLM:** do not invent a graph database first. Start with local JSON + markdown mirrors + open-source viewer/model libraries. Add Kuzu only after graph queries justify it.

### 3.5 Explicit maturity labels

OMK labels stable vs alpha vs experimental surfaces. HUD/cockpit are stable; parallel/run/verify/graph view have more caveats.

**Implication for GLM:** cockpit can ship first as stable/read-only, while graph and parallel visualizations can be “preview” until evidence/state contracts harden.

### 3.6 Open Design bridge caution

OMK’s Open Design bridge is useful but patches upstream Open Design source with brittle marker-based transformations.

**Implication for GLM:** do not make direct patching the default. If we adopt Open Design, use a version-gated connector/adapter and fail closed with clear diagnostics.

---

## 4. Current GLM diagnosis

### 4.1 Things we already have and should reuse

GLM is not starting from zero.

- `DualOutputBridge` already supports structured sidecar events and remote control/permission bridging.
- `runtimeStatus` already writes a stable JSON record for external observers.
- `Footer` and `useStatusLine` already provide a configurable status line with structured JSON context.
- `Arena` and orchestrator files already model multi-agent/fanout concepts.
- `background-view` and MCP health pills already have compact status affordances.
- Auto-memory exists and can become the source for graph extraction.

### 4.2 Problems to remove

#### `GLMDashboard.tsx`

- duplicates HUD logic that also exists in `Footer.tsx`
- runs `git` synchronously during render
- reads `process.cwd()` directly in component render
- does not act as a sidecar; it is just a line HUD component

#### `DashboardOverlay.tsx`

- panel grid feels like an admin dashboard, not a coding cockpit
- uses estimated token breakdowns (`Sys`, `Skills`, `Tools`, etc.)
- estimates files touched from line counts
- polls `~/.glm/workflows/state.json` every 2 seconds through `useOrchestratorState`
- is shown in the exclusive footer area via `Composer.tsx`
- “Ctrl+G Dashboard” is bolted onto the footer rather than integrated into layout

#### Layout issue

`AppContainer.tsx` currently computes a main width cap around 100 columns in places. That is good for readable chat, but it leaves the rest of wide terminals underused. The new cockpit should use that wide space deliberately.

---

## 5. Product target

### 5.1 Default surface

- Chat remains the primary surface.
- Sidecar appears automatically only on sufficiently wide terminals.
- HUD is always compact and high-signal.
- Graph view is drill-down, not always-on.

### 5.2 Responsive breakpoints

Initial contract:

```text
< 100 cols      Chat + 1-line HUD. No persistent sidecar.
100–127 cols    Chat only by default. Manual cockpit opens as a bottom/peek panel.
128–159 cols    Chat min 84 cols + sidecar 36–40 cols + 1-col gutter.
>= 160 cols     Chat max 100 cols + sidecar 42 cols + 1–2-col gutter.
< 24 rows       No persistent sidecar, regardless of width.
```

These are starting values, not taste. Phase 0 must capture screenshots at `80x24`, `100x24`, `128x30`, and `160x40`, then tune with visual evidence.

Important Ink constraint: current committed history uses Ink `<Static>`, so the MVP must keep chat width stable and use unused wide-terminal space. Do not attempt full historical transcript reflow until the renderer spike proves it.

### 5.3 Cockpit state machine

The sidecar must have explicit state. Hidden booleans will create edge-case bugs.

```text
hidden          user/terminal/config says no cockpit
  ↓ auto-open   width/height allow it and autoShow is true
shown:auto      visible because layout allows it
  ↓ pin         user explicitly pins it
shown:pinned    stays visible across turns/resizes when possible
  ↓ peek        narrow terminal or temporary command
shown:peek      bottom/overlay summary, closes on Esc or explicit toggle
  ↓ hide        user disables/off config
hidden
```

Rules:

- Auto-open never fires in screen reader mode.
- Pinned sidecar never steals composer focus.
- Permission prompts remain primary in the transcript/dialog path; sidecar only mirrors their summary.
- Narrow terminals use a bottom/peek surface, not a cramped right rail.

### 5.4 Sidecar panel priority and row budgets

Default sidecar should show only what changes operator behavior:

1. **Now** — current goal/action, blocker, permission pending. Max 3 rows.
2. **Workers** — active agents/fanout/arena lanes, status, stale heartbeat. Max 4 rows.
3. **TODO** — incomplete todos only. Max 5 rows.
4. **Files** — modified files with real add/delete counts. Max 6 rows.
5. **Memory** — last recall/write/status only. Max 3 rows.
6. **Health** — MCP/LSP/provider/quota only when degraded or requested.

Everything else belongs behind `/status`, `/cockpit`, `/graph view`, or a panel toggle.

Overflow rule: use `+N more`, never scroll-trap the sidecar by default.

### 5.5 Visual contract

This is the anti-box-grid contract. It exists because `DashboardOverlay.tsx` currently looks like a 2x2 admin panel.

- One outer sidecar rail border at most.
- No individual boxed cards in the default sidecar.
- Default visible sections: max 3 unless a degraded state needs attention.
- Flat section headers + terse rows.
- Muted separators over heavy borders.
- HUD normal mode is exactly one row.
- Color is never the only signal; warning/error rows include text labels.
- Emoji/glyphs must have ASCII fallback.
- Empty states are intentional and short: `No workers`, `No changed files`, `MCP ok`.

### 5.6 Keyboard ownership

`Ctrl+G` is currently overloaded. The plan must not assume it is free.

Current conflicts to resolve before implementation:

- dashboard toggle is hardcoded through `InputPrompt`/`Composer`.
- context detail uses `Ctrl+G` in keybinding config and hints.
- footer advertises `Ctrl+G Dashboard`.

Decision for implementation:

- Add a first-class `TOGGLE_COCKPIT` command/keybinding.
- Move cockpit toggling out of `InputPrompt` props.
- Update help/shortcut docs and footer hints from “Dashboard” to “Cockpit.”
- If `Ctrl+G` stays cockpit, reassign context detail explicitly. If not, choose a cockpit binding and document it.

### 5.7 Accessible cockpit mode

Screen reader mode gets a different product shape, not the normal sidecar with fewer colors.

- Screen reader mode disables sidecar auto-open.
- `/cockpit status` prints a linear text summary in transcript order.
- Permission/blocker state is announced in the primary transcript/dialog flow.
- Decorative borders, glyphs, and HUD clutter are suppressed.
- Render modes: `normal | noColor | ascii | screenReader`.
- No-color and ASCII modes must be captured in Phase 0 screenshots.

### 5.8 HUD content

One-line default:

```text
GLM · model · cwd/git · ctx 18% · MCP 3/3 · workers 2 · next: review diff
```

Expanded two-line HUD only when configured or when there is a critical event.

---

## 6. Architecture plan

### 6.1 Create a renderer-neutral operator model with correct package boundaries

The cross-check found an important boundary issue: much of the live cockpit state is CLI/React-local. Core should not import UI contexts, terminal dimensions, or dialog state.

Use this split:

```text
packages/core/src/operator/
  types.ts            # OperatorViewModel, evidence/status/provenance types
  selectors.ts        # pure helpers/reducers only, no React, no fs, no shell

packages/cli/src/ui/cockpit/
  CockpitProvider.tsx
  operatorViewModelAdapter.ts
  useOperatorViewModel.ts
  gitStatusStore.ts
  CockpitLayout.tsx
  HudBar.tsx
  Sidecar.tsx
  SidecarSlotRegistry.ts
```

Draft model shape:

```ts
interface DataProvenance {
  source: string;
  updatedAt?: string;
  stale?: boolean;
  error?: { code: string; message: string };
}

type DataValue<T> =
  | { kind: 'known'; value: T; provenance: DataProvenance }
  | { kind: 'empty'; provenance: DataProvenance }
  | { kind: 'unknown'; reason: string; provenance?: DataProvenance };

interface OperatorViewModel {
  session: {
    id: string;
    cwd: string;
    title?: string;
    mode: 'build' | 'plan' | 'review' | 'idle';
  };
  runtime: {
    model: string;
    streaming: boolean;
    elapsedMs?: number;
    context: DataValue<{
      usedTokens: number;
      windowTokens?: number;
      pct?: number;
    }>;
  };
  git: DataValue<{
    branch?: string;
    changed: Array<{ path: string; additions?: number; deletions?: number }>;
    staged: number;
    untracked: number;
  }>;
  agents: DataValue<
    Array<{
      id: string;
      label: string;
      status: 'queued' | 'running' | 'blocked' | 'failed' | 'done' | 'stale';
      task: string;
      elapsedMs?: number;
      lastEvidence?: EvidenceSummary;
      lastActivityAt?: string;
    }>
  >;
  todos: DataValue<
    Array<{
      id: string;
      text: string;
      status: 'pending' | 'in_progress' | 'done';
    }>
  >;
  memory: DataValue<{
    backend: 'existing_memory_status' | 'local_graph_preview';
    lastRecall?: string;
    lastWrite?: string;
    graph?: { nodes: number; edges: number; warnings: string[] };
  }>;
  health: {
    mcp: DataValue<{ connected: number; total: number; degraded: boolean }>;
    lsp?: DataValue<{ connected: number; total: number; degraded: boolean }>;
    provider?: DataValue<{ errors: number; latencyMs?: number }>;
  };
  nextAction?: string;
  blocker?: { severity: 'info' | 'warning' | 'error'; message: string };
}
```

Rules:

- Components render `OperatorViewModel`; they do not run `git`, parse JSON files, or invent data.
- Missing data must distinguish `empty`, `unknown`, `stale`, and `error`.
- Data is async/cached/debounced outside render.
- Core owns portable types/selectors; CLI owns aggregation from React/UI state.
- View model can feed Ink now and OpenTUI later.

### 6.2 Replace dashboard components with cockpit modules

New CLI structure:

```text
packages/cli/src/ui/cockpit/
  CockpitProvider.tsx
  CockpitLayout.tsx
  HudBar.tsx
  Sidecar.tsx
  SidecarSlotRegistry.ts
  operatorViewModelAdapter.ts
  gitStatusStore.ts
  panels/
    NowPanel.tsx
    WorkersPanel.tsx
    TodoPanel.tsx
    FilesPanel.tsx
    MemoryPanel.tsx
    HealthPanel.tsx
  hooks/
    useOperatorViewModel.ts
```

Layout ownership:

- `Composer` owns input only.
- `DefaultAppLayout` or a parent layout owns `CockpitLayout`.
- The sidecar must not live in the footer/shortcut exclusive area.
- The sidecar must not be inside a region whose height changes every second.
- Screen reader layout uses the accessible linear summary path, not the visual sidecar.

Migration:

- Keep old `DashboardOverlay` behind a temporary compatibility flag for one transition window.
- Replace “Dashboard” language with “Cockpit” in hints/docs after keybinding ownership is resolved.
- Eventually remove `GLMDashboard.tsx`, `DashboardOverlay.tsx`, and dashboard-specific props after the compatibility window.

### 6.3 Add slot/priority registration

Borrow OpenCode’s concept, not its implementation:

```ts
interface SidecarPanelRegistration {
  id: string;
  title: string;
  priority: number;
  visible(vm: OperatorViewModel): boolean;
  render(vm: OperatorViewModel, density: 'compact' | 'full'): ReactNode;
}
```

This prevents a monolithic dashboard and lets future features add panels cleanly.

### 6.4 Source-of-truth table and update cadence

Primary cockpit state comes from in-process UI/core sources. `DualOutputBridge` and `runtimeStatus` are observer channels, not the primary state model.

| Cockpit data          | Primary source                                       | Rule                                          |
| --------------------- | ---------------------------------------------------- | --------------------------------------------- |
| session/model/context | `UIStateContext`, session stats, config              | no shell/file reads                           |
| git branch/files      | new async `GitStatusStore`                           | debounce, no `execSync` in render             |
| todos                 | existing sticky todo snapshot utilities              | incomplete todos only                         |
| workers/agents        | `BackgroundTaskViewContext` first                    | no parallel registry subscription             |
| MCP health            | `useMCPHealth`                                       | show only degraded in default sidecar         |
| LSP health            | adapter around existing LSP service after inspection | optional until real source exists             |
| memory                | existing `MemoryManager.getStatus()`/memory status   | graph summary only after graph preview exists |
| permissions/blockers  | existing confirmation/dialog state                   | transcript/dialog remains primary             |
| external observers    | `DualOutputBridge`, `runtimeStatus`                  | optional outward emission only                |

Data flow:

```text
core registries / memory / LSP / runtime data
        +
CLI UIState / history / dialogs / git hooks
        ↓
CLI operatorViewModelAdapter
        ↓
CockpitProvider
        ↓
HudBar / Sidecar panels / linear screen-reader summary
```

Update cadence:

- Token streaming does not update the full sidecar per token.
- Context usage updates on meaningful token/session changes.
- Agent/activity elapsed timers may tick at 1s, panel-local only.
- Git status is async and debounced.
- MCP/LSP/provider health updates only on source changes or slow refresh.
- Selectors should be panel-local enough that one changed worker does not repaint every panel.

Single-subscription rule:

- The cockpit consumes `BackgroundTaskViewContext` until registries support multi-subscriber fanout.
- Do not create a second direct subscription to background task registries if it can overwrite the existing UI callback.

No render side effects rule:

- No cockpit/HUD/footer component may import `child_process` or perform shell/file reads during render.
- No fake checkpoint text, fake token breakdown, or file-count estimates.
- Add a regression test or lint-style check for render-time `child_process`/`fs` imports in cockpit/HUD/footer paths.

### 6.5 Renderer decision: Ink hardening vs OpenTUI migration

We need a deliberate spike because TUI polish is the product.

#### Option A: stay on Ink for first integrated cockpit

Pros:

- lowest risk
- reuses current components/tests
- faster path to replace dashboard

Cons:

- complex split-pane + smooth scroll + keyboard layers may remain less polished than OpenCode
- harder to reach 60fps/custom-renderer feel

#### Option B: build `tui2` with OpenTUI/Solid behind a flag

Pros:

- closer to OpenCode quality ceiling
- better control of terminal rendering, mouse, keymap, alternate screen, layout
- future-proof for high-craft TUI

Cons:

- larger migration
- Solid/OpenTUI introduces a second UI stack
- existing Ink components cannot be reused directly

#### Recommendation

Do **not** rewrite immediately. First build the renderer-neutral types and a mock `OperatorViewModel`, then run a one-week renderer spike before committing to a full persistent sidecar implementation:

- same mock `OperatorViewModel`
- implement same cockpit screen in Ink and OpenTUI
- test 80/100/120/160 columns
- record flicker/layout issues during streaming
- compare keyboard/mouse/scroll behavior

If Ink cannot meet the quality bar, start `tui2` behind `GLM_TUI_NEXT=1` while keeping current TUI stable.

---

## 7. Graph memory plan, deferred and optional

### 7.1 Principle

Graph memory is **not in the cockpit MVP**. The cockpit MVP uses existing memory status only. Graph visualization becomes a preview feature after the basic cockpit is trusted.

Use open source graph libraries when the feature graduates. Do not build a graph renderer/database from scratch.

### 7.2 Path and dependency rules

Do not create a new default `.glm/memory` state path that splits semantics from the existing memory system or dirties user repos unexpectedly.

Rules:

- Phase 1 memory panel reads existing memory status only, for example `MemoryManager.getStatus()` and related status helpers.
- Graph preview uses existing configured memory paths unless the user explicitly opts into project-local graph artifacts.
- `ui.cockpit.memoryGraph` defaults to `false`.
- Graph dependencies are lazy-loaded or isolated in a viewer artifact.
- Kuzu/native/wasm dependencies do not enter the default CLI path.

### 7.3 Candidate stack for the later graph preview

Preview viewer:

- **Graphology** for in-memory graph model/indexing (`MIT`, observed `0.26.0`).
- **Sigma.js** for browser graph viewer (`MIT`, observed `3.0.3`).
- **MiniSearch/FlexSearch** for local search if needed.
- JSON source of truth + markdown mirrors, only after path semantics are settled.

Alternative when relationship layout is more important than large graph rendering:

- **Cytoscape.js** (`MIT`, observed `3.33.3`).
- `cytoscape-fcose` for DAG/compound layouts.

Later optional query backend:

- **Kuzu** (`MIT`, observed `0.11.3`) only when local graph queries become important enough to justify native/wasm dependency complexity.

### 7.4 Ontology v1, preview only

Start small:

- Project
- Session
- Goal
- Decision
- Task
- Risk
- Command
- File
- Evidence
- Agent
- Provider
- Concept

Edges:

- `session_has_goal`
- `goal_has_task`
- `task_changed_file`
- `task_has_evidence`
- `decision_affects_file`
- `risk_blocks_task`
- `agent_executed_task`
- `concept_related_to_file`

### 7.5 TUI integration

The TUI should not render a graph hairball. Default cockpit memory output stays compact:

```text
Memory
  status ok
  last recall: cockpit layout decision
  last write: risk: OpenTUI migration cost
  graph preview: off
```

Graph exploration opens a local browser viewer or a dedicated dialog only when the preview flag is enabled.

---

## 8. Open Design bridge plan

Open Design is useful for visual/product direction, but it should not be in the cockpit MVP.

Plan:

1. Add `glm design open-design` only after cockpit basics are stable.
2. Use a connector process or generated config rather than patching upstream files by marker strings.
3. Version-gate supported Open Design commits/releases.
4. Fail closed with instructions when upstream changes.
5. Feed final design output into a local `DESIGN.md` and sidecar “Design” panel only as a link/summary.

---

## 9. Implementation phases

### Phase 0 — Plan hardening, baseline, and contracts

Deliverables:

- Add the user problem, success metrics, source-of-truth table, keyboard ownership, visual contract, accessibility mode, and rollout flags to this plan.
- Capture current behavior for:
  - current GLM normal chat
  - current GLM dashboard overlay
  - current footer/HUD
  - OpenCode TUI reference states
  - OMK HUD/cockpit reference states
- Capture proposed/mock states at `80x24`, `100x24`, `128x30`, and `160x40`.
- Capture no-color, ASCII/glyph fallback, and screen-reader transcript samples.
- Stabilize or explicitly update current footer/dashboard snapshots before replacing behavior.
- Add baseline tests for dashboard/cockpit toggle ownership before migration.

Exit criteria:

- Everyone agrees what “premium” means before coding widgets.
- `Ctrl+G` ownership is decided or marked as a blocking open decision.
- The current snapshot/test baseline is known, not guessed.

### Phase 1 — OperatorViewModel types, selectors, and real data stores

Deliverables:

- Core `OperatorViewModel` types and pure selectors only.
- CLI `operatorViewModelAdapter` and `CockpitProvider` skeleton.
- Async/cached git status service; remove render-time `execSync` from footer/dashboard paths.
- Source adapters for session/model/context, MCP, todos, workers via `BackgroundTaskViewContext`, and memory status.
- Explicit `known | empty | unknown | stale | error` display handling.
- Unit tests for missing/corrupt/stale data.

Exit criteria:

- Existing footer/dashboard data can be produced without UI components scraping files or shelling out.
- No cockpit/HUD/footer render path imports `child_process` for git/status work.

### Phase 2 — Renderer spike with mock VM

Deliverables:

- Same mock `OperatorViewModel` rendered in current Ink and an OpenTUI/Solid spike.
- Width/height matrix screenshots: `80x24`, `100x24`, `128x30`, `160x40`.
- Streaming simulation with sidecar visible.
- Keyboard, mouse-off, copy/paste, resize, and no-color notes.

Exit criteria:

- Decision made: constrained Ink MVP, partial migration, or `tui2` behind `GLM_TUI_NEXT=1`.
- Decision is based on visual/runtime evidence, not preference.

### Phase 3 — Feature-flagged constrained Ink cockpit MVP

Deliverables:

- `ui.cockpit` config and `GLM_COCKPIT=1` dogfood override.
- `CockpitLayout` integrated in `DefaultAppLayout` or parent layout, not `Composer`.
- Composer remains input-only.
- Sidecar uses unused wide-terminal space and never steals composer focus.
- Narrow terminals use bottom/peek mode.
- Panels: Now, Workers summary, Todo, Files, Health-degraded-only.
- HUD reads from the view model.
- `TOGGLE_COCKPIT` command/keybinding added with conflict tests.

Exit criteria:

- No fake metrics.
- No visible layout jump during streaming.
- Permission prompts remain primary.
- Works at `80x24`, `100x24`, `128x30`, `160x40`.
- Screen reader mode does not auto-open sidecar and has a linear `/cockpit status` path.

### Phase 4 — Workers/evidence hardening

Deliverables:

- Fanout/orchestrator/arena/background state mapped into `OperatorViewModel.agents` through existing UI state first.
- Stale heartbeat/blocker detection.
- Per-worker changed files and evidence summary only when real data exists.
- Clear relationship between `LiveAgentPanel`, `BackgroundTasksPill/Dialog`, `AgentTabBar`, and cockpit Workers panel.

Exit criteria:

- Multi-agent runs are inspectable without leaving the main chat.
- The cockpit does not create parallel registry subscriptions that overwrite existing callbacks.

### Phase 5 — Dashboard deprecation and rollout

Deliverables:

- `/dashboard` alias to `/cockpit` for at least one compatibility window.
- Old overlay fallback behind flag while cockpit dogfoods.
- Footer/help/docs language updated from Dashboard to Cockpit.
- Release note with shortcut migration and rollback flag.
- Metrics/logging for cockpit toggle/pin/duration during dogfood, if telemetry setting allows it.

Exit criteria:

- Users have a clear migration path and a rollback path.
- No separate dashboard UX remains in the normal default flow after the compatibility window.

### Phase 6 — Graph memory preview, optional

Deliverables:

- Memory panel uses existing memory status first.
- Graph preview gated behind `ui.cockpit.memoryGraph`.
- Graph deps lazy-loaded or isolated.
- Viewer uses existing configured memory path semantics.

Exit criteria:

- Graph is useful as recall/debug artifact without cluttering default TUI or bloating the normal CLI path.

### Phase 7 — Open Design bridge, optional

Deliverables:

- Add `glm design open-design` only after cockpit basics are stable.
- Use connector/config, not marker-based upstream patching.
- Version-gate supported Open Design releases.
- Fail closed with clear diagnostics.

Exit criteria:

- Open Design output feeds docs/summary surfaces without becoming a fragile cockpit dependency.

### Phase 8 — Polish and hardening

Deliverables:

- Theme token expansion: rail, muted separator, active row, degraded state, diff colors.
- Snapshot tests for layout widths/heights.
- Integration tests for cockpit toggle, streaming, permission request, screen reader, and no-color mode.
- Manual visual QA checklist.
- Performance check for large histories and many changed files.

Exit criteria:

- TUI feels intentionally designed, not assembled.

## 10. Acceptance checklist

### Visual quality

- [ ] No placeholder/fake values.
- [ ] No clipped box borders at common widths.
- [ ] No chat width jump when streaming tokens arrive.
- [ ] Sidecar density changes gracefully between compact/full.
- [ ] Empty states are terse and intentional.
- [ ] Critical states use color + text, not color alone.
- [ ] Light/dark/ANSI fallback checked.
- [ ] No-color and ASCII/glyph fallback captures checked.
- [ ] Default sidecar uses one outer rail at most and no boxed card grid.
- [ ] Default sidecar shows at most 3 visible sections unless degraded state requires more.

### Interaction quality

- [ ] Sidecar toggle is discoverable in help/command palette.
- [ ] Composer focus remains stable.
- [ ] Mouse disabled mode still works.
- [ ] Screen reader mode hides nonessential HUD clutter.
- [ ] Permission prompts remain primary and never buried in sidecar.
- [ ] `TOGGLE_COCKPIT` has an explicit keybinding and no `Ctrl+G` conflict.
- [ ] Pinned sidecar does not disappear while typing.
- [ ] Narrow terminals use bottom/peek mode instead of cramped right rail.

### State quality

- [ ] Missing/corrupt/stale state shows explicit `unknown`, `stale`, or recovery text, not silent fallback.
- [ ] Corrupt graph/state file shows recovery hint, not crash.
- [ ] Stale worker is visible.
- [ ] MCP/LSP degraded states are visible.
- [ ] Context usage is accurate.
- [ ] Modified files list matches git diff source.
- [ ] No cockpit/HUD/footer React render path imports `child_process` or performs shell/file reads.
- [ ] Workers panel consumes existing background task view state unless registries gain fanout subscriptions.

### Test quality

- [ ] Unit tests for `OperatorViewModel` aggregation.
- [ ] Component tests for sidecar panel visibility rules.
- [ ] TUI snapshot tests at 80/100/120/160 cols.
- [ ] Integration test: toggle cockpit while streaming.
- [ ] Integration test: permission request appears in chat and sidecar summary.
- [ ] Graph writer/viewer tests with small and corrupt graph states when graph preview is enabled.
- [ ] Keybinding conflict test for `TOGGLE_COCKPIT`.
- [ ] Screen reader test: sidecar does not auto-open and `/cockpit status` is linear.
- [ ] No render-time `execSync` regression guard.
- [ ] Footer/dashboard snapshot baseline repaired or intentionally updated before cockpit replacement.

---

## 11. Risks and mitigations

| Risk                                                         | Why it matters                                                     | Mitigation                                                                              |
| ------------------------------------------------------------ | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Ink `<Static>` makes persistent sidecar harder than expected | Chat history may not reflow cleanly and layout could tear          | Constrained Ink MVP, mock renderer spike before full sidecar work                       |
| Ink cannot reach OpenCode polish                             | Product could still feel cheap                                     | Renderer spike before over-investing, `GLM_TUI_NEXT=1` only after evidence              |
| Sidecar becomes junk drawer                                  | Operator ignores it                                                | panel registry, row budgets, default max 3 sections                                     |
| Visuals regress into boxed dashboard grid                    | Trust/craft problem returns                                        | visual contract: one rail, flat rows, no card grid                                      |
| `Ctrl+G` conflict breaks existing workflows                  | Users lose context-detail shortcut or cockpit toggle is unreliable | first-class `TOGGLE_COCKPIT`, conflict test, docs migration                             |
| Screen reader experience gets noisier                        | Accessibility regression                                           | accessible cockpit mode, no auto sidecar, linear `/cockpit status`                      |
| Fake/estimated metrics remain                                | Destroys trust                                                     | ban fake metrics in acceptance criteria and tests                                       |
| Render-time shell/file reads persist                         | Streaming TUI stalls or flickers                                   | async stores, no render side effects rule, regression guard                             |
| Single-subscriber registries are overwritten                 | Existing background task UI breaks                                 | consume `BackgroundTaskViewContext` first, refactor registries to fanout only if needed |
| Graph becomes hairball                                       | Looks impressive but useless                                       | summary in TUI, full viewer on demand, graph preview flag off by default                |
| Graph deps bloat default CLI                                 | startup/install friction                                           | lazy-load/isolated viewer, no Kuzu/native deps in default path                          |
| Breaking existing users                                      | muscle memory/docs                                                 | feature flag, `/dashboard` alias, compatibility window, rollback env/config             |
| Performance regressions                                      | streaming TUI flicker                                              | async data store, debounce, panel-local selectors, snapshot/perf tests                  |

---

## 12. Recommended first PR sequence

1. **PR 0: Plan hardening and baseline**
   - Land this revised design plan.
   - Capture current screenshots/snapshots and known test state.
   - Decide `Ctrl+G`/`TOGGLE_COCKPIT` ownership.

2. **PR 1: View-model foundation**
   - Add core operator types/selectors only.
   - Add CLI adapter skeleton and source-of-truth tests.
   - No visual change.

3. **PR 2: HUD cleanup and async git status**
   - Move HUD data to view model.
   - Remove duplicate `GLMDashboard` logic from footer path.
   - Remove render-time `execSync` from `Footer`, `GLMDashboard`, and `DashboardOverlay` paths.

4. **PR 3: Renderer spike with mock VM**
   - Render the same mock cockpit in current Ink and OpenTUI/Solid spike.
   - Capture width/height matrix screenshots.
   - Decide constrained Ink MVP vs `tui2` path.

5. **PR 4: Feature-flagged cockpit shell**
   - Add `ui.cockpit` config and `GLM_COCKPIT=1` override.
   - Add `CockpitProvider`/`CockpitLayout` in `DefaultAppLayout`, not `Composer`.
   - Add sidecar shell and HUD behind flag.

6. **PR 5: Real MVP panels**
   - Now, Workers summary, Todo, Files, Health-degraded-only.
   - Use existing `BackgroundTaskViewContext` for workers.
   - Add panel visibility/row-budget tests.

7. **PR 6: Keybinding and docs migration**
   - Add `TOGGLE_COCKPIT` command/keybinding.
   - Resolve `Ctrl+G` conflict.
   - Update footer/help/docs from Dashboard to Cockpit.

8. **PR 7: Dashboard deprecation**
   - `/dashboard` alias to `/cockpit`.
   - Keep old overlay fallback for compatibility window.
   - Remove old overlay after docs/tests are stable.

9. **PR 8: Workers/evidence hardening**
   - Add stale worker/blocker/evidence summaries where real data exists.
   - Keep detailed control in existing background task dialog.

10. **PR 9: Graph memory preview**
    - Existing memory status first.
    - Graph preview behind `ui.cockpit.memoryGraph`.
    - Lazy deps or isolated viewer artifact.

11. **PR 10: Final polish**
    - Accessibility, no-color/ascii, visual QA, perf checks, integration tests.

---

## 13. Final recommendation

Adopt the **OpenCode layout discipline** and the **oh-my-kimi operator model**:

- OpenCode teaches us how premium terminal UX is structured: renderer discipline, persistent responsive sidebar, restrained HUD, slot-based extensibility, dedicated TUI config, discoverable keymaps.
- oh-my-kimi teaches us what operators need to see: run state, workers, TODOs, ETA, evidence, changed files, graph memory, decision trace.

For GLM, the right path is not to clone either product, and not to ship graph memory before the cockpit earns trust. It is to build:

> **A renderer-neutral operator state model, rendered first as a feature-flagged integrated chat + cockpit + HUD TUI, with graph memory as an optional drill-down surface after the MVP proves useful.**

This is the path most likely to make GLM feel like a serious professional tool rather than a chat app with a dashboard bolted on.

---

## 14. Source references

External:

- OpenCode official docs: https://opencode.ai/docs/
- OpenCode TUI docs: https://opencode.ai/docs/tui/
- OpenCode repo: https://github.com/anomalyco/opencode
- oh-my-kimi repo: https://github.com/dmae97/oh-my-kimi
- oh-my-kimi public site: https://oh-my-kimi.sbs/
- Graphology: https://github.com/graphology/graphology
- Sigma.js: https://www.sigmajs.org/
- Cytoscape.js: https://js.cytoscape.org/
- Kuzu: https://kuzudb.com/

Local reference files inspected:

- `/tmp/opencode-current-research/packages/opencode/src/cli/cmd/tui/app.tsx`
- `/tmp/opencode-current-research/packages/opencode/src/cli/cmd/tui/thread.ts`
- `/tmp/opencode-current-research/packages/opencode/src/cli/cmd/tui/routes/session/index.tsx`
- `/tmp/opencode-current-research/packages/opencode/src/cli/cmd/tui/routes/session/sidebar.tsx`
- `/tmp/opencode-current-research/packages/opencode/src/cli/cmd/tui/routes/session/footer.tsx`
- `/tmp/opencode-current-research/packages/opencode/src/cli/cmd/tui/feature-plugins/system/which-key.tsx`
- `/tmp/opencode-current-research/packages/opencode/src/cli/cmd/tui/feature-plugins/sidebar/files.tsx`
- `/tmp/opencode-current-research/packages/opencode/src/cli/cmd/tui/feature-plugins/sidebar/todo.tsx`
- `/tmp/oh-my-kimi-research/README.md`
- `/tmp/oh-my-kimi-research/MATURITY.md`
- `/tmp/oh-my-kimi-research/docs/hud-and-parallel-ux.md`
- `/tmp/oh-my-kimi-research/docs/local-graph-memory.md`
- `/tmp/oh-my-kimi-research/src/commands/hud.ts`
- `/tmp/oh-my-kimi-research/src/orchestration/parallel-ui.ts`
- `packages/cli/src/ui/components/GLMDashboard.tsx`
- `packages/cli/src/ui/components/DashboardOverlay.tsx`
- `packages/cli/src/ui/components/Composer.tsx`
- `packages/cli/src/ui/components/Footer.tsx`
- `packages/cli/src/ui/hooks/useOrchestratorState.ts`
- `packages/cli/src/dualOutput/DualOutputBridge.ts`
- `packages/core/src/utils/runtimeStatus.ts`
