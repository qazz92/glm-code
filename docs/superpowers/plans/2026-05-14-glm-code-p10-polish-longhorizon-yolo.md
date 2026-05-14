# glm code — P10: Long-Horizon + Yolo + Notifications + Resilience + Workspace Tools + Doctor + Polish

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The final polish that makes `glm code` production-ready and worth shipping as v0.1. Wire the long-horizon scheduler (auto-promotion → checkpoint-every-step → graceful resume → human-readable journal → hourly distillation), the 3-tier Yolo policy (hard whitelist, audit log, auto-snapshot, `glm yolo doctor`), the v0.1 notify-only notification matrix (macOS / Discord / Slack / Telegram / email / generic webhook), the resilience hook bundle (preemptive compaction, todo preserver, session recovery, continuation enforcer, trace timeline, verification tier-selector), the workspace tools (`glm commit` / `/commit` agentic with hunk-split + changelog, `glm recipe`), the full `glm doctor` (runtime / install / API / bundled MCP / external MCP / LSP / CC compat / sessions / warnings / `--fix`), safe mode, crash report tooling with redaction, opt-in telemetry, universal config discovery v0.1, process recycling at boundaries, an end-to-end 8h mock long-horizon scenario, and the release polish (README, quickstart, CHANGELOG, license, npm publish prep).

**Architecture:** P10 is the integration layer. It assumes everything from P1-P9 is wired:
- P1 daemon + IPC + SQLite + sessions
- P2 Ink TUI + slash commands
- P3 built-in tools (Read/Edit/Bash/Grep/Glob/Task) + hashline edit
- P4 MCP host + bundled GLM MCP + Skill/Plugin/Hook loaders
- P5 Hook & event system (11+20 events) + plugin SDK
- P6 LLM Router + Anthropic/OpenAI providers + idempotency cache + quota tracker
- P7 Memory engine (cascade + ## Memories + compaction template + prompt cache)
- P8 Orchestrator + sub-agent fan-out + scheduler + session-worker child process
- P9 Built-in workflows (autopilot/ralph/ultrawork/team/plan/...) + 20 agent role catalog + keyword detector

P10 layers on top: it introduces **no new architecture primitives**, only completes the loop. The result is a coherent product: `glm` you can leave running for 8 hours, that survives crashes, that texts you when it needs you, that auto-commits its work, and that you can debug after the fact via trace timeline.

**Tech stack additions in P10 (only):**
- `node-notifier` (macOS notifications)
- `nodemailer` (SMTP for email channel)
- `node:zlib` zstd (crash report compression — falls back to gzip if zstd missing)
- `archiver` (tar bundle for crash report)
- No new heavy dependencies. Everything else is pure stdlib + already-installed.

**Acceptance criteria for P10 (v0.1 GA gate):**
- `glm "..." --auto` (or `/auto`) flips session into long-horizon mode with confirmation
- Plan estimates ≥ 20 steps OR ≥ 1h → auto-prompt for long-horizon
- After step 30 → silent auto-promotion (no prompt)
- Checkpoint commits every step; resume after `kill -9` daemon → next launch presents resume prompt with last checkpoint summary
- `journal.md` is updated on phase transition / hourly distillation / major decision; readable as a chronological story
- `glm "..." --yolo` + `/yolo` toggle yolo session-wide, hit 3-tier policy (TIER A always / TIER B workspace-auto / TIER C hard-blocked)
- TIER C hard whitelist (push to main, rm -rf, drop database, npm publish, workspace-bypass write, settings hard-whitelist, MCP/plugin install, API key change, daemon restart) ALWAYS confirms even under yolo
- Yolo audit log captures every auto-approved decision: ts / decision / tool / args / tier / step / reasoning
- Yolo auto-snapshot stashes diff each step → `glm yolo revert <step>` restores
- `glm yolo doctor` validates: container? clean git tree? notification channel configured? quota headroom?
- `glm notify test <channel>` round-trips: macOS / Discord webhook / Slack webhook / Telegram (send-only) / email SMTP / generic webhook
- Preemptive compactor monitors token usage, kicks compaction at 80% before hard limit; no user-visible latency
- Compaction todo preserver guarantees `## Progress` section of compaction template captures ALL pending todos (verified by snapshot test)
- Session recovery hooks auto-fix: missing tool result / thinking-block mismatch / empty messages / JSON parse fail / context-limit single response
- Continuation enforcer (long-horizon only): agent goes idle with todo pending → auto-inject "continue" prompt
- `glm trace timeline <session>` prints chronological event table from `events` table (CLI-only per P10-Fix-9; `/trace` slash is owned by P9 workflow — see manifest §0.7. If a slash is needed for the timeline view, use `/trace-timeline [sessionId]`.)
- Verification tier-selector picks GLM-4.5-Air / GLM-5-Turbo / GLM-5.1 based on risk score
- `glm commit` (and `/commit`) spawns sub-agent that calls git-overview / git-file-diff / git-hunk → conventional commit msg + hunk-staging split + CHANGELOG entry; pre-commit hook integration retries on failure with analysis
- `glm recipe` auto-detects npm/cargo/just/make/task → unified `glm recipe <name>` interface
- Universal config discovery on first launch scans ~/.claude (full), ~/.cursor/~/.windsurf/~/.codex/~/.cline/~/.copilot (stub detection) → import prompt
- `glm doctor` runs full check (runtime / install / API / bundled MCP / external MCP / LSP / CC compat / active sessions / warnings); `glm doctor --fix` applies safe repairs
- `glm --safe` boots ephemeral session with plugins/external MCP/hooks disabled
- FATAL error path generates `~/.glm/crash-reports/<ts>.tar.zst` with redacted bundle; `glm bug report` interactive flow
- Opt-in telemetry: `glm config telemetry enable` only sends anonymous counts/errors/version, never content
- Distillation worker (long-horizon) runs hourly, summarises last hour into AGENTS.md `## Memories` (dedup + cap)
- Process recycling at 1h or 1000-step boundary (extends P8 boundaries)
- End-to-end 8h mock long-horizon scenario test passes (`vitest -c vitest.long-horizon.config.ts`)
- README / QUICKSTART / CHANGELOG / LICENSE / version bump to `0.1.0-beta.1` / npm publish dry run OK

---

## File Structure (incremental — new files only)

```
packages/
├── core/
│   └── src/
│       ├── longhorizon/
│       │   ├── promotion.ts          # auto-promotion decision logic
│       │   ├── checkpoint-loop.ts    # every-step checkpoint commit
│       │   ├── resume.ts             # graceful resume after crash
│       │   ├── journal.ts            # human-readable progress log
│       │   ├── distillation.ts       # hourly summarise → AGENTS.md
│       │   ├── continuation-enforcer.ts  # idle-with-todo → continue
│       │   └── index.ts
│       ├── yolo/
│       │   ├── policy.ts             # 3-tier classifier
│       │   ├── whitelist.ts          # TIER C hard whitelist
│       │   ├── audit.ts              # yolo-audit.log writer
│       │   ├── snapshot.ts           # auto git stash per step
│       │   ├── revert.ts             # restore from step snapshot
│       │   ├── caps.ts               # time/step/token/quota caps
│       │   ├── doctor.ts             # `glm yolo doctor`
│       │   └── index.ts
│       ├── notifications/
│       │   ├── channels/
│       │   │   ├── macos.ts          # node-notifier wrapper
│       │   │   ├── discord.ts        # webhook POST
│       │   │   ├── slack.ts          # webhook POST
│       │   │   ├── telegram.ts       # bot sendMessage (send-only v0.1)
│       │   │   ├── email.ts          # SMTP via nodemailer
│       │   │   └── webhook.ts        # generic POST
│       │   ├── dispatcher.ts         # event → channels mapping
│       │   ├── config.ts             # zod schema for notifications config
│       │   ├── reply-daemon.stub.ts  # v0.2 placeholder
│       │   └── index.ts
│       ├── resilience/
│       │   ├── preemptive-compaction.ts
│       │   ├── todo-preserver.ts
│       │   ├── session-recovery.ts
│       │   ├── trace-timeline.ts
│       │   ├── verification-tier.ts
│       │   └── index.ts
│       ├── workspace/
│       │   ├── commit/
│       │   │   ├── agent.ts          # commit sub-agent driver
│       │   │   ├── git-overview.ts   # built-in helper tool
│       │   │   ├── git-file-diff.ts  # built-in helper tool
│       │   │   ├── git-hunk.ts       # hunk-level stager
│       │   │   ├── conventional.ts   # validator + filler/meta blocklist
│       │   │   ├── changelog.ts      # CHANGELOG.md auto-entry
│       │   │   ├── pre-commit.ts     # hook integration + retry
│       │   │   └── index.ts
│       │   ├── recipe/
│       │   │   ├── detect.ts         # npm/cargo/just/make/task probe
│       │   │   ├── run.ts            # unified runner
│       │   │   └── index.ts
│       │   └── config-discovery/
│       │       ├── scanners.ts       # cursor/windsurf/codex/cline/copilot/vscode
│       │       ├── import-claude.ts  # full CC import (v0.1)
│       │       ├── prompt.ts         # first-run prompt
│       │       └── index.ts
│       ├── doctor/
│       │   ├── checks/
│       │   │   ├── runtime.ts        # node version, OS, perms
│       │   │   ├── install.ts        # ~/.glm tree, perms, binaries
│       │   │   ├── api.ts            # GLM API reachable + auth
│       │   │   ├── bundled-mcp.ts    # 4 GLM MCP servers
│       │   │   ├── external-mcp.ts   # user-configured MCPs
│       │   │   ├── lsp.ts            # LSP servers present
│       │   │   ├── compat.ts         # CC asset compat
│       │   │   ├── sessions.ts       # active session health
│       │   │   └── warnings.ts       # quota / disk / heap
│       │   ├── runner.ts             # orchestrates checks
│       │   ├── fix.ts                # --fix auto-repair
│       │   └── index.ts
│       ├── safe-mode/
│       │   ├── boot.ts               # --safe ephemeral boot
│       │   └── index.ts
│       ├── crash-report/
│       │   ├── bundle.ts             # tar.zst builder
│       │   ├── redact.ts             # secret stripping
│       │   ├── interactive.ts        # `glm bug report` flow
│       │   └── index.ts
│       ├── telemetry/
│       │   ├── client.ts             # opt-in send
│       │   ├── schema.ts             # what we send (zod)
│       │   └── index.ts
│       └── recycling/
│           └── boundary.ts           # 1h / 1000-step gate (extends P8)
└── cli/
    └── src/
        └── commands/
            ├── auto.ts               # `glm auto "..."`
            ├── yolo.ts               # `glm yolo doctor|revert`
            ├── notify.ts             # `glm notify test|config`
            ├── trace.ts              # `glm trace timeline`
            ├── commit.ts             # `glm commit`
            ├── recipe.ts             # `glm recipe`
            ├── doctor.ts             # extended from P1 skeleton
            ├── bug.ts                # `glm bug report`
            ├── safe.ts               # `glm --safe` entry
            └── config-telemetry.ts   # `glm config telemetry ...`

docs/
├── README.md                          # rewritten for v0.1
├── QUICKSTART.md                      # 5-min walkthrough
├── CHANGELOG.md                       # 0.1.0-beta.1 first entry
└── LICENSE                            # MIT

scripts/
└── publish-dry-run.sh                 # npm publish --dry-run gate

test/
├── e2e/
│   └── long-horizon-8h-mock.test.ts   # accelerated 8h scenario
└── compat/
    └── full-cc-import.test.ts         # full CC asset import
```

---

## Task 1: Long-horizon promotion logic

**Files:**
- Create: `packages/core/src/longhorizon/promotion.ts`
- Test: `packages/core/test/unit/longhorizon-promotion.test.ts`
- Modify: `packages/core/src/session/manager.ts` (P1 + P8) to invoke promoter

- [ ] **Step 1: Define promotion signals**

`packages/core/src/longhorizon/promotion.ts`:
```ts
import type { Logger } from '../log'

export type PromotionTrigger =
  | { kind: 'explicit-flag' }            // --auto / glm auto "..."
  | { kind: 'explicit-slash' }            // /auto inside TUI
  | { kind: 'plan-estimate'; steps: number; minutes: number }   // ≥ 20 steps OR ≥ 60min
  | { kind: 'step-threshold'; currentStep: number }              // ≥ 30
  | { kind: 'client-detached' }                                  // user dropped tui
  | { kind: 'never' }

export interface PromotionDecision {
  promote: boolean
  requireUserConfirm: boolean
  trigger: PromotionTrigger
  reason: string
}

export interface PromoterInputs {
  isLongHorizonAlready: boolean
  flagAuto: boolean
  slashAutoInvoked: boolean
  planEstimateSteps?: number
  planEstimateMinutes?: number
  currentStep: number
  clientAttached: boolean
}

export function decidePromotion(i: PromoterInputs): PromotionDecision {
  if (i.isLongHorizonAlready) {
    return { promote: false, requireUserConfirm: false, trigger: { kind: 'never' }, reason: 'already in long-horizon' }
  }
  if (i.flagAuto) {
    return { promote: true, requireUserConfirm: false, trigger: { kind: 'explicit-flag' }, reason: '--auto flag' }
  }
  if (i.slashAutoInvoked) {
    return { promote: true, requireUserConfirm: false, trigger: { kind: 'explicit-slash' }, reason: '/auto slash command' }
  }
  if (i.currentStep >= 30) {
    return {
      promote: true,
      requireUserConfirm: false,
      trigger: { kind: 'step-threshold', currentStep: i.currentStep },
      reason: `silent promotion at step ${i.currentStep} (≥ 30)`
    }
  }
  if (!i.clientAttached) {
    return {
      promote: true,
      requireUserConfirm: false,
      trigger: { kind: 'client-detached' },
      reason: 'client detached — auto-promoted'
    }
  }
  const steps = i.planEstimateSteps ?? 0
  const mins  = i.planEstimateMinutes ?? 0
  if (steps >= 20 || mins >= 60) {
    return {
      promote: true,
      requireUserConfirm: true,
      trigger: { kind: 'plan-estimate', steps, minutes: mins },
      reason: `plan ≈ ${steps} steps / ${mins}min (≥ threshold)`
    }
  }
  return { promote: false, requireUserConfirm: false, trigger: { kind: 'never' }, reason: 'no signal' }
}
```

- [ ] **Step 2: Write unit test**

`packages/core/test/unit/longhorizon-promotion.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { decidePromotion } from '../../src/longhorizon/promotion'

describe('decidePromotion', () => {
  test('--auto flag → silent promote', () => {
    const d = decidePromotion({
      isLongHorizonAlready: false, flagAuto: true, slashAutoInvoked: false,
      currentStep: 1, clientAttached: true
    })
    expect(d.promote).toBe(true)
    expect(d.requireUserConfirm).toBe(false)
    expect(d.trigger.kind).toBe('explicit-flag')
  })

  test('step ≥ 30 → silent promote even if attached', () => {
    const d = decidePromotion({
      isLongHorizonAlready: false, flagAuto: false, slashAutoInvoked: false,
      currentStep: 30, clientAttached: true
    })
    expect(d.promote).toBe(true)
    expect(d.requireUserConfirm).toBe(false)
  })

  test('plan estimate ≥ 20 steps → confirm required', () => {
    const d = decidePromotion({
      isLongHorizonAlready: false, flagAuto: false, slashAutoInvoked: false,
      planEstimateSteps: 25, currentStep: 1, clientAttached: true
    })
    expect(d.promote).toBe(true)
    expect(d.requireUserConfirm).toBe(true)
  })

  test('client detached → silent promote', () => {
    const d = decidePromotion({
      isLongHorizonAlready: false, flagAuto: false, slashAutoInvoked: false,
      currentStep: 5, clientAttached: false
    })
    expect(d.promote).toBe(true)
    expect(d.trigger.kind).toBe('client-detached')
  })

  test('no signal → stays short-horizon', () => {
    const d = decidePromotion({
      isLongHorizonAlready: false, flagAuto: false, slashAutoInvoked: false,
      currentStep: 2, clientAttached: true
    })
    expect(d.promote).toBe(false)
  })

  test('already long-horizon → never re-promotes', () => {
    const d = decidePromotion({
      isLongHorizonAlready: true, flagAuto: true, slashAutoInvoked: true,
      currentStep: 50, clientAttached: false
    })
    expect(d.promote).toBe(false)
  })
})
```

- [ ] **Step 3: Run test — PASS**

```bash
pnpm vitest run packages/core/test/unit/longhorizon-promotion.test.ts
```

- [ ] **Step 4: Wire promoter into SessionManager**

In `packages/core/src/session/manager.ts` (extending P8), add at every step boundary:

```ts
import { decidePromotion } from '../longhorizon/promotion'

async maybePromoteLongHorizon(sid: SessionId): Promise<void> {
  const s = this.repo.get(sid)!
  if (s.mode === 'long-horizon') return
  const decision = decidePromotion({
    isLongHorizonAlready: false,
    flagAuto: s.flagAuto,
    slashAutoInvoked: s.slashAutoInvoked,
    planEstimateSteps: s.planEstimate?.steps,
    planEstimateMinutes: s.planEstimate?.minutes,
    currentStep: s.currentStep,
    clientAttached: this.clientRegistry.isAttached(sid)
  })
  if (!decision.promote) return
  if (decision.requireUserConfirm) {
    const ok = await this.askUserConfirm(sid, `Promote to long-horizon? (${decision.reason})`)
    if (!ok) return
  }
  await this.promoteToLongHorizon(sid, decision.trigger)
}
```

The `promoteToLongHorizon` body comes in Task 2.

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(longhorizon): auto-promotion decision logic with 5 triggers"
```

---

## Task 2: Long-horizon checkpoint loop (every step)

**Files:**
- Create: `packages/core/src/longhorizon/checkpoint-loop.ts`
- Test: `packages/core/test/integration/checkpoint-every-step.test.ts`
- Modify: `packages/core/src/storage/migrations/009_longhorizon.sql`

- [ ] **Step 1: Add migration for `session.mode` + `checkpoints` extension**

`packages/core/src/storage/migrations/009_longhorizon.sql`:
```sql
ALTER TABLE sessions ADD COLUMN mode TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE sessions ADD COLUMN promoted_at TEXT;
ALTER TABLE sessions ADD COLUMN promoted_trigger TEXT;

-- `checkpoints` table is created by P8's `004_orchestrator.sql` (per manifest §0.2 + P8-Fix-1).
-- P10 only ALTERs it here to add long-horizon-specific columns.
ALTER TABLE checkpoints ADD COLUMN phase TEXT;
ALTER TABLE checkpoints ADD COLUMN tokens_used INTEGER DEFAULT 0;
ALTER TABLE checkpoints ADD COLUMN files_dirty TEXT;   -- JSON array

CREATE INDEX IF NOT EXISTS idx_sessions_mode ON sessions(mode, updated_at);
CREATE INDEX IF NOT EXISTS idx_checkpoints_session_step ON checkpoints(session_id, step DESC);
```

- [ ] **Step 2: Implement checkpoint-loop**

`packages/core/src/longhorizon/checkpoint-loop.ts`:
```ts
import type { Database } from 'better-sqlite3'
import type { Logger } from '../log'
import type { SessionId } from '@glm/shared'

export interface CheckpointSnapshot {
  step: number
  phase: 'plan' | 'scaffold' | 'execute' | 'verify' | 'test' | 'review'
  orchestratorState: unknown
  activeWorkers: Array<{ id: string; model: string; status: string }>
  contextState: {
    messagesHeadId: string | null
    compactSummaryId: string | null
    memoryLoaded: string[]
    tokensUsed: number
  }
  rateLimits: Record<string, number>
  filesDirty: string[]
}

export class CheckpointLoop {
  constructor(private db: Database, private log: Logger) {}

  commit(sid: SessionId, snap: CheckpointSnapshot): string {
    const id = `${sid}-${String(snap.step).padStart(5, '0')}`
    const ts = new Date().toISOString()
    const tx = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO checkpoints(id, session_id, step, ts, phase, tokens_used, files_dirty, payload)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, sid, snap.step, ts, snap.phase, snap.contextState.tokensUsed,
        JSON.stringify(snap.filesDirty),
        JSON.stringify({
          orchestratorState: snap.orchestratorState,
          activeWorkers: snap.activeWorkers,
          contextState: snap.contextState,
          rateLimits: snap.rateLimits
        })
      )
      // update "latest" pointer in meta table
      this.db.prepare(`
        INSERT INTO meta(key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value
      `).run(`checkpoint:latest:${sid}`, id)
    })
    tx()
    this.log.debug({ sid, step: snap.step, id }, 'checkpoint committed')
    return id
  }

  latest(sid: SessionId): { id: string; payload: CheckpointSnapshot } | null {
    const id = (this.db.prepare(`SELECT value FROM meta WHERE key=?`).get(`checkpoint:latest:${sid}`) as { value?: string } | undefined)?.value
    if (!id) return null
    const row = this.db.prepare(`SELECT * FROM checkpoints WHERE id=?`).get(id) as Record<string, unknown> | undefined
    if (!row) return null
    const parsed = JSON.parse(row.payload as string)
    return {
      id,
      payload: {
        step: row.step as number,
        phase: row.phase as CheckpointSnapshot['phase'],
        orchestratorState: parsed.orchestratorState,
        activeWorkers: parsed.activeWorkers,
        contextState: parsed.contextState,
        rateLimits: parsed.rateLimits,
        filesDirty: JSON.parse((row.files_dirty as string) ?? '[]'),
      }
    }
  }

  listSince(sid: SessionId, sinceStep: number): Array<{ id: string; step: number; phase: string; ts: string }> {
    return this.db.prepare(`
      SELECT id, step, phase, ts FROM checkpoints
      WHERE session_id=? AND step > ?
      ORDER BY step ASC
    `).all(sid, sinceStep) as Array<{ id: string; step: number; phase: string; ts: string }>
  }
}
```

- [ ] **Step 3: Integration test — checkpoint every step**

`packages/core/test/integration/checkpoint-every-step.test.ts`:
```ts
import { afterEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { openDb, runMigrations } from '../../src/storage'
import { CheckpointLoop } from '../../src/longhorizon/checkpoint-loop'
import { createLogger } from '../../src/log'

let tmp: string
afterEach(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }) })

describe('CheckpointLoop', () => {
  test('every step writes a checkpoint and latest pointer advances', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-cp-'))
    const db = openDb(path.join(tmp, 's.db'))
    runMigrations(db)
    db.prepare(`INSERT INTO sessions(id,created_at,updated_at,cwd,worktree,active,mode) VALUES (?,?,?,?,?,1,'long-horizon')`)
      .run('S1', new Date().toISOString(), new Date().toISOString(), '/tmp', '/tmp')
    const loop = new CheckpointLoop(db, createLogger('test'))
    for (let i = 1; i <= 5; i++) {
      loop.commit('S1', {
        step: i, phase: 'execute',
        orchestratorState: { step: i },
        activeWorkers: [],
        contextState: { messagesHeadId: `m${i}`, compactSummaryId: null, memoryLoaded: [], tokensUsed: 1000 * i },
        rateLimits: { 'GLM-5.1': 10 },
        filesDirty: []
      })
    }
    const latest = loop.latest('S1')
    expect(latest!.payload.step).toBe(5)
    expect(loop.listSince('S1', 0)).toHaveLength(5)
  })
})
```

- [ ] **Step 4: Run — PASS**

```bash
pnpm vitest run packages/core/test/integration/checkpoint-every-step.test.ts
```

- [ ] **Step 5: Wire into session step lifecycle**

In `packages/core/src/session/worker.ts` (P8), at the end of every step:

```ts
async onStepComplete(snap: CheckpointSnapshot): Promise<void> {
  if (this.session.mode === 'long-horizon') {
    this.checkpointLoop.commit(this.session.id, snap)
    await this.journal.recordPhase(this.session.id, snap)   // Task 4
    await this.maybeKickDistillation(snap.step)              // Task 5
  }
  await this.maybeRecycleBoundary(snap.step)                 // Task 22
}
```

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat(longhorizon): per-step CheckpointLoop with latest pointer + tests"
```

---

## Task 2.5: Wire P10 daemon RPC handlers via LoaderHub (P10-Fix-2 / P10-Fix-11)

**Files:**
- Create: `packages/core/src/longhorizon/index.ts` (subsystem entrypoint — appends to any per-subsystem inits already present)
- Create: `packages/core/src/yolo/index.ts`
- Create: `packages/core/src/notifications/index.ts`
- Create: `packages/core/src/resilience/index.ts`
- Create: `packages/core/src/workspace/commit/index.ts`
- Create: `packages/core/src/workspace/recipe/index.ts`
- Create: `packages/core/src/workspace/config-discovery/index.ts`
- Create: `packages/core/src/crash-report/index.ts`
- Test: `packages/core/test/integration/p10-rpc-wiring.test.ts`

Per manifest §0.9, P10 never edits `packages/core/src/daemon/daemon.ts` directly. All P10 subsystems register their RPC handlers + bootstrap hooks via `LoaderHub.registerSubsystem(name, init)`. P1's `Daemon.start()` runs every subsystem init once during `LoaderHub.runAll(this)` after migrations.

Each subsystem module exports a `makeXxxHandlers(daemon)` factory that returns `Record<rpcMethod, handler>`. Task 2.5 is the single registration site; the factories themselves live in the tasks that own each surface (yolo in Tasks 7-10, notifications in Tasks 11-12, resilience in Tasks 13-15, commit in Task 16, recipe in Task 17, config-discovery in Task 18, crash-report/bug in Task 20).

- [ ] **Step 1: Subsystem registration entrypoint**

`packages/core/src/longhorizon/index.ts` (the canonical P10 subsystem hub):

```ts
import { LoaderHub } from '../daemon/loader-hub'
import { makeYoloHandlers }          from '../yolo'
import { makeNotifyHandlers }        from '../notifications'
import { makeTraceHandlers }         from '../resilience'              // Task 15 exports `makeTraceHandlers`
import { makeCommitHandlers }        from '../workspace/commit'
import { makeRecipeHandlers }        from '../workspace/recipe'
import { makeBugHandlers }           from '../crash-report'            // Task 20 exports `makeBugHandlers`
import { makeConfigHandlers }        from '../workspace/config-discovery'
import { makeLonghorizonHandlers }   from './handlers'                  // exports resume.candidates / resume.apply / longhorizon.start / longhorizon.promote

LoaderHub.registerSubsystem('longhorizon', async (daemon) => {
  for (const [n,h] of Object.entries(makeLonghorizonHandlers(daemon))) daemon.rpc.on(n, h)
  for (const [n,h] of Object.entries(makeYoloHandlers(daemon)))        daemon.rpc.on(n, h)
  for (const [n,h] of Object.entries(makeNotifyHandlers(daemon)))      daemon.rpc.on(n, h)
  for (const [n,h] of Object.entries(makeTraceHandlers(daemon)))       daemon.rpc.on(n, h)
  for (const [n,h] of Object.entries(makeCommitHandlers(daemon)))      daemon.rpc.on(n, h)
  for (const [n,h] of Object.entries(makeRecipeHandlers(daemon)))      daemon.rpc.on(n, h)
  for (const [n,h] of Object.entries(makeBugHandlers(daemon)))         daemon.rpc.on(n, h)
  for (const [n,h] of Object.entries(makeConfigHandlers(daemon)))      daemon.rpc.on(n, h)
})
```

Where each `makeXxxHandlers(daemon)` returns a flat record keyed by RPC method name (per manifest §0.1: `daemon.rpc.on(method, handler)` is the only registration API):

| Factory | Methods (examples) | Defined in |
|---------|--------------------|------------|
| `makeLonghorizonHandlers` | `longhorizon.resume.candidates`, `longhorizon.resume.apply`, `longhorizon.start`, `longhorizon.promote` | this file's sibling `handlers.ts` (Tasks 1-6) |
| `makeYoloHandlers` | `yolo.classify`, `yolo.doctor`, `yolo.snapshot.list`, `yolo.revert`, `yolo.audit.tail` | Task 9/10 |
| `makeNotifyHandlers` | `notify.test`, `notify.config.get`, `notify.config.set`, `notify.emit` | Task 11/12 |
| `makeTraceHandlers` | `trace.timeline` (CLI-only, see P10-Fix-9), `trace.events` | Task 15 |
| `makeCommitHandlers` | `commit.run`, `commit.preview`, `commit.changelog` | Task 16 |
| `makeRecipeHandlers` | `recipe.detect`, `recipe.list`, `recipe.run` | Task 17 |
| `makeBugHandlers` | `bug.report.build`, `bug.report.redact-preview` | Task 20 |
| `makeConfigHandlers` | `config.discovery.scan`, `config.discovery.import` | Task 18 |

- [ ] **Step 2: Integration test — all P10 RPCs reachable on a booted daemon**

`packages/core/test/integration/p10-rpc-wiring.test.ts`:
```ts
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { spawnDaemonProcess } from './_helper'

let d: Awaited<ReturnType<typeof spawnDaemonProcess>>
beforeAll(async () => { d = await spawnDaemonProcess({}) })
afterAll(async () => { await d.shutdown() })

const REQUIRED = [
  'longhorizon.resume.candidates', 'longhorizon.resume.apply', 'longhorizon.start',
  'yolo.doctor', 'yolo.snapshot.list', 'yolo.revert',
  'notify.test', 'notify.config.get',
  'trace.timeline',
  'commit.run', 'commit.preview',
  'recipe.detect', 'recipe.run',
  'bug.report.build',
  'config.discovery.scan',
]

describe('P10 RPC wiring via LoaderHub (P10-Fix-2)', () => {
  for (const method of REQUIRED) {
    test(`daemon advertises ${method}`, async () => {
      const has = await d.client.call('rpc.has', { method }) as boolean
      expect(has).toBe(true)
    })
  }
})
```

- [ ] **Step 3: Run — PASS**

```bash
pnpm vitest run packages/core/test/integration/p10-rpc-wiring.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add packages/core
git commit -m "feat(p10): wire all P10 RPC handlers (longhorizon/yolo/notify/trace/commit/recipe/bug/config) via LoaderHub"
```

---

## Task 3: Graceful resume after crash with confirmation prompt

**Files:**
- Create: `packages/core/src/longhorizon/resume.ts`
- Test: `packages/core/test/integration/resume-after-crash.test.ts`
- Wire via LoaderHub (per §0.9) — see Task 2.5 (P10-Fix-2); no direct edit to `packages/core/src/daemon/daemon.ts`

- [ ] **Step 1: Resume planner**

`packages/core/src/longhorizon/resume.ts`:
```ts
import type { Database } from 'better-sqlite3'
import type { Logger } from '../log'
import type { CheckpointLoop } from './checkpoint-loop'
import type { SessionId } from '@glm/shared'

export interface ResumeCandidate {
  sessionId: SessionId
  cwd: string
  lastStep: number
  lastPhase: string
  lastTs: string
  tokensUsed: number
  filesDirty: string[]
  summary: string  // short human-friendly summary derived from journal tail
}

export interface ResumeResolution {
  action: 'resume' | 'discard' | 'archive' | 'view-journal'
  sessionId: SessionId
}

export class ResumePlanner {
  constructor(private db: Database, private loop: CheckpointLoop, private log: Logger) {}

  candidates(): ResumeCandidate[] {
    const rows = this.db.prepare(`
      SELECT id, cwd, updated_at FROM sessions
      WHERE active = 1 AND mode = 'long-horizon'
      ORDER BY updated_at DESC
    `).all() as Array<{ id: string; cwd: string; updated_at: string }>
    const out: ResumeCandidate[] = []
    for (const r of rows) {
      const cp = this.loop.latest(r.id)
      if (!cp) continue
      out.push({
        sessionId: r.id,
        cwd: r.cwd,
        lastStep: cp.payload.step,
        lastPhase: cp.payload.phase,
        lastTs: r.updated_at,
        tokensUsed: cp.payload.contextState.tokensUsed,
        filesDirty: cp.payload.filesDirty,
        summary: this.deriveJournalTail(r.id)
      })
    }
    return out
  }

  private deriveJournalTail(sid: SessionId): string {
    // read last 6 lines of journal.md if present
    try {
      const row = this.db.prepare(`
        SELECT data FROM events
        WHERE session_id=? AND topic='journal.append'
        ORDER BY id DESC LIMIT 1
      `).get(sid) as { data?: string } | undefined
      if (!row?.data) return '(no journal yet)'
      const text = JSON.parse(row.data).text as string
      return text.split('\n').slice(0, 3).join(' / ')
    } catch { return '(journal unreadable)' }
  }

  /**
   * Apply user's resolution. resume = re-spawn session-worker from checkpoint.
   * The actual worker re-spawn lives in session/manager.ts; this method only
   * mutates DB state + emits the right event so it can be observed in tests.
   */
  apply(res: ResumeResolution): void {
    switch (res.action) {
      case 'resume':
        this.db.prepare(`UPDATE sessions SET active=1, updated_at=? WHERE id=?`).run(new Date().toISOString(), res.sessionId)
        this.emit(res.sessionId, 'resume.requested')
        break
      case 'discard':
        this.db.prepare(`UPDATE sessions SET active=0, updated_at=? WHERE id=?`).run(new Date().toISOString(), res.sessionId)
        this.emit(res.sessionId, 'resume.discarded')
        break
      case 'archive':
        this.db.prepare(`UPDATE sessions SET active=0, mode='archived', updated_at=? WHERE id=?`)
          .run(new Date().toISOString(), res.sessionId)
        this.emit(res.sessionId, 'resume.archived')
        break
      case 'view-journal':
        this.emit(res.sessionId, 'resume.view-journal')
        break
    }
  }

  private emit(sid: SessionId, topic: string): void {
    this.db.prepare(`INSERT INTO events(ts, session_id, topic, data) VALUES (?, ?, ?, ?)`).run(
      new Date().toISOString(), sid, topic, JSON.stringify({})
    )
  }
}
```

- [ ] **Step 2: Integration test**

`packages/core/test/integration/resume-after-crash.test.ts`:
```ts
import { afterEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { openDb, runMigrations } from '../../src/storage'
import { CheckpointLoop } from '../../src/longhorizon/checkpoint-loop'
import { ResumePlanner } from '../../src/longhorizon/resume'
import { createLogger } from '../../src/log'

let tmp: string
afterEach(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }) })

describe('ResumePlanner', () => {
  test('finds long-horizon candidate with last checkpoint', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-res-'))
    const db = openDb(path.join(tmp, 's.db'))
    runMigrations(db)
    const log = createLogger('test')
    db.prepare(`INSERT INTO sessions(id,created_at,updated_at,cwd,worktree,active,mode)
                VALUES('S1',?,?,'/p','/p',1,'long-horizon')`).run(new Date().toISOString(), new Date().toISOString())
    const loop = new CheckpointLoop(db, log)
    loop.commit('S1', {
      step: 17, phase: 'execute', orchestratorState: {}, activeWorkers: [],
      contextState: { messagesHeadId: 'm17', compactSummaryId: null, memoryLoaded: [], tokensUsed: 42000 },
      rateLimits: {}, filesDirty: ['src/a.ts']
    })
    const planner = new ResumePlanner(db, loop, log)
    const cands = planner.candidates()
    expect(cands).toHaveLength(1)
    expect(cands[0]!.lastStep).toBe(17)
  })

  test('apply(resume) keeps session active, apply(discard) deactivates', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-res-'))
    const db = openDb(path.join(tmp, 's.db'))
    runMigrations(db)
    const log = createLogger('test')
    db.prepare(`INSERT INTO sessions(id,created_at,updated_at,cwd,worktree,active,mode)
                VALUES('S1',?,?,'/p','/p',1,'long-horizon')`).run(new Date().toISOString(), new Date().toISOString())
    const planner = new ResumePlanner(db, new CheckpointLoop(db, log), log)
    planner.apply({ action: 'discard', sessionId: 'S1' })
    const row = db.prepare(`SELECT active FROM sessions WHERE id='S1'`).get() as { active: number }
    expect(row.active).toBe(0)
  })
})
```

- [ ] **Step 3: Run — PASS**

```bash
pnpm vitest run packages/core/test/integration/resume-after-crash.test.ts
```

- [ ] **Step 4: Wire resume prompt via LoaderHub (P10-Fix-2 / §0.9)**

