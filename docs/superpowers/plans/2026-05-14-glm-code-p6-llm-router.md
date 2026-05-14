# glm code — P6: LLM Router (Provider abstraction + GLM Anthropic/OpenAI endpoints + Quota + Idempotency + Retry + Streaming)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace P1's `messageSendStub` echo handler with a real LLM Router that calls GLM (z.ai) via either the Anthropic-compatible endpoint or the OpenAI-compatible endpoint, tracks quota usage across three pools (Coding / Web / Vision), caches calls by content hash for idempotent retry/resume, retries transient failures with exponential backoff, parses SSE streams into a unified internal event vocabulary, supports multi-account profiles, and surfaces real CLI surface (`glm models`, `glm quota`, `glm cache stats/clear`, `glm profile list/use`).

**Architecture:** A new `@glm/llm-router` workspace package sitting between `@glm/core` (daemon, storage, log, RPC) and the upcoming session-worker (P8). The router owns one `LLMProvider` interface plus two concrete implementations (`GLMAnthropicProvider`, `GLMOpenAIProvider`), a message-IR (intermediate representation) used internally and converted at the wire boundary, a `CredentialResolver` (env → credentials.json → optional Keychain), an `EndpointRouter` mapping model → endpoint, a `QuotaTracker` persisting to `~/.glm/quota.db` (driven by a separate `quota-migrations/` directory + new `runMigrationsForDb(db, subdir)` helper added to P1's migration runner — P6-Fix-2), an `IdempotencyCache` persisting to `session.db.llm_cache` (extends P1's `001_initial.sql` via the new session.db migration `003_llm_router.sql` — P6-Fix-1), a `RetryPolicy` classifier, a `StreamParser` that converts both Anthropic SSE and OpenAI SSE into a single internal event stream, and a `LLMService` orchestrator that ties them together. Daemon exposes `llm.call` (returns a `streamId`) plus a one-shot subscription channel `llm.events` (server-pushed notifications keyed by `streamId`). The router also exports `LLMService.complete(messages, opts)` (P6-Fix-3) — a streaming-consumer convenience used by P7's Compactor, P8's Orchestrator, and P10's distillation. P1's `message.send` is rewired from echo to a real call against the default model.

**Tech Stack (additions over P1):** `undici` (HTTP/2 streaming client — faster than `node:fetch` and supports server-sent events natively via `dispatch`), `eventsource-parser` (battle-tested SSE chunk parser), reuse `zod` for request validation, reuse `better-sqlite3` for cache/quota tables. No new runtime deps beyond those two.

**Acceptance criteria for P6:**
- `glm "hello"` calls real GLM-5-Turbo (or GLM-5.1) via Anthropic mode and prints streamed text (no more echo)
- `glm --profile personal "hi"` swaps credentials transparently
- `glm models` lists Coding Plan models with endpoint + concurrency
- `glm quota` shows live pool consumption with refresh-time
- `glm cache stats` shows hit ratio; `glm cache clear` truncates
- `glm profile list / use <name>` manages multi-account profiles
- Idempotency cache: identical request within session = 0 tokens spent (verified in integration)
- Retry: simulated 503 retried 3× with exponential backoff; simulated 401 surfaces immediately (no retry)
- Streaming: cancel mid-stream commits the partial response to `messages` table
- All P1 tests still pass; new integration test uses a local mock z.ai server (no real network)
- 80%+ unit coverage on new modules; integration test covers Anthropic+OpenAI round-trips

---

## File Structure

```
glm-code/                                  # (existing P1 repo root)
├── packages/
│   ├── shared/                            # (P1, unchanged except 1 new type export)
│   │   └── src/types.ts                   # MODIFY: add LLM types
│   ├── core/                              # (P1, with one storage migration added)
│   │   └── src/storage/migrations/
│   │       └── 003_llm_router.sql         # CREATE — session.db only (llm_cache)
│   │   ├── quota-migrations/              # NEW dir — separate sequence for quota.db (P6-Fix-2)
│   │   │   └── 001_quota.sql              # CREATE — quota_pools + quota_usage
│   ├── llm-router/                        # NEW PACKAGE
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── ir/
│   │       │   ├── types.ts               # IR Message, Block, Tool, Usage, Event
│   │       │   ├── from-anthropic.ts      # wire (Anthropic) → IR
│   │       │   ├── to-anthropic.ts        # IR → wire (Anthropic)
│   │       │   ├── from-openai.ts         # wire (OpenAI)    → IR
│   │       │   ├── to-openai.ts           # IR → wire (OpenAI)
│   │       │   └── hash.ts                # canonical hash for idempotency
│   │       ├── provider/
│   │       │   ├── provider.ts            # LLMProvider interface
│   │       │   ├── glm-anthropic.ts       # POST /api/anthropic/v1/messages
│   │       │   ├── glm-openai.ts          # POST /api/coding/v1/chat/completions
│   │       │   ├── endpoint-map.ts        # model → endpoint preference
│   │       │   └── token-count.ts         # countTokens heuristic + remote
│   │       ├── stream/
│   │       │   ├── sse.ts                 # SSE chunk reader (eventsource-parser wrap)
│   │       │   ├── anthropic-parser.ts    # Anthropic event names → IR events
│   │       │   ├── openai-parser.ts       # OpenAI delta chunks → IR events
│   │       │   └── coalesce.ts            # tool_use_input_delta concat helper
│   │       ├── credentials/
│   │       │   ├── resolver.ts            # env > credentials.json > keychain
│   │       │   ├── credentials-file.ts    # ~/.glm/credentials.json read/write (0600)
│   │       │   ├── profile.ts             # multi-profile selector
│   │       │   └── keychain.ts            # macOS keychain (best-effort)
│   │       ├── quota/
│   │       │   ├── quota-tracker.ts       # 3-pool tracker
│   │       │   ├── quota-repo.ts          # SQLite CRUD over quota.db
│   │       │   ├── rate-headers.ts        # parse X-RateLimit-* + Retry-After
│   │       │   └── pools.ts               # Lite/Pro/Max → pool limit constants
│   │       ├── cache/
│   │       │   ├── idempotency-cache.ts   # llm_cache table CRUD
│   │       │   └── key.ts                 # sha256(role+model+sys+msgs+tools)
│   │       ├── retry/
│   │       │   ├── policy.ts              # error → action classifier
│   │       │   └── backoff.ts             # exp backoff w/ jitter
│   │       ├── service/
│   │       │   ├── llm-service.ts         # orchestrates: cache → quota → call → retry → stream
│   │       │   ├── call-context.ts        # per-call mutable state (partial buf, cancel)
│   │       │   └── cancellation.ts        # AbortController wrapper
│   │       ├── resolver/                  # NEW (P6-Fix-7 / spec §9.23 Action × Model × Thinking)
│   │       │   ├── action-resolver.ts     # 5-tier resolution: arg > agents.<role> > actions.<a> > frontmatter > default
│   │       │   ├── thinking-budgets.ts    # ThinkingLevel → token budget + applyThinking(req, lvl, endpoint)
│   │       │   └── index.ts
│   │       └── rpc/
│   │           ├── methods.ts             # llm.call / llm.events / llm.cancel handlers
│   │           ├── model-methods.ts       # NEW (P6-Fix-7): model.list / model.set / model.show / model.reset
│   │           └── events.ts              # server-push event framing
│   └── cli/                               # (P1, with 5 new subcommands)
│       └── src/commands/
│           ├── models.ts                  # CREATE: `glm models`
│           ├── quota.ts                   # CREATE: `glm quota`
│           ├── cache.ts                   # CREATE: `glm cache stats/clear`
│           ├── profile.ts                 # CREATE: `glm profile list/use`
│           └── model.ts                   # CREATE (P6-Fix-7): `glm model set/show/reset/list`
└── test/                                  # (P1)
    └── fixtures/
        └── mock-zai-server/               # NEW
            ├── index.ts                   # tiny http server emulating z.ai
            ├── anthropic-stream.ts        # canned Anthropic SSE
            └── openai-stream.ts           # canned OpenAI SSE
```

P1 is touched in two surgical places: (a) one new session.db migration `003_llm_router.sql` and a new sibling directory `quota-migrations/001_quota.sql` for quota.db (per P6-Fix-1/P6-Fix-2), and (b) a small `runMigrationsForDb(db, subdir)` helper added to `packages/core/src/storage/migrations.ts` (P6-Fix-2 — surgical). `packages/core/src/rpc/methods/chat.ts` is modified to call the router instead of echoing. The daemon source file `packages/core/src/daemon/daemon.ts` is NOT modified; P6 wires itself via `LoaderHub.registerSubsystem('llm-router', …)` per P6-Fix-6.

---

## Task 1: Workspace package skeleton + types + dependencies

**Files:**
- Create: `packages/llm-router/package.json`
- Create: `packages/llm-router/tsconfig.json`
- Create: `packages/llm-router/src/index.ts`
- Create: `packages/shared/src/llm-router-types.ts` (P6-Fix-5 — all P6-specific shared types live here)
- Modify: `packages/shared/src/index.ts` (P6-Fix-5 — append ONE re-export line)
- Modify: `pnpm-workspace.yaml` (no change needed — already globs `packages/*`)
- Modify: workspace root `package.json` (only if scripts need it — likely no change)

> **P6-Fix-5:** `packages/shared/src/types.ts` is P1-owned and stays small. Per canonical decision §0.10, each P-plan that needs new shared types creates its own file. P6's types ship in `packages/shared/src/llm-router-types.ts`; the only change to P1 territory is a single re-export line appended to `packages/shared/src/index.ts`.

- [ ] **Step 1: Add llm-router package.json**

`packages/llm-router/package.json`:
```json
{
  "name": "@glm/llm-router",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": { "build": "tsc -b" },
  "dependencies": {
    "@glm/shared": "workspace:*",
    "@glm/core": "workspace:*",
    "better-sqlite3": "^11.5.0",
    "undici": "^6.20.0",
    "eventsource-parser": "^3.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": { "@types/better-sqlite3": "^7.6.0" }
}
```

- [ ] **Step 2: Add llm-router tsconfig.json**

`packages/llm-router/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src/**/*"],
  "references": [{ "path": "../shared" }, { "path": "../core" }]
}
```

- [ ] **Step 3: Create the P6-owned shared-types file (P6-Fix-5)**

> **P6-Fix-5:** new file ONLY — do NOT modify `packages/shared/src/types.ts`.

Create `packages/shared/src/llm-router-types.ts`:
```ts
// ---- LLM Router cross-package types (P6) ----
// Owner: P6. Co-located in @glm/shared so @glm/core and @glm/llm-router can
// both depend on the type without inducing a package cycle.
export type LLMModel =
  | 'GLM-5.1' | 'GLM-5-Turbo' | 'GLM-5'
  | 'GLM-4.7' | 'GLM-4.6'
  | 'GLM-4.5-Air' | 'GLM-4.5-AirX' | 'GLM-4.5'
export type LLMEndpoint = 'anthropic' | 'openai'
export type QuotaPool = 'coding' | 'web' | 'vision'

export interface LLMUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheCreationTokens?: number
}

export interface StreamRef {
  streamId: string
  sessionId: string
  model: LLMModel
  endpoint: LLMEndpoint
  cached: boolean      // true if served from idempotency cache
}

/** Convenience message shape consumed by `LLMService.complete()` adapters. */
export interface ShortMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
}

/** Options for the convenience `LLMService.complete()` method (P6-Fix-3). */
export interface CompleteOpts {
  model: LLMModel
  maxOutputTokens?: number
  temperature?: number
  topP?: number
  stopSequences?: string[]
  metadata?: { sessionId?: string; workerId?: string; phase?: string }
}
```

Append the single re-export line to `packages/shared/src/index.ts`:
```ts
export * from './llm-router-types'
```

This is the only modification to P1 territory in P6.

- [ ] **Step 4: Empty barrel and install**

`packages/llm-router/src/index.ts`:
```ts
export {}
```

```bash
pnpm install
mkdir -p packages/llm-router/src
echo "export {}" > packages/llm-router/src/index.ts
pnpm build
```

Expected: build OK; new `dist/` produced under `packages/llm-router`.

- [ ] **Step 5: Commit**

```bash
git add packages/llm-router packages/shared/src/llm-router-types.ts packages/shared/src/index.ts pnpm-lock.yaml
git commit -m "chore(llm-router): scaffold workspace package + shared LLM types (P6-Fix-5)"
```

---

## Task 2: Migration 003 — llm_cache (session.db) + quota migrations split out

> **P6-Fix-1 + P6-Fix-2:** session.db migration is renumbered `002_llm_router.sql` → **`003_llm_router.sql`** (per canonical numbering §0.2 — P3 owns `002_tools.sql`). The session.db migration ONLY contains `llm_cache`. The `quota_pools` + `quota_usage` tables move to a separate quota.db migration set (`packages/core/src/storage/quota-migrations/001_quota.sql`), invoked through a new generic helper `runMigrationsForDb(db, subdir)`.

**Files:**
- Create: `packages/core/src/storage/migrations/003_llm_router.sql` (session.db — `llm_cache` only)
- Create: `packages/core/src/storage/quota-migrations/001_quota.sql` (quota.db — `quota_pools` + `quota_usage`)
- Modify: `packages/core/src/storage/migrations.ts` (P1-owned — add `runMigrationsForDb(db, subdir)` helper)
- Test: `packages/core/test/unit/migrations.test.ts` (modify — add `applies 003` case + quota migration case)

- [ ] **Step 1: Write the session.db migration (llm_cache only)**

`packages/core/src/storage/migrations/003_llm_router.sql`:
```sql
-- LLM idempotency cache — lives in session.db ONLY.
-- Quota tables live in a separate quota.db; see ../quota-migrations/001_quota.sql.
CREATE TABLE IF NOT EXISTS llm_cache (
  key            TEXT PRIMARY KEY,
  model          TEXT NOT NULL,
  endpoint       TEXT NOT NULL,
  request_json   BLOB NOT NULL,
  response_json  BLOB NOT NULL,
  usage_input    INTEGER NOT NULL DEFAULT 0,
  usage_output   INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL,
  last_hit_at    TEXT NOT NULL,
  hit_count      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_llm_cache_created ON llm_cache(created_at);
CREATE INDEX IF NOT EXISTS idx_llm_cache_model ON llm_cache(model);
```

- [ ] **Step 2: Write the quota.db migration (separate file/sequence)**

`packages/core/src/storage/quota-migrations/001_quota.sql`:
```sql
-- quota.db migration 001 — lives in a separate sequence from session.db migrations.
-- Driven by runMigrationsForDb(quotaDb, 'quota-migrations'). Schema version is
-- tracked in this db's own `meta` table (same convention as session.db).
CREATE TABLE IF NOT EXISTS quota_usage (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  ts           TEXT NOT NULL,
  pool         TEXT NOT NULL,       -- 'coding'|'web'|'vision'
  model        TEXT,
  tool         TEXT,
  requests     INTEGER NOT NULL DEFAULT 0,
  input_tok    INTEGER NOT NULL DEFAULT 0,
  output_tok   INTEGER NOT NULL DEFAULT 0,
  vision_sec   REAL    NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_quota_usage_pool_ts ON quota_usage(pool, ts);

CREATE TABLE IF NOT EXISTS quota_pools (
  pool         TEXT PRIMARY KEY,
  tier         TEXT NOT NULL,       -- 'lite'|'pro'|'max'
  daily_limit  INTEGER,
  monthly_limit INTEGER,
  daily_used   INTEGER NOT NULL DEFAULT 0,
  monthly_used INTEGER NOT NULL DEFAULT 0,
  refresh_at   TEXT,
  updated_at   TEXT NOT NULL
);
```

- [ ] **Step 3: Add `runMigrationsForDb(db, subdir)` helper to P1's migrations.ts**

> **P6-Fix-2:** P1 owns `migrations.ts`; this is a surgical addition (Modify) — keep the existing `runMigrations(db)` API as-is (callers don't change), and add a parametric sibling.

Modify `packages/core/src/storage/migrations.ts`:
```ts
import { readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Database } from 'better-sqlite3'

const HERE = dirname(fileURLToPath(import.meta.url))

/** Existing API — defaults to the canonical `migrations/` dir (session.db). */
export function runMigrations(db: Database): number {
  return runMigrationsForDb(db, 'migrations')
}

/**
 * P6-Fix-2: generic helper. Each migration directory is its own sequence —
 * the version counter lives in *this* db's `meta` table, independent of any
 * other db's sequence.
 *
 * `subdir` is resolved relative to this file (e.g. 'migrations' or 'quota-migrations').
 */
export function runMigrationsForDb(db: Database, subdir: string): number {
  const dir = join(HERE, subdir)
  ensureMetaTable(db)
  const cur = currentSchemaVersion(db)
  const files = readdirSync(dir).filter(f => f.endsWith('.sql')).sort()
  for (const f of files) {
    const v = Number(f.split('_')[0])
    if (!Number.isFinite(v) || v <= cur) continue
    const sql = readFileSync(join(dir, f), 'utf8')
    db.exec(sql)
    db.prepare(`INSERT OR REPLACE INTO meta(key, value) VALUES ('schema_version', ?)`).run(String(v))
  }
  return currentSchemaVersion(db)
}
```

(`ensureMetaTable` and `currentSchemaVersion` are P1's existing helpers — re-used as-is.)

- [ ] **Step 4: Extend migrations test (both sequences)**

Append to `packages/core/test/unit/migrations.test.ts`:
```ts
import { describe as describeMig, expect as expectMig, test as testMig } from 'vitest'
import { runMigrationsForDb } from '../../src/storage/migrations'

describeMig('runMigrations 003 (session.db)', () => {
  testMig('applies llm_cache and bumps to 3', () => {
    tmpdir = mkdtempSync(path.join(os.tmpdir(), 'glm-mig3-'))
    const db = openDb(path.join(tmpdir, 'session.db'))
    const v = runMigrations(db)
    expectMig(v).toBe(3)
    const tables = (db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
    ).all() as { name: string }[]).map(r => r.name)
    expectMig(tables).toEqual(expect.arrayContaining(['llm_cache']))
    // Quota tables live in quota.db, NOT session.db (P6-Fix-2)
    expectMig(tables).not.toContain('quota_pools')
    expectMig(tables).not.toContain('quota_usage')
    db.close()
  })
})

describeMig('runMigrationsForDb quota-migrations (quota.db)', () => {
  testMig('applies quota_pools + quota_usage in a separate sequence', () => {
    tmpdir = mkdtempSync(path.join(os.tmpdir(), 'glm-quota-mig-'))
    const db = openDb(path.join(tmpdir, 'quota.db'))
    const v = runMigrationsForDb(db, 'quota-migrations')
    expectMig(v).toBe(1)
    const tables = (db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
    ).all() as { name: string }[]).map(r => r.name)
    expectMig(tables).toEqual(expect.arrayContaining(['quota_pools','quota_usage']))
    // session-only tables don't leak into quota.db
    expectMig(tables).not.toContain('llm_cache')
    db.close()
  })
})
```

- [ ] **Step 5: Run — PASS**

```bash
pnpm vitest run packages/core/test/unit/migrations.test.ts
```

Expected: PASS for both new describe blocks.

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat(core): migration 003 (session.db llm_cache) + quota-migrations/001 (quota.db) — P6-Fix-1/2"
```

---

## Task 3: Message IR + Anthropic converters

**Files:**
- Create: `packages/llm-router/src/ir/types.ts`
- Create: `packages/llm-router/src/ir/from-anthropic.ts`
- Create: `packages/llm-router/src/ir/to-anthropic.ts`
- Create: `packages/llm-router/src/ir/hash.ts`
- Test: `packages/llm-router/test/unit/ir-anthropic.test.ts`

- [ ] **Step 1: Define the IR**

`packages/llm-router/src/ir/types.ts`:
```ts
import type { LLMModel, LLMUsage } from '@glm/shared'

export type IRRole = 'user' | 'assistant' | 'system' | 'tool'

export interface IRTextBlock      { type: 'text'; text: string; cacheControl?: 'ephemeral' }
export interface IRThinkingBlock  { type: 'thinking'; text: string; signature?: string }
export interface IRToolUseBlock   { type: 'tool_use'; id: string; name: string; input: unknown }
export interface IRToolResultBlock{ type: 'tool_result'; toolUseId: string; content: string; isError?: boolean }
export type IRBlock = IRTextBlock | IRThinkingBlock | IRToolUseBlock | IRToolResultBlock

export interface IRMessage {
  role: IRRole
  content: IRBlock[]
}

export interface IRToolDef {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface IRRequest {
  model: LLMModel
  system: IRBlock[]
  messages: IRMessage[]
  tools?: IRToolDef[]
  maxOutputTokens?: number
  temperature?: number
  topP?: number
  thinking?: { type: 'enabled'; budgetTokens?: number } | { type: 'disabled' }
  stopSequences?: string[]
  metadata?: { sessionId?: string; workerId?: string; phase?: string }
}

export type IREvent =
  | { type: 'message_start';      messageId: string; model: LLMModel }
  | { type: 'thinking_delta';     text: string }
  | { type: 'text_delta';         text: string }
  | { type: 'tool_use_start';     id: string; name: string }
  | { type: 'tool_use_input_delta'; id: string; partialJson: string }
  | { type: 'tool_use_stop';      id: string }
  | { type: 'message_stop';       stopReason: 'end_turn'|'tool_use'|'max_tokens'|'stop_sequence'|'cancelled' }
  | { type: 'usage';              usage: LLMUsage }
  | { type: 'error';              code: string; message: string; retryable: boolean }
```

- [ ] **Step 2: Write failing test for Anthropic conversion**

`packages/llm-router/test/unit/ir-anthropic.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { irToAnthropic } from '../../src/ir/to-anthropic'
import { anthropicToIRResponse } from '../../src/ir/from-anthropic'
import type { IRRequest } from '../../src/ir/types'

describe('irToAnthropic', () => {
  test('produces system as content blocks with cache_control', () => {
    const req: IRRequest = {
      model: 'GLM-5.1',
      system: [{ type: 'text', text: 'You are helpful', cacheControl: 'ephemeral' }],
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }]
    }
    const w = irToAnthropic(req)
    expect(w.model).toBe('GLM-5.1')
    expect(w.system[0]).toEqual({ type: 'text', text: 'You are helpful', cache_control: { type: 'ephemeral' } })
    expect(w.messages[0].role).toBe('user')
    expect(w.messages[0].content[0]).toEqual({ type: 'text', text: 'hi' })
  })

  test('maps tool_use and tool_result blocks', () => {
    const req: IRRequest = {
      model: 'GLM-5.1',
      system: [],
      messages: [
        { role: 'assistant', content: [{ type: 'tool_use', id: 'tu_1', name: 'Read', input: { path: 'x' } }] },
        { role: 'tool',      content: [{ type: 'tool_result', toolUseId: 'tu_1', content: 'ok' }] }
      ]
    }
    const w = irToAnthropic(req)
    expect(w.messages[0].content[0]).toMatchObject({ type: 'tool_use', id: 'tu_1', name: 'Read', input: { path: 'x' } })
    expect(w.messages[1].role).toBe('user') // Anthropic uses user role for tool_result
    expect(w.messages[1].content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'tu_1', content: 'ok' })
  })
})

describe('anthropicToIRResponse', () => {
  test('reads non-streaming response into IR blocks + usage', () => {
    const wire = {
      id: 'msg_x',
      role: 'assistant',
      model: 'GLM-5.1',
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'hello' }],
      usage: { input_tokens: 10, output_tokens: 2, cache_read_input_tokens: 5 }
    }
    const ir = anthropicToIRResponse(wire)
    expect(ir.message.role).toBe('assistant')
    expect(ir.message.content[0]).toMatchObject({ type: 'text', text: 'hello' })
    expect(ir.usage.inputTokens).toBe(10)
    expect(ir.usage.cacheReadTokens).toBe(5)
    expect(ir.stopReason).toBe('end_turn')
  })
})
```

- [ ] **Step 3: Run — FAIL**

```bash
pnpm vitest run packages/llm-router/test/unit/ir-anthropic.test.ts
```

- [ ] **Step 4: Implement IR → Anthropic wire**

`packages/llm-router/src/ir/to-anthropic.ts`:
```ts
import type { IRRequest, IRMessage, IRBlock } from './types'

interface WireBlock {
  type: string
  text?: string
  cache_control?: { type: 'ephemeral' }
  id?: string
  name?: string
  input?: unknown
  tool_use_id?: string
  content?: string
  is_error?: boolean
  thinking?: string
  signature?: string
}

export interface AnthropicWireRequest {
  model: string
  max_tokens: number
  system: WireBlock[]
  messages: { role: 'user' | 'assistant'; content: WireBlock[] }[]
  tools?: { name: string; description: string; input_schema: unknown }[]
  temperature?: number
  top_p?: number
  thinking?: { type: 'enabled'; budget_tokens?: number } | { type: 'disabled' }
  stop_sequences?: string[]
  metadata?: { user_id?: string }
  stream: true
}

function blockToWire(b: IRBlock): WireBlock {
  switch (b.type) {
    case 'text':
      return { type: 'text', text: b.text, ...(b.cacheControl ? { cache_control: { type: 'ephemeral' } } : {}) }
    case 'thinking':
      return { type: 'thinking', thinking: b.text, ...(b.signature ? { signature: b.signature } : {}) }
    case 'tool_use':
      return { type: 'tool_use', id: b.id, name: b.name, input: b.input }
    case 'tool_result':
      return {
        type: 'tool_result',
        tool_use_id: b.toolUseId,
        content: b.content,
        ...(b.isError ? { is_error: true } : {})
      }
  }
}

function messageToWire(m: IRMessage): { role: 'user' | 'assistant'; content: WireBlock[] } {
  // Anthropic only allows user|assistant. tool role messages become user role with tool_result blocks.
  const role = m.role === 'assistant' ? 'assistant' : 'user'
  return { role, content: m.content.map(blockToWire) }
}

export function irToAnthropic(req: IRRequest): AnthropicWireRequest {
  return {
    model: req.model,
    max_tokens: req.maxOutputTokens ?? 16_000,
    system: req.system.map(blockToWire),
    messages: req.messages.map(messageToWire),
    ...(req.tools ? { tools: req.tools.map(t => ({ name: t.name, description: t.description, input_schema: t.inputSchema })) } : {}),
    ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    ...(req.topP !== undefined ? { top_p: req.topP } : {}),
    ...(req.thinking?.type === 'enabled'
      ? { thinking: { type: 'enabled', ...(req.thinking.budgetTokens ? { budget_tokens: req.thinking.budgetTokens } : {}) } }
      : {}),
    ...(req.stopSequences ? { stop_sequences: req.stopSequences } : {}),
    ...(req.metadata?.sessionId ? { metadata: { user_id: req.metadata.sessionId } } : {}),
    stream: true
  }
}
```

- [ ] **Step 5: Implement Anthropic wire → IR (non-streaming response shape, used by tests + retry parse)**

`packages/llm-router/src/ir/from-anthropic.ts`:
```ts
import type { IRBlock, IRMessage } from './types'
import type { LLMUsage } from '@glm/shared'

export interface AnthropicResponseLike {
  id: string
  role: 'assistant'
  model: string
  stop_reason: string
  content: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown; thinking?: string; signature?: string }>
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }
}

export interface IRResponse {
  messageId: string
  message: IRMessage
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' | 'cancelled'
  usage: LLMUsage
}

export function anthropicToIRResponse(w: AnthropicResponseLike): IRResponse {
  const content: IRBlock[] = w.content.map((b): IRBlock => {
    switch (b.type) {
      case 'text': return { type: 'text', text: b.text ?? '' }
      case 'thinking': return { type: 'thinking', text: b.thinking ?? '', ...(b.signature ? { signature: b.signature } : {}) }
      case 'tool_use': return { type: 'tool_use', id: b.id ?? '', name: b.name ?? '', input: b.input }
      default: return { type: 'text', text: '' }
    }
  })
  const stopReason =
    w.stop_reason === 'end_turn' || w.stop_reason === 'tool_use' ||
    w.stop_reason === 'max_tokens' || w.stop_reason === 'stop_sequence'
      ? w.stop_reason
      : 'end_turn'
  return {
    messageId: w.id,
    message: { role: 'assistant', content },
    stopReason,
    usage: {
      inputTokens: w.usage.input_tokens,
      outputTokens: w.usage.output_tokens,
      ...(w.usage.cache_read_input_tokens     ? { cacheReadTokens:     w.usage.cache_read_input_tokens     } : {}),
      ...(w.usage.cache_creation_input_tokens ? { cacheCreationTokens: w.usage.cache_creation_input_tokens } : {})
    }
  }
}
```

- [ ] **Step 6: Run — PASS**

```bash
pnpm vitest run packages/llm-router/test/unit/ir-anthropic.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add packages/llm-router
git commit -m "feat(llm-router): IR types + Anthropic wire ↔ IR converters"
```

---

## Task 4: OpenAI converters

**Files:**
- Create: `packages/llm-router/src/ir/to-openai.ts`
- Create: `packages/llm-router/src/ir/from-openai.ts`
- Test: `packages/llm-router/test/unit/ir-openai.test.ts`

- [ ] **Step 1: Write failing test**

`packages/llm-router/test/unit/ir-openai.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { irToOpenAI } from '../../src/ir/to-openai'
import { openaiToIRResponse } from '../../src/ir/from-openai'
import type { IRRequest } from '../../src/ir/types'

