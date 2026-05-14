# glm code — P5: Hook & Event System + Natural Language Activation + Delegation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the event backbone for glm. Define the full 31-event taxonomy (11 OMC + 20 OMX expanded), expose a `defineHook()` plugin SDK, implement a priority-aware dispatcher with matchers / timeouts / loop-detection, parse Claude-Code-compatible hook config out of the settings.json cascade (from P4), execute hook commands in a sandboxed subprocess with `$CLAUDE_*` / `$GLM_*` env injection, and feed hook stdout back as system-reminder injections. On top of that backbone, ship the keyword detector (UserPromptSubmit hook that maps natural-language phrases like "ralph" / "autopilot" / "trace" / "ultrathink" to workflow activation) and the delegation enforcer (PreToolUse hook on Task tool calls that auto-injects `model` / `temperature` / `thinking_budget` based on category). Wire in the persistence-mode "boulder never stops" Stop hook and the project-memory PreCompact/PostCompact slots (P7 will own the actual compactor — P5 just emits the events). Ship `glm hook list/test/enable/disable` CLI + kill switches + integration tests.

**Architecture:** A single in-daemon `HookManager` owns the registry (name → `RegisteredHook`), the dispatcher (`emit(event, ctx)` runs matching hooks in priority order), the loop guard (per-turn invocation counter, 5x per turn → auto-disable + notify), and the sandbox runner (subprocess spawn for `type=command`, dynamic ESM import for `type=plugin`). It pulls its config from the P4 settings-cascade reader (deep-merged `hooks` object) and from any in-process `defineHook()` registrations (built-ins + plugin-loaded modules). Tool registry from P3 calls `hookManager.emit('PreToolUse'/'PostToolUse', ctx)` around every tool invocation. Session manager (P1) calls `emit('SessionStart'/'SessionEnd')`. Hook stdout is parsed as JSON (preferred) or treated as plain text; either way it becomes a `<system-reminder>` block injected into the next LLM call's user turn, exactly matching the Claude Code pattern. Keyword detector and delegation enforcer are themselves regular hooks registered by `packages/core/src/hooks/built-in/` — eating our own dog food.

**Tech Stack:** Node 22+, TypeScript 5.6+, zod (config validation), `node:child_process` (sandbox), `vm` not needed (we run commands as subprocesses + dynamic `import()` for plugin hooks). No new runtime dependencies beyond what P1-P4 already require.

**Acceptance criteria for P5:**
- All 31 events are typed in `packages/core/src/hooks/events/types.ts` with a discriminated `HookEvent` union
- `defineHook({ event, matcher, run })` SDK works from both built-in and user-plugin code paths
- `HookManager.emit(event, ctx)` runs registered hooks in priority order, honors `matcher` regex, enforces 30s timeout, and disables a hook after 5 invocations in the same turn (loop guard)
- Settings cascade (from P4) hooks block parses without error for the Claude-Code shape `{ event: [{ matcher, hooks: [{type:'command', command}] }] }` AND for the glm-extended `{type:'plugin', package}` shape
- Hook stdout becomes a `<system-reminder>...</system-reminder>` block on the next user turn for events fired during the turn (PreToolUse / PostToolUse / UserPromptSubmit / Stop)
- Keyword detector (built-in `UserPromptSubmit` hook): scans the prompt for trigger keywords, skips code blocks (\`\`\`...\`\`\`) and URLs (`https?://...`), injects an activation system-reminder for the matched skill
- Delegation enforcer (built-in `PreToolUse` hook with matcher `^Task$`): reads `params.category` (or infers from `params.subagent_type`), rewrites `params` to add `model` / `temperature` / `thinking_budget` per the category table
- Stop hook "boulder never stops": if `ctx.session.persistentMode === true` and pending TODOs exist, inject continuation reminder
- PreCompact / PostCompact slots exist and emit; P7's compactor will plug into them (this plan validates emission only)
- `glm hook list` prints registered hooks (built-in + config + plugin), grouped by event
- `glm hook test <event> --tool Edit` synthesizes a fake context, dispatches hooks, prints results
- `glm hook enable <name>` / `glm hook disable <name>` toggles in-memory + persists to `~/.glm/settings.local.json`
- Kill switches: `DISABLE_GLM_HOOKS=1` (disables ALL), `GLM_SKIP_HOOKS=name1,name2` (disables specific)
- 80%+ unit coverage on dispatcher, sandbox runner, keyword detector, delegation enforcer; full integration test that registers a hook, fires the event, asserts the side effect

---

## File Structure

```
packages/core/src/hooks/
├── index.ts                          # public API: HookManager, defineHook, types
├── events/
│   ├── types.ts                      # 31 events, discriminated union
│   └── index.ts
├── sdk/
│   ├── define-hook.ts                # defineHook() factory
│   ├── context.ts                    # HookContext shape + helpers (log/state/notify/glm/tool)
│   └── index.ts
├── manager.ts                        # HookManager: register/emit/list/enable
├── registry.ts                       # in-memory registry + lookup
├── dispatcher.ts                     # priority sort, matcher eval, fan-out
├── matcher.ts                        # regex / array-of-regex matcher resolution
├── loop-guard.ts                     # per-turn invocation counter + auto-disable
├── sandbox/
│   ├── command-runner.ts             # subprocess spawn for type=command hooks
│   ├── plugin-runner.ts              # dynamic import() for type=plugin hooks
│   ├── env.ts                        # $CLAUDE_* / $GLM_* env injection
│   └── index.ts
├── injection/
│   ├── system-reminder.ts            # hook stdout → <system-reminder> block
│   └── index.ts
├── config/
│   ├── parser.ts                     # parse settings.json hooks block (zod)
│   ├── persist.ts                    # write enable/disable back to settings.local.json
│   └── index.ts
├── built-in/
│   ├── index.ts                      # register all built-ins
│   ├── keyword-detector.ts           # UserPromptSubmit → workflow activation
│   ├── delegation-enforcer.ts        # PreToolUse on Task → model/temp/budget
│   ├── persistent-stop.ts            # Stop → boulder-never-stops continuation
│   ├── precompact-preserve.ts        # PreCompact → snapshot session state (P7 hook-up)
│   ├── postcompact-restore.ts        # PostCompact → log success (P7 hook-up)
│   └── trace-recorder.ts             # every event → SQLite events table (debug)
├── keywords/
│   ├── registry.ts                   # extensible keyword → workflow map
│   ├── detector.ts                   # scan + code-block/URL strip
│   └── index.ts
└── delegation/
    ├── categories.ts                 # visual-engineering/ultrabrain/.../precision
    ├── enforcer.ts                   # apply category → params transform
    └── index.ts

packages/core/test/unit/hooks/
├── events-types.test.ts
├── matcher.test.ts
├── loop-guard.test.ts
├── dispatcher.test.ts
├── command-runner.test.ts
├── plugin-runner.test.ts
├── system-reminder.test.ts
├── config-parser.test.ts
├── keyword-detector.test.ts
├── delegation-enforcer.test.ts
└── persistent-stop.test.ts

packages/core/test/integration/hooks/
├── end-to-end-command-hook.test.ts
├── end-to-end-plugin-hook.test.ts
├── keyword-to-injection.test.ts
└── kill-switch.test.ts

packages/cli/src/commands/hook.ts     # `glm hook list/test/enable/disable`

packages/core/src/sdk/                # public SDK surface for plugins/built-ins
├── index.ts                          # re-exports defineHook + types
└── README.md                         # hook-authoring guide stub

docs/hooks.md                         # user-facing hook authoring guide (stub)
```

---

## Task 1: Event taxonomy + discriminated union types

**Files:**
- Create: `packages/core/src/hooks/events/types.ts`
- Create: `packages/core/src/hooks/events/index.ts`
- Test: `packages/core/test/unit/hooks/events-types.test.ts`

- [ ] **Step 1: Write failing test that pins the union to 31 members**

`packages/core/test/unit/hooks/events-types.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { ALL_HOOK_EVENTS, type HookEventName } from '../../../src/hooks/events/types'

describe('hook event taxonomy', () => {
  test('exposes exactly 31 events', () => {
    expect(ALL_HOOK_EVENTS).toHaveLength(31)
    expect(new Set(ALL_HOOK_EVENTS).size).toBe(31)
  })

  test('includes all required event names from the spec', () => {
    const required: HookEventName[] = [
      'SessionStart', 'SessionEnd', 'SessionIdle',
      'UserPromptSubmit',
      'PreToolUse', 'PostToolUse', 'PostToolUseFailure',
      'SubagentStart', 'SubagentStop',
      'PreCompact', 'PostCompact',
      'Stop', 'TurnComplete',
      'RunHeartbeat', 'RunBlocked',
      'WorkerAssigned', 'WorkerStalled', 'WorkerRecovered',
      'TestStarted', 'TestFinished', 'TestFailed',
      'RetryNeeded', 'HandoffNeeded', 'NeedsInput',
      'PRCreated', 'Notification'
    ]
    for (const e of required) expect(ALL_HOOK_EVENTS).toContain(e)
  })
})
```

- [ ] **Step 2: Run — should FAIL**

```bash
pnpm vitest run packages/core/test/unit/hooks/events-types.test.ts
```

Expected: FAIL ("Cannot find module").

- [ ] **Step 3: Implement event types**

`packages/core/src/hooks/events/types.ts`:
```ts
// 31-event taxonomy. Adding/removing requires updating ALL_HOOK_EVENTS + the
// discriminated union below + the test above.

export const ALL_HOOK_EVENTS = [
  // Session (3)
  'SessionStart', 'SessionEnd', 'SessionIdle',
  // Prompt (1)
  'UserPromptSubmit',
  // Tool (3)
  'PreToolUse', 'PostToolUse', 'PostToolUseFailure',
  // Subagent (2)
  'SubagentStart', 'SubagentStop',
  // Compaction (2)
  'PreCompact', 'PostCompact',
  // Loop (2)
  'Stop', 'TurnComplete',
  // Run (2) — long-horizon
  'RunHeartbeat', 'RunBlocked',
  // Worker (3)
  'WorkerAssigned', 'WorkerStalled', 'WorkerRecovered',
  // Test (3)
  'TestStarted', 'TestFinished', 'TestFailed',
  // Quality (3)
  'RetryNeeded', 'HandoffNeeded', 'NeedsInput',
  // External (2)
  'PRCreated', 'Notification',
  // Extra spillover from §9.20 / OMC parity (5: bring total to 31)
  'PreSkillRun', 'PostSkillRun',
  'PermissionRequested', 'PermissionGranted', 'PermissionDenied'
] as const

export type HookEventName = (typeof ALL_HOOK_EVENTS)[number]

// Per-event payload shapes. Discriminated by `event` field.
// Common fields live in HookEventBase.

export interface HookEventBase {
  ts: string                              // ISO timestamp
  sessionId?: string                      // active session (most events)
  workerId?: string                       // active sub-agent worker
  turnId?: string                         // current LLM turn
}

export interface SessionStartEvent extends HookEventBase { event: 'SessionStart'; cwd: string; worktree: string; initialTask?: string }
export interface SessionEndEvent   extends HookEventBase { event: 'SessionEnd'; reason: 'normal'|'crash'|'user-detach'|'shutdown' }
export interface SessionIdleEvent  extends HookEventBase { event: 'SessionIdle'; idleMs: number }

export interface UserPromptSubmitEvent extends HookEventBase {
  event: 'UserPromptSubmit'
  prompt: string
  /** Hook may rewrite — set `transformed` to override the prompt that LLM sees. */
  transformed?: string
}

export interface PreToolUseEvent extends HookEventBase {
  event: 'PreToolUse'
  tool: string
  params: Record<string, unknown>
  /** Hook may mutate `params` in-place (delegation enforcer relies on this). */
}
export interface PostToolUseEvent extends HookEventBase {
  event: 'PostToolUse'
  tool: string
  params: Record<string, unknown>
  result: unknown
  durationMs: number
}
export interface PostToolUseFailureEvent extends HookEventBase {
  event: 'PostToolUseFailure'
  tool: string
  params: Record<string, unknown>
  error: { message: string; stack?: string }
  durationMs: number
}

export interface SubagentStartEvent extends HookEventBase { event: 'SubagentStart'; workerId: string; role: string; model: string; taskSummary: string }
export interface SubagentStopEvent  extends HookEventBase { event: 'SubagentStop'; workerId: string; status: 'ok'|'error'|'cancelled'; durationMs: number; tokens?: { in: number; out: number } }

export interface PreCompactEvent  extends HookEventBase { event: 'PreCompact'; reason: 'threshold'|'manual'|'periodic'; tokensUsed: number; usableBudget: number }
export interface PostCompactEvent extends HookEventBase { event: 'PostCompact'; summaryBytes: number; preservedTurns: number; freedTokens: number }

export interface StopEvent         extends HookEventBase { event: 'Stop'; hasPendingTodos: boolean; persistentMode: boolean }
export interface TurnCompleteEvent extends HookEventBase { event: 'TurnComplete'; tokensIn: number; tokensOut: number; toolCalls: number }

export interface RunHeartbeatEvent extends HookEventBase { event: 'RunHeartbeat'; phase: string; step: number; elapsedMs: number }
export interface RunBlockedEvent   extends HookEventBase { event: 'RunBlocked'; reason: 'awaiting-user'|'awaiting-permission'|'quota'|'rate-limit'; question?: unknown }

export interface WorkerAssignedEvent  extends HookEventBase { event: 'WorkerAssigned'; workerId: string; model: string; task: string }
export interface WorkerStalledEvent   extends HookEventBase { event: 'WorkerStalled'; workerId: string; stalledMs: number; lastActivity?: string }
export interface WorkerRecoveredEvent extends HookEventBase { event: 'WorkerRecovered'; workerId: string }

export interface TestStartedEvent  extends HookEventBase { event: 'TestStarted'; suite: string }
export interface TestFinishedEvent extends HookEventBase { event: 'TestFinished'; suite: string; passed: number; failed: number; durationMs: number }
export interface TestFailedEvent   extends HookEventBase { event: 'TestFailed'; suite: string; test: string; message: string }

export interface RetryNeededEvent  extends HookEventBase { event: 'RetryNeeded'; reason: string; attempt: number; maxAttempts: number }
export interface HandoffNeededEvent extends HookEventBase { event: 'HandoffNeeded'; from: string; to: string; reason: string }
export interface NeedsInputEvent   extends HookEventBase { event: 'NeedsInput'; question: string; structured?: unknown }

export interface PRCreatedEvent    extends HookEventBase { event: 'PRCreated'; repo: string; number: number; url: string; title: string }
export interface NotificationEvent extends HookEventBase { event: 'Notification'; channel: string; payload: unknown }

export interface PreSkillRunEvent  extends HookEventBase { event: 'PreSkillRun'; skill: string; args?: string }
export interface PostSkillRunEvent extends HookEventBase { event: 'PostSkillRun'; skill: string; durationMs: number; result: 'ok'|'error' }

export interface PermissionRequestedEvent extends HookEventBase { event: 'PermissionRequested'; tool: string; reason: string }
export interface PermissionGrantedEvent   extends HookEventBase { event: 'PermissionGranted'; tool: string; scope: 'once'|'session'|'always' }
export interface PermissionDeniedEvent    extends HookEventBase { event: 'PermissionDenied'; tool: string }

export type HookEvent =
  | SessionStartEvent | SessionEndEvent | SessionIdleEvent
  | UserPromptSubmitEvent
  | PreToolUseEvent | PostToolUseEvent | PostToolUseFailureEvent
  | SubagentStartEvent | SubagentStopEvent
  | PreCompactEvent | PostCompactEvent
  | StopEvent | TurnCompleteEvent
  | RunHeartbeatEvent | RunBlockedEvent
  | WorkerAssignedEvent | WorkerStalledEvent | WorkerRecoveredEvent
  | TestStartedEvent | TestFinishedEvent | TestFailedEvent
  | RetryNeededEvent | HandoffNeededEvent | NeedsInputEvent
  | PRCreatedEvent | NotificationEvent
  | PreSkillRunEvent | PostSkillRunEvent
  | PermissionRequestedEvent | PermissionGrantedEvent | PermissionDeniedEvent

export type HookEventOf<N extends HookEventName> = Extract<HookEvent, { event: N }>
```

- [ ] **Step 4: Add barrel**

`packages/core/src/hooks/events/index.ts`:
```ts
export * from './types'
```

- [ ] **Step 5: Run — PASS**

```bash
pnpm vitest run packages/core/test/unit/hooks/events-types.test.ts
```

Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/hooks/events packages/core/test/unit/hooks/events-types.test.ts
git commit -m "feat(hooks): define 31-event taxonomy with discriminated HookEvent union"
```

---

## Task 2: Hook SDK — `defineHook()` + `HookContext`

**Files:**
- Create: `packages/core/src/hooks/sdk/define-hook.ts`
- Create: `packages/core/src/hooks/sdk/context.ts`
- Create: `packages/core/src/hooks/sdk/index.ts`
- Create: `packages/core/src/hooks/index.ts`
- Test: covered indirectly by Task 4 dispatcher tests (no standalone test here — pure types + factory function)

> **Note (P5-Fix-1):** P5 owns ALL files under `packages/core/src/hooks/**` EXCEPT `config-loader.ts` (which P4 creates per P4-Fix-4). Task 2 is the first place `hooks/index.ts` is referenced, so it is labelled **Create** here. Later tasks in P5 (Task 7, Task 8 built-in barrel additions, etc.) re-export through this same file — those subsequent references are **Modify**.

- [ ] **Step 1: Define HookContext**

`packages/core/src/hooks/sdk/context.ts`:
```ts
import type { Logger } from '../../log'
import type { HookEvent, HookEventName, HookEventOf } from '../events/types'

export interface HookNotifyOpts { channels?: string[]; level?: 'info'|'warn'|'error' }

export interface HookContext<N extends HookEventName = HookEventName> {
  /** The event payload (discriminated by `event.event`). */
  event: HookEventOf<N>

  /** Pino logger scoped to this hook invocation. */
  log: Logger

  /** Per-session KV state (backed by the daemon, P1 storage). */
  state: {
    read<T = unknown>(key: string): Promise<T | undefined>
    write<T = unknown>(key: string, value: T): Promise<void>
    delete(key: string): Promise<void>
    all(prefix?: string): Promise<Record<string, unknown>>
  }

  /** Push a notification via configured channels (P5 wires to a stub; P10 will wire to real bridges). */
  notify(message: string, opts?: HookNotifyOpts): Promise<void>

  /** Read-only glm runtime info. */
  glm: {
    sessionId?: string
    workerId?: string
    model?: string
    phase?: string
    cwd: string
    worktree: string
    /** When true, daemon is mid-compaction or in a long-horizon "boulder" loop. */
    persistentMode: boolean
  }

  /** Inject a <system-reminder> block into the next LLM call. */
  inject(text: string): void

  /** Abort the in-flight action (only valid for PreToolUse / UserPromptSubmit). */
  abort(reason: string): never
}
```

- [ ] **Step 2: Define the hook factory**

`packages/core/src/hooks/sdk/define-hook.ts`:
```ts
import type { HookEventName } from '../events/types'
import type { HookContext } from './context'