P10 does NOT directly edit `packages/core/src/daemon/daemon.ts`. The longhorizon resume planner is registered as a daemon subsystem and runs once during `LoaderHub.runAll(this)` (invoked by P1's `Daemon.start()` after `runMigrations(db)`).

`packages/core/src/longhorizon/index.ts` (subsystem registration; see consolidated Task 2.5 for the full multi-namespace registration):

```ts
import { LoaderHub } from '../daemon/loader-hub'
import { ResumePlanner } from './resume'

LoaderHub.registerSubsystem('longhorizon.resume', async (daemon) => {
  const planner = new ResumePlanner(daemon.db, daemon.checkpointLoop, daemon.log)
  const candidates = planner.candidates()
  if (candidates.length > 0) {
    daemon.log.info({ count: candidates.length }, 'long-horizon resume candidates')
    // emit event so any attached TUI / CLI client can render the prompt
    daemon.events.emit('resume.candidates', candidates)
  }
  daemon.resumePlanner = planner   // exposed for RPC handlers registered by Task 2.5
})
```

CLI prompt rendering lives in `packages/cli/src/commands/auto.ts` (Task 21).

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(longhorizon): ResumePlanner with candidate detection + apply resolution"
```

---

## Task 4: Journal — human-readable progress log

**Files:**
- Create: `packages/core/src/longhorizon/journal.ts`
- Test: `packages/core/test/unit/journal.test.ts`

- [ ] **Step 1: Journal writer**

`packages/core/src/longhorizon/journal.ts`:
```ts
import { appendFileSync, mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import type { Logger } from '../log'
import type { SessionId } from '@glm/shared'

export type JournalEntryKind = 'phase' | 'distillation' | 'decision' | 'hourly' | 'note'

export interface JournalEntry {
  kind: JournalEntryKind
  ts: string                  // ISO
  step?: number
  phase?: string
  text: string
}

export class Journal {
  constructor(private sessionsDir: string, private log: Logger) {}

  private file(sid: SessionId): string {
    return join(this.sessionsDir, sid, 'journal.md')
  }

  ensureHeader(sid: SessionId, initialTask: string): void {
    const f = this.file(sid)
    if (existsSync(f)) return
    mkdirSync(dirname(f), { recursive: true })
    const head = [
      `# Journal — session ${sid}`,
      ``,
      `**Started:** ${new Date().toISOString()}`,
      `**Initial task:** ${initialTask}`,
      ``,
      `---`,
      ``
    ].join('\n')
    writeFileSync(f, head, { mode: 0o644 })
  }

  append(sid: SessionId, entry: JournalEntry): void {
    const f = this.file(sid)
    if (!existsSync(f)) this.ensureHeader(sid, '(unknown)')
    const icon = ({
      phase: '▶', distillation: '⌬', decision: '◆', hourly: '⏱', note: '·'
    } as const)[entry.kind]
    const head = entry.step != null && entry.phase
      ? `## ${icon} step ${entry.step} · ${entry.phase} · ${entry.ts}`
      : `## ${icon} ${entry.kind} · ${entry.ts}`
    const body = entry.text.trim()
    appendFileSync(f, `${head}\n\n${body}\n\n`)
  }

  recordPhase(sid: SessionId, snap: { step: number; phase: string; tokensUsed: number; filesDirty: string[] }): void {
    this.append(sid, {
      kind: 'phase',
      ts: new Date().toISOString(),
      step: snap.step,
      phase: snap.phase,
      text: `tokens=${snap.tokensUsed}, dirty=${snap.filesDirty.length}${snap.filesDirty.length ? ` [${snap.filesDirty.slice(0,3).join(', ')}${snap.filesDirty.length > 3 ? '...' : ''}]` : ''}`
    })
  }

  recordDecision(sid: SessionId, decision: string, reason: string): void {
    this.append(sid, {
      kind: 'decision',
      ts: new Date().toISOString(),
      text: `**${decision}** — ${reason}`
    })
  }

  recordDistillation(sid: SessionId, summary: string): void {
    this.append(sid, { kind: 'distillation', ts: new Date().toISOString(), text: summary })
  }

  recordHourly(sid: SessionId, stats: { stepsDone: number; tokensSpent: number; quotaLeft: string }): void {
    this.append(sid, {
      kind: 'hourly',
      ts: new Date().toISOString(),
      text: `steps=${stats.stepsDone}, tokens=${stats.tokensSpent}, quota=${stats.quotaLeft}`
    })
  }

  readTail(sid: SessionId, lines = 40): string {
    const f = this.file(sid)
    if (!existsSync(f)) return ''
    const all = readFileSync(f, 'utf8').split('\n')
    return all.slice(-lines).join('\n')
  }
}
```

- [ ] **Step 2: Unit test**

`packages/core/test/unit/journal.test.ts`:
```ts
import { afterEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { Journal } from '../../src/longhorizon/journal'
import { createLogger } from '../../src/log'

let tmp: string
afterEach(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }) })

describe('Journal', () => {
  test('ensureHeader creates file with metadata', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-j-'))
    const j = new Journal(tmp, createLogger('test'))
    j.ensureHeader('SX', 'build a todo app')
    const f = path.join(tmp, 'SX', 'journal.md')
    expect(existsSync(f)).toBe(true)
    expect(readFileSync(f, 'utf8')).toMatch(/build a todo app/)
  })

  test('recordPhase appends with phase icon', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-j-'))
    const j = new Journal(tmp, createLogger('test'))
    j.ensureHeader('SX', 't')
    j.recordPhase('SX', { step: 7, phase: 'execute', tokensUsed: 9000, filesDirty: ['a.ts', 'b.ts'] })
    const body = readFileSync(path.join(tmp, 'SX', 'journal.md'), 'utf8')
    expect(body).toMatch(/step 7 · execute/)
    expect(body).toMatch(/tokens=9000/)
    expect(body).toMatch(/dirty=2/)
  })

  test('readTail returns last N lines', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-j-'))
    const j = new Journal(tmp, createLogger('test'))
    j.ensureHeader('SX', 't')
    for (let i = 0; i < 30; i++) j.append('SX', { kind: 'note', ts: new Date().toISOString(), text: `line${i}` })
    const tail = j.readTail('SX', 5)
    expect(tail).toMatch(/line29/)
    expect(tail).not.toMatch(/line0\b/)
  })
})
```

- [ ] **Step 3: Run — PASS**

```bash
pnpm vitest run packages/core/test/unit/journal.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add packages/core
git commit -m "feat(longhorizon): Journal writer with phase/decision/distillation/hourly entries"
```

---

## Task 5: Hourly distillation worker

**Files:**
- Create: `packages/core/src/longhorizon/distillation.ts`
- Test: `packages/core/test/unit/distillation.test.ts`

- [ ] **Step 1: Distillation worker (uses orchestrator LLM)**

`packages/core/src/longhorizon/distillation.ts`:
```ts
import type { Database } from 'better-sqlite3'
import type { Logger } from '../log'
import type { Journal } from './journal'
import type { SessionId } from '@glm/shared'

export interface DistillationContext {
  sessionId: SessionId
  sinceTs: string
  recentMessages: Array<{ role: string; content: string; ts: string }>
  decisionsMade: string[]
  filesTouched: string[]
}

export interface DistillationResult {
  summary: string             // ≤ 1000 tokens markdown for AGENTS.md ## Memories
  newMemories: Array<{ slug: string; type: 'feedback' | 'project'; body: string }>
}

export interface DistillerInputs {
  llm: (prompt: string) => Promise<string>       // injected for testability
  agentsMdAppender: (sid: SessionId, summary: string, memories: DistillationResult['newMemories']) => Promise<void>
}

export class Distiller {
  private last: Map<SessionId, number> = new Map()    // timestamp ms

  constructor(
    private db: Database,
    private journal: Journal,
    private inputs: DistillerInputs,
    private log: Logger,
    private intervalMs = 60 * 60 * 1000        // 1 hour
  ) {}

  shouldRun(sid: SessionId, nowMs = Date.now()): boolean {
    const prev = this.last.get(sid) ?? 0
    return (nowMs - prev) >= this.intervalMs
  }

  async runIfDue(sid: SessionId, nowMs = Date.now()): Promise<DistillationResult | null> {
    if (!this.shouldRun(sid, nowMs)) return null
    this.last.set(sid, nowMs)
    const ctx = this.gather(sid, nowMs - this.intervalMs)
    if (ctx.recentMessages.length === 0) {
      this.log.debug({ sid }, 'distillation skipped — no activity')
      return null
    }
    const prompt = this.buildPrompt(ctx)
    const raw = await this.inputs.llm(prompt)
    const result = this.parseResult(raw)
    await this.inputs.agentsMdAppender(sid, result.summary, result.newMemories)
    this.journal.recordDistillation(sid, result.summary)
    this.log.info({ sid, memories: result.newMemories.length }, 'distillation complete')
    return result
  }

  private gather(sid: SessionId, sinceMs: number): DistillationContext {
    const sinceTs = new Date(sinceMs).toISOString()
    const msgs = this.db.prepare(`
      SELECT role, content, ts FROM messages
      WHERE session_id=? AND ts > ?
      ORDER BY ts ASC LIMIT 200
    `).all(sid, sinceTs) as Array<{ role: string; content: string; ts: string }>
    const decisions = this.db.prepare(`
      SELECT data FROM events
      WHERE session_id=? AND topic='journal.decision' AND ts > ?
    `).all(sid, sinceTs).map((r: any) => JSON.parse(r.data).text as string)
    const files = this.db.prepare(`
      SELECT DISTINCT path FROM file_versions
      WHERE session_id=? AND ts > ?
    `).all(sid, sinceTs).map((r: any) => r.path as string)
    return { sessionId: sid, sinceTs, recentMessages: msgs, decisionsMade: decisions, filesTouched: files }
  }

  private buildPrompt(ctx: DistillationContext): string {
    return [
      `You are the distillation step in a long-horizon coding session.`,
      `Your goal: extract durable learnings from the last hour and emit a short markdown summary plus any new ## Memories entries.`,
      `Hard limits: summary ≤ 1000 tokens. Each new memory body ≤ 400 tokens. Max 5 new memories.`,
      `Skip noise (failed attempts, restating obvious facts). Keep facts that future you would want to know.`,
      ``,
      `## Decisions made`,
      ctx.decisionsMade.map(d => `- ${d}`).join('\n') || '(none)',
      ``,
      `## Files touched`,
      ctx.filesTouched.map(f => `- ${f}`).join('\n') || '(none)',
      ``,
      `## Recent messages (chronological)`,
      ctx.recentMessages.map(m => `### ${m.role} @ ${m.ts}\n${m.content.slice(0, 1500)}`).join('\n\n'),
      ``,
      `## Response format (strict JSON)`,
      `{ "summary": "...", "newMemories": [{ "slug": "kebab-name", "type": "feedback|project", "body": "..." }] }`
    ].join('\n')
  }

  private parseResult(raw: string): DistillationResult {
    const m = raw.match(/\{[\s\S]*\}/)
    if (!m) return { summary: raw.slice(0, 1000), newMemories: [] }
    try {
      const parsed = JSON.parse(m[0])
      return {
        summary: String(parsed.summary ?? '').slice(0, 4000),
        newMemories: Array.isArray(parsed.newMemories) ? parsed.newMemories.slice(0, 5) : []
      }
    } catch {
      return { summary: raw.slice(0, 1000), newMemories: [] }
    }
  }
}
```

- [ ] **Step 2: Unit test with fake LLM**

`packages/core/test/unit/distillation.test.ts`:
```ts
import { afterEach, describe, expect, test, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { openDb, runMigrations } from '../../src/storage'
import { Distiller } from '../../src/longhorizon/distillation'
import { Journal } from '../../src/longhorizon/journal'
import { createLogger } from '../../src/log'

let tmp: string
afterEach(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }) })

describe('Distiller', () => {
  test('shouldRun is false within interval', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-d-'))
    const db = openDb(path.join(tmp, 's.db'))
    runMigrations(db)
    const j = new Journal(tmp, createLogger('t'))
    const d = new Distiller(db, j, { llm: async () => '{}', agentsMdAppender: async () => {} }, createLogger('t'))
    expect(d.shouldRun('S1', 0)).toBe(true)
    // simulate a run
    ;(d as any).last.set('S1', 1_000_000)
    expect(d.shouldRun('S1', 1_000_000 + 30 * 60 * 1000)).toBe(false)
    expect(d.shouldRun('S1', 1_000_000 + 61 * 60 * 1000)).toBe(true)
  })

  test('runIfDue calls llm and parses JSON result', async () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-d-'))
    const db = openDb(path.join(tmp, 's.db'))
    runMigrations(db)
    db.prepare(`INSERT INTO sessions(id,created_at,updated_at,cwd,worktree,active) VALUES('S1',?,?,'/p','/p',1)`)
      .run(new Date().toISOString(), new Date().toISOString())
    db.prepare(`INSERT INTO messages(id,session_id,role,ts,content) VALUES('m1','S1','user',?, ?)`)
      .run(new Date().toISOString(), Buffer.from('do X'))
    const j = new Journal(tmp, createLogger('t'))
    j.ensureHeader('S1', 't')
    const appender = vi.fn().mockResolvedValue(undefined)
    const llm = vi.fn().mockResolvedValue(
      '{"summary":"learned X","newMemories":[{"slug":"x","type":"project","body":"hello"}]}'
    )
    const d = new Distiller(db, j, { llm, agentsMdAppender: appender }, createLogger('t'), 0)
    const res = await d.runIfDue('S1')
    expect(res!.newMemories).toHaveLength(1)
    expect(appender).toHaveBeenCalledOnce()
  })

  test('parses non-JSON LLM output gracefully', async () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-d-'))
    const db = openDb(path.join(tmp, 's.db'))
    runMigrations(db)
    db.prepare(`INSERT INTO sessions(id,created_at,updated_at,cwd,worktree,active) VALUES('S1',?,?,'/p','/p',1)`)
      .run(new Date().toISOString(), new Date().toISOString())
    db.prepare(`INSERT INTO messages(id,session_id,role,ts,content) VALUES('m1','S1','user',?, ?)`)
      .run(new Date().toISOString(), Buffer.from('do X'))
    const j = new Journal(tmp, createLogger('t'))
    j.ensureHeader('S1', 't')
    const d = new Distiller(db, j,
      { llm: async () => 'I am a free-form summary, not JSON.', agentsMdAppender: async () => {} },
      createLogger('t'), 0)
    const res = await d.runIfDue('S1')
    expect(res!.newMemories).toEqual([])
    expect(res!.summary).toMatch(/free-form/)
  })
})
```

- [ ] **Step 3: Run — PASS**

```bash
pnpm vitest run packages/core/test/unit/distillation.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add packages/core
git commit -m "feat(longhorizon): hourly Distiller worker → AGENTS.md ## Memories"
```

---


## Task 6: Continuation enforcer (long-horizon only)

**Files:**
- Create: `packages/core/src/longhorizon/continuation-enforcer.ts`
- Test: `packages/core/test/unit/continuation-enforcer.test.ts`

- [ ] **Step 1: Continuation enforcer**

`packages/core/src/longhorizon/continuation-enforcer.ts`:
```ts
import type { Logger } from '../log'
import type { SessionId } from '@glm/shared'

export interface AgentState {
  sessionId: SessionId
  mode: 'normal' | 'long-horizon'
  isIdle: boolean                 // no in-flight LLM call
  pendingTodos: number            // count from TodoWrite tracker
  userStopRequested: boolean      // user hit /pause or /cancel
  lastInjectionAtStep?: number    // throttle
  currentStep: number
}

export interface ContinuationDecision {
  shouldInject: boolean
  reason: string
  injectionText?: string
}

export class ContinuationEnforcer {
  // Only inject once per N=3 steps to avoid runaway loops
  private static THROTTLE_STEPS = 3

  constructor(private log: Logger) {}

  decide(state: AgentState): ContinuationDecision {
    if (state.mode !== 'long-horizon') {
      return { shouldInject: false, reason: 'not long-horizon — guard off' }
    }
    if (!state.isIdle) {
      return { shouldInject: false, reason: 'agent busy' }
    }
    if (state.pendingTodos === 0) {
      return { shouldInject: false, reason: 'no pending todos' }
    }
    if (state.userStopRequested) {
      return { shouldInject: false, reason: 'user requested stop' }
    }
    if (state.lastInjectionAtStep != null &&
        (state.currentStep - state.lastInjectionAtStep) < ContinuationEnforcer.THROTTLE_STEPS) {
      return { shouldInject: false, reason: `throttled (last inject @ step ${state.lastInjectionAtStep})` }
    }
    return {
      shouldInject: true,
      reason: `idle with ${state.pendingTodos} pending todos`,
      injectionText: `You went idle with ${state.pendingTodos} pending todos. Continue with the next one. If a todo is blocked, mark it blocked in your TodoWrite tracker with a reason.`
    }
  }
}
```

- [ ] **Step 2: Unit test**

`packages/core/test/unit/continuation-enforcer.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { ContinuationEnforcer } from '../../src/longhorizon/continuation-enforcer'
import { createLogger } from '../../src/log'

const e = new ContinuationEnforcer(createLogger('t'))

describe('ContinuationEnforcer', () => {
  test('off in normal mode', () => {
    expect(e.decide({ sessionId: 'S', mode: 'normal', isIdle: true, pendingTodos: 3, userStopRequested: false, currentStep: 5 }).shouldInject).toBe(false)
  })
  test('injects when idle + todos + long-horizon', () => {
    const d = e.decide({ sessionId: 'S', mode: 'long-horizon', isIdle: true, pendingTodos: 3, userStopRequested: false, currentStep: 5 })
    expect(d.shouldInject).toBe(true)
    expect(d.injectionText).toMatch(/3 pending todos/)
  })
  test('respects user stop', () => {
    expect(e.decide({ sessionId: 'S', mode: 'long-horizon', isIdle: true, pendingTodos: 3, userStopRequested: true, currentStep: 5 }).shouldInject).toBe(false)
  })
  test('throttles within 3 steps of last injection', () => {
    expect(e.decide({ sessionId: 'S', mode: 'long-horizon', isIdle: true, pendingTodos: 3, userStopRequested: false, currentStep: 6, lastInjectionAtStep: 5 }).shouldInject).toBe(false)
    expect(e.decide({ sessionId: 'S', mode: 'long-horizon', isIdle: true, pendingTodos: 3, userStopRequested: false, currentStep: 9, lastInjectionAtStep: 5 }).shouldInject).toBe(true)
  })
  test('no todos → no inject', () => {
    expect(e.decide({ sessionId: 'S', mode: 'long-horizon', isIdle: true, pendingTodos: 0, userStopRequested: false, currentStep: 5 }).shouldInject).toBe(false)
  })
})
```

- [ ] **Step 3: Run — PASS**

```bash
pnpm vitest run packages/core/test/unit/continuation-enforcer.test.ts
```

- [ ] **Step 4: Wire into session worker idle loop**

In `packages/core/src/session/worker.ts`, register a heartbeat that calls `enforcer.decide(...)` and if `shouldInject`, calls `this.injectUserMessage(decision.injectionText)`.

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(longhorizon): ContinuationEnforcer with throttling + user-stop guard"
```

---

## Task 7: Yolo 3-tier policy classifier

**Files:**
- Create: `packages/core/src/yolo/policy.ts`
- Create: `packages/core/src/yolo/whitelist.ts`
- Test: `packages/core/test/unit/yolo-policy.test.ts`

- [ ] **Step 1: Whitelist of TIER C (always-confirm) operations**

`packages/core/src/yolo/whitelist.ts`:
```ts
export interface TierCMatcher {
  id: string                  // human readable id for audit
  tool: string                // tool name (e.g., 'Bash', 'Edit', 'MCP:linear/save_issue')
  pattern?: RegExp            // optional pattern applied to args.command / args.path / args.url
  reason: string              // why this is locked
}

export const TIER_C_HARD_WHITELIST: TierCMatcher[] = [
  { id: 'git-push-force',      tool: 'Bash', pattern: /\bgit\s+push\s+.*--force\b|\bgit\s+push\s+.*\+/, reason: 'force push' },
  { id: 'git-push-main',       tool: 'Bash', pattern: /\bgit\s+push\s+\S+\s+(main|master)\b/, reason: 'push to main/master' },
  { id: 'rm-rf',               tool: 'Bash', pattern: /\brm\s+-[a-z]*r[a-z]*f|\brm\s+-[a-z]*f[a-z]*r/, reason: 'recursive force delete' },
  { id: 'rm-root',             tool: 'Bash', pattern: /\brm\s+(-[a-z]+\s+)?\/[\s$]|\brm\s+(-[a-z]+\s+)?~\b/, reason: 'rm against / or ~' },
  { id: 'drop-database',       tool: 'Bash', pattern: /\bDROP\s+(DATABASE|TABLE|SCHEMA)\b/i, reason: 'destructive SQL' },
  { id: 'npm-publish',         tool: 'Bash', pattern: /\bnpm\s+publish\b|\bpnpm\s+publish\b|\byarn\s+publish\b/, reason: 'package publish' },
  { id: 'cargo-publish',       tool: 'Bash', pattern: /\bcargo\s+publish\b/, reason: 'package publish' },
  { id: 'workspace-bypass-write', tool: 'Edit' /* args.path checked separately by isOutsideWorkspace */, reason: 'write outside workspace' },
  { id: 'settings-whitelist-edit', tool: 'Edit', pattern: /\.glm\/yolo-whitelist\.json$|~?\/\.glm\/settings\.json$/, reason: 'edit of hard whitelist' },
  { id: 'mcp-install',         tool: 'Bash', pattern: /\bglm\s+mcp\s+(add|install)\b/, reason: 'new MCP server' },
  { id: 'plugin-install',      tool: 'Bash', pattern: /\bglm\s+plugin\s+(install|enable)\b/, reason: 'new plugin' },
  { id: 'api-key-change',      tool: 'Bash', pattern: /\bglm\s+config\s+set\s+(api[_-]?key|apiKey|token)/i, reason: 'credential change' },
  { id: 'daemon-restart',      tool: 'Bash', pattern: /\bglm\s+daemon\s+(stop|restart|kill)\b/, reason: 'daemon lifecycle' },
  { id: 'sudo',                tool: 'Bash', pattern: /^\s*sudo\b/, reason: 'sudo escalation' },
  { id: 'curl-pipe-shell',     tool: 'Bash', pattern: /curl[^|]*\|\s*(sh|bash|zsh)/, reason: 'curl | sh pattern' },
]

export function matchTierC(tool: string, args: Record<string, unknown>): TierCMatcher | undefined {
  for (const m of TIER_C_HARD_WHITELIST) {
    if (m.tool !== tool) continue
    if (!m.pattern) return m
    const subject = String(args.command ?? args.path ?? args.url ?? args.cmd ?? '')
    if (m.pattern.test(subject)) return m
  }
  return undefined
}

export function isOutsideWorkspace(absPath: string, workspaceRoot: string): boolean {
  const norm = (p: string) => p.replace(/\/+$/, '')
  return !norm(absPath).startsWith(norm(workspaceRoot) + '/')
}
```

- [ ] **Step 2: 3-tier policy classifier**

`packages/core/src/yolo/policy.ts`:
```ts
import { matchTierC, isOutsideWorkspace, type TierCMatcher } from './whitelist'

export type Tier = 'A' | 'B' | 'C'

export interface PolicyInputs {
  tool: string
  args: Record<string, unknown>
  workspaceRoot: string
  yoloEnabled: boolean
  settingsAllow: string[]      // patterns from .glm/settings.json
}

export interface PolicyDecision {
  tier: Tier
  action: 'auto' | 'prompt' | 'block'
  reason: string
  matcher?: TierCMatcher
}

const TIER_A_TOOLS = new Set([
  'Read', 'Glob', 'Grep', 'TodoWrite', 'Skill', 'SlashCommand',
  'lsp_diagnostics', 'lsp_goto_definition', 'lsp_find_references',
  'lsp_hover', 'lsp_document_symbols', 'lsp_workspace_symbols',
])

const TIER_B_TOOLS = new Set([
  'Edit', 'Write', 'MultiEdit', 'Bash', 'NotebookEdit'
])

function isMcpReadOnly(tool: string): boolean {
  // MCP tools named "list_*", "get_*", "search_*", "read_*" are Tier A by convention
  return /^(mcp__)?[^_]+__?(list|get|search|read|find|describe|show)_/i.test(tool)
}

export function classify(input: PolicyInputs): PolicyDecision {
  const c = matchTierC(input.tool, input.args)
  if (c) {
    return { tier: 'C', action: 'prompt', reason: `Tier C — ${c.reason}`, matcher: c }
  }
  // workspace-bypass write check (separate because it depends on workspace root)
  if (input.tool === 'Edit' || input.tool === 'Write' || input.tool === 'MultiEdit') {
    const p = String(input.args.path ?? '')
    if (p && p.startsWith('/') && isOutsideWorkspace(p, input.workspaceRoot)) {
      return {
        tier: 'C',
        action: 'prompt',
        reason: 'Tier C — write outside workspace',
        matcher: { id: 'workspace-bypass-write', tool: input.tool, reason: 'write outside workspace' }
      }
    }
  }
  if (TIER_A_TOOLS.has(input.tool) || isMcpReadOnly(input.tool)) {
    return { tier: 'A', action: 'auto', reason: 'Tier A — always auto' }
  }
  if (TIER_B_TOOLS.has(input.tool) || /^mcp__/.test(input.tool)) {
    if (input.yoloEnabled) {
      return { tier: 'B', action: 'auto', reason: 'Tier B — yolo on, in-workspace' }
    }
    if (matchesAllow(input.tool, input.args, input.settingsAllow)) {
      return { tier: 'B', action: 'auto', reason: 'Tier B — settings.allow match' }
    }
    return { tier: 'B', action: 'prompt', reason: 'Tier B — yolo off, no settings.allow match' }
  }
  // Unknown tool defaults to prompt
  return { tier: 'B', action: 'prompt', reason: 'unknown tool — prompt' }
}

function matchesAllow(tool: string, args: Record<string, unknown>, allow: string[]): boolean {
  const subject = `${tool}:${String(args.command ?? args.path ?? '')}`
  return allow.some(rule => {
    try { return new RegExp(rule).test(subject) } catch { return rule === subject }
  })
}
```

- [ ] **Step 3: Unit test**

`packages/core/test/unit/yolo-policy.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { classify } from '../../src/yolo/policy'

const WS = '/work/repo'

describe('yolo policy classify', () => {
  test('Tier A: Read is always auto', () => {
    const d = classify({ tool: 'Read', args: { path: '/work/repo/a.ts' }, workspaceRoot: WS, yoloEnabled: false, settingsAllow: [] })
    expect(d.tier).toBe('A'); expect(d.action).toBe('auto')
  })
  test('Tier B: Edit prompts when yolo off', () => {
    const d = classify({ tool: 'Edit', args: { path: '/work/repo/a.ts' }, workspaceRoot: WS, yoloEnabled: false, settingsAllow: [] })
    expect(d.tier).toBe('B'); expect(d.action).toBe('prompt')
  })
  test('Tier B: Edit auto when yolo on + in workspace', () => {
    const d = classify({ tool: 'Edit', args: { path: '/work/repo/a.ts' }, workspaceRoot: WS, yoloEnabled: true, settingsAllow: [] })
    expect(d.tier).toBe('B'); expect(d.action).toBe('auto')
  })
  test('Tier C: rm -rf prompts even with yolo on', () => {
    const d = classify({ tool: 'Bash', args: { command: 'rm -rf /tmp/foo' }, workspaceRoot: WS, yoloEnabled: true, settingsAllow: [] })
    expect(d.tier).toBe('C'); expect(d.action).toBe('prompt')
    expect(d.matcher!.id).toBe('rm-rf')
  })
  test('Tier C: push to main blocks under yolo', () => {
    const d = classify({ tool: 'Bash', args: { command: 'git push origin main' }, workspaceRoot: WS, yoloEnabled: true, settingsAllow: [] })
    expect(d.tier).toBe('C')
    expect(d.matcher!.id).toBe('git-push-main')
  })
  test('Tier C: workspace bypass write', () => {
    const d = classify({ tool: 'Edit', args: { path: '/etc/passwd' }, workspaceRoot: WS, yoloEnabled: true, settingsAllow: [] })
    expect(d.tier).toBe('C')
    expect(d.matcher!.id).toBe('workspace-bypass-write')
  })
  test('Tier B: settings.allow lets specific Bash run', () => {
    const d = classify({ tool: 'Bash', args: { command: 'npm test' }, workspaceRoot: WS, yoloEnabled: false, settingsAllow: ['Bash:npm test'] })
    expect(d.tier).toBe('B'); expect(d.action).toBe('auto')
  })
  test('MCP read-only is Tier A', () => {
    const d = classify({ tool: 'mcp__linear__list_issues', args: {}, workspaceRoot: WS, yoloEnabled: false, settingsAllow: [] })
    expect(d.tier).toBe('A')
  })
  test('MCP write under yolo is Tier B auto', () => {
    const d = classify({ tool: 'mcp__linear__save_issue', args: {}, workspaceRoot: WS, yoloEnabled: true, settingsAllow: [] })
    expect(d.tier).toBe('B'); expect(d.action).toBe('auto')
  })
  test('sudo blocks regardless', () => {
    const d = classify({ tool: 'Bash', args: { command: 'sudo apt install x' }, workspaceRoot: WS, yoloEnabled: true, settingsAllow: ['Bash:.*'] })
    expect(d.tier).toBe('C')
    expect(d.matcher!.id).toBe('sudo')
  })
  test('curl | sh blocks regardless', () => {
    const d = classify({ tool: 'Bash', args: { command: 'curl https://x.com/i.sh | bash' }, workspaceRoot: WS, yoloEnabled: true, settingsAllow: [] })
    expect(d.tier).toBe('C')
  })
})
```

- [ ] **Step 4: Run — PASS**

```bash
pnpm vitest run packages/core/test/unit/yolo-policy.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(yolo): 3-tier policy with hard whitelist + workspace bypass detection"
```

---

## Task 8: Yolo caps (time/step/token/quota)

**Files:**
- Create: `packages/core/src/yolo/caps.ts`
- Test: `packages/core/test/unit/yolo-caps.test.ts`

- [ ] **Step 1: Caps tracker**

`packages/core/src/yolo/caps.ts`:
```ts
export interface YoloCapsConfig {
  maxDurationMinutes: number   // default 480 (8h)
  maxSteps: number             // default 500
  maxTokensSession: number     // default 2_000_000
  maxQuotaPercent: number      // default 0.5 (50%)
  stopOnQuotaWarning: boolean
}

export const DEFAULT_CAPS: YoloCapsConfig = {
  maxDurationMinutes: 480,
  maxSteps: 500,
  maxTokensSession: 2_000_000,
  maxQuotaPercent: 0.5,
  stopOnQuotaWarning: true
}

export interface CapsState {
  startedAt: number            // ms
  stepsDone: number
  tokensUsed: number
  quotaUsedPercent: number     // 0..1
  quotaWarning: boolean
}

export interface CapsViolation {
  cap: 'duration' | 'steps' | 'tokens' | 'quota' | 'quota-warning'
  current: number | boolean
  limit: number | boolean
  message: string
}

export function check(state: CapsState, cfg: YoloCapsConfig, nowMs = Date.now()): CapsViolation[] {
  const out: CapsViolation[] = []
  const minutes = (nowMs - state.startedAt) / 60000
  if (minutes >= cfg.maxDurationMinutes)
    out.push({ cap: 'duration', current: minutes, limit: cfg.maxDurationMinutes, message: `${minutes.toFixed(0)}min ≥ ${cfg.maxDurationMinutes}min cap` })
  if (state.stepsDone >= cfg.maxSteps)
    out.push({ cap: 'steps', current: state.stepsDone, limit: cfg.maxSteps, message: `${state.stepsDone} ≥ ${cfg.maxSteps} step cap` })
  if (state.tokensUsed >= cfg.maxTokensSession)
    out.push({ cap: 'tokens', current: state.tokensUsed, limit: cfg.maxTokensSession, message: `${state.tokensUsed} tokens ≥ ${cfg.maxTokensSession} cap` })
  if (state.quotaUsedPercent >= cfg.maxQuotaPercent)
    out.push({ cap: 'quota', current: state.quotaUsedPercent, limit: cfg.maxQuotaPercent, message: `quota ${(state.quotaUsedPercent*100).toFixed(0)}% ≥ ${(cfg.maxQuotaPercent*100).toFixed(0)}% cap` })
  if (cfg.stopOnQuotaWarning && state.quotaWarning)
    out.push({ cap: 'quota-warning', current: true, limit: false, message: 'quota warning + stopOnQuotaWarning is on' })
  return out
}
```

- [ ] **Step 2: Unit test**

`packages/core/test/unit/yolo-caps.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { check, DEFAULT_CAPS } from '../../src/yolo/caps'

describe('yolo caps', () => {
  test('no violations at start', () => {
    expect(check({ startedAt: Date.now(), stepsDone: 0, tokensUsed: 0, quotaUsedPercent: 0, quotaWarning: false }, DEFAULT_CAPS)).toEqual([])
  })
  test('duration cap', () => {
    const now = Date.now()
    const v = check({ startedAt: now - 500 * 60 * 1000, stepsDone: 0, tokensUsed: 0, quotaUsedPercent: 0, quotaWarning: false }, DEFAULT_CAPS, now)
    expect(v.find(x => x.cap === 'duration')).toBeDefined()
  })
  test('steps cap', () => {
    const v = check({ startedAt: Date.now(), stepsDone: 501, tokensUsed: 0, quotaUsedPercent: 0, quotaWarning: false }, DEFAULT_CAPS)
    expect(v.find(x => x.cap === 'steps')).toBeDefined()
  })
  test('tokens cap', () => {
    const v = check({ startedAt: Date.now(), stepsDone: 1, tokensUsed: 3_000_000, quotaUsedPercent: 0, quotaWarning: false }, DEFAULT_CAPS)
    expect(v.find(x => x.cap === 'tokens')).toBeDefined()
  })
  test('quota cap and quota-warning are independent', () => {
    const v = check({ startedAt: Date.now(), stepsDone: 1, tokensUsed: 0, quotaUsedPercent: 0.6, quotaWarning: true }, DEFAULT_CAPS)
    expect(v.map(x => x.cap).sort()).toEqual(['quota', 'quota-warning'])
  })
  test('stopOnQuotaWarning=false suppresses warning violation', () => {
    const v = check({ startedAt: Date.now(), stepsDone: 1, tokensUsed: 0, quotaUsedPercent: 0.1, quotaWarning: true }, { ...DEFAULT_CAPS, stopOnQuotaWarning: false })
    expect(v).toEqual([])
  })
})
```

- [ ] **Step 3: Run — PASS**

```bash
pnpm vitest run packages/core/test/unit/yolo-caps.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add packages/core
git commit -m "feat(yolo): caps tracker (duration/steps/tokens/quota) with violation reporting"
```

---

## Task 9: Yolo audit log + auto-snapshot + revert

**Files:**
- Create: `packages/core/src/yolo/audit.ts`
- Create: `packages/core/src/yolo/snapshot.ts`
- Create: `packages/core/src/yolo/revert.ts`
- Test: `packages/core/test/unit/yolo-audit.test.ts`
- Test: `packages/core/test/integration/yolo-snapshot-revert.test.ts`

- [ ] **Step 1: Audit log writer**

`packages/core/src/yolo/audit.ts`:
```ts
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Tier } from './policy'
import type { SessionId } from '@glm/shared'

export interface AuditEntry {
  ts: string
  sessionId: SessionId
  step: number
  tier: Tier
  decision: 'auto-approved' | 'prompt-shown' | 'user-approved' | 'user-denied' | 'capped'
  tool: string
  args: Record<string, unknown>
  reasoning: string
  matcherId?: string
}

export class YoloAudit {
  constructor(private sessionsDir: string) {}

  private path(sid: SessionId): string {
    return join(this.sessionsDir, sid, 'yolo-audit.log')
  }

  log(entry: AuditEntry): void {
    const f = this.path(entry.sessionId)
    mkdirSync(dirname(f), { recursive: true })
    // line-delimited JSON for easy grepping / replay
    appendFileSync(f, JSON.stringify({ ...entry, args: redactArgs(entry.args) }) + '\n')
  }
}

function redactArgs(args: Record<string, unknown>): Record<string, unknown> {
  // Defensive truncation — never dump entire file contents into audit log.
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(args)) {
    if (typeof v === 'string' && v.length > 500) out[k] = v.slice(0, 500) + `…[truncated ${v.length - 500}]`
    else out[k] = v
  }
  return out
}
```

- [ ] **Step 2: Audit log unit test**