describe('irToOpenAI', () => {
  test('flattens system blocks into role:system + drops cache_control', () => {
    const req: IRRequest = {
      model: 'GLM-4.5-Air',
      system: [
        { type: 'text', text: 'A', cacheControl: 'ephemeral' },
        { type: 'text', text: 'B' }
      ],
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }]
    }
    const w = irToOpenAI(req)
    expect(w.messages[0]).toEqual({ role: 'system', content: 'A\n\nB' })
    expect(w.messages[1]).toEqual({ role: 'user', content: 'hi' })
    expect(w.stream).toBe(true)
  })

  test('maps tool_use → tool_calls and tool_result → role:tool', () => {
    const req: IRRequest = {
      model: 'GLM-4.5-Air',
      system: [],
      messages: [
        { role: 'assistant', content: [{ type: 'tool_use', id: 'tu_1', name: 'Read', input: { path: 'x' } }] },
        { role: 'tool', content: [{ type: 'tool_result', toolUseId: 'tu_1', content: 'ok' }] }
      ]
    }
    const w = irToOpenAI(req)
    expect(w.messages[0]).toMatchObject({
      role: 'assistant',
      content: null,
      tool_calls: [{ id: 'tu_1', type: 'function', function: { name: 'Read', arguments: '{"path":"x"}' } }]
    })
    expect(w.messages[1]).toEqual({ role: 'tool', tool_call_id: 'tu_1', content: 'ok' })
  })

  test('drops thinking blocks', () => {
    const req: IRRequest = {
      model: 'GLM-4.5-Air',
      system: [],
      messages: [{ role: 'assistant', content: [{ type: 'thinking', text: 'pondering' }, { type: 'text', text: 'answer' }] }]
    }
    const w = irToOpenAI(req)
    expect(w.messages[0]).toEqual({ role: 'assistant', content: 'answer' })
  })
})

describe('openaiToIRResponse', () => {
  test('maps choice + tool_calls + usage', () => {
    const wire = {
      id: 'cmpl_x',
      model: 'GLM-4.5-Air',
      choices: [{
        index: 0,
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: 'thinking out loud',
          tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'Read', arguments: '{"path":"x"}' } }]
        }
      }],
      usage: { prompt_tokens: 11, completion_tokens: 3 }
    }
    const ir = openaiToIRResponse(wire)
    expect(ir.message.content).toEqual([
      { type: 'text', text: 'thinking out loud' },
      { type: 'tool_use', id: 'call_1', name: 'Read', input: { path: 'x' } }
    ])
    expect(ir.stopReason).toBe('tool_use')
    expect(ir.usage.inputTokens).toBe(11)
  })
})
```

- [ ] **Step 2: Run — FAIL**

```bash
pnpm vitest run packages/llm-router/test/unit/ir-openai.test.ts
```

- [ ] **Step 3: Implement IR → OpenAI**

`packages/llm-router/src/ir/to-openai.ts`:
```ts
import type { IRRequest, IRMessage, IRBlock } from './types'

interface OAIMsg {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[]
  tool_call_id?: string
}

export interface OpenAIWireRequest {
  model: string
  messages: OAIMsg[]
  tools?: { type: 'function'; function: { name: string; description: string; parameters: unknown } }[]
  max_tokens?: number
  temperature?: number
  top_p?: number
  stop?: string[]
  stream: true
}

function textOf(blocks: IRBlock[]): string {
  return blocks
    .filter((b): b is Extract<IRBlock, { type: 'text' }> => b.type === 'text')
    .map(b => b.text)
    .join('\n\n')
}

function toolUsesOf(blocks: IRBlock[]): { id: string; type: 'function'; function: { name: string; arguments: string } }[] | undefined {
  const tus = blocks.filter((b): b is Extract<IRBlock, { type: 'tool_use' }> => b.type === 'tool_use')
  if (tus.length === 0) return undefined
  return tus.map(t => ({
    id: t.id,
    type: 'function' as const,
    function: { name: t.name, arguments: JSON.stringify(t.input ?? {}) }
  }))
}

function messageToOAI(m: IRMessage): OAIMsg[] {
  if (m.role === 'tool') {
    return m.content
      .filter((b): b is Extract<IRBlock, { type: 'tool_result' }> => b.type === 'tool_result')
      .map(b => ({ role: 'tool' as const, tool_call_id: b.toolUseId, content: b.content }))
  }
  if (m.role === 'assistant') {
    const text = textOf(m.content)
    const tcs  = toolUsesOf(m.content)
    return [{
      role: 'assistant',
      content: tcs ? (text || null) : (text || ''),
      ...(tcs ? { tool_calls: tcs } : {})
    }]
  }
  // user / system
  return [{ role: m.role as 'user' | 'system', content: textOf(m.content) }]
}

export function irToOpenAI(req: IRRequest): OpenAIWireRequest {
  const messages: OAIMsg[] = []
  if (req.system.length > 0) messages.push({ role: 'system', content: textOf(req.system) })
  for (const m of req.messages) messages.push(...messageToOAI(m))
  return {
    model: req.model,
    messages,
    ...(req.tools ? { tools: req.tools.map(t => ({ type: 'function' as const, function: { name: t.name, description: t.description, parameters: t.inputSchema } })) } : {}),
    ...(req.maxOutputTokens ? { max_tokens: req.maxOutputTokens } : {}),
    ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    ...(req.topP !== undefined ? { top_p: req.topP } : {}),
    ...(req.stopSequences ? { stop: req.stopSequences } : {}),
    stream: true
  }
}
```

- [ ] **Step 4: Implement OpenAI → IR**

`packages/llm-router/src/ir/from-openai.ts`:
```ts
import type { IRBlock } from './types'
import type { IRResponse } from './from-anthropic'

export interface OpenAIResponseLike {
  id: string
  model: string
  choices: Array<{
    index: number
    finish_reason: string
    message: {
      role: 'assistant'
      content: string | null
      tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
    }
  }>
  usage: { prompt_tokens: number; completion_tokens: number }
}

export function openaiToIRResponse(w: OpenAIResponseLike): IRResponse {
  const choice = w.choices[0]
  if (!choice) throw new Error('openai response has no choices')
  const content: IRBlock[] = []
  if (choice.message.content) content.push({ type: 'text', text: choice.message.content })
  for (const tc of choice.message.tool_calls ?? []) {
    let parsed: unknown = {}
    try { parsed = JSON.parse(tc.function.arguments || '{}') } catch { /* leave as {} */ }
    content.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input: parsed })
  }
  const stopReason: IRResponse['stopReason'] =
    choice.finish_reason === 'tool_calls' ? 'tool_use'
      : choice.finish_reason === 'length' ? 'max_tokens'
      : choice.finish_reason === 'stop' ? 'end_turn'
      : 'end_turn'
  return {
    messageId: w.id,
    message: { role: 'assistant', content },
    stopReason,
    usage: { inputTokens: w.usage.prompt_tokens, outputTokens: w.usage.completion_tokens }
  }
}
```

- [ ] **Step 5: Run — PASS**

```bash
pnpm vitest run packages/llm-router/test/unit/ir-openai.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add packages/llm-router
git commit -m "feat(llm-router): OpenAI wire ↔ IR converters (tool_use ↔ tool_calls, thinking dropped, cache_control dropped)"
```

---

## Task 5: Idempotency hash + cache repo

**Files:**
- Create: `packages/llm-router/src/ir/hash.ts`
- Create: `packages/llm-router/src/cache/key.ts`
- Create: `packages/llm-router/src/cache/idempotency-cache.ts`
- Test: `packages/llm-router/test/unit/hash.test.ts`
- Test: `packages/llm-router/test/unit/idempotency-cache.test.ts`

- [ ] **Step 1: Hash test**

`packages/llm-router/test/unit/hash.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { stableHash } from '../../src/ir/hash'
import { cacheKey } from '../../src/cache/key'
import type { IRRequest } from '../../src/ir/types'

describe('stableHash', () => {
  test('order-independent for objects', () => {
    expect(stableHash({ a: 1, b: 2 })).toBe(stableHash({ b: 2, a: 1 }))
  })
  test('different content → different hash', () => {
    expect(stableHash({ a: 1 })).not.toBe(stableHash({ a: 2 }))
  })
})

describe('cacheKey', () => {
  test('depends on role, model, system, messages, tools', () => {
    const base: IRRequest = {
      model: 'GLM-5.1',
      system: [{ type: 'text', text: 'sys' }],
      messages: [{ role: 'user', content: [{ type: 'text', text: 'q' }] }]
    }
    const k1 = cacheKey('executor', base)
    const k2 = cacheKey('executor', { ...base, model: 'GLM-5-Turbo' })
    const k3 = cacheKey('planner',  base)
    expect(k1).not.toBe(k2)
    expect(k1).not.toBe(k3)
    expect(k1).toMatch(/^[a-f0-9]{64}$/)
  })

  test('ignores metadata field (session/worker IDs are transient)', () => {
    const a: IRRequest = { model: 'GLM-5.1', system: [], messages: [], metadata: { sessionId: 'A' } }
    const b: IRRequest = { model: 'GLM-5.1', system: [], messages: [], metadata: { sessionId: 'B' } }
    expect(cacheKey('x', a)).toBe(cacheKey('x', b))
  })
})
```

- [ ] **Step 2: Implement stable hash**

`packages/llm-router/src/ir/hash.ts`:
```ts
import { createHash } from 'node:crypto'

export function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(canonicalize)
  const keys = Object.keys(value as Record<string, unknown>).sort()
  const out: Record<string, unknown> = {}
  for (const k of keys) out[k] = canonicalize((value as Record<string, unknown>)[k])
  return out
}

export function stableHash(value: unknown): string {
  const json = JSON.stringify(canonicalize(value))
  return createHash('sha256').update(json).digest('hex')
}
```

- [ ] **Step 3: Implement cacheKey**

`packages/llm-router/src/cache/key.ts`:
```ts
import { stableHash } from '../ir/hash'
import type { IRRequest } from '../ir/types'

/**
 * sha256(role + model + system + messages + tools + temperature + topP + stopSequences + thinking)
 * Explicitly excludes: metadata (sessionId/workerId/phase), maxOutputTokens (output cap),
 * cache_control markers (irrelevant to semantic identity).
 */
export function cacheKey(role: string, req: IRRequest): string {
  return stableHash({
    role,
    model: req.model,
    system: req.system.map(b => stripCacheControl(b)),
    messages: req.messages.map(m => ({ role: m.role, content: m.content.map(stripCacheControl) })),
    tools: req.tools ?? null,
    temperature: req.temperature ?? null,
    topP: req.topP ?? null,
    stopSequences: req.stopSequences ?? null,
    thinking: req.thinking ?? null
  })
}

function stripCacheControl<T extends { cacheControl?: unknown }>(b: T): T {
  if (!b || typeof b !== 'object' || !('cacheControl' in b)) return b
  const { cacheControl: _ignored, ...rest } = b as Record<string, unknown>
  return rest as T
}
```

- [ ] **Step 4: Cache repo test**

`packages/llm-router/test/unit/idempotency-cache.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { openDb, runMigrations } from '@glm/core'
import { IdempotencyCache } from '../../src/cache/idempotency-cache'

let tmp: string
beforeEach(() => { tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-cache-')) })
afterEach(()  => rmSync(tmp, { recursive: true, force: true }))

describe('IdempotencyCache', () => {
  test('miss then put then hit increments hit_count', () => {
    const db = openDb(path.join(tmp, 's.db'))
    runMigrations(db)
    const c = new IdempotencyCache(db)
    expect(c.get('k1')).toBeUndefined()
    c.put('k1', { model: 'GLM-5.1', endpoint: 'anthropic', requestJson: '{}', responseJson: '{"ok":1}', usageInput: 10, usageOutput: 2 })
    const r = c.get('k1')
    expect(r).toBeDefined()
    expect(r!.responseJson).toBe('{"ok":1}')
    expect(r!.hitCount).toBe(1)
    c.get('k1')
    expect(c.get('k1')!.hitCount).toBe(3)
    db.close()
  })

  test('stats returns counts + hit ratio', () => {
    const db = openDb(path.join(tmp, 's.db'))
    runMigrations(db)
    const c = new IdempotencyCache(db)
    c.put('k1', { model: 'X', endpoint: 'anthropic', requestJson: '{}', responseJson: '{}', usageInput: 0, usageOutput: 0 })
    c.put('k2', { model: 'X', endpoint: 'anthropic', requestJson: '{}', responseJson: '{}', usageInput: 0, usageOutput: 0 })
    c.get('k1'); c.get('k1'); c.get('k2')
    const s = c.stats()
    expect(s.entries).toBe(2)
    expect(s.totalHits).toBe(3)
    db.close()
  })

  test('clear empties table', () => {
    const db = openDb(path.join(tmp, 's.db'))
    runMigrations(db)
    const c = new IdempotencyCache(db)
    c.put('k1', { model: 'X', endpoint: 'anthropic', requestJson: '{}', responseJson: '{}', usageInput: 0, usageOutput: 0 })
    expect(c.stats().entries).toBe(1)
    c.clear()
    expect(c.stats().entries).toBe(0)
    db.close()
  })
})
```

- [ ] **Step 5: Implement IdempotencyCache**

`packages/llm-router/src/cache/idempotency-cache.ts`:
```ts
import type { Database } from 'better-sqlite3'
import type { LLMEndpoint } from '@glm/shared'

export interface CacheEntry {
  key: string
  model: string
  endpoint: LLMEndpoint
  requestJson: string
  responseJson: string
  usageInput: number
  usageOutput: number
  createdAt: string
  lastHitAt: string
  hitCount: number
}

export interface PutInput {
  model: string
  endpoint: LLMEndpoint
  requestJson: string
  responseJson: string
  usageInput: number
  usageOutput: number
}

export interface CacheStats {
  entries: number
  totalHits: number
  totalInputTokens: number
  totalOutputTokens: number
}

export class IdempotencyCache {
  constructor(private db: Database) {}

  get(key: string): CacheEntry | undefined {
    const row = this.db.prepare(`SELECT * FROM llm_cache WHERE key = ?`).get(key) as Record<string, unknown> | undefined
    if (!row) return undefined
    const now = new Date().toISOString()
    this.db.prepare(`UPDATE llm_cache SET hit_count = hit_count + 1, last_hit_at = ? WHERE key = ?`).run(now, key)
    return rowToEntry({ ...row, hit_count: (row.hit_count as number) + 1, last_hit_at: now })
  }

  put(key: string, input: PutInput): void {
    const now = new Date().toISOString()
    this.db.prepare(`
      INSERT INTO llm_cache(key, model, endpoint, request_json, response_json, usage_input, usage_output, created_at, last_hit_at, hit_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      ON CONFLICT(key) DO NOTHING
    `).run(key, input.model, input.endpoint, input.requestJson, input.responseJson, input.usageInput, input.usageOutput, now, now)
  }

  clear(): number {
    const r = this.db.prepare(`DELETE FROM llm_cache`).run()
    return r.changes
  }

  stats(): CacheStats {
    const r = this.db.prepare(`
      SELECT COUNT(*) AS entries,
             COALESCE(SUM(hit_count), 0) AS hits,
             COALESCE(SUM(usage_input), 0) AS in_tok,
             COALESCE(SUM(usage_output), 0) AS out_tok
      FROM llm_cache
    `).get() as { entries: number; hits: number; in_tok: number; out_tok: number }
    return { entries: r.entries, totalHits: r.hits, totalInputTokens: r.in_tok, totalOutputTokens: r.out_tok }
  }
}

function rowToEntry(r: Record<string, unknown>): CacheEntry {
  return {
    key: r.key as string,
    model: r.model as string,
    endpoint: r.endpoint as LLMEndpoint,
    requestJson: r.request_json as string,
    responseJson: r.response_json as string,
    usageInput: r.usage_input as number,
    usageOutput: r.usage_output as number,
    createdAt: r.created_at as string,
    lastHitAt: r.last_hit_at as string,
    hitCount: r.hit_count as number
  }
}
```

- [ ] **Step 6: Run — PASS**

```bash
pnpm vitest run packages/llm-router/test/unit/hash.test.ts packages/llm-router/test/unit/idempotency-cache.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add packages/llm-router
git commit -m "feat(llm-router): stable hash + cacheKey + IdempotencyCache CRUD"
```

---

## Task 6: Endpoint map + credential resolver + profiles

**Files:**
- Create: `packages/llm-router/src/provider/endpoint-map.ts`
- Create: `packages/llm-router/src/credentials/credentials-file.ts`
- Create: `packages/llm-router/src/credentials/profile.ts`
- Create: `packages/llm-router/src/credentials/resolver.ts`
- Create: `packages/llm-router/src/credentials/keychain.ts`
- Test: `packages/llm-router/test/unit/endpoint-map.test.ts`
- Test: `packages/llm-router/test/unit/credentials.test.ts`

- [ ] **Step 1: Endpoint map test**

`packages/llm-router/test/unit/endpoint-map.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { preferredEndpoint, endpointBaseUrl } from '../../src/provider/endpoint-map'

describe('endpoint map', () => {
  test('GLM-5.x and 4.x (5+turbo+5+4.7+4.6) → anthropic', () => {
    expect(preferredEndpoint('GLM-5.1')).toBe('anthropic')
    expect(preferredEndpoint('GLM-5-Turbo')).toBe('anthropic')
    expect(preferredEndpoint('GLM-5')).toBe('anthropic')
    expect(preferredEndpoint('GLM-4.7')).toBe('anthropic')
    expect(preferredEndpoint('GLM-4.6')).toBe('anthropic')
  })
  test('GLM-4.5 family → openai', () => {
    expect(preferredEndpoint('GLM-4.5-Air')).toBe('openai')
    expect(preferredEndpoint('GLM-4.5-AirX')).toBe('openai')
    expect(preferredEndpoint('GLM-4.5')).toBe('openai')
  })
  test('endpointBaseUrl returns z.ai paths', () => {
    expect(endpointBaseUrl('anthropic')).toBe('https://api.z.ai/api/anthropic')
    expect(endpointBaseUrl('openai')).toBe('https://api.z.ai/api/coding')
  })
})
```

- [ ] **Step 2: Implement endpoint map**

`packages/llm-router/src/provider/endpoint-map.ts`:
```ts
import type { LLMEndpoint, LLMModel } from '@glm/shared'

const PREFERRED: Record<LLMModel, LLMEndpoint> = {
  'GLM-5.1': 'anthropic',
  'GLM-5-Turbo': 'anthropic',
  'GLM-5': 'anthropic',
  'GLM-4.7': 'anthropic',
  'GLM-4.6': 'anthropic',
  'GLM-4.5-Air': 'openai',
  'GLM-4.5-AirX': 'openai',
  'GLM-4.5': 'openai'
}

export function preferredEndpoint(model: LLMModel): LLMEndpoint {
  return PREFERRED[model]
}

export function endpointBaseUrl(ep: LLMEndpoint): string {
  return ep === 'anthropic'
    ? 'https://api.z.ai/api/anthropic'
    : 'https://api.z.ai/api/coding'
}

export const CONCURRENCY: Record<LLMModel, number> = {
  'GLM-5.1': 10,
  'GLM-5-Turbo': 1,
  'GLM-5': 2,
  'GLM-4.7': 2,
  'GLM-4.6': 3,
  'GLM-4.5-Air': 5,
  'GLM-4.5-AirX': 5,
  'GLM-4.5': 3
}
```

- [ ] **Step 3: Credentials file + profile**

`packages/llm-router/src/credentials/credentials-file.ts`:
```ts
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs'
import { dirname } from 'node:path'

export interface ProfileCred {
  apiKey: string
  baseUrl?: string         // override (테스트/스테이징용; 정상 운영은 z.ai 표준)
  endpointOverride?: 'anthropic' | 'openai'
  tier?: 'lite' | 'pro' | 'max'
}

export interface CredentialsFile {
  defaultProfile: string
  profiles: Record<string, ProfileCred>
}

export function readCredentialsFile(path: string): CredentialsFile | undefined {
  if (!existsSync(path)) return undefined
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as CredentialsFile
  } catch {
    return undefined
  }
}

export function writeCredentialsFile(path: string, file: CredentialsFile): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(file, null, 2), { mode: 0o600 })
  try { chmodSync(path, 0o600) } catch { /* best effort */ }
}
```

`packages/llm-router/src/credentials/profile.ts`:
```ts
import { resolvePaths } from '@glm/shared'
import { readCredentialsFile, writeCredentialsFile, type CredentialsFile, type ProfileCred } from './credentials-file'

export function listProfiles(): { active: string; profiles: { name: string; tier?: string }[] } {
  const path = resolvePaths().root + '/credentials.json'
  const f = readCredentialsFile(path)
  if (!f) return { active: 'default', profiles: [] }
  return {
    active: f.defaultProfile,
    profiles: Object.entries(f.profiles).map(([name, p]) => ({ name, tier: p.tier }))
  }
}

export function setActiveProfile(name: string): void {
  const path = resolvePaths().root + '/credentials.json'
  const f = readCredentialsFile(path) ?? { defaultProfile: 'default', profiles: {} }
  if (!f.profiles[name]) throw new Error(`profile '${name}' not found`)
  f.defaultProfile = name
  writeCredentialsFile(path, f)
}

export function getProfile(name?: string): ProfileCred | undefined {
  const path = resolvePaths().root + '/credentials.json'
  const f = readCredentialsFile(path)
  if (!f) return undefined
  return f.profiles[name ?? f.defaultProfile]
}
```

- [ ] **Step 4: Keychain stub (best-effort)**

`packages/llm-router/src/credentials/keychain.ts`:
```ts
import { execFileSync } from 'node:child_process'

/**
 * Best-effort macOS Keychain read. Returns undefined on any error or non-darwin.
 * Service = 'glm-code', account = profile name.
 */
export function readKeychain(profile: string): string | undefined {
  if (process.platform !== 'darwin') return undefined
  try {
    const out = execFileSync('security', ['find-generic-password', '-s', 'glm-code', '-a', profile, '-w'], {
      stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8'
    })
    return out.trim() || undefined
  } catch {
    return undefined
  }
}
```

- [ ] **Step 5: Resolver test**

`packages/llm-router/test/unit/credentials.test.ts`:
```ts
import { afterEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { resolveCredentials } from '../../src/credentials/resolver'
import { writeCredentialsFile } from '../../src/credentials/credentials-file'

let tmp: string
afterEach(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }) })

describe('resolveCredentials', () => {
  test('GLM_API_KEY env wins over file', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-cred-'))
    const credFile = path.join(tmp, 'credentials.json')
    writeCredentialsFile(credFile, { defaultProfile: 'default', profiles: { default: { apiKey: 'FROM_FILE' } } })
    const c = resolveCredentials({ env: { GLM_API_KEY: 'FROM_ENV' }, credentialsFile: credFile })
    expect(c.apiKey).toBe('FROM_ENV')
    expect(c.source).toBe('env:GLM_API_KEY')
  })

  test('ZAI_API_KEY falls back when GLM not set', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-cred-'))
    const c = resolveCredentials({ env: { ZAI_API_KEY: 'Z' }, credentialsFile: path.join(tmp, 'none.json') })
    expect(c.apiKey).toBe('Z')
    expect(c.source).toBe('env:ZAI_API_KEY')
  })

  test('ANTHROPIC_API_KEY only used when ANTHROPIC_BASE_URL points at z.ai', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-cred-'))
    const noFile = path.join(tmp, 'none.json')
    const c1 = resolveCredentials({ env: { ANTHROPIC_API_KEY: 'A', ANTHROPIC_BASE_URL: 'https://api.z.ai' }, credentialsFile: noFile })
    expect(c1.apiKey).toBe('A')
    const c2 = resolveCredentials({ env: { ANTHROPIC_API_KEY: 'A', ANTHROPIC_BASE_URL: 'https://api.anthropic.com' }, credentialsFile: noFile })
    expect(c2.apiKey).toBeUndefined()
  })

  test('file fallback uses profile.apiKey', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-cred-'))
    const credFile = path.join(tmp, 'credentials.json')
    writeCredentialsFile(credFile, { defaultProfile: 'work', profiles: { work: { apiKey: 'WORK_KEY', tier: 'pro' } } })
    const c = resolveCredentials({ env: {}, credentialsFile: credFile })
    expect(c.apiKey).toBe('WORK_KEY')
    expect(c.tier).toBe('pro')
    expect(c.source).toBe('file:work')
  })

  test('explicit profile overrides defaultProfile', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-cred-'))
    const credFile = path.join(tmp, 'credentials.json')
    writeCredentialsFile(credFile, {
      defaultProfile: 'work',
      profiles: { work: { apiKey: 'W' }, personal: { apiKey: 'P' } }
    })
    const c = resolveCredentials({ env: {}, credentialsFile: credFile, profile: 'personal' })
    expect(c.apiKey).toBe('P')
    expect(c.source).toBe('file:personal')
  })
})
```

- [ ] **Step 6: Implement resolver**

`packages/llm-router/src/credentials/resolver.ts`:
```ts
import { readCredentialsFile } from './credentials-file'
import { readKeychain } from './keychain'

export interface ResolvedCredentials {
  apiKey: string | undefined
  baseUrlOverride?: string
  endpointOverride?: 'anthropic' | 'openai'
  tier?: 'lite' | 'pro' | 'max'
  source: string
  profile: string
}

export interface ResolveOpts {
  env?: NodeJS.ProcessEnv
  credentialsFile: string
  profile?: string                   // explicit override
  allowKeychain?: boolean
}

export function resolveCredentials(opts: ResolveOpts): ResolvedCredentials {
  const env = opts.env ?? process.env

  // 1) Env precedence
  if (env.GLM_API_KEY) {
    return { apiKey: env.GLM_API_KEY, source: 'env:GLM_API_KEY', profile: opts.profile ?? 'default' }
  }
  if (env.ZAI_API_KEY) {
    return { apiKey: env.ZAI_API_KEY, source: 'env:ZAI_API_KEY', profile: opts.profile ?? 'default' }
  }
  if (env.ANTHROPIC_API_KEY && env.ANTHROPIC_BASE_URL && env.ANTHROPIC_BASE_URL.includes('z.ai')) {
    return {
      apiKey: env.ANTHROPIC_API_KEY,
      baseUrlOverride: env.ANTHROPIC_BASE_URL,
      source: 'env:ANTHROPIC_API_KEY',
      profile: opts.profile ?? 'default'
    }
  }

  // 2) credentials.json
  const file = readCredentialsFile(opts.credentialsFile)
  if (file) {
    const name = opts.profile ?? file.defaultProfile
    const prof = file.profiles[name]
    if (prof) {
      return {
        apiKey: prof.apiKey,
        baseUrlOverride: prof.baseUrl,
        endpointOverride: prof.endpointOverride,
        tier: prof.tier,
        source: `file:${name}`,
        profile: name
      }
    }
  }

  // 3) Keychain (opt-in)
  if (opts.allowKeychain) {
    const name = opts.profile ?? 'default'
    const k = readKeychain(name)
    if (k) return { apiKey: k, source: `keychain:${name}`, profile: name }
  }

  return { apiKey: undefined, source: 'none', profile: opts.profile ?? 'default' }
}
```

- [ ] **Step 7: Run — PASS**

```bash
pnpm vitest run packages/llm-router/test/unit/endpoint-map.test.ts packages/llm-router/test/unit/credentials.test.ts
```

- [ ] **Step 8: Commit**

```bash
git add packages/llm-router
git commit -m "feat(llm-router): endpoint map + credential resolver (env > file > keychain) + multi-profile"
```

---

## Task 7: SSE parsers (Anthropic + OpenAI → IR events)

**Files:**
- Create: `packages/llm-router/src/stream/sse.ts`
- Create: `packages/llm-router/src/stream/anthropic-parser.ts`
- Create: `packages/llm-router/src/stream/openai-parser.ts`
- Create: `packages/llm-router/src/stream/coalesce.ts`
- Test: `packages/llm-router/test/unit/sse-anthropic.test.ts`
- Test: `packages/llm-router/test/unit/sse-openai.test.ts`

- [ ] **Step 1: SSE chunk reader wrapper**

`packages/llm-router/src/stream/sse.ts`:
```ts
import { createParser, type EventSourceMessage } from 'eventsource-parser'

export interface SSEEvent { event?: string; data: string }

/**
 * Turn an async byte stream into SSE events (well-formed lines).
 * Uses eventsource-parser, which handles multi-line `data:` correctly.
 */
export async function* readSSE(body: AsyncIterable<Uint8Array>, signal?: AbortSignal): AsyncIterable<SSEEvent> {
  const queue: SSEEvent[] = []
  let done = false
  const parser = createParser({
    onEvent: (e: EventSourceMessage) => queue.push({ event: e.event, data: e.data })
  })
  const decoder = new TextDecoder()
  for await (const chunk of body) {
    if (signal?.aborted) break
    parser.feed(decoder.decode(chunk, { stream: true }))
    while (queue.length > 0) yield queue.shift()!
  }
  done = true
  while (queue.length > 0) yield queue.shift()!
  void done
}
```

- [ ] **Step 2: Anthropic parser test**

`packages/llm-router/test/unit/sse-anthropic.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { parseAnthropicStream } from '../../src/stream/anthropic-parser'
import type { IREvent } from '../../src/ir/types'

async function* fromSSE(frames: { event: string; data: unknown }[]) {
  for (const f of frames) yield { event: f.event, data: typeof f.data === 'string' ? f.data : JSON.stringify(f.data) }
}

async function collect(iter: AsyncIterable<IREvent>): Promise<IREvent[]> {
  const out: IREvent[] = []
  for await (const e of iter) out.push(e)
  return out
}