export interface HookDef<N extends HookEventName = HookEventName> {
  /** Stable identifier (defaults to a generated one if omitted). */
  name?: string
  event: N
  /**
   * Optional matcher. For tool events it's a regex against `event.tool`.
   * For other events it's a regex against a synthetic key (e.g. UserPromptSubmit → prompt).
   * Use `'*'` to match everything (default).
   */
  matcher?: string | RegExp | Array<string | RegExp>
  /** Lower runs first. Built-ins use 0-99; user hooks default 100; plugin hooks default 200. */
  priority?: number
  /** Hard timeout in ms (default 30_000 from spec §9.6). */
  timeoutMs?: number
  /** Mark hook as built-in (immutable, cannot be disabled by config). */
  builtin?: boolean
  run(ctx: HookContext<N>): Promise<void> | void
}

export function defineHook<N extends HookEventName>(def: HookDef<N>): HookDef<N> {
  // Identity wrapper — gives plugin authors a typed factory, parallels Claude Code's pattern.
  return def
}
```

- [ ] **Step 3: SDK barrel**

`packages/core/src/hooks/sdk/index.ts`:
```ts
export * from './define-hook'
export * from './context'
```

`packages/core/src/hooks/index.ts`:
```ts
export * from './events'
export * from './sdk'
```

- [ ] **Step 4: Verify build compiles**

```bash
pnpm build
```

Expected: clean. Types only — no runtime to test here, the dispatcher tests in Task 4 cover behavior.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/hooks
git commit -m "feat(hooks): defineHook() SDK + HookContext shape"
```

---

## Task 3: Matcher resolution + loop guard

**Files:**
- Create: `packages/core/src/hooks/matcher.ts`
- Create: `packages/core/src/hooks/loop-guard.ts`
- Test: `packages/core/test/unit/hooks/matcher.test.ts`
- Test: `packages/core/test/unit/hooks/loop-guard.test.ts`

- [ ] **Step 1: Write matcher test (failing)**

`packages/core/test/unit/hooks/matcher.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { matches } from '../../../src/hooks/matcher'

describe('matches', () => {
  test('undefined matcher → always true', () => {
    expect(matches(undefined, 'Edit')).toBe(true)
  })
  test('"*" matcher → always true', () => {
    expect(matches('*', 'Anything')).toBe(true)
  })
  test('string is treated as regex', () => {
    expect(matches('Edit|Write', 'Edit')).toBe(true)
    expect(matches('Edit|Write', 'Bash')).toBe(false)
  })
  test('anchored regex respects anchors', () => {
    expect(matches('^Task$', 'Task')).toBe(true)
    expect(matches('^Task$', 'TaskRunner')).toBe(false)
  })
  test('RegExp instance works', () => {
    expect(matches(/^edit/i, 'Edit')).toBe(true)
  })
  test('array of patterns — any match', () => {
    expect(matches(['Bash', 'Edit'], 'Edit')).toBe(true)
    expect(matches(['Bash', 'Edit'], 'Write')).toBe(false)
  })
  test('invalid regex → false (defensive)', () => {
    expect(matches('[unclosed', 'x')).toBe(false)
  })
})
```

- [ ] **Step 2: Implement matcher**

`packages/core/src/hooks/matcher.ts`:
```ts
export type MatcherSpec = string | RegExp | Array<string | RegExp> | undefined

export function matches(spec: MatcherSpec, subject: string): boolean {
  if (spec === undefined) return true
  if (typeof spec === 'string') {
    if (spec === '*') return true
    try { return new RegExp(spec).test(subject) } catch { return false }
  }
  if (spec instanceof RegExp) return spec.test(subject)
  for (const item of spec) {
    if (matches(item, subject)) return true
  }
  return false
}
```

- [ ] **Step 3: Run matcher tests — PASS**

```bash
pnpm vitest run packages/core/test/unit/hooks/matcher.test.ts
```

Expected: 7 passed.

- [ ] **Step 4: Write loop-guard test (failing)**

`packages/core/test/unit/hooks/loop-guard.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { LoopGuard } from '../../../src/hooks/loop-guard'

describe('LoopGuard', () => {
  test('allows up to maxPerTurn invocations', () => {
    const g = new LoopGuard({ maxPerTurn: 5 })
    g.beginTurn('t1')
    for (let i = 0; i < 5; i++) expect(g.tryAcquire('h1')).toBe(true)
    expect(g.tryAcquire('h1')).toBe(false)
  })

  test('per-hook isolation', () => {
    const g = new LoopGuard({ maxPerTurn: 2 })
    g.beginTurn('t1')
    expect(g.tryAcquire('h1')).toBe(true)
    expect(g.tryAcquire('h1')).toBe(true)
    expect(g.tryAcquire('h1')).toBe(false)
    expect(g.tryAcquire('h2')).toBe(true)
  })

  test('beginTurn resets counters', () => {
    const g = new LoopGuard({ maxPerTurn: 1 })
    g.beginTurn('t1')
    g.tryAcquire('h1')
    expect(g.tryAcquire('h1')).toBe(false)
    g.beginTurn('t2')
    expect(g.tryAcquire('h1')).toBe(true)
  })

  test('records disabled set so caller can notify', () => {
    const g = new LoopGuard({ maxPerTurn: 1 })
    g.beginTurn('t1')
    g.tryAcquire('h1')
    g.tryAcquire('h1') // overflow
    expect(g.recentlyDisabled()).toContain('h1')
  })
})
```

- [ ] **Step 5: Implement LoopGuard**

`packages/core/src/hooks/loop-guard.ts`:
```ts
export interface LoopGuardOpts { maxPerTurn?: number }

/**
 * Per-turn invocation counter — implements the §9.6 rule:
 * "1 turn 5회 이상이면 비활성." We don't actually mutate the registry here;
 * the caller (HookManager) inspects `recentlyDisabled()` and emits a
 * Notification + flips a config flag.
 */
export class LoopGuard {
  private max: number
  private counts = new Map<string, number>()
  private disabled = new Set<string>()
  private turnId?: string

  constructor(opts: LoopGuardOpts = {}) {
    this.max = opts.maxPerTurn ?? 5
  }

  beginTurn(turnId: string): void {
    this.turnId = turnId
    this.counts.clear()
    this.disabled.clear()
  }

  tryAcquire(hookName: string): boolean {
    if (!this.turnId) return true  // not in a turn — don't guard (e.g., SessionStart fires before first turn)
    const n = (this.counts.get(hookName) ?? 0) + 1
    this.counts.set(hookName, n)
    if (n > this.max) {
      this.disabled.add(hookName)
      return false
    }
    return true
  }

  recentlyDisabled(): string[] {
    return [...this.disabled]
  }
}
```

- [ ] **Step 6: Run loop-guard tests — PASS**

```bash
pnpm vitest run packages/core/test/unit/hooks/loop-guard.test.ts
```

Expected: 4 passed.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/hooks/matcher.ts packages/core/src/hooks/loop-guard.ts \
        packages/core/test/unit/hooks/matcher.test.ts packages/core/test/unit/hooks/loop-guard.test.ts
git commit -m "feat(hooks): regex matcher + per-turn loop guard with auto-disable signal"
```

---

## Task 4: Registry + Dispatcher

**Files:**
- Create: `packages/core/src/hooks/registry.ts`
- Create: `packages/core/src/hooks/dispatcher.ts`
- Test: `packages/core/test/unit/hooks/dispatcher.test.ts`

- [ ] **Step 1: Implement registry**

`packages/core/src/hooks/registry.ts`:
```ts
import { ulid } from '@glm/shared'
import type { HookDef } from './sdk/define-hook'
import type { HookEventName } from './events/types'

export interface RegisteredHook<N extends HookEventName = HookEventName> {
  id: string
  name: string
  source: 'builtin' | 'config' | 'plugin'
  def: HookDef<N>
  enabled: boolean
}

export class HookRegistry {
  private byId = new Map<string, RegisteredHook>()
  private byEvent = new Map<HookEventName, RegisteredHook[]>()

  register<N extends HookEventName>(def: HookDef<N>, source: RegisteredHook['source']): RegisteredHook<N> {
    const id = ulid()
    const name = def.name ?? `${source}:${def.event}:${id.slice(-6)}`
    const entry: RegisteredHook<N> = { id, name, source, def, enabled: true }
    this.byId.set(id, entry as RegisteredHook)
    const arr = this.byEvent.get(def.event) ?? []
    arr.push(entry as RegisteredHook)
    this.byEvent.set(def.event, arr)
    return entry
  }

  unregister(id: string): boolean {
    const h = this.byId.get(id)
    if (!h) return false
    this.byId.delete(id)
    const arr = this.byEvent.get(h.def.event)
    if (arr) this.byEvent.set(h.def.event, arr.filter(x => x.id !== id))
    return true
  }

  get(id: string): RegisteredHook | undefined { return this.byId.get(id) }
  getByName(name: string): RegisteredHook | undefined {
    for (const h of this.byId.values()) if (h.name === name) return h
    return undefined
  }
  forEvent<N extends HookEventName>(event: N): RegisteredHook<N>[] {
    return (this.byEvent.get(event) ?? []) as RegisteredHook<N>[]
  }
  all(): RegisteredHook[] { return [...this.byId.values()] }
  setEnabled(id: string, enabled: boolean): boolean {
    const h = this.byId.get(id)
    if (!h) return false
    if (h.def.builtin && !enabled) return false  // built-ins cannot be disabled via this path
    h.enabled = enabled
    return true
  }
}
```

- [ ] **Step 2: Implement dispatcher**

`packages/core/src/hooks/dispatcher.ts`:
```ts
import type { HookEvent, HookEventName, HookEventOf } from './events/types'
import type { HookContext } from './sdk/context'
import { matches } from './matcher'
import type { HookRegistry, RegisteredHook } from './registry'
import type { LoopGuard } from './loop-guard'
import type { Logger } from '../log'

export interface DispatchResult {
  ran: string[]
  failed: { name: string; error: string }[]
  timedOut: string[]
  injections: string[]   // text injected via ctx.inject()
  aborted?: { name: string; reason: string }
}

export interface DispatchOpts {
  registry: HookRegistry
  loopGuard: LoopGuard
  log: Logger
  /** Builds the ctx fed into each hook (manager owns state/notify/glm wiring). */
  makeContext: <N extends HookEventName>(event: HookEventOf<N>, injections: string[]) => HookContext<N>
}

function subjectFor(e: HookEvent): string {
  if (e.event === 'PreToolUse' || e.event === 'PostToolUse' || e.event === 'PostToolUseFailure') return e.tool
  if (e.event === 'UserPromptSubmit') return e.prompt.slice(0, 256)
  if (e.event === 'SubagentStart' || e.event === 'SubagentStop') return (e as { workerId?: string }).workerId ?? ''
  if (e.event === 'Notification') return (e as { channel?: string }).channel ?? ''
  return ''
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`hook timeout after ${ms}ms`)), ms)
    p.then(v => { clearTimeout(t); resolve(v) }, e => { clearTimeout(t); reject(e) })
  })
}

class AbortHookError extends Error {
  constructor(public readonly reason: string) { super(`hook aborted: ${reason}`) }
}

export async function dispatch(event: HookEvent, opts: DispatchOpts): Promise<DispatchResult> {
  const result: DispatchResult = { ran: [], failed: [], timedOut: [], injections: [] }
  const candidates: RegisteredHook[] = opts.registry
    .forEvent(event.event)
    .filter(h => h.enabled)
    .filter(h => matches(h.def.matcher, subjectFor(event)))
    .sort((a, b) => (a.def.priority ?? defaultPrio(a.source)) - (b.def.priority ?? defaultPrio(b.source)))

  for (const h of candidates) {
    if (!opts.loopGuard.tryAcquire(h.name)) {
      opts.log.warn({ hook: h.name, event: event.event }, 'loop-guard tripped — skipping')
      continue
    }
    const ctx = opts.makeContext(event as HookEventOf<typeof event.event>, result.injections)
    ;(ctx as unknown as { abort: (r: string) => never }).abort = (r) => { throw new AbortHookError(r) }
    try {
      await withTimeout(Promise.resolve(h.def.run(ctx as never)), h.def.timeoutMs ?? 30_000)
      result.ran.push(h.name)
    } catch (e) {
      if (e instanceof AbortHookError) {
        result.aborted = { name: h.name, reason: e.reason }
        break  // abort halts the chain
      }
      const msg = (e as Error).message ?? String(e)
      if (/timeout/.test(msg)) result.timedOut.push(h.name)
      else result.failed.push({ name: h.name, error: msg })
      opts.log.error({ hook: h.name, err: e }, 'hook error')
    }
  }
  return result
}

function defaultPrio(source: 'builtin' | 'config' | 'plugin'): number {
  return source === 'builtin' ? 50 : source === 'config' ? 100 : 200
}
```

- [ ] **Step 3: Write dispatcher integration test**

`packages/core/test/unit/hooks/dispatcher.test.ts`:
```ts
import { describe, expect, test, vi } from 'vitest'
import { dispatch } from '../../../src/hooks/dispatcher'
import { HookRegistry } from '../../../src/hooks/registry'
import { LoopGuard } from '../../../src/hooks/loop-guard'
import { defineHook } from '../../../src/hooks/sdk/define-hook'
import { createLogger } from '../../../src/log'