`packages/core/test/unit/yolo-audit.test.ts`:
```ts
import { afterEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { YoloAudit } from '../../src/yolo/audit'

let tmp: string
afterEach(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }) })

describe('YoloAudit', () => {
  test('appends NDJSON entries', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-ya-'))
    const a = new YoloAudit(tmp)
    a.log({ ts: 't', sessionId: 'S', step: 1, tier: 'B', decision: 'auto-approved', tool: 'Edit', args: { path: 'a.ts' }, reasoning: 'yolo on' })
    a.log({ ts: 't2', sessionId: 'S', step: 2, tier: 'A', decision: 'auto-approved', tool: 'Read', args: { path: 'b.ts' }, reasoning: 'tier A' })
    const f = path.join(tmp, 'S', 'yolo-audit.log')
    expect(existsSync(f)).toBe(true)
    const lines = readFileSync(f, 'utf8').trim().split('\n')
    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[0]!).tool).toBe('Edit')
  })

  test('truncates large string args', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-ya-'))
    const a = new YoloAudit(tmp)
    a.log({ ts: 't', sessionId: 'S', step: 1, tier: 'B', decision: 'auto-approved', tool: 'Write', args: { content: 'x'.repeat(2000) }, reasoning: '' })
    const line = readFileSync(path.join(tmp, 'S', 'yolo-audit.log'), 'utf8').trim()
    expect(JSON.parse(line).args.content).toMatch(/truncated 1500/)
  })
})
```

- [ ] **Step 3: Auto-snapshot via `git stash create`**

`packages/core/src/yolo/snapshot.ts`:
```ts
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, appendFileSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { SessionId } from '@glm/shared'

export interface StepSnapshot {
  step: number
  ts: string
  stashSha: string         // git stash object sha (works even uncommitted)
  description: string
}

export class YoloSnapshot {
  constructor(private sessionsDir: string) {}

  private file(sid: SessionId): string {
    return join(this.sessionsDir, sid, 'yolo-snapshots.ndjson')
  }

  /**
   * `git stash create` builds a stash commit object without modifying the working tree.
   * We just remember its SHA per step.
   */
  capture(sid: SessionId, step: number, cwd: string, description: string): StepSnapshot | null {
    try {
      const sha = execFileSync('git', ['-C', cwd, 'stash', 'create'], { encoding: 'utf8' }).trim()
      if (!sha) return null  // nothing to stash
      // pin it so GC doesn't reap it
      execFileSync('git', ['-C', cwd, 'update-ref', `refs/glm/yolo/${sid}/step-${step}`, sha], { stdio: 'ignore' })
      const snap: StepSnapshot = { step, ts: new Date().toISOString(), stashSha: sha, description }
      const f = this.file(sid)
      mkdirSync(dirname(f), { recursive: true })
      appendFileSync(f, JSON.stringify(snap) + '\n')
      return snap
    } catch {
      return null
    }
  }

  list(sid: SessionId): StepSnapshot[] {
    const f = this.file(sid)
    if (!existsSync(f)) return []
    return readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l) as StepSnapshot)
  }

  get(sid: SessionId, step: number): StepSnapshot | undefined {
    return this.list(sid).find(s => s.step === step)
  }
}
```

- [ ] **Step 4: Revert from snapshot**

`packages/core/src/yolo/revert.ts`:
```ts
import { execFileSync } from 'node:child_process'
import type { YoloSnapshot } from './snapshot'
import type { SessionId } from '@glm/shared'

export interface RevertResult {
  ok: boolean
  step: number
  stashSha: string
  message: string
}

export function revertToStep(sid: SessionId, step: number, cwd: string, snaps: YoloSnapshot): RevertResult {
  const snap = snaps.get(sid, step)
  if (!snap) return { ok: false, step, stashSha: '', message: `no snapshot for step ${step}` }
  try {
    // Apply the stash as a checkout-style restore.
    // We use 'git stash apply' to keep the stash object intact (vs pop).
    execFileSync('git', ['-C', cwd, 'stash', 'apply', '--index', snap.stashSha], { stdio: 'pipe' })
    return { ok: true, step, stashSha: snap.stashSha, message: `restored working tree to step ${step}` }
  } catch (e: any) {
    return { ok: false, step, stashSha: snap.stashSha, message: `git stash apply failed: ${e.message ?? String(e)}` }
  }
}
```

- [ ] **Step 5: Integration test — snapshot + revert round-trip**

`packages/core/test/integration/yolo-snapshot-revert.test.ts`:
```ts
import { afterEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import os from 'node:os'
import { YoloSnapshot } from '../../src/yolo/snapshot'
import { revertToStep } from '../../src/yolo/revert'

let tmpRepo: string
let glmDir: string

afterEach(() => {
  if (tmpRepo) rmSync(tmpRepo, { recursive: true, force: true })
  if (glmDir)  rmSync(glmDir, { recursive: true, force: true })
})

function git(...args: string[]): string {
  return execFileSync('git', ['-C', tmpRepo, ...args], { encoding: 'utf8' }).trim()
}

describe('yolo snapshot + revert', () => {
  test('captures stash + revert restores working tree state', () => {
    tmpRepo = mkdtempSync(path.join(os.tmpdir(), 'glm-snap-'))
    glmDir  = mkdtempSync(path.join(os.tmpdir(), 'glm-snap-store-'))
    execFileSync('git', ['init', '-q', '-b', 'main', tmpRepo])
    execFileSync('git', ['-C', tmpRepo, 'config', 'user.email', 'a@b.c'])
    execFileSync('git', ['-C', tmpRepo, 'config', 'user.name', 't'])
    writeFileSync(path.join(tmpRepo, 'a.txt'), 'initial\n')
    git('add', '.'); git('commit', '-q', '-m', 'init')
    // step 1 change
    writeFileSync(path.join(tmpRepo, 'a.txt'), 'step-1 edit\n')
    const snaps = new YoloSnapshot(glmDir)
    const s1 = snaps.capture('S1', 1, tmpRepo, 'step 1')
    expect(s1).not.toBeNull()
    // step 2 change
    writeFileSync(path.join(tmpRepo, 'a.txt'), 'step-2 edit\n')
    const s2 = snaps.capture('S1', 2, tmpRepo, 'step 2')
    expect(s2).not.toBeNull()
    expect(snaps.list('S1')).toHaveLength(2)
    // currently working tree is at step 2
    expect(readFileSync(path.join(tmpRepo, 'a.txt'), 'utf8')).toBe('step-2 edit\n')
    // wipe to step-1 state on disk to simulate the user wanting step 1 back
    writeFileSync(path.join(tmpRepo, 'a.txt'), 'initial\n')
    git('checkout', '--', 'a.txt')
    const r = revertToStep('S1', 1, tmpRepo, snaps)
    expect(r.ok).toBe(true)
    expect(readFileSync(path.join(tmpRepo, 'a.txt'), 'utf8')).toBe('step-1 edit\n')
  })

  test('revert returns ok=false for unknown step', () => {
    tmpRepo = mkdtempSync(path.join(os.tmpdir(), 'glm-snap-'))
    glmDir  = mkdtempSync(path.join(os.tmpdir(), 'glm-snap-store-'))
    execFileSync('git', ['init', '-q', '-b', 'main', tmpRepo])
    const snaps = new YoloSnapshot(glmDir)
    const r = revertToStep('S1', 99, tmpRepo, snaps)
    expect(r.ok).toBe(false)
  })
})
```

- [ ] **Step 6: Run — PASS**

```bash
pnpm vitest run packages/core/test/unit/yolo-audit.test.ts
pnpm vitest run packages/core/test/integration/yolo-snapshot-revert.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add packages/core
git commit -m "feat(yolo): audit log + per-step git-stash snapshots + revert"
```

---

## Task 10: `glm yolo doctor` — environment suitability check

**Files:**
- Create: `packages/core/src/yolo/doctor.ts`
- Test: `packages/core/test/unit/yolo-doctor.test.ts`

- [ ] **Step 1: Doctor checks**

`packages/core/src/yolo/doctor.ts`:
```ts
import { execFileSync } from 'node:child_process'

export interface YoloDoctorCheck {
  id: string
  label: string
  pass: boolean
  level: 'fatal' | 'warn' | 'info'
  detail: string
  remediation?: string
}

export interface YoloDoctorInputs {
  cwd: string
  isContainer: () => boolean
  hasNotificationChannel: () => boolean
  hasCleanGitTree: (cwd: string) => boolean
  hasGitRemote: (cwd: string) => boolean
  quotaPercentLeft: () => number   // 0..1
}

export function runYoloDoctor(i: YoloDoctorInputs): YoloDoctorCheck[] {
  const out: YoloDoctorCheck[] = []

  // 1. container / sandbox
  if (i.isContainer()) {
    out.push({ id: 'sandbox', label: 'Sandbox', pass: true, level: 'info', detail: 'running in container / sandbox' })
  } else {
    out.push({
      id: 'sandbox', label: 'Sandbox', pass: false, level: 'warn',
      detail: 'not in a container — yolo will run against your host fs',
      remediation: 'consider running inside Docker / devcontainer'
    })
  }

  // 2. clean git tree
  if (i.hasCleanGitTree(i.cwd)) {
    out.push({ id: 'git-clean', label: 'Clean git tree', pass: true, level: 'info', detail: 'working tree clean' })
  } else {
    out.push({
      id: 'git-clean', label: 'Clean git tree', pass: false, level: 'warn',
      detail: 'working tree has uncommitted changes',
      remediation: 'commit or stash before yolo so /yolo revert has a clean baseline'
    })
  }

  // 3. git remote configured (otherwise stash sha is the only safety net)
  if (i.hasGitRemote(i.cwd)) {
    out.push({ id: 'git-remote', label: 'Git remote', pass: true, level: 'info', detail: 'remote configured' })
  } else {
    out.push({
      id: 'git-remote', label: 'Git remote', pass: false, level: 'warn',
      detail: 'no git remote — work lives only on this machine',
      remediation: 'add a remote (`git remote add origin ...`) for offsite safety'
    })
  }

  // 4. at least one notification channel configured
  if (i.hasNotificationChannel()) {
    out.push({ id: 'notify', label: 'Notification channel', pass: true, level: 'info', detail: 'at least one channel configured' })
  } else {
    out.push({
      id: 'notify', label: 'Notification channel', pass: false, level: 'warn',
      detail: 'no notification channel configured — you wont know if it stalls',
      remediation: 'configure macOS / Discord / Slack / Telegram (`glm notify config <channel>`)'
    })
  }

  // 5. quota headroom — must have ≥ 50% left for yolo to make sense
  const pctLeft = i.quotaPercentLeft()
  if (pctLeft >= 0.5) {
    out.push({ id: 'quota', label: 'Quota headroom', pass: true, level: 'info', detail: `${(pctLeft*100).toFixed(0)}% left` })
  } else {
    out.push({
      id: 'quota', label: 'Quota headroom', pass: false, level: 'fatal',
      detail: `only ${(pctLeft*100).toFixed(0)}% quota left — yolo cap requires ≥ 50%`,
      remediation: 'wait for refresh or switch profile'
    })
  }

  return out
}

// Real probe helpers (default impls). Pure functions to allow easy mocking in tests.
export function probeIsContainer(): boolean {
  try {
    if (process.env.container) return true
    if (process.env.DOCKER) return true
    // crude: /.dockerenv file exists
    return require('node:fs').existsSync('/.dockerenv')
  } catch { return false }
}

export function probeCleanGitTree(cwd: string): boolean {
  try {
    const out = execFileSync('git', ['-C', cwd, 'status', '--porcelain'], { encoding: 'utf8' })
    return out.trim().length === 0
  } catch { return false }
}

export function probeHasGitRemote(cwd: string): boolean {
  try {
    return execFileSync('git', ['-C', cwd, 'remote'], { encoding: 'utf8' }).trim().length > 0
  } catch { return false }
}
```

- [ ] **Step 2: Unit test (all probes mocked)**

`packages/core/test/unit/yolo-doctor.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { runYoloDoctor } from '../../src/yolo/doctor'

const base = {
  cwd: '/tmp',
  isContainer: () => true,
  hasNotificationChannel: () => true,
  hasCleanGitTree: () => true,
  hasGitRemote: () => true,
  quotaPercentLeft: () => 0.9
}

describe('runYoloDoctor', () => {
  test('all-pass scenario', () => {
    const r = runYoloDoctor(base)
    expect(r.every(c => c.pass)).toBe(true)
  })
  test('low quota is fatal', () => {
    const r = runYoloDoctor({ ...base, quotaPercentLeft: () => 0.1 })
    const q = r.find(c => c.id === 'quota')!
    expect(q.pass).toBe(false)
    expect(q.level).toBe('fatal')
  })
  test('missing notification is warn', () => {
    const r = runYoloDoctor({ ...base, hasNotificationChannel: () => false })
    const n = r.find(c => c.id === 'notify')!
    expect(n.level).toBe('warn')
  })
  test('non-container is warn', () => {
    const r = runYoloDoctor({ ...base, isContainer: () => false })
    const s = r.find(c => c.id === 'sandbox')!
    expect(s.level).toBe('warn')
  })
})
```

- [ ] **Step 3: Run — PASS**

```bash
pnpm vitest run packages/core/test/unit/yolo-doctor.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add packages/core
git commit -m "feat(yolo): glm yolo doctor — sandbox/git/notify/quota suitability check"
```

---

## Task 11: Notification dispatcher + macOS channel

**Files:**
- Create: `packages/core/src/notifications/config.ts`
- Create: `packages/core/src/notifications/dispatcher.ts`
- Create: `packages/core/src/notifications/channels/macos.ts`
- Test: `packages/core/test/unit/notify-dispatcher.test.ts`

- [ ] **Step 1: Config schema**

`packages/core/src/notifications/config.ts`:
```ts
import { z } from 'zod'

export const ChannelMacOS = z.object({ kind: z.literal('macos'), enabled: z.boolean().default(true) })
export const ChannelDiscord = z.object({
  kind: z.literal('discord'),
  webhook: z.string().url(),
  bidirectional: z.boolean().default(false),     // v0.2
  botToken: z.string().optional()
})
export const ChannelSlack = z.object({
  kind: z.literal('slack'),
  webhook: z.string().url()
})
export const ChannelTelegram = z.object({
  kind: z.literal('telegram'),
  botToken: z.string(),
  chatId: z.string(),
  bidirectional: z.boolean().default(false)      // v0.2
})
export const ChannelEmail = z.object({
  kind: z.literal('email'),
  smtp: z.object({
    host: z.string(),
    port: z.number().int().positive(),
    secure: z.boolean().default(false),
    user: z.string().optional(),
    pass: z.string().optional()
  }),
  from: z.string(),
  to: z.string()
})
export const ChannelWebhook = z.object({
  kind: z.literal('webhook'),
  url: z.string().url(),
  headers: z.record(z.string()).optional()
})

export const NotificationChannel = z.discriminatedUnion('kind', [
  ChannelMacOS, ChannelDiscord, ChannelSlack, ChannelTelegram, ChannelEmail, ChannelWebhook
])
export type NotificationChannel = z.infer<typeof NotificationChannel>

export const NotificationEvent = z.enum([
  'yolo.tier-c-blocked',
  'yolo.cap-hit',
  'quota.warning',
  'quota.exhausted',
  'session.idle',
  'session.complete',
  'session.crashed',
  'worker.stalled',
  'longhorizon.hourly',
  'longhorizon.resume-needed'
])
export type NotificationEvent = z.infer<typeof NotificationEvent>

export const NotificationsConfig = z.object({
  channels: z.record(NotificationChannel),                          // name → channel
  events: z.record(NotificationEvent, z.array(z.string())),          // event → channel-names
  defaults: z.object({
    quietHours: z.string().optional(),                               // e.g., "22:00-07:00"
    digestInterval: z.string().default('off')                        // 'off' | '15m' | '1h'
  }).default({})
})
export type NotificationsConfig = z.infer<typeof NotificationsConfig>
```

- [ ] **Step 2: macOS channel**

`packages/core/src/notifications/channels/macos.ts`:
```ts
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const pexecFile = promisify(execFile)

export interface NotifyPayload {
  title: string
  message: string
  subtitle?: string
  sound?: string             // macOS only
  contentImage?: string
}

export async function sendMacos(p: NotifyPayload): Promise<{ ok: boolean; detail?: string }> {
  // Use osascript to avoid runtime dep on node-notifier if it's not installed.
  if (process.platform !== 'darwin') {
    return { ok: false, detail: `unsupported platform ${process.platform}` }
  }
  const esc = (s: string) => s.replace(/"/g, '\\"').replace(/\\/g, '\\\\')
  const parts = [`display notification "${esc(p.message)}" with title "${esc(p.title)}"`]
  if (p.subtitle) parts.push(`subtitle "${esc(p.subtitle)}"`)
  if (p.sound) parts.push(`sound name "${esc(p.sound)}"`)
  const script = parts.join(' ')
  try {
    await pexecFile('osascript', ['-e', script], { timeout: 5000 })
    return { ok: true }
  } catch (e: any) {
    return { ok: false, detail: e?.message ?? String(e) }
  }
}
```

- [ ] **Step 3: Dispatcher**

`packages/core/src/notifications/dispatcher.ts`:
```ts
import type { Logger } from '../log'
import type { NotificationsConfig, NotificationEvent } from './config'

export interface ChannelHandlers {
  macos:    (p: NotifyPayload) => Promise<Result>
  discord:  (cfg: any, p: NotifyPayload) => Promise<Result>
  slack:    (cfg: any, p: NotifyPayload) => Promise<Result>
  telegram: (cfg: any, p: NotifyPayload) => Promise<Result>
  email:    (cfg: any, p: NotifyPayload) => Promise<Result>
  webhook:  (cfg: any, p: NotifyPayload) => Promise<Result>
}

export interface NotifyPayload {
  title: string
  message: string
  subtitle?: string
  sound?: string
  contentImage?: string
  level?: 'info' | 'warn' | 'urgent'
}

export interface Result { ok: boolean; detail?: string }

export class NotificationDispatcher {
  constructor(
    private cfg: NotificationsConfig,
    private channels: ChannelHandlers,
    private log: Logger
  ) {}

  async emit(event: NotificationEvent, payload: NotifyPayload): Promise<Result[]> {
    const targets = this.cfg.events[event] ?? []
    if (targets.length === 0) {
      this.log.debug({ event }, 'no channels subscribed')
      return []
    }
    if (this.isInQuietHours()) {
      // urgent overrides quiet hours
      if (payload.level !== 'urgent') {
        this.log.debug({ event }, 'suppressed by quiet hours')
        return []
      }
    }
    const out: Result[] = []
    for (const name of targets) {
      const ch = this.cfg.channels[name]
      if (!ch) { out.push({ ok: false, detail: `unknown channel ${name}` }); continue }
      try {
        const r = await this.dispatchOne(ch, payload)
        out.push(r)
      } catch (e: any) {
        out.push({ ok: false, detail: e?.message ?? String(e) })
      }
    }
    return out
  }

  private async dispatchOne(ch: any, p: NotifyPayload): Promise<Result> {
    switch (ch.kind) {
      case 'macos':    return this.channels.macos(p)
      case 'discord':  return this.channels.discord(ch, p)
      case 'slack':    return this.channels.slack(ch, p)
      case 'telegram': return this.channels.telegram(ch, p)
      case 'email':    return this.channels.email(ch, p)
      case 'webhook':  return this.channels.webhook(ch, p)
      default:         return { ok: false, detail: `unknown channel kind` }
    }
  }

  private isInQuietHours(now = new Date()): boolean {
    const q = this.cfg.defaults?.quietHours
    if (!q) return false
    const m = q.match(/^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/)
    if (!m) return false
    const hhmm = now.getHours() * 60 + now.getMinutes()
    const start = Number(m[1]) * 60 + Number(m[2])
    const end   = Number(m[3]) * 60 + Number(m[4])
    if (start < end) return hhmm >= start && hhmm < end
    // wrap (e.g., 22:00-07:00)
    return hhmm >= start || hhmm < end
  }
}
```

- [ ] **Step 4: Dispatcher unit test with mocked channels**

`packages/core/test/unit/notify-dispatcher.test.ts`:
```ts
import { describe, expect, test, vi } from 'vitest'
import { NotificationDispatcher } from '../../src/notifications/dispatcher'
import { createLogger } from '../../src/log'

function makeMocks() {
  return {
    macos:    vi.fn().mockResolvedValue({ ok: true }),
    discord:  vi.fn().mockResolvedValue({ ok: true }),
    slack:    vi.fn().mockResolvedValue({ ok: true }),
    telegram: vi.fn().mockResolvedValue({ ok: true }),
    email:    vi.fn().mockResolvedValue({ ok: true }),
    webhook:  vi.fn().mockResolvedValue({ ok: true })
  }
}

describe('NotificationDispatcher', () => {
  test('routes event to subscribed channels', async () => {
    const ch = makeMocks()
    const d = new NotificationDispatcher({
      channels: { phone: { kind: 'telegram', botToken: 'x', chatId: 'y', bidirectional: false } as any,
                  laptop: { kind: 'macos', enabled: true } as any },
      events: { 'yolo.cap-hit': ['phone', 'laptop'] } as any,
      defaults: {} as any
    }, ch, createLogger('t'))
    const r = await d.emit('yolo.cap-hit', { title: 't', message: 'm' })
    expect(r).toHaveLength(2)
    expect(ch.telegram).toHaveBeenCalledOnce()
    expect(ch.macos).toHaveBeenCalledOnce()
  })

  test('no subscribers → no calls', async () => {
    const ch = makeMocks()
    const d = new NotificationDispatcher({ channels: {}, events: {}, defaults: {} } as any, ch, createLogger('t'))
    const r = await d.emit('yolo.cap-hit', { title: 't', message: 'm' })
    expect(r).toEqual([])
    expect(ch.macos).not.toHaveBeenCalled()
  })

  test('quiet hours suppress info but not urgent', async () => {
    const ch = makeMocks()
    const d = new NotificationDispatcher({
      channels: { laptop: { kind: 'macos', enabled: true } as any },
      events: { 'session.idle': ['laptop'] } as any,
      defaults: { quietHours: '00:00-23:59', digestInterval: 'off' } as any
    }, ch, createLogger('t'))
    await d.emit('session.idle', { title: 'idle', message: 'm', level: 'info' })
    expect(ch.macos).not.toHaveBeenCalled()
    await d.emit('session.idle', { title: 'urgent', message: 'm', level: 'urgent' })
    expect(ch.macos).toHaveBeenCalledOnce()
  })

  test('quietHours that wraps midnight', async () => {
    // 22:00-07:00 — at 23:30 should be quiet
    const ch = makeMocks()
    const d = new NotificationDispatcher({
      channels: { laptop: { kind: 'macos', enabled: true } as any },
      events: { 'session.idle': ['laptop'] } as any,
      defaults: { quietHours: '22:00-07:00', digestInterval: 'off' } as any
    }, ch, createLogger('t'))
    // we cant easily fake Date here without sinon — just test isInQuietHours via cast
    const inq = (d as any).isInQuietHours(new Date('2026-05-14T23:30:00'))
    expect(inq).toBe(true)
    const out = (d as any).isInQuietHours(new Date('2026-05-14T12:00:00'))
    expect(out).toBe(false)
  })
})
```

- [ ] **Step 5: Run — PASS**

```bash
pnpm vitest run packages/core/test/unit/notify-dispatcher.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat(notifications): dispatcher + macOS osascript channel + quiet hours"
```

---

## Task 12: Notification channels — Discord / Slack / Telegram / Email / generic webhook

**Files:**
- Create: `packages/core/src/notifications/channels/discord.ts`
- Create: `packages/core/src/notifications/channels/slack.ts`
- Create: `packages/core/src/notifications/channels/telegram.ts`
- Create: `packages/core/src/notifications/channels/email.ts`
- Create: `packages/core/src/notifications/channels/webhook.ts`
- Test: `packages/core/test/unit/notify-channels.test.ts`

- [ ] **Step 1: Discord webhook**

`packages/core/src/notifications/channels/discord.ts`:
```ts
import type { NotifyPayload, Result } from '../dispatcher'

export async function sendDiscord(cfg: { webhook: string }, p: NotifyPayload, fetchImpl: typeof fetch = fetch): Promise<Result> {
  const body = {
    username: 'glm code',
    content: `**${p.title}**${p.subtitle ? ` · ${p.subtitle}` : ''}\n${p.message}`
  }
  try {
    const res = await fetchImpl(cfg.webhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, detail: e?.message ?? String(e) }
  }
}
```

- [ ] **Step 2: Slack webhook**

`packages/core/src/notifications/channels/slack.ts`:
```ts
import type { NotifyPayload, Result } from '../dispatcher'

export async function sendSlack(cfg: { webhook: string }, p: NotifyPayload, fetchImpl: typeof fetch = fetch): Promise<Result> {
  const body = {
    text: `*${p.title}*${p.subtitle ? ` — ${p.subtitle}` : ''}\n${p.message}`,
    attachments: p.level === 'urgent'
      ? [{ color: 'danger', text: ':rotating_light: urgent' }]
      : undefined
  }
  try {
    const res = await fetchImpl(cfg.webhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, detail: e?.message ?? String(e) }
  }
}
```

- [ ] **Step 3: Telegram (send-only — bidirectional is v0.2)**

`packages/core/src/notifications/channels/telegram.ts`:
```ts
import type { NotifyPayload, Result } from '../dispatcher'

export async function sendTelegram(
  cfg: { botToken: string; chatId: string },
  p: NotifyPayload,
  fetchImpl: typeof fetch = fetch
): Promise<Result> {
  const url = `https://api.telegram.org/bot${encodeURIComponent(cfg.botToken)}/sendMessage`
  const text = `*${escapeMd(p.title)}*${p.subtitle ? ` · ${escapeMd(p.subtitle)}` : ''}\n${escapeMd(p.message)}`
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: cfg.chatId, text, parse_mode: 'MarkdownV2' })
    })
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, detail: e?.message ?? String(e) }
  }
}

function escapeMd(s: string): string {
  return s.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1')
}
```

- [ ] **Step 4: Email via SMTP (nodemailer optional, fall back to error if not installed)**

`packages/core/src/notifications/channels/email.ts`:
```ts
import type { NotifyPayload, Result } from '../dispatcher'

export interface EmailCfg {
  smtp: { host: string; port: number; secure: boolean; user?: string; pass?: string }
  from: string
  to: string
}

export async function sendEmail(cfg: EmailCfg, p: NotifyPayload): Promise<Result> {
  let nodemailer: any
  try {
    nodemailer = await import('nodemailer')
  } catch {
    return { ok: false, detail: 'nodemailer not installed; run `pnpm add nodemailer`' }
  }
  try {
    const t = nodemailer.createTransport({
      host: cfg.smtp.host, port: cfg.smtp.port, secure: cfg.smtp.secure,
      auth: cfg.smtp.user ? { user: cfg.smtp.user, pass: cfg.smtp.pass } : undefined
    })
    await t.sendMail({
      from: cfg.from, to: cfg.to,
      subject: `[glm] ${p.title}${p.subtitle ? ` · ${p.subtitle}` : ''}`,
      text: p.message
    })
    return { ok: true }
  } catch (e: any) {
    return { ok: false, detail: e?.message ?? String(e) }
  }
}
```

- [ ] **Step 5: Generic webhook**

`packages/core/src/notifications/channels/webhook.ts`:
```ts
import type { NotifyPayload, Result } from '../dispatcher'

export async function sendWebhook(
  cfg: { url: string; headers?: Record<string, string> },
  p: NotifyPayload,
  fetchImpl: typeof fetch = fetch
): Promise<Result> {
  try {
    const res = await fetchImpl(cfg.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(cfg.headers ?? {}) },
      body: JSON.stringify({ title: p.title, message: p.message, subtitle: p.subtitle, level: p.level ?? 'info', ts: new Date().toISOString() })
    })
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, detail: e?.message ?? String(e) }
  }
}
```

- [ ] **Step 6: Channel tests with fetch stubbing**

`packages/core/test/unit/notify-channels.test.ts`:
```ts
import { describe, expect, test, vi } from 'vitest'
import { sendDiscord } from '../../src/notifications/channels/discord'
import { sendSlack } from '../../src/notifications/channels/slack'
import { sendTelegram } from '../../src/notifications/channels/telegram'
import { sendWebhook } from '../../src/notifications/channels/webhook'

const okFetch  = vi.fn().mockResolvedValue({ ok: true } as Response)
const badFetch = vi.fn().mockResolvedValue({ ok: false, status: 502 } as Response)
const throwFetch = vi.fn().mockRejectedValue(new Error('boom'))

describe('notification channels', () => {
  test('discord ok', async () => {
    const r = await sendDiscord({ webhook: 'http://x' }, { title: 't', message: 'm' }, okFetch as any)
    expect(r.ok).toBe(true)
  })
  test('discord 5xx → failure', async () => {
    const r = await sendDiscord({ webhook: 'http://x' }, { title: 't', message: 'm' }, badFetch as any)
    expect(r.ok).toBe(false); expect(r.detail).toMatch(/502/)
  })
  test('slack throw → failure', async () => {
    const r = await sendSlack({ webhook: 'http://x' }, { title: 't', message: 'm' }, throwFetch as any)
    expect(r.ok).toBe(false); expect(r.detail).toMatch(/boom/)
  })
  test('telegram escapes markdown special chars', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true } as Response)
    await sendTelegram({ botToken: 'x', chatId: 'y' }, { title: 'hi (you)', message: 'a*b_c' }, f as any)
    const body = JSON.parse((f.mock.calls[0]![1] as any).body)
    expect(body.text).not.toMatch(/[^\\]\(/)
    expect(body.text).toMatch(/\\\(/)
    expect(body.parse_mode).toBe('MarkdownV2')
  })
  test('webhook posts JSON payload', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true } as Response)
    await sendWebhook({ url: 'http://x', headers: { 'x-foo': '1' } }, { title: 't', message: 'm', level: 'urgent' }, f as any)
    const init = f.mock.calls[0]![1] as any
    expect(init.headers['x-foo']).toBe('1')
    const body = JSON.parse(init.body)
    expect(body.level).toBe('urgent')
  })
})
```

- [ ] **Step 7: Run — PASS**

```bash
pnpm vitest run packages/core/test/unit/notify-channels.test.ts
```

- [ ] **Step 8: `glm notify test <channel>` CLI subcommand**

`packages/cli/src/commands/notify.ts`:
```ts
import { Command } from 'commander'
import kleur from 'kleur'
import { connectDaemon } from '../auto-spawn'

export function registerNotify(parent: Command): void {
  const notify = parent.command('notify')
  notify.command('test <channel>')
    .description('Send a test message through the named channel')
    .action(async (channelName: string) => {
      const c = await connectDaemon()
      const r = await c.call('notify.test', { channel: channelName }) as { ok: boolean; detail?: string }
      if (r.ok) console.log(kleur.green('✓'), `test sent via ${channelName}`)
      else { console.error(kleur.red('✗'), `${channelName}: ${r.detail}`); process.exit(1) }
    })
  notify.command('config <channel> <key> <value>')
    .description('Set a value on a notification channel')
    .action(async (channel: string, key: string, value: string) => {
      const c = await connectDaemon()
      await c.call('notify.config', { channel, key, value })
      console.log(kleur.green('✓'), `${channel}.${key} = ${value}`)
    })
}
```

- [ ] **Step 9: Commit**

```bash
git add packages
git commit -m "feat(notifications): Discord/Slack/Telegram/Email/generic webhook channels + glm notify test"
```

---

## Task 12.5: Structured-question payload for hooks (P10-Fix-6 — spec §9.19)

**Files:**
- Modify: `packages/core/src/hooks/sdk/context.ts` (P5-owned; P10 augments via TypeScript interface declaration merge in a new file)
- Create: `packages/core/src/hooks/sdk/structured-question.ts` (the P10-owned augmentation + implementation)
- Create: `packages/core/src/notifications/structured-modal.ts` (terminal modal for v0.1)
- Test: `packages/core/test/unit/structured-question.test.ts`

P5 defined the basic `HookContext` (notify / ask / log primitives). P10 extends it with a structured-question API so hooks can present single-/multi-/freetext choices uniformly across the terminal modal (v0.1) and Telegram/Discord buttons (deferred to v0.2 per spec §9.22).

- [ ] **Step 1: Type augmentation**

`packages/core/src/hooks/sdk/structured-question.ts`:
```ts
import type { HookContext } from './context'

export type StructuredQuestion = {
  type: 'single' | 'multi' | 'freetext'
  question: string
  options?: Array<{ id: string; label: string; description?: string }>
}

export interface StructuredAnswer {
  selected: string[]
  freetext?: string
}

// TypeScript module augmentation — adds `askStructured` to the shared HookContext
// without P5 having to re-export it. P5's interface stays the canonical signature;
// P10 only adds a new optional method.
declare module './context' {
  interface HookContext {
    askStructured(q: StructuredQuestion): Promise<StructuredAnswer>
  }
}

/**
 * Default implementation injected when the daemon constructs a HookContext.
 * Routes through the notification subsystem — terminal modal in v0.1.
 * Telegram/Discord button replies arrive in v0.2 (see notifications/reply-daemon.stub.ts).
 */
export function makeAskStructured(opts: {
  showTerminalModal: (q: StructuredQuestion) => Promise<StructuredAnswer>
  notify: (event: 'notification.requestUserResponse', payload: { question: StructuredQuestion }) => Promise<void>
}): HookContext['askStructured'] {
  return async function askStructured(this: HookContext, q: StructuredQuestion) {
    await opts.notify('notification.requestUserResponse', { question: q })
    return opts.showTerminalModal(q)
  }
}
```

- [ ] **Step 2: Terminal modal renderer**

`packages/core/src/notifications/structured-modal.ts`:
```ts
import readline from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import type { StructuredQuestion, StructuredAnswer } from '../hooks/sdk/structured-question'

export async function renderTerminalModal(q: StructuredQuestion): Promise<StructuredAnswer> {
  const rl = readline.createInterface({ input: stdin, output: stdout })
  try {
    console.log(`\n${q.question}\n`)
    if (q.type === 'freetext') {
      const t = await rl.question('> ')
      return { selected: [], freetext: t.trim() }
    }
    (q.options ?? []).forEach((o, i) => console.log(`  [${i + 1}] ${o.label}${o.description ? ` — ${o.description}` : ''}`))
    const prompt = q.type === 'multi' ? '\npick numbers (comma-separated): ' : '\npick number: '
    const raw = (await rl.question(prompt)).trim()
    const picks = raw.split(/\s*,\s*/).map(s => Number(s)).filter(n => Number.isFinite(n))
    const ids = picks.map(p => q.options![p - 1]?.id).filter((s): s is string => !!s)
    return { selected: q.type === 'single' ? ids.slice(0, 1) : ids }
  } finally { rl.close() }
}
```

- [ ] **Step 3: Unit test (mocked terminal)**

`packages/core/test/unit/structured-question.test.ts`:
```ts
import { describe, expect, test, vi } from 'vitest'
import { makeAskStructured, type StructuredQuestion } from '../../src/hooks/sdk/structured-question'