describe('parseAnthropicStream', () => {
  test('text-only completion', async () => {
    const events = await collect(parseAnthropicStream(fromSSE([
      { event: 'message_start', data: { type: 'message_start', message: { id: 'msg_1', model: 'GLM-5.1', usage: { input_tokens: 10, output_tokens: 0 } } } },
      { event: 'content_block_start', data: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } } },
      { event: 'content_block_delta', data: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hel' } } },
      { event: 'content_block_delta', data: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'lo' } } },
      { event: 'content_block_stop', data: { type: 'content_block_stop', index: 0 } },
      { event: 'message_delta', data: { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 2 } } },
      { event: 'message_stop', data: { type: 'message_stop' } }
    ])))
    expect(events[0]).toMatchObject({ type: 'message_start', messageId: 'msg_1' })
    expect(events.filter(e => e.type === 'text_delta')).toEqual([
      { type: 'text_delta', text: 'Hel' },
      { type: 'text_delta', text: 'lo' }
    ])
    expect(events.find(e => e.type === 'message_stop')).toMatchObject({ type: 'message_stop', stopReason: 'end_turn' })
    const usage = events.find(e => e.type === 'usage') as Extract<IREvent, { type: 'usage' }>
    expect(usage.usage.inputTokens).toBe(10)
    expect(usage.usage.outputTokens).toBe(2)
  })

  test('tool_use start + input deltas + stop', async () => {
    const events = await collect(parseAnthropicStream(fromSSE([
      { event: 'message_start', data: { type: 'message_start', message: { id: 'msg_2', model: 'GLM-5.1', usage: { input_tokens: 5, output_tokens: 0 } } } },
      { event: 'content_block_start', data: { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'tu_1', name: 'Read', input: {} } } },
      { event: 'content_block_delta', data: { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"pa' } } },
      { event: 'content_block_delta', data: { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: 'th":"x"}' } } },
      { event: 'content_block_stop', data: { type: 'content_block_stop', index: 0 } },
      { event: 'message_delta', data: { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 4 } } },
      { event: 'message_stop', data: { type: 'message_stop' } }
    ])))
    expect(events.find(e => e.type === 'tool_use_start')).toMatchObject({ id: 'tu_1', name: 'Read' })
    const deltas = events.filter(e => e.type === 'tool_use_input_delta')
    expect(deltas.length).toBe(2)
    expect(events.find(e => e.type === 'tool_use_stop')).toMatchObject({ id: 'tu_1' })
    expect(events.find(e => e.type === 'message_stop')).toMatchObject({ stopReason: 'tool_use' })
  })

  test('thinking deltas', async () => {
    const events = await collect(parseAnthropicStream(fromSSE([
      { event: 'message_start', data: { type: 'message_start', message: { id: 'msg_3', model: 'GLM-5.1', usage: { input_tokens: 1, output_tokens: 0 } } } },
      { event: 'content_block_start', data: { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } } },
      { event: 'content_block_delta', data: { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'reasoning' } } },
      { event: 'content_block_stop', data: { type: 'content_block_stop', index: 0 } },
      { event: 'message_stop', data: { type: 'message_stop' } }
    ])))
    expect(events.find(e => e.type === 'thinking_delta')).toMatchObject({ text: 'reasoning' })
  })
})
```

- [ ] **Step 3: Implement Anthropic parser**

`packages/llm-router/src/stream/anthropic-parser.ts`:
```ts
import type { IREvent } from '../ir/types'
import type { SSEEvent } from './sse'
import type { LLMModel, LLMUsage } from '@glm/shared'

interface OpenBlock { kind: 'text' | 'thinking' | 'tool_use'; id?: string; name?: string }

export async function* parseAnthropicStream(events: AsyncIterable<SSEEvent>): AsyncIterable<IREvent> {
  const blocks: Record<number, OpenBlock> = {}
  let acc: LLMUsage | undefined
  for await (const sse of events) {
    let payload: any
    try { payload = JSON.parse(sse.data) } catch { continue }
    const t: string = payload?.type ?? sse.event ?? ''

    if (t === 'message_start') {
      const msg = payload.message ?? {}
      acc = {
        inputTokens: msg.usage?.input_tokens ?? 0,
        outputTokens: msg.usage?.output_tokens ?? 0,
        ...(msg.usage?.cache_read_input_tokens     ? { cacheReadTokens:     msg.usage.cache_read_input_tokens } : {}),
        ...(msg.usage?.cache_creation_input_tokens ? { cacheCreationTokens: msg.usage.cache_creation_input_tokens } : {})
      }
      yield { type: 'message_start', messageId: msg.id ?? '', model: (msg.model ?? 'GLM-5.1') as LLMModel }
      continue
    }

    if (t === 'content_block_start') {
      const i = payload.index ?? 0
      const cb = payload.content_block ?? {}
      if (cb.type === 'tool_use') {
        blocks[i] = { kind: 'tool_use', id: cb.id, name: cb.name }
        yield { type: 'tool_use_start', id: cb.id, name: cb.name }
      } else if (cb.type === 'thinking') {
        blocks[i] = { kind: 'thinking' }
      } else {
        blocks[i] = { kind: 'text' }
      }
      continue
    }

    if (t === 'content_block_delta') {
      const i = payload.index ?? 0
      const d = payload.delta ?? {}
      const b = blocks[i]
      if (!b) continue
      if (d.type === 'text_delta' && b.kind === 'text') {
        yield { type: 'text_delta', text: d.text ?? '' }
      } else if (d.type === 'thinking_delta' && b.kind === 'thinking') {
        yield { type: 'thinking_delta', text: d.thinking ?? '' }
      } else if (d.type === 'input_json_delta' && b.kind === 'tool_use' && b.id) {
        yield { type: 'tool_use_input_delta', id: b.id, partialJson: d.partial_json ?? '' }
      }
      continue
    }

    if (t === 'content_block_stop') {
      const i = payload.index ?? 0
      const b = blocks[i]
      if (b?.kind === 'tool_use' && b.id) yield { type: 'tool_use_stop', id: b.id }
      delete blocks[i]
      continue
    }

    if (t === 'message_delta') {
      if (payload.usage?.output_tokens !== undefined && acc) acc.outputTokens = payload.usage.output_tokens
      if (payload.delta?.stop_reason) {
        const sr = payload.delta.stop_reason
        const stopReason: 'end_turn'|'tool_use'|'max_tokens'|'stop_sequence' =
          sr === 'tool_use' || sr === 'max_tokens' || sr === 'stop_sequence' ? sr : 'end_turn'
        yield { type: 'message_stop', stopReason }
      }
      continue
    }

    if (t === 'message_stop') {
      if (acc) yield { type: 'usage', usage: acc }
      continue
    }

    if (t === 'error') {
      yield { type: 'error', code: payload.error?.type ?? 'unknown', message: payload.error?.message ?? '', retryable: false }
      continue
    }
  }
}
```

- [ ] **Step 4: OpenAI parser test**

`packages/llm-router/test/unit/sse-openai.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { parseOpenAIStream } from '../../src/stream/openai-parser'
import type { IREvent } from '../../src/ir/types'

async function* fromSSE(lines: unknown[]) {
  for (const l of lines) yield { event: undefined, data: typeof l === 'string' ? l : JSON.stringify(l) }
}

async function collect(iter: AsyncIterable<IREvent>): Promise<IREvent[]> {
  const out: IREvent[] = []
  for await (const e of iter) out.push(e)
  return out
}

describe('parseOpenAIStream', () => {
  test('text deltas + finish_reason=stop', async () => {
    const events = await collect(parseOpenAIStream(fromSSE([
      { id: 'c1', model: 'GLM-4.5-Air', choices: [{ index: 0, delta: { role: 'assistant' } }] },
      { id: 'c1', model: 'GLM-4.5-Air', choices: [{ index: 0, delta: { content: 'Hel' } }] },
      { id: 'c1', model: 'GLM-4.5-Air', choices: [{ index: 0, delta: { content: 'lo' } }] },
      { id: 'c1', model: 'GLM-4.5-Air', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 4, completion_tokens: 2 } },
      '[DONE]'
    ])))
    expect(events[0]).toMatchObject({ type: 'message_start', messageId: 'c1' })
    expect(events.filter(e => e.type === 'text_delta').map(e => (e as any).text)).toEqual(['Hel', 'lo'])
    expect(events.find(e => e.type === 'message_stop')).toMatchObject({ stopReason: 'end_turn' })
    expect(events.find(e => e.type === 'usage')).toMatchObject({ usage: { inputTokens: 4, outputTokens: 2 } })
  })

  test('tool_calls accumulation across chunks', async () => {
    const events = await collect(parseOpenAIStream(fromSSE([
      { id: 'c2', model: 'GLM-4.5-Air', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'Read', arguments: '' } }] } }] },
      { id: 'c2', model: 'GLM-4.5-Air', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '{"pa' } }] } }] },
      { id: 'c2', model: 'GLM-4.5-Air', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: 'th":"x"}' } }] } }] },
      { id: 'c2', model: 'GLM-4.5-Air', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 3, completion_tokens: 5 } },
      '[DONE]'
    ])))
    expect(events.find(e => e.type === 'tool_use_start')).toMatchObject({ id: 'call_1', name: 'Read' })
    const deltas = events.filter(e => e.type === 'tool_use_input_delta')
    expect(deltas.length).toBe(2)
    expect(events.find(e => e.type === 'message_stop')).toMatchObject({ stopReason: 'tool_use' })
  })
})
```

- [ ] **Step 5: Implement OpenAI parser**

`packages/llm-router/src/stream/openai-parser.ts`:
```ts
import type { IREvent } from '../ir/types'
import type { SSEEvent } from './sse'
import type { LLMModel } from '@glm/shared'

interface ToolAcc { id: string; name: string; argsBuf: string }

export async function* parseOpenAIStream(events: AsyncIterable<SSEEvent>): AsyncIterable<IREvent> {
  const tools = new Map<number, ToolAcc>()    // by tool_calls[i].index
  let sentStart = false
  let lastFinish: string | undefined
  let lastUsage: { prompt_tokens: number; completion_tokens: number } | undefined

  for await (const sse of events) {
    if (sse.data === '[DONE]') continue
    let payload: any
    try { payload = JSON.parse(sse.data) } catch { continue }

    if (!sentStart) {
      sentStart = true
      yield { type: 'message_start', messageId: payload.id ?? '', model: (payload.model ?? 'GLM-4.5-Air') as LLMModel }
    }

    const choice = payload.choices?.[0]
    if (!choice) continue
    const d = choice.delta ?? {}

    if (typeof d.content === 'string' && d.content.length > 0) {
      yield { type: 'text_delta', text: d.content }
    }

    if (Array.isArray(d.tool_calls)) {
      for (const tc of d.tool_calls) {
        const idx = tc.index ?? 0
        let acc = tools.get(idx)
        if (!acc) {
          acc = { id: tc.id ?? '', name: tc.function?.name ?? '', argsBuf: '' }
          tools.set(idx, acc)
          yield { type: 'tool_use_start', id: acc.id, name: acc.name }
        }
        const partial = tc.function?.arguments
        if (typeof partial === 'string' && partial.length > 0) {
          acc.argsBuf += partial
          yield { type: 'tool_use_input_delta', id: acc.id, partialJson: partial }
        }
      }
    }

    if (choice.finish_reason) lastFinish = choice.finish_reason
    if (payload.usage) lastUsage = payload.usage
  }

  for (const t of tools.values()) yield { type: 'tool_use_stop', id: t.id }

  const stopReason: 'end_turn'|'tool_use'|'max_tokens'|'stop_sequence' =
    lastFinish === 'tool_calls' ? 'tool_use'
      : lastFinish === 'length' ? 'max_tokens'
      : 'end_turn'
  yield { type: 'message_stop', stopReason }
  if (lastUsage) yield { type: 'usage', usage: { inputTokens: lastUsage.prompt_tokens, outputTokens: lastUsage.completion_tokens } }
}
```

- [ ] **Step 6: Coalesce helper (used by consumers that want full tool input as JSON)**

`packages/llm-router/src/stream/coalesce.ts`:
```ts
import type { IREvent, IRBlock } from '../ir/types'

/**
 * Reduces a stream of IR events into a final assistant message + usage.
 * Used by the LLM service to commit a full row to `messages` when stream completes.
 */
export interface CoalescedResult {
  content: IRBlock[]
  stopReason: 'end_turn'|'tool_use'|'max_tokens'|'stop_sequence'|'cancelled'
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheCreationTokens?: number }
  messageId: string
}

export async function coalesce(events: AsyncIterable<IREvent>): Promise<CoalescedResult> {
  let text = ''
  let thinking = ''
  const toolBufs = new Map<string, { name: string; args: string }>()
  let stopReason: CoalescedResult['stopReason'] = 'end_turn'
  let usage: CoalescedResult['usage'] = { inputTokens: 0, outputTokens: 0 }
  let messageId = ''
  for await (const e of events) {
    switch (e.type) {
      case 'message_start': messageId = e.messageId; break
      case 'text_delta':    text += e.text; break
      case 'thinking_delta':thinking += e.text; break
      case 'tool_use_start':toolBufs.set(e.id, { name: e.name, args: '' }); break
      case 'tool_use_input_delta': { const b = toolBufs.get(e.id); if (b) b.args += e.partialJson; break }
      case 'message_stop':  stopReason = e.stopReason; break
      case 'usage':         usage = e.usage; break
      case 'error':         throw new Error(`${e.code}: ${e.message}`)
    }
  }
  const content: IRBlock[] = []
  if (thinking) content.push({ type: 'thinking', text: thinking })
  if (text)     content.push({ type: 'text', text })
  for (const [id, tb] of toolBufs.entries()) {
    let parsed: unknown = {}
    try { parsed = JSON.parse(tb.args || '{}') } catch { /* keep {} */ }
    content.push({ type: 'tool_use', id, name: tb.name, input: parsed })
  }
  return { content, stopReason, usage, messageId }
}
```

- [ ] **Step 7: Run — PASS**

```bash
pnpm vitest run packages/llm-router/test/unit/sse-anthropic.test.ts packages/llm-router/test/unit/sse-openai.test.ts
```

- [ ] **Step 8: Commit**

```bash
git add packages/llm-router
git commit -m "feat(llm-router): SSE parsers for Anthropic + OpenAI streams + coalesce helper"
```

---

## Task 8: Retry policy + backoff

**Files:**
- Create: `packages/llm-router/src/retry/policy.ts`
- Create: `packages/llm-router/src/retry/backoff.ts`
- Test: `packages/llm-router/test/unit/retry.test.ts`

> **P6-Fix-4 — 30s pause after N consecutive failures.** The retry policy classifies each attempt independently, but the *caller* (LLMService.runWithRetry) tracks consecutive failures across attempts. After the 3rd consecutive retryable failure, the next wait floors to **30 000 ms** before issuing attempt #4 — instead of the (already-capped) exponential value. This deliberately throttles a flaky upstream so we don't pound `z.ai` during a brownout. Reset the counter on the first successful event of the stream.

- [ ] **Step 1: Write failing test**

`packages/llm-router/test/unit/retry.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { classifyError } from '../../src/retry/policy'
import { backoffMs } from '../../src/retry/backoff'

describe('classifyError', () => {
  test('5xx & ECONNRESET → retry 3', () => {
    expect(classifyError({ status: 503 }).kind).toBe('retry')
    expect(classifyError({ status: 502 }).kind).toBe('retry')
    expect(classifyError({ code: 'ECONNRESET' }).kind).toBe('retry')
  })
  test('429 with retry-after → wait & retry', () => {
    const r = classifyError({ status: 429, retryAfterSec: 5 })
    expect(r.kind).toBe('retry')
    expect(r.waitMs).toBeGreaterThanOrEqual(5000)
  })
  test('429 daily quota → user', () => {
    expect(classifyError({ status: 429, scope: 'daily' }).kind).toBe('user')
  })
  test('400 / 401 / 403 → fail', () => {
    expect(classifyError({ status: 400 }).kind).toBe('fail')
    expect(classifyError({ status: 401 }).kind).toBe('fail')
    expect(classifyError({ status: 403 }).kind).toBe('fail')
  })
  test('408 stream → 1 retry, preserve partial', () => {
    const r = classifyError({ status: 408 })
    expect(r.kind).toBe('retry')
    expect(r.maxAttempts).toBe(1)
    expect(r.preservePartial).toBe(true)
  })
  test('safety refusal → fail with notify', () => {
    expect(classifyError({ status: 200, refusal: true }).kind).toBe('refused')
  })
})

describe('backoffMs', () => {
  test('exponential growth with jitter, capped', () => {
    const a = backoffMs(1, { baseMs: 1000, capMs: 30_000 })
    const b = backoffMs(2, { baseMs: 1000, capMs: 30_000 })
    const c = backoffMs(8, { baseMs: 1000, capMs: 30_000 })
    expect(a).toBeGreaterThanOrEqual(1000); expect(a).toBeLessThan(2000)
    expect(b).toBeGreaterThanOrEqual(2000); expect(b).toBeLessThan(4000)
    expect(c).toBeLessThanOrEqual(30_000)
  })
})

// P6-Fix-4 — pause-after-N-consecutive-failures
describe('pauseAfterN (P6-Fix-4)', () => {
  test('after 3 consecutive failures the next wait is at least 30s', async () => {
    const { computeNextWait } = await import('../../src/retry/policy')
    // attempts 1, 2, 3 → normal backoff; attempt 4 → 30 000 ms floor
    expect(computeNextWait({ attempt: 1, consecutiveFailures: 1, baseWait: 100 })).toBe(100)
    expect(computeNextWait({ attempt: 2, consecutiveFailures: 2, baseWait: 200 })).toBe(200)
    expect(computeNextWait({ attempt: 3, consecutiveFailures: 3, baseWait: 400 })).toBe(400)
    // 4th attempt with 3 prior failures still standing — floor at 30s
    expect(computeNextWait({ attempt: 4, consecutiveFailures: 3, baseWait: 800 })).toBeGreaterThanOrEqual(30_000)
    expect(computeNextWait({ attempt: 5, consecutiveFailures: 4, baseWait: 800 })).toBeGreaterThanOrEqual(30_000)
  })

  test('counter resets after a successful event', async () => {
    const { computeNextWait } = await import('../../src/retry/policy')
    expect(computeNextWait({ attempt: 5, consecutiveFailures: 0, baseWait: 800 })).toBe(800)
  })
})
```

- [ ] **Step 2: Implement policy**

`packages/llm-router/src/retry/policy.ts`:
```ts
export interface ErrorInfo {
  status?: number
  code?: string
  scope?: 'daily' | 'monthly' | 'concurrent'
  retryAfterSec?: number
  refusal?: boolean
  message?: string
}

export type ErrorAction =
  | { kind: 'retry'; maxAttempts: number; waitMs?: number; preservePartial?: boolean; reason: string }
  | { kind: 'user';  reason: string }                            // ask user (quota, 4th retry, etc.)
  | { kind: 'fail';  reason: string }                            // surface error to caller
  | { kind: 'refused'; reason: string }                          // safety refusal — notify, no retry

const NETWORK_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'ENETUNREACH', 'EPIPE'])

export function classifyError(e: ErrorInfo): ErrorAction {
  if (e.refusal) return { kind: 'refused', reason: 'safety refusal' }

  // Network-level
  if (e.code && NETWORK_CODES.has(e.code)) {
    return { kind: 'retry', maxAttempts: 3, reason: `network:${e.code}` }
  }

  // HTTP
  const s = e.status
  if (s === 429) {
    if (e.scope === 'daily' || e.scope === 'monthly') return { kind: 'user', reason: `quota:${e.scope}` }
    const waitMs = (e.retryAfterSec ?? 1) * 1000
    return { kind: 'retry', maxAttempts: 99, waitMs, reason: 'concurrent-limit' }
  }
  if (s === 503) return { kind: 'retry', maxAttempts: 3, reason: 'overloaded' }
  if (s === 502 || s === 504) return { kind: 'retry', maxAttempts: 3, reason: 'gateway' }
  if (s === 500) return { kind: 'retry', maxAttempts: 3, reason: '5xx' }
  if (s === 408) return { kind: 'retry', maxAttempts: 1, preservePartial: true, reason: 'stream-timeout' }
  if (s === 400) return { kind: 'fail', reason: '400 invalid request' }
  if (s === 401) return { kind: 'fail', reason: '401 unauthorized' }
  if (s === 403) return { kind: 'fail', reason: '403 forbidden' }

  return { kind: 'fail', reason: e.message ?? 'unknown' }
}

/**
 * P6-Fix-4: caller-side throttle. The caller (LLMService.runWithRetry) keeps
 * a running count of consecutive failures and a per-attempt baseline wait
 * (typically `backoffMs(attempt, opts)` or `action.waitMs`). After the 3rd
 * consecutive failure, the next wait is floored to 30 000 ms to give a
 * flapping upstream room to breathe.
 */
export const PAUSE_AFTER_N_FAILURES = 3
export const PAUSE_FLOOR_MS = 30_000

export function computeNextWait(input: {
  attempt: number
  consecutiveFailures: number
  baseWait: number
}): number {
  if (input.consecutiveFailures >= PAUSE_AFTER_N_FAILURES) {
    return Math.max(input.baseWait, PAUSE_FLOOR_MS)
  }
  return input.baseWait
}
```

- [ ] **Step 3: Implement backoff**

`packages/llm-router/src/retry/backoff.ts`:
```ts
export interface BackoffOpts { baseMs: number; capMs: number }

/**
 * Decorrelated exponential backoff with full jitter: base * 2^(attempt-1) ± jitter, capped.
 * attempt is 1-indexed.
 */
export function backoffMs(attempt: number, opts: BackoffOpts): number {
  const exp = opts.baseMs * Math.pow(2, attempt - 1)
  const capped = Math.min(exp, opts.capMs)
  const jitter = Math.random() * (capped * 0.25)
  return Math.min(capped + jitter, opts.capMs)
}

export const DEFAULT_BACKOFF: BackoffOpts = { baseMs: 1000, capMs: 30_000 }
export const OVERLOAD_BACKOFF: BackoffOpts = { baseMs: 5000, capMs: 60_000 }
```

- [ ] **Step 4: Run — PASS**

```bash
pnpm vitest run packages/llm-router/test/unit/retry.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/llm-router
git commit -m "feat(llm-router): retry policy classifier + decorrelated exponential backoff"
```

---

## Task 9: Quota tracker + rate-limit headers

**Files:**
- Create: `packages/llm-router/src/quota/pools.ts`
- Create: `packages/llm-router/src/quota/rate-headers.ts`
- Create: `packages/llm-router/src/quota/quota-repo.ts`
- Create: `packages/llm-router/src/quota/quota-tracker.ts`
- Test: `packages/llm-router/test/unit/quota.test.ts`

- [ ] **Step 1: Pool constants**

`packages/llm-router/src/quota/pools.ts`:
```ts
import type { QuotaPool } from '@glm/shared'

export type Tier = 'lite' | 'pro' | 'max'

export interface PoolDef {
  pool: QuotaPool
  // Coding plan limits per tier (from spec §10.4 + §9.12)
  daily?: number      // requests/day for coding
  monthly?: number    // requests/month for web
  visionHoursPerDay?: number   // for vision pool
}

export const POOL_LIMITS: Record<Tier, Record<QuotaPool, PoolDef>> = {
  lite: {
    coding: { pool: 'coding', daily: 1_000 },          // representative; real values come from z.ai
    web:    { pool: 'web',    monthly: 100 },
    vision: { pool: 'vision', visionHoursPerDay: 5 }
  },
  pro: {
    coding: { pool: 'coding', daily: 5_000 },
    web:    { pool: 'web',    monthly: 1_000 },
    vision: { pool: 'vision', visionHoursPerDay: 5 }
  },
  max: {
    coding: { pool: 'coding', daily: 15_000 },
    web:    { pool: 'web',    monthly: 4_000 },
    vision: { pool: 'vision', visionHoursPerDay: 5 }
  }
}
```

- [ ] **Step 2: Rate header parser**

`packages/llm-router/src/quota/rate-headers.ts`:
```ts
export interface RateInfo {
  limit?: number
  remaining?: number
  resetAt?: string      // ISO
  retryAfterSec?: number
  scope?: 'concurrent' | 'daily' | 'monthly'
}

/**
 * Parses generic X-RateLimit-* / Retry-After headers. z.ai uses the Anthropic-style
 * `anthropic-ratelimit-requests-*` set for the Anthropic endpoint; OpenAI mode uses
 * the OpenAI-style `x-ratelimit-*`.
 */
export function parseRateHeaders(h: Headers | Record<string, string>): RateInfo {
  const get = (k: string): string | undefined => {
    if (h instanceof Headers) return h.get(k) ?? undefined
    return h[k] ?? h[k.toLowerCase()]
  }
  const out: RateInfo = {}
  const limit = num(get('anthropic-ratelimit-requests-limit') ?? get('x-ratelimit-limit-requests'))
  const remaining = num(get('anthropic-ratelimit-requests-remaining') ?? get('x-ratelimit-remaining-requests'))
  const reset = get('anthropic-ratelimit-requests-reset') ?? get('x-ratelimit-reset-requests')
  const retryAfter = num(get('retry-after'))
  if (limit !== undefined) out.limit = limit
  if (remaining !== undefined) out.remaining = remaining
  if (reset) out.resetAt = reset
  if (retryAfter !== undefined) out.retryAfterSec = retryAfter
  return out
}

function num(v: string | undefined): number | undefined {
  if (v === undefined) return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}
```

- [ ] **Step 3: Quota repo + tracker test**

`packages/llm-router/test/unit/quota.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { openDb, runMigrationsForDb } from '@glm/core'
import { QuotaRepo } from '../../src/quota/quota-repo'
import { QuotaTracker } from '../../src/quota/quota-tracker'