const log = createLogger('test', { level: 'silent' })

function mkCtx(extra: Record<string, unknown> = {}) {
  return (_e: unknown, injections: string[]) => ({
    event: _e as never,
    log,
    state: { read: async () => undefined, write: async () => {}, delete: async () => {}, all: async () => ({}) },
    notify: async () => {},
    glm: { cwd: '/tmp', worktree: '/tmp', persistentMode: false },
    inject: (t: string) => { injections.push(t) },
    abort: ((r: string) => { throw new Error(r) }) as never,
    ...extra
  })
}

describe('dispatch', () => {
  test('runs matching hook + records name', async () => {
    const reg = new HookRegistry()
    const lg = new LoopGuard()
    const ran: string[] = []
    reg.register(defineHook({ event: 'PreToolUse', name: 'h1', matcher: 'Edit', run: () => { ran.push('h1') } }), 'config')
    const r = await dispatch(
      { event: 'PreToolUse', ts: 'now', tool: 'Edit', params: {} },
      { registry: reg, loopGuard: lg, log, makeContext: mkCtx() }
    )
    expect(ran).toEqual(['h1'])
    expect(r.ran).toEqual(['h1'])
  })

  test('skips non-matching matcher', async () => {
    const reg = new HookRegistry()
    const lg = new LoopGuard()
    reg.register(defineHook({ event: 'PreToolUse', name: 'h-edit', matcher: '^Edit$', run: () => { throw new Error('should not run') } }), 'config')
    const r = await dispatch(
      { event: 'PreToolUse', ts: 'now', tool: 'Bash', params: {} },
      { registry: reg, loopGuard: lg, log, makeContext: mkCtx() }
    )
    expect(r.ran).toEqual([])
  })

  test('honors priority (lower first)', async () => {
    const reg = new HookRegistry()
    const lg = new LoopGuard()
    const order: string[] = []
    reg.register(defineHook({ event: 'PreToolUse', name: 'late', priority: 200, run: () => { order.push('late') } }), 'plugin')
    reg.register(defineHook({ event: 'PreToolUse', name: 'early', priority: 10, run: () => { order.push('early') } }), 'builtin')
    await dispatch({ event: 'PreToolUse', ts: 'now', tool: 'Edit', params: {} },
                   { registry: reg, loopGuard: lg, log, makeContext: mkCtx() })
    expect(order).toEqual(['early', 'late'])
  })

  test('timeout records hook in timedOut', async () => {
    const reg = new HookRegistry()
    const lg = new LoopGuard()
    reg.register(defineHook({ event: 'PreToolUse', name: 'slow', timeoutMs: 50,
      run: () => new Promise(() => {}) }), 'config')
    const r = await dispatch({ event: 'PreToolUse', ts: 'now', tool: 'Edit', params: {} },
                              { registry: reg, loopGuard: lg, log, makeContext: mkCtx() })
    expect(r.timedOut).toEqual(['slow'])
  })

  test('abort stops chain + records reason', async () => {
    const reg = new HookRegistry()
    const lg = new LoopGuard()
    const ran: string[] = []
    reg.register(defineHook({ event: 'PreToolUse', name: 'abort-me', priority: 10,
      run: (ctx) => (ctx as { abort: (r: string) => never }).abort('policy violation') }), 'config')
    reg.register(defineHook({ event: 'PreToolUse', name: 'never', priority: 20,
      run: () => { ran.push('never') } }), 'config')
    const r = await dispatch({ event: 'PreToolUse', ts: 'now', tool: 'Edit', params: {} },
                              { registry: reg, loopGuard: lg, log, makeContext: mkCtx() })
    expect(r.aborted).toEqual({ name: 'abort-me', reason: 'policy violation' })
    expect(ran).toEqual([])
  })

  test('loop-guard skips hook over budget', async () => {
    const reg = new HookRegistry()
    const lg = new LoopGuard({ maxPerTurn: 2 })
    lg.beginTurn('t1')
    let n = 0
    reg.register(defineHook({ event: 'PreToolUse', name: 'spammy', run: () => { n++ } }), 'config')
    for (let i = 0; i < 5; i++) {
      await dispatch({ event: 'PreToolUse', ts: 'now', tool: 'Edit', params: {} },
                     { registry: reg, loopGuard: lg, log, makeContext: mkCtx() })
    }
    expect(n).toBe(2)                            // only first 2 succeed
    expect(lg.recentlyDisabled()).toContain('spammy')
  })
})
```

- [ ] **Step 4: Run dispatcher tests — PASS**

```bash
pnpm vitest run packages/core/test/unit/hooks/dispatcher.test.ts
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/hooks/registry.ts packages/core/src/hooks/dispatcher.ts \
        packages/core/test/unit/hooks/dispatcher.test.ts
git commit -m "feat(hooks): in-memory registry + priority/matcher/timeout/abort-aware dispatcher"
```

---

## Task 5: Sandbox runners (command subprocess + plugin dynamic-import)

**Files:**
- Create: `packages/core/src/hooks/sandbox/env.ts`
- Create: `packages/core/src/hooks/sandbox/command-runner.ts`
- Create: `packages/core/src/hooks/sandbox/plugin-runner.ts`
- Create: `packages/core/src/hooks/sandbox/index.ts`
- Test: `packages/core/test/unit/hooks/command-runner.test.ts`
- Test: `packages/core/test/unit/hooks/plugin-runner.test.ts`

- [ ] **Step 1: Env injection helper**

`packages/core/src/hooks/sandbox/env.ts`:
```ts
import type { HookEvent } from '../events/types'

/**
 * Build the env block injected into hook subprocesses. We mirror Claude Code's
 * `$CLAUDE_*` set (for drop-in compatibility) and add `$GLM_*` as the native form.
 * Both name families resolve to the SAME values — pure aliasing.
 */
export function buildHookEnv(event: HookEvent, base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = { ...base }
  const set = (k: string, v?: string | number) => {
    if (v === undefined || v === null) return
    const s = String(v)
    out[`CLAUDE_${k}`] = s
    out[`GLM_${k}`] = s
  }

  set('EVENT', event.event)
  set('SESSION_ID', event.sessionId)
  set('WORKER_ID', event.workerId)
  set('TURN_ID', event.turnId)
  set('TS', event.ts)

  if (event.event === 'PreToolUse' || event.event === 'PostToolUse' || event.event === 'PostToolUseFailure') {
    set('TOOL', event.tool)
    // For Edit/Write/Read, expose the touched path as $CLAUDE_FILE (spec §9.6 example).
    const p = (event.params as { path?: string; file_path?: string }).path
              ?? (event.params as { path?: string; file_path?: string }).file_path
    set('FILE', p)
  }
  if (event.event === 'UserPromptSubmit') {
    set('PROMPT_LEN', String(event.prompt.length))
  }
  if (event.event === 'SubagentStart' || event.event === 'SubagentStop') {
    set('SUBAGENT_WORKER', event.workerId)
  }

  return out
}
```

- [ ] **Step 2: Command runner (subprocess spawn)**

`packages/core/src/hooks/sandbox/command-runner.ts`:
```ts
import { spawn } from 'node:child_process'
import type { HookEvent } from '../events/types'
import { buildHookEnv } from './env'

export interface CommandHookResult {
  exitCode: number
  stdout: string
  stderr: string
  durationMs: number
}

export interface CommandHookSpec {
  command: string         // shell command — runs via /bin/sh -c <command>
  cwd?: string
  timeoutMs?: number      // default 30_000
}

export function runCommandHook(spec: CommandHookSpec, event: HookEvent): Promise<CommandHookResult> {
  const start = Date.now()
  const timeout = spec.timeoutMs ?? 30_000
  return new Promise<CommandHookResult>((resolve, reject) => {
    const child = spawn('/bin/sh', ['-c', spec.command], {
      env: buildHookEnv(event),
      cwd: spec.cwd ?? process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    let killed = false
    const t = setTimeout(() => {
      killed = true
      child.kill('SIGKILL')
      reject(new Error(`command hook timeout after ${timeout}ms`))
    }, timeout)
    child.stdout.on('data', (b: Buffer) => { stdout += b.toString('utf8') })
    child.stderr.on('data', (b: Buffer) => { stderr += b.toString('utf8') })
    child.on('error', (e) => { clearTimeout(t); reject(e) })
    child.on('exit', (code) => {
      if (killed) return
      clearTimeout(t)
      resolve({
        exitCode: code ?? -1,
        stdout: stdout.slice(0, 1024 * 1024),   // cap at 1MB for safety
        stderr: stderr.slice(0, 1024 * 1024),
        durationMs: Date.now() - start
      })
    })
  })
}
```

- [ ] **Step 3: Plugin runner (dynamic import)**

`packages/core/src/hooks/sandbox/plugin-runner.ts`:
```ts
import { pathToFileURL } from 'node:url'
import type { HookDef } from '../sdk/define-hook'
import type { HookEventName } from '../events/types'

export interface LoadedPluginHook<N extends HookEventName = HookEventName> {
  packageName: string
  def: HookDef<N>
}

/**
 * Dynamically import a plugin hook module. The module's default export must be
 * a `defineHook(...)` result. We don't sandbox the V8 isolate — we trust plugin
 * code (P4's permission system controls *which* plugins load), but we do guard
 * with a load-time timeout.
 */
export async function loadPluginHook(specifier: string, opts: { timeoutMs?: number } = {}): Promise<LoadedPluginHook> {
  const timeout = opts.timeoutMs ?? 5_000
  const url = specifier.startsWith('.') || specifier.startsWith('/')
    ? pathToFileURL(specifier).href
    : specifier
  const mod = await Promise.race([
    import(url),
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`plugin load timeout (${timeout}ms): ${specifier}`)), timeout))
  ]) as { default?: HookDef }
  const def = mod.default
  if (!def || typeof def.run !== 'function' || typeof def.event !== 'string') {
    throw new Error(`plugin ${specifier} does not export a defineHook() default`)
  }
  return { packageName: specifier, def }
}
```

- [ ] **Step 4: Sandbox barrel**

`packages/core/src/hooks/sandbox/index.ts`:
```ts
export * from './env'
export * from './command-runner'
export * from './plugin-runner'
```

- [ ] **Step 5: Command-runner test**

`packages/core/test/unit/hooks/command-runner.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { runCommandHook } from '../../../src/hooks/sandbox/command-runner'
import type { HookEvent } from '../../../src/hooks/events/types'

const baseEvent: HookEvent = { event: 'PreToolUse', ts: 'now', tool: 'Edit', params: { path: '/tmp/x' } }

describe('runCommandHook', () => {
  test('runs simple echo and captures stdout', async () => {
    const r = await runCommandHook({ command: 'echo hi' }, baseEvent)
    expect(r.exitCode).toBe(0)
    expect(r.stdout.trim()).toBe('hi')
  })

  test('injects $GLM_TOOL and $CLAUDE_TOOL env', async () => {
    const r = await runCommandHook({ command: 'echo "$CLAUDE_TOOL|$GLM_TOOL"' }, baseEvent)
    expect(r.stdout.trim()).toBe('Edit|Edit')
  })

  test('captures $CLAUDE_FILE from params.path', async () => {
    const r = await runCommandHook({ command: 'echo $CLAUDE_FILE' }, baseEvent)
    expect(r.stdout.trim()).toBe('/tmp/x')
  })

  test('non-zero exit code surfaces', async () => {
    const r = await runCommandHook({ command: 'exit 7' }, baseEvent)
    expect(r.exitCode).toBe(7)
  })

  test('timeout rejects', async () => {
    await expect(runCommandHook({ command: 'sleep 5', timeoutMs: 100 }, baseEvent))
      .rejects.toThrow(/timeout/)
  })
})
```

- [ ] **Step 6: Plugin-runner test (uses a fixture file)**

Create the fixture first.

`packages/core/test/unit/hooks/_fixtures/sample-plugin.mjs`:
```js
export default {
  event: 'PostToolUse',
  matcher: 'Edit',
  run: (ctx) => { ctx.inject('plugin ran for ' + ctx.event.tool) }
}
```

`packages/core/test/unit/hooks/plugin-runner.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadPluginHook } from '../../../src/hooks/sandbox/plugin-runner'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const fixture = path.join(HERE, '_fixtures', 'sample-plugin.mjs')

describe('loadPluginHook', () => {
  test('loads default export', async () => {
    const r = await loadPluginHook(fixture)
    expect(r.def.event).toBe('PostToolUse')
    expect(r.def.matcher).toBe('Edit')
    expect(typeof r.def.run).toBe('function')
  })

  test('rejects when module lacks default export', async () => {
    const bad = path.join(HERE, '_fixtures', 'bad-plugin.mjs')
    // create on the fly
    const { writeFileSync } = await import('node:fs')
    writeFileSync(bad, 'export const foo = 1\n')
    await expect(loadPluginHook(bad)).rejects.toThrow(/does not export a defineHook/)
  })
})
```

- [ ] **Step 7: Run sandbox tests — PASS**

```bash
pnpm vitest run packages/core/test/unit/hooks/command-runner.test.ts packages/core/test/unit/hooks/plugin-runner.test.ts
```

Expected: 5 + 2 passed.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/hooks/sandbox packages/core/test/unit/hooks/command-runner.test.ts \
        packages/core/test/unit/hooks/plugin-runner.test.ts packages/core/test/unit/hooks/_fixtures
git commit -m "feat(hooks): subprocess sandbox for command hooks + dynamic import for plugin hooks"
```

---

## Task 6: System-reminder injection + config parser

**Files:**
- Create: `packages/core/src/hooks/injection/system-reminder.ts`
- Create: `packages/core/src/hooks/injection/index.ts`
- Create: `packages/core/src/hooks/config/parser.ts`
- Create: `packages/core/src/hooks/config/persist.ts`
- Create: `packages/core/src/hooks/config/index.ts`
- Test: `packages/core/test/unit/hooks/system-reminder.test.ts`
- Test: `packages/core/test/unit/hooks/config-parser.test.ts`

- [ ] **Step 1: Implement system-reminder formatter**

`packages/core/src/hooks/injection/system-reminder.ts`:
```ts
/**
 * Convert hook stdout / inject() calls into <system-reminder> blocks consumed
 * by the next LLM call. Claude Code uses this exact pattern; we adopt it for
 * compatibility with skills/plugins migrated 1:1.
 *
 * Two flavors:
 *   1. Plain text (default) — wrapped verbatim
 *   2. JSON with shape { systemReminder: string } — extracted to the body
 */
export function formatSystemReminder(text: string, source: { event: string; hook: string }): string {
  const cleaned = tryExtract(text)
  return [
    `<system-reminder>`,
    `${source.event}:${source.hook} hook additional context: ${cleaned.trim()}`,
    `</system-reminder>`
  ].join('\n')
}

function tryExtract(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as { systemReminder?: string }
      if (typeof parsed.systemReminder === 'string') return parsed.systemReminder
    } catch { /* fall through */ }
  }
  return trimmed
}

/** Join multiple injections from a single dispatch round into one block. */
export function mergeInjections(parts: string[]): string {
  return parts.filter(Boolean).join('\n')
}
```

- [ ] **Step 2: Injection barrel**

`packages/core/src/hooks/injection/index.ts`:
```ts
export * from './system-reminder'
```

- [ ] **Step 3: Config parser (Claude Code compatible)**