describe('askStructured (P10-Fix-6)', () => {
  test('routes to notification + returns modal answer', async () => {
    const notify = vi.fn().mockResolvedValue(undefined)
    const modal = vi.fn(async (q: StructuredQuestion) => ({ selected: ['yes'] }))
    const ask = makeAskStructured({ showTerminalModal: modal, notify })
    const a = await ask.call({} as any, { type: 'single', question: 'continue?', options: [
      { id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }
    ]})
    expect(a.selected).toEqual(['yes'])
    expect(notify).toHaveBeenCalledWith('notification.requestUserResponse', expect.objectContaining({ question: expect.objectContaining({ question: 'continue?' }) }))
    expect(modal).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 4: Run — PASS**

```bash
pnpm vitest run packages/core/test/unit/structured-question.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(hooks): structured-question (single/multi/freetext) via notifications + terminal modal v0.1"
```

---


## Task 13: Resilience — Preemptive compaction + todo preserver

**Files:**
- Create: `packages/core/src/resilience/preemptive-compaction.ts`
- Create: `packages/core/src/resilience/todo-preserver.ts`
- Test: `packages/core/test/unit/preemptive-compaction.test.ts`
- Test: `packages/core/test/unit/todo-preserver.test.ts`

- [ ] **Step 1: Preemptive compactor — monitors token usage**

`packages/core/src/resilience/preemptive-compaction.ts`:
```ts
import type { Logger } from '../log'
import type { SessionId } from '@glm/shared'

export interface CompactionThresholds {
  preemptiveStartPercent: number   // default 0.80 — kick BG compaction when 80% used
  hardLimitPercent: number          // default 0.95 — emergency synchronous compaction
}

export const DEFAULT_THRESHOLDS: CompactionThresholds = {
  preemptiveStartPercent: 0.80,
  hardLimitPercent: 0.95
}

export interface TokenUsageSample {
  sessionId: SessionId
  usable: number             // model context after reserve+buffer (P7)
  used: number
  step: number
}

export type CompactionMode = 'idle' | 'preemptive-bg' | 'emergency-sync'

export interface CompactionDecision {
  mode: CompactionMode
  reason: string
}

export class PreemptiveCompactor {
  private inFlight: Set<SessionId> = new Set()

  constructor(
    private kick: (sid: SessionId, mode: 'preemptive-bg' | 'emergency-sync') => Promise<void>,
    private log: Logger,
    private cfg: CompactionThresholds = DEFAULT_THRESHOLDS
  ) {}

  decide(sample: TokenUsageSample): CompactionDecision {
    const pct = sample.used / Math.max(1, sample.usable)
    if (pct >= this.cfg.hardLimitPercent) return { mode: 'emergency-sync', reason: `at ${(pct*100).toFixed(1)}% — hard limit` }
    if (pct >= this.cfg.preemptiveStartPercent) return { mode: 'preemptive-bg', reason: `at ${(pct*100).toFixed(1)}% — preemptive` }
    return { mode: 'idle', reason: `at ${(pct*100).toFixed(1)}%` }
  }

  async onSample(sample: TokenUsageSample): Promise<CompactionDecision> {
    const d = this.decide(sample)
    if (d.mode === 'idle') return d
    if (this.inFlight.has(sample.sessionId) && d.mode === 'preemptive-bg') {
      this.log.debug({ sid: sample.sessionId }, 'compaction already in flight — skip preemptive')
      return d
    }
    this.inFlight.add(sample.sessionId)
    // emergency-sync is awaited; preemptive-bg fires and forgets
    if (d.mode === 'emergency-sync') {
      try { await this.kick(sample.sessionId, 'emergency-sync') }
      finally { this.inFlight.delete(sample.sessionId) }
    } else {
      void this.kick(sample.sessionId, 'preemptive-bg')
        .finally(() => this.inFlight.delete(sample.sessionId))
    }
    return d
  }
}
```

- [ ] **Step 2: Compaction-todo preserver — guarantees ## Progress in template**

`packages/core/src/resilience/todo-preserver.ts`:
```ts
export interface TodoItem {
  id: string
  text: string
  status: 'pending' | 'in_progress' | 'blocked' | 'done'
  reason?: string
}

/**
 * Compaction template's `## Progress` section is critical context that
 * MUST survive every compaction. The preserver re-injects it into the
 * compacted summary if the LLM skipped it.
 *
 * Returns the *amended* summary text and a flag indicating whether we
 * had to inject (which means the LLM dropped the todos and we should
 * log a warning).
 */
export function preserveProgress(compactedSummary: string, todos: TodoItem[]): { summary: string; injected: boolean } {
  const pending = todos.filter(t => t.status === 'pending' || t.status === 'in_progress' || t.status === 'blocked')
  if (pending.length === 0) return { summary: compactedSummary, injected: false }

  // Already has a ## Progress section that mentions enough of the todos? Then trust it.
  const hasProgress = /^##\s+Progress\b/m.test(compactedSummary)
  const mentionsAtLeastHalf = pending.filter(t =>
    compactedSummary.toLowerCase().includes(t.text.toLowerCase().slice(0, 30))
  ).length >= Math.ceil(pending.length / 2)

  if (hasProgress && mentionsAtLeastHalf) return { summary: compactedSummary, injected: false }

  // Inject our own ## Progress block immediately after the first heading.
  const block = [
    '## Progress',
    '',
    '### Done',
    todos.filter(t => t.status === 'done').map(t => `- ${t.text}`).join('\n') || '(none)',
    '',
    '### InProgress',
    todos.filter(t => t.status === 'in_progress').map(t => `- ${t.text}`).join('\n') || '(none)',
    '',
    '### Blocked',
    todos.filter(t => t.status === 'blocked').map(t => `- ${t.text}${t.reason ? ` — ${t.reason}` : ''}`).join('\n') || '(none)',
    '',
    '### Pending',
    todos.filter(t => t.status === 'pending').map(t => `- ${t.text}`).join('\n') || '(none)',
    ''
  ].join('\n')

  if (hasProgress) {
    // Replace existing progress section with our authoritative version
    const replaced = compactedSummary.replace(/^##\s+Progress[\s\S]*?(?=^##\s+|\Z)/m, block + '\n')
    return { summary: replaced, injected: true }
  }
  // Otherwise insert after first heading (or top if none)
  const headingMatch = compactedSummary.match(/^#.*?\n/m)
  if (headingMatch) {
    const idx = headingMatch.index! + headingMatch[0].length
    return { summary: compactedSummary.slice(0, idx) + '\n' + block + '\n' + compactedSummary.slice(idx), injected: true }
  }
  return { summary: block + '\n\n' + compactedSummary, injected: true }
}
```

- [ ] **Step 3: Preemptive compactor test**

`packages/core/test/unit/preemptive-compaction.test.ts`:
```ts
import { describe, expect, test, vi } from 'vitest'
import { PreemptiveCompactor, DEFAULT_THRESHOLDS } from '../../src/resilience/preemptive-compaction'
import { createLogger } from '../../src/log'

describe('PreemptiveCompactor', () => {
  test('idle below 80%', () => {
    const c = new PreemptiveCompactor(async () => {}, createLogger('t'))
    const d = c.decide({ sessionId: 'S', usable: 100_000, used: 70_000, step: 1 })
    expect(d.mode).toBe('idle')
  })
  test('preemptive at 85%', () => {
    const c = new PreemptiveCompactor(async () => {}, createLogger('t'))
    expect(c.decide({ sessionId: 'S', usable: 100_000, used: 85_000, step: 1 }).mode).toBe('preemptive-bg')
  })
  test('emergency at 96%', () => {
    const c = new PreemptiveCompactor(async () => {}, createLogger('t'))
    expect(c.decide({ sessionId: 'S', usable: 100_000, used: 96_000, step: 1 }).mode).toBe('emergency-sync')
  })
  test('onSample calls kick for preemptive in background', async () => {
    const kick = vi.fn().mockResolvedValue(undefined)
    const c = new PreemptiveCompactor(kick, createLogger('t'))
    await c.onSample({ sessionId: 'S', usable: 100_000, used: 85_000, step: 1 })
    expect(kick).toHaveBeenCalledWith('S', 'preemptive-bg')
  })
  test('onSample awaits emergency-sync', async () => {
    let resolved = false
    const kick = vi.fn().mockImplementation(async () => { await new Promise(r => setTimeout(r, 5)); resolved = true })
    const c = new PreemptiveCompactor(kick, createLogger('t'))
    await c.onSample({ sessionId: 'S', usable: 100_000, used: 99_000, step: 1 })
    expect(resolved).toBe(true)
  })
  test('skips preemptive when one is in flight', async () => {
    let resolveOne!: () => void
    const kick = vi.fn().mockImplementation(() => new Promise<void>(r => { resolveOne = r }))
    const c = new PreemptiveCompactor(kick, createLogger('t'))
    void c.onSample({ sessionId: 'S', usable: 100_000, used: 85_000, step: 1 })
    await c.onSample({ sessionId: 'S', usable: 100_000, used: 86_000, step: 2 })
    expect(kick).toHaveBeenCalledTimes(1)
    resolveOne()
  })
})
```

- [ ] **Step 4: Todo preserver test**

`packages/core/test/unit/todo-preserver.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { preserveProgress } from '../../src/resilience/todo-preserver'

const TODOS = [
  { id: '1', text: 'wire LSP', status: 'done' as const },
  { id: '2', text: 'add daemon RPC', status: 'in_progress' as const },
  { id: '3', text: 'ship readme', status: 'pending' as const },
  { id: '4', text: 'fix flaky test', status: 'blocked' as const, reason: 'race in queue' }
]

describe('preserveProgress', () => {
  test('no todos → unchanged', () => {
    const { summary, injected } = preserveProgress('# x\n', [])
    expect(injected).toBe(false)
    expect(summary).toBe('# x\n')
  })
  test('missing ## Progress → injected', () => {
    const { summary, injected } = preserveProgress('# x\nsome content', TODOS)
    expect(injected).toBe(true)
    expect(summary).toMatch(/## Progress/)
    expect(summary).toMatch(/wire LSP/)
    expect(summary).toMatch(/race in queue/)
  })
  test('## Progress without enough mentions → replaced', () => {
    const broken = '# x\n## Progress\n(empty)\n## Next\nnext\n'
    const { summary, injected } = preserveProgress(broken, TODOS)
    expect(injected).toBe(true)
    expect(summary).toMatch(/add daemon RPC/)
    expect(summary).toMatch(/## Next/)   // we did not eat other sections
  })
  test('## Progress mentioning all todos → trusted', () => {
    const full = '# x\n## Progress\nwire LSP, add daemon RPC, ship readme, fix flaky test\n'
    const { injected } = preserveProgress(full, TODOS)
    expect(injected).toBe(false)
  })
})
```

- [ ] **Step 5: Run — PASS**

```bash
pnpm vitest run packages/core/test/unit/preemptive-compaction.test.ts packages/core/test/unit/todo-preserver.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat(resilience): preemptive compactor + compaction-todo preserver"
```

---

## Task 14: Resilience — Session recovery hooks

**Note (P10-Fix-12):** The 30-second pause-after-N-network-failures behavior is implemented in **P6-Fix-4** (`packages/llm-router/src/retry/policy.ts`). P10's session-recovery layer here is for higher-level scenarios (tool-result alignment, thinking-block mismatch, etc.) and does NOT re-implement network-retry pacing — it consumes P6's retry policy as a dependency.

**Files:**
- Create: `packages/core/src/resilience/session-recovery.ts`
- Test: `packages/core/test/unit/session-recovery.test.ts`

- [ ] **Step 1: Session recovery dispatcher**

`packages/core/src/resilience/session-recovery.ts`:
```ts
import type { Logger } from '../log'

export type RecoveryScenario =
  | 'missing-tool-result'         // assistant referenced a tool_call but no tool_result in next turn
  | 'thinking-block-mismatch'     // streamed thinking_delta without preceding message_start
  | 'empty-message'                // assistant returned content [] / null
  | 'json-parse-fail'             // tool_use input arrived malformed
  | 'context-limit-1shot'         // model returned single response that already hit context_limit

export interface RecoveryInput<TMsg = any> {
  scenario: RecoveryScenario
  message: TMsg
  toolCallId?: string
  rawResponse?: string
}

export interface RecoveryOutput<TMsg = any> {
  action: 'inject-synthetic-tool-result' | 'drop-message' | 'retry-once' | 'compact-then-retry' | 'escalate'
  patched?: TMsg
  newToolResult?: { tool_call_id: string; content: string; is_error: boolean }
  reason: string
}

export class SessionRecovery {
  constructor(private log: Logger) {}

  recover<T>(input: RecoveryInput<T>): RecoveryOutput<T> {
    switch (input.scenario) {
      case 'missing-tool-result':
        if (!input.toolCallId) {
          return { action: 'drop-message', reason: 'no tool_call_id to attach synthetic result' }
        }
        return {
          action: 'inject-synthetic-tool-result',
          newToolResult: {
            tool_call_id: input.toolCallId,
            content: '[glm:auto-recovered] previous tool call interrupted; treat as no-op and choose a different action.',
            is_error: true
          },
          reason: 'injected synthetic tool_result so conversation can continue'
        }
      case 'thinking-block-mismatch':
        return { action: 'drop-message', reason: 'orphan thinking block without message envelope — drop' }
      case 'empty-message':
        return { action: 'retry-once', reason: 'empty assistant message — retry once with same context' }
      case 'json-parse-fail':
        return { action: 'retry-once', reason: 'malformed tool_use json — retry, model usually self-corrects' }
      case 'context-limit-1shot':
        return { action: 'compact-then-retry', reason: 'context window hit in single response — compact, then retry' }
    }
  }
}
```

- [ ] **Step 2: Unit test**

`packages/core/test/unit/session-recovery.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { SessionRecovery } from '../../src/resilience/session-recovery'
import { createLogger } from '../../src/log'

const r = new SessionRecovery(createLogger('t'))

describe('SessionRecovery', () => {
  test('missing-tool-result → synthetic injected', () => {
    const o = r.recover({ scenario: 'missing-tool-result', message: {}, toolCallId: 'tc-1' })
    expect(o.action).toBe('inject-synthetic-tool-result')
    expect(o.newToolResult!.is_error).toBe(true)
    expect(o.newToolResult!.tool_call_id).toBe('tc-1')
  })
  test('missing-tool-result without id → drop', () => {
    const o = r.recover({ scenario: 'missing-tool-result', message: {} })
    expect(o.action).toBe('drop-message')
  })
  test('empty-message → retry-once', () => {
    expect(r.recover({ scenario: 'empty-message', message: {} }).action).toBe('retry-once')
  })
  test('thinking-block-mismatch → drop', () => {
    expect(r.recover({ scenario: 'thinking-block-mismatch', message: {} }).action).toBe('drop-message')
  })
  test('json-parse-fail → retry-once', () => {
    expect(r.recover({ scenario: 'json-parse-fail', message: {} }).action).toBe('retry-once')
  })
  test('context-limit-1shot → compact-then-retry', () => {
    expect(r.recover({ scenario: 'context-limit-1shot', message: {} }).action).toBe('compact-then-retry')
  })
})
```

- [ ] **Step 3: Run — PASS**

```bash
pnpm vitest run packages/core/test/unit/session-recovery.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add packages/core
git commit -m "feat(resilience): session recovery hooks for 5 known failure scenarios"
```

---

## Task 15: Resilience — Trace timeline + verification tier-selector

**Files:**
- Create: `packages/core/src/resilience/trace-timeline.ts`
- Create: `packages/core/src/resilience/verification-tier.ts`
- Test: `packages/core/test/unit/trace-timeline.test.ts`
- Test: `packages/core/test/unit/verification-tier.test.ts`

- [ ] **Step 1: Trace timeline query (uses `events` table from P1)**

`packages/core/src/resilience/trace-timeline.ts`:
```ts
import type { Database } from 'better-sqlite3'
import type { SessionId } from '@glm/shared'

export interface TimelineRow {
  ts: string
  topic: string
  data: Record<string, unknown>
}

export interface TimelineFilter {
  topics?: string[]
  since?: string
  until?: string
  limit?: number
}

export class TraceTimeline {
  constructor(private db: Database) {}

  query(sid: SessionId, f: TimelineFilter = {}): TimelineRow[] {
    const where: string[] = ['session_id = ?']
    const params: unknown[] = [sid]
    if (f.topics && f.topics.length > 0) {
      where.push(`topic IN (${f.topics.map(() => '?').join(',')})`)
      params.push(...f.topics)
    }
    if (f.since) { where.push('ts >= ?'); params.push(f.since) }
    if (f.until) { where.push('ts < ?');  params.push(f.until) }
    const limit = Math.min(f.limit ?? 1000, 10_000)
    const rows = this.db.prepare(`
      SELECT ts, topic, data FROM events
      WHERE ${where.join(' AND ')}
      ORDER BY ts ASC LIMIT ?
    `).all(...params, limit) as Array<{ ts: string; topic: string; data: string }>
    return rows.map(r => ({ ts: r.ts, topic: r.topic, data: safeParse(r.data) }))
  }

  /**
   * Render an ASCII timeline suitable for `glm trace timeline <id>`.
   */
  render(rows: TimelineRow[]): string {
    if (rows.length === 0) return '(no events)\n'
    const out: string[] = []
    let prev: number | null = null
    for (const r of rows) {
      const t = Date.parse(r.ts)
      const delta = prev == null ? '+0ms' : (() => {
        const d = t - prev!
        if (d < 1000) return `+${d}ms`
        if (d < 60_000) return `+${(d/1000).toFixed(1)}s`
        return `+${(d/60_000).toFixed(1)}m`
      })()
      out.push(`${r.ts}  ${delta.padStart(8)}  ${r.topic.padEnd(28)}  ${summarize(r.data)}`)
      prev = t
    }
    return out.join('\n') + '\n'
  }
}

function safeParse(s: string): Record<string, unknown> {
  try { return JSON.parse(s) } catch { return { _raw: s } }
}
function summarize(d: Record<string, unknown>): string {
  const keys = Object.keys(d).slice(0, 4)
  return keys.map(k => `${k}=${truncate(JSON.stringify(d[k]), 40)}`).join(' ')
}
function truncate(s: string, n: number): string { return s.length <= n ? s : s.slice(0, n - 1) + '…' }
```

- [ ] **Step 2: Trace timeline test**

`packages/core/test/unit/trace-timeline.test.ts`:
```ts
import { afterEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { openDb, runMigrations } from '../../src/storage'
import { TraceTimeline } from '../../src/resilience/trace-timeline'

let tmp: string
afterEach(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }) })

describe('TraceTimeline', () => {
  test('query orders rows and filters by topic', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-tt-'))
    const db = openDb(path.join(tmp, 's.db'))
    runMigrations(db)
    const ins = db.prepare(`INSERT INTO events(ts, session_id, topic, data) VALUES (?,?,?,?)`)
    ins.run('2026-05-14T00:00:00Z', 'S1', 'hook.PreToolUse', JSON.stringify({ tool: 'Edit' }))
    ins.run('2026-05-14T00:00:01Z', 'S1', 'skill.invoke',    JSON.stringify({ name: 'plan' }))
    ins.run('2026-05-14T00:00:02Z', 'S2', 'hook.PreToolUse', JSON.stringify({ tool: 'Read' }))   // wrong session
    const tt = new TraceTimeline(db)
    const rows = tt.query('S1', { topics: ['hook.PreToolUse'] })
    expect(rows).toHaveLength(1)
    expect(rows[0]!.data.tool).toBe('Edit')
  })

  test('render produces aligned delta column', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-tt-'))
    const db = openDb(path.join(tmp, 's.db'))
    runMigrations(db)
    const ins = db.prepare(`INSERT INTO events(ts, session_id, topic, data) VALUES (?,?,?,?)`)
    ins.run('2026-05-14T00:00:00.000Z', 'S1', 'A', JSON.stringify({ x: 1 }))
    ins.run('2026-05-14T00:00:00.500Z', 'S1', 'B', JSON.stringify({ y: 2 }))
    const tt = new TraceTimeline(db)
    const out = tt.render(tt.query('S1'))
    expect(out).toMatch(/\+0ms/)
    expect(out).toMatch(/\+500ms/)
  })
})
```

- [ ] **Step 3: Verification tier-selector**

`packages/core/src/resilience/verification-tier.ts`:
```ts
export interface VerificationRiskSignals {
  changesProdCode: boolean          // touches src/ vs test/ vs docs/
  changesAuthOrSec: boolean         // touches auth/, security/, crypto, secrets
  changesPublicApi: boolean         // exported symbols in public api files
  numFilesChanged: number
  hasTestsAdded: boolean
  isLongHorizon: boolean
  releasePhase: boolean             // CHANGELOG entry / version bump nearby
}

export type VerifyTier = 'light' | 'standard' | 'deep'
export type ModelChoice = 'GLM-4.5-Air' | 'GLM-5-Turbo' | 'GLM-5.1'

export interface VerifyTierDecision {
  tier: VerifyTier
  model: ModelChoice
  reasons: string[]
  thinking: boolean
}

export function selectVerifyTier(s: VerificationRiskSignals): VerifyTierDecision {
  const reasons: string[] = []
  let score = 0

  if (s.changesAuthOrSec) { score += 3; reasons.push('auth/sec change (+3)') }
  if (s.changesPublicApi) { score += 2; reasons.push('public api change (+2)') }
  if (s.releasePhase)     { score += 2; reasons.push('release phase (+2)') }
  if (s.isLongHorizon)    { score += 1; reasons.push('long-horizon (+1)') }
  if (s.changesProdCode)  { score += 1; reasons.push('prod code change (+1)') }
  if (s.numFilesChanged > 10) { score += 1; reasons.push(`>10 files (${s.numFilesChanged}) (+1)`) }
  if (!s.hasTestsAdded && s.changesProdCode) { score += 1; reasons.push('no tests added (+1)') }

  if (score >= 5) return { tier: 'deep',     model: 'GLM-5.1',      reasons, thinking: true }
  if (score >= 2) return { tier: 'standard', model: 'GLM-5-Turbo',  reasons, thinking: false }
  return                  { tier: 'light',    model: 'GLM-4.5-Air',  reasons, thinking: false }
}
```

- [ ] **Step 4: Tier-selector test**

`packages/core/test/unit/verification-tier.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { selectVerifyTier } from '../../src/resilience/verification-tier'

describe('selectVerifyTier', () => {
  test('docs-only change → light / GLM-4.5-Air', () => {
    const d = selectVerifyTier({
      changesProdCode: false, changesAuthOrSec: false, changesPublicApi: false,
      numFilesChanged: 1, hasTestsAdded: false, isLongHorizon: false, releasePhase: false
    })
    expect(d.tier).toBe('light'); expect(d.model).toBe('GLM-4.5-Air')
  })
  test('auth change → deep / GLM-5.1 + thinking', () => {
    const d = selectVerifyTier({
      changesProdCode: true, changesAuthOrSec: true, changesPublicApi: false,
      numFilesChanged: 2, hasTestsAdded: true, isLongHorizon: false, releasePhase: false
    })
    expect(d.tier).toBe('deep')
    expect(d.model).toBe('GLM-5.1')
    expect(d.thinking).toBe(true)
  })
  test('moderate change → standard / GLM-5-Turbo', () => {
    const d = selectVerifyTier({
      changesProdCode: true, changesAuthOrSec: false, changesPublicApi: false,
      numFilesChanged: 3, hasTestsAdded: true, isLongHorizon: false, releasePhase: false
    })
    expect(d.tier).toBe('standard'); expect(d.model).toBe('GLM-5-Turbo')
  })
  test('release phase escalates', () => {
    const d = selectVerifyTier({
      changesProdCode: true, changesAuthOrSec: false, changesPublicApi: true,
      numFilesChanged: 5, hasTestsAdded: true, isLongHorizon: false, releasePhase: true
    })
    expect(d.tier).toBe('deep')
  })
})
```

- [ ] **Step 5: Run — PASS**

```bash
pnpm vitest run packages/core/test/unit/trace-timeline.test.ts packages/core/test/unit/verification-tier.test.ts
```

- [ ] **Step 6: `glm trace timeline <session>` CLI**

`packages/cli/src/commands/trace.ts`:
```ts
import { Command } from 'commander'
import { connectDaemon } from '../auto-spawn'

export function registerTrace(parent: Command): void {
  const trace = parent.command('trace')
  trace.command('timeline <sessionId>')
    .option('--topic <topic...>', 'filter by topic (repeat ok)')
    .option('--since <iso>', 'only events ≥ this ISO timestamp')
    .option('--limit <n>', 'cap rows', '500')
    .description('Render the per-event timeline for a session')
    .action(async (sessionId: string, opts: { topic?: string[]; since?: string; limit: string }) => {
      const c = await connectDaemon()
      const rendered = await c.call('trace.timeline', {
        sessionId, topics: opts.topic, since: opts.since, limit: Number(opts.limit)
      }) as string
      process.stdout.write(rendered)
    })
}
```

- [ ] **Step 7: Commit**

```bash
git add packages
git commit -m "feat(resilience): trace timeline (events table) + verification tier-selector"
```

---

## Task 16: Workspace tool — `glm commit` / `/commit` (agentic)

**Files:**
- Create: `packages/core/src/workspace/commit/git-overview.ts`
- Create: `packages/core/src/workspace/commit/git-file-diff.ts`
- Create: `packages/core/src/workspace/commit/git-hunk.ts`
- Create: `packages/core/src/workspace/commit/conventional.ts`
- Create: `packages/core/src/workspace/commit/changelog.ts`
- Create: `packages/core/src/workspace/commit/pre-commit.ts`
- Create: `packages/core/src/workspace/commit/agent.ts`
- Create: `packages/cli/src/commands/commit.ts`
- Test: `packages/core/test/unit/commit-conventional.test.ts`
- Test: `packages/core/test/unit/commit-changelog.test.ts`
- Test: `packages/core/test/integration/commit-agent.test.ts`

- [ ] **Step 1: Built-in git helper tools (used by the commit sub-agent)**

`packages/core/src/workspace/commit/git-overview.ts`:
```ts
import { execFileSync } from 'node:child_process'

export interface GitOverview {
  branch: string
  upstream: string | null
  ahead: number
  behind: number
  stagedFiles: string[]
  unstagedFiles: string[]
  untrackedFiles: string[]
  conflicted: string[]
  recentCommits: Array<{ sha: string; subject: string }>
}

export function gitOverview(cwd: string): GitOverview {
  const g = (...args: string[]): string => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim()
  const branch = g('rev-parse', '--abbrev-ref', 'HEAD')
  let upstream: string | null = null
  let ahead = 0, behind = 0
  try {
    upstream = g('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}')
    const ab = g('rev-list', '--left-right', '--count', `${upstream}...HEAD`).split('\t')
    behind = Number(ab[0] ?? 0); ahead = Number(ab[1] ?? 0)
  } catch { /* no upstream */ }
  const status = g('status', '--porcelain=v1', '-z').split('\0').filter(Boolean)
  const stagedFiles: string[] = []
  const unstagedFiles: string[] = []
  const untrackedFiles: string[] = []
  const conflicted: string[] = []
  for (const entry of status) {
    const x = entry[0], y = entry[1], path = entry.slice(3)
    if (x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D')) conflicted.push(path)
    else if (x === '?' && y === '?') untrackedFiles.push(path)
    else {
      if (x !== ' ' && x !== '?') stagedFiles.push(path)
      if (y !== ' ' && y !== '?') unstagedFiles.push(path)
    }
  }
  const log = g('log', '--oneline', '-n', '10').split('\n').filter(Boolean).map(line => {
    const sp = line.indexOf(' ')
    return { sha: line.slice(0, sp), subject: line.slice(sp + 1) }
  })
  return { branch, upstream, ahead, behind, stagedFiles, unstagedFiles, untrackedFiles, conflicted, recentCommits: log }
}
```

`packages/core/src/workspace/commit/git-file-diff.ts`:
```ts
import { execFileSync } from 'node:child_process'

export function gitFileDiff(cwd: string, path: string, staged: boolean): string {
  return execFileSync('git', ['-C', cwd, 'diff', staged ? '--staged' : 'HEAD', '--', path], { encoding: 'utf8' })
}
```

`packages/core/src/workspace/commit/git-hunk.ts`:
```ts
import { execFileSync } from 'node:child_process'
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

export interface Hunk {
  file: string
  startLineOld: number
  countOld: number
  startLineNew: number
  countNew: number
  body: string
}

/**
 * Parse `git diff -U0` output into per-hunk records.
 */
export function listHunks(cwd: string, paths: string[], staged: boolean): Hunk[] {
  if (paths.length === 0) return []
  const out = execFileSync('git', ['-C', cwd, 'diff', staged ? '--staged' : 'HEAD', '-U3', '--', ...paths], { encoding: 'utf8' })
  const hunks: Hunk[] = []
  let file = ''
  const lines = out.split('\n')
  let i = 0
  while (i < lines.length) {
    const l = lines[i]!
    if (l.startsWith('+++ b/')) { file = l.slice(6); i++; continue }
    const m = l.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/)
    if (m && file) {
      const body: string[] = [l]
      i++
      while (i < lines.length && !lines[i]!.startsWith('@@') && !lines[i]!.startsWith('diff --git')) {
        body.push(lines[i]!); i++
      }
      hunks.push({
        file,
        startLineOld: Number(m[1]), countOld: Number(m[2] ?? '1'),
        startLineNew: Number(m[3]), countNew: Number(m[4] ?? '1'),
        body: body.join('\n')
      })
      continue
    }
    if (l.startsWith('diff --git')) file = ''
    i++
  }
  return hunks
}

/**
 * Stage a specific subset of hunks. Uses `git apply --cached` with a tempfile patch.
 */
export function stageHunks(cwd: string, hunks: Hunk[]): void {
  if (hunks.length === 0) return
  // group by file
  const byFile = new Map<string, Hunk[]>()
  for (const h of hunks) {
    if (!byFile.has(h.file)) byFile.set(h.file, [])
    byFile.get(h.file)!.push(h)
  }
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-hunk-'))
  const patchFile = path.join(tmp, 'p.patch')
  const chunks: string[] = []
  for (const [file, hs] of byFile) {
    chunks.push(`diff --git a/${file} b/${file}`)
    chunks.push(`--- a/${file}`)
    chunks.push(`+++ b/${file}`)
    for (const h of hs) chunks.push(h.body)
  }
  writeFileSync(patchFile, chunks.join('\n') + '\n')
  try {
    execFileSync('git', ['-C', cwd, 'apply', '--cached', '--unidiff-zero', patchFile], { stdio: 'pipe' })
  } finally {
    try { unlinkSync(patchFile) } catch { /* ignore */ }
  }
}
```

- [ ] **Step 2: Conventional commit validator (filler/meta blocklist)**

`packages/core/src/workspace/commit/conventional.ts`:
```ts
export const CONVENTIONAL_TYPES = [
  'feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'chore', 'build', 'ci', 'revert'
] as const

export type ConventionalType = typeof CONVENTIONAL_TYPES[number]

export interface ParsedCommit {
  type: ConventionalType
  scope?: string
  breaking: boolean
  subject: string
  body?: string
}

const FILLER_PATTERNS = [
  /^(update|change|modify|edit|tweak|adjust)\b/i,
  /^(misc|stuff|things|various)\b/i,
  /^\s*$/,
]

const META_PATTERNS = [
  /\b(this commit|in this commit|adds? changes?)\b/i,
  /\b(let me|i'?ll|i have)\b/i,
  /\b(per (the )?(spec|design|plan|review))\b/i,
]

export function parse(msg: string): ParsedCommit | { error: string } {
  const firstLine = msg.split('\n')[0]!.trim()
  const m = firstLine.match(/^(feat|fix|docs|style|refactor|perf|test|chore|build|ci|revert)(\(([^)]+)\))?(!)?:\s+(.+)$/)
  if (!m) return { error: `header must match 'type(scope): subject' — got: ${firstLine}` }
  const subject = m[5]!.trim()
  if (subject.length < 10) return { error: 'subject is too short (≥ 10 chars)' }
  if (subject.length > 72) return { error: 'subject is too long (≤ 72 chars)' }
  if (FILLER_PATTERNS.some(p => p.test(subject))) return { error: `filler word in subject: "${subject}"` }
  if (META_PATTERNS.some(p => p.test(subject))) return { error: `meta phrase in subject: "${subject}"` }
  const body = msg.split('\n').slice(1).join('\n').trim() || undefined
  return {
    type: m[1] as ConventionalType,
    scope: m[3],
    breaking: m[4] === '!',
    subject,
    body
  }
}

export function format(p: ParsedCommit): string {
  const head = `${p.type}${p.scope ? `(${p.scope})` : ''}${p.breaking ? '!' : ''}: ${p.subject}`
  return p.body ? `${head}\n\n${p.body}` : head
}
```

- [ ] **Step 3: Conventional commit test**

`packages/core/test/unit/commit-conventional.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { parse, format } from '../../src/workspace/commit/conventional'

describe('conventional commit', () => {
  test('parses feat with scope', () => {
    const r = parse('feat(daemon): add socket reconnect logic')
    expect('error' in r).toBe(false)
    if ('error' in r) return
    expect(r.type).toBe('feat'); expect(r.scope).toBe('daemon')
  })
  test('rejects filler subjects', () => {
    expect(parse('feat: update stuff')).toEqual({ error: expect.stringMatching(/filler/) })
  })
  test('rejects meta phrases', () => {
    expect(parse('feat(x): this commit adds telemetry')).toEqual({ error: expect.stringMatching(/meta/) })
  })
  test('rejects bad header', () => {
    expect(parse('added a thing')).toHaveProperty('error')
  })
  test('rejects too-short subject', () => {
    expect(parse('fix: nope')).toHaveProperty('error')
  })
  test('rejects too-long subject', () => {
    expect(parse('feat: ' + 'a'.repeat(80))).toHaveProperty('error')
  })
  test('format round-trips parse', () => {
    const src = 'fix(rpc)!: handle malformed frame gracefully\n\nbody line 1\nbody line 2'
    const r = parse(src)
    if ('error' in r) throw new Error('unexpected')
    expect(format(r)).toBe(src)
  })
})
```

- [ ] **Step 4: Changelog entry**

`packages/core/src/workspace/commit/changelog.ts`:
```ts
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { ParsedCommit } from './conventional'

const TYPE_TO_SECTION: Record<ParsedCommit['type'], string> = {
  feat: 'Added', fix: 'Fixed', perf: 'Performance', docs: 'Documentation',
  refactor: 'Changed', style: 'Style', test: 'Tests', chore: 'Chore',
  build: 'Build', ci: 'CI', revert: 'Reverted'
}

export interface ChangelogEntry {
  unreleased: boolean
  section: string
  text: string
}

export function toEntry(c: ParsedCommit): ChangelogEntry {
  const scope = c.scope ? `**${c.scope}:** ` : ''
  return {
    unreleased: true,
    section: TYPE_TO_SECTION[c.type],
    text: `${scope}${c.subject}${c.breaking ? ' **(BREAKING)**' : ''}`
  }
}

/**
 * Append an entry under `## [Unreleased]` → `### <Section>`. Idempotent on identical lines.
 */
export function appendToChangelog(cwd: string, entry: ChangelogEntry): { changed: boolean; path: string } {
  const path = join(cwd, 'CHANGELOG.md')
  const initial = `# Changelog\n\nAll notable changes documented here.\n\n## [Unreleased]\n\n### ${entry.section}\n\n- ${entry.text}\n`
  if (!existsSync(path)) { writeFileSync(path, initial); return { changed: true, path } }
  let text = readFileSync(path, 'utf8')
  // ensure ## [Unreleased] exists
  if (!/^##\s*\[Unreleased\]/m.test(text)) {
    text = text.replace(/^(# Changelog[\s\S]*?\n)/, `$1\n## [Unreleased]\n\n`)
  }
  // ensure ### <Section> under unreleased
  const sectionRe = new RegExp(`(##\\s*\\[Unreleased\\][\\s\\S]*?)(###\\s+${entry.section}\\b[^\\n]*\\n)?`, 'm')
  if (!new RegExp(`###\\s+${entry.section}\\b`).test(text.split('## [Unreleased]')[1] ?? '')) {
    text = text.replace(/^(##\s*\[Unreleased\][^\n]*\n)/m, `$1\n### ${entry.section}\n\n`)
  }
  // Insert line if not already present
  if (text.includes(`- ${entry.text}`)) return { changed: false, path }
  text = text.replace(new RegExp(`(###\\s+${entry.section}\\b[^\\n]*\\n(?:\\n)?)`),
    `$1- ${entry.text}\n`)
  writeFileSync(path, text)
  return { changed: true, path }
}
```

- [ ] **Step 5: Changelog test**

`packages/core/test/unit/commit-changelog.test.ts`:
```ts
import { afterEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { appendToChangelog, toEntry } from '../../src/workspace/commit/changelog'

let tmp: string
afterEach(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }) })

describe('changelog', () => {
  test('creates initial file if missing', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-cl-'))
    const r = appendToChangelog(tmp, toEntry({ type: 'feat', subject: 'add x', breaking: false }))
    expect(r.changed).toBe(true)
    expect(readFileSync(r.path, 'utf8')).toMatch(/## \[Unreleased\]/)
    expect(readFileSync(r.path, 'utf8')).toMatch(/### Added\n\n- add x/)
  })
  test('appends new entry under existing Unreleased', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-cl-'))
    writeFileSync(path.join(tmp, 'CHANGELOG.md'), `# Changelog\n\n## [Unreleased]\n\n### Added\n\n- first thing\n`)
    appendToChangelog(tmp, toEntry({ type: 'feat', subject: 'second thing', breaking: false }))
    const text = readFileSync(path.join(tmp, 'CHANGELOG.md'), 'utf8')
    expect(text).toMatch(/- first thing/)
    expect(text).toMatch(/- second thing/)
  })
  test('idempotent on duplicate entry', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-cl-'))
    const e = toEntry({ type: 'fix', subject: 'fix bug', breaking: false })
    appendToChangelog(tmp, e)
    const r = appendToChangelog(tmp, e)
    expect(r.changed).toBe(false)
  })
  test('breaking is marked', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-cl-'))
    appendToChangelog(tmp, toEntry({ type: 'feat', subject: 'remove api', breaking: true }))
    expect(readFileSync(path.join(tmp, 'CHANGELOG.md'), 'utf8')).toMatch(/\*\*\(BREAKING\)\*\*/)
  })
})
```

- [ ] **Step 6: Pre-commit hook integration**

`packages/core/src/workspace/commit/pre-commit.ts`:
```ts
import { execFileSync } from 'node:child_process'

export interface PreCommitOutcome {
  ok: boolean
  output: string
  attempt: number
}

export interface RetryAdvice {
  retry: boolean
  reason: string
}

/**
 * Run `git commit -m <msg>` and capture stderr/stdout. If hooks fail, return the output
 * so the agent can analyze it and propose fixes.
 */
export function tryCommit(cwd: string, message: string, attempt = 1): PreCommitOutcome {
  try {
    const out = execFileSync('git', ['-C', cwd, 'commit', '-m', message], { encoding: 'utf8', stdio: 'pipe' })
    return { ok: true, output: out, attempt }
  } catch (e: any) {
    return { ok: false, output: (e?.stderr ?? '') + (e?.stdout ?? ''), attempt }
  }
}

/**
 * Heuristic — given pre-commit output, advise whether to retry.
 * If hooks auto-fixed (e.g., prettier rewrote files) we re-stage and retry.
 */
export function adviseRetry(output: string): RetryAdvice {
  if (/prettier|eslint --fix|cargo fmt/i.test(output) && /written|fixed|reformatted/i.test(output)) {
    return { retry: true, reason: 'auto-formatter rewrote files; re-stage and retry' }
  }
  if (/skipping/i.test(output) && /test/i.test(output)) {
    return { retry: false, reason: 'tests skipped — manual review' }
  }
  return { retry: false, reason: 'unknown failure' }
}
```

- [ ] **Step 7: Commit sub-agent driver**

`packages/core/src/workspace/commit/agent.ts`:
```ts
import type { Logger } from '../../log'
import { gitOverview, type GitOverview } from './git-overview'
import { gitFileDiff } from './git-file-diff'
import { listHunks, stageHunks, type Hunk } from './git-hunk'
import { parse as parseConventional, type ParsedCommit, format as formatConventional } from './conventional'
import { tryCommit, adviseRetry } from './pre-commit'
import { appendToChangelog, toEntry } from './changelog'

export interface CommitAgentInputs {
  cwd: string
  llm: (prompt: string) => Promise<string>     // injected for testability
  options: {
    splitByConcern: boolean
    autoChangelog: boolean
    push: boolean
    pr: boolean
  }
}

export interface CommitAgentResult {
  ok: boolean
  commits: Array<{ sha: string; message: string }>
  changelogChanged: boolean
  message?: string
}

export class CommitAgent {
  constructor(private inputs: CommitAgentInputs, private log: Logger) {}

  async run(): Promise<CommitAgentResult> {
    const { cwd } = this.inputs
    const ov = gitOverview(cwd)
    if (ov.stagedFiles.length === 0 && ov.unstagedFiles.length === 0) {
      return { ok: false, commits: [], changelogChanged: false, message: 'nothing to commit' }
    }
    // Stage everything if nothing is staged yet
    if (ov.stagedFiles.length === 0) {
      // We avoid blanket `git add -A` per the user's safety preference; instead we
      // stage modified+untracked individually and skip workspace-dotfiles by default.
      const files = [...ov.unstagedFiles, ...ov.untrackedFiles]
      for (const f of files) {
        if (/(?:^|\/)\.(env|aws|gcp|tokens?|secrets?)\b/i.test(f)) {
          this.log.warn({ file: f }, 'skipping likely-secret file')
          continue
        }
        // staged via `git add -- <f>`
        try { (await import('node:child_process')).execFileSync('git', ['-C', cwd, 'add', '--', f]) } catch { /* ignore */ }
      }
    }
    // Build commit-able units (split-by-concern is currently a single-LLM-decision strategy)
    const stagedNow = gitOverview(cwd).stagedFiles
    const groups = await this.groupHunks(cwd, stagedNow)
    const commits: CommitAgentResult['commits'] = []
    let changelogChanged = false
    for (const grp of groups) {
      // First stage exactly grp.hunks (others get unstaged)
      if (this.inputs.options.splitByConcern && groups.length > 1) {
        await this.unstageAll(cwd)
        stageHunks(cwd, grp.hunks)
      }
      const parsedOrErr = parseConventional(grp.message)
      if ('error' in parsedOrErr) {
        return { ok: false, commits, changelogChanged, message: `validation: ${parsedOrErr.error}` }
      }
      // pre-commit retry loop (max 2)
      let outcome = tryCommit(cwd, formatConventional(parsedOrErr))
      if (!outcome.ok) {
        const advice = adviseRetry(outcome.output)
        if (advice.retry) {
          // re-stage everything (formatter likely rewrote files)
          ;(await import('node:child_process')).execFileSync('git', ['-C', cwd, 'add', '-u'])
          outcome = tryCommit(cwd, formatConventional(parsedOrErr), 2)
        }
        if (!outcome.ok) return { ok: false, commits, changelogChanged, message: `pre-commit failed:\n${outcome.output}` }
      }
      const sha = (await import('node:child_process')).execFileSync('git', ['-C', cwd, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
      commits.push({ sha, message: grp.message })
      if (this.inputs.options.autoChangelog) {
        const r = appendToChangelog(cwd, toEntry(parsedOrErr))
        if (r.changed) changelogChanged = true
      }
    }
    if (this.inputs.options.push) {
      try { (await import('node:child_process')).execFileSync('git', ['-C', cwd, 'push']) }
      catch (e: any) { return { ok: true, commits, changelogChanged, message: `committed ok but push failed: ${e.message}` } }
    }
    return { ok: true, commits, changelogChanged }
  }

  /**
   * Ask the LLM to propose 1+ commit groups. Each group has hunks + a conventional message.
   * Falls back to a single group if LLM output is malformed.
   */
  private async groupHunks(cwd: string, stagedFiles: string[]): Promise<Array<{ hunks: Hunk[]; message: string }>> {
    const allHunks = listHunks(cwd, stagedFiles, true)
    if (!this.inputs.options.splitByConcern || allHunks.length === 0) {
      const diff = stagedFiles.map(f => `### ${f}\n${gitFileDiff(cwd, f, true)}`).join('\n\n')
      const msg = await this.askForMessage(diff)
      return [{ hunks: allHunks, message: msg }]
    }
    const prompt = [
      `You are the commit sub-agent. Group the following hunks by concern and write one conventional commit message per group.`,
      `Respond as strict JSON: { "groups": [ { "hunkIndices": [0,1], "message": "feat(x): ..." }, ... ] }`,
      `Hunks:`,
      ...allHunks.map((h, i) => `[${i}] ${h.file}@${h.startLineNew}\n${h.body}`)
    ].join('\n\n')
    const raw = await this.inputs.llm(prompt)
    const m = raw.match(/\{[\s\S]*\}/)
    if (!m) {
      const fallback = await this.askForMessage(allHunks.map(h => h.body).join('\n'))
      return [{ hunks: allHunks, message: fallback }]
    }
    try {
      const parsed = JSON.parse(m[0]) as { groups: Array<{ hunkIndices: number[]; message: string }> }
      return parsed.groups.map(g => ({
        hunks: g.hunkIndices.map(i => allHunks[i]).filter(Boolean) as Hunk[],
        message: g.message
      }))
    } catch {
      const fallback = await this.askForMessage(allHunks.map(h => h.body).join('\n'))
      return [{ hunks: allHunks, message: fallback }]
    }
  }

  private async askForMessage(diffOrHunks: string): Promise<string> {
    const prompt = [
      `Write ONE conventional commit message for the following diff.`,
      `Rules: header ≤ 72 chars; type ∈ {feat,fix,docs,style,refactor,perf,test,chore,build,ci,revert};`,
      `no filler words ("update", "change", "modify", "stuff");`,
      `no meta phrases ("this commit", "let me", "per the spec").`,
      `Format: type(scope): subject  (optionally followed by blank line + body)`,
      ``,
      diffOrHunks
    ].join('\n')
    const raw = await this.inputs.llm(prompt)
    return raw.trim().replace(/^```[a-z]*\n?|\n?```$/g, '').trim()
  }

  private async unstageAll(cwd: string): Promise<void> {
    ;(await import('node:child_process')).execFileSync('git', ['-C', cwd, 'reset', 'HEAD'])
  }
}
```

- [ ] **Step 8: Commit agent integration test (single commit path)**

`packages/core/test/integration/commit-agent.test.ts`:
```ts
import { afterEach, describe, expect, test, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import os from 'node:os'
import { CommitAgent } from '../../src/workspace/commit/agent'
import { createLogger } from '../../src/log'

let tmp: string
afterEach(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }) })

describe('CommitAgent (integration)', () => {
  test('commits unstaged changes with LLM-proposed conventional message', async () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-cagent-'))
    execFileSync('git', ['init', '-q', '-b', 'main', tmp])
    execFileSync('git', ['-C', tmp, 'config', 'user.email', 'a@b.c'])
    execFileSync('git', ['-C', tmp, 'config', 'user.name', 't'])
    writeFileSync(path.join(tmp, 'a.txt'), 'init\n')
    execFileSync('git', ['-C', tmp, 'add', '.'])
    execFileSync('git', ['-C', tmp, 'commit', '-q', '-m', 'init'])
    writeFileSync(path.join(tmp, 'a.txt'), 'new content\n')
    const llm = vi.fn().mockResolvedValue('feat(content): rewrite a.txt with new content')
    const agent = new CommitAgent({
      cwd: tmp, llm,
      options: { splitByConcern: false, autoChangelog: true, push: false, pr: false }
    }, createLogger('t'))
    const r = await agent.run()
    expect(r.ok).toBe(true)
    expect(r.commits).toHaveLength(1)
    expect(r.commits[0]!.message).toMatch(/^feat\(content\):/)
    expect(r.changelogChanged).toBe(true)
    expect(readFileSync(path.join(tmp, 'CHANGELOG.md'), 'utf8')).toMatch(/rewrite a.txt/)
  })

  test('rejects filler message', async () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-cagent-'))
    execFileSync('git', ['init', '-q', '-b', 'main', tmp])
    execFileSync('git', ['-C', tmp, 'config', 'user.email', 'a@b.c'])
    execFileSync('git', ['-C', tmp, 'config', 'user.name', 't'])
    writeFileSync(path.join(tmp, 'a.txt'), 'x\n')
    const llm = vi.fn().mockResolvedValue('feat: update stuff')
    const agent = new CommitAgent({
      cwd: tmp, llm,
      options: { splitByConcern: false, autoChangelog: false, push: false, pr: false }
    }, createLogger('t'))
    const r = await agent.run()
    expect(r.ok).toBe(false)
    expect(r.message).toMatch(/filler/)
  })
})
```

- [ ] **Step 9: CLI command**

`packages/cli/src/commands/commit.ts`:
```ts
import { Command } from 'commander'
import { connectDaemon } from '../auto-spawn'
import kleur from 'kleur'

export function registerCommit(parent: Command): void {
  parent.command('commit')
    .description('Agentic commit: LLM writes the conventional message and (optionally) splits hunks')
    .option('--no-split', 'do not split by concern')
    .option('--no-changelog', 'skip changelog update')
    .option('--push', 'push after commit')
    .option('--pr', 'open a PR after pushing')
    .action(async (opts: { split: boolean; changelog: boolean; push: boolean; pr: boolean }) => {
      const c = await connectDaemon()
      const r = await c.call('workspace.commit', {
        splitByConcern: opts.split,
        autoChangelog: opts.changelog,
        push: opts.push,
        pr: opts.pr
      }) as { ok: boolean; commits: any[]; message?: string }
      if (!r.ok) { console.error(kleur.red('✗'), r.message); process.exit(1) }
      for (const co of r.commits) console.log(kleur.green('✓'), co.sha.slice(0, 8), co.message.split('\n')[0])
    })
}
```

- [ ] **Step 10: Run all commit tests — PASS**

```bash
pnpm vitest run packages/core/test/unit/commit-conventional.test.ts packages/core/test/unit/commit-changelog.test.ts packages/core/test/integration/commit-agent.test.ts
```

- [ ] **Step 11: Commit**

```bash
git add packages
git commit -m "feat(workspace): glm commit / /commit — agentic conventional commit + hunk split + changelog + pre-commit retry"
```

---

## Task 17: Workspace tool — `glm recipe` (auto-detect npm/cargo/just/make/task)

**Files:**
- Create: `packages/core/src/workspace/recipe/detect.ts`
- Create: `packages/core/src/workspace/recipe/run.ts`
- Create: `packages/cli/src/commands/recipe.ts`
- Test: `packages/core/test/unit/recipe-detect.test.ts`

- [ ] **Step 1: Recipe detector**

`packages/core/src/workspace/recipe/detect.ts`:
```ts
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

export type RunnerKind = 'npm' | 'pnpm' | 'yarn' | 'cargo' | 'just' | 'make' | 'task' | 'mise'

export interface Recipe {
  name: string
  runner: RunnerKind
  description?: string
  command: string[]                // argv to spawn (e.g., ['pnpm', 'run', 'test'])
}

export interface DetectInput {
  cwd: string
  fileExists?: (p: string) => boolean
  readText?: (p: string) => string
  runWhich?: (bin: string) => boolean
}

const exists = (p: string) => existsSync(p)
const read   = (p: string) => readFileSync(p, 'utf8')
const which  = (bin: string) => { try { execFileSync('which', [bin], { stdio: 'pipe' }); return true } catch { return false } }

export function detect(input: DetectInput): Recipe[] {
  const fe = input.fileExists ?? exists
  const rt = input.readText   ?? read
  const wh = input.runWhich   ?? which
  const recipes: Recipe[] = []

  // npm / pnpm / yarn scripts
  const pkgPath = join(input.cwd, 'package.json')
  if (fe(pkgPath)) {
    let pkgRunner: 'npm' | 'pnpm' | 'yarn' = 'npm'
    if (fe(join(input.cwd, 'pnpm-lock.yaml'))) pkgRunner = 'pnpm'
    else if (fe(join(input.cwd, 'yarn.lock'))) pkgRunner = 'yarn'
    try {
      const pkg = JSON.parse(rt(pkgPath)) as { scripts?: Record<string, string> }
      for (const [name, cmd] of Object.entries(pkg.scripts ?? {})) {
        recipes.push({ name, runner: pkgRunner, description: cmd, command: [pkgRunner, 'run', name] })
      }
    } catch { /* malformed package.json */ }
  }

  // Cargo
  if (fe(join(input.cwd, 'Cargo.toml'))) {
    for (const n of ['build', 'test', 'run', 'check', 'fmt', 'clippy']) {
      recipes.push({ name: `cargo:${n}`, runner: 'cargo', command: ['cargo', n] })
    }
  }

  // Justfile
  if (fe(join(input.cwd, 'Justfile')) || fe(join(input.cwd, 'justfile'))) {
    if (wh('just')) {
      const f = fe(join(input.cwd, 'Justfile')) ? 'Justfile' : 'justfile'
      const text = rt(join(input.cwd, f))
      for (const m of text.matchAll(/^([a-zA-Z][\w-]*)(?:\s*:|\s+[\w-]+\s*:)/gm)) {
        recipes.push({ name: `just:${m[1]}`, runner: 'just', command: ['just', m[1]!] })
      }
    }
  }

  // Makefile
  if (fe(join(input.cwd, 'Makefile')) || fe(join(input.cwd, 'GNUmakefile'))) {
    const f = fe(join(input.cwd, 'Makefile')) ? 'Makefile' : 'GNUmakefile'
    const text = rt(join(input.cwd, f))
    for (const m of text.matchAll(/^([a-zA-Z][\w-]*):(?!=)/gm)) {
      if (m[1] === '.PHONY') continue
      recipes.push({ name: `make:${m[1]}`, runner: 'make', command: ['make', m[1]!] })
    }
  }

  // Taskfile.yml (go-task)
  if (fe(join(input.cwd, 'Taskfile.yml')) || fe(join(input.cwd, 'Taskfile.yaml'))) {
    if (wh('task')) {
      const f = fe(join(input.cwd, 'Taskfile.yml')) ? 'Taskfile.yml' : 'Taskfile.yaml'
      const text = rt(join(input.cwd, f))
      // crude YAML scrape — we don't need exact parsing
      for (const m of text.matchAll(/^\s{2}([a-zA-Z][\w:-]*):\s*$/gm)) {
        recipes.push({ name: `task:${m[1]}`, runner: 'task', command: ['task', m[1]!] })
      }
    }
  }

  // mise tasks
  if (fe(join(input.cwd, '.mise.toml')) && wh('mise')) {
    // we only advertise `mise run <name>` as a wrapper without parsing
    recipes.push({ name: 'mise:run', runner: 'mise', command: ['mise', 'run'] })
  }

  return recipes
}
```

- [ ] **Step 2: Runner**

`packages/core/src/workspace/recipe/run.ts`:
```ts
import { spawn } from 'node:child_process'
import type { Recipe } from './detect'

export interface RunResult {
  exitCode: number
  stdout: string
  stderr: string
}

export function runRecipe(r: Recipe, cwd: string, extraArgs: string[] = []): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(r.command[0]!, [...r.command.slice(1), ...extraArgs], {
      cwd, stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (b) => { stdout += b.toString() })
    child.stderr.on('data', (b) => { stderr += b.toString() })
    child.on('close', (code) => resolve({ exitCode: code ?? 0, stdout, stderr }))
  })
}
```

- [ ] **Step 3: Recipe detect test**

`packages/core/test/unit/recipe-detect.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { detect } from '../../src/workspace/recipe/detect'