let tmp: string
beforeEach(() => { tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-quota-')) })
afterEach(()  => rmSync(tmp, { recursive: true, force: true }))

// P6-Fix-2: quota.db has its own migration sequence (`quota-migrations/`).
function openQuotaDb(p: string) {
  const db = openDb(p)
  runMigrationsForDb(db, 'quota-migrations')
  return db
}

describe('QuotaTracker', () => {
  test('record + summary computes daily totals', () => {
    const db = openQuotaDb(path.join(tmp, 'quota.db'))
    const repo = new QuotaRepo(db)
    const t = new QuotaTracker(repo, 'lite')
    t.record({ pool: 'coding', model: 'GLM-5.1', requests: 1, inputTok: 100, outputTok: 50 })
    t.record({ pool: 'coding', model: 'GLM-5.1', requests: 1, inputTok: 200, outputTok: 80 })
    const s = t.summary('coding')
    expect(s.daily.requests).toBe(2)
    expect(s.daily.inputTokens).toBe(300)
    expect(s.daily.outputTokens).toBe(130)
    expect(s.limit).toBeDefined()
    db.close()
  })

  test('willOverflow blocks new fan-out at 95%+', () => {
    const db = openQuotaDb(path.join(tmp, 'quota.db'))
    const repo = new QuotaRepo(db)
    const t = new QuotaTracker(repo, 'lite', { codingDailyOverride: 100 })
    for (let i = 0; i < 96; i++) t.record({ pool: 'coding', model: 'GLM-5.1', requests: 1, inputTok: 0, outputTok: 0 })
    expect(t.guard('coding').level).toBe('red')
    expect(t.guard('coding').blockNewFanout).toBe(true)
  })

  test('warning level between 80% and 95%', () => {
    const db = openQuotaDb(path.join(tmp, 'quota.db'))
    const repo = new QuotaRepo(db)
    const t = new QuotaTracker(repo, 'lite', { codingDailyOverride: 100 })
    for (let i = 0; i < 85; i++) t.record({ pool: 'coding', model: 'GLM-5.1', requests: 1, inputTok: 0, outputTok: 0 })
    expect(t.guard('coding').level).toBe('yellow')
    expect(t.guard('coding').limitFanoutDepth).toBe(1)
  })
})
```

- [ ] **Step 4: Implement quota repo**

`packages/llm-router/src/quota/quota-repo.ts`:
```ts
import type { Database } from 'better-sqlite3'
import type { QuotaPool } from '@glm/shared'

export interface UsageInput {
  pool: QuotaPool
  model?: string
  tool?: string
  requests?: number
  inputTok?: number
  outputTok?: number
  visionSec?: number
}

export interface DailyTotals {
  requests: number
  inputTokens: number
  outputTokens: number
  visionSeconds: number
}

export class QuotaRepo {
  constructor(private db: Database) {}

  insert(u: UsageInput): void {
    this.db.prepare(`
      INSERT INTO quota_usage(ts, pool, model, tool, requests, input_tok, output_tok, vision_sec)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      new Date().toISOString(),
      u.pool,
      u.model ?? null,
      u.tool ?? null,
      u.requests ?? 0,
      u.inputTok ?? 0,
      u.outputTok ?? 0,
      u.visionSec ?? 0
    )
  }

  daily(pool: QuotaPool, todayIso: string): DailyTotals {
    const r = this.db.prepare(`
      SELECT
        COALESCE(SUM(requests), 0)   AS req,
        COALESCE(SUM(input_tok), 0)  AS in_tok,
        COALESCE(SUM(output_tok), 0) AS out_tok,
        COALESCE(SUM(vision_sec), 0) AS vis
      FROM quota_usage
      WHERE pool = ? AND ts >= ?
    `).get(pool, todayIso) as { req: number; in_tok: number; out_tok: number; vis: number }
    return { requests: r.req, inputTokens: r.in_tok, outputTokens: r.out_tok, visionSeconds: r.vis }
  }

  monthly(pool: QuotaPool, monthIso: string): DailyTotals {
    return this.daily(pool, monthIso)   // same shape, different floor
  }

  upsertPool(pool: QuotaPool, tier: string, limits: { daily?: number; monthly?: number }, refreshAt?: string): void {
    const now = new Date().toISOString()
    this.db.prepare(`
      INSERT INTO quota_pools(pool, tier, daily_limit, monthly_limit, refresh_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(pool) DO UPDATE SET
        tier = excluded.tier,
        daily_limit = excluded.daily_limit,
        monthly_limit = excluded.monthly_limit,
        refresh_at = excluded.refresh_at,
        updated_at = excluded.updated_at
    `).run(pool, tier, limits.daily ?? null, limits.monthly ?? null, refreshAt ?? null, now)
  }
}
```

- [ ] **Step 5: Implement QuotaTracker**

`packages/llm-router/src/quota/quota-tracker.ts`:
```ts
import type { QuotaPool } from '@glm/shared'
import type { QuotaRepo, UsageInput, DailyTotals } from './quota-repo'
import { POOL_LIMITS, type Tier } from './pools'

export interface GuardDecision {
  level: 'green' | 'yellow' | 'red'
  percentUsed: number
  blockNewFanout: boolean
  limitFanoutDepth?: number
  reason?: string
}

export interface QuotaSummary {
  pool: QuotaPool
  tier: Tier
  daily: DailyTotals
  limit?: number
  percentUsed?: number
  refreshAt?: string
}

export interface TrackerOpts {
  codingDailyOverride?: number      // test seam
  monthFloorIso?: string            // test seam
}

function startOfTodayIso(): string {
  const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d.toISOString()
}
function startOfMonthIso(): string {
  const d = new Date(); d.setUTCDate(1); d.setUTCHours(0,0,0,0); return d.toISOString()
}

export class QuotaTracker {
  /**
   * P6-Fix-2: when constructed with a fresh `quotaDb`, the tracker is responsible
   * for making sure the quota.db schema is up-to-date. The daemon-side factory
   * (Task 14) builds `quotaDb` and calls `runMigrationsForDb(quotaDb, 'quota-migrations')`
   * BEFORE handing it to `new QuotaRepo(quotaDb)` and then `new QuotaTracker(repo, …)`.
   * Tests use the same pattern (see Task 9 Step 3).
   */
  constructor(private repo: QuotaRepo, private tier: Tier = 'lite', private opts: TrackerOpts = {}) {}

  record(u: UsageInput): void { this.repo.insert(u) }

  summary(pool: QuotaPool): QuotaSummary {
    const def = POOL_LIMITS[this.tier][pool]
    const isMonthly = !!def.monthly
    const floor = isMonthly ? (this.opts.monthFloorIso ?? startOfMonthIso()) : startOfTodayIso()
    const daily = isMonthly ? this.repo.monthly(pool, floor) : this.repo.daily(pool, floor)
    const limit = isMonthly ? def.monthly : (this.opts.codingDailyOverride ?? def.daily)
    const used = isMonthly ? daily.requests : daily.requests
    const percentUsed = limit ? Math.min(100, Math.round((used / limit) * 100)) : undefined
    return { pool, tier: this.tier, daily, limit, percentUsed }
  }

  guard(pool: QuotaPool): GuardDecision {
    const s = this.summary(pool)
    if (s.percentUsed === undefined) return { level: 'green', percentUsed: 0, blockNewFanout: false }
    if (s.percentUsed >= 95) return { level: 'red', percentUsed: s.percentUsed, blockNewFanout: true, reason: '≥95%' }
    if (s.percentUsed >= 80) return { level: 'yellow', percentUsed: s.percentUsed, blockNewFanout: false, limitFanoutDepth: 1, reason: '≥80%' }
    return { level: 'green', percentUsed: s.percentUsed, blockNewFanout: false }
  }
}
```

- [ ] **Step 6: Run — PASS**

```bash
pnpm vitest run packages/llm-router/test/unit/quota.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add packages/llm-router
git commit -m "feat(llm-router): quota tracker (3 pools) + rate-header parser + thresholds"
```

---

## Task 10: LLMProvider interface + GLM Anthropic provider

**Files:**
- Create: `packages/llm-router/src/provider/provider.ts`
- Create: `packages/llm-router/src/provider/glm-anthropic.ts`
- Create: `packages/llm-router/src/provider/token-count.ts`
- Test: integration test deferred to Task 13 (uses mock server)

- [ ] **Step 1: Define the interface**

`packages/llm-router/src/provider/provider.ts`:
```ts
import type { LLMEndpoint } from '@glm/shared'
import type { IRRequest, IREvent } from '../ir/types'

export interface ProviderCapabilities {
  streaming: boolean
  promptCaching: boolean
  thinking: boolean
  toolUse: boolean
  visionInput: boolean
}

export interface CallOpts {
  signal?: AbortSignal
  timeoutMs?: number
  onHeaders?: (h: Headers) => void
  apiKey: string
  baseUrl?: string                // override
}

export interface TokenCount { inputTokens: number }

export interface LLMProvider {
  endpoint: LLMEndpoint
  capabilities: ProviderCapabilities
  call(req: IRRequest, opts: CallOpts): AsyncIterable<IREvent>
  countTokens(req: IRRequest): Promise<TokenCount>
}
```

- [ ] **Step 2: Token-count heuristic**

`packages/llm-router/src/provider/token-count.ts`:
```ts
import type { IRRequest } from '../ir/types'

/**
 * Cheap local estimator: 4 chars/token approx (good enough for budget HUD).
 * Server-side accurate count comes back in `usage.input_tokens` after the call.
 */
export function estimateTokens(req: IRRequest): { inputTokens: number } {
  const seg = (s: string): number => Math.ceil((s?.length ?? 0) / 4)
  let total = 0
  for (const b of req.system) total += b.type === 'text' ? seg(b.text) : 0
  for (const m of req.messages) {
    for (const b of m.content) {
      if (b.type === 'text') total += seg(b.text)
      else if (b.type === 'thinking') total += seg(b.text)
      else if (b.type === 'tool_use') total += seg(JSON.stringify(b.input))
      else if (b.type === 'tool_result') total += seg(b.content)
    }
  }
  return { inputTokens: total }
}
```

- [ ] **Step 3: Implement GLMAnthropicProvider**

`packages/llm-router/src/provider/glm-anthropic.ts`:
```ts
import { request } from 'undici'
import type { LLMProvider, ProviderCapabilities, CallOpts, TokenCount } from './provider'
import type { IRRequest, IREvent } from '../ir/types'
import { irToAnthropic } from '../ir/to-anthropic'
import { parseAnthropicStream } from '../stream/anthropic-parser'
import { readSSE } from '../stream/sse'
import { endpointBaseUrl } from './endpoint-map'
import { estimateTokens } from './token-count'

export class GLMAnthropicProvider implements LLMProvider {
  readonly endpoint = 'anthropic' as const
  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    promptCaching: true,
    thinking: true,
    toolUse: true,
    visionInput: true
  }

  async *call(req: IRRequest, opts: CallOpts): AsyncIterable<IREvent> {
    const base = opts.baseUrl ?? endpointBaseUrl('anthropic')
    const wire = irToAnthropic(req)
    const url  = `${base}/v1/messages`

    const res = await request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'x-api-key': opts.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'prompt-caching-2024-07-31'
      },
      body: JSON.stringify(wire),
      signal: opts.signal,
      bodyTimeout: opts.timeoutMs ?? 600_000,
      headersTimeout: opts.timeoutMs ?? 30_000
    })

    if (opts.onHeaders) opts.onHeaders(new Headers(res.headers as Record<string, string>))

    if (res.statusCode >= 400) {
      let body = ''
      for await (const chunk of res.body) body += chunk.toString('utf8')
      const err: any = new Error(`anthropic HTTP ${res.statusCode}: ${body}`)
      err.status = res.statusCode
      err.responseBody = body
      err.headers = res.headers
      throw err
    }

    yield* parseAnthropicStream(readSSE(res.body, opts.signal))
  }

  async countTokens(req: IRRequest): Promise<TokenCount> {
    return estimateTokens(req)
  }
}
```

- [ ] **Step 4: Build to verify wiring**

```bash
pnpm build
```

Expected: clean build. Integration test for this provider runs in Task 13 against the mock server (no real network).

- [ ] **Step 5: Commit**

```bash
git add packages/llm-router
git commit -m "feat(llm-router): LLMProvider interface + GLMAnthropicProvider (undici + SSE + prompt caching beta header)"
```

---

## Task 11: GLM OpenAI provider

**Files:**
- Create: `packages/llm-router/src/provider/glm-openai.ts`

- [ ] **Step 1: Implement GLMOpenAIProvider**

`packages/llm-router/src/provider/glm-openai.ts`:
```ts
import { request } from 'undici'
import type { LLMProvider, ProviderCapabilities, CallOpts, TokenCount } from './provider'
import type { IRRequest, IREvent } from '../ir/types'
import { irToOpenAI } from '../ir/to-openai'
import { parseOpenAIStream } from '../stream/openai-parser'
import { readSSE } from '../stream/sse'
import { endpointBaseUrl } from './endpoint-map'
import { estimateTokens } from './token-count'

export class GLMOpenAIProvider implements LLMProvider {
  readonly endpoint = 'openai' as const
  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    promptCaching: false,        // GLM OpenAI-compat path does not honor cache_control
    thinking: false,
    toolUse: true,
    visionInput: false
  }

  async *call(req: IRRequest, opts: CallOpts): AsyncIterable<IREvent> {
    const base = opts.baseUrl ?? endpointBaseUrl('openai')
    const wire = irToOpenAI(req)
    const url  = `${base}/v1/chat/completions`

    const res = await request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'Authorization': `Bearer ${opts.apiKey}`
      },
      body: JSON.stringify(wire),
      signal: opts.signal,
      bodyTimeout: opts.timeoutMs ?? 600_000,
      headersTimeout: opts.timeoutMs ?? 30_000
    })

    if (opts.onHeaders) opts.onHeaders(new Headers(res.headers as Record<string, string>))

    if (res.statusCode >= 400) {
      let body = ''
      for await (const chunk of res.body) body += chunk.toString('utf8')
      const err: any = new Error(`openai HTTP ${res.statusCode}: ${body}`)
      err.status = res.statusCode
      err.responseBody = body
      err.headers = res.headers
      throw err
    }

    yield* parseOpenAIStream(readSSE(res.body, opts.signal))
  }

  async countTokens(req: IRRequest): Promise<TokenCount> {
    return estimateTokens(req)
  }
}
```

- [ ] **Step 2: Add provider barrel**

`packages/llm-router/src/provider/index.ts`:
```ts
export * from './provider'
export * from './endpoint-map'
export { GLMAnthropicProvider } from './glm-anthropic'
export { GLMOpenAIProvider } from './glm-openai'
```

- [ ] **Step 3: Build**

```bash
pnpm build
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add packages/llm-router
git commit -m "feat(llm-router): GLMOpenAIProvider (Bearer auth, /v1/chat/completions, no cache_control)"
```

---

## Task 12: LLMService — cache → quota guard → call → retry → coalesce

**Files:**
- Create: `packages/llm-router/src/service/cancellation.ts`
- Create: `packages/llm-router/src/service/call-context.ts`
- Create: `packages/llm-router/src/service/llm-service.ts`
- Modify: `packages/llm-router/src/index.ts` (export public API)
- Test: `packages/llm-router/test/unit/service.test.ts` (using a stub provider)

- [ ] **Step 1: Stub provider helper + service test**

`packages/llm-router/test/unit/service.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { openDb, runMigrations, runMigrationsForDb } from '@glm/core'
import { LLMService } from '../../src/service/llm-service'
import { IdempotencyCache } from '../../src/cache/idempotency-cache'
import { QuotaRepo, QuotaTracker } from '../../src/quota/quota-tracker'
import type { LLMProvider } from '../../src/provider/provider'
import type { IRRequest, IREvent } from '../../src/ir/types'

function stubProvider(scriptedEvents: IREvent[], opts: { failOnce?: { status: number } } = {}): LLMProvider {
  let calls = 0
  return {
    endpoint: 'anthropic',
    capabilities: { streaming: true, promptCaching: true, thinking: false, toolUse: true, visionInput: false },
    async *call() {
      calls++
      if (opts.failOnce && calls === 1) {
        const e: any = new Error('fail'); e.status = opts.failOnce.status; throw e
      }
      for (const e of scriptedEvents) yield e
    },
    async countTokens() { return { inputTokens: 0 } }
  }
}

let tmp: string
beforeEach(() => { tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-svc-')) })
afterEach(() => rmSync(tmp, { recursive: true, force: true }))

// P6-Fix-2: session.db hosts llm_cache; quota.db hosts quota tables.
function openSessionAndQuota() {
  const session = openDb(path.join(tmp, 's.db'));   runMigrations(session)
  const quota   = openDb(path.join(tmp, 'q.db'));   runMigrationsForDb(quota, 'quota-migrations')
  return { session, quota }
}

describe('LLMService', () => {
  test('cache hit serves second identical call from cache (provider called once)', async () => {
    const { session, quota } = openSessionAndQuota()
    let calls = 0
    const provider: LLMProvider = {
      endpoint: 'anthropic',
      capabilities: { streaming: true, promptCaching: true, thinking: false, toolUse: true, visionInput: false },
      async *call() {
        calls++
        yield { type: 'message_start', messageId: 'm1', model: 'GLM-5.1' }
        yield { type: 'text_delta', text: 'hi' }
        yield { type: 'message_stop', stopReason: 'end_turn' }
        yield { type: 'usage', usage: { inputTokens: 5, outputTokens: 1 } }
      },
      async countTokens() { return { inputTokens: 0 } }
    }
    const svc = new LLMService({
      provider, cache: new IdempotencyCache(session),
      quota: new QuotaTracker(new QuotaRepo(quota)),
      apiKey: 'x', role: 'executor'
    })
    const req: IRRequest = { model: 'GLM-5.1', system: [], messages: [{ role: 'user', content: [{ type: 'text', text: 'q' }] }] }
    const r1 = await collectAll(svc.run(req))
    const r2 = await collectAll(svc.run(req))
    expect(calls).toBe(1)
    expect(r2.cached).toBe(true)
    expect(r1.text).toBe('hi')
    expect(r2.text).toBe('hi')
    session.close(); quota.close()
  })

  test('retries on 503 and succeeds on second attempt', async () => {
    const { session, quota } = openSessionAndQuota()
    const p = stubProvider(
      [
        { type: 'message_start', messageId: 'm', model: 'GLM-5.1' },
        { type: 'text_delta', text: 'ok' },
        { type: 'message_stop', stopReason: 'end_turn' },
        { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } }
      ],
      { failOnce: { status: 503 } }
    )
    const svc = new LLMService({
      provider: p, cache: new IdempotencyCache(session),
      quota: new QuotaTracker(new QuotaRepo(quota)),
      apiKey: 'x', role: 'executor',
      backoffOverride: { baseMs: 1, capMs: 10 }     // make test fast
    })
    const req: IRRequest = { model: 'GLM-5.1', system: [], messages: [{ role: 'user', content: [{ type: 'text', text: 'q' }] }] }
    const r = await collectAll(svc.run(req))
    expect(r.text).toBe('ok')
    session.close(); quota.close()
  })

  test('401 fails immediately (no retry)', async () => {
    const { session, quota } = openSessionAndQuota()
    const p: LLMProvider = {
      endpoint: 'anthropic',
      capabilities: { streaming: true, promptCaching: true, thinking: false, toolUse: true, visionInput: false },
      async *call() { const e: any = new Error('unauth'); e.status = 401; throw e },
      async countTokens() { return { inputTokens: 0 } }
    }
    const svc = new LLMService({
      provider: p, cache: new IdempotencyCache(session),
      quota: new QuotaTracker(new QuotaRepo(quota)),
      apiKey: 'bad', role: 'executor'
    })
    const req: IRRequest = { model: 'GLM-5.1', system: [], messages: [{ role: 'user', content: [{ type: 'text', text: 'q' }] }] }
    await expect(collectAll(svc.run(req))).rejects.toThrow(/401/)
    session.close(); quota.close()
  })

  test('cancel mid-stream commits partial buffer', async () => {
    const { session, quota } = openSessionAndQuota()
    const p: LLMProvider = {
      endpoint: 'anthropic',
      capabilities: { streaming: true, promptCaching: true, thinking: false, toolUse: true, visionInput: false },
      async *call(_req, opts) {
        yield { type: 'message_start', messageId: 'm', model: 'GLM-5.1' }
        yield { type: 'text_delta', text: 'partial' }
        await new Promise(r => setTimeout(r, 1))
        if (opts.signal?.aborted) return
        yield { type: 'text_delta', text: ' more' }
        yield { type: 'message_stop', stopReason: 'end_turn' }
      },
      async countTokens() { return { inputTokens: 0 } }
    }
    const svc = new LLMService({
      provider: p, cache: new IdempotencyCache(session),
      quota: new QuotaTracker(new QuotaRepo(quota)),
      apiKey: 'x', role: 'executor'
    })
    const req: IRRequest = { model: 'GLM-5.1', system: [], messages: [{ role: 'user', content: [{ type: 'text', text: 'q' }] }] }
    const handle = svc.run(req)
    const events: IREvent[] = []
    let cancelled = false
    setTimeout(() => { handle.cancel(); cancelled = true }, 0)
    for await (const e of handle.events) {
      events.push(e)
      if (events.length === 2) handle.cancel()
    }
    expect(events.find(e => e.type === 'text_delta')).toBeTruthy()
    expect(handle.partial?.text).toBe('partial')
    session.close(); quota.close()
  })
})

async function collectAll(handle: { events: AsyncIterable<IREvent>; cached?: boolean }): Promise<{ text: string; cached: boolean }> {
  let text = ''
  for await (const e of handle.events) if (e.type === 'text_delta') text += e.text
  return { text, cached: handle.cached ?? false }
}
```

- [ ] **Step 2: Cancellation helper**

`packages/llm-router/src/service/cancellation.ts`:
```ts
export class CancellationToken {
  private controller = new AbortController()
  get signal(): AbortSignal { return this.controller.signal }
  cancel(reason?: string): void { this.controller.abort(reason) }
  get aborted(): boolean { return this.controller.signal.aborted }
}
```

- [ ] **Step 3: Call context (mutable per-call state)**

`packages/llm-router/src/service/call-context.ts`:
```ts
import type { IRBlock } from '../ir/types'

export interface PartialBuffer {
  text: string
  thinking: string
  tools: Map<string, { name: string; args: string }>
  blocks: () => IRBlock[]
}

export function newPartialBuffer(): PartialBuffer {
  const text = { v: '' }
  const thinking = { v: '' }
  const tools = new Map<string, { name: string; args: string }>()
  return {
    get text()     { return text.v },
    set text(v)    { text.v = v },
    get thinking() { return thinking.v },
    set thinking(v){ thinking.v = v },
    tools,
    blocks(): IRBlock[] {
      const out: IRBlock[] = []
      if (thinking.v) out.push({ type: 'thinking', text: thinking.v })
      if (text.v)     out.push({ type: 'text', text: text.v })
      for (const [id, t] of tools.entries()) {
        let parsed: unknown = {}
        try { parsed = JSON.parse(t.args || '{}') } catch { /* keep */ }
        out.push({ type: 'tool_use', id, name: t.name, input: parsed })
      }
      return out
    }
  }
}
```

- [ ] **Step 4: Implement LLMService**

`packages/llm-router/src/service/llm-service.ts`:
```ts
import { ulid } from '@glm/shared'
import type { LLMProvider, CallOpts } from '../provider/provider'
import type { IdempotencyCache } from '../cache/idempotency-cache'
import type { QuotaTracker } from '../quota/quota-tracker'
import type { IRRequest, IREvent, IRBlock } from '../ir/types'
import { cacheKey } from '../cache/key'
import { classifyError, computeNextWait } from '../retry/policy'
import { backoffMs, DEFAULT_BACKOFF, OVERLOAD_BACKOFF, type BackoffOpts } from '../retry/backoff'
import { parseRateHeaders } from '../quota/rate-headers'
import { newPartialBuffer, type PartialBuffer } from './call-context'
import { CancellationToken } from './cancellation'

export interface LLMServiceOpts {
  provider: LLMProvider
  cache: IdempotencyCache
  quota: QuotaTracker
  apiKey: string
  baseUrl?: string
  role: string                      // for cache key
  backoffOverride?: BackoffOpts     // test seam
  maxAttempts?: number              // default 3
}

export interface RunHandle {
  streamId: string
  events: AsyncIterable<IREvent>
  cancel: () => void
  cached: boolean
  partial?: { text: string; blocks: IRBlock[] }
}

export class LLMService {
  constructor(private opts: LLMServiceOpts) {}

  run(req: IRRequest): RunHandle {
    const streamId = ulid()
    const token = new CancellationToken()
    const key = cacheKey(this.opts.role, req)

    // Cache hit short-circuits everything
    const hit = this.opts.cache.get(key)
    if (hit) {
      const events = this.replayCacheHit(hit.responseJson, hit.model)
      return { streamId, cancel: () => token.cancel(), cached: true, events }
    }

    // Quota guard
    const guard = this.opts.quota.guard('coding')
    if (guard.blockNewFanout) {
      const err = `quota:${guard.reason ?? 'red'}`
      return {
        streamId,
        cancel: () => token.cancel(),
        cached: false,
        events: (async function*(): AsyncIterable<IREvent> {
          yield { type: 'error', code: 'quota_exhausted', message: err, retryable: false }
        })()
      }
    }

    const partial = newPartialBuffer()
    const out: RunHandle = {
      streamId,
      cancel: () => token.cancel(),
      cached: false,
      get partial() { return { text: partial.text, blocks: partial.blocks() } },
      events: this.runWithRetry(req, key, token, partial)
    }
    return out
  }

  private async *replayCacheHit(responseJson: string, model: string): AsyncIterable<IREvent> {
    const r = JSON.parse(responseJson) as { content: IRBlock[]; stopReason: 'end_turn'|'tool_use'|'max_tokens'|'stop_sequence'; usage: { inputTokens: number; outputTokens: number } }
    yield { type: 'message_start', messageId: 'cached-' + ulid(), model: model as any }
    for (const b of r.content) {
      if (b.type === 'text') yield { type: 'text_delta', text: b.text }
      else if (b.type === 'thinking') yield { type: 'thinking_delta', text: b.text }
      else if (b.type === 'tool_use') {
        yield { type: 'tool_use_start', id: b.id, name: b.name }
        yield { type: 'tool_use_input_delta', id: b.id, partialJson: JSON.stringify(b.input ?? {}) }
        yield { type: 'tool_use_stop', id: b.id }
      }
    }
    yield { type: 'message_stop', stopReason: r.stopReason }
    yield { type: 'usage', usage: r.usage }
  }

  private async *runWithRetry(
    req: IRRequest, key: string, token: CancellationToken, partial: PartialBuffer
  ): AsyncIterable<IREvent> {
    const maxAttempts = this.opts.maxAttempts ?? 3
    let attempt = 0
    let consecutiveFailures = 0   // P6-Fix-4
    while (true) {
      attempt++
      try {
        const callOpts: CallOpts = {
          signal: token.signal,
          apiKey: this.opts.apiKey,
          baseUrl: this.opts.baseUrl,
          onHeaders: (h) => {
            const rate = parseRateHeaders(h)
            void rate    // recorded later via record(); kept for guard refinement
          }
        }
        let usageEvent: Extract<IREvent, { type: 'usage' }> | undefined
        let receivedAnyEvent = false
        for await (const e of this.opts.provider.call(req, callOpts)) {
          // P6-Fix-4: a successful event resets the consecutive-failure counter.
          if (!receivedAnyEvent) { consecutiveFailures = 0; receivedAnyEvent = true }
          if (token.aborted) {
            yield { type: 'message_stop', stopReason: 'cancelled' }
            this.persistOnCancel(req, key, partial, usageEvent)
            return
          }
          this.absorbIntoPartial(e, partial)
          if (e.type === 'usage') usageEvent = e
          yield e
        }

        // Success path — commit to cache
        this.commitSuccess(req, key, partial, usageEvent)
        return
      } catch (err: any) {
        consecutiveFailures++   // P6-Fix-4
        const status = err?.status as number | undefined
        const headers = err?.headers as Record<string, string> | undefined
        const rate = headers ? parseRateHeaders(headers) : { retryAfterSec: undefined as number | undefined, scope: undefined as 'daily'|'monthly'|undefined }
        const action = classifyError({ status, retryAfterSec: rate.retryAfterSec, scope: rate.scope })
        if (action.kind === 'retry' && attempt < Math.min(maxAttempts, action.maxAttempts)) {
          const opts = (status === 503 ? OVERLOAD_BACKOFF : (this.opts.backoffOverride ?? DEFAULT_BACKOFF))
          const baseWait = action.waitMs ?? backoffMs(attempt, opts)
          // P6-Fix-4: after 3 consecutive failures, floor the wait to 30s.
          const wait = computeNextWait({ attempt, consecutiveFailures, baseWait })
          await new Promise(r => setTimeout(r, wait))
          continue
        }
        yield { type: 'error', code: action.kind, message: err?.message ?? String(err), retryable: action.kind === 'retry' }
        return
      }
    }
  }

  private absorbIntoPartial(e: IREvent, partial: PartialBuffer): void {
    switch (e.type) {
      case 'text_delta':            partial.text += e.text; break
      case 'thinking_delta':        partial.thinking += e.text; break
      case 'tool_use_start':        partial.tools.set(e.id, { name: e.name, args: '' }); break
      case 'tool_use_input_delta': {
        const t = partial.tools.get(e.id); if (t) t.args += e.partialJson
        break
      }
    }
  }

  private commitSuccess(
    req: IRRequest, key: string, partial: PartialBuffer,
    usage: Extract<IREvent, { type: 'usage' }> | undefined
  ): void {
    const responseJson = JSON.stringify({
      content: partial.blocks(),
      stopReason: 'end_turn',
      usage: usage?.usage ?? { inputTokens: 0, outputTokens: 0 }
    })
    this.opts.cache.put(key, {
      model: req.model,
      endpoint: this.opts.provider.endpoint,
      requestJson: JSON.stringify(req),
      responseJson,
      usageInput: usage?.usage.inputTokens ?? 0,
      usageOutput: usage?.usage.outputTokens ?? 0
    })
    this.opts.quota.record({
      pool: 'coding',
      model: req.model,
      requests: 1,
      inputTok: usage?.usage.inputTokens ?? 0,
      outputTok: usage?.usage.outputTokens ?? 0
    })
  }

  private persistOnCancel(
    req: IRRequest, key: string, partial: PartialBuffer,
    usage: Extract<IREvent, { type: 'usage' }> | undefined
  ): void {
    // Partial responses still occupy tokens — record what we saw and DO NOT cache
    // (semantic identity is "complete response"; partials don't qualify).
    this.opts.quota.record({
      pool: 'coding',
      model: req.model,
      requests: 1,
      inputTok: usage?.usage.inputTokens ?? 0,
      outputTok: usage?.usage.outputTokens ?? 0
    })
    void key
  }

  /**
   * P6-Fix-3 — `complete()`: streaming-consumer convenience.
   *
   * Internally consumes `run()` and concatenates text deltas into a single
   * string. Returns both the text and the final `LLMUsage` (input/output
   * tokens, with cache fields where available).
   *
   * Consumers:
   *   - P7 Compactor (joins summary deltas)
   *   - P8 Orchestrator's `callLLM` adapter
   *   - P10 long-horizon distillation
   *
   * Errors in the underlying stream throw with the upstream code/message —
   * caller catches and decides whether to fall back / retry the surrounding
   * workflow. The `usage` field is still populated if any usage event arrived
   * before the error.
   */
  async complete(messages: ShortMessage[], opts: CompleteOpts): Promise<{ text: string; usage: LLMUsage }> {
    const req = this.buildRequest(messages, opts)
    const handle = this.run(req)
    let text = ''
    let usage: LLMUsage = { inputTokens: 0, outputTokens: 0 }
    for await (const evt of handle.events) {
      if (evt.type === 'text_delta') text += evt.text
      else if (evt.type === 'usage') usage = evt.usage
      else if (evt.type === 'error') throw new Error(`${evt.code}: ${evt.message}`)
    }
    return { text, usage }
  }

  /**
   * P6-Fix-3 helper — translate the convenience `ShortMessage[]` + `CompleteOpts`
   * shape into an internal `IRRequest`. Kept private so callers go through
   * `complete()` (or pass IR directly to `run()`).
   */
  private buildRequest(messages: ShortMessage[], opts: CompleteOpts): IRRequest {
    const system: IRBlock[] = []
    const irMessages: IRMessage[] = []
    for (const m of messages) {
      if (m.role === 'system') system.push({ type: 'text', text: m.content })
      else irMessages.push({ role: m.role, content: [{ type: 'text', text: m.content }] })
    }
    return {
      model: opts.model,
      system,
      messages: irMessages,
      maxOutputTokens: opts.maxOutputTokens,
      temperature: opts.temperature,
      topP: opts.topP,
      stopSequences: opts.stopSequences,
      metadata: opts.metadata
    }
  }
}
```

`ShortMessage` / `CompleteOpts` / `LLMUsage` are the cross-package types added in Task 1 Step 3 (`packages/shared/src/llm-router-types.ts` — P6-Fix-5). Distinct from provider-level `CallOpts` (apiKey/signal/onHeaders/etc.). Add at the top of `llm-service.ts`:

```ts
import type {
  ShortMessage,
  CompleteOpts,
  LLMUsage
} from '@glm/shared'
import type { IRMessage } from '../ir/types'
```

- [ ] **Step 4b: Unit test for `complete()` (P6-Fix-3)**

Append to `packages/llm-router/test/unit/service.test.ts`:

```ts
describe('LLMService.complete (P6-Fix-3)', () => {
  test('joins 3 text deltas into a single string and returns usage', async () => {
    const { session, quota } = openSessionAndQuota()
    const provider: LLMProvider = {
      endpoint: 'anthropic',
      capabilities: { streaming: true, promptCaching: true, thinking: false, toolUse: true, visionInput: false },
      async *call() {
        yield { type: 'message_start', messageId: 'm', model: 'GLM-5.1' }
        yield { type: 'text_delta', text: 'hello ' }
        yield { type: 'text_delta', text: 'world' }
        yield { type: 'text_delta', text: '!' }
        yield { type: 'message_stop', stopReason: 'end_turn' }
        yield { type: 'usage', usage: { inputTokens: 7, outputTokens: 3 } }
      },
      async countTokens() { return { inputTokens: 0 } }
    }
    const svc = new LLMService({
      provider, cache: new IdempotencyCache(session),
      quota: new QuotaTracker(new QuotaRepo(quota)),
      apiKey: 'x', role: 'executor'
    })
    const r = await svc.complete(
      [{ role: 'user', content: 'hi' }],
      { model: 'GLM-5.1', maxOutputTokens: 64 }
    )
    expect(r.text).toBe('hello world!')
    expect(r.usage.outputTokens).toBe(3)
    session.close(); quota.close()
  })

  test('propagates upstream error events as thrown errors', async () => {
    const { session, quota } = openSessionAndQuota()
    const provider: LLMProvider = {
      endpoint: 'anthropic',
      capabilities: { streaming: true, promptCaching: true, thinking: false, toolUse: true, visionInput: false },
      async *call() {
        yield { type: 'error', code: 'upstream', message: 'boom', retryable: false }
      },
      async countTokens() { return { inputTokens: 0 } }
    }
    const svc = new LLMService({
      provider, cache: new IdempotencyCache(session),
      quota: new QuotaTracker(new QuotaRepo(quota)),
      apiKey: 'x', role: 'executor'
    })
    await expect(svc.complete(
      [{ role: 'user', content: 'hi' }],
      { model: 'GLM-5.1' }
    )).rejects.toThrow(/upstream: boom/)
    session.close(); quota.close()
  })
})
```

The integration test against the mock z.ai server (Task 13) adds a corresponding end-to-end assertion: `svc.complete(...).text` equals the canned response text.

- [ ] **Step 5: Public API barrel**

`packages/llm-router/src/index.ts`:
```ts
export * from './ir/types'
export { irToAnthropic } from './ir/to-anthropic'
export { anthropicToIRResponse } from './ir/from-anthropic'
export { irToOpenAI } from './ir/to-openai'
export { openaiToIRResponse } from './ir/from-openai'
export { stableHash } from './ir/hash'
export { cacheKey } from './cache/key'
export { IdempotencyCache } from './cache/idempotency-cache'
export { GLMAnthropicProvider } from './provider/glm-anthropic'
export { GLMOpenAIProvider } from './provider/glm-openai'
export { preferredEndpoint, endpointBaseUrl, CONCURRENCY } from './provider/endpoint-map'
export type { LLMProvider, ProviderCapabilities, CallOpts, TokenCount } from './provider/provider'
export { resolveCredentials } from './credentials/resolver'
export { listProfiles, setActiveProfile, getProfile } from './credentials/profile'
export { QuotaRepo } from './quota/quota-repo'
export { QuotaTracker } from './quota/quota-tracker'
export { POOL_LIMITS } from './quota/pools'
export { classifyError } from './retry/policy'
export { backoffMs, DEFAULT_BACKOFF, OVERLOAD_BACKOFF } from './retry/backoff'
export { LLMService } from './service/llm-service'
export type { RunHandle, LLMServiceOpts } from './service/llm-service'
// P6-Fix-3: re-export the convenience-call types so consumers don't have to
// reach into @glm/shared themselves.
export type { ShortMessage, CompleteOpts, LLMUsage } from '@glm/shared'
export { CancellationToken } from './service/cancellation'
```

- [ ] **Step 6: Run service tests — PASS**

```bash
pnpm build
pnpm vitest run packages/llm-router/test/unit/service.test.ts
```

Expected: 4 passed (cache hit, retry-on-503, no-retry-on-401, cancel-preserves-partial).

- [ ] **Step 7: Commit**

```bash
git add packages/llm-router
git commit -m "feat(llm-router): LLMService orchestrator (cache → quota → call → retry → coalesce → commit)"
```

---

## Task 13: Mock z.ai server + provider integration tests

**Files:**
- Create: `packages/llm-router/test/fixtures/mock-zai-server.ts`
- Create: `packages/llm-router/test/fixtures/anthropic-stream.ts`
- Create: `packages/llm-router/test/fixtures/openai-stream.ts`
- Create: `packages/llm-router/test/integration/anthropic-provider.test.ts`
- Create: `packages/llm-router/test/integration/openai-provider.test.ts`

- [ ] **Step 1: Mock server**

`packages/llm-router/test/fixtures/mock-zai-server.ts`:
```ts
import { createServer, type Server } from 'node:http'
import { anthropicCannedStream } from './anthropic-stream'
import { openaiCannedStream } from './openai-stream'

export interface MockOpts {
  port?: number
  failNTimesWith?: { count: number; status: number; body?: string; headers?: Record<string, string> }
  anthropicSequence?: 'text' | 'tool_use' | 'with_thinking'
  openaiSequence?: 'text' | 'tool_use'
}

export interface MockHandle {
  server: Server
  port: number
  baseUrl: string
  failuresLeft: number
  requestsReceived: number
  close: () => Promise<void>
}

export function startMockZai(opts: MockOpts = {}): Promise<MockHandle> {
  let failuresLeft = opts.failNTimesWith?.count ?? 0
  let requestsReceived = 0

  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      requestsReceived++
      const url = req.url ?? ''

      if (failuresLeft > 0) {
        failuresLeft--
        const f = opts.failNTimesWith!
        res.writeHead(f.status, f.headers ?? {})
        res.end(f.body ?? `error ${f.status}`)
        return
      }

      if (url.startsWith('/api/anthropic/v1/messages')) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'anthropic-ratelimit-requests-limit': '15000',
          'anthropic-ratelimit-requests-remaining': '14999',
          'anthropic-ratelimit-requests-reset': new Date(Date.now()+3600_000).toISOString()
        })
        for (const frame of anthropicCannedStream(opts.anthropicSequence ?? 'text')) res.write(frame)
        res.end()
        return
      }

      if (url.startsWith('/api/coding/v1/chat/completions')) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'x-ratelimit-limit-requests': '15000',
          'x-ratelimit-remaining-requests': '14999'
        })
        for (const frame of openaiCannedStream(opts.openaiSequence ?? 'text')) res.write(frame)
        res.end()
        return
      }

      res.writeHead(404); res.end('not found')
    })

    server.listen(opts.port ?? 0, () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') throw new Error('no server address')
      const port = addr.port
      resolve({
        server, port,
        baseUrl: `http://127.0.0.1:${port}`,
        get failuresLeft() { return failuresLeft },
        get requestsReceived() { return requestsReceived },
        close: () => new Promise<void>((r) => server.close(() => r()))
      } as MockHandle)
    })
  })
}
```

- [ ] **Step 2: Anthropic canned SSE**

`packages/llm-router/test/fixtures/anthropic-stream.ts`:
```ts
function frame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