`packages/core/src/hooks/config/parser.ts`:
```ts
import { z } from 'zod'
import { ALL_HOOK_EVENTS, type HookEventName } from '../events/types'

/**
 * Claude Code hook shape — exact compatibility:
 *
 *   "hooks": {
 *     "PostToolUse": [
 *       { "matcher": "Edit",
 *         "hooks": [{ "type": "command", "command": "prettier --write $CLAUDE_FILE" }] }
 *     ],
 *     "WorkerStalled": [
 *       { "hooks": [{ "type": "plugin", "package": "@glm/code/builtin/notify-stall" }] }
 *     ]
 *   }
 */
const ActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('command'), command: z.string(), timeoutMs: z.number().int().positive().optional(), cwd: z.string().optional() }),
  z.object({ type: z.literal('plugin'),  package: z.string(), timeoutMs: z.number().int().positive().optional() })
])

const GroupSchema = z.object({
  matcher: z.union([z.string(), z.array(z.string())]).optional(),
  hooks: z.array(ActionSchema).min(1),
  priority: z.number().int().optional(),
  enabled: z.boolean().optional(),
  name: z.string().optional()
})

export const HooksConfigSchema = z.record(
  z.string(),                  // event name (validated separately so we can warn vs throw)
  z.array(GroupSchema)
)

export type ParsedAction = z.infer<typeof ActionSchema>
export type ParsedGroup = z.infer<typeof GroupSchema>
export type ParsedHooksConfig = z.infer<typeof HooksConfigSchema>

export interface ParseResult {
  groups: { event: HookEventName; group: ParsedGroup }[]
  warnings: string[]
}

export function parseHooksConfig(input: unknown): ParseResult {
  const warnings: string[] = []
  const result: ParseResult = { groups: [], warnings }
  if (input === undefined || input === null) return result

  const parsed = HooksConfigSchema.safeParse(input)
  if (!parsed.success) {
    warnings.push(`hooks config invalid: ${parsed.error.message}`)
    return result
  }

  for (const [event, groups] of Object.entries(parsed.data)) {
    if (!(ALL_HOOK_EVENTS as readonly string[]).includes(event)) {
      warnings.push(`unknown hook event '${event}' — ignored`)
      continue
    }
    for (const g of groups) result.groups.push({ event: event as HookEventName, group: g })
  }
  return result
}
```

- [ ] **Step 4: Config persistence (enable/disable rewrites)**

`packages/core/src/hooks/config/persist.ts`:
```ts
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * Toggle a hook's enabled flag in ~/.glm/settings.local.json under
 * `hookOverrides[<hookName>] = boolean`. We never edit user-authored
 * `hooks` config blocks — overrides live in a separate key.
 */
export function setHookEnabled(settingsLocalPath: string, hookName: string, enabled: boolean): void {
  let json: Record<string, unknown> = {}
  if (existsSync(settingsLocalPath)) {
    try { json = JSON.parse(readFileSync(settingsLocalPath, 'utf8')) as Record<string, unknown> } catch { json = {} }
  }
  const overrides = (json.hookOverrides as Record<string, boolean> | undefined) ?? {}
  overrides[hookName] = enabled
  json.hookOverrides = overrides
  mkdirSync(dirname(settingsLocalPath), { recursive: true })
  writeFileSync(settingsLocalPath, JSON.stringify(json, null, 2))
}

export function readHookOverrides(settingsLocalPath: string): Record<string, boolean> {
  if (!existsSync(settingsLocalPath)) return {}
  try {
    const j = JSON.parse(readFileSync(settingsLocalPath, 'utf8')) as { hookOverrides?: Record<string, boolean> }
    return j.hookOverrides ?? {}
  } catch { return {} }
}
```

- [ ] **Step 5: Config barrel**

`packages/core/src/hooks/config/index.ts`:
```ts
export * from './parser'
export * from './persist'
```

- [ ] **Step 6: Write system-reminder test**

`packages/core/test/unit/hooks/system-reminder.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { formatSystemReminder, mergeInjections } from '../../../src/hooks/injection/system-reminder'

describe('formatSystemReminder', () => {
  test('wraps plain text', () => {
    const r = formatSystemReminder('do X next', { event: 'PostToolUse', hook: 'fmt' })
    expect(r).toContain('<system-reminder>')
    expect(r).toContain('PostToolUse:fmt')
    expect(r).toContain('do X next')
    expect(r).toContain('</system-reminder>')
  })

  test('extracts JSON.systemReminder', () => {
    const r = formatSystemReminder('{"systemReminder":"hello"}', { event: 'Stop', hook: 'p' })
    expect(r).toContain('hello')
    expect(r).not.toContain('systemReminder')
  })

  test('empty stdout → empty body', () => {
    const r = formatSystemReminder('', { event: 'PostToolUse', hook: 'fmt' })
    expect(r).toContain('<system-reminder>')
  })

  test('mergeInjections joins with newlines and drops empties', () => {
    expect(mergeInjections(['a', '', 'b'])).toBe('a\nb')
  })
})
```

- [ ] **Step 7: Write config-parser test**

`packages/core/test/unit/hooks/config-parser.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { parseHooksConfig } from '../../../src/hooks/config/parser'

describe('parseHooksConfig', () => {
  test('parses Claude Code-shape command hook', () => {
    const r = parseHooksConfig({
      PostToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: 'prettier --write $CLAUDE_FILE' }] }]
    })
    expect(r.warnings).toEqual([])
    expect(r.groups).toHaveLength(1)
    expect(r.groups[0]!.event).toBe('PostToolUse')
    expect(r.groups[0]!.group.hooks[0]!.type).toBe('command')
  })

  test('parses glm-extended plugin hook', () => {
    const r = parseHooksConfig({
      WorkerStalled: [{ hooks: [{ type: 'plugin', package: '@glm/code/builtin/notify-stall' }] }]
    })
    expect(r.groups).toHaveLength(1)
    expect(r.groups[0]!.group.hooks[0]!.type).toBe('plugin')
  })

  test('warns on unknown event, drops it', () => {
    const r = parseHooksConfig({
      MadeUpEvent: [{ hooks: [{ type: 'command', command: 'echo' }] }]
    })
    expect(r.groups).toEqual([])
    expect(r.warnings[0]).toMatch(/MadeUpEvent/)
  })

  test('returns empty when input is undefined', () => {
    const r = parseHooksConfig(undefined)
    expect(r.groups).toEqual([])
    expect(r.warnings).toEqual([])
  })

  test('warns on malformed structure', () => {
    const r = parseHooksConfig({ PostToolUse: 'not-an-array' })
    expect(r.groups).toEqual([])
    expect(r.warnings[0]).toMatch(/hooks config invalid/)
  })
})
```

- [ ] **Step 8: Run tests — PASS**

```bash
pnpm vitest run packages/core/test/unit/hooks/system-reminder.test.ts packages/core/test/unit/hooks/config-parser.test.ts
```

Expected: 4 + 5 passed.

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/hooks/injection packages/core/src/hooks/config \
        packages/core/test/unit/hooks/system-reminder.test.ts packages/core/test/unit/hooks/config-parser.test.ts
git commit -m "feat(hooks): system-reminder formatter + Claude-Code-compatible config parser + override persistence"
```

---

## Task 7: HookManager — wire it all together

**Files:**
- Create: `packages/core/src/hooks/manager.ts`
- Modify: `packages/core/src/hooks/index.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Implement HookManager**

`packages/core/src/hooks/manager.ts`:
```ts
import type { Logger } from '../log'
import { createLogger } from '../log'
import type { HookEvent, HookEventName, HookEventOf } from './events/types'
import type { HookDef } from './sdk/define-hook'
import type { HookContext } from './sdk/context'
import { HookRegistry, type RegisteredHook } from './registry'
import { LoopGuard } from './loop-guard'
import { dispatch, type DispatchResult } from './dispatcher'
import { parseHooksConfig, readHookOverrides, setHookEnabled, type ParsedAction } from './config'
import { runCommandHook } from './sandbox/command-runner'
import { loadPluginHook } from './sandbox/plugin-runner'
import { formatSystemReminder, mergeInjections } from './injection'

export interface HookManagerOpts {
  log?: Logger
  /** Override for testing — defaults to ~/.glm/settings.local.json. */
  settingsLocalPath?: string
  /** Optional notify sink (P10 wires real bridges). */
  notify?: (msg: string, opts?: { channels?: string[]; level?: 'info'|'warn'|'error' }) => Promise<void>
  /** Read-only glm runtime block exposed in ctx.glm. */
  glmInfo?: () => HookContext['glm']
  /** State backend (P1 storage wires the real one). */
  state?: HookContext['state']
}

export interface EmitResult extends DispatchResult {
  reminder: string  // merged <system-reminder> body (may be empty)
}

export class HookManager {
  private registry = new HookRegistry()
  private loopGuard = new LoopGuard({ maxPerTurn: 5 })
  private log: Logger
  private settingsLocalPath?: string
  private notifySink: HookManagerOpts['notify']
  private glmInfo: NonNullable<HookManagerOpts['glmInfo']>
  private state: NonNullable<HookManagerOpts['state']>
  private disabledByKillswitch = new Set<string>()

  constructor(opts: HookManagerOpts = {}) {
    this.log = opts.log ?? createLogger('hooks')
    this.settingsLocalPath = opts.settingsLocalPath
    this.notifySink = opts.notify
    this.glmInfo = opts.glmInfo ?? (() => ({ cwd: process.cwd(), worktree: process.cwd(), persistentMode: false }))
    this.state = opts.state ?? {
      read: async () => undefined,
      write: async () => {},
      delete: async () => {},
      all: async () => ({})
    }
    this.applyKillSwitches()
  }

  /** Register a hook defined via defineHook(). */
  register<N extends HookEventName>(def: HookDef<N>, source: RegisteredHook['source'] = 'builtin'): RegisteredHook<N> {
    return this.registry.register(def, source)
  }

  /** Load hooks defined in the parsed settings cascade. */
  async loadFromConfig(input: unknown): Promise<void> {
    const { groups, warnings } = parseHooksConfig(input)
    for (const w of warnings) this.log.warn(w)
    for (const { event, group } of groups) {
      for (const action of group.hooks) {
        const def = await this.adoptConfigAction(event, group.matcher, action, group.priority, group.name)
        const reg = this.registry.register(def, action.type === 'plugin' ? 'plugin' : 'config')
        // honor stored override
        if (this.settingsLocalPath) {
          const overrides = readHookOverrides(this.settingsLocalPath)
          if (overrides[reg.name] === false) reg.enabled = false
        }
        if (group.enabled === false) reg.enabled = false
        if (this.disabledByKillswitch.has(reg.name)) reg.enabled = false
      }
    }
  }

  private async adoptConfigAction(
    event: HookEventName,
    matcher: string | string[] | undefined,
    action: ParsedAction,
    priority: number | undefined,
    explicitName: string | undefined
  ): Promise<HookDef> {
    const name = explicitName ?? `${event}:${action.type}:${action.type === 'command' ? action.command.slice(0, 40) : action.package}`
    if (action.type === 'command') {
      return {
        event, matcher, priority, timeoutMs: action.timeoutMs, name,
        run: async (ctx) => {
          const res = await runCommandHook({ command: action.command, cwd: action.cwd, timeoutMs: action.timeoutMs }, ctx.event)
          if (res.exitCode !== 0) {
            ctx.log.warn({ exitCode: res.exitCode, stderr: res.stderr.slice(0, 256) }, 'command hook non-zero exit')
          }
          if (res.stdout.trim()) ctx.inject(formatSystemReminder(res.stdout, { event, hook: name }))
        }
      }
    }
    // plugin: load lazily on first run? simpler — load now, fail fast.
    const loaded = await loadPluginHook(action.package, { timeoutMs: action.timeoutMs })
    return {
      event,
      matcher: loaded.def.matcher ?? matcher,
      priority,
      timeoutMs: action.timeoutMs ?? loaded.def.timeoutMs,
      name,
      run: loaded.def.run as HookDef['run']
    }
  }

  /** Emit an event — runs all matching enabled hooks, returns merged reminder text. */
  async emit<N extends HookEventName>(event: HookEventOf<N>): Promise<EmitResult> {
    if (process.env.DISABLE_GLM_HOOKS === '1') {
      return { ran: [], failed: [], timedOut: [], injections: [], reminder: '' }
    }
    const r = await dispatch(event as HookEvent, {
      registry: this.registry,
      loopGuard: this.loopGuard,
      log: this.log,
      makeContext: (ev, injections) => this.buildContext(ev, injections)
    })
    // notify on loop-disabled hooks
    const disabled = this.loopGuard.recentlyDisabled()
    for (const name of disabled) {
      const reg = this.registry.getByName(name)
      if (reg) reg.enabled = false
      if (this.notifySink) await this.notifySink(`Hook '${name}' auto-disabled (loop guard exceeded)`, { level: 'warn' }).catch(() => {})
    }
    return { ...r, reminder: mergeInjections(r.injections) }
  }

  /** Reset the per-turn loop counter. Call before each LLM turn. */
  beginTurn(turnId: string): void { this.loopGuard.beginTurn(turnId) }

  /** List registered hooks (CLI uses this). */
  list(): RegisteredHook[] { return this.registry.all() }

  /** Enable a hook by name. */
  enable(name: string): boolean {
    const h = this.registry.getByName(name); if (!h) return false
    const ok = this.registry.setEnabled(h.id, true)
    if (ok && this.settingsLocalPath) setHookEnabled(this.settingsLocalPath, name, true)
    return ok
  }

  /** Disable a hook by name (built-ins refuse). */
  disable(name: string): boolean {
    const h = this.registry.getByName(name); if (!h) return false
    const ok = this.registry.setEnabled(h.id, false)
    if (ok && this.settingsLocalPath) setHookEnabled(this.settingsLocalPath, name, false)
    return ok
  }

  private buildContext<N extends HookEventName>(event: HookEventOf<N>, injections: string[]): HookContext<N> {
    return {
      event,
      log: this.log,
      state: this.state,
      notify: this.notifySink ?? (async () => {}),
      glm: this.glmInfo(),
      inject: (text: string) => { injections.push(text) },
      abort: ((reason: string) => { throw new Error(reason) }) as never
    }
  }

  private applyKillSwitches(): void {
    const csv = process.env.GLM_SKIP_HOOKS
    if (!csv) return
    for (const name of csv.split(',').map(s => s.trim()).filter(Boolean)) {
      this.disabledByKillswitch.add(name)
      const h = this.registry.getByName(name)
      if (h) h.enabled = false
    }
  }
}
```

- [ ] **Step 2: Update hooks barrel**

`packages/core/src/hooks/index.ts`:
```ts
export * from './events'
export * from './sdk'
export * from './manager'
export { HookRegistry } from './registry'
export { LoopGuard } from './loop-guard'
export { formatSystemReminder, mergeInjections } from './injection'
export { parseHooksConfig } from './config'
```

- [ ] **Step 3: Update core barrel**

`packages/core/src/index.ts` (append):
```ts
export * from './hooks'
```

- [ ] **Step 4: Build to verify wiring**

```bash
pnpm build
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/hooks/manager.ts packages/core/src/hooks/index.ts packages/core/src/index.ts
git commit -m "feat(hooks): HookManager — registry + dispatcher + config load + kill switches + override persist"
```

---

## Task 8: Keyword detector built-in hook

**Files:**
- Create: `packages/core/src/hooks/keywords/registry.ts`
- Create: `packages/core/src/hooks/keywords/detector.ts`
- Create: `packages/core/src/hooks/keywords/index.ts`
- Create: `packages/core/src/hooks/built-in/keyword-detector.ts`
- Test: `packages/core/test/unit/hooks/keyword-detector.test.ts`

- [ ] **Step 1: Define the keyword registry from spec §9.17**