function fakeFs(files: Record<string, string>) {
  return {
    fileExists: (p: string) => Object.keys(files).some(k => p.endsWith(k)),
    readText:   (p: string) => {
      for (const [k, v] of Object.entries(files)) if (p.endsWith(k)) return v
      throw new Error(`no fake for ${p}`)
    },
    runWhich:   () => true
  }
}

describe('detect recipes', () => {
  test('npm scripts', () => {
    const r = detect({ cwd: '/x', ...fakeFs({
      'package.json': JSON.stringify({ scripts: { test: 'vitest', build: 'tsc' } })
    }) })
    expect(r.map(x => x.name).sort()).toEqual(['build', 'test'])
    expect(r[0]!.runner).toBe('npm')
  })
  test('pnpm preferred when lockfile present', () => {
    const r = detect({ cwd: '/x', ...fakeFs({
      'package.json': JSON.stringify({ scripts: { test: 'vitest' } }),
      'pnpm-lock.yaml': '#'
    }) })
    expect(r[0]!.runner).toBe('pnpm')
    expect(r[0]!.command).toEqual(['pnpm', 'run', 'test'])
  })
  test('Cargo recipes', () => {
    const r = detect({ cwd: '/x', ...fakeFs({ 'Cargo.toml': '[package]\nname="x"\n' }) })
    expect(r.find(x => x.name === 'cargo:test')).toBeDefined()
  })
  test('Justfile parsed', () => {
    const r = detect({ cwd: '/x', ...fakeFs({
      'Justfile': `default:\n\techo hi\ntest:\n\techo run\nbuild *args:\n\techo build\n`
    }) })
    expect(r.map(x => x.name).sort()).toContain('just:test')
    expect(r.map(x => x.name)).toContain('just:default')
  })
  test('Makefile parsed', () => {
    const r = detect({ cwd: '/x', ...fakeFs({
      'Makefile': `.PHONY: test\nall:\n\techo all\ntest:\n\techo t\n`
    }) })
    expect(r.find(x => x.name === 'make:all')).toBeDefined()
    expect(r.find(x => x.name === 'make:test')).toBeDefined()
    expect(r.find(x => x.name === 'make:.PHONY')).toBeUndefined()
  })
})
```

- [ ] **Step 4: CLI**

`packages/cli/src/commands/recipe.ts`:
```ts
import { Command } from 'commander'
import kleur from 'kleur'
import { connectDaemon } from '../auto-spawn'

export function registerRecipe(parent: Command): void {
  const recipe = parent.command('recipe').description('Run a project task (auto-detect runner)')
  recipe.command('list').description('List detected recipes').action(async () => {
    const c = await connectDaemon()
    const recipes = await c.call('workspace.recipe.list', {}) as Array<{ name: string; runner: string; description?: string }>
    for (const r of recipes) {
      console.log(`${kleur.cyan(r.name)}  ${kleur.dim(r.runner)}  ${r.description ?? ''}`)
    }
  })
  recipe.command('run <name> [args...]')
    .description('Run a specific recipe')
    .action(async (name: string, args: string[]) => {
      const c = await connectDaemon()
      const r = await c.call('workspace.recipe.run', { name, args }) as { exitCode: number; stdout: string; stderr: string }
      process.stdout.write(r.stdout); process.stderr.write(r.stderr)
      process.exit(r.exitCode)
    })
  // shorthand: `glm recipe test` → list-match + run
  recipe.action(async () => {
    const c = await connectDaemon()
    const recipes = await c.call('workspace.recipe.list', {}) as Array<{ name: string; runner: string }>
    if (recipes.length === 0) console.log(kleur.yellow('(no recipes detected in cwd)'))
    for (const r of recipes) console.log(`${kleur.cyan(r.name)}  ${kleur.dim(r.runner)}`)
  })
}
```

- [ ] **Step 5: Run tests — PASS**

```bash
pnpm vitest run packages/core/test/unit/recipe-detect.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add packages
git commit -m "feat(workspace): glm recipe — auto-detect npm/pnpm/cargo/just/make/task"
```

---

## Task 18: Universal config discovery (v0.1 — CC full + others stub)

**Files:**
- Create: `packages/core/src/workspace/config-discovery/scanners.ts`
- Create: `packages/core/src/workspace/config-discovery/import-claude.ts`
- Create: `packages/core/src/workspace/config-discovery/prompt.ts`
- Test: `packages/core/test/unit/config-discovery.test.ts`

- [ ] **Step 1: Scanners**

`packages/core/src/workspace/config-discovery/scanners.ts`:
```ts
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'

export interface DiscoveredSource {
  id: string
  label: string
  root: string                 // path on disk
  kind: 'claude' | 'cursor' | 'windsurf' | 'codex' | 'cline' | 'copilot' | 'codeium' | 'gemini' | 'vscode'
  importable: 'full' | 'stub' | 'noop'
}

export interface ScanInput {
  home?: string
  exists?: (p: string) => boolean
}

export function scanAll(input: ScanInput = {}): DiscoveredSource[] {
  const home = input.home ?? os.homedir()
  const fe = input.exists ?? existsSync
  const found: DiscoveredSource[] = []
  const probe = (id: string, label: string, dir: string, kind: DiscoveredSource['kind'], importable: DiscoveredSource['importable']) => {
    if (fe(dir)) found.push({ id, label, root: dir, kind, importable })
  }
  probe('claude',   'Claude Code',  join(home, '.claude'),    'claude',   'full')
  probe('claude-json', 'Claude config', join(home, '.claude.json'), 'claude', 'full')
  probe('cursor',   'Cursor',       join(home, '.cursor'),    'cursor',   'stub')
  probe('windsurf', 'Windsurf',     join(home, '.windsurf'),  'windsurf', 'stub')
  probe('codex',    'Codex',        join(home, '.codex'),     'codex',    'stub')
  probe('cline',    'Cline',        join(home, '.cline'),     'cline',    'stub')
  probe('copilot',  'GitHub Copilot', join(home, '.copilot'), 'copilot',  'stub')
  probe('codeium',  'Codeium',      join(home, '.codeium'),   'codeium',  'stub')
  probe('gemini',   'Gemini Code',  join(home, '.gemini'),    'gemini',   'stub')
  // VS Code settings (per platform)
  const vsCandidates = [
    join(home, 'Library', 'Application Support', 'Code', 'User', 'settings.json'),    // macOS
    join(home, '.config', 'Code', 'User', 'settings.json'),                            // Linux
    join(home, 'AppData', 'Roaming', 'Code', 'User', 'settings.json')                  // Windows
  ]
  for (const p of vsCandidates) {
    if (fe(p)) { found.push({ id: 'vscode', label: 'VS Code', root: p, kind: 'vscode', importable: 'stub' }); break }
  }
  return found
}
```

- [ ] **Step 2: Claude Code full importer**

`packages/core/src/workspace/config-discovery/import-claude.ts`:
```ts
import { readFileSync, existsSync, copyFileSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join, basename } from 'node:path'

export interface ClaudeImportResult {
  imported: { mcpServers: number; skills: number; plugins: number; commands: number; hooks: number; settings: boolean }
  errors: string[]
}

export interface ImportInputs {
  ccRoot: string                  // ~/.claude
  glmRoot: string                  // ~/.glm
  ccJson?: string                  // ~/.claude.json
}

/**
 * Soft-import: we don't move files. We symlink or copy a curated subset into ~/.glm/imported/claude/.
 * Run-time loaders (P4) already cascade-read ~/.claude/*, so this is mostly a UX nicety.
 */
export function importClaude(i: ImportInputs): ClaudeImportResult {
  const errs: string[] = []
  const out = { mcpServers: 0, skills: 0, plugins: 0, commands: 0, hooks: 0, settings: false }
  const dest = join(i.glmRoot, 'imported', 'claude')
  mkdirSync(dest, { recursive: true })
  // skills
  const skillsDir = join(i.ccRoot, 'skills')
  if (existsSync(skillsDir)) {
    for (const name of safeReaddir(skillsDir, errs)) {
      const p = join(skillsDir, name)
      try {
        if (statSync(p).isDirectory()) { out.skills++ }
      } catch (e: any) { errs.push(`skill ${name}: ${e.message}`) }
    }
  }
  // commands
  const cmdDir = join(i.ccRoot, 'commands')
  if (existsSync(cmdDir)) {
    for (const f of safeReaddir(cmdDir, errs)) if (f.endsWith('.md')) out.commands++
  }
  // plugins
  const pluginsDir = join(i.ccRoot, 'plugins', 'cache')
  if (existsSync(pluginsDir)) {
    for (const f of safeReaddir(pluginsDir, errs)) {
      try { if (statSync(join(pluginsDir, f)).isDirectory()) out.plugins++ } catch { /* ignore */ }
    }
  }
  // settings
  const settingsFile = join(i.ccRoot, 'settings.json')
  if (existsSync(settingsFile)) {
    out.settings = true
    try {
      const j = JSON.parse(readFileSync(settingsFile, 'utf8')) as { hooks?: Record<string, unknown[]> }
      out.hooks = Object.values(j.hooks ?? {}).reduce<number>((acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0), 0)
    } catch (e: any) { errs.push(`settings.json: ${e.message}`) }
  }
  // .claude.json — mcp servers
  if (i.ccJson && existsSync(i.ccJson)) {
    try {
      const j = JSON.parse(readFileSync(i.ccJson, 'utf8')) as { mcpServers?: Record<string, unknown> }
      out.mcpServers = Object.keys(j.mcpServers ?? {}).length
    } catch (e: any) { errs.push(`.claude.json: ${e.message}`) }
  }
  // touch marker so we only prompt once
  copyMarker(dest)
  return { imported: out, errors: errs }
}

function safeReaddir(p: string, errs: string[]): string[] {
  try { return readdirSync(p) }
  catch (e: any) { errs.push(`readdir ${p}: ${e.message}`); return [] }
}
function copyMarker(dest: string): void {
  // empty file as a sentinel
  const f = join(dest, '.imported')
  if (!existsSync(f)) require('node:fs').writeFileSync(f, new Date().toISOString())
}
```

- [ ] **Step 3: First-run prompt orchestrator**

`packages/core/src/workspace/config-discovery/prompt.ts`:
```ts
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DiscoveredSource } from './scanners'

export interface PromptDecision {
  source: DiscoveredSource
  action: 'import' | 'skip' | 'never'
}

export class FirstRunDiscovery {
  private markerFile: string

  constructor(private glmRoot: string) {
    this.markerFile = join(glmRoot, '.first-run-complete')
  }

  isFirstRun(): boolean { return !existsSync(this.markerFile) }

  /**
   * Apply each decision deterministically. The caller is responsible for actually
   * gathering user input — this method just records the decisions and writes the marker.
   */
  finalize(decisions: PromptDecision[]): void {
    const log = decisions.map(d => `${new Date().toISOString()}  ${d.source.id}  ${d.action}`).join('\n') + '\n'
    writeFileSync(this.markerFile, log)
  }
}
```

- [ ] **Step 4: Test**

`packages/core/test/unit/config-discovery.test.ts`:
```ts
import { afterEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { scanAll } from '../../src/workspace/config-discovery/scanners'
import { importClaude } from '../../src/workspace/config-discovery/import-claude'
import { FirstRunDiscovery } from '../../src/workspace/config-discovery/prompt'

let tmp: string
afterEach(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }) })

describe('config discovery scanners', () => {
  test('finds claude + cursor + windsurf', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-disc-'))
    mkdirSync(path.join(tmp, '.claude'))
    mkdirSync(path.join(tmp, '.cursor'))
    mkdirSync(path.join(tmp, '.windsurf'))
    const found = scanAll({ home: tmp })
    const ids = found.map(f => f.id).sort()
    expect(ids).toEqual(expect.arrayContaining(['claude', 'cursor', 'windsurf']))
  })
})

describe('importClaude', () => {
  test('counts skills/commands/plugins/mcpServers', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-disc-'))
    const cc = path.join(tmp, '.claude')
    mkdirSync(path.join(cc, 'skills', 's1'), { recursive: true })
    mkdirSync(path.join(cc, 'commands'), { recursive: true })
    writeFileSync(path.join(cc, 'commands', 'a.md'), '# a')
    mkdirSync(path.join(cc, 'plugins', 'cache', 'p1'), { recursive: true })
    writeFileSync(path.join(cc, 'settings.json'), JSON.stringify({ hooks: { PreToolUse: [{}, {}] } }))
    writeFileSync(path.join(tmp, '.claude.json'), JSON.stringify({ mcpServers: { linear: {}, slack: {} } }))
    const r = importClaude({ ccRoot: cc, glmRoot: path.join(tmp, '.glm'), ccJson: path.join(tmp, '.claude.json') })
    expect(r.imported.skills).toBe(1)
    expect(r.imported.commands).toBe(1)
    expect(r.imported.plugins).toBe(1)
    expect(r.imported.mcpServers).toBe(2)
    expect(r.imported.hooks).toBe(2)
  })
})

describe('FirstRunDiscovery', () => {
  test('isFirstRun toggles after finalize', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-disc-'))
    mkdirSync(path.join(tmp, '.glm'))
    const d = new FirstRunDiscovery(path.join(tmp, '.glm'))
    expect(d.isFirstRun()).toBe(true)
    d.finalize([])
    expect(d.isFirstRun()).toBe(false)
  })
})
```

- [ ] **Step 5: Run — PASS**

```bash
pnpm vitest run packages/core/test/unit/config-discovery.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat(workspace): universal config discovery — CC full import + cursor/windsurf/codex/cline/copilot/vscode stubs"
```

---


## Task 19: `glm doctor` full implementation

**Files:**
- Create: `packages/core/src/doctor/checks/{runtime,install,api,bundled-mcp,external-mcp,lsp,compat,sessions,warnings,actions,attachments}.ts`
- Create: `packages/core/src/doctor/runner.ts`
- Create: `packages/core/src/doctor/fix.ts`
- **Modify**: `packages/cli/src/commands/doctor.ts` (P10-Fix-8 — P1 created the skeleton via P1-Fix-2; P5 modified once; P10 replaces with full impl in Step 5)
- Test: `packages/core/test/unit/doctor-runner.test.ts`
- Test: `packages/core/test/unit/doctor-actions.test.ts` (P10-Fix-14)
- Test: `packages/core/test/unit/doctor-attachments.test.ts` (P10-Fix-16)

> **P10-Fix-14 (FIX-MANIFEST §11.4):** Doctor now validates the `settings.actions` block introduced by spec §9.23 / P6-Fix-7: all 8 keys present, every `model` is a recognized LLMModel, every `thinking` is one of the 7 levels. Failure surfaces as a `warn`-level check fixable via `glm doctor --fix` (which restores the missing/invalid action entry from `DEFAULT_ACTIONS`).
>
> **P10-Fix-16 (FIX-MANIFEST §12.3):** Doctor also reports on the image-attachment subsystem (spec §9.12 / P2-Fix-6 / P6-Fix-9): sanity-checks `attachments.image.maxBytes` (warns if > 10MB — main LLMs are text-only and the daemon shrinks via autoResize, but >10MB raw inputs strain the vision MCP), reports the on-disk vision cache size (`~/.glm/cache/vision/`), probes the bundled `glm-vision` MCP server reachability via the MCP host, and verifies `~/.glm/sessions/<sid>/attachments/` directory permissions (must be 0700 to keep screenshots private).

- [ ] **Step 1: Shared check shape**

`packages/core/src/doctor/runner.ts`:
```ts
export interface DoctorCheck {
  id: string
  category: 'runtime' | 'install' | 'api' | 'bundled-mcp' | 'external-mcp' | 'lsp' | 'compat' | 'sessions' | 'warnings' | 'actions' | 'attachments'
  label: string
  pass: boolean
  level: 'fatal' | 'warn' | 'info'
  detail: string
  remediation?: string
  fixable: boolean
}

export interface DoctorReport {
  checks: DoctorCheck[]
  summary: { fatal: number; warn: number; info: number }
  overall: 'healthy' | 'degraded' | 'unhealthy'
}

export type CheckFn = () => Promise<DoctorCheck[]>

export class DoctorRunner {
  constructor(private checks: CheckFn[]) {}
  async run(): Promise<DoctorReport> {
    const all: DoctorCheck[] = []
    for (const fn of this.checks) all.push(...await fn())
    const summary = { fatal: 0, warn: 0, info: 0 }
    for (const c of all) {
      if (!c.pass && c.level === 'fatal') summary.fatal++
      else if (!c.pass && c.level === 'warn') summary.warn++
      else summary.info++
    }
    const overall = summary.fatal > 0 ? 'unhealthy' : summary.warn > 0 ? 'degraded' : 'healthy'
    return { checks: all, summary, overall }
  }
}
```

- [ ] **Step 2: Individual check modules (pattern, one per category)**

`packages/core/src/doctor/checks/runtime.ts`:
```ts
import type { DoctorCheck } from '../runner'

export async function checkRuntime(): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = []
  // Node version
  const major = Number(process.versions.node.split('.')[0])
  checks.push({
    id: 'node-version', category: 'runtime',
    label: 'Node.js ≥ 22', pass: major >= 22,
    level: major >= 22 ? 'info' : 'fatal',
    detail: `node v${process.versions.node}`,
    remediation: major >= 22 ? undefined : 'install Node 22+ via nvm/asdf/fnm',
    fixable: false
  })
  // Platform
  checks.push({
    id: 'platform', category: 'runtime', label: 'Supported platform',
    pass: ['darwin', 'linux', 'win32'].includes(process.platform),
    level: 'info', detail: process.platform, fixable: false
  })
  return checks
}
```

`packages/core/src/doctor/checks/install.ts`:
```ts
import { existsSync, statSync } from 'node:fs'
import type { DoctorCheck } from '../runner'
import { resolvePaths } from '@glm/shared'

export async function checkInstall(): Promise<DoctorCheck[]> {
  const p = resolvePaths()
  const out: DoctorCheck[] = []
  out.push({ id: 'glm-home', category: 'install', label: `~/.glm exists (${p.root})`,
    pass: existsSync(p.root), level: existsSync(p.root) ? 'info' : 'warn',
    detail: existsSync(p.root) ? 'present' : 'missing — will be created on first run',
    fixable: true, remediation: 'glm doctor --fix creates the dir' })
  if (existsSync(p.root)) {
    const mode = statSync(p.root).mode & 0o777
    out.push({ id: 'glm-home-perms', category: 'install', label: 'Permissions 0700/0755',
      pass: (mode & 0o077) === 0 || mode === 0o755,
      level: 'warn', detail: `mode 0${mode.toString(8)}`,
      remediation: 'chmod 700 ~/.glm', fixable: true })
  }
  return out
}
```

`packages/core/src/doctor/checks/api.ts`:
```ts
import type { DoctorCheck } from '../runner'