export function anthropicCannedStream(kind: 'text' | 'tool_use' | 'with_thinking'): string[] {
  const out: string[] = []
  out.push(frame('message_start', { type: 'message_start', message: { id: 'msg_mock', model: 'GLM-5.1', usage: { input_tokens: 10, output_tokens: 0 } } }))

  if (kind === 'with_thinking') {
    out.push(frame('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } }))
    out.push(frame('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'reasoning...' } }))
    out.push(frame('content_block_stop', { type: 'content_block_stop', index: 0 }))
  }

  const textIdx = kind === 'with_thinking' ? 1 : 0
  out.push(frame('content_block_start', { type: 'content_block_start', index: textIdx, content_block: { type: 'text', text: '' } }))
  out.push(frame('content_block_delta', { type: 'content_block_delta', index: textIdx, delta: { type: 'text_delta', text: 'Hello' } }))
  out.push(frame('content_block_delta', { type: 'content_block_delta', index: textIdx, delta: { type: 'text_delta', text: ' world' } }))
  out.push(frame('content_block_stop', { type: 'content_block_stop', index: textIdx }))

  if (kind === 'tool_use') {
    out.push(frame('content_block_start', { type: 'content_block_start', index: textIdx + 1, content_block: { type: 'tool_use', id: 'tu_mock', name: 'Read', input: {} } }))
    out.push(frame('content_block_delta', { type: 'content_block_delta', index: textIdx + 1, delta: { type: 'input_json_delta', partial_json: '{"path":"/x"}' } }))
    out.push(frame('content_block_stop', { type: 'content_block_stop', index: textIdx + 1 }))
    out.push(frame('message_delta', { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 6 } }))
  } else {
    out.push(frame('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 2 } }))
  }
  out.push(frame('message_stop', { type: 'message_stop' }))
  return out
}
```

- [ ] **Step 3: OpenAI canned SSE**

`packages/llm-router/test/fixtures/openai-stream.ts`:
```ts
function chunk(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`
}

export function openaiCannedStream(kind: 'text' | 'tool_use'): string[] {
  const out: string[] = []
  out.push(chunk({ id: 'cmpl_mock', model: 'GLM-4.5-Air', choices: [{ index: 0, delta: { role: 'assistant' } }] }))
  out.push(chunk({ id: 'cmpl_mock', model: 'GLM-4.5-Air', choices: [{ index: 0, delta: { content: 'Hello' } }] }))
  out.push(chunk({ id: 'cmpl_mock', model: 'GLM-4.5-Air', choices: [{ index: 0, delta: { content: ' world' } }] }))

  if (kind === 'tool_use') {
    out.push(chunk({ id: 'cmpl_mock', model: 'GLM-4.5-Air', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call_mock', type: 'function', function: { name: 'Read', arguments: '' } }] } }] }))
    out.push(chunk({ id: 'cmpl_mock', model: 'GLM-4.5-Air', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '{"path":"/x"}' } }] } }] }))
    out.push(chunk({ id: 'cmpl_mock', model: 'GLM-4.5-Air', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 4, completion_tokens: 5 } }))
  } else {
    out.push(chunk({ id: 'cmpl_mock', model: 'GLM-4.5-Air', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 2 } }))
  }
  out.push('data: [DONE]\n\n')
  return out
}
```

- [ ] **Step 4: Anthropic provider integration test**

`packages/llm-router/test/integration/anthropic-provider.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { GLMAnthropicProvider } from '../../src/provider/glm-anthropic'
import { startMockZai, type MockHandle } from '../fixtures/mock-zai-server'
import type { IRRequest, IREvent } from '../../src/ir/types'

let mock: MockHandle
beforeEach(async () => { mock = await startMockZai() })
afterEach(async () => { await mock.close() })

describe('GLMAnthropicProvider (integration)', () => {
  test('streams text from mock z.ai server', async () => {
    const p = new GLMAnthropicProvider()
    const req: IRRequest = {
      model: 'GLM-5.1',
      system: [{ type: 'text', text: 'helpful', cacheControl: 'ephemeral' }],
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }]
    }
    const events: IREvent[] = []
    let receivedHeaders: Headers | undefined
    for await (const e of p.call(req, {
      apiKey: 'test', baseUrl: `${mock.baseUrl}/api/anthropic`,
      onHeaders: (h) => { receivedHeaders = h }
    })) events.push(e)
    expect(events.filter(e => e.type === 'text_delta').map(e => (e as any).text).join('')).toBe('Hello world')
    expect(events.find(e => e.type === 'usage')).toBeDefined()
    expect(receivedHeaders?.get('anthropic-ratelimit-requests-limit')).toBe('15000')
  })

  test('surfaces 401 as throwable', async () => {
    await mock.close()
    mock = await startMockZai({ failNTimesWith: { count: 1, status: 401, body: 'unauth' } })
    const p = new GLMAnthropicProvider()
    const req: IRRequest = { model: 'GLM-5.1', system: [], messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] }
    await expect(async () => {
      for await (const _ of p.call(req, { apiKey: 'bad', baseUrl: `${mock.baseUrl}/api/anthropic` })) void _
    }).rejects.toThrow(/401/)
  })
})
```

- [ ] **Step 5: OpenAI provider integration test**

`packages/llm-router/test/integration/openai-provider.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { GLMOpenAIProvider } from '../../src/provider/glm-openai'
import { startMockZai, type MockHandle } from '../fixtures/mock-zai-server'
import type { IRRequest, IREvent } from '../../src/ir/types'

let mock: MockHandle
beforeEach(async () => { mock = await startMockZai({ openaiSequence: 'tool_use' }) })
afterEach(async () => { await mock.close() })

describe('GLMOpenAIProvider (integration)', () => {
  test('streams text + tool_calls from mock z.ai server', async () => {
    const p = new GLMOpenAIProvider()
    const req: IRRequest = {
      model: 'GLM-4.5-Air',
      system: [{ type: 'text', text: 'sys' }],
      messages: [{ role: 'user', content: [{ type: 'text', text: 'use the tool' }] }],
      tools: [{ name: 'Read', description: 'read a file', inputSchema: { type: 'object', properties: { path: { type: 'string' } } } }]
    }
    const events: IREvent[] = []
    for await (const e of p.call(req, { apiKey: 'test', baseUrl: `${mock.baseUrl}/api/coding` })) events.push(e)
    expect(events.find(e => e.type === 'tool_use_start')).toMatchObject({ id: 'call_mock', name: 'Read' })
    expect(events.find(e => e.type === 'message_stop')).toMatchObject({ stopReason: 'tool_use' })
    expect(events.find(e => e.type === 'usage')).toMatchObject({ usage: { inputTokens: 4, outputTokens: 5 } })
  })
})
```

- [ ] **Step 5b: `LLMService.complete()` integration test against mock z.ai (P6-Fix-3)**

`packages/llm-router/test/integration/complete-method.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { openDb, runMigrations, runMigrationsForDb } from '@glm/core'
import {
  LLMService, GLMAnthropicProvider, IdempotencyCache,
  QuotaRepo, QuotaTracker
} from '../../src'
import { startMockZai, type MockHandle } from '../fixtures/mock-zai-server'

let mock: MockHandle
let tmp: string
beforeEach(async () => {
  mock = await startMockZai({ anthropicSequence: 'text' })
  tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-complete-'))
})
afterEach(async () => { await mock.close(); rmSync(tmp, { recursive: true, force: true }) })

describe('LLMService.complete (integration vs mock z.ai)', () => {
  test('returns full joined text + usage from a real streamed call', async () => {
    const session = openDb(path.join(tmp, 's.db')); runMigrations(session)
    const quota   = openDb(path.join(tmp, 'q.db')); runMigrationsForDb(quota, 'quota-migrations')
    const svc = new LLMService({
      provider: new GLMAnthropicProvider(),
      cache: new IdempotencyCache(session),
      quota: new QuotaTracker(new QuotaRepo(quota)),
      apiKey: 'test',
      baseUrl: `${mock.baseUrl}/api/anthropic`,
      role: 'executor'
    })
    const r = await svc.complete(
      [
        { role: 'system', content: 'helpful' },
        { role: 'user', content: 'hi' }
      ],
      { model: 'GLM-5.1', maxOutputTokens: 64 }
    )
    expect(r.text).toBe('Hello world')
    expect(r.usage.outputTokens).toBeGreaterThan(0)
    session.close(); quota.close()
  })
})
```

- [ ] **Step 6: Run integration tests — PASS**

```bash
pnpm build
pnpm vitest run packages/llm-router/test/integration/
```

Expected: Anthropic + OpenAI provider tests PLUS `complete-method` test all pass against the local mock server.

- [ ] **Step 7: Commit**

```bash
git add packages/llm-router
git commit -m "test(llm-router): mock z.ai server + provider + LLMService.complete integration tests (P6-Fix-3)"
```

---

## Task 14: Daemon RPC integration — `llm.call`, `llm.events`, `llm.cancel`; rewire `message.send`

> **P6-Fix-6 — no direct edit to `packages/core/src/daemon/daemon.ts`.** Per canonical decision §0.9, the LLM router subsystem hooks itself into the daemon at boot via `LoaderHub.registerSubsystem('llm-router', …)`. P1's `Daemon.start()` already calls `await LoaderHub.runAll(this)` once after `runMigrations(db)` — so this task only has to publish the registration module.

**Files:**
- Create: `packages/llm-router/src/rpc/methods.ts`
- Create: `packages/llm-router/src/rpc/events.ts`
- Create: `packages/llm-router/src/daemon-loader.ts` (P6-Fix-6 — LoaderHub registration)
- Modify: `packages/core/src/rpc/methods/chat.ts` (replace echo stub)
- Modify: `packages/core/package.json` (add `@glm/llm-router` dep)
- Modify: `packages/core/src/index.ts` (export `runMigrationsForDb` so callers + the LLM router can reach the new helper)

- [ ] **Step 1: Add core → llm-router workspace dep**

In `packages/core/package.json` `dependencies`:
```json
"@glm/llm-router": "workspace:*"
```

And `packages/core/tsconfig.json` `references`:
```json
{ "path": "../llm-router" }
```

```bash
pnpm install
```

- [ ] **Step 2: Notification framing for server → client push events**

`packages/llm-router/src/rpc/events.ts`:
```ts
import type { Socket } from 'node:net'
import type { IREvent } from '../ir/types'

/**
 * JSON-RPC 2.0 notification (no id). Topic includes the streamId so the client
 * can multiplex many concurrent `llm.call`s on one connection.
 */
export function pushLlmEvent(socket: Socket, streamId: string, event: IREvent): void {
  const frame = {
    jsonrpc: '2.0',
    method: 'llm.events',
    params: { streamId, event }
  }
  socket.write(JSON.stringify(frame) + '\n')
}
```

- [ ] **Step 3: RPC methods**

`packages/llm-router/src/rpc/methods.ts`:
```ts
import { z } from 'zod'
import type { Socket } from 'node:net'
import type { LLMService, RunHandle } from '../service/llm-service'
import type { IRRequest } from '../ir/types'
import { pushLlmEvent } from './events'

const IRRequestSchema: z.ZodSchema<IRRequest> = z.any() as any   // shape-validate elsewhere

const CallParams = z.object({ request: IRRequestSchema, role: z.string().optional() })
const CancelParams = z.object({ streamId: z.string() })

export interface LLMRpcDeps {
  service: LLMService
  registerStream: (streamId: string, handle: RunHandle, socket: Socket) => void
  cancelStream: (streamId: string) => boolean
}

export function makeLLMHandlers(deps: LLMRpcDeps): Record<string, (params: unknown, ctx: { socket: Socket }) => Promise<unknown>> {
  return {
    'llm.call': async (params, ctx) => {
      const parsed = CallParams.safeParse(params)
      if (!parsed.success) throw { code: -32602, message: 'Invalid params', data: parsed.error.flatten() }
      const handle = deps.service.run(parsed.data.request)
      deps.registerStream(handle.streamId, handle, ctx.socket)
      // Run the stream in the background and push events to the originating socket.
      ;(async () => {
        try {
          for await (const event of handle.events) pushLlmEvent(ctx.socket, handle.streamId, event)
        } catch (e) {
          pushLlmEvent(ctx.socket, handle.streamId, { type: 'error', code: 'stream_error', message: (e as Error).message, retryable: false })
        }
      })()
      return { streamId: handle.streamId, cached: handle.cached }
    },

    'llm.cancel': async (params) => {
      const parsed = CancelParams.safeParse(params)
      if (!parsed.success) throw { code: -32602, message: 'Invalid params', data: parsed.error.flatten() }
      const ok = deps.cancelStream(parsed.data.streamId)
      return { cancelled: ok }
    }
  }
}
```

- [ ] **Step 4: Register the LLM router subsystem via LoaderHub (P6-Fix-6)**

> **P6-Fix-6 — no direct edit to `packages/core/src/daemon/daemon.ts`.** This module registers itself at import time; importing it once (from `packages/llm-router/src/index.ts` at the bottom of the barrel) triggers `LoaderHub.registerSubsystem('llm-router', …)` which the daemon runs from `LoaderHub.runAll(this)` after migrations.

`packages/llm-router/src/daemon-loader.ts`:
```ts
import { LoaderHub } from '@glm/core/daemon/loader-hub'
import { openDb, runMigrations, runMigrationsForDb } from '@glm/core'
import {
  LLMService, GLMAnthropicProvider, GLMOpenAIProvider,
  preferredEndpoint, IdempotencyCache, QuotaRepo, QuotaTracker,
  resolveCredentials, type LLMProvider, type RunHandle
} from './index'
import { messageSend } from '@glm/core/rpc/methods/chat'

// Module-augmentation so `daemon.llmService`, `daemon.streams`, etc. type-check
// when later plans want to reach in.
declare module '@glm/core/daemon/daemon' {
  interface Daemon {
    llmServiceBuilder?: (model: string) => LLMService
  }
}

LoaderHub.registerSubsystem('llm-router', async (daemon) => {
  const cred = resolveCredentials({
    credentialsFile: daemon.paths.configFile.replace(/config\.json$/, 'credentials.json')
  })
  if (!cred.apiKey) {
    daemon.log.warn('no GLM credentials resolved; llm.call will return error events')
  }

  const defaultModel = (process.env.GLM_DEFAULT_MODEL as any) ?? 'GLM-5-Turbo'
  const providerAnth = new GLMAnthropicProvider()
  const providerOAI  = new GLMOpenAIProvider()
  const pickProvider = (model: string): LLMProvider =>
    preferredEndpoint(model as any) === 'anthropic' ? providerAnth : providerOAI

  // P6-Fix-2: quota.db is a separate file with its own migration sequence.
  const quotaDb = openDb(`${daemon.paths.root}/quota.db`)
  runMigrationsForDb(quotaDb, 'quota-migrations')

  const cache = new IdempotencyCache(daemon.db)  // session.db (003_llm_router → llm_cache)
  const quota = new QuotaTracker(new QuotaRepo(quotaDb), cred.tier ?? 'lite')

  const buildService = (model: string): LLMService => new LLMService({
    provider: pickProvider(model),
    cache, quota,
    apiKey: cred.apiKey ?? '',
    baseUrl: cred.baseUrlOverride,
    role: 'executor'
  })
  daemon.llmServiceBuilder = buildService

  const streams = new Map<string, { handle: RunHandle; socket: import('node:net').Socket }>()

  daemon.rpc.on('llm.call', async (params: any, ctx: any) => {
    const req = params?.request as { model?: string }
    const model = req?.model ?? defaultModel
    const handle = buildService(model).run(params.request)
    streams.set(handle.streamId, { handle, socket: ctx.socket })
    ;(async () => {
      try {
        for await (const event of handle.events) {
          const frame = JSON.stringify({ jsonrpc: '2.0', method: 'llm.events', params: { streamId: handle.streamId, event } }) + '\n'
          ctx.socket.write(frame)
        }
      } finally {
        streams.delete(handle.streamId)
      }
    })()
    return { streamId: handle.streamId, cached: handle.cached }
  })

  daemon.rpc.on('llm.cancel', async (params: any) => {
    const s = streams.get(params?.streamId)
    if (!s) return { cancelled: false }
    s.handle.cancel()
    return { cancelled: true }
  })

  // Rewire message.send to call default model (was: echo stub from P1)
  daemon.rpc.on('message.send', messageSend({ buildService, defaultModel }))

  // Ensure clean shutdown closes quota.db.
  daemon.onShutdown?.(() => { try { quotaDb.close() } catch { /* ignore */ } })
})
```

Then add ONE side-effect import to the package's public barrel so the registration runs as soon as `@glm/llm-router` is loaded:

```ts
// packages/llm-router/src/index.ts — at end of file
import './daemon-loader'   // side-effect: LoaderHub.registerSubsystem('llm-router', …)
```

Note on `RpcContext` carrying `socket`: P1 already exposes it on the context (per P1-Fix-5 — the daemon now uses LoaderHub.runAll and passes the full ctx). If P1 hasn't yet, this is a small surgical change documented in P1's plan:

In `packages/core/src/rpc/protocol.ts`:
```ts
import type { Socket } from 'node:net'
export interface RpcContext {
  clientId: string
  sessionId?: string
  socket?: Socket          // populated by RpcServer.attach
  log: import('../log').Logger
}
```

In `packages/core/src/rpc/server.ts` `attach()`:
```ts
const fullCtx: RpcContext = { ...ctx, log: this.log, socket }
```

That two-line edit is owned by P1 — P6 only depends on the type already existing.

- [ ] **Step 5: Rewrite `message.send`**

Replace contents of `packages/core/src/rpc/methods/chat.ts`:
```ts
import { z } from 'zod'
import type { RpcHandler } from '../protocol'
import { RPC_ERRORS } from '../protocol'
import type { LLMService } from '@glm/llm-router'

const SendParams = z.object({
  sessionId: z.string(),
  text: z.string(),
  model: z.string().optional()
})

export interface MessageSendDeps {
  buildService: (model: string) => LLMService
  defaultModel: string
}

export function messageSend(deps: MessageSendDeps): RpcHandler {
  return async (p, ctx) => {
    const parsed = SendParams.safeParse(p)
    if (!parsed.success) throw { ...RPC_ERRORS.INVALID_PARAMS, data: parsed.error.flatten() }
    const model = parsed.data.model ?? deps.defaultModel
    const svc = deps.buildService(model)
    const handle = svc.run({
      model: model as any,
      system: [],
      messages: [{ role: 'user', content: [{ type: 'text', text: parsed.data.text }] }],
      maxOutputTokens: 2048
    })
    // Consume the stream synchronously and return the concatenated text.
    // (Streaming variant is `llm.call` + `llm.events`.)
    let text = ''
    for await (const e of handle.events) {
      if (e.type === 'text_delta') text += e.text
      if (e.type === 'error') throw new Error(`${e.code}: ${e.message}`)
    }
    void ctx
    return {
      sessionId: parsed.data.sessionId,
      role: 'assistant',
      content: text,
      model,
      cached: handle.cached,
      ts: new Date().toISOString()
    }
  }
}
```

- [ ] **Step 6: Build**

```bash
pnpm build
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add packages/llm-router/src/daemon-loader.ts \
        packages/llm-router/src/rpc/methods.ts \
        packages/llm-router/src/rpc/events.ts \
        packages/llm-router/src/index.ts \
        packages/core/src/rpc/methods/chat.ts \
        packages/core/package.json \
        packages/core/src/index.ts
git commit -m "feat(llm-router): LoaderHub-registered llm.call/events/cancel + real message.send (P6-Fix-6)"
```

> Note: no `packages/core/src/daemon/daemon.ts` in this commit — the subsystem registers itself via `LoaderHub.registerSubsystem('llm-router', …)` (P6-Fix-6).

---

## Task 15: CLI subcommands — `glm models / quota / cache / profile`

**Files:**
- Create: `packages/cli/src/commands/models.ts`
- Create: `packages/cli/src/commands/quota.ts`
- Create: `packages/cli/src/commands/cache.ts`
- Create: `packages/cli/src/commands/profile.ts`
- Modify: `packages/cli/src/bin.ts` (register the 4 new commands; add `--profile` global)

- [ ] **Step 1: `glm models`**

`packages/cli/src/commands/models.ts`:
```ts
import { Command } from 'commander'
import kleur from 'kleur'
import { CONCURRENCY, preferredEndpoint } from '@glm/llm-router'
import type { LLMModel } from '@glm/shared'

const MODELS: LLMModel[] = [
  'GLM-5.1', 'GLM-5-Turbo', 'GLM-5', 'GLM-4.7', 'GLM-4.6',
  'GLM-4.5-Air', 'GLM-4.5-AirX', 'GLM-4.5'
]

export function registerModelsCommand(program: Command): void {
  program.command('models')
    .description('List supported models with endpoint + concurrency')
    .action(() => {
      console.log(kleur.bold('Model'.padEnd(16)) + kleur.bold('Endpoint'.padEnd(12)) + kleur.bold('Slots'))
      for (const m of MODELS) {
        const ep = preferredEndpoint(m)
        const conc = CONCURRENCY[m]
        console.log(`${m.padEnd(16)}${ep.padEnd(12)}${conc}`)
      }
    })
}
```

- [ ] **Step 2: `glm quota`**

`packages/cli/src/commands/quota.ts`:
```ts
import { Command } from 'commander'
import kleur from 'kleur'
import { resolvePaths } from '@glm/shared'
import { openDb, runMigrationsForDb } from '@glm/core'
import { QuotaRepo, QuotaTracker } from '@glm/llm-router'

export function registerQuotaCommand(program: Command): void {
  program.command('quota')
    .description('Show quota usage across pools (coding / web / vision)')
    .action(() => {
      const paths = resolvePaths()
      // P6-Fix-2: quota tables live in their own db (`quota.db`) with the
      // `quota-migrations/` sequence, not in registry.db / session.db.
      const db = openDb(`${paths.root}/quota.db`)
      runMigrationsForDb(db, 'quota-migrations')
      const t = new QuotaTracker(new QuotaRepo(db))   // tier inferred default lite; CLI doesn't need credentials
      for (const pool of ['coding', 'web', 'vision'] as const) {
        const s = t.summary(pool)
        const pct = s.percentUsed ?? 0
        const colour = pct >= 95 ? kleur.red : pct >= 80 ? kleur.yellow : kleur.green
        console.log(`${colour('●')} ${pool.padEnd(8)} ${s.daily.requests} req  ${s.daily.inputTokens} in / ${s.daily.outputTokens} out  (${s.limit ?? '—'} limit, ${pct}% used)`)
      }
      db.close()
    })
}
```

- [ ] **Step 3: `glm cache`**

`packages/cli/src/commands/cache.ts`:
```ts
import { Command } from 'commander'
import kleur from 'kleur'
import { resolvePaths } from '@glm/shared'
import { openDb, runMigrations } from '@glm/core'
import { IdempotencyCache } from '@glm/llm-router'

export function registerCacheCommand(program: Command): void {
  const cache = program.command('cache').description('LLM idempotency cache management')

  cache.command('stats')
    .description('Show cache entries / hits / token saves')
    .action(() => {
      const paths = resolvePaths()
      const db = openDb(`${paths.root}/registry.db`); runMigrations(db)
      const c = new IdempotencyCache(db)
      const s = c.stats()
      console.log(`entries:        ${s.entries}`)
      console.log(`total hits:     ${s.totalHits}`)
      console.log(`input tokens:   ${s.totalInputTokens}`)
      console.log(`output tokens:  ${s.totalOutputTokens}`)
      console.log(kleur.dim(`(token columns = saved on cache hits across all entries)`))
      db.close()
    })

  cache.command('clear')
    .description('Empty the LLM cache')
    .action(() => {
      const paths = resolvePaths()
      const db = openDb(`${paths.root}/registry.db`); runMigrations(db)
      const c = new IdempotencyCache(db)
      const n = c.clear()
      console.log(`${kleur.green('✓')} cleared ${n} cache entries`)
      db.close()
    })
}
```

- [ ] **Step 4: `glm profile`**

`packages/cli/src/commands/profile.ts`:
```ts
import { Command } from 'commander'
import kleur from 'kleur'
import { listProfiles, setActiveProfile } from '@glm/llm-router'

export function registerProfileCommand(program: Command): void {
  const profile = program.command('profile').description('Manage credential profiles')

  profile.command('list')
    .description('List configured profiles')
    .action(() => {
      const { active, profiles } = listProfiles()
      if (profiles.length === 0) {
        console.log(kleur.gray('(no profiles in ~/.glm/credentials.json)'))
        return
      }
      for (const p of profiles) {
        const mark = p.name === active ? kleur.green('●') : '○'
        console.log(`${mark} ${p.name}${p.tier ? kleur.dim(`  (${p.tier})`) : ''}`)
      }
    })

  profile.command('use <name>')
    .description('Set the default profile')
    .action((name: string) => {
      setActiveProfile(name)
      console.log(`${kleur.green('✓')} default profile = ${name}`)
    })
}
```

- [ ] **Step 5: Wire bin.ts**

In `packages/cli/src/bin.ts`, replace existing imports + registrations:
```ts
#!/usr/bin/env node
import { Command } from 'commander'
import { registerDaemonCommand } from './commands/daemon'
import { registerSessionsCommand } from './commands/sessions'
import { registerAttachCommand } from './commands/attach'
import { registerChatCommand } from './commands/chat'
import { registerDoctorCommand } from './commands/doctor'
import { registerModelsCommand } from './commands/models'
import { registerQuotaCommand } from './commands/quota'
import { registerCacheCommand } from './commands/cache'
import { registerProfileCommand } from './commands/profile'

const program = new Command()
program.name('glm').description('GLM coding agent CLI').version('0.1.0-alpha.1')
  .option('--profile <name>', 'use this credential profile for the current command')

registerDaemonCommand(program)
registerSessionsCommand(program)
registerAttachCommand(program)
registerChatCommand(program)
registerDoctorCommand(program)
registerModelsCommand(program)
registerQuotaCommand(program)
registerCacheCommand(program)
registerProfileCommand(program)

program.parseAsync(process.argv).catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
```

`--profile` is read by `auto-spawn` (passed via `GLM_PROFILE` env var to the daemon process), which the daemon's `resolveCredentials({ profile: process.env.GLM_PROFILE })` picks up. Add to `packages/cli/src/auto-spawn.ts`:
```ts
const profile = (program: typeof process)['env']['GLM_PROFILE']      // pseudo
// or read program.opts() before spawn and pass via env in spawn() opts.env
```

Practically: in `bin.ts`, before delegating to each command, do `if (program.opts().profile) process.env.GLM_PROFILE = program.opts().profile`. The auto-spawn step inherits `process.env` so the daemon child sees it.

Add this line right after `program.parseAsync` is called — or do it as a `program.hook('preAction')`:
```ts
program.hook('preAction', () => {
  const p = program.opts().profile as string | undefined
  if (p) process.env.GLM_PROFILE = p
})
```

- [ ] **Step 6: Build + manual smoke**

```bash
pnpm build
export GLM_HOME=/tmp/glm-p6-smoke-$$
rm -rf $GLM_HOME
node packages/cli/dist/bin.js daemon start
node packages/cli/dist/bin.js models
node packages/cli/dist/bin.js quota
node packages/cli/dist/bin.js cache stats
node packages/cli/dist/bin.js profile list
node packages/cli/dist/bin.js daemon stop
```

Expected:
- `models` prints 8 rows (5 anthropic + 3 openai)
- `quota` prints 3 pools, all 0
- `cache stats` shows 0 entries
- `profile list` shows `(no profiles ...)` (since file not seeded)

- [ ] **Step 7: Commit**

```bash
git add packages
git commit -m "feat(cli): glm models / quota / cache / profile subcommands + --profile global flag"
```

---

## Task 16: End-to-end integration test — daemon + mock z.ai + cache hit + cancel

**Files:**
- Create: `packages/core/test/integration/llm-router-e2e.test.ts`

- [ ] **Step 1: Write the e2e test**

`packages/core/test/integration/llm-router-e2e.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createConnection } from 'node:net'
import { setTimeout as wait } from 'node:timers/promises'
import { spawnDaemonProcess } from './_helper'
import { startMockZai, type MockHandle } from '../../../llm-router/test/fixtures/mock-zai-server'

interface SpawnedDaemonExt {
  socket: string
  shutdown: () => Promise<void>
}

let mock: MockHandle
let daemon: SpawnedDaemonExt
let home: string

beforeEach(async () => {
  home = mkdtempSync(path.join(os.tmpdir(), 'glm-e2e-'))
  // Seed credentials.json so daemon points at our mock and uses a fake key.
  const glm = path.join(home, '.glm')
  const fs = await import('node:fs')
  fs.mkdirSync(glm, { recursive: true })
  fs.writeFileSync(path.join(glm, 'credentials.json'), JSON.stringify({
    defaultProfile: 'default',
    profiles: { default: { apiKey: 'test-key', tier: 'lite' } }
  }))

  mock = await startMockZai({ anthropicSequence: 'text' })

  // We need the daemon to point at the mock URL. The provider honors `baseUrl`
  // from credentials.json (baseUrl field) — set it.
  fs.writeFileSync(path.join(glm, 'credentials.json'), JSON.stringify({
    defaultProfile: 'default',
    profiles: { default: { apiKey: 'test-key', tier: 'lite', baseUrl: `${mock.baseUrl}/api/anthropic` } }
  }))

  daemon = await spawnDaemonProcess({ home }) as any
})

afterEach(async () => {
  await daemon.shutdown()
  await mock.close()
  rmSync(home, { recursive: true, force: true })
})

async function rpc(socket: string, method: string, params?: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const s = createConnection(socket)
    let leftover = ''
    s.on('connect', () => s.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) + '\n'))
    s.on('data', (chunk) => {
      leftover += chunk.toString('utf8')
      let nl = leftover.indexOf('\n')
      while (nl >= 0) {
        const frame = leftover.slice(0, nl)
        leftover = leftover.slice(nl + 1)
        try {
          const msg = JSON.parse(frame) as { id?: number; method?: string; result?: unknown; error?: { message: string } }
          if (msg.id === 1) {
            if (msg.error) { s.end(); reject(new Error(msg.error.message)); return }
            s.end(); resolve(msg.result); return
          }
          // ignore notifications (llm.events) here
        } catch { /* partial frame, wait for more */ }
        nl = leftover.indexOf('\n')
      }
    })
    s.on('error', reject)
  })
}

describe('LLM Router end-to-end (daemon + mock z.ai)', () => {
  test('message.send returns real text via mock', async () => {
    const s = await rpc(daemon.socket, 'session.create', { cwd: '/tmp', initialTask: 'hi' }) as { id: string }
    const r = await rpc(daemon.socket, 'message.send', { sessionId: s.id, text: 'hi', model: 'GLM-5.1' }) as { content: string; cached: boolean }
    expect(r.content).toBe('Hello world')
    expect(r.cached).toBe(false)
    expect(mock.requestsReceived).toBe(1)
  })

  test('second identical call hits cache (mock not contacted again)', async () => {
    const s = await rpc(daemon.socket, 'session.create', { cwd: '/tmp', initialTask: 'hi' }) as { id: string }
    await rpc(daemon.socket, 'message.send', { sessionId: s.id, text: 'hi', model: 'GLM-5.1' })
    const before = mock.requestsReceived
    const r2 = await rpc(daemon.socket, 'message.send', { sessionId: s.id, text: 'hi', model: 'GLM-5.1' }) as { content: string; cached: boolean }
    expect(r2.content).toBe('Hello world')
    expect(r2.cached).toBe(true)
    expect(mock.requestsReceived).toBe(before)
  })

  test('llm.call streams events via llm.events notifications', async () => {
    const s = await rpc(daemon.socket, 'session.create', { cwd: '/tmp' }) as { id: string }

    const events: any[] = []
    const sock = createConnection(daemon.socket)
    let leftover = ''
    await new Promise<void>(r => sock.once('connect', () => r()))
    sock.write(JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'llm.call',
      params: { request: { model: 'GLM-5.1', system: [], messages: [{ role: 'user', content: [{ type: 'text', text: 'go' }] }] } }
    }) + '\n')

    await new Promise<void>((resolve) => {
      sock.on('data', (chunk) => {
        leftover += chunk.toString('utf8')
        let nl = leftover.indexOf('\n')
        while (nl >= 0) {
          const frame = leftover.slice(0, nl); leftover = leftover.slice(nl + 1)
          try {
            const m = JSON.parse(frame)
            if (m.method === 'llm.events') events.push(m.params.event)
            if (m.method === 'llm.events' && m.params.event.type === 'usage') { sock.end(); resolve(); return }
          } catch {/* */}
          nl = leftover.indexOf('\n')
        }
      })
    })

    const types = events.map(e => e.type)
    expect(types).toContain('message_start')
    expect(types).toContain('text_delta')
    expect(types).toContain('message_stop')
    expect(types).toContain('usage')
    void s
  })
})
```

- [ ] **Step 2: Build + run**

```bash
pnpm build
pnpm vitest run packages/core/test/integration/llm-router-e2e.test.ts
```

Expected: 3 passed (real-call, cache-hit, streaming-via-llm.events).

- [ ] **Step 3: Run full suite**

```bash
pnpm vitest run
```

Expected: all P1 tests still pass + all P6 unit (8 files) + integration (3 files) pass. ~50+ tests total.

- [ ] **Step 4: Coverage**

```bash
pnpm vitest run --coverage
```

Expected: `packages/llm-router/src/**` ≥ 80% line coverage (ir, cache, retry, quota, service ≥ 80%; provider integration covered by mock-server tests). Anything below threshold gets a targeted unit test before merge.

- [ ] **Step 5: Commit**

```bash
git add packages
git commit -m "test(llm-router): e2e daemon ↔ mock z.ai (message.send, cache hit, llm.call streaming)"
```

---

## Task 17: Action × Thinking Resolver + `model.*` RPC (P6-Fix-7 / P6-Fix-8 — spec §9.23)

> **P6-Fix-7 (FIX-MANIFEST §11.2):** Spec §9.23 introduces a 2-layer routing system: 7 user-facing **actions** (`default | smol | slow | plan | designer | commit | task`) × 7 **thinking levels** (`inherit | off | min | low | medium | high | xhigh`) × 20 internal **roles**. Vision is orthogonal — routed via the bundled `glm-vision` MCP (spec §9.12), not via actions. The router resolves (model, thinkingBudget) at every LLM call via a 5-tier priority chain. P2's `/model` picker (P2-Fix-5) talks to the new RPC handlers added here. P8's role frontmatter (P8-Fix-10) carries `action:` instead of `model:`/`thinking:` so this resolver becomes the canonical binder.
>
> **P6-Fix-8 folded in:** OpenAI-mode models (`GLM-4.5-Air`/`-AirX`) don't accept Anthropic-style `thinking.budget_tokens`; they take `reasoning_effort: 'low'|'medium'|'high'|'off'`. `applyThinking()` branches on `endpoint` and maps the 7-level scale to the 4-level OpenAI scale with a log warning on degradation.

**Files:**
- Create: `packages/llm-router/src/resolver/action-resolver.ts`
- Create: `packages/llm-router/src/resolver/thinking-budgets.ts`
- Create: `packages/llm-router/src/resolver/index.ts`
- Create: `packages/llm-router/src/rpc/model-methods.ts`
- Create: `packages/cli/src/commands/model.ts`
- Modify: `packages/llm-router/src/service/llm-service.ts` (accept `{ action, role }` opts in `complete()` and `run()`; call resolver before provider dispatch)
- Modify: `packages/llm-router/src/index.ts` (barrel-export `ActionResolver`, `THINKING_BUDGETS`, `applyThinking`)
- Modify: `packages/llm-router/src/daemon-loader.ts` (register `model.list / .set / .show / .reset` RPC handlers; instantiate resolver with settings reader)
- Modify: `packages/shared/src/llm-router-types.ts` (add `Action`, `ThinkingLevel`, `ActionConfig`, `AgentsConfig` zod schemas)
- Modify: `packages/core/src/settings/cascade.ts` (read `actions` + `agents` sections from `~/.glm/settings.json`; P1 owner — surgical addition)
- Modify: `packages/cli/src/bin.ts` (register `model` subcommand)
- Test: `packages/llm-router/test/unit/action-resolver.test.ts`
- Test: `packages/llm-router/test/unit/thinking-budgets.test.ts`
- Test: `packages/llm-router/test/integration/resolver-settings.test.ts`

- [ ] **Step 1: Extend shared types — `Action`, `ThinkingLevel`, `ActionConfig`, `AgentsConfig`**

Append to `packages/shared/src/llm-router-types.ts`:
```ts
// ---- Action × Thinking 2-layer routing (P6-Fix-7 / spec §9.23) ----
import { z } from 'zod'

// 7 actions (vision은 actions에 없음 — glm-vision MCP가 별도로 처리, 스펙 §9.12 참조)
export const ACTIONS = ['default','smol','slow','plan','designer','commit','task'] as const
export type Action = typeof ACTIONS[number]

export const THINKING_LEVELS = ['inherit','off','min','low','medium','high','xhigh'] as const
export type ThinkingLevel = typeof THINKING_LEVELS[number]

export const ActionConfigSchema = z.object({
  model: z.string().min(1),
  thinking: z.enum(THINKING_LEVELS),
})
export type ActionConfig = z.infer<typeof ActionConfigSchema>

export const ActionsConfigSchema = z.object({
  default:  ActionConfigSchema,
  smol:     ActionConfigSchema,
  slow:     ActionConfigSchema,
  plan:     ActionConfigSchema,
  designer: ActionConfigSchema,
  commit:   ActionConfigSchema,
  task:     ActionConfigSchema,
})
export type ActionsConfig = z.infer<typeof ActionsConfigSchema>

// Optional per-role override (settings.agents.<role>.{model, thinking}).
export const AgentOverrideSchema = z.object({
  model:    z.string().min(1).optional(),
  thinking: z.enum(THINKING_LEVELS).optional(),
})
export type AgentOverride = z.infer<typeof AgentOverrideSchema>

export const AgentsConfigSchema = z.record(z.string(), AgentOverrideSchema)
export type AgentsConfig = z.infer<typeof AgentsConfigSchema>

/** Canonical default `actions` block (spec §9.23 / FIX-MANIFEST §11.0.3). */
export const DEFAULT_ACTIONS: ActionsConfig = {
  default:  { model: 'GLM-5.1',     thinking: 'medium' },
  smol:     { model: 'GLM-5-Turbo', thinking: 'off'    },
  slow:     { model: 'GLM-5.1',     thinking: 'xhigh'  },
  plan:     { model: 'GLM-5.1',     thinking: 'high'   },
  designer: { model: 'GLM-5.1',     thinking: 'medium' },
  commit:   { model: 'GLM-5-Turbo', thinking: 'off'    },
  task:     { model: 'GLM-5.1',     thinking: 'low'    },
}
```

- [ ] **Step 2: Write failing unit test for THINKING_BUDGETS + applyThinking**

`packages/llm-router/test/unit/thinking-budgets.test.ts`:
```ts
import { describe, expect, test, vi } from 'vitest'
import { THINKING_BUDGETS, applyThinking } from '../../src/resolver/thinking-budgets'
import type { IRRequest } from '../../src/ir/types'

describe('THINKING_BUDGETS map (spec §9.23 / FIX-MANIFEST §11.0.4)', () => {
  test('exact token-budget mapping', () => {
    expect(THINKING_BUDGETS).toEqual({
      inherit: -1, off: 0, min: 512, low: 2048, medium: 8192, high: 32768, xhigh: 65536,
    })
  })
})

describe('applyThinking — Anthropic endpoint', () => {
  test('off → strips thinking field', () => {
    const req: IRRequest = { model: 'GLM-5.1', system: [], messages: [], thinking: { type: 'enabled', budget_tokens: 1000 } as any }
    const out = applyThinking(req, 'off', 'anthropic')
    expect(out.thinking).toBeUndefined()
  })
  test('medium → sets budget_tokens 8192', () => {
    const req: IRRequest = { model: 'GLM-5.1', system: [], messages: [] }
    const out = applyThinking(req, 'medium', 'anthropic')
    expect((out.thinking as any)?.budget_tokens).toBe(8192)
  })
  test('xhigh → sets budget_tokens 65536', () => {
    const req: IRRequest = { model: 'GLM-5.1', system: [], messages: [] }
    const out = applyThinking(req, 'xhigh', 'anthropic')
    expect((out.thinking as any)?.budget_tokens).toBe(65536)
  })
  test('inherit → leaves req unchanged (parent resolves it)', () => {
    const req: IRRequest = { model: 'GLM-5.1', system: [], messages: [] }
    const before = JSON.stringify(req)
    const out = applyThinking(req, 'inherit', 'anthropic')
    expect(JSON.stringify(out)).toBe(before)
  })
})

describe('applyThinking — OpenAI endpoint (P6-Fix-8 degradation)', () => {
  const warnFn = vi.fn()
  test('inherit/off → reasoning_effort: off (no warn)', () => {
    const req: IRRequest = { model: 'GLM-4.5-Air', system: [], messages: [] }
    const a = applyThinking(req, 'inherit', 'openai', { warn: warnFn })
    const b = applyThinking(req, 'off',     'openai', { warn: warnFn })
    expect((a as any).reasoning_effort).toBe('off')
    expect((b as any).reasoning_effort).toBe('off')
  })
  test('min/low → reasoning_effort: low (warn on min — degraded from 512 budget)', () => {
    warnFn.mockReset()
    const req: IRRequest = { model: 'GLM-4.5-Air', system: [], messages: [] }
    const a = applyThinking(req, 'min', 'openai', { warn: warnFn })
    const b = applyThinking(req, 'low', 'openai', { warn: warnFn })
    expect((a as any).reasoning_effort).toBe('low')
    expect((b as any).reasoning_effort).toBe('low')
    expect(warnFn).toHaveBeenCalled()       // min → 'low' is a degradation; warn fires at least once
  })
  test('medium → reasoning_effort: medium', () => {
    const req: IRRequest = { model: 'GLM-4.5-Air', system: [], messages: [] }
    const out = applyThinking(req, 'medium', 'openai', { warn: warnFn })
    expect((out as any).reasoning_effort).toBe('medium')
  })
  test('high → reasoning_effort: high', () => {
    const req: IRRequest = { model: 'GLM-4.5-Air', system: [], messages: [] }
    const out = applyThinking(req, 'high', 'openai', { warn: warnFn })
    expect((out as any).reasoning_effort).toBe('high')
  })
  test('xhigh → reasoning_effort: high (warn on degradation 65536 → high)', () => {
    warnFn.mockReset()
    const req: IRRequest = { model: 'GLM-4.5-Air', system: [], messages: [] }
    const out = applyThinking(req, 'xhigh', 'openai', { warn: warnFn })
    expect((out as any).reasoning_effort).toBe('high')
    expect(warnFn).toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Write failing unit test for ActionResolver (all 5 priority tiers)**

`packages/llm-router/test/unit/action-resolver.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { ActionResolver } from '../../src/resolver/action-resolver'
import { DEFAULT_ACTIONS, type ActionsConfig, type AgentsConfig } from '@glm/shared'

function mk(over: Partial<ActionsConfig> = {}, agents: AgentsConfig = {}) {
  const actions = { ...DEFAULT_ACTIONS, ...over }
  // Frontmatter table — 20 roles, role → action (FIX-MANIFEST §11.0.5)
  const roleActionMap: Record<string, string> = {
    orchestrator: 'slow', planner: 'plan', architect: 'plan',
    executor: 'default', verifier: 'default', critic: 'slow',
    'code-reviewer': 'slow', 'code-simplifier': 'smol', 'security-reviewer': 'slow',
    'test-engineer': 'default', 'qa-tester': 'smol', debugger: 'default',
    tracer: 'slow', explore: 'smol', analyst: 'slow', scientist: 'slow',
    designer: 'designer', 'document-specialist': 'smol', writer: 'smol', 'git-master': 'commit',
  }
  return new ActionResolver({ actions, agents, roleActionMap })
}

describe('ActionResolver — 5-tier resolution priority (FIX-MANIFEST §11.0.6)', () => {
  test('tier 5 (hardcoded default): unknown role + no overrides → action=default → GLM-5.1 medium', () => {
    const r = mk()
    const out = r.resolve({ role: 'unknown-role' })
    expect(out.action).toBe('default')
    expect(out.model).toBe('GLM-5.1')
    expect(out.thinking).toBe('medium')
  })

  test('tier 4 (role frontmatter): role=critic → action=slow → GLM-5.1 xhigh', () => {
    const r = mk()
    const out = r.resolve({ role: 'critic' })
    expect(out.action).toBe('slow')
    expect(out.model).toBe('GLM-5.1')
    expect(out.thinking).toBe('xhigh')
  })

  test('tier 3 (settings.actions override): user sets actions.slow.model=GLM-5 → critic now resolves to GLM-5', () => {
    const r = mk({ slow: { model: 'GLM-5', thinking: 'xhigh' } })
    const out = r.resolve({ role: 'critic' })
    expect(out.action).toBe('slow')
    expect(out.model).toBe('GLM-5')
    expect(out.thinking).toBe('xhigh')
  })

  test('tier 2 (settings.agents.<role>): per-role override beats action default', () => {
    const r = mk(
      { slow: { model: 'GLM-5', thinking: 'xhigh' } },
      { critic: { model: 'GLM-4.7', thinking: 'high' } },
    )
    const out = r.resolve({ role: 'critic' })
    expect(out.model).toBe('GLM-4.7')        // agents.critic wins
    expect(out.thinking).toBe('high')
  })

  test('tier 1 (call-time override): explicit { action, override } wins over everything', () => {
    const r = mk(
      { slow: { model: 'GLM-5', thinking: 'xhigh' } },
      { critic: { model: 'GLM-4.7', thinking: 'high' } },
    )
    const out = r.resolve({ role: 'critic', override: { model: 'GLM-4.6', thinking: 'low' } })
    expect(out.model).toBe('GLM-4.6')
    expect(out.thinking).toBe('low')
  })

  test('explicit action param picks the action regardless of role', () => {
    const r = mk()
    const out = r.resolve({ role: 'executor', action: 'commit' })
    expect(out.action).toBe('commit')
    expect(out.model).toBe('GLM-5-Turbo')
    expect(out.thinking).toBe('off')
  })

  test('agents override with only `model` (no `thinking`) inherits action thinking', () => {
    const r = mk({}, { critic: { model: 'GLM-4.7' } })   // only model overridden
    const out = r.resolve({ role: 'critic' })
    expect(out.model).toBe('GLM-4.7')
    expect(out.thinking).toBe('xhigh')                   // from actions.slow default
  })

  test('all 20 roles resolve to a valid (action, model, thinking) under default settings', () => {
    const r = mk()
    const ROLES = [
      'orchestrator','planner','architect','executor','verifier','critic','code-reviewer',
      'code-simplifier','security-reviewer','test-engineer','qa-tester','debugger','tracer',
      'explore','analyst','scientist','designer','document-specialist','writer','git-master',
    ]
    for (const role of ROLES) {
      const out = r.resolve({ role })
      expect(out.action).toBeTruthy()
      expect(out.model).toMatch(/^(GLM-|glm-)/)
      expect(['inherit','off','min','low','medium','high','xhigh']).toContain(out.thinking)
    }
  })
})
```

- [ ] **Step 4: Run — FAIL (modules missing)**

```bash
pnpm vitest run packages/llm-router/test/unit/thinking-budgets.test.ts packages/llm-router/test/unit/action-resolver.test.ts
```

Expected: FAIL.

- [ ] **Step 5: Implement THINKING_BUDGETS + applyThinking (P6-Fix-8 folded in)**

`packages/llm-router/src/resolver/thinking-budgets.ts`:
```ts
import type { IRRequest } from '../ir/types'
import type { ThinkingLevel, LLMEndpoint } from '@glm/shared'

/**
 * Token-budget map for Anthropic-mode `thinking.budget_tokens`.
 * Per spec §9.23 / FIX-MANIFEST §11.0.4. `inherit` is the sentinel for "ask the parent";
 * resolver returns the resolved level before applyThinking sees it, so callers should
 * never pass `inherit` through. We still map it (-1) so the table is total.
 */
export const THINKING_BUDGETS: Record<ThinkingLevel, number> = {
  inherit: -1,
  off:     0,
  min:     512,
  low:     2_048,
  medium:  8_192,
  high:    32_768,
  xhigh:   65_536,
}

/**
 * OpenAI-mode degradation (P6-Fix-8). GLM-4.5-Air / -AirX accept `reasoning_effort`
 * with 4 levels: 'off' | 'low' | 'medium' | 'high'. Map our 7 levels onto those:
 *   inherit / off    → 'off'
 *   min / low        → 'low'   (min is a degradation: 512 → low; warn)
 *   medium           → 'medium'
 *   high             → 'high'
 *   xhigh            → 'high'  (degradation: 65536 → high; warn)
 */
const OPENAI_MAP: Record<ThinkingLevel, 'off' | 'low' | 'medium' | 'high'> = {
  inherit: 'off',
  off:     'off',
  min:     'low',
  low:     'low',
  medium:  'medium',
  high:    'high',
  xhigh:   'high',
}

/** Levels for which OpenAI mapping is a strict degradation (warn the user). */
const OPENAI_DEGRADED = new Set<ThinkingLevel>(['min', 'xhigh'])

export interface ApplyThinkingOpts {
  warn?: (msg: string) => void
}

/**
 * Mutates a *copy* of `req` and returns it. Branches on `endpoint`:
 *   anthropic → sets `thinking.budget_tokens` (or strips it for off/inherit)
 *   openai    → sets `reasoning_effort` and logs a warn on degraded levels
 */
export function applyThinking(
  req: IRRequest,
  level: ThinkingLevel,
  endpoint: LLMEndpoint,
  opts: ApplyThinkingOpts = {},
): IRRequest {
  const next: IRRequest = { ...req }
  if (level === 'inherit') return next   // resolver should have resolved this already

  if (endpoint === 'anthropic') {
    if (level === 'off') {
      delete (next as any).thinking
    } else {
      ;(next as any).thinking = { type: 'enabled', budget_tokens: THINKING_BUDGETS[level] }
    }
    return next
  }

  // OpenAI mode (GLM-4.5-Air / -AirX)
  const mapped = OPENAI_MAP[level]
  ;(next as any).reasoning_effort = mapped
  if (OPENAI_DEGRADED.has(level)) {
    opts.warn?.(
      `[llm-router] thinking level "${level}" degraded to reasoning_effort="${mapped}" ` +
      `because model uses OpenAI endpoint (hybrid thinking not supported via Anthropic budget_tokens).`
    )
  }
  return next
}
```

- [ ] **Step 6: Implement `ActionResolver` (5-tier priority)**

`packages/llm-router/src/resolver/action-resolver.ts`:
```ts
import {
  ACTIONS, type Action, type ThinkingLevel, type ActionsConfig, type AgentsConfig,
  DEFAULT_ACTIONS,
} from '@glm/shared'

export interface ResolverInput {
  /** Internal role name (one of the 20 roles); optional only for ad-hoc callers. */
  role?: string
  /** Explicit action selector (e.g. `/route action=commit`); skips role frontmatter lookup. */
  action?: Action
  /** Call-time override (highest priority) — usually `/route GLM-X.Y` parsed args. */
  override?: { model?: string; thinking?: ThinkingLevel }
}

export interface ResolverOutput {
  action: Action
  model: string
  thinking: ThinkingLevel
}

export interface ActionResolverOpts {
  actions: ActionsConfig                       // current settings.actions
  agents: AgentsConfig                         // current settings.agents (may be empty)
  roleActionMap: Record<string, string>        // role → action (from P8 frontmatter)
}

/**
 * 5-tier resolution priority (FIX-MANIFEST §11.0.6):
 *   1) call-time `override` (e.g. /route GLM-4.7)
 *   2) settings.agents.<role>.{model, thinking}
 *   3) settings.actions.<action>.{model, thinking}
 *   4) role frontmatter action mapping (Layer B)
 *   5) hardcoded `default` action fallback
 */
export class ActionResolver {
  constructor(private opts: ActionResolverOpts) {}

  resolve(input: ResolverInput): ResolverOutput {
    // Tier 4 / 5 — pick action from explicit param, role frontmatter, or `default`.
    let action: Action
    if (input.action && (ACTIONS as readonly string[]).includes(input.action)) {
      action = input.action
    } else if (input.role && this.opts.roleActionMap[input.role]) {
      const candidate = this.opts.roleActionMap[input.role]!
      action = (ACTIONS as readonly string[]).includes(candidate) ? (candidate as Action) : 'default'
    } else {
      action = 'default'   // tier 5
    }

    // Tier 3 — settings.actions.<action> (canonical default lookup happens here)
    const actCfg = this.opts.actions[action] ?? DEFAULT_ACTIONS[action]

    // Tier 2 — settings.agents.<role>
    const agentOver = (input.role && this.opts.agents[input.role]) || undefined

    // Tier 1 — call-time override
    const override = input.override

    const model =
      override?.model ??
      agentOver?.model ??
      actCfg.model

    const thinking =
      override?.thinking ??
      agentOver?.thinking ??
      actCfg.thinking

    return { action, model, thinking }
  }

  /** Replace the live config (used by settings reloader on file watch). */
  update(opts: Partial<ActionResolverOpts>): void {
    if (opts.actions) this.opts.actions = opts.actions
    if (opts.agents)  this.opts.agents  = opts.agents
    if (opts.roleActionMap) this.opts.roleActionMap = opts.roleActionMap
  }

  snapshot(): { actions: ActionsConfig; agents: AgentsConfig; roleActionMap: Record<string,string> } {
    return { actions: this.opts.actions, agents: this.opts.agents, roleActionMap: this.opts.roleActionMap }
  }
}
```

`packages/llm-router/src/resolver/index.ts`:
```ts
export * from './action-resolver'
export * from './thinking-budgets'
```

- [ ] **Step 7: Run — PASS**

```bash
pnpm vitest run packages/llm-router/test/unit/action-resolver.test.ts packages/llm-router/test/unit/thinking-budgets.test.ts
```

Expected: 8 (resolver) + 8 (budgets) = 16 passed.

- [ ] **Step 8: Wire resolver into LLMService**

Modify `packages/llm-router/src/service/llm-service.ts` — add resolver hook in `complete()` and `run()`:
```ts
import { applyThinking } from '../resolver/thinking-budgets'
import type { ActionResolver } from '../resolver/action-resolver'
import type { Action } from '@glm/shared'

// Augment the constructor opts:
export interface LLMServiceOpts {
  // ... existing fields ...
  resolver?: ActionResolver         // NEW (P6-Fix-7); optional — adapters may pre-resolve and pass IR as-is
}

// In the class body:
export class LLMService {
  // ... existing fields ...
  private resolver?: ActionResolver

  constructor(opts: LLMServiceOpts) {
    // ... existing assignments ...
    this.resolver = opts.resolver
  }

  /**
   * P6-Fix-7: resolve { model, thinking } from { role, action, override } via resolver,
   * then mutate `req` to set `thinking` (Anthropic) or `reasoning_effort` (OpenAI) before
   * we hand it to the provider. Caller can also pre-resolve and pass IR straight through.
   */
  private resolveIntoRequest(
    req: IRRequest,
    opts?: { role?: string; action?: Action; override?: { model?: string; thinking?: any } },
  ): IRRequest {
    if (!this.resolver || !opts) return req
    const r = this.resolver.resolve(opts)
    const nextModel = r.model
    const endpoint = preferredEndpoint(nextModel as any)
    let next: IRRequest = { ...req, model: nextModel as any }
    next = applyThinking(next, r.thinking, endpoint, {
      warn: (m) => this.log?.warn(m),
    })
    return next
  }

  run(req: IRRequest, opts?: { role?: string; action?: Action; override?: { model?: string; thinking?: any } }): RunHandle {
    const resolved = this.resolveIntoRequest(req, opts)
    // ... existing implementation continues with `resolved` instead of `req` ...
  }

  async complete(
    messages: ShortMessage[],
    completeOpts: CompleteOpts,
    routing?: { role?: string; action?: Action; override?: { model?: string; thinking?: any } },
  ): Promise<{ text: string; usage: LLMUsage }> {
    // Build IR from short messages as before (existing logic in Task 12 / P6-Fix-3) …
    let req: IRRequest = buildIRRequest(messages, completeOpts)
    req = this.resolveIntoRequest(req, routing)
    // ... existing run-and-collect-text loop ...
  }
}
```

Add a unit test snippet to `service.test.ts`:
```ts
test('complete() with { role: "critic" } resolves via ActionResolver and stamps thinking on the wire', async () => {
  // ... build LLMService with resolver: new ActionResolver({ actions: DEFAULT_ACTIONS, agents: {}, roleActionMap: { critic: 'slow' } }) ...
  // assert provider was called with model='GLM-5.1' and thinking.budget_tokens === 65536
})
```

- [ ] **Step 9: Register `model.*` RPC handlers**

`packages/llm-router/src/rpc/model-methods.ts`:
```ts
import { z } from 'zod'
import { ACTIONS, THINKING_LEVELS, type Action, type ThinkingLevel, DEFAULT_ACTIONS } from '@glm/shared'
import type { ActionResolver } from '../resolver/action-resolver'

export interface ModelRpcDeps {
  resolver: ActionResolver
  /** Persists actions/agents back to ~/.glm/settings.json (P10's settings writer). */
  saveSettings: (next: { actions: typeof DEFAULT_ACTIONS; agents: Record<string, { model?: string; thinking?: ThinkingLevel }> }) => Promise<void>
  /** List of all known LLMModel names (P6 endpoint map). */
  knownModels: () => Array<{ name: string; provider: 'zai' | 'canonical'; endpoint: 'anthropic' | 'openai' }>
}

const SetParams = z.object({
  action: z.enum(ACTIONS),
  model: z.string().min(1),
  thinking: z.enum(THINKING_LEVELS).optional(),
})
const ShowParams  = z.object({ action: z.enum(ACTIONS).optional() })
const ResetParams = z.object({ action: z.enum(ACTIONS).optional() })

export function makeModelHandlers(deps: ModelRpcDeps): Record<string, (params: unknown) => Promise<unknown>> {
  return {
    /** Returns the model catalog with per-model tags (which actions point at this model). */
    'model.list': async () => {
      const snap = deps.resolver.snapshot()
      const tagsByModel: Record<string, Action[]> = {}
      for (const a of ACTIONS) {
        const m = snap.actions[a].model
        ;(tagsByModel[m] ??= []).push(a)
      }
      const thinkingByModel: Record<string, ThinkingLevel> = {}
      for (const a of ACTIONS) thinkingByModel[snap.actions[a].model] = snap.actions[a].thinking
      return deps.knownModels().map(m => ({
        name: m.name,
        provider: m.provider,
        endpoint: m.endpoint,
        tags: (tagsByModel[m.name] ?? []).map(t => t.toUpperCase()),
        thinking: thinkingByModel[m.name] ?? 'inherit',
      }))
    },

    'model.set': async (params) => {
      const p = SetParams.parse(params)
      const snap = deps.resolver.snapshot()
      const nextActions = { ...snap.actions, [p.action]: {
        model: p.model,
        thinking: p.thinking ?? snap.actions[p.action].thinking,
      } }
      deps.resolver.update({ actions: nextActions })
      await deps.saveSettings({ actions: nextActions, agents: snap.agents })
      return { ok: true, action: p.action, model: p.model, thinking: nextActions[p.action].thinking }
    },

    'model.show': async (params) => {
      const p = ShowParams.parse(params ?? {})
      const snap = deps.resolver.snapshot()
      if (p.action) {
        const cfg = snap.actions[p.action]
        return { action: p.action, model: cfg.model, thinking: cfg.thinking }
      }
      return ACTIONS.map(a => ({ action: a, model: snap.actions[a].model, thinking: snap.actions[a].thinking }))
    },

    'model.reset': async (params) => {
      const p = ResetParams.parse(params ?? {})
      const snap = deps.resolver.snapshot()
      const nextActions = { ...snap.actions }
      if (p.action) {
        nextActions[p.action] = DEFAULT_ACTIONS[p.action]
      } else {
        for (const a of ACTIONS) nextActions[a] = DEFAULT_ACTIONS[a]
      }
      deps.resolver.update({ actions: nextActions })
      await deps.saveSettings({ actions: nextActions, agents: snap.agents })
      return { ok: true, reset: p.action ?? 'all' }
    },
  }
}
```

In `packages/llm-router/src/daemon-loader.ts`, register the four handlers inside the existing `LoaderHub.registerSubsystem('llm-router', ...)` block (alongside `llm.call`/`.cancel`):
```ts
import { ActionResolver } from './resolver/action-resolver'
import { makeModelHandlers } from './rpc/model-methods'
import { DEFAULT_ACTIONS, type ActionsConfig, type AgentsConfig } from '@glm/shared'
import { loadSettings, saveSettings } from '@glm/core/settings/cascade'
import { knownModelCatalog } from './provider/endpoint-map'
import { roleActionMap } from '@glm/agents'

// inside the registerSubsystem callback:
const settings = loadSettings(daemon.paths)
const actions: ActionsConfig = settings.actions ?? DEFAULT_ACTIONS
const agents:  AgentsConfig  = settings.agents  ?? {}
const resolver = new ActionResolver({ actions, agents, roleActionMap })
daemon.llmResolver = resolver       // expose for adapters

const modelHandlers = makeModelHandlers({
  resolver,
  saveSettings: async (next) => { await saveSettings(daemon.paths, next) },
  knownModels: () => knownModelCatalog(),
})
for (const [method, fn] of Object.entries(modelHandlers)) daemon.rpc.on(method, fn)
```

- [ ] **Step 10: Settings cascade reader (Modify P1's settings module)**

Modify `packages/core/src/settings/cascade.ts`:
```ts
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import {
  ActionsConfigSchema, AgentsConfigSchema, DEFAULT_ACTIONS,
  type ActionsConfig, type AgentsConfig,
} from '@glm/shared'
import type { GlmPaths } from '@glm/shared'

export interface SettingsShape {
  actions?: ActionsConfig
  agents?:  AgentsConfig
  [k: string]: unknown
}

export function loadSettings(paths: GlmPaths): SettingsShape {
  const file = path.join(paths.root, 'settings.json')
  if (!existsSync(file)) return {}
  let raw: SettingsShape
  try { raw = JSON.parse(readFileSync(file, 'utf8')) as SettingsShape }
  catch { return {} }
  // Validate optional sections; tolerate other keys.
  if (raw.actions) {
    const parsed = ActionsConfigSchema.safeParse(raw.actions)
    raw.actions = parsed.success ? parsed.data : DEFAULT_ACTIONS
  }
  if (raw.agents) {
    const parsed = AgentsConfigSchema.safeParse(raw.agents)
    raw.agents = parsed.success ? parsed.data : {}
  }
  return raw
}

export async function saveSettings(
  paths: GlmPaths,
  next: { actions: ActionsConfig; agents: AgentsConfig },
): Promise<void> {
  if (!existsSync(paths.root)) mkdirSync(paths.root, { recursive: true, mode: 0o700 })
  const file = path.join(paths.root, 'settings.json')
  const current: SettingsShape = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
  const merged = { ...current, actions: next.actions, agents: next.agents }
  writeFileSync(file, JSON.stringify(merged, null, 2), { mode: 0o600 })
}
```

- [ ] **Step 11: CLI subcommand `glm model …`**

`packages/cli/src/commands/model.ts`:
```ts
import { Command } from 'commander'
import kleur from 'kleur'
import { connectDaemon } from '../auto-spawn'
import { ACTIONS, THINKING_LEVELS } from '@glm/shared'

export function registerModelCommand(program: Command): void {
  const m = program.command('model').description('Configure action → model + thinking mappings (spec §9.23)')

  m.command('list')
    .description('List all known models with current action tags')
    .action(async () => {
      const c = await connectDaemon()
      const rows = await c.call('model.list', {}) as Array<{ name: string; provider: string; endpoint: string; tags: string[]; thinking: string }>
      console.log(kleur.bold('Model'.padEnd(18)) + kleur.bold('Provider'.padEnd(12)) + kleur.bold('Tags'))
      for (const r of rows) {
        console.log(`${r.name.padEnd(18)}${r.provider.padEnd(12)}${r.tags.map(t => `[${t}]`).join(' ') || '-'}`)
      }
    })

  m.command('show [action]')
    .description('Show current mapping for one action (or all 8)')
    .action(async (action?: string) => {
      const c = await connectDaemon()
      const params = action ? { action } : {}
      const r = await c.call('model.show', params) as any
      const arr = Array.isArray(r) ? r : [r]
      for (const row of arr) {
        console.log(`${row.action.padEnd(9)} → ${row.model.padEnd(14)} ${row.thinking} thinking`)
      }
    })

  m.command('set <action> <model> [thinking]')
    .description(`Set an action mapping. action ∈ {${ACTIONS.join('|')}}; thinking ∈ {${THINKING_LEVELS.join('|')}}`)
    .action(async (action: string, model: string, thinking?: string) => {
      if (!(ACTIONS as readonly string[]).includes(action)) {
        console.error(`unknown action "${action}"`); process.exit(2)
      }
      if (thinking && !(THINKING_LEVELS as readonly string[]).includes(thinking)) {
        console.error(`unknown thinking "${thinking}"`); process.exit(2)
      }
      const c = await connectDaemon()
      const out = await c.call('model.set', { action, model, ...(thinking ? { thinking } : {}) }) as any
      console.log(`${kleur.green('✓')} ${out.action} → ${out.model} (${out.thinking})`)
    })

  m.command('reset [action]')
    .description('Reset one action (or all 8) to defaults')
    .action(async (action?: string) => {
      const c = await connectDaemon()
      const out = await c.call('model.reset', action ? { action } : {}) as any
      console.log(`${kleur.green('✓')} reset ${out.reset}`)
    })
}
```

Register in `packages/cli/src/bin.ts`:
```ts
import { registerModelCommand } from './commands/model'
// ... existing registrations ...
registerModelCommand(program)
```

- [ ] **Step 12: Settings-cascade integration test**

`packages/llm-router/test/integration/resolver-settings.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { loadSettings, saveSettings } from '@glm/core/settings/cascade'
import { ActionResolver } from '../../src/resolver/action-resolver'
import { DEFAULT_ACTIONS } from '@glm/shared'

let home: string
beforeEach(() => {
  home = mkdtempSync(path.join(os.tmpdir(), 'glm-res-'))
  mkdirSync(path.join(home, '.glm'), { recursive: true })
})
afterEach(() => rmSync(home, { recursive: true, force: true }))

describe('resolver ↔ settings.json round-trip', () => {
  test('absent file → defaults used', () => {
    const settings = loadSettings({ root: path.join(home, '.glm') } as any)
    expect(settings.actions).toBeUndefined()
    const r = new ActionResolver({
      actions: settings.actions ?? DEFAULT_ACTIONS,
      agents: settings.agents ?? {},
      roleActionMap: { critic: 'slow' },
    })
    expect(r.resolve({ role: 'critic' })).toEqual({ action: 'slow', model: 'GLM-5.1', thinking: 'xhigh' })
  })

  test('user override persists across reload', async () => {
    const paths = { root: path.join(home, '.glm') } as any
    const next = {
      actions: { ...DEFAULT_ACTIONS, slow: { model: 'GLM-5', thinking: 'high' as const } },
      agents:  { critic: { model: 'GLM-4.7' } },
    }
    await saveSettings(paths, next)
    const reloaded = loadSettings(paths)
    expect(reloaded.actions?.slow).toEqual({ model: 'GLM-5', thinking: 'high' })
    expect(reloaded.agents?.critic).toEqual({ model: 'GLM-4.7' })

    const r = new ActionResolver({
      actions: reloaded.actions!,
      agents:  reloaded.agents!,
      roleActionMap: { critic: 'slow' },
    })
    // agents.critic.model wins over actions.slow.model
    expect(r.resolve({ role: 'critic' })).toEqual({ action: 'slow', model: 'GLM-4.7', thinking: 'high' })
  })

  test('schema-invalid `actions` block falls back to defaults', () => {
    writeFileSync(path.join(home, '.glm', 'settings.json'),
      JSON.stringify({ actions: { default: { model: 'GLM-5.1' /* missing thinking */ } } }))
    const r = loadSettings({ root: path.join(home, '.glm') } as any)
    expect(r.actions).toEqual(DEFAULT_ACTIONS)
  })
})
```

- [ ] **Step 13: Run all resolver tests**

```bash
pnpm vitest run packages/llm-router/test/unit/action-resolver.test.ts packages/llm-router/test/unit/thinking-budgets.test.ts packages/llm-router/test/integration/resolver-settings.test.ts
```

Expected: 8 + 8 + 3 = 19 passed.

- [ ] **Step 14: Run full suite + build**

```bash
pnpm build && pnpm vitest run
```

Expected: all previous P6 tests still pass; new resolver tests green; CLI builds.

- [ ] **Step 15: Manual smoke (RPC end-to-end)**

```bash
export GLM_HOME=/tmp/glm-resolver-$$
rm -rf $GLM_HOME
node packages/cli/dist/bin.js daemon start
node packages/cli/dist/bin.js model show               # 8 rows of defaults
node packages/cli/dist/bin.js model set slow glm-5 xhigh
node packages/cli/dist/bin.js model show slow          # slow → glm-5 (xhigh)
cat $GLM_HOME/settings.json | jq '.actions.slow'        # persisted
node packages/cli/dist/bin.js model reset slow
node packages/cli/dist/bin.js model show slow          # back to GLM-5.1 xhigh
node packages/cli/dist/bin.js daemon stop
```

- [ ] **Step 16: Commit**

```bash
git add packages/llm-router packages/cli packages/core/src/settings packages/shared/src/llm-router-types.ts
git commit -m "feat(llm-router): ActionResolver + applyThinking + model.* RPC + glm model CLI (P6-Fix-7 / P6-Fix-8 — spec §9.23)"
```

---

## Task 18: Image attachment → vision MCP auto-routing + `/vision` tool selection (P6-Fix-9 / P6-Fix-10 — spec §9.12)

> **P6-Fix-9 / P6-Fix-10 (FIX-MANIFEST §12.2):** GLM Coding Plan LLMs (GLM-5.1 / 5-Turbo / 4.7 / 4.6 / 4.5-Air) are text-only — they cannot accept image input. Spec §9.12 specifies that whenever a `message.send` payload carries `attachments[*]` of MIME `image/*`, the daemon auto-routes each image through the bundled `glm-vision` MCP server, replacing the `[image N]` placeholder in the text with a `<attachment N description>` block before dispatching to the main LLM. A sha256-keyed result cache at `~/.glm/cache/vision/<sha>.json` makes re-attaching the same screenshot free (vision quota = 0). The `/raw` modifier (P2-Fix-6) marks attachments as bypass: the path is mentioned in the text but vision is skipped (used for "write a PNG decoder for this file" type prompts). Four explicit-tool slash commands (`/vision ocr|ui-to-code|diagnose-error|diagram`) route to dedicated glm-vision tools instead of the default `image_analysis`.

**Files:**
- Create: `packages/llm-router/src/vision/router.ts`
- Create: `packages/llm-router/src/vision/cache.ts`
- Create: `packages/llm-router/src/vision/tools.ts`           (slash → glm-vision tool mapping)
- Create: `packages/llm-router/src/vision/index.ts`
- Create: `packages/llm-router/src/rpc/vision-methods.ts`
- Modify: `packages/llm-router/src/service/llm-service.ts`    (call `processAttachments()` inside `run()`/`complete()` before provider dispatch)
- Modify: `packages/llm-router/src/daemon-loader.ts`          (instantiate vision router; register `vision.invoke` RPC handler)
- Modify: `packages/shared/src/llm-router-types.ts`           (add `MessageAttachment`, `MessageWithAttachments`, `VisionDescription`, `VisionToolId` types)
- Test: `packages/llm-router/test/unit/vision-cache.test.ts`
- Test: `packages/llm-router/test/unit/vision-router.test.ts`
- Test: `packages/llm-router/test/integration/vision-mcp.test.ts`
- Test: `packages/llm-router/test/unit/vision-tools.test.ts`

- [ ] **Step 1: Extend shared types — `MessageAttachment`, `MessageWithAttachments`, `VisionToolId`**

Append to `packages/shared/src/llm-router-types.ts`:
```ts
// ---- Image attachments + glm-vision MCP routing (P6-Fix-9 / spec §9.12) ----

/** Single attachment supplied by the TUI (P2-Fix-6 produces these in `message.send` payload). */
export interface MessageAttachment {
  path: string             // absolute path under ~/.glm/sessions/<sid>/attachments/
  mime: string             // 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' | 'image/heic' | 'image/bmp' | 'image/tiff'
  size: number             // bytes
  sha256: string           // hex digest of the on-disk file
  raw?: boolean            // if true, skip vision routing (path mentioned in text, model never sees pixels)
  tool?: VisionToolId      // explicit glm-vision tool override (from /vision ocr/ui-to-code/diagnose-error/diagram)
}

export interface MessageWithAttachments {
  text: string
  attachments?: MessageAttachment[]
}

/** Cached vision result (sha256 → description); persisted at ~/.glm/cache/vision/<sha>.json. */
export interface VisionDescription {
  sha256: string
  tool: VisionToolId
  description: string             // text returned by glm-vision MCP
  createdAt: string               // ISO timestamp
  sizeBytes: number               // approximate description payload size for LRU accounting
}

/** glm-vision MCP tool ids that we know how to route to (spec §9.12 routing table). */
export const VISION_TOOLS = ['image_analysis', 'extract_text_from_screenshot', 'ui_to_artifact', 'diagnose_error_screenshot', 'understand_technical_diagram'] as const
export type VisionToolId = typeof VISION_TOOLS[number]
```

- [ ] **Step 2: Write failing cache test**

`packages/llm-router/test/unit/vision-cache.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, existsSync, statSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { VisionCache } from '../../src/vision/cache'

let home: string
beforeEach(() => {
  home = mkdtempSync(path.join(os.tmpdir(), 'glm-vcache-'))
  process.env.GLM_HOME = home
})
afterEach(() => {
  rmSync(home, { recursive: true, force: true })
  delete process.env.GLM_HOME
})

describe('VisionCache (P6-Fix-9 / spec §9.12)', () => {
  test('miss → null', async () => {
    const c = new VisionCache({ capBytes: 50 * 1024 * 1024 })
    expect(await c.get('aaaa', 'image_analysis')).toBeNull()
  })

  test('put then get same (sha, tool) → cached description', async () => {
    const c = new VisionCache({ capBytes: 50 * 1024 * 1024 })
    await c.put({ sha256: 'bbbb', tool: 'image_analysis', description: 'a cat', createdAt: new Date().toISOString(), sizeBytes: 5 })
    const r = await c.get('bbbb', 'image_analysis')
    expect(r?.description).toBe('a cat')
  })

  test('put twice with same sha but different tool → both cached separately', async () => {
    const c = new VisionCache({ capBytes: 50 * 1024 * 1024 })
    await c.put({ sha256: 'cc', tool: 'image_analysis', description: 'a UI', createdAt: '', sizeBytes: 4 })
    await c.put({ sha256: 'cc', tool: 'extract_text_from_screenshot', description: 'OK button', createdAt: '', sizeBytes: 9 })
    expect((await c.get('cc', 'image_analysis'))?.description).toBe('a UI')
    expect((await c.get('cc', 'extract_text_from_screenshot'))?.description).toBe('OK button')
  })

  test('LRU eviction when cap exceeded — oldest entry deleted first', async () => {
    const c = new VisionCache({ capBytes: 200 })       // tiny cap to force eviction
    // Write 5 entries of ~80 bytes each → total ~400 → 200 → at least 3 must remain or fewer
    for (let i = 0; i < 5; i++) {
      await c.put({ sha256: `s${i}`, tool: 'image_analysis', description: 'x'.repeat(60), createdAt: '', sizeBytes: 80 })
      await new Promise(r => setTimeout(r, 2))         // ensure mtime ordering
    }
    const remaining = readdirSync(path.join(home, '.glm', 'cache', 'vision'))
    // total bytes-on-disk for what remains must be <= cap
    const total = remaining.reduce((n, f) => n + statSync(path.join(home, '.glm', 'cache', 'vision', f)).size, 0)
    expect(total).toBeLessThanOrEqual(200)
    // Oldest (s0) must be evicted
    expect(remaining.find(f => f.startsWith('s0__'))).toBeUndefined()
  })

  test('corrupted JSON file → treated as miss, not throw', async () => {
    const dir = path.join(home, '.glm', 'cache', 'vision')
    require('node:fs').mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, 'deadbeef__image_analysis.json'), '{not json')
    const c = new VisionCache({ capBytes: 50 * 1024 * 1024 })
    expect(await c.get('deadbeef', 'image_analysis')).toBeNull()
  })
})
```

- [ ] **Step 3: Implement `VisionCache`**

`packages/llm-router/src/vision/cache.ts`:
```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { resolvePaths } from '@glm/shared'
import type { VisionDescription, VisionToolId } from '@glm/shared'

export interface VisionCacheOpts {
  capBytes?: number                // default 50MB (spec §9.12 / FIX-MANIFEST §12.0)
  dir?: string                     // override for tests
}

/** File-backed LRU keyed by (sha256, tool). Filename: `<sha>__<tool>.json`. */
export class VisionCache {
  private capBytes: number
  private dir: string

  constructor(opts: VisionCacheOpts = {}) {
    this.capBytes = opts.capBytes ?? 50 * 1024 * 1024
    this.dir = opts.dir ?? path.join(resolvePaths().root, 'cache', 'vision')
  }

  private fileFor(sha: string, tool: VisionToolId): string {
    return path.join(this.dir, `${sha}__${tool}.json`)
  }

  async get(sha: string, tool: VisionToolId): Promise<VisionDescription | null> {
    const fp = this.fileFor(sha, tool)
    if (!existsSync(fp)) return null
    try {
      const parsed = JSON.parse(readFileSync(fp, 'utf8')) as VisionDescription
      // Touch atime to refresh LRU position
      const now = new Date()
      try { require('node:fs').utimesSync(fp, now, statSync(fp).mtime) } catch { /* best-effort */ }
      return parsed
    } catch { return null }
  }

  async put(desc: VisionDescription): Promise<void> {
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true, mode: 0o700 })
    const fp = this.fileFor(desc.sha256, desc.tool)
    writeFileSync(fp, JSON.stringify(desc, null, 2), { mode: 0o600 })
    this.evictIfNeeded()
  }

  private evictIfNeeded(): void {
    if (!existsSync(this.dir)) return
    const entries = readdirSync(this.dir).map(f => {
      const fp = path.join(this.dir, f); const st = statSync(fp)
      return { fp, size: st.size, atime: st.atimeMs }
    }).sort((a, b) => a.atime - b.atime)                  // oldest access first
    let total = entries.reduce((n, e) => n + e.size, 0)
    for (const e of entries) {
      if (total <= this.capBytes) break
      try { unlinkSync(e.fp); total -= e.size } catch { /* swallow */ }
    }
  }
}
```

- [ ] **Step 4: Run cache test — PASS**

```bash
pnpm vitest run packages/llm-router/test/unit/vision-cache.test.ts
```

Expected: 5 green.

- [ ] **Step 5: Write failing router test (cache hit / miss, parallel fan-out, `/raw` bypass, unsupported format, pool exhausted)**

`packages/llm-router/test/unit/vision-router.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { VisionRouter } from '../../src/vision/router'
import { VisionCache } from '../../src/vision/cache'

let home: string
beforeEach(() => {
  home = mkdtempSync(path.join(os.tmpdir(), 'glm-vrouter-'))
  process.env.GLM_HOME = home
})
afterEach(() => {
  rmSync(home, { recursive: true, force: true })
  delete process.env.GLM_HOME
})

function mkRouter(callTool: ReturnType<typeof vi.fn>) {
  return new VisionRouter({
    cache: new VisionCache({ capBytes: 50 * 1024 * 1024 }),
    callMcpTool: callTool,
    quota: { reserve: async () => true, release: () => {}, available: () => 5 },
    poolCapacity: 3,
  })
}

describe('VisionRouter — cache hit/miss', () => {
  test('miss: calls glm-vision/image_analysis, caches result, replaces `[image N]` placeholder', async () => {
    const callTool = vi.fn(async () => ({ description: 'a kitten on a desk' }))
    const r = mkRouter(callTool)
    const out = await r.processAttachments({
      text: '[image 1] what is this?',
      attachments: [{ path: '/tmp/x.png', mime: 'image/png', size: 100, sha256: 'aaaa' }],
    })
    expect(callTool).toHaveBeenCalledWith('glm-vision', 'image_analysis', { path: '/tmp/x.png' })
    expect(out.text).toContain('<attachment 1 description>')
    expect(out.text).toContain('a kitten on a desk')
    expect(out.text).toContain('[image 1] what is this?')
  })

  test('hit: second call with same sha256 → no MCP invocation, uses cached description', async () => {
    const callTool = vi.fn(async () => ({ description: 'cached cat' }))
    const r = mkRouter(callTool)
    const msg = { text: '[image 1] hi', attachments: [{ path: '/tmp/y.png', mime: 'image/png', size: 50, sha256: 'bbbb' }] }
    await r.processAttachments(msg)
    expect(callTool).toHaveBeenCalledTimes(1)
    await r.processAttachments(msg)
    expect(callTool).toHaveBeenCalledTimes(1)               // no second call
  })
})

describe('VisionRouter — parallel fan-out within pool capacity', () => {
  test('3 attachments, pool=3 → all dispatched concurrently', async () => {
    const inflight: number[] = []
    let peak = 0
    const callTool = vi.fn(async () => {
      inflight.push(1); peak = Math.max(peak, inflight.length)
      await new Promise(r => setTimeout(r, 20))
      inflight.pop()
      return { description: 'x' }
    })
    const r = mkRouter(callTool)
    await r.processAttachments({
      text: '[image 1] [image 2] [image 3]',
      attachments: [
        { path: '/tmp/1.png', mime: 'image/png', size: 1, sha256: 's1' },
        { path: '/tmp/2.png', mime: 'image/png', size: 1, sha256: 's2' },
        { path: '/tmp/3.png', mime: 'image/png', size: 1, sha256: 's3' },
      ],
    })
    expect(peak).toBe(3)
    expect(callTool).toHaveBeenCalledTimes(3)
  })

  test('5 attachments, pool=3 → at most 3 inflight at any time', async () => {
    let inflight = 0, peak = 0
    const callTool = vi.fn(async () => {
      inflight++; peak = Math.max(peak, inflight)
      await new Promise(r => setTimeout(r, 20))
      inflight--
      return { description: 'x' }
    })
    const r = mkRouter(callTool)
    await r.processAttachments({
      text: '[image 1] [image 2] [image 3] [image 4] [image 5]',
      attachments: Array.from({ length: 5 }, (_, i) => ({ path: `/tmp/${i}.png`, mime: 'image/png', size: 1, sha256: `s${i}` })),
    })
    expect(peak).toBeLessThanOrEqual(3)
    expect(callTool).toHaveBeenCalledTimes(5)
  })
})

describe('VisionRouter — `/raw` bypass', () => {
  test('raw=true attachment → no MCP call, path-only injected', async () => {
    const callTool = vi.fn(async () => ({ description: 'should not be called' }))
    const r = mkRouter(callTool)
    const out = await r.processAttachments({
      text: '[image 1] decode this PNG',
      attachments: [{ path: '/tmp/r.png', mime: 'image/png', size: 1, sha256: 'rrr', raw: true }],
    })
    expect(callTool).not.toHaveBeenCalled()
    expect(out.text).toContain('/tmp/r.png')         // path mentioned
    expect(out.text).toContain('[image 1] decode this PNG')
  })
})

describe('VisionRouter — unsupported format / vision pool exhausted', () => {
  test('non-image MIME → passes through unchanged (no MCP call, no error)', async () => {
    const callTool = vi.fn()
    const r = mkRouter(callTool)
    const out = await r.processAttachments({
      text: '[image 1] check this',
      attachments: [{ path: '/tmp/x.pdf', mime: 'application/pdf', size: 100, sha256: 'pdf' }],
    })
    expect(callTool).not.toHaveBeenCalled()
    expect(out.text).toContain('unsupported attachment')   // graceful in-message warning
  })

  test('quota.reserve() returns false → skip routing for that attachment, warn in placeholder', async () => {
    const callTool = vi.fn(async () => ({ description: 'unreached' }))
    const r = new VisionRouter({
      cache: new VisionCache({ capBytes: 50 * 1024 * 1024 }),
      callMcpTool: callTool,
      quota: { reserve: async () => false, release: () => {}, available: () => 0 },
      poolCapacity: 3,
    })
    const out = await r.processAttachments({
      text: '[image 1] hi',
      attachments: [{ path: '/tmp/q.png', mime: 'image/png', size: 1, sha256: 'qqq' }],
    })
    expect(callTool).not.toHaveBeenCalled()
    expect(out.text).toMatch(/quota|exhausted/i)
  })
})

describe('VisionRouter — explicit tool selection (P6-Fix-10)', () => {
  test('attachment.tool=`extract_text_from_screenshot` → router calls that MCP tool, not the default', async () => {
    const callTool = vi.fn(async () => ({ description: 'OK button at (40,90)' }))
    const r = mkRouter(callTool)
    await r.processAttachments({
      text: '[image 1] OCR please',
      attachments: [{ path: '/tmp/o.png', mime: 'image/png', size: 1, sha256: 'ocr', tool: 'extract_text_from_screenshot' }],
    })
    expect(callTool).toHaveBeenCalledWith('glm-vision', 'extract_text_from_screenshot', { path: '/tmp/o.png' })
  })
})
```

- [ ] **Step 6: Implement `VisionRouter`**

`packages/llm-router/src/vision/router.ts`:
```ts
import { VisionCache } from './cache'
import type { MessageAttachment, MessageWithAttachments, VisionToolId, VisionDescription } from '@glm/shared'

export interface McpToolCaller {
  /** Call `<server>/<tool>` with structured `args`; returns server's structured response. */
  (serverName: string, toolName: string, args: Record<string, unknown>): Promise<{ description?: string; text?: string; [k: string]: unknown }>
}

export interface VisionQuotaGuard {
  reserve(slot?: number): Promise<boolean>
  release(slot?: number): void
  available(): number
}

export interface VisionRouterOpts {
  cache: VisionCache
  callMcpTool: McpToolCaller
  quota: VisionQuotaGuard
  poolCapacity?: number                  // max concurrent glm-vision calls (default 3)
  defaultTool?: VisionToolId             // default 'image_analysis'
}

const IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/heic', 'image/bmp', 'image/tiff'])

/** Bounded-concurrency parallel iterator. */
async function pMap<T, R>(items: T[], cap: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let cursor = 0
  async function worker() {
    while (true) {
      const i = cursor++
      if (i >= items.length) return
      out[i] = await fn(items[i]!, i)
    }
  }
  const workers = Array.from({ length: Math.min(cap, items.length) }, () => worker())
  await Promise.all(workers)
  return out
}

export class VisionRouter {
  private cache: VisionCache
  private callMcpTool: McpToolCaller
  private quota: VisionQuotaGuard
  private poolCapacity: number
  private defaultTool: VisionToolId

  constructor(opts: VisionRouterOpts) {
    this.cache = opts.cache
    this.callMcpTool = opts.callMcpTool
    this.quota = opts.quota
    this.poolCapacity = opts.poolCapacity ?? 3
    this.defaultTool = opts.defaultTool ?? 'image_analysis'
  }

  /**
   * For each image attachment, call glm-vision (or use the cache), then replace `[image N]`
   * placeholders with a `<attachment N description>` block injected at the top of the message.
   * Honors:
   *   - `attachment.raw === true` → path-only, no vision call
   *   - `attachment.tool` → explicit glm-vision tool id, otherwise defaultTool
   *   - non-image MIME → graceful warn-in-text
   *   - quota exhausted → graceful warn-in-text
   */
  async processAttachments(msg: MessageWithAttachments): Promise<{ text: string; routedCount: number; cacheHits: number }> {
    const attachments = msg.attachments ?? []
    if (attachments.length === 0) return { text: msg.text, routedCount: 0, cacheHits: 0 }

    let cacheHits = 0
    const blocks: Array<{ n: number; block: string }> = []

    const results = await pMap(attachments, this.poolCapacity, async (att, i) => {
      const n = i + 1
      if (att.raw) {
        return { n, block: `<attachment ${n} path>\n${att.path} (raw — vision routing skipped per /raw modifier)\n</attachment ${n} path>` }
      }
      if (!IMAGE_MIMES.has(att.mime)) {
        return { n, block: `<attachment ${n} warning>\nunsupported attachment mime: ${att.mime} (${att.path}); use /raw to pass the path through\n</attachment ${n} warning>` }
      }
      const tool: VisionToolId = (att.tool as VisionToolId) ?? this.defaultTool

      const hit = await this.cache.get(att.sha256, tool)
      if (hit) {
        cacheHits++
        return { n, block: `<attachment ${n} description>\n${hit.description}\n</attachment ${n} description>` }
      }

      const ok = await this.quota.reserve(1)
      if (!ok) {
        return { n, block: `<attachment ${n} warning>\nvision pool quota exhausted; reattach or retry later (path: ${att.path})\n</attachment ${n} warning>` }
      }
      try {
        const result = await this.callMcpTool('glm-vision', tool, { path: att.path })
        const description = result.description ?? result.text ?? '(empty vision response)'
        const desc: VisionDescription = {
          sha256: att.sha256, tool,
          description,
          createdAt: new Date().toISOString(),
          sizeBytes: Buffer.byteLength(description, 'utf8'),
        }
        await this.cache.put(desc)
        return { n, block: `<attachment ${n} description>\n${description}\n</attachment ${n} description>` }
      } catch (e) {
        return { n, block: `<attachment ${n} warning>\nvision MCP call failed: ${(e as Error).message}\n</attachment ${n} warning>` }
      } finally {
        this.quota.release(1)
      }
    })

    for (const r of results) blocks.push(r)
    blocks.sort((a, b) => a.n - b.n)
    const injected = blocks.map(b => b.block).join('\n')
    return {
      text: `<attachments>\n${injected}\n</attachments>\n\n${msg.text}`,
      routedCount: attachments.length,
      cacheHits,
    }
  }
}
```

`packages/llm-router/src/vision/index.ts`:
```ts
export * from './cache'
export * from './router'
export * from './tools'
```

- [ ] **Step 7: Run router test — PASS**

```bash
pnpm vitest run packages/llm-router/test/unit/vision-router.test.ts
```

Expected: 9 green (cache hit/miss × 2, parallel × 2, raw bypass, unsupported format, quota exhausted, explicit tool).

- [ ] **Step 8: Wire `processAttachments()` into `LLMService.run()` and `.complete()`**

Modify `packages/llm-router/src/service/llm-service.ts` — add a router hook that runs BEFORE `resolveIntoRequest()`:
```ts
import type { VisionRouter } from '../vision/router'
import type { MessageWithAttachments } from '@glm/shared'

// Augment LLMServiceOpts:
export interface LLMServiceOpts {
  // ... existing fields ...
  visionRouter?: VisionRouter      // NEW (P6-Fix-9); optional — tests can omit
}

export class LLMService {
  // ... existing fields ...
  private visionRouter?: VisionRouter

  constructor(opts: LLMServiceOpts) {
    // ... existing assignments ...
    this.visionRouter = opts.visionRouter
  }

  /**
   * P6-Fix-9: before the resolver/provider stack sees the request, walk any image
   * attachments on the LAST user message through glm-vision and rewrite the message text.
   * No-op when the router isn't wired or when there are no attachments.
   */
  private async preprocessVision(req: IRRequest): Promise<IRRequest> {
    if (!this.visionRouter) return req
    const last = req.messages[req.messages.length - 1]
    if (!last || last.role !== 'user') return req
    const attachments = (last as any).attachments as MessageWithAttachments['attachments']
    if (!attachments || attachments.length === 0) return req
    const text = typeof last.content === 'string' ? last.content : last.content.map((p: any) => p.text ?? '').join('')
    const out = await this.visionRouter.processAttachments({ text, attachments })
    const nextMessages = [...req.messages]
    nextMessages[nextMessages.length - 1] = { ...(last as any), content: out.text, attachments: undefined }
    return { ...req, messages: nextMessages }
  }

  run(req: IRRequest, opts?: { role?: string; action?: Action; override?: { model?: string; thinking?: any } }): RunHandle {
    // P6-Fix-9 vision routing must happen first (await inside the awaitable wrapper).
    const handle = createRunHandle()
    void (async () => {
      try {
        const visioned = await this.preprocessVision(req)
        const resolved  = this.resolveIntoRequest(visioned, opts)
        await this.dispatchToProvider(resolved, handle)        // existing internal
      } catch (e) {
        handle.fail(e as Error)
      }
    })()
    return handle
  }

  async complete(
    messages: ShortMessage[],
    completeOpts: CompleteOpts,
    routing?: { role?: string; action?: Action; override?: { model?: string; thinking?: any } },
  ): Promise<{ text: string; usage: LLMUsage }> {
    let req: IRRequest = buildIRRequest(messages, completeOpts)
    req = await this.preprocessVision(req)
    req = this.resolveIntoRequest(req, routing)
    // ... existing run-and-collect-text loop ...
  }
}
```

- [ ] **Step 9: Implement `/vision` slash → MCP tool mapping**

`packages/llm-router/src/vision/tools.ts`:
```ts
import type { VisionToolId } from '@glm/shared'

/** Slash subcommand → glm-vision tool id (FIX-MANIFEST §12.2, spec §9.12 routing table). */
export const VISION_SLASH_TO_TOOL: Record<string, VisionToolId> = {
  ocr:             'extract_text_from_screenshot',
  'ui-to-code':    'ui_to_artifact',
  'diagnose-error':'diagnose_error_screenshot',
  diagram:         'understand_technical_diagram',
}

export interface VisionInvokeParams {
  /** Sub-command from `/vision <sub> [image N] [--flags…]`. */
  tool: string                                  // 'ocr' | 'ui-to-code' | 'diagnose-error' | 'diagram'
  /** Either a session-attachment ref (`{ kind:'attachment', n:1 }`) or an absolute path. */
  attachmentRef: { kind: 'attachment'; n: number } | { kind: 'path'; path: string }
  args?: Record<string, unknown>                // e.g. { framework: 'react' } for ui-to-code
  sessionId: string                             // resolves attachment refs against the session's attachments dir
}
```

`packages/llm-router/src/rpc/vision-methods.ts`:
```ts
import { z } from 'zod'
import path from 'node:path'
import { existsSync, readdirSync } from 'node:fs'
import { resolvePaths } from '@glm/shared'
import { VISION_SLASH_TO_TOOL } from '../vision/tools'
import type { VisionRouter } from '../vision/router'
import type { McpToolCaller } from '../vision/router'

const InvokeParams = z.object({
  tool: z.enum(['ocr', 'ui-to-code', 'diagnose-error', 'diagram']),
  attachmentRef: z.union([
    z.object({ kind: z.literal('attachment'), n: z.number().int().positive() }),
    z.object({ kind: z.literal('path'), path: z.string().min(1) }),
  ]),
  args: z.record(z.string(), z.any()).optional(),
  sessionId: z.string().min(1),
})

export interface VisionRpcDeps {
  callMcpTool: McpToolCaller
}

export function makeVisionHandlers(deps: VisionRpcDeps): Record<string, (params: unknown) => Promise<unknown>> {
  return {
    'vision.invoke': async (params) => {
      const p = InvokeParams.parse(params)
      const tool = VISION_SLASH_TO_TOOL[p.tool]
      if (!tool) throw new Error(`unknown vision tool: ${p.tool}`)

      // Resolve attachment ref → on-disk path
      let imgPath: string
      if (p.attachmentRef.kind === 'path') {
        imgPath = p.attachmentRef.path
      } else {
        const dir = path.join(resolvePaths().root, 'sessions', p.sessionId, 'attachments')
        if (!existsSync(dir)) throw new Error(`no attachments dir for session ${p.sessionId}`)
        const match = readdirSync(dir).find(f => new RegExp(`^img_${p.attachmentRef.n}\\.[a-z]+$`).test(f))
        if (!match) throw new Error(`attachment [image ${p.attachmentRef.n}] not found`)
        imgPath = path.join(dir, match)
      }

      const result = await deps.callMcpTool('glm-vision', tool, { path: imgPath, ...(p.args ?? {}) })
      return { tool, path: imgPath, result }
    },
  }
}
```

- [ ] **Step 10: Write failing tools test**

`packages/llm-router/test/unit/vision-tools.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { VISION_SLASH_TO_TOOL } from '../../src/vision/tools'
import { makeVisionHandlers } from '../../src/rpc/vision-methods'

let home: string
beforeEach(() => {
  home = mkdtempSync(path.join(os.tmpdir(), 'glm-vtools-'))
  process.env.GLM_HOME = home
})
afterEach(() => {
  rmSync(home, { recursive: true, force: true })
  delete process.env.GLM_HOME
})

describe('VISION_SLASH_TO_TOOL (P6-Fix-10)', () => {
  test('all 4 slash subcommands map to glm-vision tool ids per spec §9.12', () => {
    expect(VISION_SLASH_TO_TOOL.ocr).toBe('extract_text_from_screenshot')
    expect(VISION_SLASH_TO_TOOL['ui-to-code']).toBe('ui_to_artifact')
    expect(VISION_SLASH_TO_TOOL['diagnose-error']).toBe('diagnose_error_screenshot')
    expect(VISION_SLASH_TO_TOOL.diagram).toBe('understand_technical_diagram')
  })
})

describe('vision.invoke RPC handler', () => {
  test('attachment ref resolves to ~/.glm/sessions/<sid>/attachments/img_N.png and calls correct MCP tool', async () => {
    const sid = 'sess-vt'
    const dir = path.join(home, '.glm', 'sessions', sid, 'attachments')
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, 'img_1.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    const callMcpTool = vi.fn(async () => ({ description: 'OK button' }))
    const handlers = makeVisionHandlers({ callMcpTool })
    const out = await handlers['vision.invoke']!({
      tool: 'ocr',
      attachmentRef: { kind: 'attachment', n: 1 },
      sessionId: sid,
    }) as any
    expect(callMcpTool).toHaveBeenCalledWith('glm-vision', 'extract_text_from_screenshot', { path: path.join(dir, 'img_1.png') })
    expect(out.tool).toBe('extract_text_from_screenshot')
  })

  test('ui-to-code forwards extra args (e.g. framework)', async () => {
    const sid = 'sess-vt2'
    const dir = path.join(home, '.glm', 'sessions', sid, 'attachments')
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, 'img_1.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    const callMcpTool = vi.fn(async () => ({ description: '<button>OK</button>' }))
    const handlers = makeVisionHandlers({ callMcpTool })
    await handlers['vision.invoke']!({
      tool: 'ui-to-code',
      attachmentRef: { kind: 'attachment', n: 1 },
      args: { framework: 'react' },
      sessionId: sid,
    })
    expect(callMcpTool).toHaveBeenCalledWith('glm-vision', 'ui_to_artifact', { path: path.join(dir, 'img_1.png'), framework: 'react' })
  })

  test('missing attachment → throws', async () => {
    const callMcpTool = vi.fn()
    const handlers = makeVisionHandlers({ callMcpTool })
    await expect(handlers['vision.invoke']!({
      tool: 'diagram', attachmentRef: { kind: 'attachment', n: 99 }, sessionId: 'sess-none',
    })).rejects.toThrow(/not found|no attachments/i)
  })

  test('unknown tool sub-command → zod rejection', async () => {
    const callMcpTool = vi.fn()
    const handlers = makeVisionHandlers({ callMcpTool })
    await expect(handlers['vision.invoke']!({
      tool: 'bogus', attachmentRef: { kind: 'path', path: '/tmp/x.png' }, sessionId: 's',
    })).rejects.toThrow()
  })
})
```

- [ ] **Step 11: Run tools test — PASS**

```bash
pnpm vitest run packages/llm-router/test/unit/vision-tools.test.ts
```

Expected: 5 green.

- [ ] **Step 12: Register vision router + `vision.invoke` RPC in daemon-loader**

Modify `packages/llm-router/src/daemon-loader.ts` — extend the existing `LoaderHub.registerSubsystem('llm-router', ...)` block (added by P6-Fix-7) with the vision wiring:
```ts
import { VisionCache } from './vision/cache'
import { VisionRouter } from './vision/router'
import { makeVisionHandlers } from './rpc/vision-methods'

// inside the registerSubsystem callback, AFTER the resolver wiring:
const visionCache = new VisionCache({ capBytes: 50 * 1024 * 1024 })
// `daemon.mcpHost` is provided by P4 Task 4 (MCP host integration). Call signature:
//   mcpHost.callTool(serverName: string, toolName: string, args: Record<string, unknown>): Promise<...>
// If P4 hasn't booted glm-vision yet (e.g., user disabled the bundled server), wire a no-op caller
// so the router gracefully returns "vision MCP unreachable" instead of throwing during route().
const callMcpTool = async (server: string, tool: string, args: Record<string, unknown>) => {
  if (!daemon.mcpHost) throw new Error('MCP host not available (P4 not yet loaded)')
  return daemon.mcpHost.callTool(server, tool, args)
}
const visionRouter = new VisionRouter({
  cache: visionCache,
  callMcpTool,
  quota: daemon.quotaTracker.poolFor('vision'),     // P6 Task 9 quota tracker exposes pool slots
  poolCapacity: 3,
})
daemon.visionRouter = visionRouter
// LLMService construction must pick up `visionRouter` — wire it where new LLMService(...) is called:
//   new LLMService({ ..., visionRouter })

// Register `vision.invoke` RPC handler
const visionHandlers = makeVisionHandlers({ callMcpTool })
for (const [m, h] of Object.entries(visionHandlers)) daemon.rpc.on(m, h)
```

- [ ] **Step 13: Write failing integration test — vision MCP routing inside a full LLMService call**

`packages/llm-router/test/integration/vision-mcp.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { LLMService } from '../../src/service/llm-service'
import { VisionRouter } from '../../src/vision/router'
import { VisionCache } from '../../src/vision/cache'

let home: string
beforeEach(() => {
  home = mkdtempSync(path.join(os.tmpdir(), 'glm-vmcp-'))
  process.env.GLM_HOME = home
})
afterEach(() => {
  rmSync(home, { recursive: true, force: true })
  delete process.env.GLM_HOME
})

describe('LLMService + VisionRouter integration (P6-Fix-9)', () => {
  test('attachments in last user message → glm-vision called → rewritten text reaches provider', async () => {
    const png = path.join(home, 'x.png')
    writeFileSync(png, Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))

    const callMcpTool = vi.fn(async () => ({ description: 'a teapot' }))
    const router = new VisionRouter({
      cache: new VisionCache({ capBytes: 50 * 1024 * 1024 }),
      callMcpTool,
      quota: { reserve: async () => true, release: () => {}, available: () => 5 },
      poolCapacity: 2,
    })

    // capturing fake provider — records the request body it would have sent
    const capturedReqs: any[] = []
    const fakeProvider = {
      name: 'fake',
      async *send(req: any) {
        capturedReqs.push(req)
        yield { type: 'text_delta', text: 'ok' }
        yield { type: 'message_stop', usage: { input_tokens: 1, output_tokens: 1 } }
      },
    }

    const svc = new LLMService({
      providers: { 'GLM-5.1': fakeProvider as any },
      cache: { lookup: async () => null, store: async () => {} } as any,
      quotaTracker: { ok: () => true } as any,
      retry: { policy: { attempt: async (f: any) => f() } } as any,
      log: { warn: () => {}, info: () => {}, error: () => {} } as any,
      visionRouter: router,
    } as any)

    const { text } = await svc.complete(
      [{ role: 'user', content: '[image 1] what?', attachments: [{ path: png, mime: 'image/png', size: 100, sha256: 'aaaa' }] } as any],
      { model: 'GLM-5.1' } as any,
    )
    expect(callMcpTool).toHaveBeenCalled()
    expect(capturedReqs.length).toBe(1)
    const sentText = JSON.stringify(capturedReqs[0])
    expect(sentText).toContain('a teapot')
    expect(sentText).toContain('<attachment 1 description>')
    expect(text).toBe('ok')
  })
})
```

- [ ] **Step 14: Run integration test — PASS**

```bash
pnpm vitest run packages/llm-router/test/integration/vision-mcp.test.ts
```

Expected: 1 green.

- [ ] **Step 15: Run full vision suite + build**

```bash
pnpm build && pnpm vitest run packages/llm-router/test
```

Expected: all prior P6 tests still pass; vision-cache (5) + vision-router (9) + vision-tools (5) + vision-mcp (1) = 20 new green.

- [ ] **Step 16: Manual smoke**

```bash
export GLM_API_KEY=$REAL_KEY
export GLM_HOME=/tmp/glm-vmcp-$$
rm -rf $GLM_HOME
node packages/cli/dist/bin.js daemon start

# Drop a screenshot into the attachments dir as if the TUI placed it there
mkdir -p $GLM_HOME/.glm/sessions/SESS/attachments
cp ~/Desktop/some-screenshot.png $GLM_HOME/.glm/sessions/SESS/attachments/img_1.png
SHA=$(shasum -a 256 $GLM_HOME/.glm/sessions/SESS/attachments/img_1.png | cut -d' ' -f1)

# Default `image_analysis` routing via attachments[]:
# (would normally come from TUI's message.send; here we drive it via a future llm.call adapter)

# Explicit /vision invocation:
node packages/cli/dist/bin.js rpc 'vision.invoke' '{"tool":"ocr","attachmentRef":{"kind":"attachment","n":1},"sessionId":"SESS"}'
# → response.result.description should be the OCR text

# Cached-hit verification:
ls $GLM_HOME/.glm/cache/vision/             # should have <sha>__extract_text_from_screenshot.json
# Re-run the same vision.invoke → daemon log shows "cache hit"

node packages/cli/dist/bin.js daemon stop
```

- [ ] **Step 17: Commit**

```bash
git add packages/llm-router packages/shared/src/llm-router-types.ts
git commit -m "feat(llm-router): glm-vision MCP auto-routing + sha256 cache + /vision tool selection (P6-Fix-9 / P6-Fix-10 — spec §9.12)"
```

---

## P6 Completion — Verification Checklist

Run all of these and confirm output before claiming P6 done:

- [ ] **Build clean:** `pnpm build` → 0 errors
- [ ] **All tests pass:** `pnpm vitest run` → all green (~50+ tests across 11 files in llm-router + 4 in core)
- [ ] **Real-model smoke (with a valid GLM_API_KEY):**
  ```bash
  export GLM_API_KEY="$REAL_KEY"
  export GLM_HOME=/tmp/glm-p6-real-$$
  node packages/cli/dist/bin.js daemon start
  node packages/cli/dist/bin.js "What is 2+2? Answer in one word."  # expect: real GLM response, not echo
  node packages/cli/dist/bin.js cache stats                          # expect: 1 entry
  node packages/cli/dist/bin.js "What is 2+2? Answer in one word."  # expect: same answer, cached=true on the wire
  node packages/cli/dist/bin.js quota                                # expect: coding pool > 0
  node packages/cli/dist/bin.js daemon stop
  ```
- [ ] **Multi-profile:**
  ```bash
  cat > ~/.glm/credentials.json <<'EOF'
  { "defaultProfile": "work",
    "profiles": { "work": { "apiKey": "K1", "tier": "lite" },
                  "personal": { "apiKey": "K2", "tier": "pro" } } }
  EOF
  chmod 600 ~/.glm/credentials.json
  node packages/cli/dist/bin.js profile list           # expect: ● work / ○ personal
  node packages/cli/dist/bin.js profile use personal   # expect: ✓ default profile = personal
  ```
- [ ] **Cache clear:**
  ```bash
  node packages/cli/dist/bin.js cache clear            # expect: ✓ cleared N entries
  ```
- [ ] **Cancel mid-stream (manual)**: a long-prompt run interrupted by Ctrl-C from a future `llm.call` consumer should still commit the partial text to `messages`. Verified by unit (service.test cancel) + integration test infrastructure; CLI-level user-visible cancel is implemented in P2 (TUI).
- [ ] **Action × Thinking resolver (P6-Fix-7):** `pnpm vitest run packages/llm-router/test/unit/action-resolver.test.ts` → 8 green (covers all 5 priority tiers + 20-role enumeration).
- [ ] **Thinking budgets + OpenAI degradation (P6-Fix-8):** `pnpm vitest run packages/llm-router/test/unit/thinking-budgets.test.ts` → 8 green (Anthropic `budget_tokens` + OpenAI `reasoning_effort` + warn on `min`/`xhigh` degradation).
- [ ] **Settings round-trip:** `pnpm vitest run packages/llm-router/test/integration/resolver-settings.test.ts` → 3 green.
- [ ] **`glm model` CLI smoke:**
  ```bash
  node packages/cli/dist/bin.js model show              # 8 rows
  node packages/cli/dist/bin.js model set slow glm-5 xhigh
  node packages/cli/dist/bin.js model show slow         # slow → glm-5 (xhigh)
  jq '.actions.slow' ~/.glm/settings.json               # persisted
  node packages/cli/dist/bin.js model reset slow        # back to GLM-5.1 xhigh
  ```
- [ ] **Vision routing — cache + LRU (P6-Fix-9):** `pnpm vitest run packages/llm-router/test/unit/vision-cache.test.ts` → 5 green (miss, put/get, per-tool separation, LRU eviction, corrupted JSON handled).
- [ ] **Vision router — fan-out + `/raw` bypass + quota guard (P6-Fix-9):** `pnpm vitest run packages/llm-router/test/unit/vision-router.test.ts` → 9 green (cache hit/miss × 2, parallel × 2, raw bypass, unsupported format, pool exhausted, explicit tool override).
- [ ] **`/vision` tool selection (P6-Fix-10):** `pnpm vitest run packages/llm-router/test/unit/vision-tools.test.ts` → 5 green (4-tool slash mapping + attachment-ref resolution + arg pass-through + missing attachment + unknown tool zod rejection).
- [ ] **LLMService ↔ VisionRouter integration:** `pnpm vitest run packages/llm-router/test/integration/vision-mcp.test.ts` → 1 green (vision-rewritten text reaches provider with `<attachment N description>` block injected).
- [ ] **Vision MCP smoke (with bundled glm-vision running):**
  ```bash
  mkdir -p $GLM_HOME/.glm/sessions/SESS/attachments
  cp ~/Desktop/some-screenshot.png $GLM_HOME/.glm/sessions/SESS/attachments/img_1.png
  node packages/cli/dist/bin.js rpc 'vision.invoke' '{"tool":"ocr","attachmentRef":{"kind":"attachment","n":1},"sessionId":"SESS"}'
  # → response.result.description is non-empty
  ls $GLM_HOME/.glm/cache/vision/                       # <sha>__extract_text_from_screenshot.json present
  ```
- [ ] **No leaked sockets / processes:** `ps aux | grep daemon-entry` empty after stop; `lsof -U | grep daemon.sock` empty.

If any of the above fails, fix before declaring P6 done.

---

## What P6 does NOT include (deferred)

These are intentionally out of scope for P6:

- **Full rate-limit-aware Scheduler with model fallback chain** — §7.5 scheduler that picks alternate models when slots saturate, including queue depth tracking and dispatch decisions, is **P8** (orchestrator + sub-agent fan-out). P6 has the foundational concurrency constant table (`CONCURRENCY`) but no scheduler over it.
- **Local fallback providers** (Ollama / vLLM) — **non-goal**. glm code is GLM Coding Plan 전용. `baseUrl` override exists only for testing/staging.
- **Other proxy / aggregator providers** (OpenRouter, etc.) — **non-goal**. Single-vendor focus.
- **Vision MCP server itself** — the bundled `glm-vision` stdio process is registered + booted by **P4 (MCP host)**. P6's `VisionRouter` (Task 18) drives it through `daemon.mcpHost.callTool('glm-vision', …)`; if P4 hasn't loaded the server yet the router surfaces a graceful "vision MCP unreachable" warning in-message instead of crashing the call. Cache GC (50MB cap) ships in Task 18 (LRU on insert); periodic on-disk cleanup of stale entries lives in **P10 `glm gc`** (P10-Fix-15).
- **Token-accurate countTokens** — current implementation uses 4-char heuristic; remote `/v1/messages/count_tokens` integration is a small follow-up but not required for P6 acceptance.
- **Cache eviction / LRU** — `llm_cache` table grows unboundedly within a session. `glm cache clear` is the manual escape hatch. LRU + size-based GC is part of **P10 storage cleanup / `glm gc`**.
- **Anthropic Keychain helper write path** — `readKeychain` exists; CLI `glm keychain add/remove` is deferred.
- **Streaming through TUI** — `llm.call` + `llm.events` work at the protocol level. The interactive REPL consumer is **P2 (Ink TUI)**.
- **Bidirectional rate-limit feedback** — observing X-RateLimit-* response headers updates `quota_pools.refresh_at` and `daily_limit`, but the scheduler-side `quotaOk(slot)` gate (§7.5) using those values lives in **P8**.
- **Crash-safe in-flight call recovery** — if the daemon dies mid-stream, the in-progress call's partial response is lost. Resume from `llm_cache` only catches *completed* calls. Checkpoint-aware resume of in-flight calls is **P10 long-horizon**.