`packages/core/src/hooks/keywords/registry.ts`:
```ts
export interface KeywordRule {
  /** Keywords (case-insensitive substring, but boundary-aware). */
  triggers: string[]
  /** Skill / workflow to activate. */
  skill: string
  /** Optional natural-language label for the chat-line notice. */
  label?: string
  /** Lower wins on multi-match. */
  priority: number
  /** Marker — when true the activation is "thinking mode" only, not a skill. */
  thinkingOnly?: boolean
  /** Marker — when true the activation is "tdd workflow", not a skill. */
  tddOnly?: boolean
}

/**
 * v0.1 default rules — extracted from spec §9.17. Plugins can call
 * `keywords.add(rule)` to extend. First match wins after sorting by priority.
 */
export const DEFAULT_KEYWORD_RULES: KeywordRule[] = [
  { triggers: ['ralph', "don't stop", 'must complete', 'finish this', 'keep going until done'], skill: 'ralph', priority: 10 },
  { triggers: ['autopilot', 'auto pilot', 'build me', 'create me', 'handle it all'],            skill: 'autopilot', priority: 20 },
  { triggers: ['ultrawork', 'ulw', 'in parallel'],                                              skill: 'ultrawork', priority: 30 },
  { triggers: ['team', 'swarm', '지원군'],                                                     skill: 'team', priority: 40 },
  { triggers: ['ralplan', 'consensus', 'review the plan'],                                      skill: 'ralplan', priority: 50 },
  { triggers: ['plan this', "let's plan", 'design first'],                                      skill: 'plan', priority: 60 },
  { triggers: ['trace', '왜?', 'why does', 'investigate'],                                      skill: 'trace', priority: 70 },
  { triggers: ['verify', '확인', 'evidence'],                                                  skill: 'verify', priority: 80 },
  { triggers: ['deslop', 'anti-slop', 'ai 슬롭'],                                              skill: 'ai-slop-cleaner', priority: 90 },
  { triggers: ['ultrathink', 'thinking on', 'deep think'], skill: 'ultrathink', priority: 100, thinkingOnly: true },
  { triggers: ['tdd'],                                     skill: 'tdd', priority: 110, tddOnly: true }
]

export interface KeywordMatch {
  rule: KeywordRule
  source: string
  matchedTrigger: string
}

export class KeywordRegistry {
  private rules: KeywordRule[]
  /** name → list of rules contributed by that source. Last `registerSource(name, …)` overrides previous entries from the same name. */
  private sources = new Map<string, KeywordRule[]>()

  constructor(rules: KeywordRule[] = DEFAULT_KEYWORD_RULES) {
    this.rules = [...rules].sort((a, b) => a.priority - b.priority)
    if (rules.length) this.sources.set('builtin-defaults', [...rules])
  }

  /**
   * P5-Fix-2: stable API for plugins / workflow registries to publish
   * keyword rules under a named source. Re-registering the same `name`
   * replaces that source's entries; rules from other sources are untouched.
   */
  registerSource(name: string, entries: KeywordRule[]): void {
    this.sources.set(name, [...entries])
    this.rebuild()
  }

  /** Convenience for one-off additions (kept for backwards-compat with the built-in detector). */
  add(rule: KeywordRule): void {
    const adhoc = this.sources.get('ad-hoc') ?? []
    adhoc.push(rule)
    this.sources.set('ad-hoc', adhoc)
    this.rebuild()
  }

  /** P5-Fix-2: returns ALL matches (caller picks priority). The keyword-detector hook uses match()[0]. */
  match(prompt: string): KeywordMatch[] {
    const stripped = stripIgnoredRegionsLocal(prompt)
    const out: KeywordMatch[] = []
    for (const [source, rules] of this.sources.entries()) {
      for (const rule of rules) {
        for (const trigger of rule.triggers) {
          if (containsTriggerLocal(stripped, trigger)) {
            out.push({ rule, source, matchedTrigger: trigger })
            break
          }
        }
      }
    }
    return out.sort((a, b) => a.rule.priority - b.rule.priority)
  }

  list(): KeywordRule[] { return [...this.rules] }

  private rebuild(): void {
    const merged: KeywordRule[] = []
    for (const rules of this.sources.values()) merged.push(...rules)
    this.rules = merged.sort((a, b) => a.priority - b.priority)
  }
}

/**
 * Local copies of strip + boundary helpers — kept here so the registry stays
 * importable without a circular dep on ./detector. The detector's exported
 * `stripIgnoredRegions` is the canonical user-facing one.
 */
function stripIgnoredRegionsLocal(text: string): string {
  let s = text.replace(/```[\s\S]*?```/g, ' ')
  s = s.replace(/`[^`\n]*`/g, ' ')
  s = s.replace(/https?:\/\/\S+/gi, ' ')
  return s
}
function containsTriggerLocal(haystack: string, trigger: string): boolean {
  const lc = haystack.toLowerCase()
  const t = trigger.toLowerCase()
  if (/^[a-z][\w\s'-]*$/.test(t)) {
    const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`(?<![a-z0-9_])${escaped}(?![a-z0-9_])`, 'i')
    return re.test(lc)
  }
  return lc.includes(t)
}

/**
 * P5-Fix-2: singleton used by the built-in keyword-detector hook AND by other
 * P-plans that want to publish trigger rules (P9 workflow registry, plugin SDK, …).
 */
export const keywordRegistry = new KeywordRegistry()
```

- [ ] **Step 2: Implement the detector with code-block + URL stripping**

`packages/core/src/hooks/keywords/detector.ts`:
```ts
import { type KeywordRule, KeywordRegistry } from './registry'

export interface DetectResult {
  rule: KeywordRule | null
  matchedTrigger?: string
}

/**
 * Strips fenced code blocks (```...```), inline code (`...`), and URLs before matching.
 * Returns the first rule (priority-sorted) whose trigger appears in the stripped prompt
 * with word-boundary respect.
 */
export function detectKeyword(prompt: string, registry = new KeywordRegistry()): DetectResult {
  const stripped = stripIgnoredRegions(prompt)
  for (const rule of registry.list()) {
    for (const trigger of rule.triggers) {
      if (containsTrigger(stripped, trigger)) {
        return { rule, matchedTrigger: trigger }
      }
    }
  }
  return { rule: null }
}