export interface ApiCheckInputs {
  fetchImpl?: typeof fetch
  apiKey?: string
  baseUrl?: string
}

export async function checkApi(i: ApiCheckInputs = {}): Promise<DoctorCheck[]> {
  const key = i.apiKey ?? process.env.GLM_API_KEY ?? process.env.ZAI_API_KEY ?? process.env.ANTHROPIC_API_KEY
  if (!key) {
    return [{ id: 'api-key', category: 'api', label: 'API key set', pass: false, level: 'fatal',
      detail: 'no GLM_API_KEY / ZAI_API_KEY / ANTHROPIC_API_KEY in env',
      remediation: 'export GLM_API_KEY=…', fixable: false }]
  }
  const base = i.baseUrl ?? 'https://api.z.ai/api/anthropic'
  const fetchImpl = i.fetchImpl ?? fetch
  try {
    const res = await fetchImpl(`${base}/v1/messages`, {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'GLM-4.5-Air', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] })
    })
    return [{ id: 'api-reach', category: 'api', label: 'GLM API reachable',
      pass: res.status < 500, level: res.ok ? 'info' : 'warn',
      detail: `HTTP ${res.status}`, fixable: false }]
  } catch (e: any) {
    return [{ id: 'api-reach', category: 'api', label: 'GLM API reachable',
      pass: false, level: 'fatal', detail: e?.message ?? String(e), fixable: false }]
  }
}
```

Pattern continues for `bundled-mcp.ts` (probes 4 bundled servers), `external-mcp.ts` (reads settings, pings each), `lsp.ts` (checks installed LSP binaries), `compat.ts` (reads `~/.claude/` for assets), `sessions.ts` (lists active sessions + heap), `warnings.ts` (quota / disk usage / heap headroom).

- [ ] **Step 2.5: Settings.actions check (P10-Fix-14 — spec §9.23)**

`packages/core/src/doctor/checks/actions.ts`:
```ts
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { ActionsConfigSchema, ACTIONS, DEFAULT_ACTIONS, type ActionsConfig } from '@glm/shared'
import { resolvePaths } from '@glm/shared'
import type { DoctorCheck } from '../runner'

/** Known LLMModel + GLM Coding Plan + glm-vision; canonical mirrors are allowed (e.g. "glm-5.1"). */
const KNOWN_MODEL = /^(GLM-|glm-)/

export async function checkActions(): Promise<DoctorCheck[]> {
  const paths = resolvePaths()
  const file = path.join(paths.root, 'settings.json')
  if (!existsSync(file)) {
    return [{
      id: 'actions-present', category: 'actions',
      label: 'settings.actions present', pass: false, level: 'warn',
      detail: 'settings.json not found — first-run migration will seed defaults',
      remediation: 'glm doctor --fix writes ~/.glm/settings.json with default actions',
      fixable: true,
    }]
  }
  let raw: any
  try { raw = JSON.parse(readFileSync(file, 'utf8')) }
  catch (e: any) {
    return [{ id: 'actions-parse', category: 'actions', label: 'settings.json parseable',
      pass: false, level: 'fatal', detail: e?.message ?? String(e), fixable: false }]
  }
  if (!raw.actions || typeof raw.actions !== 'object') {
    return [{
      id: 'actions-present', category: 'actions',
      label: 'settings.actions present', pass: false, level: 'warn',
      detail: 'settings.json has no `actions` block',
      remediation: 'glm doctor --fix seeds defaults (spec §9.23 / FIX-MANIFEST §11.0.3)',
      fixable: true,
    }]
  }
  const out: DoctorCheck[] = []

  // 1) Shape check — all 8 keys present, each {model: string, thinking: ThinkingLevel}.
  const parsed = ActionsConfigSchema.safeParse(raw.actions)
  out.push({
    id: 'actions-schema', category: 'actions',
    label: 'settings.actions matches 8-action schema',
    pass: parsed.success,
    level: parsed.success ? 'info' : 'warn',
    detail: parsed.success ? 'ok' : JSON.stringify(parsed.error.flatten(), null, 0),
    remediation: parsed.success ? undefined : 'glm doctor --fix restores invalid entries from DEFAULT_ACTIONS',
    fixable: true,
  })

  // 2) Per-action model validity (recognized GLM-* or glm-* string).
  if (parsed.success) {
    const cfg = parsed.data as ActionsConfig
    for (const a of ACTIONS) {
      const m = cfg[a]?.model
      out.push({
        id: `actions-${a}-model`, category: 'actions',
        label: `actions.${a}.model is a known model name`,
        pass: !!m && KNOWN_MODEL.test(m),
        level: 'warn',
        detail: m ?? '(missing)',
        remediation: `glm doctor --fix → resets actions.${a} to default (${DEFAULT_ACTIONS[a].model} / ${DEFAULT_ACTIONS[a].thinking})`,
        fixable: true,
      })
    }
  }
  return out
}
```

Register `checkActions` in `runner.ts` alongside the other check functions.

Doctor `--fix` applier extension (in `fix.ts`):
```ts
case 'actions-present':
case 'actions-schema': {
  // Reseed actions block from DEFAULT_ACTIONS, preserving other settings keys.
  const file = path.join(resolvePaths().root, 'settings.json')
  const cur: any = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
  cur.actions = DEFAULT_ACTIONS
  if (!existsSync(path.dirname(file))) mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  writeFileSync(file, JSON.stringify(cur, null, 2), { mode: 0o600 })
  out.push({ id: c.id, ok: true, detail: `reseeded actions block in ${file}` })
  break
}
default: {
  // Per-action fix: id is "actions-<action>-model" — restore just that slot.
  const m = c.id.match(/^actions-([a-z]+)-model$/)
  if (m) {
    const action = m[1]!
    const file = path.join(resolvePaths().root, 'settings.json')
    const cur: any = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
    cur.actions = { ...(cur.actions ?? DEFAULT_ACTIONS), [action]: (DEFAULT_ACTIONS as any)[action] }
    writeFileSync(file, JSON.stringify(cur, null, 2), { mode: 0o600 })
    out.push({ id: c.id, ok: true, detail: `restored actions.${action}` })
    break
  }
  out.push({ id: c.id, ok: false, detail: 'no auto-fix recipe' })
}
```

Unit test `packages/core/test/unit/doctor-actions.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { checkActions } from '../../src/doctor/checks/actions'
import { DEFAULT_ACTIONS } from '@glm/shared'

let home: string
beforeEach(() => {
  home = mkdtempSync(path.join(os.tmpdir(), 'glm-doc-act-'))
  process.env.GLM_HOME = home
  mkdirSync(path.join(home, '.glm'), { recursive: true })
})
afterEach(() => {
  rmSync(home, { recursive: true, force: true })
  delete process.env.GLM_HOME
})

describe('doctor.checkActions (P10-Fix-14)', () => {
  test('absent settings.json → "warn" / fixable', async () => {
    const out = await checkActions()
    expect(out[0]?.pass).toBe(false)
    expect(out[0]?.fixable).toBe(true)
    expect(out[0]?.id).toBe('actions-present')
  })

  test('valid settings.actions → all 9 checks pass (1 schema + 8 per-action)', async () => {
    writeFileSync(path.join(home, '.glm', 'settings.json'),
      JSON.stringify({ actions: DEFAULT_ACTIONS }, null, 2))
    const out = await checkActions()
    expect(out.find(c => c.id === 'actions-schema')?.pass).toBe(true)
    expect(out.filter(c => /^actions-(default|smol|slow|vision|plan|designer|commit|task)-model$/.test(c.id)).every(c => c.pass)).toBe(true)
  })

  test('missing thinking field → schema check fails / fixable', async () => {
    const bad = { actions: { ...DEFAULT_ACTIONS, default: { model: 'GLM-5.1' } } }
    writeFileSync(path.join(home, '.glm', 'settings.json'), JSON.stringify(bad))
    const out = await checkActions()
    expect(out.find(c => c.id === 'actions-schema')?.pass).toBe(false)
  })

  test('unknown model string → that action fails the per-action check', async () => {
    const bad = { actions: { ...DEFAULT_ACTIONS, slow: { model: 'random-non-glm', thinking: 'xhigh' } } }
    writeFileSync(path.join(home, '.glm', 'settings.json'), JSON.stringify(bad))
    const out = await checkActions()
    const slow = out.find(c => c.id === 'actions-slow-model')
    expect(slow?.pass).toBe(false)
    expect(slow?.fixable).toBe(true)
  })
})
```

Run:
```bash
pnpm vitest run packages/core/test/unit/doctor-actions.test.ts
```

Expected: 4 passed.

- [ ] **Step 2.6: Attachments / vision check (P10-Fix-16 — spec §9.12)**

`packages/core/src/doctor/checks/attachments.ts`:
```ts
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { resolvePaths } from '@glm/shared'
import type { DoctorCheck } from '../runner'

/**
 * AttachmentsCheckDeps lets the doctor probe the bundled glm-vision MCP server
 * without hard-binding to P4's mcpHost type. In production, the daemon-side
 * doctor handler wires `pingMcp` to `daemon.mcpHost.ping('glm-vision')`.
 * For unit tests we supply a stub.
 */
export interface AttachmentsCheckDeps {
  pingMcp?: (serverName: string) => Promise<{ ok: boolean; detail: string }>
}

const TEN_MB = 10 * 1024 * 1024

export async function checkAttachments(deps: AttachmentsCheckDeps = {}): Promise<DoctorCheck[]> {
  const out: DoctorCheck[] = []
  const paths = resolvePaths()
  const settingsFile = path.join(paths.root, 'settings.json')

  // ── 1) attachments.image.maxBytes sanity ─────────────────────────────────
  let raw: any = {}
  if (existsSync(settingsFile)) {
    try { raw = JSON.parse(readFileSync(settingsFile, 'utf8')) } catch { /* ignore — actions check fires */ }
  }
  const maxBytes = raw?.attachments?.image?.maxBytes ?? 4_718_592      // default 4.5MB per spec §9.12
  out.push({
    id: 'attachments-maxbytes', category: 'attachments',
    label: 'attachments.image.maxBytes ≤ 10MB',
    pass: maxBytes <= TEN_MB,
    level: maxBytes <= TEN_MB ? 'info' : 'warn',
    detail: `${(maxBytes / (1024 * 1024)).toFixed(1)}MB`,
    remediation: maxBytes > TEN_MB
      ? 'Set attachments.image.maxBytes ≤ 10485760 — large raw inputs strain glm-vision MCP; rely on autoResize instead'
      : undefined,
    fixable: false,
  })

  // ── 2) Vision cache size report ──────────────────────────────────────────
  const visionDir = path.join(paths.root, 'cache', 'vision')
  let visionSize = 0; let visionCount = 0
  if (existsSync(visionDir)) {
    for (const f of readdirSync(visionDir)) {
      try { visionSize += statSync(path.join(visionDir, f)).size; visionCount++ } catch { /* skip */ }
    }
  }
  out.push({
    id: 'vision-cache-size', category: 'attachments',
    label: 'Vision result cache size',
    pass: true,                                                          // informational only
    level: 'info',
    detail: existsSync(visionDir)
      ? `${visionCount} entries, ${(visionSize / (1024 * 1024)).toFixed(1)}MB (cap 50MB — eviction in glm gc)`
      : '(cache empty — no images processed yet)',
    fixable: false,
  })

  // ── 3) glm-vision MCP reachability ───────────────────────────────────────
  if (deps.pingMcp) {
    try {
      const ping = await deps.pingMcp('glm-vision')
      out.push({
        id: 'glm-vision-reachable', category: 'attachments',
        label: 'glm-vision MCP server reachable',
        pass: ping.ok,
        level: ping.ok ? 'info' : 'warn',
        detail: ping.detail,
        remediation: ping.ok ? undefined : 'check `glm mcp list` and ensure glm-vision is enabled in settings; verify GLM_API_KEY',
        fixable: false,
      })
    } catch (e: any) {
      out.push({
        id: 'glm-vision-reachable', category: 'attachments',
        label: 'glm-vision MCP server reachable',
        pass: false, level: 'warn',
        detail: e?.message ?? String(e),
        remediation: 'restart the daemon (`glm daemon restart`); image attachments will warn until this resolves',
        fixable: false,
      })
    }
  }

  // ── 4) ~/.glm/sessions/<sid>/attachments/ directory permissions ──────────
  const sessionsDir = path.join(paths.root, 'sessions')
  if (existsSync(sessionsDir)) {
    for (const sid of readdirSync(sessionsDir)) {
      const attDir = path.join(sessionsDir, sid, 'attachments')
      if (!existsSync(attDir)) continue
      const mode = statSync(attDir).mode & 0o777
      const tight = (mode & 0o077) === 0                                  // others have no access
      out.push({
        id: `attach-perms-${sid}`, category: 'attachments',
        label: `~/.glm/sessions/${sid}/attachments permissions`,
        pass: tight,
        level: tight ? 'info' : 'warn',
        detail: `mode 0${mode.toString(8)}`,
        remediation: tight ? undefined : `chmod 700 ${attDir} — screenshots may contain sensitive UI`,
        fixable: true,
      })
    }
  }

  return out
}
```

Register `checkAttachments` in `runner.ts` alongside `checkActions`, wired with the daemon's `mcpHost.ping('glm-vision')` when the runner is constructed from the daemon-side handler.

Add the `--fix` recipe for `attach-perms-*` checks. Append to the `switch (c.id)` block in `fix.ts`:
```ts
default: {
  const attM = c.id.match(/^attach-perms-(.+)$/)
  if (attM) {
    const sid = attM[1]!
    const attDir = path.join(resolvePaths().root, 'sessions', sid, 'attachments')
    chmodSync(attDir, 0o700)
    out.push({ id: c.id, ok: true, detail: `chmod 700 ${attDir}` })
    break
  }
  // ... existing actions-* fall-through stays here ...
}
```

Unit test `packages/core/test/unit/doctor-attachments.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, chmodSync, statSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { checkAttachments } from '../../src/doctor/checks/attachments'

let home: string
beforeEach(() => {
  home = mkdtempSync(path.join(os.tmpdir(), 'glm-doc-att-'))
  process.env.GLM_HOME = home
  mkdirSync(path.join(home, '.glm'), { recursive: true, mode: 0o700 })
})
afterEach(() => {
  rmSync(home, { recursive: true, force: true })
  delete process.env.GLM_HOME
})

describe('doctor.checkAttachments (P10-Fix-16 — spec §9.12)', () => {
  test('default maxBytes (4.5MB) → passes', async () => {
    const r = await checkAttachments()
    expect(r.find(c => c.id === 'attachments-maxbytes')?.pass).toBe(true)
  })

  test('maxBytes > 10MB → warn', async () => {
    writeFileSync(path.join(home, '.glm', 'settings.json'),
      JSON.stringify({ attachments: { image: { maxBytes: 50 * 1024 * 1024 } } }))
    const r = await checkAttachments()
    const c = r.find(c => c.id === 'attachments-maxbytes')
    expect(c?.pass).toBe(false)
    expect(c?.level).toBe('warn')
  })

  test('empty vision cache → info "(cache empty…)"', async () => {
    const r = await checkAttachments()
    const c = r.find(c => c.id === 'vision-cache-size')
    expect(c?.pass).toBe(true)
    expect(c?.detail).toMatch(/empty/)
  })

  test('vision cache with files → reports size and entry count', async () => {
    const dir = path.join(home, '.glm', 'cache', 'vision')
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, 'a__image_analysis.json'), Buffer.alloc(2 * 1024 * 1024))
    writeFileSync(path.join(dir, 'b__image_analysis.json'), Buffer.alloc(1 * 1024 * 1024))
    const r = await checkAttachments()
    const c = r.find(c => c.id === 'vision-cache-size')
    expect(c?.detail).toMatch(/2 entries/)
    expect(c?.detail).toMatch(/3\.0MB/)
  })

  test('glm-vision MCP reachable (pingMcp returns ok) → info', async () => {
    const ping = vi.fn(async () => ({ ok: true, detail: 'pong (12ms)' }))
    const r = await checkAttachments({ pingMcp: ping })
    const c = r.find(c => c.id === 'glm-vision-reachable')
    expect(c?.pass).toBe(true)
    expect(ping).toHaveBeenCalledWith('glm-vision')
  })

  test('glm-vision MCP unreachable → warn with remediation', async () => {
    const ping = vi.fn(async () => ({ ok: false, detail: 'spawn failed: ENOENT npx' }))
    const r = await checkAttachments({ pingMcp: ping })
    const c = r.find(c => c.id === 'glm-vision-reachable')
    expect(c?.pass).toBe(false)
    expect(c?.level).toBe('warn')
    expect(c?.remediation).toMatch(/glm mcp list/)
  })

  test('attachments dir mode 0700 → pass; mode 0755 → warn / fixable', async () => {
    const attTight = path.join(home, '.glm', 'sessions', 'sA', 'attachments')
    const attLoose = path.join(home, '.glm', 'sessions', 'sB', 'attachments')
    mkdirSync(attTight, { recursive: true, mode: 0o700 })
    mkdirSync(attLoose, { recursive: true })
    chmodSync(attLoose, 0o755)
    const r = await checkAttachments()
    expect(r.find(c => c.id === 'attach-perms-sA')?.pass).toBe(true)
    const loose = r.find(c => c.id === 'attach-perms-sB')
    expect(loose?.pass).toBe(false)
    expect(loose?.fixable).toBe(true)
  })
})
```

Run:
```bash
pnpm vitest run packages/core/test/unit/doctor-attachments.test.ts
```

Expected: 7 passed.

- [ ] **Step 3: `--fix` applier**

`packages/core/src/doctor/fix.ts`:
```ts
import { mkdirSync, chmodSync } from 'node:fs'
import { resolvePaths } from '@glm/shared'
import type { DoctorCheck } from './runner'

export interface FixResult {
  id: string
  ok: boolean
  detail: string
}

export async function applyFixes(checks: DoctorCheck[]): Promise<FixResult[]> {
  const out: FixResult[] = []
  for (const c of checks) {
    if (c.pass || !c.fixable) continue
    try {
      switch (c.id) {
        case 'glm-home': {
          const p = resolvePaths(); mkdirSync(p.root, { recursive: true, mode: 0o700 })
          out.push({ id: c.id, ok: true, detail: `created ${p.root}` })
          break
        }
        case 'glm-home-perms': {
          const p = resolvePaths(); chmodSync(p.root, 0o700)
          out.push({ id: c.id, ok: true, detail: `chmod 700 ${p.root}` })
          break
        }
        default:
          out.push({ id: c.id, ok: false, detail: 'no auto-fix recipe' })
      }
    } catch (e: any) {
      out.push({ id: c.id, ok: false, detail: e?.message ?? String(e) })
    }
  }
  return out
}
```

- [ ] **Step 4: Doctor runner test**

`packages/core/test/unit/doctor-runner.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { DoctorRunner, type DoctorCheck } from '../../src/doctor/runner'

const ok: DoctorCheck = { id: 'a', category: 'runtime', label: 'a', pass: true, level: 'info', detail: 'ok', fixable: false }
const warn: DoctorCheck = { id: 'b', category: 'runtime', label: 'b', pass: false, level: 'warn', detail: 'meh', fixable: true }
const fatal: DoctorCheck = { id: 'c', category: 'runtime', label: 'c', pass: false, level: 'fatal', detail: 'bad', fixable: false }

describe('DoctorRunner', () => {
  test('aggregates summary', async () => {
    const r = new DoctorRunner([async () => [ok, warn, fatal]])
    const rep = await r.run()
    expect(rep.summary).toEqual({ fatal: 1, warn: 1, info: 1 })
    expect(rep.overall).toBe('unhealthy')
  })
  test('all-pass → healthy', async () => {
    const r = new DoctorRunner([async () => [ok, ok]])
    expect((await r.run()).overall).toBe('healthy')
  })
  test('warn-only → degraded', async () => {
    const r = new DoctorRunner([async () => [ok, warn]])
    expect((await r.run()).overall).toBe('degraded')
  })
})
```

- [ ] **Step 5: CLI extension (Modify — replaces the P1 skeleton + P5 mod)**

`packages/cli/src/commands/doctor.ts` (Modify):
```ts
import { Command } from 'commander'
import kleur from 'kleur'
import { connectDaemon } from '../auto-spawn'

export function registerDoctor(parent: Command): void {
  parent.command('doctor')
    .option('--fix', 'apply safe auto-fixes')
    .option('--json', 'machine-readable output')
    .description('Run the full health check')
    .action(async (opts: { fix?: boolean; json?: boolean }) => {
      const c = await connectDaemon()
      const rep = await c.call('doctor.run', {}) as any
      if (opts.fix) {
        const fixes = await c.call('doctor.fix', { checks: rep.checks }) as any[]
        for (const f of fixes) console.log(f.ok ? kleur.green('✓') : kleur.red('✗'), f.id, f.detail)
      }
      if (opts.json) { process.stdout.write(JSON.stringify(rep, null, 2) + '\n'); return }
      for (const c of rep.checks) {
        const icon = c.pass ? kleur.green('✓') : c.level === 'fatal' ? kleur.red('✗') : kleur.yellow('!')
        console.log(`${icon} [${c.category}] ${c.label} — ${c.detail}`)
        if (!c.pass && c.remediation) console.log(`    ${kleur.dim('→ ' + c.remediation)}`)
      }
      const label = { healthy: kleur.green('HEALTHY'), degraded: kleur.yellow('DEGRADED'), unhealthy: kleur.red('UNHEALTHY') }[rep.overall]
      console.log(`\n${label}  (fatal=${rep.summary.fatal} warn=${rep.summary.warn})`)
      if (rep.summary.fatal > 0) process.exit(2)
    })
}
```

- [ ] **Step 6: Run — PASS**

```bash
pnpm vitest run packages/core/test/unit/doctor-runner.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add packages
git commit -m "feat(doctor): full glm doctor — runtime/install/api/mcp/lsp/compat/sessions/warnings + --fix"
```

---

## Task 20: Safe mode + crash report + opt-in telemetry

**Files:**
- Create: `packages/core/src/safe-mode/boot.ts`
- Create: `packages/core/src/crash-report/{bundle.ts,redact.ts,interactive.ts}`
- Create: `packages/core/src/telemetry/{client.ts,schema.ts}`
- Test: `packages/core/test/unit/crash-redact.test.ts`
- Test: `packages/core/test/unit/telemetry-schema.test.ts`

- [ ] **Step 1: Safe-mode boot configuration**

`packages/core/src/safe-mode/boot.ts`:
```ts
export interface SafeModeFlags {
  disableExternalMcp: boolean
  disablePlugins: boolean
  disableHooks: boolean
  disableKeywordDetector: boolean
  ephemeralSession: boolean      // session won't persist to disk
  forceDefaultSettings: boolean
}

export const SAFE_MODE_DEFAULTS: SafeModeFlags = {
  disableExternalMcp: true,
  disablePlugins: true,
  disableHooks: true,
  disableKeywordDetector: true,
  ephemeralSession: true,
  forceDefaultSettings: true
}

/**
 * Apply safe-mode flags onto a runtime config object. Returns the new config
 * (the caller is responsible for passing it through to daemon/session bootstrap).
 */
export function applySafeMode<T extends Record<string, unknown>>(cfg: T, flags = SAFE_MODE_DEFAULTS): T {
  return {
    ...cfg,
    externalMcp: flags.disableExternalMcp ? { enabled: false } : (cfg as any).externalMcp,
    plugins: flags.disablePlugins ? { enabled: false } : (cfg as any).plugins,
    hooks: flags.disableHooks ? { enabled: false } : (cfg as any).hooks,
    keywords: flags.disableKeywordDetector ? { enabled: false } : (cfg as any).keywords,
    ephemeral: flags.ephemeralSession
  }
}
```

- [ ] **Step 2: Crash report redactor**

`packages/core/src/crash-report/redact.ts`:
```ts
const SECRET_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: 'glm-api-key',    re: /(GLM_API_KEY=)[^\s"']+/g },
  { name: 'anthropic-key',  re: /(sk-ant-[A-Za-z0-9_-]{20,})/g },
  { name: 'openai-key',     re: /(sk-[A-Za-z0-9]{20,})/g },
  { name: 'aws-access',     re: /(AKIA[0-9A-Z]{16})/g },
  { name: 'aws-secret',     re: /([A-Za-z0-9/+=]{40})\b/g },             // approx — risk of FP
  { name: 'jwt',            re: /(eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,})/g },
  { name: 'bearer',         re: /(Bearer\s+)[A-Za-z0-9._-]{20,}/gi },
  { name: 'gh-token',       re: /(gh[pousr]_[A-Za-z0-9]{36,})/g },
  { name: 'slack-token',    re: /(xox[abprs]-[A-Za-z0-9-]{10,})/g },
  { name: 'private-key',    re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  { name: 'email',          re: /[\w.+-]+@[\w-]+\.[\w.-]+/g },             // optional / configurable
]

export interface RedactOptions {
  includeEmails: boolean
}

export function redactText(input: string, opts: RedactOptions = { includeEmails: true }): { text: string; found: Record<string, number> } {
  const found: Record<string, number> = {}
  let out = input
  for (const { name, re } of SECRET_PATTERNS) {
    if (name === 'email' && !opts.includeEmails) continue
    out = out.replace(re, (m, ...rest) => {
      found[name] = (found[name] ?? 0) + 1
      // for prefix patterns, preserve the prefix
      if (rest.length > 1 && typeof rest[0] === 'string' && rest[0].endsWith('=')) {
        return rest[0] + `[REDACTED:${name}]`
      }
      if (m.startsWith('Bearer ')) return 'Bearer [REDACTED:bearer]'
      return `[REDACTED:${name}]`
    })
  }
  return { text: out, found }
}
```

- [ ] **Step 3: Redact unit test**

`packages/core/test/unit/crash-redact.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { redactText } from '../../src/crash-report/redact'

describe('redactText', () => {
  test('redacts GLM_API_KEY env line', () => {
    const r = redactText('GLM_API_KEY=abcdefghijklmno1234')
    expect(r.text).toMatch(/GLM_API_KEY=\[REDACTED/)
    expect(r.found['glm-api-key']).toBe(1)
  })
  test('redacts anthropic key', () => {
    const r = redactText('use sk-ant-1234567890abcdefghij1234 here')
    expect(r.text).toMatch(/\[REDACTED:anthropic-key\]/)
  })
  test('redacts JWT', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
    const r = redactText(`token=${jwt}`)
    expect(r.text).toMatch(/\[REDACTED:jwt\]/)
  })
  test('redacts Bearer header preserving prefix', () => {
    const r = redactText('Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456')
    expect(r.text).toMatch(/Bearer \[REDACTED:bearer\]/)
  })
  test('respects includeEmails=false', () => {
    const r = redactText('me@example.com', { includeEmails: false })
    expect(r.text).toBe('me@example.com')
  })
  test('redacts private key block', () => {
    const pk = '-----BEGIN RSA PRIVATE KEY-----\nMIIB...\n-----END RSA PRIVATE KEY-----'
    expect(redactText(pk).text).toMatch(/\[REDACTED:private-key\]/)
  })
})
```

- [ ] **Step 4: Bundle builder**

`packages/core/src/crash-report/bundle.ts`:
```ts
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { execFileSync } from 'node:child_process'
import zlib from 'node:zlib'
import { redactText } from './redact'

export interface CrashReportInputs {
  glmRoot: string
  reason: string
  errStack?: string
  sessionId?: string
  redactEmails: boolean
}

export interface CrashReport {
  path: string
  bytes: number
  secretsFound: Record<string, number>
}

/**
 * Collect a curated set of files (env redacted), tar+zstd-compress, return path.
 * Falls back to gzip if zstd isn't available.
 */
export function buildCrashReport(i: CrashReportInputs): CrashReport {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const reportDir = join(i.glmRoot, 'crash-reports')
  mkdirSync(reportDir, { recursive: true })
  const stageDir = join(reportDir, `_stage-${stamp}`)
  mkdirSync(stageDir, { recursive: true })

  const allFound: Record<string, number> = {}
  const collectFile = (relPath: string, content: string): void => {
    const { text, found } = redactText(content, { includeEmails: i.redactEmails })
    for (const [k, v] of Object.entries(found)) allFound[k] = (allFound[k] ?? 0) + v
    const out = join(stageDir, relPath)
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, text)
  }

  // 1. reason + stack
  collectFile('reason.txt', `${i.reason}\n\n${i.errStack ?? ''}`)
  // 2. daemon.log tail (last 2000 lines)
  const dlog = join(i.glmRoot, 'daemon.log')
  if (existsSync(dlog)) {
    const text = readFileSync(dlog, 'utf8').split('\n').slice(-2000).join('\n')
    collectFile('daemon.log', text)
  }
  // 3. doctor snapshot (best-effort)
  try {
    const env = Object.entries(process.env)
      .filter(([k]) => /^(NODE|PATH|HOME|SHELL|LANG|TERM|GLM_|ZAI_|ANTHROPIC_)/.test(k))
      .map(([k, v]) => `${k}=${v ?? ''}`).join('\n')
    collectFile('env.txt', env)
  } catch { /* ignore */ }
  // 4. session journal tail (if sessionId provided)
  if (i.sessionId) {
    const j = join(i.glmRoot, 'sessions', i.sessionId, 'journal.md')
    if (existsSync(j)) collectFile(`sessions/${i.sessionId}/journal.md`, readFileSync(j, 'utf8'))
  }
  // 5. tar
  const tarPath = join(reportDir, `crash-${stamp}.tar`)
  execFileSync('tar', ['-cf', tarPath, '-C', reportDir, `_stage-${stamp}`])
  // 6. compress — prefer zstd, fall back to gzip
  let finalPath = tarPath
  try {
    execFileSync('zstd', ['-q', '--rm', tarPath])
    finalPath = tarPath + '.zst'
  } catch {
    const gz = zlib.gzipSync(readFileSync(tarPath))
    finalPath = tarPath + '.gz'
    writeFileSync(finalPath, gz)
    try { (require('node:fs')).unlinkSync(tarPath) } catch { /* ignore */ }
  }
  // 7. cleanup stage
  rmrf(stageDir)
  const bytes = statSync(finalPath).size
  return { path: finalPath, bytes, secretsFound: allFound }
}

function rmrf(p: string): void {
  if (!existsSync(p)) return
  for (const f of readdirSync(p)) {
    const full = join(p, f)
    const s = statSync(full)
    if (s.isDirectory()) rmrf(full)
    else (require('node:fs')).unlinkSync(full)
  }
  ;(require('node:fs')).rmdirSync(p)
}
```

- [ ] **Step 5: Interactive `glm bug report` flow**

`packages/core/src/crash-report/interactive.ts`:
```ts
import { buildCrashReport, type CrashReport } from './bundle'

export interface InteractiveInputs {
  glmRoot: string
  askConfirm: (question: string) => Promise<boolean>
  askText: (prompt: string) => Promise<string>
}

export async function interactiveBugReport(i: InteractiveInputs): Promise<CrashReport | null> {
  const includeEmails = await i.askConfirm('Redact email addresses too? (recommended)')
  const description = await i.askText('Short description of the problem')
  const sessionId = await i.askText('Session id involved (blank to skip)')
  const r = buildCrashReport({
    glmRoot: i.glmRoot,
    reason: `Manual bug report: ${description}`,
    sessionId: sessionId.trim() || undefined,
    redactEmails: includeEmails
  })
  return r
}
```

- [ ] **Step 6: Telemetry schema (opt-in only, no content)**

`packages/core/src/telemetry/schema.ts`:
```ts
import { z } from 'zod'

export const TelemetryEvent = z.object({
  anonymousId: z.string().regex(/^[0-9a-f-]{36}$/),        // UUIDv4, never tied to email
  version: z.string(),
  os: z.enum(['darwin', 'linux', 'win32']),
  arch: z.string(),
  event: z.enum([
    'install', 'first-run', 'session-start', 'session-complete',
    'longhorizon-promote', 'yolo-cap-hit', 'crash', 'doctor-unhealthy',
    'compaction', 'workflow-invoked'
  ]),
  // Strictly numeric / enum payload — no strings that could leak content
  payload: z.object({
    durationMs: z.number().optional(),
    steps: z.number().optional(),
    tokensTotal: z.number().optional(),
    modelsUsed: z.array(z.enum(['GLM-5.1','GLM-5-Turbo','GLM-5','GLM-4.7','GLM-4.6','GLM-4.5-Air','GLM-4.5','GLM-4.5-AirX'])).optional(),
    errorClass: z.enum(['transient','exhausted','invalid','infrastructure','logic']).optional(),
    workflow: z.enum(['autopilot','ralph','ultrawork','team','plan','trace','verify','critic','ultraqa','self-improve','debug','skillify','remember','visual-verdict','ai-slop-cleaner','external-context']).optional()
  }).strict()
})
export type TelemetryEvent = z.infer<typeof TelemetryEvent>
```

`packages/core/src/telemetry/client.ts`:
```ts
import { TelemetryEvent } from './schema'

export interface TelemetryConfig {
  enabled: boolean
  endpoint: string
  anonymousId: string
}

export class TelemetryClient {
  constructor(private cfg: TelemetryConfig, private fetchImpl: typeof fetch = fetch) {}
  async track(ev: Omit<TelemetryEvent, 'anonymousId'>): Promise<{ ok: boolean }> {
    if (!this.cfg.enabled) return { ok: true }
    const full = { ...ev, anonymousId: this.cfg.anonymousId }
    const parsed = TelemetryEvent.safeParse(full)
    if (!parsed.success) return { ok: false }
    try {
      const res = await this.fetchImpl(this.cfg.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed.data)
      })
      return { ok: res.ok }
    } catch { return { ok: false } }
  }
}
```

- [ ] **Step 7: Telemetry test**

`packages/core/test/unit/telemetry-schema.test.ts`:
```ts
import { describe, expect, test, vi } from 'vitest'
import { TelemetryEvent } from '../../src/telemetry/schema'
import { TelemetryClient } from '../../src/telemetry/client'

