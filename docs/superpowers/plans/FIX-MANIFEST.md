# Cross-Plan Fix Manifest

**Date:** 2026-05-14
**Status:** ACTIVE — fix agents apply edits below, then plans are execution-ready.

This manifest catalogues every edit required to resolve cross-plan drift discovered by 5 cross-check reviews. Each fix is keyed to a specific plan file and section/line area.

---

## 0. Canonical Decisions (LOCK-IN — all plans honor these)

These are non-negotiable; fix agents enforce them.

### 0.1 RPC Registration API

> **`RpcServer.on(method: string, handler: RpcHandler): void` is the ONLY registration API.**

- ❌ Reject: `rpc.register(name, handler)`, `rpc.method(name, handler)`, any other variant.
- ✅ All plans use `daemon.rpc.on('namespace.method', handler)` or `for (const [n,h] of Object.entries(makeXxxHandlers())) daemon.rpc.on(n, h)`.
- P1 keeps `on()` as defined; do NOT add `register` alias (single API rule).

### 0.2 Migration Filename Numbering (FINAL)

Single sequence in `packages/core/src/storage/migrations/`:

| # | Filename | Owner plan | Contents |
|---|----------|-----------|----------|
| 001 | `001_initial.sql` | P1 | `meta`, `sessions`, `messages`, `events` |
| 002 | `002_tools.sql` | P3 | `todos`, `tool_call_log` |
| 003 | `003_llm_router.sql` | P6 | `llm_cache` (only — session.db) |
| 004 | `004_orchestrator.sql` | P8 | `workers`, `orchestrator_decisions`, `pipeline_state`, `scheduler_state`, **`checkpoints`** (new) |
| 005 | `005_memory_distill.sql` | P7 | `distillations`, `memory_access_log` |
| 006 | `006_file_versions.sql` | P7 | `file_versions`, `snapshots` (new) |
| 007 | `007_compaction.sql` | P7 | `compactions`, `message_parts` (new), `tool_calls` (new — rename from P3's `tool_call_log` if equivalent, else add) |
| 008 | `008_plugins.sql` | P4 | `plugin_state` (moved from inline) |
| 009 | `009_longhorizon.sql` | P10 | ALTER `sessions` (add `mode`), ALTER `checkpoints` (add `phase`, `tokens_used`, `files_dirty`) |

Quota.db (separate file) has its own migration set:
| # | Filename | Owner plan | Contents |
|---|----------|-----------|----------|
| 001 | `001_quota.sql` | P6 | `quota_pools`, `quota_usage` |

### 0.3 ToolRegistry Signature

```ts
class ToolRegistry {
  register(handler: ToolHandler): void   // handler.name is the key
  unregister(name: string): void          // NEW — P3 adds this
  get(name: string): ToolHandler | undefined
  list(): ToolHandler[]
}
```

All plans calling `registry.register(id, defn)` → rewrite to `registry.register({ ...defn, name: id })`.

### 0.4 UrlRouter Signature

```ts
export interface UrlHandler {
  scheme: string
  read: (url: string, ctx: ReadContext) => Promise<UrlPayload>
}

export interface UrlRouter {
  register(handler: UrlHandler): void
  read(url: string, ctx: ReadContext): Promise<UrlPayload>   // NEW top-level
}

export function makeUrlRouter(): UrlRouter   // factory name
```

- Type alias: `UrlPayload` (NOT `UrlHandlerResult`)
- Module path: `@glm/core/tools/read/url-router` (P3's actual location)
- All callers using `createUrlRouter` → use `makeUrlRouter`
- Callers using positional `router.register(scheme, handler)` → use object form

### 0.5 LLMService Public Surface

P6 exports both:
```ts
LLMService.run(req: IRRequest): RunHandle                              // streaming
LLMService.complete(messages: Message[], opts: CallOpts): Promise<string>  // NEW convenience
```

`complete()` internally consumes `run()` and joins text deltas. Adds tokens/usage to telemetry.

All plans that need string-output (`P7` Compactor, `P8` Orchestrator `LlmCaller`, `P10` distillation) use `LLMService.complete()`.

### 0.6 Modify-vs-Create Verb Discipline

If a plan is the FIRST plan to create a file → label **Create**.
If a plan EDITS a file from a prior plan → label **Modify**.
If unclear at plan-author time → prefer Modify (no-op safe) and the executing agent verifies file exists.

### 0.7 Slash Command Collisions

| Slash | Owner | Behavior |
|-------|-------|----------|
| `/plan` | **P9 workflow** | `/plan <task>` invokes planning workflow |
| `/replan` | **P8 control** (renamed from `/plan`) | Force re-plan at next boundary, no args |
| `/trace` | **P9 workflow** | `/trace <observation>` invokes tracing workflow |
| `/trace-timeline` | **P10** (renamed) | `/trace-timeline [sessionId]` shows event log |

### 0.8 Repo Layout Reality vs Spec §17

Plans deliberately consolidate spec's "many top-level packages" into `packages/core/src/<subsystem>/`. Plans are internally consistent; spec §17 should be updated to match (separate task — not in this manifest).

Top-level packages used by plans:
- `@glm/shared`, `@glm/core`, `@glm/cli`, `@glm/tui`, `@glm/llm-router`, `@glm/agents`, `@glm/workers`, `@glm/workflow-runtime`, `@glm/workflows`

### 0.9 `daemon.ts` and `bin.ts` Edit Avalanche → Registry Pattern

Avoid 7 plans textually editing the same two files. Pattern:

`packages/core/src/daemon/loader-hub.ts` (P4 already defines):
```ts
class LoaderHub {
  registerSubsystem(name: string, init: (daemon: Daemon) => void | Promise<void>): void
}
```

Each P-plan that previously did "Modify `daemon.ts` to wire X" instead does:
```ts
// packages/core/src/<subsystem>/index.ts
LoaderHub.registerSubsystem('<name>', async (daemon) => {
  for (const [n,h] of Object.entries(makeXxxHandlers(...))) daemon.rpc.on(n, h)
})
```

P1's `Daemon.start()` calls `await LoaderHub.runAll(this)` once after `runMigrations(db)`.

Similar pattern for `bin.ts`:
```ts
// packages/cli/src/registry.ts
import { commands } from './commands/_registry'  // each command file pushes to commands[]
export function registerAll(program: Command) { for (const fn of commands) fn(program) }
```

Each `packages/cli/src/commands/<x>.ts` does `commands.push(registerXxxCommand)`.

`bin.ts` only imports `'./registry'` and calls `registerAll(program)`. No more textual edits.

### 0.10 Shared Types Per-Domain Files

`packages/shared/src/types.ts` stays small (only P1 owns it).

Each plan that needs new shared types creates its own file:
- P6: `packages/shared/src/llm-router-types.ts`
- P7: `packages/shared/src/memory-types.ts`, `lsp-types.ts`
- P8: `packages/shared/src/orchestrator-types.ts`, `pipeline-types.ts`, `role-types.ts`, `worker-types.ts`
- P9: `packages/shared/src/workflow-types.ts`
- P10: `packages/shared/src/yolo-types.ts`, `notification-types.ts`

`packages/shared/src/index.ts` re-exports all (P1 owns, but P-plans append their re-export line — small, low-conflict).

### 0.11 Worker Termination Event Name

Use `SubagentStop` (P5-defined), not `Stop`. `Stop` is session-level only.

### 0.12 CLI ↔ Slash 1:1 Catch-All

P2 adds a catch-all slash handler in `packages/tui/src/slash/dispatcher.ts`:

```ts
// Order: built-in slash → workflow slash → command-loader render → CLI passthrough → 404
async function dispatch(input: string): Promise<void> {
  const [cmd, ...args] = input.slice(1).split(' ')
  if (builtinRegistry.has(cmd)) return builtinRegistry.get(cmd)!(args)
  if (workflowRegistry.has(cmd)) return workflowRegistry.run(cmd, args.join(' '))
  if (commandLoaderRegistry.has(cmd)) return rpc.call('command.render', { id: cmd, args })
  // CLI passthrough — every CLI subcommand is reachable as `/<cmd>`
  return rpc.call('cli.exec', { cmd, args })
}
```

P2 reserves `rpc.call('cli.exec', ...)` — P10 (or P4) wires its handler.

### 0.13 Forbidden Path: `packages/hooks/`

No such directory exists. All hook code lives in `packages/core/src/hooks/`. P9 must replace all `packages/hooks/` references.

---

## 1. P1 (Daemon Core) Fixes

**File:** `2026-05-14-glm-code-p1-daemon-core.md`

### P1-Fix-1: Task 9 file labels
- Find: `**Files:**` block before "Implement `sessions`" listing `Modify: packages/cli/src/commands/sessions.ts` etc.
- Change Modify → **Create** for `sessions.ts`, `attach.ts`, `chat.ts`. P1 is the first plan creating them.

### P1-Fix-2: Task 10 file label
- Find: `**Files:**` for doctor task: `Modify: packages/cli/src/commands/doctor.ts`
- Change Modify → **Create**.

### P1-Fix-3: Pre-migration backup (§11.7)
Add a new step (extend Task 3 or as Task 3.5) in P1:

```ts
// packages/core/src/storage/migrations.ts — addition
import { copyFileSync, existsSync } from 'node:fs'

export function runMigrations(db: Database, dir = join(HERE, 'migrations')) {
  const cur = currentSchemaVersion(db)
  const files = readdirSync(dir).filter(f => f.endsWith('.sql')).sort()
  const pendingCount = files.filter(f => Number(f.split('_')[0]) > cur).length
  if (pendingCount > 0) {
    const dbFile = db.name        // better-sqlite3 exposes path
    const bak = `${dbFile}.pre_migration_v${cur}.bak`
    if (existsSync(dbFile) && !existsSync(bak)) copyFileSync(dbFile, bak)
  }
  // ... existing migration loop
}
```

Plus a unit test: backup file exists after migration with pending changes.

### P1-Fix-4: Register `dashboard.subscribe` stub
In Task 7 Step 3 `Daemon.start()`, add:

```ts
this.rpc.on('dashboard.subscribe', async (_, ctx) => {
  // P8 enhances this with real stream; P1 returns a stub stream id so callers don't 404
  return { ok: true, streamId: ulid(), version: 'stub-p1' }
})
```

### P1-Fix-5: LoaderHub bootstrap
In Task 7 Step 3, replace direct handler wiring with LoaderHub invocation:

```ts
async start(): Promise<void> {
  // ... existing PID + db + repo + socket
  this.rpc.on('ping', pingHandler)
  this.rpc.on('daemon.status', ...)
  this.rpc.on('daemon.shutdown', ...)
  this.rpc.on('dashboard.subscribe', ...)
  for (const [n,h] of Object.entries(makeSessionHandlers(this.repo))) this.rpc.on(n, h)
  this.rpc.on('message.send', messageSendStub)
  // NEW:
  await LoaderHub.runAll(this)         // later plans register subsystems via LoaderHub
  // ...
}
```

P1 itself ships an empty `LoaderHub` (`packages/core/src/daemon/loader-hub.ts`) with stub `registerSubsystem` and `runAll`. Other plans (P3+) populate it.

### P1-Fix-6: bin.ts registry pattern
Replace `bin.ts` direct `registerXxxCommand(program)` calls with:

```ts
// packages/cli/src/registry.ts (new file in P1)
import type { Command } from 'commander'
const registrations: Array<(p: Command) => void> = []
export function registerCommand(fn: (p: Command) => void) { registrations.push(fn) }
export function registerAll(p: Command) { for (const fn of registrations) fn(p) }
```

Each `commands/*.ts` calls `registerCommand(registerXxxCommand)` at import time. `bin.ts` imports `'./registry'` and `'./commands/'` (a barrel that imports every command file for side-effects), then calls `registerAll(program)`.

---

## 2. P2 (TUI) Fixes

**File:** `2026-05-14-glm-code-p2-tui.md`

### P2-Fix-1: Task 11 verb
- Change `Modify: packages/tui/src/runTui.ts (new file actually...)` → **Create**.

### P2-Fix-2: Register `/history` slash
Task 8 (or wherever slash commands are added): explicitly register `/history` in the slash registry. Currently parsed but not in registry per review #4.

### P2-Fix-3: Add `/context` and `/compact` slash commands
Add two new built-in slash command entries:
- `/context` — opens DashboardView's STATUS panel with full breakdown (P7 provides RPC `context.assemble` for data)
- `/compact [focus]` — calls `rpc.call('context.compact', { focus })` (P7 provides this RPC — fix-7-A)

If P7 hasn't wired `context.compact` yet, P2 calls it anyway — graceful 404 handling already exists.

### P2-Fix-4: CLI passthrough dispatcher
Implement §0.12 catch-all dispatcher in `packages/tui/src/slash/dispatcher.ts`.

---

## 3. P3 (Tools) Fixes

**File:** `2026-05-14-glm-code-p3-tools.md`

### P3-Fix-1: tools/index.ts duplicate Create
Task 1 lists `Create: packages/core/src/tools/index.ts` AND Task 13 also lists same path (annotated "modify"). Fix Task 13 to label **Modify**.

### P3-Fix-2: RPC registration call
In Task 13, find `this.rpc.register(name, handler as never)` and change to:
```ts
this.rpc.on(name, handler)
```

### P3-Fix-3: ToolRegistry `unregister`
Add to `packages/core/src/tools/registry.ts`:
```ts
unregister(name: string): void {
  this.tools.delete(name)
}
```

### P3-Fix-4: UrlRouter top-level `read()`
In `packages/core/src/tools/read/url-router.ts`:

```ts
export interface UrlRouter {
  register(handler: UrlHandler): void
  read(url: string, ctx: ReadContext): Promise<UrlPayload>   // NEW
}

export function makeUrlRouter(): UrlRouter {
  const handlers = new Map<string, UrlHandler>()
  return {
    register(h) { handlers.set(h.scheme, h) },
    async read(url, ctx) {
      const scheme = url.match(/^([a-z]+):\/\//)?.[1] ?? 'local'
      const h = handlers.get(scheme)
      if (!h) throw new Error(`No handler for scheme: ${scheme}`)
      return h.read(url, ctx)
    }
  }
}
```

Add unit test.

### P3-Fix-5: Remove hardcoded schema_version INSERT
In Task 12's `002_tools.sql`, REMOVE the line:
```sql
INSERT OR REPLACE INTO meta(key, value) VALUES ('schema_version', '2');
```
P1's migration runner handles this automatically.

### P3-Fix-6: LoaderHub registration
P3 registers its tool subsystem via LoaderHub instead of directly editing `daemon.ts`:

```ts
// packages/core/src/tools/index.ts (new export at end)
import { LoaderHub } from '../daemon/loader-hub'
LoaderHub.registerSubsystem('tools', async (daemon) => {
  const registry = makeToolRegistry()
  // ... register built-in tools
  daemon.rpc.on('tool.list', /* handler */)
  daemon.rpc.on('tool.call', /* handler */)
  daemon.toolRegistry = registry   // expose for later plans
})
```

Remove the Modify on `daemon.ts` from Task 13.

### P3-Fix-7: Hashline benchmark task (§13.5 GA gate coverage)
Add new Task 15.5 (or extend Task 14): **Hashline benchmark harness**.

```
File: packages/core/src/tools/hashline/benchmark.ts
File: packages/core/test/bench/hashline-bench.ts

Bench config: 12 reference tasks × 3 models × 5 separator candidates × 24 runs.
Metrics: task ✓, edit ✓, patch fail %, tokens/run.
Output: JSON report at .glm/bench/hashline-<ts>.json + console summary table.

CLI: glm bench hashline --model GLM-5.1 --runs 24
Target gate (P3 acceptance):
  - edit ✓ ≥ 90% on GLM-5.1 (acceptance threshold for v0.1)
  - patch fail ≤ 8%
  - tokens ±10% vs baseline (recorded once, regression check thereafter)
```

This is a stub benchmark (mock LLM responses for fast CI) + real-LLM mode `--real` gated by API key. The 90% gate runs on REAL mode weekly per §13.4.

### P3-Fix-8: Internal URL stubs document deferred phase
Each stub handler comments target phase clearly:
- `memory://` → "(stub — P7 implements)"
- `mcp://`, `skill://`, `rule://` → "(stub — P4)"
- `agent://` → "(stub — P8)"
- `artifact://` → "(stub — P10)"
- `conflict://` → "(stub — v0.2)"

(Already partially done; verify all 10 schemes annotated.)

---

## 4. P4 (MCP/Skill/Plugin) Fixes

**File:** `2026-05-14-glm-code-p4-mcp-skill-plugin.md`

### P4-Fix-1: ToolRegistry call sites
Find ALL `registry.register(id, defn)` and `toolRegistry.register('builtin:Skill', defn)` etc. Rewrite to:
```ts
registry.register({ name: id, ...defn })
```
Locations: ~lines 1712, 2624, others (search for `\.register\(['"][a-z]`).

### P4-Fix-2: UrlRouter import + factory + signature
- Change import: `import { createUrlRouter } from '../../src/internal-urls'` → `import { makeUrlRouter, type UrlPayload } from '@glm/core/tools/read/url-router'`
- Change call: `createUrlRouter()` → `makeUrlRouter()`
- Change registration calls: `router.register('mcp', async (url) => ...)` → `router.register({ scheme: 'mcp', read: async (url, ctx) => ... })`
- Rename type: `UrlHandlerResult` → `UrlPayload`
- Verify `router.read('mcp://...')` works (P3-Fix-4 provides this).

### P4-Fix-3: Migration for plugin_state
Move `CREATE TABLE IF NOT EXISTS plugin_state` from inline `PluginRegistry` constructor to a real migration file:

```
Create: packages/core/src/storage/migrations/008_plugins.sql
```

Contents:
```sql
CREATE TABLE IF NOT EXISTS plugin_state (
  name        TEXT PRIMARY KEY,
  version     TEXT,
  enabled     INTEGER NOT NULL DEFAULT 1,
  installed_at TEXT NOT NULL,
  config      BLOB
);
```

Remove inline `db.exec(TABLE)` from `PluginRegistry` constructor.

### P4-Fix-4: Hook config ownership clarification
Hook config parsing (schema validation only) stays in P4 at `packages/core/src/hooks/config-loader.ts` (NEW file, P4 creates).

P5 owns `packages/core/src/hooks/index.ts`, `events/`, `dispatcher.ts`, `sandbox.ts`, etc. P4 does NOT Create `hooks/index.ts`.

Update P4 Task 14 file list: remove `Create: packages/core/src/hooks/index.ts`. Replace with `Create: packages/core/src/hooks/config-loader.ts`.

### P4-Fix-5: `glm command` consistency
P4 standardizes on `glm command` (NOT `glm cmd`). Rename `cmdCommand()` factory to `commandCommand()`. RPC stays `command.list/show/render`.

### P4-Fix-6: LoaderHub
P4 already has `LoaderHub` (Task 17). Confirm P3's loader-hub.ts is the same one (P3-Fix-6). If P4 invents its own, merge — single LoaderHub in `packages/core/src/daemon/loader-hub.ts`.

P4 plan: keep LoaderHub creation, but mark its file as `Modify: packages/core/src/daemon/loader-hub.ts` since P1 ships it as stub (P1-Fix-5).

### P4-Fix-7: `cli.exec` RPC handler
P4 (or P10) wires the catch-all CLI passthrough RPC (§0.12):

```ts
daemon.rpc.on('cli.exec', async (params: { cmd: string, args: string[] }) => {
  // run the commander subcommand with given args, capture stdout/stderr/exitCode
  // returns { stdout, stderr, exitCode }
})
```

Choose: P4 wires it (close to slash dispatcher infra), update P4 plan.

---

## 5. P5 (Hooks & Events) Fixes

**File:** `2026-05-14-glm-code-p5-hooks-events.md`

### P5-Fix-1: Hooks file ownership
P5 owns ALL of `packages/core/src/hooks/` EXCEPT `config-loader.ts` (P4-Fix-4). Specifically P5 Creates:
- `index.ts` (P5 creates — not P4)
- `events/types.ts`
- `events/dispatch.ts`
- `sdk/define-hook.ts`
- `sdk/context.ts`
- `manager.ts`
- `sandbox.ts`
- `built-in/keyword-detector.ts`
- `built-in/delegation-enforcer.ts`
- `built-in/persistent-mode.ts`
- `built-in/etc.`
- `keywords/registry.ts` (NEW — see fix-2)

### P5-Fix-2: Export `KeywordDetector.registerSource`
P5 must export:
```ts
// packages/core/src/hooks/keywords/registry.ts
class KeywordRegistry {
  registerSource(name: string, entries: KeywordRule[]): void
  match(prompt: string): KeywordMatch[]
}

export const keywordRegistry = new KeywordRegistry()
```

P5's keyword-detector hook calls `keywordRegistry.match(prompt)`. P9 will call `keywordRegistry.registerSource('builtin-workflows', entries)`.

### P5-Fix-3: Worker termination event
Verify no code in P5 emits `Stop` for worker termination. The session-level `Stop` event is reserved for the session ending entirely. Worker terminations use `SubagentStop`.

### P5-Fix-4: LoaderHub registration
P5 registers via LoaderHub (not direct `daemon.ts` edit).

### P5-Fix-5: Doctor CLI is Modify not Create
P5 Task 14 currently Modifies `packages/cli/src/commands/doctor.ts`. Correct — P1-Fix-2 already established P1 Creates it.

---

## 6. P6 (LLM Router) Fixes

**File:** `2026-05-14-glm-code-p6-llm-router.md`

### P6-Fix-1: Migration rename
Rename `002_llm_router.sql` → `003_llm_router.sql`. Contents: only `llm_cache` table.

### P6-Fix-2: Separate quota.db migration
Create separate migration directory for quota.db OR same dir but loaded with a `db` filter. Recommended:
- New file: `packages/core/src/storage/quota-migrations/001_quota.sql` — contains `quota_pools`, `quota_usage`
- New helper in storage/migrations.ts: `runMigrationsForDb(db, dir)` (already generic, just point at the new dir for quota.db).

P6 Task 9 updates `QuotaTracker` constructor to call `runMigrationsForDb(quotaDb, 'quota-migrations')`.

### P6-Fix-3: Add `LLMService.complete()`
Add public method:

```ts
// packages/llm-router/src/service.ts
async complete(messages: Message[], opts: CallOpts): Promise<{ text: string; usage: Usage }> {
  const req: IRRequest = this.buildRequest(messages, opts)
  const handle = this.run(req)
  let text = ''
  let usage: Usage = {}
  for await (const evt of handle.events()) {
    if (evt.type === 'text_delta') text += evt.text
    if (evt.type === 'usage') usage = evt.usage
  }
  return { text, usage }
}
```

Add unit test + integration test using mock server.

Update exports in `packages/llm-router/src/index.ts`.

### P6-Fix-4: 30s pause-after-N-failures
In `packages/llm-router/src/retry/policy.ts`, after 3 consecutive failures, pause for 30s before next attempt (instead of immediate next retry). Document in Task 8.

### P6-Fix-5: Don't touch `shared/src/types.ts`
Create `packages/shared/src/llm-router-types.ts` with all P6-specific types. Append re-export line to `shared/src/index.ts` only.

### P6-Fix-6: LoaderHub registration
LoaderHub.registerSubsystem('llm-router', ...) instead of direct `daemon.ts` edit.

---

## 7. P7 (Memory & Context Engine + LSP) Fixes

**File:** `2026-05-14-glm-code-p7-memory-context-lsp.md`

### P7-Fix-1: Migration renumbers
- `003_memory_distill.sql` → `005_memory_distill.sql`
- `004_file_versions.sql` → `006_file_versions.sql` — ADD `snapshots` table here
- `005_compaction.sql` → `007_compaction.sql` — ADD `message_parts` + `tool_calls` tables here (spec §11.2)

`snapshots` table schema:
```sql
CREATE TABLE IF NOT EXISTS snapshots (
  sha       TEXT PRIMARY KEY,
  size      INTEGER NOT NULL,
  ref_count INTEGER NOT NULL DEFAULT 0
);
```

`message_parts`:
```sql
CREATE TABLE IF NOT EXISTS message_parts (
  message_id  TEXT NOT NULL,
  idx         INTEGER NOT NULL,
  type        TEXT NOT NULL,           -- text|tool_use|tool_result|thinking|image
  data        BLOB NOT NULL,
  tool_use_id TEXT,
  PRIMARY KEY (message_id, idx),
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_parts_tool ON message_parts(tool_use_id);
```

`tool_calls`:
```sql
CREATE TABLE IF NOT EXISTS tool_calls (
  id           TEXT PRIMARY KEY,        -- = tool_use_id
  message_id   TEXT NOT NULL,
  name         TEXT NOT NULL,
  input        BLOB NOT NULL,
  status       TEXT NOT NULL,
  started_at   TEXT,
  finished_at  TEXT,
  result_data  BLOB,
  result_truncated INTEGER DEFAULT 0,
  error        TEXT,
  worker_id    TEXT,
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_tool_status ON tool_calls(status, started_at);
```

(P3's `tool_call_log` may overlap — verify and either delete `tool_call_log` from `002_tools.sql` or keep both as different concerns. Recommendation: P3's table is log-only; P7's is canonical. Add a NOTE comment in both migrations.)

### P7-Fix-2: Don't touch `shared/src/types.ts`
Use `packages/shared/src/memory-types.ts` and `lsp-types.ts` exclusively.

### P7-Fix-3: Add `context.compact` RPC
Add to `packages/core/src/context/compactor.ts` daemon registration:

```ts
daemon.rpc.on('context.compact', async (params: { focus?: string }, ctx) => {
  // run compaction now for ctx.sessionId with optional focus
  return compactor.compact(ctx.sessionId, params.focus)
})
```

### P7-Fix-4: Add `/context` and `/compact` slash commands
P7 documents that P2 wires `/context` and `/compact` slashes (P2-Fix-3). P7 ensures the underlying RPCs exist:
- `context.assemble` (already in P7 Task 17)
- `context.compact` (P7-Fix-3)

### P7-Fix-5: Hindsight deferral doc
Find any P7 text saying "hindsight deferred to P9". Change to "deferred to v0.2 (see spec §9.22)".

### P7-Fix-6: Wire Compactor.opts.llm to LLMService.complete
In P7's Compactor construction site (where `new Compactor({ llm })` is called in daemon wiring), pass:

```ts
new Compactor({
  llm: (messages, opts) => llmService.complete(messages, opts).then(r => r.text)
})
```

Document the binding in P7 Task 24 (daemon registration) or wherever real-LLM wiring lives.

### P7-Fix-7: LoaderHub registration
P7 subsystem (memory + lsp) registers via LoaderHub.

---

## 8. P8 (Orchestrator + Agents) Fixes

**File:** `2026-05-14-glm-code-p8-orchestrator-agents.md`

### P8-Fix-1: Migration renumber + add checkpoints
Rename `003_orchestrator.sql` → `004_orchestrator.sql`. ADD `checkpoints` table:

```sql
CREATE TABLE IF NOT EXISTS checkpoints (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL,
  step        INTEGER NOT NULL,
  ts          TEXT NOT NULL,
  payload     BLOB NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ckpt_session ON checkpoints(session_id, step);
```

P10's ALTERs then work.

### P8-Fix-2: Replace `LlmCaller` with LLMService.complete adapter
In `packages/agents/src/orchestrator.ts`:

```ts
// BEFORE (P8 invented):
type LlmCaller = (messages, opts) => Promise<string>

// AFTER:
import { LLMService } from '@glm/llm-router'

class Orchestrator {
  constructor(private opts: { llm: LLMService }) {}
  private async callLLM(messages: Message[], opts: { model: string }): Promise<string> {
    const r = await this.opts.llm.complete(messages, opts)
    return r.text
  }
}
```

Update P8's `OrchestratorOpts` type and all construction sites.

### P8-Fix-3: workers/index.ts is Create
Task 14: change `Modify: packages/core/src/workers/index.ts` → **Create**.

### P8-Fix-4: orchestrator.ts RPC method file is Create
Task 16: change `Modify: packages/core/src/rpc/methods/orchestrator.ts (new)` → **Create**. Remove the "(new)" annotation.

### P8-Fix-5: Worker termination event
Find code emitting `Stop` for worker termination. Replace with `SubagentStop` (P5-defined). Use `SubagentStopEvent { workerId, status, durationMs, tokens? }` payload.

### P8-Fix-6: `task.delegate` explicit registration
Add concrete code in Task 16:

```ts
// packages/core/src/rpc/methods/orchestrator.ts
import { LoaderHub } from '../../daemon/loader-hub'
import { Orchestrator } from '@glm/agents'

LoaderHub.registerSubsystem('orchestrator', async (daemon) => {
  const orch = new Orchestrator({ llm: daemon.llmService, /* ... */ })
  daemon.rpc.on('task.delegate', async (params: TaskDelegateParams, ctx) => {
    return orch.delegate(params, ctx)
  })
  // ... other orchestrator RPCs
  daemon.orchestrator = orch
})
```

### P8-Fix-7: Rename `/plan` control → `/replan`
In Task 11 `applySlash` (around lines 2461-2464), rename `/plan` slash control to `/replan`. The semantic stays "force re-plan at next boundary, no args". Update:
- Slash command name
- Help text
- Tests
- TUI dispatcher routing

### P8-Fix-8: `dashboard.subscribe` claim
Remove the false claim "P1 has the dashboard.subscribe skeleton" from Task 18 narrative (line 3711). P1 stub is added by P1-Fix-4. P8's job is to enhance with real streaming. Adjust the narrative.

### P8-Fix-9: LoaderHub
Register all orchestrator/scheduler/worker subsystems via LoaderHub.

---

## 9. P9 (Workflows) Fixes

**File:** `2026-05-14-glm-code-p9-workflows.md`

### P9-Fix-1: Replace phantom `packages/hooks/` references
Search all `packages/hooks/` mentions. Replace with `packages/core/src/hooks/keywords/registry.ts` (where P5's KeywordRegistry lives).

P9 Task 24 imports:
```ts
import { keywordRegistry } from '@glm/core/hooks/keywords/registry'
```

(or via barrel: `import { keywordRegistry } from '@glm/core'`)

### P9-Fix-2: `/plan` semantic stays workflow
P9 keeps `/plan <task>` as the workflow invocation. P8's `/plan` control is renamed to `/replan` (P8-Fix-7). No change needed in P9 — the collision is resolved by P8 renaming.

### P9-Fix-3: Workflow runner ↔ orchestrator binding
Add explicit task in P9: **"Wire WorkflowRunner to Orchestrator + Scheduler"**.

```ts
// packages/workflow-runtime/src/runner.ts
import { Orchestrator, ModelScheduler } from '@glm/agents'

class WorkflowRunner {
  constructor(private opts: { orchestrator: Orchestrator; scheduler: ModelScheduler }) {}
  async runPhase(phase: WorkflowPhase, ctx: WorkflowContext) {
    // For each phase, either:
    //  - phase.agent → spawn sub-agent via scheduler.dispatch({ task, model: agent.model })
    //  - phase.workflow → recursive runner.run(sub-workflow)
    //  - phase.parallel → Promise.all([...])
  }
}
```

### P9-Fix-4: LoaderHub for workflow subsystem
Register workflow loader + runner via LoaderHub.

---

## 10. P10 (Polish/Yolo/Long-horizon) Fixes

**File:** `2026-05-14-glm-code-p10-polish-longhorizon-yolo.md`

### P10-Fix-1: Migration renumber
Rename `004_longhorizon.sql` → `009_longhorizon.sql`. Contents stays (ALTER sessions + ALTER checkpoints — checkpoints now exists from P8-Fix-1).

### P10-Fix-2: Register P10 RPC handlers
Add a new task: **"Wire P10 daemon RPC handlers via LoaderHub"**.

```ts
// packages/core/src/longhorizon/index.ts
LoaderHub.registerSubsystem('longhorizon', async (daemon) => {
  for (const [n,h] of Object.entries(makeYoloHandlers(daemon))) daemon.rpc.on(n, h)
  for (const [n,h] of Object.entries(makeNotifyHandlers(daemon))) daemon.rpc.on(n, h)
  for (const [n,h] of Object.entries(makeTraceHandlers(daemon))) daemon.rpc.on(n, h)
  for (const [n,h] of Object.entries(makeCommitHandlers(daemon))) daemon.rpc.on(n, h)
  for (const [n,h] of Object.entries(makeRecipeHandlers(daemon))) daemon.rpc.on(n, h)
  for (const [n,h] of Object.entries(makeBugHandlers(daemon))) daemon.rpc.on(n, h)
  for (const [n,h] of Object.entries(makeConfigHandlers(daemon))) daemon.rpc.on(n, h)
})
```

Each `makeXxxHandlers(daemon)` exists in its own module (Tasks 11/12/15/16/17 etc.).

### P10-Fix-3: Add `glm export/import` (spec §11.6 gap)
Add new task: **"Session export/import"**.

```
File: packages/core/src/sessions/export.ts
File: packages/core/src/sessions/import.ts
File: packages/cli/src/commands/session-io.ts

CLI:
  glm export <sessionId> [--format json|md|html] [--out <path>]
  glm import <file.json>

Formats:
  json: full session.db + checkpoints serialized → single .json
  md:   human-readable transcript (chat + tool calls + decisions)
  html: opencode-style colored interactive single-file

Tests:
  unit: serialize a fixture session → reimport → equal
  integration: real session round-trip
```

### P10-Fix-4: Add `glm gc` (spec §11.8 gap)
Add new task: **"glm gc cleanup command"**.

```
File: packages/core/src/storage/gc.ts
File: packages/cli/src/commands/gc.ts

Behavior:
  - VACUUM session.db files > 100MB
  - Archive 6-month-idle sessions to tar.zst
  - LRU evict ~/.glm/cache/web/ to 50MB cap
  - LRU evict ~/.glm/cache/llm/ to 200MB cap (skip currently active sessions)
  - Trim daemon.log to 50MB × 3 rolling

CLI: glm gc [--dry-run]
```

### P10-Fix-5: Add `/diff` and `/revert` slash + CLI (spec §11.4 gap)
Add new task: **"File version diff + revert"**.

```
File: packages/core/src/snapshot/diff.ts (consumer of P7's file_versions + snapshots)
File: packages/cli/src/commands/diff.ts

CLI: glm diff [--from <step>] [--to <step>] [--session <id>]
TUI slash: /diff [--from N] [--to M]
TUI slash: /revert <step>          (with confirm prompt; reverts working tree to that step's state)

Uses P7's snapshots/<sha> blob store + file_versions table.
```

### P10-Fix-6: Add structured-question payload (spec §9.19 gap)
Extend `packages/core/src/hooks/sdk/context.ts` (P5-owned but P10 augments):

```ts
type StructuredQuestion = {
  type: 'single' | 'multi' | 'freetext'
  question: string
  options?: Array<{ id: string; label: string; description?: string }>
}

interface HookContext {
  // ...
  askStructured(q: StructuredQuestion): Promise<{ selected: string[]; freetext?: string }>
}
```

Implementation goes through `notification.requestUserResponse` → terminal modal in v0.1 (Telegram/Discord buttons in v0.2 per §9.22).

P10 adds the implementation; P5 adds the type signature.

### P10-Fix-7: Worker termination event
Search P10 for `Stop` emitted on worker termination. Replace with `SubagentStop`.

### P10-Fix-8: doctor.ts is Modify
P10's full doctor implementation Modifies `packages/cli/src/commands/doctor.ts` (P1 created skeleton, P5 already modified once). Confirm Modify label.

### P10-Fix-9: `/trace` collision
P9 owns `/trace` workflow. P10's session-trace-dump command is CLI-only:
- CLI: `glm trace timeline <sessionId>` (NOT a slash — remove any `/trace` slash registration in P10)
- TUI: from `/trace-timeline [sessionId]` slash if user wants it accessible via slash, but recommend keeping it CLI-only for v0.1

### P10-Fix-10: `/yolo` slash registration
Add explicit `/yolo` slash registration if §8.12 specifies it. Toggle (no args), with form-mode UI to set caps.

### P10-Fix-11: LoaderHub
All P10 subsystems via LoaderHub.

### P10-Fix-12: 30s network pause behavior
Confirm P6-Fix-4 covers this. If not, add to P10's resilience tasks.

### P10-Fix-13: Weekly real-LLM regression test scheduling
Add to nightly/weekly CI configuration section: weekly job that runs hashline benchmark (P3-Fix-7) and ~100 LLM regression fixtures with real API key (budget ~$5/wk per spec §13.4).

---

## 11. Verification After Fixes

After all fix agents apply edits, run:

```bash
cd docs/superpowers/plans

# 1. No more migration filename conflicts (each NNN_ used once across all plans)
grep -hoE "migrations/[0-9]+_[a-z_]+\.sql" *.md | sort -u

# 2. No phantom packages/hooks/ references
grep -l "packages/hooks/" *.md   # expected: no output

# 3. No rpc.register or rpc.method calls
grep -nE "rpc\.(register|method)\(" *.md   # expected: no output

# 4. No createUrlRouter or UrlHandlerResult
grep -nE "createUrlRouter|UrlHandlerResult" *.md   # expected: no output

# 5. Stop hook used only for session, not worker termination
grep -nE "emit\(['\"]Stop['\"]|hookEvent.*Stop[^a-zA-Z]" *.md   # manual review for context

# 6. checkpoints table created
grep -nE "CREATE TABLE.*checkpoints" *.md   # expected: in p8 (004_orchestrator.sql)

# 7. /plan owned by P9, /replan by P8
grep -nE "['\"]/plan['\"]" *p8*.md   # expected: empty or only as legacy alias docs
grep -nE "['\"]/replan['\"]" *p8*.md  # expected: present

# 8. New tasks (export/import, gc, diff/revert) in P10
grep -nE "export.*import|glm gc|/diff" *p10*.md  # expected: present
```

If any check fails → re-dispatch the relevant fix agent.

---

## Summary of Fix Counts

| Plan | Critical fixes | Soft fixes | New tasks added |
|------|---------------|------------|-----------------|
| P1 | 5 | 1 | 1 (pre-mig backup) |
| P2 | 1 | 3 | 0 |
| P3 | 6 | 2 | 1 (hashline bench) |
| P4 | 5 | 2 | 0 |
| P5 | 3 | 2 | 0 |
| P6 | 4 | 2 | 1 (LLMService.complete) |
| P7 | 4 | 3 | 0 |
| P8 | 7 | 2 | 0 |
| P9 | 2 | 2 | 1 (runner-orchestrator binding) |
| P10 | 5 | 8 | 3 (export/import, gc, diff/revert) |
| **Total** | **42** | **27** | **7** |

After fixes: 0 blockers, all critical conflicts resolved, all spec gaps closed. P1 execution-ready.

---

## 11. Action × Model × Thinking 2-Layer System (spec §9.23 추가)

oh-my-pi 의 `/model` picker UX 를 우리 20-role 시스템 위에 얹는 2-layer 라우팅. spec §9.23 참조.

### 11.0 Canonical Decisions (LOCK-IN)

#### 11.0.1 7 Actions (확장 불가)
`default, smol, slow, plan, designer, commit, task`

**Vision 은 actions 에 포함 안 됨** — GLM Coding Plan 의 LLM 들은 vision 미지원. Vision 작업은 항상 bundled `glm-vision` MCP 서버 (§9.12) 로 자동 위임. `/model` picker 에 vision slot 없음.

#### 11.0.2 7 Thinking Levels
`inherit, off, min, low, medium, high, xhigh` (inherit 포함 7개)

#### 11.0.3 Settings.json 스키마
```jsonc
{
  "actions": {
    "default":   { "model": "GLM-5.1",      "thinking": "medium" },
    "smol":      { "model": "GLM-5-Turbo",  "thinking": "off"    },
    "slow":      { "model": "GLM-5.1",      "thinking": "xhigh"  },
    "plan":      { "model": "GLM-5.1",      "thinking": "high"   },
    "designer":  { "model": "GLM-5.1",      "thinking": "medium" },
    "commit":    { "model": "GLM-5-Turbo",  "thinking": "off"    },
    "task":      { "model": "GLM-5.1",      "thinking": "low"    }
  },
  "agents": { /* advanced per-role override, optional */ }
}
```
Vision 은 별도 — `mcpServers.glm-vision` 으로 관리, actions 에 포함 X.

#### 11.0.4 Token budget 매핑
```ts
const THINKING_BUDGETS: Record<ThinkingLevel, number> = {
  inherit: -1, off: 0, min: 512, low: 2048, medium: 8192, high: 32768, xhigh: 65536
}
```

#### 11.0.5 Role → Action 매핑표 (P8 frontmatter)
| Role | Action | Role | Action |
|------|--------|------|--------|
| orchestrator | slow | code-reviewer | slow |
| planner | plan | code-simplifier | smol |
| architect | plan | security-reviewer | slow |
| executor | default | test-engineer | default |
| verifier | default | qa-tester | smol |
| critic | slow | debugger | default |
| tracer | slow | designer | designer |
| explore | smol | document-specialist | smol |
| analyst | slow | writer | smol |
| scientist | slow | git-master | commit |

#### 11.0.6 Resolution 우선순위
```
1) 호출 시 명시 (e.g., /route GLM-4.7)
2) settings.agents.<role>.{model, thinking}    ← advanced override
3) settings.actions.<action>.{model, thinking} ← user normal config
4) Role frontmatter action 매핑 (Layer B 기본)
5) hardcoded default
```

### 11.1 P2 Patches (TUI Model Picker)

**File:** `2026-05-14-glm-code-p2-tui.md`

- **P2-Fix-5 (NEW):** Add task **"Model picker TUI"**.
  - New file: `packages/tui/src/views/ModelPicker.tsx`
  - Layout per spec §9.23 (provider tabs ZAI/CANONICAL/ALL/LLAMA.CPP/LM-STUDIO/OLLAMA — but only ZAI works; others greyed out / show "not configured (GLM only)")
  - Wait — spec says Ollama removed. Tabs = `ALL | CANONICAL | ZAI` only. No local provider tabs.
  - 3-stage flow: model list → action select → thinking level select
  - Slash entry: `/model` opens picker, `/model <action> <model>` direct
  - File: `packages/tui/src/slash/commands/model.ts`
  - RPC calls: `model.list`, `model.set`, `model.show`, `model.reset` (P6 provides handlers).
  - Tests: snapshot render of each stage, RPC call assertions, esc/cancel flow.

### 11.2 P6 Patches (Router-level action resolution)

**File:** `2026-05-14-glm-code-p6-llm-router.md`

- **P6-Fix-7 (NEW):** Add task **"Action × Thinking resolver"**.
  - New file: `packages/llm-router/src/resolver/action-resolver.ts`
    - `ActionResolver.resolve({ role, action, override }): { model, thinkingBudget }`
    - Honors resolution priority (§11.0.6)
  - New file: `packages/llm-router/src/resolver/thinking-budgets.ts`
    - `THINKING_BUDGETS` map (§11.0.4)
    - `applyThinking(req, level)` — sets `thinking.budget_tokens` for Anthropic mode, `reasoning_effort` mapping for OpenAI mode if model supports, else off
  - Updated file: `packages/llm-router/src/service.ts` — `LLMService.complete()` and `LLMService.run()` accept optional `{ action, role }` opts and call resolver before provider dispatch.
  - Schema validation: `packages/shared/src/llm-router-types.ts` adds `Action` and `ThinkingLevel` union types + `ActionConfig` schema (zod).
  - Settings cascade extension: `packages/core/src/settings/cascade.ts` reads `actions` and `agents.<role>` sections.
  - RPC methods: `daemon.rpc.on('model.list', ...)`, `'model.set'`, `'model.show'`, `'model.reset'` registered via existing LoaderHub('llm-router') registration in P6-Fix-6.
  - CLI: `glm model set/show/reset/list` in `packages/cli/src/commands/model.ts`.
  - Tests: unit (resolution priority cases × 5), integration (real settings file → resolver output for each of 20 roles).

- **P6-Fix-8 (NEW):** Add task **"OpenAI-mode thinking degradation"**.
  - GLM-4.5-Air / -AirX 는 hybrid thinking 지원하지만 OpenAI mode 에선 `reasoning_effort` API 사용.
  - 매핑: `inherit/off → off`, `min/low → 'low'`, `medium → 'medium'`, `high/xhigh → 'high'` (OpenAI 3-level)
  - 사용자에게 thinking 강등 알림 (dashboard 또는 log warn).

### 11.3 P8 Patches (Agent role frontmatter)

**File:** `2026-05-14-glm-code-p8-orchestrator-agents.md`

- **P8-Fix-10 (NEW):** Update Task 3 (20 agent role manifests):
  - Each role's frontmatter:
    - **REMOVE** `model: GLM-X.Y` (direct binding)
    - **REMOVE** `thinking: true/false`
    - **ADD** `action: <one of 8>` per §11.0.5 mapping table
  - Loader (Task 4): parse `action` from frontmatter, resolve at spawn time via P6's `ActionResolver`.
  - Worker preamble (Task 5): preamble injects resolved `{model, thinkingBudget}` from action resolver before sub-agent process starts.
  - Sub-agent's LLM client: receives resolved model + thinking, uses `LLMService.complete({ role, action })` with resolver hooked.
  - Tests: each of 20 roles → resolved correctly under default settings. User override case: `settings.agents.critic.model = "GLM-5"` → resolver returns GLM-5 even though action=slow default is GLM-5.1.

### 11.4 P10 Patches (Doctor / migration tracking)

**File:** `2026-05-14-glm-code-p10-polish-longhorizon-yolo.md`

- **P10-Fix-14 (NEW):** Add doctor checks:
  - `glm doctor` validates `settings.actions` shape (8 keys present, valid models, valid thinking levels).
  - Migration: if `settings.json` lacks `actions` section on first run after P10, auto-insert defaults from §11.0.3.

### 11.5 EXECUTION-ORCHESTRATION.md update

After this fix lands, the orchestration doc's Per-Plan Acceptance Gates (§4) for P2/P6/P8 should mention:
- P2: `/model` picker functional, 3-stage flow tested
- P6: ActionResolver returns correct (model, thinking) for all 8 actions × 20 roles, OpenAI-mode degradation logged
- P8: All 20 role frontmatters use `action:` field, resolver hooked in worker spawn

### 11.6 Verification commands

```bash
cd docs/superpowers/plans
# 1. Each role frontmatter uses action:
grep -cE "^action: (default|smol|slow|vision|plan|designer|commit|task)$" 2026-05-14-glm-code-p8-*.md   # ≥ 20

# 2. No direct model: binding in role frontmatter (other than orchestrator etc.)
grep -nE "^model: GLM-" 2026-05-14-glm-code-p8-*.md   # 0 expected after fix

# 3. ActionResolver implemented in P6
grep -nE "ActionResolver|THINKING_BUDGETS" 2026-05-14-glm-code-p6-*.md   # ≥ 5

# 4. /model picker in P2
grep -nE "ModelPicker|/model" 2026-05-14-glm-code-p2-*.md   # ≥ 3
```

After all §11 fixes: 2-layer model system fully wired across spec + P2 + P6 + P8 + P10.

---

## 12. Image Attachment Flow (spec §9.12 추가)

qwen-code + opencode 패턴 차용 + glm-vision MCP 자동 라우팅. Spec §9.12 "이미지 첨부" 섹션 참조.

### 12.0 Canonical Decisions

- **Storage**: `~/.glm/sessions/<sid>/attachments/img_<n>.<ext>` — session-scoped, 7일 후 자동 cleanup
- **Supported types**: png, jpg, jpeg, webp, gif, heic, bmp, tiff
- **Caps**: maxWidth=2000, maxHeight=2000, maxBytes=4,718,592 (4.5MB), autoResize=true (opencode 차용)
- **Default vision tool**: `image_analysis` (glm-vision MCP)
- **Cache**: `~/.glm/cache/vision/<sha256>.json` — vision result 영구 캐시 (quota 절약 핵심)
- **Placeholder syntax**: `[image N]` in user message text, attachments array in RPC payload
- **`/raw` modifier**: skips vision routing, passes path only to LLM

### 12.1 P2 Patches (TUI attachment UX)

**File:** `2026-05-14-glm-code-p2-tui.md`

- **P2-Fix-6 (NEW):** Add task **"Image attachment input handling"**.
  - New file: `packages/tui/src/input/attachment-handler.ts`
    - Bracketed-paste 감지 → clipboard image read → save → return path
    - Drag-drop (Ink 의 raw stdin event 또는 mouse event)
    - File-resolution: `@/path/to/img.png` 명시 첨부
    - Uses `clipboardy` or `cliclip` for clipboard read; fall back to skip if unsupported
  - New file: `packages/tui/src/components/AttachmentChip.tsx`
    - Renders `[N] filename.ext (size)  [x]`
    - Click → invoke OS `open <path>`
    - `[x]` → remove from attachments array + strip `[image N]` placeholder from input
  - Modify: `packages/tui/src/views/Chat.tsx` (input area) — attachment chip strip above input box
  - Modify: `packages/tui/src/rpc/message.ts` (or wherever `message.send` is called) — include `attachments: [{path, mime, size, sha256}]` in payload
  - Settings reader: `packages/tui/src/config/attachments.ts` reads `attachments.image.*` settings
  - Tests: paste flow, drop flow, `@<path>` flow, chip remove, multi-image, `/raw` modifier

### 12.2 P6 Patches (Daemon vision routing)

**File:** `2026-05-14-glm-code-p6-llm-router.md`

- **P6-Fix-9 (NEW):** Add task **"Image attachment → vision MCP auto-routing"**.
  - New file: `packages/llm-router/src/vision/router.ts`
    - `processAttachments(message: MessageWithAttachments)` — for each image attachment:
      1. Check vision cache (`~/.glm/cache/vision/<sha256>.json`)
      2. Hit → use cached description
      3. Miss → call `glm-vision/image_analysis` MCP tool via daemon's MCP host
      4. Cache result
      5. Replace `[image N]` placeholder in message text with `<attachment N description>` block at top
    - Honors `/raw` modifier: skip vision routing for marked attachments
    - Parallel fan-out within vision pool capacity
  - New file: `packages/llm-router/src/vision/cache.ts`
    - sha256 → description JSON, with size/quota guard
    - LRU eviction at 50MB cache size
  - Modify: `packages/llm-router/src/service.ts` — `LLMService.run()` calls `processAttachments()` before provider dispatch
  - Modify: `packages/shared/src/llm-router-types.ts` — add `MessageAttachment` + `MessageWithAttachments` types
  - Vision MCP integration: depends on P4-Fix-7 (`cli.exec` is unrelated; this uses MCP host from P4 Task 4 to call vision MCP)
  - Tests: cache hit/miss, parallel fan-out, autoResize honored, `/raw` bypass, vision pool exhausted scenario, unsupported format

- **P6-Fix-10 (NEW):** Vision tool selection slash commands.
  - `/vision ocr [image N]` → routes to `glm-vision/extract_text_from_screenshot`
  - `/vision ui-to-code [image N] --framework <fw>` → `glm-vision/ui_to_artifact`
  - `/vision diagnose-error [image N]` → `glm-vision/diagnose_error_screenshot`
  - `/vision diagram [image N]` → `glm-vision/understand_technical_diagram`
  - Slash dispatcher in P2 forwards to `vision.invoke` RPC handler (new in P6).

### 12.3 P10 Patches (Cleanup + doctor)

**File:** `2026-05-14-glm-code-p10-polish-longhorizon-yolo.md`

- **P10-Fix-15 (NEW):** Add to `glm gc` task (P10-Fix-4):
  - `~/.glm/cache/vision/` LRU eviction at 50MB
  - `~/.glm/sessions/<sid>/attachments/` 7일 이상 cleanup
  - `cleanupAge` setting honored
- **P10-Fix-16 (NEW):** Add doctor checks:
  - `attachments.image.maxBytes` 설정 합리성 검증
  - Vision cache 크기 report
  - `glm-vision` MCP server reachable check

### 12.4 Verification

```bash
cd docs/superpowers/plans
# 1. P2 has attachment task
grep -nE "AttachmentChip|attachment-handler|image attachment" 2026-05-14-glm-code-p2-*.md   # ≥ 3

# 2. P6 has vision routing task
grep -nE "processAttachments|vision/router|vision result cache" 2026-05-14-glm-code-p6-*.md   # ≥ 3

# 3. Vision cache cleanup in P10
grep -nE "cache/vision|vision cache" 2026-05-14-glm-code-p10-*.md   # ≥ 2

# 4. No leftover 8-action / vision-action references
grep -nE '"vision":\s*\{\s*"model"' 2026-05-14-glm-code-p*.md   # 0 expected
```

After §12: image attach 자연스러운 UX (qwen-code/opencode 동등) + glm-vision MCP 자동 라우팅 + sha256 캐시 + `/raw` bypass + 4가지 vision-tool slash 모두 plan 에 박힘.