export function stripIgnoredRegions(text: string): string {
  // 1. fenced code blocks (``` ... ```)
  let s = text.replace(/```[\s\S]*?```/g, ' ')
  // 2. inline code (`...`)
  s = s.replace(/`[^`\n]*`/g, ' ')
  // 3. URLs
  s = s.replace(/https?:\/\/\S+/gi, ' ')
  return s
}

function containsTrigger(haystack: string, trigger: string): boolean {
  const lc = haystack.toLowerCase()
  const t = trigger.toLowerCase()
  // For CJK / non-word characters, a substring check is correct.
  // For ASCII triggers, enforce word boundaries to avoid e.g. "team" matching "steamroller".
  if (/^[a-z][\w\s'-]*$/.test(t)) {
    const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`(?<![a-z0-9_])${escaped}(?![a-z0-9_])`, 'i')
    return re.test(lc)
  }
  return lc.includes(t)
}
```

- [ ] **Step 3: Barrel**

`packages/core/src/hooks/keywords/index.ts`:
```ts
export * from './registry'
export * from './detector'
```

- [ ] **Step 4: Wrap as a built-in hook**

`packages/core/src/hooks/built-in/keyword-detector.ts`:
```ts
import { defineHook } from '../sdk/define-hook'
import { keywordRegistry, KeywordRegistry, type KeywordRule } from '../keywords'

/**
 * P5-Fix-2: hooks dispatch against the shared `keywordRegistry` singleton.
 * Plugins / P9 workflow registry / etc. publish their rules via
 * `keywordRegistry.registerSource(name, entries)`.
 */
export function extendKeywordRegistry(rule: KeywordRule): void {
  keywordRegistry.add(rule)
}

/** Reset (test-only): replaces the singleton's underlying state with a fresh registry's sources. */
export function _resetKeywordRegistry(reg = new KeywordRegistry()): void {
  // Re-publish the fresh registry's contents under the singleton so consumers
  // that hold the existing reference keep working.
  // (Tests that need full isolation should instantiate their own KeywordRegistry.)
  for (const rule of reg.list()) keywordRegistry.add(rule)
}

export const keywordDetectorHook = defineHook({
  event: 'UserPromptSubmit',
  name: 'builtin:keyword-detector',
  builtin: true,
  priority: 10,
  run(ctx) {
    if (ctx.event.event !== 'UserPromptSubmit') return
    // Skip if user wrote an explicit slash command ("/" prefix) — already a workflow.
    if (ctx.event.prompt.trimStart().startsWith('/')) return
    const matches = keywordRegistry.match(ctx.event.prompt)
    const top = matches[0]
    if (!top) return
    const { rule, matchedTrigger } = top

    if (rule.thinkingOnly) {
      ctx.inject(`<system-reminder>\nKeyword '${matchedTrigger}' detected → activating deep-thinking mode for this turn.\n</system-reminder>`)
      return
    }
    if (rule.tddOnly) {
      ctx.inject(`<system-reminder>\nKeyword '${matchedTrigger}' detected → enable TDD workflow (test-first) for this turn.\n</system-reminder>`)
      return
    }
    ctx.inject([
      `<system-reminder>`,
      `Keyword '${matchedTrigger}' detected → activating /${rule.skill}.`,
      `When responding, invoke the '${rule.skill}' skill before generating the user-facing answer.`,
      `</system-reminder>`
    ].join('\n'))
  }
})
```

- [ ] **Step 5: Write detector test**

`packages/core/test/unit/hooks/keyword-detector.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { detectKeyword, stripIgnoredRegions, KeywordRegistry } from '../../../src/hooks/keywords'

describe('stripIgnoredRegions', () => {
  test('removes fenced code blocks', () => {
    expect(stripIgnoredRegions('a ```ralph``` b')).not.toContain('ralph')
  })
  test('removes inline code', () => {
    expect(stripIgnoredRegions('a `ralph` b')).not.toContain('ralph')
  })
  test('removes URLs', () => {
    expect(stripIgnoredRegions('see https://x.com/ralph for info')).not.toContain('ralph')
  })
  test('keeps untouched plain text', () => {
    expect(stripIgnoredRegions('plain ralph here').toLowerCase()).toContain('ralph')
  })
})

describe('detectKeyword', () => {
  test('matches "ralph" as standalone word', () => {
    const r = detectKeyword('please ralph this fix')
    expect(r.rule?.skill).toBe('ralph')
    expect(r.matchedTrigger).toBe('ralph')
  })

  test('does NOT match "ralph" inside code block (false-positive guard)', () => {
    const r = detectKeyword('here is code: ```const ralph = 1;```')
    expect(r.rule).toBeNull()
  })

  test('does NOT match "ralph" inside URL', () => {
    const r = detectKeyword('see https://example.com/ralph for details')
    expect(r.rule).toBeNull()
  })

  test('does NOT match partial word "team" in "steamroller"', () => {
    const r = detectKeyword('I steamrolled the bug')
    expect(r.rule).toBeNull()
  })

  test('priority — "ralph" wins over "autopilot" when both appear', () => {
    const r = detectKeyword('autopilot this and ralph it')
    expect(r.rule?.skill).toBe('ralph')   // priority 10 < 20
  })

  test('CJK keyword "왜?" matches', () => {
    const r = detectKeyword('왜? 그게 안 되는지 알아봐')
    expect(r.rule?.skill).toBe('trace')
  })

  test('thinkingOnly marker', () => {
    const r = detectKeyword('please ultrathink before answering')
    expect(r.rule?.thinkingOnly).toBe(true)
  })

  test('extensible registry — added rule wins by priority', () => {
    const reg = new KeywordRegistry()
    reg.add({ triggers: ['xyzzy'], skill: 'my-custom', priority: 5 })
    const r = detectKeyword('please xyzzy', reg)
    expect(r.rule?.skill).toBe('my-custom')
  })
})

// P5-Fix-2 — registerSource + match() coverage
describe('KeywordRegistry.registerSource / match', () => {
  test('registerSource publishes rules under a named source', () => {
    const reg = new KeywordRegistry([])
    reg.registerSource('workflows', [
      { triggers: ['xyzzy'], skill: 'my-custom', priority: 5 }
    ])
    const m = reg.match('please xyzzy now')
    expect(m).toHaveLength(1)
    expect(m[0].rule.skill).toBe('my-custom')
    expect(m[0].source).toBe('workflows')
    expect(m[0].matchedTrigger).toBe('xyzzy')
  })

  test('registerSource replaces previous entries from the same source', () => {
    const reg = new KeywordRegistry([])
    reg.registerSource('workflows', [{ triggers: ['xyzzy'], skill: 'a', priority: 5 }])
    reg.registerSource('workflows', [{ triggers: ['xyzzy'], skill: 'b', priority: 5 }])
    const m = reg.match('xyzzy')
    expect(m.map(x => x.rule.skill)).toEqual(['b'])
  })

  test('match() returns ALL matches ordered by priority', () => {
    const reg = new KeywordRegistry([])
    reg.registerSource('a', [{ triggers: ['foo'], skill: 'low',  priority: 90 }])
    reg.registerSource('b', [{ triggers: ['foo'], skill: 'high', priority: 10 }])
    const m = reg.match('please foo')
    expect(m.map(x => x.rule.skill)).toEqual(['high', 'low'])
  })

  test('singleton `keywordRegistry` exposes default rules and registerSource()', async () => {
    const { keywordRegistry } = await import('../../../src/hooks/keywords/registry')
    const before = keywordRegistry.match('please ralph this').map(m => m.rule.skill)
    expect(before).toContain('ralph')
    keywordRegistry.registerSource('test-source', [
      { triggers: ['__unique_xyzzy_42__'], skill: 'custom', priority: 1 }
    ])
    const after = keywordRegistry.match('please __unique_xyzzy_42__')
    expect(after[0]?.rule.skill).toBe('custom')
    // Clean up: replace test-source with empty entries
    keywordRegistry.registerSource('test-source', [])
  })
})
```

- [ ] **Step 6: Run detector tests — PASS**

```bash
pnpm vitest run packages/core/test/unit/hooks/keyword-detector.test.ts
```

Expected: 16 passed (12 detector + 4 registerSource/match).

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/hooks/keywords packages/core/src/hooks/built-in/keyword-detector.ts \
        packages/core/test/unit/hooks/keyword-detector.test.ts
git commit -m "feat(hooks): keyword detector with code-block/URL stripping + 11 default rules (§9.17)"
```

---

## Task 9: Delegation enforcer built-in hook

**Files:**
- Create: `packages/core/src/hooks/delegation/categories.ts`
- Create: `packages/core/src/hooks/delegation/enforcer.ts`
- Create: `packages/core/src/hooks/delegation/index.ts`
- Create: `packages/core/src/hooks/built-in/delegation-enforcer.ts`
- Test: `packages/core/test/unit/hooks/delegation-enforcer.test.ts`

- [ ] **Step 1: Define categories from spec §9.17**

`packages/core/src/hooks/delegation/categories.ts`:
```ts
export type DelegationCategory =
  | 'visual-engineering'
  | 'ultrabrain'
  | 'artistry'
  | 'quick'
  | 'writing'
  | 'precision'

export interface CategoryProfile {
  category: DelegationCategory
  temperature: number
  thinkingBudget: 'off' | 'low' | 'medium' | 'high'
  model: string
  /** Optional inline rationale for log/audit. */
  notes?: string
}

export const CATEGORY_TABLE: Record<DelegationCategory, CategoryProfile> = {
  'visual-engineering': { category: 'visual-engineering', temperature: 0.7, thinkingBudget: 'medium', model: 'GLM-5.1',     notes: 'designer agent' },
  'ultrabrain':         { category: 'ultrabrain',         temperature: 0.3, thinkingBudget: 'high',   model: 'GLM-5.1',     notes: 'thinking on' },
  'artistry':           { category: 'artistry',           temperature: 0.9, thinkingBudget: 'low',    model: 'GLM-5.1' },
  'quick':              { category: 'quick',              temperature: 0.4, thinkingBudget: 'off',    model: 'GLM-5-Turbo', notes: 'fallback: GLM-4.5-Air' },
  'writing':            { category: 'writing',            temperature: 0.5, thinkingBudget: 'low',    model: 'GLM-5-Turbo', notes: 'writer agent' },
  'precision':          { category: 'precision',          temperature: 0.0, thinkingBudget: 'high',   model: 'GLM-5.1',     notes: 'executor agent' }
}

/** Resolve a category from a free-form input (subagent_type or explicit category). */
export function resolveCategory(input: { category?: unknown; subagent_type?: unknown }): DelegationCategory | undefined {
  if (typeof input.category === 'string' && input.category in CATEGORY_TABLE) {
    return input.category as DelegationCategory
  }
  if (typeof input.subagent_type === 'string') {
    return SUBAGENT_TO_CATEGORY[input.subagent_type]
  }
  return undefined
}

/** Map specific agent roles → categories (spec §9.14 + §9.17 cross-walk). */
export const SUBAGENT_TO_CATEGORY: Record<string, DelegationCategory> = {
  designer: 'visual-engineering',
  architect: 'ultrabrain',
  analyst: 'ultrabrain',
  planner: 'ultrabrain',
  orchestrator: 'ultrabrain',
  scientist: 'artistry',
  explore: 'quick',
  'qa-tester': 'quick',
  writer: 'writing',
  'document-specialist': 'writing',
  'git-master': 'writing',
  executor: 'precision',
  verifier: 'precision',
  critic: 'precision',
  'code-reviewer': 'precision',
  'security-reviewer': 'precision',
  'test-engineer': 'precision',
  debugger: 'precision',
  tracer: 'precision',
  'code-simplifier': 'quick'
}
```

- [ ] **Step 2: Enforcer logic**

`packages/core/src/hooks/delegation/enforcer.ts`:
```ts
import { CATEGORY_TABLE, resolveCategory, type DelegationCategory } from './categories'

export interface EnforceResult {
  applied: boolean
  category?: DelegationCategory
  /** Keys that were added or overwritten on params. */
  changedKeys: string[]
  reason?: string
}

/**
 * Mutates the Task tool's params in-place. We only set fields that are
 * currently absent (let explicit user override win) UNLESS the user passed
 * `category` explicitly AND `enforce: true` — in that case we overwrite.
 */
export function applyDelegationCategory(params: Record<string, unknown>): EnforceResult {
  const category = resolveCategory(params)
  if (!category) return { applied: false, changedKeys: [], reason: 'no resolvable category' }
  const profile = CATEGORY_TABLE[category]
  const changed: string[] = []
  const set = <K extends string>(k: K, v: unknown) => {
    if (params[k] === undefined || params.enforce === true) {
      params[k] = v
      changed.push(k)
    }
  }
  set('model', profile.model)
  set('temperature', profile.temperature)
  set('thinking_budget', profile.thinkingBudget)
  params.category = category
  changed.push('category')
  return { applied: true, category, changedKeys: changed }
}
```

- [ ] **Step 3: Barrel**

`packages/core/src/hooks/delegation/index.ts`:
```ts
export * from './categories'
export * from './enforcer'
```

- [ ] **Step 4: Wrap as a built-in PreToolUse hook**

`packages/core/src/hooks/built-in/delegation-enforcer.ts`:
```ts
import { defineHook } from '../sdk/define-hook'
import { applyDelegationCategory } from '../delegation/enforcer'

export const delegationEnforcerHook = defineHook({
  event: 'PreToolUse',
  matcher: '^Task$',
  name: 'builtin:delegation-enforcer',
  builtin: true,
  priority: 20,
  run(ctx) {
    if (ctx.event.event !== 'PreToolUse') return
    const r = applyDelegationCategory(ctx.event.params)
    if (r.applied) {
      ctx.log.info({ category: r.category, changedKeys: r.changedKeys }, 'delegation enforcer applied category profile')
    } else {
      ctx.log.debug({ reason: r.reason }, 'delegation enforcer no-op')
    }
  }
})
```

- [ ] **Step 5: Write tests**

`packages/core/test/unit/hooks/delegation-enforcer.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { applyDelegationCategory, resolveCategory, CATEGORY_TABLE } from '../../../src/hooks/delegation'

describe('resolveCategory', () => {
  test('explicit category string wins', () => {
    expect(resolveCategory({ category: 'precision' })).toBe('precision')
  })
  test('subagent_type maps to category', () => {
    expect(resolveCategory({ subagent_type: 'executor' })).toBe('precision')
    expect(resolveCategory({ subagent_type: 'designer' })).toBe('visual-engineering')
  })
  test('unknown subagent_type → undefined', () => {
    expect(resolveCategory({ subagent_type: 'martian' })).toBeUndefined()
  })
  test('no input → undefined', () => {
    expect(resolveCategory({})).toBeUndefined()
  })
})

describe('applyDelegationCategory', () => {
  test('writes model/temperature/thinking_budget from category', () => {
    const p: Record<string, unknown> = { category: 'precision' }
    const r = applyDelegationCategory(p)
    expect(r.applied).toBe(true)
    expect(p.model).toBe('GLM-5.1')
    expect(p.temperature).toBe(0.0)
    expect(p.thinking_budget).toBe('high')
    expect(r.changedKeys).toEqual(expect.arrayContaining(['model', 'temperature', 'thinking_budget', 'category']))
  })

  test('does NOT overwrite explicit user values unless enforce:true', () => {
    const p: Record<string, unknown> = { category: 'precision', model: 'GLM-4.7', temperature: 0.5 }
    const r = applyDelegationCategory(p)
    expect(r.applied).toBe(true)
    expect(p.model).toBe('GLM-4.7')       // preserved
    expect(p.temperature).toBe(0.5)       // preserved
    expect(p.thinking_budget).toBe('high')// filled
  })

  test('enforce:true overwrites user values', () => {
    const p: Record<string, unknown> = { category: 'precision', model: 'GLM-4.7', enforce: true }
    applyDelegationCategory(p)
    expect(p.model).toBe('GLM-5.1')
  })

  test('subagent_type → category resolution path', () => {
    const p: Record<string, unknown> = { subagent_type: 'writer' }
    const r = applyDelegationCategory(p)
    expect(r.category).toBe('writing')
    expect(p.temperature).toBe(CATEGORY_TABLE.writing.temperature)
  })

  test('no category resolvable → applied:false, params untouched', () => {
    const p: Record<string, unknown> = { description: 'do a thing' }
    const before = JSON.stringify(p)
    const r = applyDelegationCategory(p)
    expect(r.applied).toBe(false)
    expect(JSON.stringify(p)).toBe(before)
  })

  test('all 6 categories produce distinct profiles', () => {
    const seen = new Set<string>()
    for (const c of Object.keys(CATEGORY_TABLE)) {
      const p: Record<string, unknown> = { category: c }
      applyDelegationCategory(p)
      seen.add(`${p.model}|${p.temperature}|${p.thinking_budget}`)
    }
    expect(seen.size).toBe(6)
  })
})
```

- [ ] **Step 6: Run tests — PASS**

```bash
pnpm vitest run packages/core/test/unit/hooks/delegation-enforcer.test.ts
```

Expected: 10 passed.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/hooks/delegation packages/core/src/hooks/built-in/delegation-enforcer.ts \
        packages/core/test/unit/hooks/delegation-enforcer.test.ts
git commit -m "feat(hooks): delegation enforcer — category → model/temp/thinking_budget on Task tool"
```

---

## Task 10: Persistent-stop, compaction, and trace built-in hooks

**Files:**
- Create: `packages/core/src/hooks/built-in/persistent-stop.ts`
- Create: `packages/core/src/hooks/built-in/precompact-preserve.ts`
- Create: `packages/core/src/hooks/built-in/postcompact-restore.ts`
- Create: `packages/core/src/hooks/built-in/trace-recorder.ts`
- Create: `packages/core/src/hooks/built-in/index.ts`
- Test: `packages/core/test/unit/hooks/persistent-stop.test.ts`

- [ ] **Step 1: Persistent-stop ("boulder never stops")**

`packages/core/src/hooks/built-in/persistent-stop.ts`:
```ts
import { defineHook } from '../sdk/define-hook'

/**
 * Stop hook — if we're inside a persistent-mode run (autopilot / ralph / ultrawork
 * long-horizon) AND the agent left pending TODOs, inject the OMC-style
 * "boulder never stops" continuation reminder. This nudges the next turn to
 * keep going instead of treating Stop as a hard end.
 */
export const persistentStopHook = defineHook({
  event: 'Stop',
  name: 'builtin:persistent-stop',
  builtin: true,
  priority: 30,
  run(ctx) {
    if (ctx.event.event !== 'Stop') return
    if (!ctx.event.persistentMode) return
    if (!ctx.event.hasPendingTodos) return
    ctx.inject([
      `<system-reminder>`,
      `The boulder never stops. Persistent mode is active and pending TODOs remain.`,
      `Continue the next concrete step — do not stop. If you are blocked, emit a NeedsInput event.`,
      `</system-reminder>`
    ].join('\n'))
  }
})
```

- [ ] **Step 2: Compaction-preserve / restore slots (P7 will plug in)**

`packages/core/src/hooks/built-in/precompact-preserve.ts`:
```ts
import { defineHook } from '../sdk/define-hook'

/**
 * PreCompact built-in — snapshot session "preserve-across-compaction" state into
 * a state KV key. P7 (compactor) will read this key when rebuilding the post-
 * compaction context. We don't ship the compactor here; we just guarantee the
 * preservation slot exists and is called.
 */
export const precompactPreserveHook = defineHook({
  event: 'PreCompact',
  name: 'builtin:precompact-preserve',
  builtin: true,
  priority: 10,
  async run(ctx) {
    if (ctx.event.event !== 'PreCompact') return
    const all = await ctx.state.all('preserve:')
    await ctx.state.write('precompact:snapshot', { ts: ctx.event.ts, keys: Object.keys(all) })
    ctx.log.info({ keys: Object.keys(all).length, reason: ctx.event.reason }, 'precompact preserve snapshot written')
  }
})
```

`packages/core/src/hooks/built-in/postcompact-restore.ts`:
```ts
import { defineHook } from '../sdk/define-hook'

/**
 * PostCompact built-in — log the post-compaction shape so P7's compactor can
 * be observed and tested. Real restoration of preserved keys happens inside
 * the compactor itself; this hook just leaves a breadcrumb.
 */
export const postcompactRestoreHook = defineHook({
  event: 'PostCompact',
  name: 'builtin:postcompact-restore',
  builtin: true,
  priority: 10,
  run(ctx) {
    if (ctx.event.event !== 'PostCompact') return
    ctx.log.info({
      summaryBytes: ctx.event.summaryBytes,
      preservedTurns: ctx.event.preservedTurns,
      freedTokens: ctx.event.freedTokens
    }, 'postcompact')
  }
})
```

- [ ] **Step 3: Trace recorder (spec §9.20 — every event → events table)**

`packages/core/src/hooks/built-in/trace-recorder.ts`:
```ts
import { defineHook } from '../sdk/define-hook'
import type { HookEventName, HookEvent } from '../events/types'

/**
 * Registered for EVERY event. Persists a tiny row into the daemon's events
 * table (P1 schema already has it) so `glm trace timeline <session>` can
 * reconstruct the full hook timeline. Bodies are bounded — never log raw
 * tool params/results here (P3 tool registry does that separately).
 */
export function makeTraceRecorderHooks(writeEventRow: (e: HookEvent) => Promise<void>) {
  return (Object.keys({} as Record<HookEventName, true>) as HookEventName[]).map((name) => {
    // we instead enumerate by importing ALL_HOOK_EVENTS — see index.ts
    return name
  })
}

/** Single factory — register one hook per event. */
import { ALL_HOOK_EVENTS } from '../events/types'
export function buildTraceRecorderHooks(writeEventRow: (e: HookEvent) => Promise<void>) {
  return ALL_HOOK_EVENTS.map((name) => defineHook({
    event: name,
    name: `builtin:trace:${name}`,
    builtin: true,
    priority: 99,
    async run(ctx) {
      try { await writeEventRow(ctx.event as HookEvent) }
      catch (e) { ctx.log.warn({ err: e, event: name }, 'trace recorder write failed') }
    }
  }))
}
```

- [ ] **Step 4: Built-in barrel — register everything**

`packages/core/src/hooks/built-in/index.ts`:
```ts
import type { HookManager } from '../manager'
import type { HookEvent } from '../events/types'
import { keywordDetectorHook } from './keyword-detector'
import { delegationEnforcerHook } from './delegation-enforcer'
import { persistentStopHook } from './persistent-stop'
import { precompactPreserveHook } from './precompact-preserve'
import { postcompactRestoreHook } from './postcompact-restore'
import { buildTraceRecorderHooks } from './trace-recorder'

export interface RegisterBuiltinsOpts {
  /** Sink for trace-recorder. Defaults to a no-op (suitable for unit tests). */
  writeEventRow?: (e: HookEvent) => Promise<void>
  /** Disable specific built-ins (CLI / settings can also flip enabled flag later). */
  exclude?: string[]
}

export function registerBuiltins(mgr: HookManager, opts: RegisterBuiltinsOpts = {}): void {
  const noop = async () => {}
  const writeRow = opts.writeEventRow ?? noop
  const excluded = new Set(opts.exclude ?? [])
  const candidates = [
    keywordDetectorHook,
    delegationEnforcerHook,
    persistentStopHook,
    precompactPreserveHook,
    postcompactRestoreHook,
    ...buildTraceRecorderHooks(writeRow)
  ]
  for (const def of candidates) {
    if (def.name && excluded.has(def.name)) continue
    mgr.register(def, 'builtin')
  }
}

export { keywordDetectorHook, delegationEnforcerHook, persistentStopHook }
export { extendKeywordRegistry } from './keyword-detector'
```

- [ ] **Step 5: Test persistent-stop**

`packages/core/test/unit/hooks/persistent-stop.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { HookManager } from '../../../src/hooks/manager'
import { registerBuiltins } from '../../../src/hooks/built-in'

describe('persistent-stop hook', () => {
  test('injects continuation reminder when persistentMode + pending TODOs', async () => {
    const mgr = new HookManager()
    registerBuiltins(mgr, { exclude: ['builtin:keyword-detector', 'builtin:delegation-enforcer', 'builtin:precompact-preserve', 'builtin:postcompact-restore'] })
    const r = await mgr.emit({ event: 'Stop', ts: 'now', hasPendingTodos: true, persistentMode: true })
    expect(r.reminder).toContain('boulder never stops')
  })

  test('does NOT inject when persistentMode is false', async () => {
    const mgr = new HookManager()
    registerBuiltins(mgr, { exclude: ['builtin:keyword-detector', 'builtin:delegation-enforcer', 'builtin:precompact-preserve', 'builtin:postcompact-restore'] })
    const r = await mgr.emit({ event: 'Stop', ts: 'now', hasPendingTodos: true, persistentMode: false })
    expect(r.reminder).toBe('')
  })

  test('does NOT inject when no pending TODOs', async () => {
    const mgr = new HookManager()
    registerBuiltins(mgr, { exclude: ['builtin:keyword-detector', 'builtin:delegation-enforcer', 'builtin:precompact-preserve', 'builtin:postcompact-restore'] })
    const r = await mgr.emit({ event: 'Stop', ts: 'now', hasPendingTodos: false, persistentMode: true })
    expect(r.reminder).toBe('')
  })
})
```

- [ ] **Step 6: Run tests — PASS**

```bash
pnpm vitest run packages/core/test/unit/hooks/persistent-stop.test.ts
```

Expected: 3 passed.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/hooks/built-in packages/core/test/unit/hooks/persistent-stop.test.ts
git commit -m "feat(hooks): built-ins — persistent-stop, precompact/postcompact slots, trace recorder, built-in registrar"
```

---

## Task 11: CLI `glm hook list/test/enable/disable`

**Files:**
- Create: `packages/cli/src/commands/hook.ts`
- Modify: `packages/cli/src/bin.ts` (add the `hook` subcommand)
- Add RPC method: `packages/core/src/rpc/methods/hook.ts`
- Create: `packages/core/src/hooks/loader-hub-registration.ts` (P5-Fix-4 — registers hook subsystem with the shared `LoaderHub`)

- [ ] **Step 1: RPC method file (daemon-side)**

`packages/core/src/rpc/methods/hook.ts`:
```ts
import { z } from 'zod'
import type { RpcHandler } from '../protocol'
import { RPC_ERRORS } from '../protocol'
import type { HookManager } from '../../hooks/manager'
import type { HookEvent, HookEventName } from '../../hooks/events/types'
import { ALL_HOOK_EVENTS } from '../../hooks/events/types'

const NameParams = z.object({ name: z.string() })
const TestParams = z.object({
  event: z.string(),
  tool: z.string().optional(),
  prompt: z.string().optional()
})

export function makeHookHandlers(mgr: HookManager): Record<string, RpcHandler> {
  return {
    'hook.list': async () => {
      return mgr.list().map(h => ({
        name: h.name, event: h.def.event, source: h.source, enabled: h.enabled,
        matcher: typeof h.def.matcher === 'string' ? h.def.matcher : Array.isArray(h.def.matcher) ? h.def.matcher.join('|') : undefined,
        priority: h.def.priority, builtin: !!h.def.builtin
      }))
    },
    'hook.enable': async (p) => {
      const parsed = NameParams.safeParse(p); if (!parsed.success) throw { ...RPC_ERRORS.INVALID_PARAMS, data: parsed.error.flatten() }
      return { ok: mgr.enable(parsed.data.name) }
    },
    'hook.disable': async (p) => {
      const parsed = NameParams.safeParse(p); if (!parsed.success) throw { ...RPC_ERRORS.INVALID_PARAMS, data: parsed.error.flatten() }
      return { ok: mgr.disable(parsed.data.name) }
    },
    'hook.test': async (p) => {
      const parsed = TestParams.safeParse(p); if (!parsed.success) throw { ...RPC_ERRORS.INVALID_PARAMS, data: parsed.error.flatten() }
      if (!(ALL_HOOK_EVENTS as readonly string[]).includes(parsed.data.event)) {
        throw { ...RPC_ERRORS.INVALID_PARAMS, data: `unknown event ${parsed.data.event}` }
      }
      const event = synthesize(parsed.data.event as HookEventName, parsed.data.tool, parsed.data.prompt)
      const r = await mgr.emit(event as HookEvent as never)
      return r
    }
  }
}

function synthesize(name: HookEventName, tool?: string, prompt?: string): HookEvent {
  const ts = new Date().toISOString()
  switch (name) {
    case 'PreToolUse':         return { event: 'PreToolUse', ts, tool: tool ?? 'Edit', params: { path: '/tmp/x' } }
    case 'PostToolUse':        return { event: 'PostToolUse', ts, tool: tool ?? 'Edit', params: { path: '/tmp/x' }, result: { ok: true }, durationMs: 10 }
    case 'UserPromptSubmit':   return { event: 'UserPromptSubmit', ts, prompt: prompt ?? 'please ralph this' }
    case 'Stop':               return { event: 'Stop', ts, hasPendingTodos: true, persistentMode: true }
    case 'SessionStart':       return { event: 'SessionStart', ts, cwd: process.cwd(), worktree: process.cwd() }
    default:                   return { event: name, ts } as HookEvent
  }
}
```

- [ ] **Step 2: Register the hook subsystem via LoaderHub (P5-Fix-4)**

> **P5-Fix-4 — no direct edit to `packages/core/src/daemon/daemon.ts`.** The hook subsystem is wired through the shared `LoaderHub` (P1-Fix-5 / P4 ships the empty `LoaderHub` stub at `packages/core/src/daemon/loader-hub.ts`; later plans populate it). P1's `Daemon.start()` already calls `await LoaderHub.runAll(this)` once after `runMigrations(db)`, so each subsystem only has to register itself at import time.

`packages/core/src/hooks/loader-hub-registration.ts`:
```ts
import { LoaderHub } from '../daemon/loader-hub'
import { HookManager } from './manager'
import { registerBuiltins } from './built-in'
import { makeHookHandlers } from '../rpc/methods/hook'

LoaderHub.registerSubsystem('hooks', async (daemon) => {
  const hookMgr = new HookManager({
    log: daemon.log,
    settingsLocalPath: `${daemon.paths.root}/settings.local.json`,
    glmInfo: () => ({ cwd: process.cwd(), worktree: process.cwd(), persistentMode: false })
  })
  registerBuiltins(hookMgr, {
    writeEventRow: async (e) => {
      try {
        daemon.db!.prepare(`INSERT INTO events(ts, session_id, topic, data) VALUES (?, ?, ?, ?)`)
          .run(e.ts, e.sessionId ?? null, e.event, Buffer.from(JSON.stringify(e)))
      } catch { /* swallow */ }
    }
  })
  for (const [name, h] of Object.entries(makeHookHandlers(hookMgr))) daemon.rpc.on(name, h)
  // Expose for later plans (P7 compactor, P8 orchestrator) that want to emit events.
  daemon.hookMgr = hookMgr
})
```

This file is imported once from `packages/core/src/hooks/index.ts` (for its side-effect of `LoaderHub.registerSubsystem`). The hook subsystem then activates automatically when the daemon boots — no textual edit to `daemon.ts`.

> **Note on the `daemon.hookMgr` field:** P1's `Daemon` class (per P1-Fix-5) exposes a thin "subsystem bag" — additional plans monkey-augment it via TypeScript declaration merging in their own module:
> ```ts
> // packages/core/src/hooks/loader-hub-registration.ts (top of file)
> declare module '../daemon/daemon' {
>   interface Daemon { hookMgr?: import('./manager').HookManager }
> }
> ```

- [ ] **Step 3: Export `makeHookHandlers` from core**

Update `packages/core/src/rpc/index.ts` to re-export:
```ts
export { makeHookHandlers } from './methods/hook'
```

Update `packages/core/src/hooks/index.ts` to re-export built-ins:
```ts
export * from './built-in'
```

- [ ] **Step 4: CLI command**

`packages/cli/src/commands/hook.ts`:
```ts
import { Command } from 'commander'
import kleur from 'kleur'
import { rpcCall } from '../rpc-client'    // P1 already created this helper

export function registerHookCommand(program: Command): void {
  const hook = program.command('hook').description('Manage hooks')

  hook.command('list')
    .description('List all registered hooks')
    .option('--event <name>', 'Filter by event name')
    .action(async (opts: { event?: string }) => {
      const rows = await rpcCall('hook.list') as Array<{
        name: string; event: string; source: string; enabled: boolean; matcher?: string; priority?: number; builtin: boolean
      }>
      const filtered = opts.event ? rows.filter(r => r.event === opts.event) : rows
      const grouped = new Map<string, typeof filtered>()
      for (const r of filtered) {
        const arr = grouped.get(r.event) ?? []
        arr.push(r)
        grouped.set(r.event, arr)
      }
      for (const [event, hooks] of [...grouped.entries()].sort()) {
        process.stdout.write(kleur.bold(`\n${event}\n`))
        for (const h of hooks) {
          const status = h.enabled ? kleur.green('✓') : kleur.red('✗')
          const src = h.builtin ? kleur.magenta('[builtin]') : h.source === 'plugin' ? kleur.cyan('[plugin]') : kleur.gray('[config]')
          const m = h.matcher ? kleur.gray(` matcher=${h.matcher}`) : ''
          const pr = h.priority !== undefined ? kleur.gray(` priority=${h.priority}`) : ''
          process.stdout.write(`  ${status} ${src} ${h.name}${m}${pr}\n`)
        }
      }
    })

  hook.command('test <event>')
    .description('Synthesize a fake event and dispatch matching hooks')
    .option('--tool <name>', 'Tool name (for PreToolUse/PostToolUse)')
    .option('--prompt <text>', 'Prompt text (for UserPromptSubmit)')
    .action(async (event: string, opts: { tool?: string; prompt?: string }) => {
      const r = await rpcCall('hook.test', { event, tool: opts.tool, prompt: opts.prompt }) as {
        ran: string[]; failed: { name: string; error: string }[]; timedOut: string[]; reminder: string
      }
      process.stdout.write(kleur.bold(`Ran: ${r.ran.join(', ') || '(none)'}\n`))
      if (r.failed.length) process.stdout.write(kleur.red(`Failed:\n`) + r.failed.map(f => `  ${f.name}: ${f.error}`).join('\n') + '\n')
      if (r.timedOut.length) process.stdout.write(kleur.yellow(`Timed out: ${r.timedOut.join(', ')}\n`))
      if (r.reminder) process.stdout.write(kleur.gray(`\n--- reminder injection ---\n${r.reminder}\n`))
    })

  hook.command('enable <name>').description('Enable a hook by name')
    .action(async (name: string) => {
      const r = await rpcCall('hook.enable', { name }) as { ok: boolean }
      process.stdout.write(r.ok ? kleur.green(`✓ enabled ${name}\n`) : kleur.red(`✗ no such hook: ${name}\n`))
    })

  hook.command('disable <name>').description('Disable a hook by name (built-ins refused)')
    .action(async (name: string) => {
      const r = await rpcCall('hook.disable', { name }) as { ok: boolean }
      process.stdout.write(r.ok ? kleur.green(`✓ disabled ${name}\n`) : kleur.red(`✗ refused or no such hook: ${name}\n`))
    })
}
```

- [ ] **Step 5: Wire into bin.ts**

Modify `packages/cli/src/bin.ts`:
```ts
import { registerHookCommand } from './commands/hook'
// ...
registerHookCommand(program)
```

- [ ] **Step 6: Build + smoke test**

```bash
pnpm build
export GLM_HOME=/tmp/glm-hook-smoke-$$
rm -rf $GLM_HOME
node packages/cli/dist/bin.js daemon start
node packages/cli/dist/bin.js hook list                        # expect: 30+ hooks grouped by event
node packages/cli/dist/bin.js hook test UserPromptSubmit --prompt "please ralph this"   # expect: reminder mentioning /ralph
node packages/cli/dist/bin.js hook test PreToolUse --tool Task                          # expect: delegation enforcer logs
node packages/cli/dist/bin.js daemon stop
```

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/rpc/methods/hook.ts packages/core/src/rpc/index.ts \
        packages/core/src/hooks/loader-hub-registration.ts \
        packages/core/src/hooks/index.ts \
        packages/cli/src/commands/hook.ts packages/cli/src/bin.ts
git commit -m "feat(cli+hooks): glm hook list/test/enable/disable + LoaderHub registers HookManager + built-ins (P5-Fix-4)"
```

> Note: previously this step listed `packages/core/src/daemon/daemon.ts`. P5-Fix-4 removes that — the hook subsystem now hooks itself in via `LoaderHub.registerSubsystem('hooks', …)` so the daemon source file is left untouched.

---

## Task 12: Integration tests — end-to-end command hook + plugin hook + kill switches

**Files:**
- Create: `packages/core/test/integration/hooks/end-to-end-command-hook.test.ts`
- Create: `packages/core/test/integration/hooks/end-to-end-plugin-hook.test.ts`
- Create: `packages/core/test/integration/hooks/keyword-to-injection.test.ts`
- Create: `packages/core/test/integration/hooks/kill-switch.test.ts`
- Create: `packages/core/test/integration/hooks/_fixtures/plugin-hook.mjs`

- [ ] **Step 1: End-to-end command hook (registered via config, fires on PreToolUse, side-effect file created)**

`packages/core/test/integration/hooks/end-to-end-command-hook.test.ts`:
```ts
import { afterEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { HookManager } from '../../../src/hooks/manager'

let tmp: string
afterEach(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }) })

describe('end-to-end command hook (integration)', () => {
  test('command hook runs and writes side-effect file', async () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-hook-cmd-'))
    const sideEffect = path.join(tmp, 'touched.txt')
    const mgr = new HookManager({ settingsLocalPath: path.join(tmp, 'settings.local.json') })
    await mgr.loadFromConfig({
      PostToolUse: [{
        matcher: 'Edit',
        hooks: [{ type: 'command', command: `echo $CLAUDE_FILE > ${sideEffect}` }]
      }]
    })
    const r = await mgr.emit({
      event: 'PostToolUse', ts: new Date().toISOString(),
      tool: 'Edit', params: { path: '/tmp/myfile.ts' },
      result: { ok: true }, durationMs: 5
    })
    expect(r.ran.length).toBe(1)
    expect(existsSync(sideEffect)).toBe(true)
    expect(readFileSync(sideEffect, 'utf8').trim()).toBe('/tmp/myfile.ts')
  })

  test('command hook stdout becomes a <system-reminder> injection', async () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-hook-cmd-'))
    const mgr = new HookManager({ settingsLocalPath: path.join(tmp, 'settings.local.json') })
    await mgr.loadFromConfig({
      PostToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: 'echo "please format imports"' }] }]
    })
    const r = await mgr.emit({
      event: 'PostToolUse', ts: 'now', tool: 'Edit', params: { path: '/tmp/x' }, result: null, durationMs: 1
    })
    expect(r.reminder).toContain('<system-reminder>')
    expect(r.reminder).toContain('please format imports')
  })

  test('command hook timeout surfaces in timedOut[]', async () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-hook-cmd-'))
    const mgr = new HookManager({ settingsLocalPath: path.join(tmp, 'settings.local.json') })
    await mgr.loadFromConfig({
      PostToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: 'sleep 5', timeoutMs: 100 }] }]
    })
    const r = await mgr.emit({
      event: 'PostToolUse', ts: 'now', tool: 'Edit', params: {}, result: null, durationMs: 1
    })
    expect(r.timedOut.length).toBe(1)
  })
})
```

- [ ] **Step 2: Plugin hook fixture**

`packages/core/test/integration/hooks/_fixtures/plugin-hook.mjs`:
```js
export default {
  event: 'PreToolUse',
  matcher: 'Read',
  name: 'fixture:plugin-hook',
  run: (ctx) => {
    ctx.inject('<system-reminder>plugin-hook fired</system-reminder>')
  }
}
```

`packages/core/test/integration/hooks/end-to-end-plugin-hook.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { HookManager } from '../../../src/hooks/manager'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const fixture = path.join(HERE, '_fixtures', 'plugin-hook.mjs')

describe('end-to-end plugin hook (integration)', () => {
  test('plugin hook loads via config and injects', async () => {
    const mgr = new HookManager()
    await mgr.loadFromConfig({
      PreToolUse: [{ hooks: [{ type: 'plugin', package: fixture }] }]
    })
    const r = await mgr.emit({ event: 'PreToolUse', ts: 'now', tool: 'Read', params: {} })
    expect(r.ran.length).toBe(1)
    expect(r.reminder).toContain('plugin-hook fired')
  })

  test('matcher from plugin def is honored when config omits one', async () => {
    const mgr = new HookManager()
    await mgr.loadFromConfig({
      PreToolUse: [{ hooks: [{ type: 'plugin', package: fixture }] }]
    })
    const r = await mgr.emit({ event: 'PreToolUse', ts: 'now', tool: 'Bash', params: {} })
    expect(r.ran).toEqual([])         // matcher 'Read' excludes Bash
  })
})
```

- [ ] **Step 3: Keyword → injection end-to-end**

`packages/core/test/integration/hooks/keyword-to-injection.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { HookManager } from '../../../src/hooks/manager'
import { registerBuiltins } from '../../../src/hooks/built-in'

describe('keyword detector → reminder injection (integration)', () => {
  test('"please ralph this" injects /ralph activation reminder', async () => {
    const mgr = new HookManager()
    registerBuiltins(mgr)
    const r = await mgr.emit({ event: 'UserPromptSubmit', ts: 'now', prompt: 'please ralph this' })
    expect(r.reminder).toContain("activating /ralph")
  })

  test('explicit slash command "/autopilot do X" skips keyword detection', async () => {
    const mgr = new HookManager()
    registerBuiltins(mgr)
    const r = await mgr.emit({ event: 'UserPromptSubmit', ts: 'now', prompt: '/autopilot do X' })
    expect(r.reminder).not.toContain('activating /')
  })

  test('code-block content does not trigger', async () => {
    const mgr = new HookManager()
    registerBuiltins(mgr)
    const r = await mgr.emit({
      event: 'UserPromptSubmit', ts: 'now',
      prompt: 'here is my code: ```\nconst ralph = 1;\n```'
    })
    expect(r.reminder).not.toContain('activating /')
  })

  test('delegation enforcer fires on Task PreToolUse and overrides params', async () => {
    const mgr = new HookManager()
    registerBuiltins(mgr)
    const params: Record<string, unknown> = { subagent_type: 'executor', description: 'do thing' }
    await mgr.emit({ event: 'PreToolUse', ts: 'now', tool: 'Task', params })
    expect(params.category).toBe('precision')
    expect(params.model).toBe('GLM-5.1')
    expect(params.thinking_budget).toBe('high')
  })
})
```

- [ ] **Step 4: Kill-switch integration test**

`packages/core/test/integration/hooks/kill-switch.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { HookManager } from '../../../src/hooks/manager'
import { registerBuiltins } from '../../../src/hooks/built-in'

const origEnv = { ...process.env }
beforeEach(() => { delete process.env.DISABLE_GLM_HOOKS; delete process.env.GLM_SKIP_HOOKS })
afterEach(() => { process.env = { ...origEnv } })

describe('kill switches (integration)', () => {
  test('DISABLE_GLM_HOOKS=1 short-circuits emit()', async () => {
    const mgr = new HookManager()
    registerBuiltins(mgr)
    process.env.DISABLE_GLM_HOOKS = '1'
    const r = await mgr.emit({ event: 'UserPromptSubmit', ts: 'now', prompt: 'please ralph this' })
    expect(r.ran).toEqual([])
    expect(r.reminder).toBe('')
  })

  test('GLM_SKIP_HOOKS disables named hooks', async () => {
    process.env.GLM_SKIP_HOOKS = 'builtin:keyword-detector'
    const mgr = new HookManager()
    registerBuiltins(mgr)
    const r = await mgr.emit({ event: 'UserPromptSubmit', ts: 'now', prompt: 'please ralph this' })
    expect(r.reminder).not.toContain('activating /')
  })

  test('per-turn loop guard auto-disables a spammy hook after 5 fires', async () => {
    const mgr = new HookManager()
    let n = 0
    mgr.register({ event: 'UserPromptSubmit', name: 'spammy', run: () => { n++ } }, 'config')
    mgr.beginTurn('t1')
    for (let i = 0; i < 7; i++) {
      await mgr.emit({ event: 'UserPromptSubmit', ts: 'now', prompt: 'hi' })
    }
    expect(n).toBe(5)                                    // 6th and 7th blocked by guard
  })
})
```

- [ ] **Step 5: Run all integration tests**

```bash
pnpm vitest run packages/core/test/integration/hooks/
```

Expected: command-hook × 3, plugin-hook × 2, keyword-to-injection × 4, kill-switch × 3 = 12 passed.

- [ ] **Step 6: Commit**

```bash
git add packages/core/test/integration/hooks
git commit -m "test(hooks): integration — command/plugin hooks, keyword injection, delegation, kill switches"
```

---

## Task 13: Public SDK surface + authoring guide stub

**Files:**
- Create: `packages/core/src/sdk/index.ts`
- Create: `packages/core/src/sdk/README.md`
- Create: `docs/hooks.md`
- Modify: `packages/core/package.json` (add `./sdk` export)

- [ ] **Step 1: Public SDK barrel — the surface plugin authors import from**

`packages/core/src/sdk/index.ts`:
```ts
/**
 * @glm/code/sdk — public SDK for hook & plugin authors.
 *
 * This module is the ONLY stable surface. Anything outside this file may change
 * between minor versions. Plugin authors should write:
 *
 *   import { defineHook, type HookContext, type HookEventName } from '@glm/code/sdk'
 *
 *   export default defineHook({
 *     event: 'PostToolUse',
 *     matcher: 'Edit|Write',
 *     run: async (ctx) => { await ctx.notify('edit done') }
 *   })
 */

export { defineHook } from '../hooks/sdk/define-hook'
export type { HookDef } from '../hooks/sdk/define-hook'
export type { HookContext, HookNotifyOpts } from '../hooks/sdk/context'
export type {
  HookEvent, HookEventName, HookEventOf,
  // re-export every payload type so authors can narrow their `ctx.event`
  SessionStartEvent, SessionEndEvent, SessionIdleEvent,
  UserPromptSubmitEvent,
  PreToolUseEvent, PostToolUseEvent, PostToolUseFailureEvent,
  SubagentStartEvent, SubagentStopEvent,
  PreCompactEvent, PostCompactEvent,
  StopEvent, TurnCompleteEvent,
  RunHeartbeatEvent, RunBlockedEvent,
  WorkerAssignedEvent, WorkerStalledEvent, WorkerRecoveredEvent,
  TestStartedEvent, TestFinishedEvent, TestFailedEvent,
  RetryNeededEvent, HandoffNeededEvent, NeedsInputEvent,
  PRCreatedEvent, NotificationEvent,
  PreSkillRunEvent, PostSkillRunEvent,
  PermissionRequestedEvent, PermissionGrantedEvent, PermissionDeniedEvent
} from '../hooks/events/types'
export { ALL_HOOK_EVENTS } from '../hooks/events/types'
```

- [ ] **Step 2: Add subpath export to package.json**

`packages/core/package.json` — add to `exports`:
```json
{
  "exports": {
    ".":     { "import": "./dist/index.js", "types": "./dist/index.d.ts" },
    "./sdk": { "import": "./dist/sdk/index.js", "types": "./dist/sdk/index.d.ts" }
  }
}
```

- [ ] **Step 3: Authoring guide stub**

`docs/hooks.md`:
```markdown
# Writing glm Hooks

Hooks are the event backbone of glm. Anything that observes or modifies a
session — formatters, linters, notifications, workflow activators, the trace
recorder itself — is a hook.

## Two flavors

1. **Command hook** — a shell command, configured in `settings.json`:
   ```jsonc
   "hooks": {
     "PostToolUse": [{
       "matcher": "Edit",
       "hooks": [{ "type": "command", "command": "prettier --write $GLM_FILE" }]
     }]
   }
   ```
   Receives `$GLM_*` (and `$CLAUDE_*` aliases) env vars. stdout becomes a
   `<system-reminder>` block for the next LLM turn.

2. **Plugin hook** — a JavaScript module exporting `defineHook(...)`:
   ```ts
   // my-hook.mjs
   import { defineHook } from '@glm/code/sdk'
   export default defineHook({
     event: 'PostToolUse',
     matcher: 'Edit|Write',
     async run(ctx) {
       await ctx.notify(`Edit done: ${ctx.event.tool}`)
       if (someCondition) ctx.inject('<system-reminder>...follow-up...</system-reminder>')
     }
   })
   ```
   Wire via:
   ```jsonc
   "hooks": {
     "PostToolUse": [{ "hooks": [{ "type": "plugin", "package": "/abs/path/my-hook.mjs" }] }]
   }
   ```

## Events

All 31 events are listed in `@glm/code/sdk`'s `ALL_HOOK_EVENTS`. See the spec
§9.15 for taxonomy. Use `HookEventOf<'PostToolUse'>` to narrow `ctx.event`.

## Context API (`ctx.*`)

| Field | Purpose |
|---|---|
| `ctx.event` | discriminated payload (narrow on `ctx.event.event`) |
| `ctx.log` | pino logger |
| `ctx.state` | per-session KV (`read`/`write`/`delete`/`all(prefix)`) |
| `ctx.notify` | push notification via configured channels |
| `ctx.glm` | read-only runtime info: `sessionId`, `workerId`, `model`, `cwd`, `persistentMode` |
| `ctx.inject(text)` | inject a `<system-reminder>` block into the next LLM turn |
| `ctx.abort(reason)` | halt the chain + cancel the in-flight action (PreToolUse, UserPromptSubmit only) |

## Kill switches

- `DISABLE_GLM_HOOKS=1` — disables ALL hooks for the process
- `GLM_SKIP_HOOKS=name1,name2` — disables specific hooks by name

## Authoring tips

- Keep hooks fast — 30s hard timeout, but anything > 1s blocks turn latency
- Don't spawn heavy compute in PreToolUse — that synchronously gates the tool call
- Use `priority` to order — built-ins use 0-99, config uses 100, plugins use 200
- Per-turn budget: 5 invocations max per hook (configurable in v0.2); over-budget
  hooks auto-disable + emit a Notification

## Testing your hook

```bash
glm hook test PostToolUse --tool Edit
```

Prints the dispatch result + any reminder injection.
```

- [ ] **Step 4: SDK README (short, points at docs/hooks.md)**

`packages/core/src/sdk/README.md`:
```markdown
# @glm/code/sdk

Stable surface for hook & plugin authors. See [`docs/hooks.md`](../../../../docs/hooks.md) for the full authoring guide.
```

- [ ] **Step 5: Build to verify the subpath export resolves**

```bash
pnpm build
node -e "import('@glm/core/sdk').then(m => console.log(Object.keys(m).slice(0,5)))"
```

Expected: prints first 5 exported symbols.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/sdk packages/core/package.json docs/hooks.md
git commit -m "feat(sdk): public @glm/code/sdk surface + docs/hooks.md authoring guide"
```

---

## Task 14: Final integration — daemon + RPC + CLI smoke + coverage gate

**Files:**
- Modify: `packages/cli/src/commands/doctor.ts` (add hook health check)
- No new test files — runs the full suite

> **P5-Fix-5:** `doctor.ts` is **Modify** here (not Create). P1 creates the doctor command skeleton (per P1-Fix-2). P5 only extends it with a hook health probe; later plans (P10-Fix-8) extend it further.

- [ ] **Step 1: Doctor checks for HookManager**

Modify `packages/cli/src/commands/doctor.ts` — add a check that calls `rpcCall('hook.list')` and prints `✓ hooks: N registered, M enabled` or `✗ hooks: RPC error`.

```ts
// inside the existing doctor command's checks array:
{
  name: 'hooks',
  check: async () => {
    try {
      const rows = await rpcCall('hook.list') as Array<{ enabled: boolean }>
      return { ok: true, detail: `${rows.length} registered, ${rows.filter(r => r.enabled).length} enabled` }
    } catch (e) {
      return { ok: false, detail: (e as Error).message }
    }
  }
}
```

- [ ] **Step 2: Full smoke run**

```bash
pnpm build
export GLM_HOME=/tmp/glm-p5-smoke-$$
rm -rf $GLM_HOME
node packages/cli/dist/bin.js daemon start
node packages/cli/dist/bin.js doctor                          # expect: ✓ hooks: 31+ registered
node packages/cli/dist/bin.js hook list                       # expect: groups by event
node packages/cli/dist/bin.js hook test UserPromptSubmit --prompt "ralph please"  # expect: reminder activating /ralph
node packages/cli/dist/bin.js hook test PreToolUse --tool Task                    # expect: ran builtin:delegation-enforcer
node packages/cli/dist/bin.js hook disable builtin:keyword-detector   # expect: ✗ refused (builtin)
node packages/cli/dist/bin.js daemon stop
```

- [ ] **Step 3: Full test suite (unit + integration)**

```bash
pnpm vitest run
```

Expected: all P1 + P3 + P4 + P5 tests pass. P5 alone contributes:
- 2 events-types + 7 matcher + 4 loop-guard + 6 dispatcher + 5 command-runner + 2 plugin-runner + 4 system-reminder + 5 config-parser + 12 keyword-detector + 10 delegation + 3 persistent-stop = **60 unit tests**
- 3 command-hook + 2 plugin-hook + 4 keyword + 3 kill-switch = **12 integration tests**

- [ ] **Step 4: Coverage gate**

```bash
pnpm vitest run --coverage -- packages/core/src/hooks
```

Expected:
- `dispatcher.ts` > 90%
- `manager.ts` > 80% (some error paths only covered in integration)
- `keywords/*` > 90%
- `delegation/*` > 95%
- `sandbox/*` > 80%

If any < threshold, add targeted tests before final commit.

- [ ] **Step 5: Final commit**

```bash
git add packages/cli/src/commands/doctor.ts
git commit -m "feat(doctor): include hook registry health check"
```

---

## P5 Completion — Verification Checklist

Before claiming P5 done, run all of these and confirm output:

- [ ] **Build clean:** `pnpm build` → no errors
- [ ] **All tests pass:** `pnpm vitest run` → all green; P5 adds 60 unit + 12 integration tests
- [ ] **Coverage hits targets:** `pnpm vitest run --coverage` → see Task 14 Step 4
- [ ] **Event taxonomy exactly 31:** `node -e "import('@glm/core/sdk').then(m => console.log(m.ALL_HOOK_EVENTS.length))"` → `31`
- [ ] **Daemon registers all built-ins:**
  ```bash
  export GLM_HOME=/tmp/glm-p5-verify-$$
  node packages/cli/dist/bin.js daemon start
  node packages/cli/dist/bin.js hook list | grep -c builtin     # expect: 36+ (5 named + 31 trace recorders)
  ```
- [ ] **Keyword detector → injection works:**
  ```bash
  node packages/cli/dist/bin.js hook test UserPromptSubmit --prompt "please ralph this"
  # expect output contains "activating /ralph"
  ```
- [ ] **Delegation enforcer rewrites Task params:**
  ```bash
  node packages/cli/dist/bin.js hook test PreToolUse --tool Task
  # expect: r.ran contains "builtin:delegation-enforcer"
  ```
- [ ] **Persistent-stop fires only when both flags set:**
  ```bash
  # synthesize via hook.test isn't enough — covered by unit test instead
  pnpm vitest run packages/core/test/unit/hooks/persistent-stop.test.ts   # all 3 pass
  ```
- [ ] **Kill switches respected:**
  ```bash
  DISABLE_GLM_HOOKS=1 node packages/cli/dist/bin.js hook test UserPromptSubmit --prompt "ralph"
  # expect: ran=[] and empty reminder
  GLM_SKIP_HOOKS=builtin:keyword-detector node packages/cli/dist/bin.js hook test UserPromptSubmit --prompt "ralph"
  # expect: no /ralph activation in reminder
  ```
- [ ] **Command hook smoke (real prettier-like effect):**
  ```bash
  mkdir -p $GLM_HOME && echo '{"hooks":{"PostToolUse":[{"matcher":"Edit","hooks":[{"type":"command","command":"echo edited $CLAUDE_FILE > /tmp/glm-hook-evidence.txt"}]}]}}' > $GLM_HOME/settings.json
  node packages/cli/dist/bin.js daemon restart
  node packages/cli/dist/bin.js hook test PostToolUse --tool Edit
  cat /tmp/glm-hook-evidence.txt    # expect: "edited /tmp/x"
  ```
- [ ] **Settings cascade — disable persists to settings.local.json:**
  ```bash
  node packages/cli/dist/bin.js hook disable some-config-hook
  cat $GLM_HOME/settings.local.json | grep hookOverrides   # expect: {"some-config-hook": false}
  ```
- [ ] **No leaked subprocesses:** `ps -ef | grep '/bin/sh -c'` shows nothing related to glm hooks after stop.
- [ ] **Doctor reports hooks healthy:** `node packages/cli/dist/bin.js doctor` → `✓ hooks: 36 registered, 36 enabled`
- [ ] **P5-Fix-3 — worker termination uses `SubagentStop`, not `Stop`:**
  ```bash
  # Confirm no code in P5 emits `Stop` for worker termination — the session-level
  # Stop event is reserved for session ending. Worker terminations use SubagentStop.
  grep -nE "event:\s*['\"]Stop['\"]" packages/core/src/hooks/built-in/*.ts packages/core/src/workers/**/*.ts 2>/dev/null
  # expect: only matches inside persistent-stop.ts (StopEvent, hasPendingTodos/persistentMode shape)
  # NO match should reference workerId / status / durationMs
  ```

If anything above fails, fix before declaring P5 done.

---

## What P5 does NOT include (deferred to later P-plans)

These are intentionally out of scope for P5:

- **No real compactor** — `PreCompact` / `PostCompact` events emit and the preserve/restore built-ins write/read a state key, but the actual compaction logic (token-budget threshold, summary template, tail preservation) is **P7 (Memory & Context Engine)**.
- **No real notification bridges** — `ctx.notify()` is a no-op sink in P5. Telegram / Discord / macOS / Slack delivery is **P9 (Notifications)**.
- **No worker / subagent lifecycle wiring** — `SubagentStart` / `SubagentStop` / `WorkerAssigned` / `WorkerStalled` / `WorkerRecovered` are defined and dispatchable, but the actual emission points live in **P8 (Orchestrator + Sub-agent Fan-out)**.
- **No long-horizon `RunHeartbeat` / `RunBlocked` scheduling** — the events exist; the scheduler that emits them is **P10 (Long-Horizon + Checkpoint)**.
- **No PR / git-master integration** — `PRCreated` is defined; emission is **P10**.
- **No TTSR (Time-Traveling Streamed Rules)** — v0.2 per spec §9.20.
- **No bidirectional notification reply daemon** — v0.2 per spec §9.19.
- **No HUD / dashboard wiring** — `ctx` does not expose `hud` in P5 (spec mentions it as future); P11 (TUI) owns that.
- **No tmux integration** — `ctx.tmux` is mentioned in the spec example but is v0.2 per §9.22.
- **No real auto-disable persistence after loop-guard trip** — in-memory only; reloading the daemon re-enables the hook. P7 will persist the disable across restarts via settings.local.json once the audit log is in place.