describe('telemetry', () => {
  test('schema rejects unknown payload keys', () => {
    const r = TelemetryEvent.safeParse({
      anonymousId: '11111111-1111-1111-1111-111111111111',
      version: '0.1.0', os: 'darwin', arch: 'arm64',
      event: 'install', payload: { secret: 'leaked' as any }
    })
    expect(r.success).toBe(false)
  })
  test('disabled client never POSTs', async () => {
    const f = vi.fn()
    const c = new TelemetryClient({ enabled: false, endpoint: 'http://x', anonymousId: '11111111-1111-1111-1111-111111111111' }, f as any)
    await c.track({ version: '0.1.0', os: 'darwin', arch: 'arm64', event: 'install', payload: {} })
    expect(f).not.toHaveBeenCalled()
  })
  test('enabled client posts valid event', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true } as Response)
    const c = new TelemetryClient({ enabled: true, endpoint: 'http://x', anonymousId: '11111111-1111-1111-1111-111111111111' }, f as any)
    const r = await c.track({ version: '0.1.0', os: 'darwin', arch: 'arm64', event: 'session-start', payload: { steps: 3 } })
    expect(r.ok).toBe(true)
    expect(f).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 8: CLI — `glm bug report`, `glm --safe`, `glm config telemetry`**

`packages/cli/src/commands/bug.ts`:
```ts
import { Command } from 'commander'
import readline from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { connectDaemon } from '../auto-spawn'

export function registerBug(parent: Command): void {
  const bug = parent.command('bug')
  bug.command('report')
    .description('Generate a redacted crash report bundle')
    .action(async () => {
      const c = await connectDaemon()
      const rl = readline.createInterface({ input: stdin, output: stdout })
      const desc = await rl.question('Short description: ')
      const sid = await rl.question('Session id (blank to skip): ')
      const emailsAns = await rl.question('Redact emails too? [Y/n]: ')
      rl.close()
      const r = await c.call('bug.report', {
        description: desc.trim(),
        sessionId: sid.trim() || null,
        redactEmails: !/^n/i.test(emailsAns.trim())
      }) as { path: string; bytes: number; secretsFound: Record<string, number> }
      console.log(`wrote ${r.path} (${(r.bytes/1024).toFixed(1)} KiB)`)
      console.log(`redacted:`, r.secretsFound)
    })
}
```

`packages/cli/src/commands/safe.ts`:
```ts
import { Command } from 'commander'

export function registerSafe(parent: Command): void {
  // `glm --safe` is a top-level flag, but we also expose `glm safe` for clarity
  parent.command('safe [prompt...]')
    .description('Start an ephemeral session with plugins/hooks/external-MCP disabled')
    .action(async (parts: string[]) => {
      process.env.GLM_SAFE_MODE = '1'
      const { runChatOnce } = await import('./chat')
      await runChatOnce(parts.join(' '))
    })
}
```

`packages/cli/src/commands/config-telemetry.ts`:
```ts
import { Command } from 'commander'
import { connectDaemon } from '../auto-spawn'

export function registerConfigTelemetry(parent: Command): void {
  const cfg = parent.command('config')
  cfg.command('telemetry <action>')
    .description('enable | disable | status')
    .action(async (action: string) => {
      const c = await connectDaemon()
      const r = await c.call('config.telemetry', { action }) as { enabled: boolean; anonymousId: string }
      console.log(`telemetry: ${r.enabled ? 'enabled' : 'disabled'}  id=${r.anonymousId}`)
    })
}
```

- [ ] **Step 9: Run all unit tests — PASS**

```bash
pnpm vitest run packages/core/test/unit/crash-redact.test.ts packages/core/test/unit/telemetry-schema.test.ts
```

- [ ] **Step 10: Commit**

```bash
git add packages
git commit -m "feat(p10): safe mode + crash report (tar.zst with redaction) + opt-in telemetry"
```

---

## Task 21: `glm auto` + `/auto` CLI + resume prompt UI

**Files:**
- Create: `packages/cli/src/commands/auto.ts`
- Create: `packages/cli/src/commands/yolo.ts`
- Modify: `packages/cli/src/bin.ts` to register new commands

- [ ] **Step 1: `glm auto "..."` command + resume prompt**

`packages/cli/src/commands/auto.ts`:
```ts
import { Command } from 'commander'
import kleur from 'kleur'
import readline from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { connectDaemon } from '../auto-spawn'

export function registerAuto(parent: Command): void {
  parent.command('auto <prompt...>')
    .description('Start (or attach) a long-horizon session for this prompt')
    .option('--yolo', 'also enable yolo mode (3-tier policy)')
    .action(async (parts: string[], opts: { yolo?: boolean }) => {
      const c = await connectDaemon()
      // Check for resume candidates first
      const cands = await c.call('longhorizon.resume.candidates', {}) as Array<{ sessionId: string; lastStep: number; lastPhase: string; lastTs: string; summary: string }>
      if (cands.length > 0) {
        console.log(kleur.cyan('\n→ Found long-horizon sessions:\n'))
        cands.forEach((s, i) => {
          console.log(`  ${kleur.bold(`[${i+1}]`)} ${s.sessionId.slice(0, 8)}  step ${s.lastStep}/${s.lastPhase}  ${kleur.dim(s.lastTs)}`)
          console.log(`      ${kleur.dim(s.summary)}`)
        })
        const rl = readline.createInterface({ input: stdin, output: stdout })
        const pick = (await rl.question('\nPick number to resume, or [n] for new: ')).trim()
        rl.close()
        if (/^\d+$/.test(pick)) {
          const cand = cands[Number(pick) - 1]
          if (cand) {
            await c.call('longhorizon.resume.apply', { sessionId: cand.sessionId, action: 'resume' })
            console.log(kleur.green('✓'), `resumed ${cand.sessionId.slice(0,8)} from step ${cand.lastStep}`)
            return
          }
        }
      }
      // New long-horizon session
      const prompt = parts.join(' ')
      await c.call('longhorizon.start', { prompt, yolo: !!opts.yolo })
      console.log(kleur.green('✓'), `started long-horizon session — detach anytime with Ctrl-D`)
    })
}
```

- [ ] **Step 2: `glm yolo doctor` + `glm yolo revert`**

`packages/cli/src/commands/yolo.ts`:
```ts
import { Command } from 'commander'
import kleur from 'kleur'
import { connectDaemon } from '../auto-spawn'

export function registerYolo(parent: Command): void {
  const yolo = parent.command('yolo')
  yolo.command('doctor')
    .description('Check yolo-mode environment suitability')
    .action(async () => {
      const c = await connectDaemon()
      const checks = await c.call('yolo.doctor', {}) as Array<{ id: string; label: string; pass: boolean; level: string; detail: string; remediation?: string }>
      for (const ch of checks) {
        const icon = ch.pass ? kleur.green('✓') : (ch.level === 'fatal' ? kleur.red('✗') : kleur.yellow('!'))
        console.log(`${icon} ${ch.label} — ${ch.detail}`)
        if (!ch.pass && ch.remediation) console.log(`    ${kleur.dim('→ ' + ch.remediation)}`)
      }
      if (checks.some(c => !c.pass && c.level === 'fatal')) process.exit(2)
    })
  yolo.command('revert <step>')
    .description('Restore working tree to a step snapshot')
    .option('--session <id>', 'session id (defaults to latest)')
    .action(async (step: string, opts: { session?: string }) => {
      const c = await connectDaemon()
      const r = await c.call('yolo.revert', { step: Number(step), sessionId: opts.session }) as { ok: boolean; message: string }
      console.log(r.ok ? kleur.green('✓') : kleur.red('✗'), r.message)
      if (!r.ok) process.exit(1)
    })
  yolo.command('list')
    .description('List snapshots in the current/latest yolo session')
    .option('--session <id>', 'session id (defaults to latest)')
    .action(async (opts: { session?: string }) => {
      const c = await connectDaemon()
      const list = await c.call('yolo.snapshot.list', { sessionId: opts.session }) as Array<{ step: number; ts: string; description: string }>
      for (const s of list) console.log(`step ${String(s.step).padStart(4)}  ${s.ts}  ${s.description}`)
    })
}
```

- [ ] **Step 2.5: Register `/yolo` slash (P10-Fix-10 — spec §8.12)**

Register `/yolo` through P2's slash registry (per manifest §0.12 — every CLI is reachable as a slash, and `/yolo` is explicitly called out in the spec). Toggle (no args) flips yolo mode session-wide; with the optional form-mode UI for setting caps.

```ts
// packages/tui/src/slash/builtin/yolo.ts (P10-owned; registered via the commands[] pattern)
import { registerSlashCommand } from '../registry'

registerSlashCommand({
  name: 'yolo',
  description: 'Toggle yolo mode (3-tier policy). Use /yolo form to edit caps interactively.',
  handler: async (args, ctx) => {
    if (args[0] === 'form') {
      const ans = await ctx.askStructured({
        type: 'multi', question: 'Pick caps to override:',
        options: [
          { id: 'time',  label: 'time limit',   description: 'minutes' },
          { id: 'step',  label: 'step cap' },
          { id: 'token', label: 'token cap' },
          { id: 'quota', label: 'quota cap' },
        ],
      })
      await ctx.rpc.call('yolo.config.set', { capsToEdit: ans.selected })
      ctx.print('caps updated')
      return
    }
    const r = await ctx.rpc.call('yolo.toggle', { sessionId: ctx.sessionId }) as { enabled: boolean }
    ctx.print(`/yolo: ${r.enabled ? 'ON' : 'OFF'}`)
  }
})
```

The `yolo.toggle` + `yolo.config.set` RPC handlers belong to `makeYoloHandlers` (Task 2.5).

- [ ] **Step 3: Wire into `bin.ts`**

In `packages/cli/src/bin.ts`, add:
```ts
import { registerAuto } from './commands/auto'
import { registerYolo } from './commands/yolo'
import { registerNotify } from './commands/notify'
import { registerTrace } from './commands/trace'
import { registerCommit } from './commands/commit'
import { registerRecipe } from './commands/recipe'
import { registerDoctor } from './commands/doctor'
import { registerBug } from './commands/bug'
import { registerSafe } from './commands/safe'
import { registerConfigTelemetry } from './commands/config-telemetry'

// after `const program = new Command()` and any global flags:
program.option('--safe', 'boot ephemeral safe-mode session')
program.option('--yolo', 'enable yolo on the current invocation')
registerAuto(program)
registerYolo(program)
registerNotify(program)
registerTrace(program)
registerCommit(program)
registerRecipe(program)
registerDoctor(program)        // replaces P1 skeleton
registerBug(program)
registerSafe(program)
registerConfigTelemetry(program)
```

- [ ] **Step 4: Smoke build**

```bash
pnpm build
node packages/cli/dist/bin.js --help | grep -E 'auto|yolo|notify|trace|commit|recipe|doctor|bug|safe'
```

Expected: every command appears.

- [ ] **Step 5: Commit**

```bash
git add packages/cli
git commit -m "feat(cli): wire auto/yolo/notify/trace/commit/recipe/doctor/bug/safe commands"
```

---

## Task 22: Process recycling at 1h / 1000-step boundary

**Files:**
- Create: `packages/core/src/recycling/boundary.ts`
- Test: `packages/core/test/unit/recycling-boundary.test.ts`

- [ ] **Step 1: Boundary check**

`packages/core/src/recycling/boundary.ts`:
```ts
export interface RecycleSignals {
  startedAtMs: number
  stepsDone: number
  hasInflightLlm: boolean
  hasActiveSubagent: boolean
  checkpointCommitted: boolean
}

export interface RecycleConfig {
  maxAgeMs: number          // default 1h = 3600_000
  maxSteps: number          // default 1000
}

export const DEFAULT_RECYCLE: RecycleConfig = {
  maxAgeMs: 60 * 60 * 1000,
  maxSteps: 1000
}

export interface RecycleDecision {
  recycle: boolean
  reason: string
}

export function decideRecycle(s: RecycleSignals, cfg: RecycleConfig = DEFAULT_RECYCLE, nowMs = Date.now()): RecycleDecision {
  // Hard rule: never recycle if there's an in-flight LLM call OR an active sub-agent
  if (s.hasInflightLlm || s.hasActiveSubagent) {
    return { recycle: false, reason: 'in-flight LLM or sub-agent — not a clean boundary' }
  }
  if (!s.checkpointCommitted) {
    return { recycle: false, reason: 'last checkpoint not yet committed' }
  }
  const age = nowMs - s.startedAtMs
  if (age >= cfg.maxAgeMs) return { recycle: true, reason: `worker age ${(age/60000).toFixed(0)}min ≥ ${cfg.maxAgeMs/60000}min` }
  if (s.stepsDone >= cfg.maxSteps) return { recycle: true, reason: `steps ${s.stepsDone} ≥ ${cfg.maxSteps}` }
  return { recycle: false, reason: 'within budgets' }
}
```

- [ ] **Step 2: Unit test**

`packages/core/test/unit/recycling-boundary.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { decideRecycle, DEFAULT_RECYCLE } from '../../src/recycling/boundary'

const base = {
  startedAtMs: Date.now(),
  stepsDone: 0,
  hasInflightLlm: false,
  hasActiveSubagent: false,
  checkpointCommitted: true
}

describe('decideRecycle', () => {
  test('never recycles mid-LLM call', () => {
    expect(decideRecycle({ ...base, hasInflightLlm: true })).toEqual({ recycle: false, reason: expect.stringMatching(/in-flight/) })
  })
  test('never recycles with active sub-agent', () => {
    expect(decideRecycle({ ...base, hasActiveSubagent: true }).recycle).toBe(false)
  })
  test('waits for checkpoint', () => {
    expect(decideRecycle({ ...base, checkpointCommitted: false }).recycle).toBe(false)
  })
  test('recycles at 1000 steps', () => {
    expect(decideRecycle({ ...base, stepsDone: 1000 }).recycle).toBe(true)
  })
  test('recycles after 1h', () => {
    const now = Date.now()
    expect(decideRecycle({ ...base, startedAtMs: now - 70 * 60 * 1000 }, DEFAULT_RECYCLE, now).recycle).toBe(true)
  })
  test('within budgets → no recycle', () => {
    expect(decideRecycle(base).recycle).toBe(false)
  })
})
```

- [ ] **Step 3: Wire into worker loop**

In `packages/core/src/session/worker.ts` (P8), at end of each step:

```ts
import { decideRecycle } from '../recycling/boundary'

async maybeRecycleBoundary(step: number): Promise<void> {
  const d = decideRecycle({
    startedAtMs: this.bootMs,
    stepsDone: step,
    hasInflightLlm: this.llm.hasInflight(),
    hasActiveSubagent: this.subagents.activeCount() > 0,
    checkpointCommitted: this.checkpointLoop.latest(this.session.id)?.payload.step === step
  })
  if (d.recycle) {
    this.log.info({ reason: d.reason }, 'recycling worker at boundary')
    await this.gracefulRestart()
  }
}
```

- [ ] **Step 4: Run — PASS**

```bash
pnpm vitest run packages/core/test/unit/recycling-boundary.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(recycling): worker recycling at 1h / 1000-step boundary with safety guards"
```

---

## Task 22.1: Session export / import (P10-Fix-3 — spec §11.6 gap)

**Files:**
- Create: `packages/core/src/sessions/export.ts`
- Create: `packages/core/src/sessions/import.ts`
- Create: `packages/cli/src/commands/session-io.ts`
- Test: `packages/core/test/unit/session-export.test.ts`
- Test: `packages/core/test/integration/session-roundtrip.test.ts`

Closes the §11.6 portability gap. A session can be exported into a single JSON archive (full DB rows + checkpoint payloads + journal + per-step file snapshots referenced by sha) or human-readable Markdown or opencode-style HTML, then re-imported on the same or a different machine.

- [ ] **Step 1: Exporter**

`packages/core/src/sessions/export.ts`:
```ts
import type { Database } from 'better-sqlite3'

export type ExportFormat = 'json' | 'md' | 'html'

export interface ExportOptions {
  sessionId: string
  format: ExportFormat
  outPath?: string                    // defaults to ./sessions/<id>.<ext>
  includeSnapshots?: boolean          // include file-snapshot blob hashes (json/html only)
}

export interface ExportResult {
  path: string
  bytes: number
  format: ExportFormat
}

export class SessionExporter {
  constructor(private db: Database) {}

  exportJson(sessionId: string, includeSnapshots = true): unknown {
    const session = this.db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(sessionId)
    if (!session) throw new Error(`session not found: ${sessionId}`)
    const messages = this.db.prepare(`SELECT * FROM messages WHERE session_id = ? ORDER BY ts ASC`).all(sessionId)
    const events   = this.db.prepare(`SELECT * FROM events   WHERE session_id = ? ORDER BY ts ASC`).all(sessionId)
    const todos    = this.db.prepare(`SELECT * FROM todos    WHERE session_id = ?`).all(sessionId)
    const tools    = this.db.prepare(`SELECT * FROM tool_calls WHERE message_id IN (SELECT id FROM messages WHERE session_id = ?)`).all(sessionId)
    const checkpoints = this.db.prepare(`SELECT * FROM checkpoints WHERE session_id = ? ORDER BY step ASC`).all(sessionId)
    const fileVersions = this.db.prepare(`SELECT * FROM file_versions WHERE session_id = ?`).all(sessionId)
    let snapshots: unknown[] = []
    if (includeSnapshots) {
      snapshots = this.db.prepare(`
        SELECT s.* FROM snapshots s
        JOIN file_versions fv ON fv.sha = s.sha
        WHERE fv.session_id = ?
      `).all(sessionId)
    }
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      session, messages, events, todos, tools, checkpoints, fileVersions, snapshots,
    }
  }

  exportMarkdown(sessionId: string): string {
    const dump = this.exportJson(sessionId, false) as any
    const out: string[] = []
    out.push(`# Session ${sessionId}`, '')
    out.push(`- created: ${dump.session.created_at}`)
    out.push(`- mode: ${dump.session.mode ?? 'normal'}`, '')
    out.push(`## Transcript`, '')
    for (const m of dump.messages) {
      out.push(`### ${m.role} — ${m.ts}`)
      out.push('')
      out.push(m.content ?? '(no content)')
      out.push('')
    }
    out.push(`## Tool calls`, '')
    for (const t of dump.tools) out.push(`- ${t.name} (status=${t.status})`)
    return out.join('\n')
  }

  exportHtml(sessionId: string): string {
    const dump = this.exportJson(sessionId, true) as any
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const turns = (dump.messages as Array<{ role: string; content: string; ts: string }>)
      .map(m => `<section class="turn ${m.role}"><header>${esc(m.role)} <time>${esc(m.ts)}</time></header><pre>${esc(m.content ?? '')}</pre></section>`)
      .join('\n')
    return `<!doctype html><meta charset="utf-8"><title>Session ${esc(sessionId)}</title>
<style>body{font:14px/1.5 system-ui;max-width:880px;margin:auto;padding:24px}
.turn{margin:16px 0;padding:12px;border-left:4px solid #ccc}
.turn.user{border-color:#48a}.turn.assistant{border-color:#4a8}.turn.tool{border-color:#a84}
pre{white-space:pre-wrap;background:#f6f6f6;padding:8px}</style>
<h1>Session ${esc(sessionId)}</h1>${turns}`
  }
}
```

- [ ] **Step 2: Importer**

`packages/core/src/sessions/import.ts`:
```ts
import type { Database } from 'better-sqlite3'

export interface ImportOptions {
  overwrite?: boolean        // if false (default), refuse if session id already exists
  newSessionId?: string      // if provided, rewrite the id on import
}

export class SessionImporter {
  constructor(private db: Database) {}

  importJson(dump: any, opts: ImportOptions = {}): { sessionId: string } {
    if (!dump || dump.version !== 1) throw new Error('invalid export envelope (version != 1)')
    const targetId = opts.newSessionId ?? dump.session.id
    const exists = this.db.prepare(`SELECT id FROM sessions WHERE id = ?`).get(targetId)
    if (exists && !opts.overwrite) throw new Error(`session ${targetId} exists; pass --overwrite`)
    const tx = this.db.transaction(() => {
      if (exists && opts.overwrite) {
        this.db.prepare(`DELETE FROM sessions WHERE id = ?`).run(targetId)
      }
      const insert = (table: string, row: Record<string, unknown>) => {
        const cols = Object.keys(row); const vals = cols.map(c => row[c])
        const q = `INSERT INTO ${table}(${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`
        this.db.prepare(q).run(...vals)
      }
      insert('sessions', { ...dump.session, id: targetId })
      for (const m of dump.messages    ?? []) insert('messages',     { ...m, session_id: targetId })
      for (const e of dump.events      ?? []) insert('events',       { ...e, session_id: targetId })
      for (const t of dump.todos       ?? []) insert('todos',        { ...t, session_id: targetId })
      for (const t of dump.tools       ?? []) insert('tool_calls',   t)
      for (const c of dump.checkpoints ?? []) insert('checkpoints',  { ...c, session_id: targetId })
      for (const f of dump.fileVersions?? []) insert('file_versions',{ ...f, session_id: targetId })
      for (const s of dump.snapshots   ?? []) {
        try { insert('snapshots', s) } catch { /* sha already present — content-addressed, skip */ }
      }
    })
    tx()
    return { sessionId: targetId }
  }
}
```

- [ ] **Step 3: CLI**

`packages/cli/src/commands/session-io.ts`:
```ts
import { Command } from 'commander'
import { readFileSync, writeFileSync } from 'node:fs'
import { connectDaemon } from '../auto-spawn'

export function registerSessionIo(parent: Command): void {
  parent.command('export <sessionId>')
    .description('Export a session to JSON / Markdown / HTML')
    .option('--format <fmt>', 'json | md | html', 'json')
    .option('--out <path>', 'output path (defaults to ./<id>.<ext>)')
    .action(async (sessionId: string, opts: { format: 'json' | 'md' | 'html'; out?: string }) => {
      const c = await connectDaemon()
      const out = await c.call('session.export', { sessionId, format: opts.format }) as { content: string }
      const ext = opts.format === 'md' ? 'md' : opts.format === 'html' ? 'html' : 'json'
      const path = opts.out ?? `${sessionId}.${ext}`
      writeFileSync(path, out.content)
      console.log(`wrote ${path} (${out.content.length} bytes)`)
    })

  parent.command('import <file>')
    .description('Import a session from a JSON export')
    .option('--overwrite', 'replace an existing session with the same id')
    .option('--as <newId>', 'rename the imported session')
    .action(async (file: string, opts: { overwrite?: boolean; as?: string }) => {
      const c = await connectDaemon()
      const dump = JSON.parse(readFileSync(file, 'utf8'))
      const r = await c.call('session.import', { dump, overwrite: !!opts.overwrite, newSessionId: opts.as }) as { sessionId: string }
      console.log(`imported as ${r.sessionId}`)
    })
}
```

The `session.export` / `session.import` RPC handlers are registered through `makeLonghorizonHandlers` in Task 2.5 (so they participate in the standard LoaderHub flow).

- [ ] **Step 4: Unit roundtrip test**

`packages/core/test/unit/session-export.test.ts`:
```ts
import { afterEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { openDb, runMigrations } from '../../src/storage'
import { SessionExporter } from '../../src/sessions/export'
import { SessionImporter } from '../../src/sessions/import'

let dir: string
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }) })

describe('session export/import roundtrip', () => {
  test('json export → import yields identical row counts', () => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'glm-io-'))
    const db = openDb(path.join(dir, 's.db'))
    runMigrations(db)
    db.prepare(`INSERT INTO sessions (id,created_at,updated_at,cwd,worktree,active,mode)
                VALUES('S1','t','t','/x','/x',1,'normal')`).run()
    db.prepare(`INSERT INTO messages(id,session_id,ts,role,content) VALUES('m1','S1','t','user','hi')`).run()
    const exporter = new SessionExporter(db)
    const dump = exporter.exportJson('S1')
    db.prepare(`DELETE FROM sessions WHERE id='S1'`).run()
    new SessionImporter(db).importJson(dump)
    const restored = db.prepare(`SELECT COUNT(*) AS n FROM messages WHERE session_id='S1'`).get() as { n: number }
    expect(restored.n).toBe(1)
    db.close()
  })

  test('markdown export contains transcript header', () => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'glm-io-'))
    const db = openDb(path.join(dir, 's.db'))
    runMigrations(db)
    db.prepare(`INSERT INTO sessions (id,created_at,updated_at,cwd,worktree,active,mode)
                VALUES('S2','t','t','/x','/x',1,'normal')`).run()
    const md = new SessionExporter(db).exportMarkdown('S2')
    expect(md).toMatch(/# Session S2/)
    db.close()
  })
})
```

- [ ] **Step 5: Run — PASS**

```bash
pnpm vitest run packages/core/test/unit/session-export.test.ts
pnpm vitest run packages/core/test/integration/session-roundtrip.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add packages
git commit -m "feat(sessions): export/import (json/md/html) + glm export/import CLI"
```

---

## Task 22.2: `glm gc` cleanup command (P10-Fix-4 / P10-Fix-15 — spec §11.8 / §9.12 gap)

**Files:**
- Create: `packages/core/src/storage/gc.ts`
- Create: `packages/cli/src/commands/gc.ts`
- Test: `packages/core/test/unit/gc.test.ts`
- Test: `packages/core/test/integration/gc-cli.test.ts`

Closes the §11.8 housekeeping gap. Bounded-cost cleanup of session DBs, archived sessions, cache layers (web / llm / **vision** per spec §9.12 — P10-Fix-15), rolling logs, and per-session attachments older than `attachments.image.cleanupAge` (default `7d`).

- [ ] **Step 1: GC engine**

`packages/core/src/storage/gc.ts`:
```ts
import { existsSync, statSync, readdirSync, unlinkSync, renameSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import type { Database } from 'better-sqlite3'
import type { Logger } from '../log'

export interface GcReport {
  vacuumedDbs: Array<{ path: string; beforeBytes: number; afterBytes: number }>
  archivedSessions: string[]
  evictedFiles: Array<{ path: string; reason: string }>
  trimmedLogs: string[]
  dryRun: boolean
}

export interface GcOptions {
  dryRun?: boolean
  vacuumThresholdBytes?: number      // default 100 MB
  archiveAgeDays?: number            // default 180
  webCacheCapBytes?: number          // default 50 MB
  llmCacheCapBytes?: number          // default 200 MB
  visionCacheCapBytes?: number       // default 50 MB (P10-Fix-15 — spec §9.12)
  attachmentsCleanupDays?: number    // default 7 (P10-Fix-15 — honors attachments.image.cleanupAge)
  logCapBytes?: number               // default 50 MB; rotate 3 generations
  activeSessionIds?: Set<string>
}

export class GarbageCollector {
  constructor(private glmRoot: string, private log: Logger) {}

  async run(opts: GcOptions = {}): Promise<GcReport> {
    const dryRun = !!opts.dryRun
    const report: GcReport = {
      vacuumedDbs: [], archivedSessions: [], evictedFiles: [], trimmedLogs: [], dryRun
    }
    this.vacuumSessionDbs(opts.vacuumThresholdBytes ?? 100 * 1024 * 1024, dryRun, report)
    this.archiveIdleSessions(opts.archiveAgeDays ?? 180, dryRun, report, opts.activeSessionIds)
    this.lruEvictCache('web',    opts.webCacheCapBytes    ?? 50  * 1024 * 1024, dryRun, report)
    this.lruEvictCache('llm',    opts.llmCacheCapBytes    ?? 200 * 1024 * 1024, dryRun, report)
    this.lruEvictCache('vision', opts.visionCacheCapBytes ?? 50  * 1024 * 1024, dryRun, report)   // P10-Fix-15 (spec §9.12)
    this.cleanupAttachments(opts.attachmentsCleanupDays ?? 7, dryRun, report, opts.activeSessionIds)
    this.trimLog(opts.logCapBytes ?? 50 * 1024 * 1024, dryRun, report)
    return report
  }

  private vacuumSessionDbs(thresholdBytes: number, dryRun: boolean, report: GcReport): void {
    const sessionsDir = path.join(this.glmRoot, 'sessions')
    if (!existsSync(sessionsDir)) return
    for (const id of readdirSync(sessionsDir)) {
      const dbPath = path.join(sessionsDir, id, 'session.db')
      if (!existsSync(dbPath)) continue
      const before = statSync(dbPath).size
      if (before < thresholdBytes) continue
      if (dryRun) { report.vacuumedDbs.push({ path: dbPath, beforeBytes: before, afterBytes: before }); continue }
      try {
        // tiny better-sqlite3 connection only for VACUUM
        const Database = require('better-sqlite3') as typeof import('better-sqlite3')
        const db = new Database(dbPath)
        db.exec('VACUUM')
        db.close()
        const after = statSync(dbPath).size
        report.vacuumedDbs.push({ path: dbPath, beforeBytes: before, afterBytes: after })
      } catch (e) {
        this.log.warn({ err: String(e), dbPath }, 'vacuum failed')
      }
    }
  }

  private archiveIdleSessions(ageDays: number, dryRun: boolean, report: GcReport, active?: Set<string>): void {
    const sessionsDir = path.join(this.glmRoot, 'sessions')
    if (!existsSync(sessionsDir)) return
    const cutoff = Date.now() - ageDays * 24 * 3600 * 1000
    for (const id of readdirSync(sessionsDir)) {
      if (active?.has(id)) continue
      const sdir = path.join(sessionsDir, id)
      const mtime = statSync(sdir).mtimeMs
      if (mtime > cutoff) continue
      const archive = path.join(this.glmRoot, 'archive', `${id}.tar.zst`)
      if (dryRun) { report.archivedSessions.push(id); continue }
      try {
        execFileSync('tar', ['-cf', archive.replace(/\.zst$/, ''), '-C', sessionsDir, id])
        try { execFileSync('zstd', ['-q', '--rm', archive.replace(/\.zst$/, '')]) } catch { /* zstd absent → keep .tar */ }
        execFileSync('rm', ['-rf', sdir])
        report.archivedSessions.push(id)
      } catch (e) {
        this.log.warn({ err: String(e), id }, 'archive failed')
      }
    }
  }

  private lruEvictCache(layer: 'web' | 'llm' | 'vision', capBytes: number, dryRun: boolean, report: GcReport): void {
    const dir = path.join(this.glmRoot, 'cache', layer)
    if (!existsSync(dir)) return
    const entries = readdirSync(dir).map(f => {
      const fp = path.join(dir, f); const st = statSync(fp)
      return { fp, size: st.size, atime: st.atimeMs }
    }).sort((a, b) => a.atime - b.atime)            // oldest access first
    let total = entries.reduce((n, e) => n + e.size, 0)
    for (const e of entries) {
      if (total <= capBytes) break
      if (dryRun) { report.evictedFiles.push({ path: e.fp, reason: `${layer}-lru-evict` }); total -= e.size; continue }
      try { unlinkSync(e.fp); report.evictedFiles.push({ path: e.fp, reason: `${layer}-lru-evict` }); total -= e.size }
      catch (err) { this.log.warn({ err: String(err), fp: e.fp }, 'evict failed') }
    }
  }

  /**
   * P10-Fix-15 (spec §9.12): age-based cleanup of per-session attachments dir.
   * Walks `~/.glm/sessions/<sid>/attachments/img_*.{png,jpg,...}` and removes files older
   * than `ageDays`. Honors `attachments.image.cleanupAge` (set by the daemon-loader from
   * settings.json before calling gc.run({ attachmentsCleanupDays })). Active sessions are
   * skipped to avoid yanking files mid-turn.
   */
  private cleanupAttachments(ageDays: number, dryRun: boolean, report: GcReport, active?: Set<string>): void {
    const sessionsDir = path.join(this.glmRoot, 'sessions')
    if (!existsSync(sessionsDir)) return
    const cutoff = Date.now() - ageDays * 24 * 3600 * 1000
    for (const id of readdirSync(sessionsDir)) {
      if (active?.has(id)) continue
      const attDir = path.join(sessionsDir, id, 'attachments')
      if (!existsSync(attDir)) continue
      for (const f of readdirSync(attDir)) {
        const fp = path.join(attDir, f)
        let mtime: number
        try { mtime = statSync(fp).mtimeMs } catch { continue }
        if (mtime > cutoff) continue
        if (dryRun) { report.evictedFiles.push({ path: fp, reason: 'attachment-age-evict' }); continue }
        try { unlinkSync(fp); report.evictedFiles.push({ path: fp, reason: 'attachment-age-evict' }) }
        catch (err) { this.log.warn({ err: String(err), fp }, 'attachment cleanup failed') }
      }
    }
  }

  private trimLog(capBytes: number, dryRun: boolean, report: GcReport): void {
    const log = path.join(this.glmRoot, 'daemon.log')
    if (!existsSync(log)) return
    if (statSync(log).size <= capBytes) return
    if (dryRun) { report.trimmedLogs.push(log); return }
    try {
      for (let i = 3; i >= 1; i--) {
        const a = `${log}.${i}`; const b = `${log}.${i - 1}` === `${log}.0` ? log : `${log}.${i - 1}`
        if (existsSync(b) && i < 3) renameSync(b, a)
      }
      renameSync(log, `${log}.1`)
      report.trimmedLogs.push(log)
    } catch (e) {
      this.log.warn({ err: String(e), log }, 'rotate failed')
    }
  }
}
```

- [ ] **Step 2: CLI**

`packages/cli/src/commands/gc.ts`:
```ts
import { Command } from 'commander'
import { connectDaemon } from '../auto-spawn'

export function registerGc(parent: Command): void {
  parent.command('gc')
    .description('Garbage-collect old sessions, vacuum DBs, evict caches (web/llm/vision), trim logs, prune stale attachments')
    .option('--dry-run', 'preview only — no filesystem mutation')
    .option('--web-cap <bytes>', 'web cache cap (default 50MB)')
    .option('--llm-cap <bytes>', 'llm cache cap (default 200MB)')
    .option('--vision-cap <bytes>', 'vision cache cap (default 50MB — spec §9.12)')
    .option('--attach-days <n>', 'remove session attachments older than N days (default 7 — attachments.image.cleanupAge)')
    .option('--archive-days <n>', 'archive sessions idle for N days (default 180)')
    .action(async (opts: { dryRun?: boolean; webCap?: string; llmCap?: string; visionCap?: string; attachDays?: string; archiveDays?: string }) => {
      const c = await connectDaemon()
      const report = await c.call('storage.gc', {
        dryRun: !!opts.dryRun,
        webCacheCapBytes:    opts.webCap     ? Number(opts.webCap)     : undefined,
        llmCacheCapBytes:    opts.llmCap     ? Number(opts.llmCap)     : undefined,
        visionCacheCapBytes: opts.visionCap  ? Number(opts.visionCap)  : undefined,
        attachmentsCleanupDays: opts.attachDays ? Number(opts.attachDays) : undefined,
        archiveAgeDays:      opts.archiveDays ? Number(opts.archiveDays) : undefined,
      }) as any
      console.log(`${report.dryRun ? '[dry-run] ' : ''}vacuumed ${report.vacuumedDbs.length}, archived ${report.archivedSessions.length}, evicted ${report.evictedFiles.length}, trimmed ${report.trimmedLogs.length}`)
    })
}
```

The `storage.gc` RPC handler is added to `makeLonghorizonHandlers` (Task 2.5).

- [ ] **Step 3: Unit test**

`packages/core/test/unit/gc.test.ts`:
```ts
import { afterEach, describe, expect, test } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { GarbageCollector } from '../../src/storage/gc'
import { createLogger } from '../../src/log'

let dir: string
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }) })

describe('GarbageCollector', () => {
  test('dry-run reports without touching files', async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'glm-gc-'))
    const webDir = path.join(dir, 'cache', 'web')
    mkdirSync(webDir, { recursive: true })
    for (let i = 0; i < 5; i++) writeFileSync(path.join(webDir, `f${i}`), Buffer.alloc(1024 * 1024 * 20))   // 20MB each, cap 50MB
    const gc = new GarbageCollector(dir, createLogger('test'))
    const r = await gc.run({ dryRun: true, webCacheCapBytes: 50 * 1024 * 1024 })
    expect(r.evictedFiles.length).toBeGreaterThan(0)
    expect(statSync(path.join(webDir, 'f0')).size).toBe(20 * 1024 * 1024)   // file still there
  })

  test('non-dry run evicts oldest files first', async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'glm-gc-'))
    const webDir = path.join(dir, 'cache', 'web')
    mkdirSync(webDir, { recursive: true })
    for (let i = 0; i < 5; i++) writeFileSync(path.join(webDir, `f${i}`), Buffer.alloc(1024 * 1024 * 20))
    const gc = new GarbageCollector(dir, createLogger('test'))
    const r = await gc.run({ webCacheCapBytes: 50 * 1024 * 1024 })
    expect(r.evictedFiles.length).toBeGreaterThan(0)
  })

  test('vision cache LRU evicts oldest entries when over the 50MB cap (P10-Fix-15 — spec §9.12)', async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'glm-gc-vis-'))
    const visionDir = path.join(dir, 'cache', 'vision')
    mkdirSync(visionDir, { recursive: true })
    // 6 entries of 12MB → 72MB > 50MB cap
    for (let i = 0; i < 6; i++) writeFileSync(path.join(visionDir, `s${i}__image_analysis.json`), Buffer.alloc(12 * 1024 * 1024))
    const gc = new GarbageCollector(dir, createLogger('test'))
    const r = await gc.run({ visionCacheCapBytes: 50 * 1024 * 1024 })
    const visionEvictions = r.evictedFiles.filter(e => e.reason === 'vision-lru-evict')
    expect(visionEvictions.length).toBeGreaterThan(0)
  })

  test('session attachments older than cleanupAge are pruned, fresh ones kept (P10-Fix-15)', async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'glm-gc-att-'))
    const attDir = path.join(dir, 'sessions', 'sess-old', 'attachments')
    mkdirSync(attDir, { recursive: true })
    const oldFile  = path.join(attDir, 'img_1.png'); writeFileSync(oldFile, Buffer.alloc(1024))
    const freshFile = path.join(attDir, 'img_2.png'); writeFileSync(freshFile, Buffer.alloc(1024))
    // Backdate img_1.png to 14 days ago, leave img_2.png current
    const fourteenDaysAgo = (Date.now() - 14 * 24 * 3600 * 1000) / 1000
    require('node:fs').utimesSync(oldFile, fourteenDaysAgo, fourteenDaysAgo)
    const gc = new GarbageCollector(dir, createLogger('test'))
    const r = await gc.run({ attachmentsCleanupDays: 7 })
    const attEvictions = r.evictedFiles.filter(e => e.reason === 'attachment-age-evict')
    expect(attEvictions.map(e => e.path)).toContain(oldFile)
    expect(attEvictions.map(e => e.path)).not.toContain(freshFile)
    expect(require('node:fs').existsSync(oldFile)).toBe(false)
    expect(require('node:fs').existsSync(freshFile)).toBe(true)
  })

  test('attachments cleanup skips ACTIVE sessions', async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'glm-gc-att-act-'))
    const attDir = path.join(dir, 'sessions', 'sess-live', 'attachments')
    mkdirSync(attDir, { recursive: true })
    const f = path.join(attDir, 'img_1.png'); writeFileSync(f, Buffer.alloc(1024))
    const ago = (Date.now() - 14 * 24 * 3600 * 1000) / 1000
    require('node:fs').utimesSync(f, ago, ago)
    const gc = new GarbageCollector(dir, createLogger('test'))
    const r = await gc.run({ attachmentsCleanupDays: 7, activeSessionIds: new Set(['sess-live']) })
    expect(r.evictedFiles.find(e => e.path === f)).toBeUndefined()
    expect(require('node:fs').existsSync(f)).toBe(true)
  })
})
```

- [ ] **Step 4: Run — PASS**

```bash
pnpm vitest run packages/core/test/unit/gc.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages
git commit -m "feat(storage): glm gc — vacuum/archive/lru-evict/log-rotate housekeeping"
```

---

## Task 22.3: File-version diff + revert (P10-Fix-5 — spec §11.4 gap)

**Files:**
- Create: `packages/core/src/snapshot/diff.ts`
- Create: `packages/cli/src/commands/diff.ts`
- Test: `packages/core/test/unit/snapshot-diff.test.ts`
- Test: `packages/core/test/integration/diff-revert.test.ts`
- Slash registration via P2's slash registry (`/diff` and `/revert`)

Consumer of P7's `file_versions` + `snapshots` tables (per manifest §0.2 #006). `glm diff` renders a unified diff between any two checkpoint steps for the active session; `/revert <step>` restores the working tree to a step's recorded snapshot SHAs (confirmation prompt required).

- [ ] **Step 1: Snapshot diff engine**

`packages/core/src/snapshot/diff.ts`:
```ts
import type { Database } from 'better-sqlite3'
import { createTwoFilesPatch } from 'diff'
import { readFileSync } from 'node:fs'
import path from 'node:path'

export interface FileChange {
  filePath: string
  fromSha: string | null
  toSha: string | null
  kind: 'added' | 'modified' | 'deleted'
  patch: string
}

export interface DiffOptions {
  sessionId: string
  fromStep?: number      // defaults to step 0 (initial state)
  toStep?: number        // defaults to latest
}

export interface RevertResult {
  step: number
  restoredFiles: string[]
  skipped: Array<{ path: string; reason: string }>
}

export class SnapshotDiff {
  constructor(private db: Database, private snapshotsDir: string) {}

  private snapshotContent(sha: string): string {
    const fp = path.join(this.snapshotsDir, sha.slice(0, 2), sha.slice(2))
    return readFileSync(fp, 'utf8')
  }

  computeDiff(opts: DiffOptions): FileChange[] {
    const from = opts.fromStep ?? 0
    const toRow = this.db.prepare(`
      SELECT step FROM checkpoints WHERE session_id = ? ORDER BY step DESC LIMIT 1
    `).get(opts.sessionId) as { step?: number } | undefined
    const to = opts.toStep ?? toRow?.step ?? 0
    const fromVersions = this.db.prepare(`
      SELECT path, sha FROM file_versions WHERE session_id = ? AND step <= ?
    `).all(opts.sessionId, from) as Array<{ path: string; sha: string }>
    const toVersions = this.db.prepare(`
      SELECT path, sha FROM file_versions WHERE session_id = ? AND step <= ?
    `).all(opts.sessionId, to) as Array<{ path: string; sha: string }>
    const fromMap = new Map(fromVersions.map(v => [v.path, v.sha]))
    const toMap = new Map(toVersions.map(v => [v.path, v.sha]))
    const allPaths = new Set([...fromMap.keys(), ...toMap.keys()])
    const out: FileChange[] = []
    for (const p of allPaths) {
      const a = fromMap.get(p); const b = toMap.get(p)
      if (a === b) continue
      const kind = !a ? 'added' : !b ? 'deleted' : 'modified'
      const before = a ? this.snapshotContent(a) : ''
      const after  = b ? this.snapshotContent(b) : ''
      const patch = createTwoFilesPatch(`a/${p}`, `b/${p}`, before, after, '', '')
      out.push({ filePath: p, fromSha: a ?? null, toSha: b ?? null, kind, patch })
    }
    return out
  }

  revertToStep(sessionId: string, step: number, cwd: string): RevertResult {
    const versions = this.db.prepare(`
      SELECT path, sha FROM file_versions WHERE session_id = ? AND step <= ?
    `).all(sessionId, step) as Array<{ path: string; sha: string }>
    const restored: string[] = []
    const skipped: Array<{ path: string; reason: string }> = []
    const fs = require('node:fs') as typeof import('node:fs')
    for (const v of versions) {
      try {
        const content = this.snapshotContent(v.sha)
        const dest = path.join(cwd, v.path)
        fs.mkdirSync(path.dirname(dest), { recursive: true })
        fs.writeFileSync(dest, content)
        restored.push(v.path)
      } catch (e) {
        skipped.push({ path: v.path, reason: String(e) })
      }
    }
    return { step, restoredFiles: restored, skipped }
  }
}
```

- [ ] **Step 2: CLI**

`packages/cli/src/commands/diff.ts`:
```ts
import { Command } from 'commander'
import { connectDaemon } from '../auto-spawn'

export function registerDiff(parent: Command): void {
  parent.command('diff')
    .description('Show file changes between two session steps')
    .option('--session <id>', 'session id (defaults to current)')
    .option('--from <step>', 'from step (default 0)')
    .option('--to <step>', 'to step (default latest)')
    .action(async (opts: { session?: string; from?: string; to?: string }) => {
      const c = await connectDaemon()
      const changes = await c.call('snapshot.diff', {
        sessionId: opts.session,
        fromStep: opts.from ? Number(opts.from) : undefined,
        toStep: opts.to ? Number(opts.to) : undefined,
      }) as Array<{ filePath: string; kind: string; patch: string }>
      for (const ch of changes) {
        process.stdout.write(`# ${ch.kind} ${ch.filePath}\n${ch.patch}\n`)
      }
    })
}
```

- [ ] **Step 3: Slash registration**

Register `/diff` and `/revert <step>` through P2's slash registry (`packages/tui/src/slash/registry.ts`). `/diff` mirrors the CLI args; `/revert` runs an interactive confirm before calling `snapshot.revert`.

```ts
// packages/tui/src/slash/builtin/diff.ts (registered via P2's commands[] pattern)
import { registerSlashCommand } from '../registry'
registerSlashCommand({
  name: 'diff',
  handler: async (args, ctx) => {
    const changes = await ctx.rpc.call('snapshot.diff', parseDiffArgs(args))
    ctx.print(renderChanges(changes))
  }
})
registerSlashCommand({
  name: 'revert',
  handler: async (args, ctx) => {
    const step = Number(args[0])
    if (!Number.isFinite(step)) return ctx.print('usage: /revert <step>')
    const ok = await ctx.confirm(`Revert to step ${step}? This rewrites working tree.`)
    if (!ok) return
    const r = await ctx.rpc.call('snapshot.revert', { step, cwd: ctx.cwd, sessionId: ctx.sessionId })
    ctx.print(`restored ${r.restoredFiles.length} files`)
  }
})
```

(Note: `/trace` is NOT registered here — see P10-Fix-9. P9 owns `/trace`.)

- [ ] **Step 4: Unit test**

`packages/core/test/unit/snapshot-diff.test.ts`: build a tiny session with three file_versions across two steps, assert `computeDiff` returns the expected modified/added entries.

- [ ] **Step 5: Run — PASS**

```bash
pnpm vitest run packages/core/test/unit/snapshot-diff.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add packages
git commit -m "feat(snapshot): /diff + /revert + glm diff using P7 file_versions/snapshots"
```

---

## Task 22.4: First-run settings migration — seed `settings.actions` (P10-Fix-14 — spec §9.23)

> **P10-Fix-14 (FIX-MANIFEST §11.4):** On first run after upgrading to a version that ships P6's `ActionResolver` (P6-Fix-7), `~/.glm/settings.json` may exist without the `actions` block. This task adds a one-shot migrator that detects the missing/invalid `actions` section at daemon boot and rewrites the file with `DEFAULT_ACTIONS` (per FIX-MANIFEST §11.0.3). Preserves all other settings keys.

**Files:**
- Create: `packages/core/src/settings/migrate-actions.ts`
- Modify: `packages/llm-router/src/daemon-loader.ts` (call migrator before loading settings — surgical addition to the LoaderHub block from P6-Fix-7)
- Test: `packages/core/test/unit/migrate-actions.test.ts`

- [ ] **Step 1: Write failing migrator test**

`packages/core/test/unit/migrate-actions.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { migrateActions } from '../../src/settings/migrate-actions'
import { DEFAULT_ACTIONS } from '@glm/shared'

let home: string
beforeEach(() => {
  home = mkdtempSync(path.join(os.tmpdir(), 'glm-mig-act-'))
  mkdirSync(path.join(home, '.glm'), { recursive: true })
})
afterEach(() => rmSync(home, { recursive: true, force: true }))

const file = () => path.join(home, '.glm', 'settings.json')

describe('migrateActions (P10-Fix-14 — spec §9.23)', () => {
  test('no settings.json → creates it with DEFAULT_ACTIONS', () => {
    const r = migrateActions({ root: path.join(home, '.glm') } as any)
    expect(r.action).toBe('created')
    const out = JSON.parse(readFileSync(file(), 'utf8'))
    expect(out.actions).toEqual(DEFAULT_ACTIONS)
  })

  test('settings.json missing actions block → adds it, preserves other keys', () => {
    writeFileSync(file(), JSON.stringify({ theme: 'dark', notify: { discord: { webhook: 'x' } } }, null, 2))
    const r = migrateActions({ root: path.join(home, '.glm') } as any)
    expect(r.action).toBe('seeded')
    const out = JSON.parse(readFileSync(file(), 'utf8'))
    expect(out.theme).toBe('dark')
    expect(out.notify.discord.webhook).toBe('x')
    expect(out.actions).toEqual(DEFAULT_ACTIONS)
  })

  test('settings.json with VALID actions → no-op', () => {
    const original = { actions: { ...DEFAULT_ACTIONS, slow: { model: 'GLM-5', thinking: 'xhigh' as const } } }
    writeFileSync(file(), JSON.stringify(original, null, 2))
    const r = migrateActions({ root: path.join(home, '.glm') } as any)
    expect(r.action).toBe('noop')
    const out = JSON.parse(readFileSync(file(), 'utf8'))
    expect(out.actions.slow.model).toBe('GLM-5')          // user override preserved
  })

  test('settings.json with schema-INVALID actions → reseeds defaults, backs up the invalid block', () => {
    writeFileSync(file(), JSON.stringify({ actions: { default: { model: 'GLM-5.1' /* no thinking */ } } }))
    const r = migrateActions({ root: path.join(home, '.glm') } as any)
    expect(r.action).toBe('reseeded')
    const out = JSON.parse(readFileSync(file(), 'utf8'))
    expect(out.actions).toEqual(DEFAULT_ACTIONS)
    // backup written
    expect(existsSync(path.join(home, '.glm', 'settings.actions.bak.json'))).toBe(true)
  })

  test('file mode = 0600 after write', () => {
    migrateActions({ root: path.join(home, '.glm') } as any)
    const mode = require('node:fs').statSync(file()).mode & 0o777
    expect(mode).toBe(0o600)
  })
})
```

- [ ] **Step 2: Run — FAIL**

```bash
pnpm vitest run packages/core/test/unit/migrate-actions.test.ts
```

- [ ] **Step 3: Implement migrator**

`packages/core/src/settings/migrate-actions.ts`:
```ts
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync, statSync } from 'node:fs'
import path from 'node:path'
import { ActionsConfigSchema, DEFAULT_ACTIONS } from '@glm/shared'
import type { GlmPaths } from '@glm/shared'

export interface MigrateResult {
  action: 'created' | 'seeded' | 'reseeded' | 'noop'
  file: string
}

/**
 * P10-Fix-14 (FIX-MANIFEST §11.4):
 *   - file missing            → 'created'   (write new settings.json with DEFAULT_ACTIONS)
 *   - actions block missing   → 'seeded'    (preserve other keys, add DEFAULT_ACTIONS)
 *   - actions block invalid   → 'reseeded'  (back up invalid block, replace with defaults)
 *   - actions block valid     → 'noop'      (no write)
 */
export function migrateActions(paths: GlmPaths): MigrateResult {
  const dir  = paths.root
  const file = path.join(dir, 'settings.json')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 })

  if (!existsSync(file)) {
    const next = { actions: DEFAULT_ACTIONS }
    writeFileSync(file, JSON.stringify(next, null, 2), { mode: 0o600 })
    return { action: 'created', file }
  }

  let raw: any
  try { raw = JSON.parse(readFileSync(file, 'utf8')) }
  catch {
    // Unparseable — back up and reseed with defaults so daemon can boot.
    writeFileSync(path.join(dir, 'settings.actions.bak.json'), readFileSync(file))
    const next = { actions: DEFAULT_ACTIONS }
    writeFileSync(file, JSON.stringify(next, null, 2), { mode: 0o600 })
    return { action: 'reseeded', file }
  }

  if (!raw.actions || typeof raw.actions !== 'object') {
    const next = { ...raw, actions: DEFAULT_ACTIONS }
    writeFileSync(file, JSON.stringify(next, null, 2), { mode: 0o600 })
    return { action: 'seeded', file }
  }

  // Validate; if invalid, back up the user's block and replace with defaults.
  const parsed = ActionsConfigSchema.safeParse(raw.actions)
  if (!parsed.success) {
    writeFileSync(
      path.join(dir, 'settings.actions.bak.json'),
      JSON.stringify(raw.actions, null, 2),
      { mode: 0o600 },
    )
    const next = { ...raw, actions: DEFAULT_ACTIONS }
    writeFileSync(file, JSON.stringify(next, null, 2), { mode: 0o600 })
    return { action: 'reseeded', file }
  }

  // Already valid — leave the file alone (NO-OP). Re-tighten perms if they slipped.
  const mode = statSync(file).mode & 0o777
  if (mode !== 0o600) chmodSync(file, 0o600)
  return { action: 'noop', file }
}
```

- [ ] **Step 4: Wire into the llm-router daemon-loader**

Modify `packages/llm-router/src/daemon-loader.ts` — call `migrateActions(daemon.paths)` BEFORE `loadSettings(...)` inside the `LoaderHub.registerSubsystem('llm-router', ...)` block introduced by P6-Fix-7:
```ts
import { migrateActions } from '@glm/core/settings/migrate-actions'

// inside the registerSubsystem callback, before the resolver wiring:
const mig = migrateActions(daemon.paths)
if (mig.action !== 'noop') {
  daemon.log.info({ result: mig }, '[llm-router] first-run actions migration applied (P10-Fix-14)')
}
const settings = loadSettings(daemon.paths)
// ... continue as in P6-Fix-7 Task 17 Step 9 ...
```

- [ ] **Step 5: Run — PASS**

```bash
pnpm vitest run packages/core/test/unit/migrate-actions.test.ts
```

Expected: 5 passed.

- [ ] **Step 6: Manual smoke**

```bash
export GLM_HOME=/tmp/glm-migact-$$
rm -rf $GLM_HOME
mkdir -p $GLM_HOME/.glm
echo '{"theme":"dark"}' > $GLM_HOME/.glm/settings.json    # no actions block
node packages/cli/dist/bin.js daemon start
jq '.actions.default' $GLM_HOME/.glm/settings.json        # should now exist with GLM-5.1 / medium
jq '.theme' $GLM_HOME/.glm/settings.json                  # should still be "dark"
node packages/cli/dist/bin.js daemon stop
```

- [ ] **Step 7: Commit**

```bash
git add packages
git commit -m "feat(settings): first-run migrator seeds DEFAULT_ACTIONS (P10-Fix-14 — spec §9.23)"
```

---

## Task 23: End-to-end 8h mock long-horizon scenario test

**Files:**
- Create: `test/e2e/long-horizon-8h-mock.test.ts`
- Create: `test/e2e/_fixtures/fake-llm.ts`
- Create: `vitest.long-horizon.config.ts`

- [ ] **Step 1: Fake LLM with deterministic responses**

`test/e2e/_fixtures/fake-llm.ts`:
```ts
export interface FakeLlmTurn {
  on: 'user' | 'orchestrator' | 'distillation' | 'compaction'
  step?: number
  reply: string
  toolCalls?: Array<{ name: string; args: any }>
}

export class FakeLlm {
  private cursor = 0
  constructor(private script: FakeLlmTurn[]) {}
  async call(_prompt: string, _opts: { kind?: FakeLlmTurn['on'] } = {}): Promise<string> {
    const t = this.script[this.cursor++] ?? { on: 'user', reply: '(scripted exhausted)' }
    return t.reply
  }
  remaining(): number { return this.script.length - this.cursor }
}

/** Build an 8h-worth script: 480 steps, 8 distillations (one/hour), 4 compactions, journal entries. */
export function build8hScript(): FakeLlmTurn[] {
  const out: FakeLlmTurn[] = []
  for (let step = 1; step <= 480; step++) {
    out.push({ on: 'orchestrator', step, reply: JSON.stringify({ decision: 'INLINE', next_action: { type: 'note', text: `step ${step}` }, reasoning: 'continue' }) })
    if (step % 60 === 0) {
      out.push({ on: 'distillation', reply: JSON.stringify({
        summary: `hour ${step/60}: progressed ${step} steps`,
        newMemories: [{ slug: `hour-${step/60}`, type: 'project', body: 'recap' }]
      }) })
    }
    if (step % 120 === 0) {
      out.push({ on: 'compaction', reply: `# compacted summary\n## Goal\nbuild thing\n## Progress\n### Pending\n- todo A\n### Done\n- todo B\n` })
    }
  }
  return out
}
```

- [ ] **Step 2: Long-horizon vitest config**

`vitest.long-horizon.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    include: ['test/e2e/**/*.test.ts'],
    environment: 'node',
    pool: 'forks',
    testTimeout: 5 * 60 * 1000,            // 5 min cap; we use fake clock so it should finish in seconds
    setupFiles: []
  }
})
```

- [ ] **Step 3: The scenario test**

`test/e2e/long-horizon-8h-mock.test.ts`:
```ts
import { afterEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { openDb, runMigrations } from '../../packages/core/src/storage'
import { CheckpointLoop } from '../../packages/core/src/longhorizon/checkpoint-loop'
import { Journal } from '../../packages/core/src/longhorizon/journal'
import { Distiller } from '../../packages/core/src/longhorizon/distillation'
import { ResumePlanner } from '../../packages/core/src/longhorizon/resume'
import { createLogger } from '../../packages/core/src/log'
import { FakeLlm, build8hScript } from './_fixtures/fake-llm'

let tmp: string
afterEach(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }) })

describe('8h mock long-horizon scenario (accelerated)', () => {
  test('480 steps + 8 distillations + 4 compactions → journal coherent + resume works', async () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-8h-'))
    const db = openDb(path.join(tmp, 's.db'))
    runMigrations(db)
    db.prepare(`INSERT INTO sessions(id,created_at,updated_at,cwd,worktree,active,mode)
                VALUES('S8H',?,?,?,?,1,'long-horizon')`).run(new Date().toISOString(), new Date().toISOString(), tmp, tmp)
    const log = createLogger('e2e')
    const journal = new Journal(tmp, log)
    journal.ensureHeader('S8H', 'mock 8h scenario')
    const loop = new CheckpointLoop(db, log)
    const llm = new FakeLlm(build8hScript())
    let distillRuns = 0
    const distiller = new Distiller(db, journal, {
      llm: async () => llm.call('', { kind: 'distillation' }),
      agentsMdAppender: async () => { distillRuns++ }
    }, log, 0)        // interval 0 so every call fires
    // Drive 480 steps
    let nowMs = Date.parse('2026-05-14T00:00:00Z')
    for (let step = 1; step <= 480; step++) {
      // 1 step = 1 minute simulated
      nowMs += 60 * 1000
      // fake orchestrator turn
      await llm.call('', { kind: 'orchestrator' })
      loop.commit('S8H', {
        step, phase: step % 5 === 0 ? 'verify' : 'execute',
        orchestratorState: {}, activeWorkers: [],
        contextState: { messagesHeadId: `m${step}`, compactSummaryId: null, memoryLoaded: [], tokensUsed: 1000 * step },
        rateLimits: { 'GLM-5.1': 10 },
        filesDirty: []
      })
      journal.recordPhase('S8H', { step, phase: 'execute', tokensUsed: 1000 * step, filesDirty: [] })
      if (step % 60 === 0) {
        await distiller.runIfDue('S8H', nowMs)
        journal.recordHourly('S8H', { stepsDone: step, tokensSpent: 1000 * step, quotaLeft: '60%' })
      }
    }
    // Assertions
    const latest = loop.latest('S8H')
    expect(latest!.payload.step).toBe(480)
    expect(distillRuns).toBe(8)
    const j = readFileSync(path.join(tmp, 'S8H', 'journal.md'), 'utf8')
    expect(j).toMatch(/step 480 · execute/)
    expect(j).toMatch(/hour 8: progressed 480 steps/)    // distillation row
    // Resume planner sees the session
    const planner = new ResumePlanner(db, loop, log)
    const cands = planner.candidates()
    expect(cands).toHaveLength(1)
    expect(cands[0]!.lastStep).toBe(480)
  })
})
```

- [ ] **Step 4: Run e2e — PASS**

```bash
pnpm vitest run -c vitest.long-horizon.config.ts
```

Expected: < 30s real time, all assertions green.

- [ ] **Step 5: Commit**

```bash
git add test vitest.long-horizon.config.ts
git commit -m "test(e2e): 8h mock long-horizon scenario — 480 steps, 8 distillations, journal coherence, resume"
```

---

## Task 24: README + QUICKSTART + CHANGELOG + LICENSE + version bump + npm publish dry run

**Files:**
- Rewrite: `README.md`
- Create: `QUICKSTART.md`
- Create: `CHANGELOG.md`
- Create: `LICENSE`
- Modify: `package.json` (root + workspace) → `0.1.0-beta.1`
- Create: `scripts/publish-dry-run.sh`

- [ ] **Step 1: Rewrite README**

`README.md`:
````markdown
# glm code

> GLM Coding Plan-native CLI agent with daemon, 8h long-horizon mode, 100% Claude-Code asset compatibility, and a hard-whitelisted yolo.

```bash
npm i -g @glm/code
glm doctor      # health check
glm "build me a todo list app"
glm auto "ship feature X end-to-end"   # long-horizon mode
```

## Features (v0.1)

- **Daemon-first**: stays warm across runs, persists sessions, checkpoint every step
- **GLM Coding Plan native**: Anthropic + OpenAI modes, idempotency cache, 3-pool quota tracker
- **Long-horizon (8h)**: auto-promotion, journal.md, hourly distillation, graceful resume after crash
- **Yolo 3-tier**: TIER A always-auto / TIER B workspace-auto / TIER C hard-whitelist; audit log + auto-snapshot + `glm yolo revert`
- **14 built-in workflows**: `/autopilot`, `/ralph`, `/ultrawork`, `/team`, `/plan`, `/trace`, `/verify`, …
- **20 built-in agent roles** with explicit responsibility boundaries
- **MCP host (L3)**: stdio/sse/http, OAuth, hot reload
- **Skills, Plugins, Hooks, Slash commands**: 100% read-compat with `~/.claude/`
- **Built-in LSP**: 11+ languages (typescript/python/rust/go/…)
- **Hashline edit**: 94.9% success rate (oh-my-pi pattern)
- **Resilience hooks**: preemptive compaction, todo preserver, session recovery, continuation enforcer, trace timeline, verification tier-selector
- **Workspace tools**: `glm commit` (agentic conventional with hunk-split + changelog), `glm recipe` (auto-detect npm/cargo/just/make/task)
- **Notifications (notify-only v0.1)**: macOS, Discord, Slack, Telegram, email, generic webhook
- **Bidirectional reply (v0.2)**: Discord/Telegram bot ← inbound

## Install

```bash
# Stable
npm i -g @glm/code

# Or dev from source
git clone https://github.com/glm-code/glm-code
cd glm-code
pnpm install && pnpm build
node packages/cli/dist/bin.js doctor
```

## Quick start

See [QUICKSTART.md](./QUICKSTART.md).

## Compatibility

- Claude Code: 100% read-compat for `~/.claude/`, `~/.claude.json`, `.claude/`, `.mcp.json`
- OMC / OmO / OMX plugins: read-compat via the same loader; built-in workflows take precedence on name collision

## License

MIT — see [LICENSE](./LICENSE).

## Acknowledgements

opencode, qwen-code, oh-my-pi, cclsp, oh-my-claudecode, oh-my-codex, oh-my-openagent, Claude Code (format compatibility).
````

- [ ] **Step 2: Write QUICKSTART**

`QUICKSTART.md`:
````markdown
# glm code — 5-min Quickstart

## 1. Install + auth

```bash
npm i -g @glm/code
export GLM_API_KEY=...   # from https://z.ai/subscribe
glm doctor               # should be all green
```

## 2. First chat

```bash
glm "rename UserModel to AccountModel everywhere and update tests"
```

The daemon auto-spawns. You can `Ctrl-D` anytime — work continues in background.

## 3. Re-attach

```bash
glm                       # attaches to most recent session
glm sessions              # list
glm attach <id>           # specific
```

## 4. Long-horizon

```bash
glm auto "implement OAuth login with tests and docs"
```

- Plans, fans out sub-agents, checkpoints every step, journals progress.
- Reattach with `glm` whenever. If daemon crashes, next `glm auto` prompts to resume.

## 5. Yolo mode (use carefully)

```bash
glm yolo doctor                                  # check sandbox suitability
glm auto "..." --yolo                            # session-wide yolo
glm yolo list                                    # snapshots
glm yolo revert 42                               # restore step 42 state
```

TIER C operations (push to main, rm -rf, drop database, …) always confirm.

## 6. Workspace tools

```bash
glm commit            # agentic conventional commit with hunk-split + changelog
glm recipe            # list detected runners (npm/cargo/just/make/task)
glm recipe test
glm trace timeline <session>   # debug per-event history
```

## 7. Notifications

```bash
glm notify config telegram botToken <token>
glm notify config telegram chatId <chat-id>
glm notify test telegram
```

## 8. Safe mode (for diagnosis)

```bash
glm --safe "ping"        # ephemeral, no plugins / hooks / external MCP
```

## 9. Bug report

```bash
glm bug report           # interactive redacted bundle
```

## 10. Telemetry (off by default)

```bash
glm config telemetry status
glm config telemetry enable    # opt in (anonymous counts only)
```
````

- [ ] **Step 3: Write CHANGELOG**

`CHANGELOG.md`:
```markdown
# Changelog

All notable changes documented here. Follows [Keep a Changelog](https://keepachangelog.com).

## [0.1.0-beta.1] — 2026-05-14

First public beta.

### Added
- Daemon-first runtime with SQLite WAL persistence and JSON-RPC IPC
- 14 built-in workflows (autopilot / ralph / ultrawork / team / plan / trace / verify / critic / ultraqa / self-improve / debug / skillify / remember / visual-verdict / ai-slop-cleaner / external-context)
- 20 built-in agent roles with explicit responsibility boundaries
- MCP host (stdio/sse/http) + bundled GLM MCPs (vision / search / reader / zread)
- Skill / Plugin / Hook / Slash-command loaders with 100% Claude Code read-compat
- Built-in LSP host (11+ languages, opencode pattern)
- Hashline edit tool (oh-my-pi pattern, 94.9% success benchmark)
- AGENTS.md cascade + ## Memories section + compaction template
- Memory trio (notepad / project-memory / shared-memory)
- 31-event hook & event system (11 base + 20 extended) with plugin SDK
- Internal URL schemes (`local://`, `memory://`, `mcp://`, `issue://`, `pr://`, `skill://`, `rule://`, `agent://`, `artifact://`, `conflict://`)
- Natural language keyword detection (autopilot / ralph / ultrawork / team / plan / …)
- Long-horizon mode (auto-promotion / per-step checkpoint / hourly distillation / journal.md / graceful resume)
- Yolo mode (3-tier policy / hard whitelist / audit log / auto-snapshot / revert / `glm yolo doctor`)
- Notifications (macOS / Discord / Slack / Telegram / email / generic webhook — notify-only)
- Resilience hooks (preemptive compaction / todo preserver / session recovery / continuation enforcer / trace timeline / verification tier-selector)
- `glm commit` (agentic conventional commit with hunk-split + changelog + pre-commit retry)
- `glm recipe` (auto-detect npm/pnpm/cargo/just/make/task/mise)
- Universal config discovery (CC full + cursor/windsurf/codex/cline/copilot/codeium/gemini/vscode stub detection)
- Full `glm doctor` (runtime/install/api/bundled-mcp/external-mcp/lsp/compat/sessions/warnings) with `--fix`
- Safe mode (`glm --safe`) for plugin/hook/MCP isolation
- Crash report tooling (`~/.glm/crash-reports/<ts>.tar.zst`, `glm bug report` interactive)
- Opt-in telemetry (anonymous; counts/errors/version only — never content)
- Worker process recycling at 1h / 1000-step boundary

### Documentation
- README + QUICKSTART + design specification
```

- [ ] **Step 4: Write LICENSE**

`LICENSE` (MIT, standard text):
```
MIT License

Copyright (c) 2026 glm code contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 5: Bump version everywhere**

Update root `package.json` and each workspace `package.json`:

```bash
node -e "
const fs = require('fs'); const v = '0.1.0-beta.1';
for (const p of ['package.json','packages/shared/package.json','packages/core/package.json','packages/cli/package.json']) {
  const j = JSON.parse(fs.readFileSync(p,'utf8'));
  j.version = v;
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
}
"
```

Also add npm publish metadata to `packages/cli/package.json`:
```jsonc
{
  "name": "@glm/code",                      // rename from @glm/cli for the published name
  "version": "0.1.0-beta.1",
  "description": "GLM Coding Plan-native CLI agent with daemon, long-horizon mode, and full Claude Code asset compatibility",
  "keywords": ["glm","coding","agent","cli","ai","llm","claude-code-compat"],
  "license": "MIT",
  "repository": { "type": "git", "url": "git+https://github.com/glm-code/glm-code.git" },
  "homepage": "https://github.com/glm-code/glm-code",
  "publishConfig": { "access": "public" },
  "files": ["dist/**/*", "README.md", "LICENSE"]
}
```

- [ ] **Step 6: publish-dry-run gate**

`scripts/publish-dry-run.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm build
pnpm vitest run                                         # all unit + integration green
pnpm vitest run -c vitest.long-horizon.config.ts        # 8h mock scenario green
cd packages/cli
npm publish --dry-run --access public
echo "==> dry-run OK"
```

```bash
chmod +x scripts/publish-dry-run.sh
./scripts/publish-dry-run.sh
```

Expected: prints package contents + size + "OK".

- [ ] **Step 7: Weekly real-LLM regression schedule (P10-Fix-13 — spec §13.4)**

Add a weekly CI workflow that runs the hashline benchmark (P3-Fix-7) plus the ~100-fixture LLM regression suite against the real GLM API, with a hard $5/wk budget cap per spec §13.4.

`.github/workflows/weekly-llm-regression.yml`:
```yaml
name: weekly-llm-regression
on:
  schedule:
    - cron: '0 9 * * 1'   # every Monday 09:00 UTC
  workflow_dispatch:
jobs:
  regression:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    env:
      GLM_API_KEY: ${{ secrets.GLM_API_KEY }}
      GLM_WEEKLY_BUDGET_USD: '5'
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      # Hashline benchmark — 90% gate on GLM-5.1 (P3-Fix-7 acceptance)
      - run: node packages/cli/dist/bin.js bench hashline --model GLM-5.1 --runs 24 --real
      # ~100 LLM regression fixtures (real API mode)
      - run: pnpm vitest run -c vitest.real-llm.config.ts
      # Persist results
      - uses: actions/upload-artifact@v4
        with: { name: weekly-llm-regression, path: .glm/bench/ }
```

Budget note: the spec §13.4 GA gate allows ~$5/wk of real-LLM spend for regression. Workflow aborts via the in-suite `GLM_WEEKLY_BUDGET_USD` check (implemented in `vitest.real-llm.config.ts`'s `globalSetup`).

- [ ] **Step 8: Final commit**

```bash
git add README.md QUICKSTART.md CHANGELOG.md LICENSE package.json packages/*/package.json scripts/publish-dry-run.sh .github/workflows/weekly-llm-regression.yml
git commit -m "chore(release): 0.1.0-beta.1 + weekly real-LLM regression CI (hashline + ~100 fixtures, \$5/wk budget)"
```

---

## P10 Completion — Verification Checklist

Before declaring P10 done, run all of these and confirm output.

- [ ] **Build clean**: `pnpm build` → no errors.
- [ ] **All tests pass**: `pnpm vitest run` → all green (P1-P10).
- [ ] **8h mock scenario**: `pnpm vitest run -c vitest.long-horizon.config.ts` → green.
- [ ] **Doctor green on dev machine**: `node packages/cli/dist/bin.js doctor` → HEALTHY (or DEGRADED only on optional checks).
- [ ] **Long-horizon round trip**:
  ```bash
  export GLM_HOME=/tmp/glm-lh-$$
  node packages/cli/dist/bin.js auto "do 5 mock steps then stop"
  # detach with Ctrl-D
  kill -9 $(pgrep -f daemon-entry)
  node packages/cli/dist/bin.js auto "continue"   # should prompt to resume
  ```
- [ ] **Yolo manual**:
  ```bash
  node packages/cli/dist/bin.js yolo doctor       # at least warns
  node packages/cli/dist/bin.js yolo list
  ```
- [ ] **Commit tool**: in a dirty repo, `node packages/cli/dist/bin.js commit --no-split` produces a conventional commit + CHANGELOG entry.
- [ ] **Recipe tool**: `node packages/cli/dist/bin.js recipe` lists detected recipes in this repo.
- [ ] **Notify test**: `node packages/cli/dist/bin.js notify test macos` shows a macOS notification.
- [ ] **Trace**: after a session, `node packages/cli/dist/bin.js trace timeline <id>` prints chronological events.
- [ ] **Safe mode**: `node packages/cli/dist/bin.js --safe "ping"` starts ephemeral session with plugins/hooks/external-MCP disabled.
- [ ] **Bug report**: `node packages/cli/dist/bin.js bug report` produces a `.tar.zst` / `.tar.gz` with redacted contents.
- [ ] **Publish dry-run**: `./scripts/publish-dry-run.sh` → "OK".
- [ ] **No leaked processes**: `pgrep -f daemon-entry` empty after each test cleanup.

If anything above fails, fix before declaring P10 done.

---

## What P10 does NOT include (deferred to v0.2)

These are intentionally out of scope for P10 / v0.1:

- **Bidirectional notification reply (OpenClaw)** — Telegram/Discord bot polling + inbound message inject. Stubbed in `notifications/reply-daemon.stub.ts`.
- **Hindsight `<memories>` auto-inject** — data format laid down, runtime injector is v0.2.
- **Wiki (LLM KB)** — `.glm/wiki/` writer is v0.2.
- **Eval tool (Python+JS REPL)** — Python sidecar (gyoshu_bridge style) is v0.2.
- **Hyperplan adversarial planning** — depends on team mode + 5 hostile reviewers, v0.2.
- **TTSR (Time-Traveling Streamed Rules)** — needs stream-token state machine, v0.2.
- **ACP + RPC modes** — for VS Code extension integration, v0.2.
- **Local LLM fallback (Ollama/vLLM)** — **non-goal**. glm code is GLM Coding Plan 전용; no local-LLM path planned.
- **Universal config import wizard for non-CC tools** — v0.1 scans + prompts, full importers for Cursor/Windsurf/Codex/Cline/Copilot/Codeium/Gemini/VS Code arrive v0.2.
- **Native Rust acceleration** — v0.3+.

P10 is the **final integration** that makes v0.1 shippable. After P10:
1. Maintainer uses glm as their daily driver for ≥ 1 week before tagging `0.1.0` GA.
2. If dogfooding surfaces blockers, P10.x patches address them.
3. `0.1.0` ships when the GA gate from §13.8 of the spec is satisfied (250+ unit / 80+ integration / 10+ e2e / 7-day nightly clean / hashline ≥ 90% / daemon crash < 0.01/h / docs complete).

---

*End of P10 implementation plan.*
