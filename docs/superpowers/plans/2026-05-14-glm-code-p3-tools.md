# glm code — P3: Built-in Tool Layer (Hashline Edit + Internal URL Read + Bash/Grep/Glob/Todo)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the tool surface that an LLM agent uses to read code, edit code, run shell, and track its own work. P3 wires nine first-party tools (`Read`, `Write`, `Edit`, `MultiEdit`, `Grep`, `Glob`, `Bash`, `Task`, `TodoWrite`) into a unified `ToolRegistry`. The killer tools are (a) **Hashline-anchored Edit** — every line carries a 2-character xxHash bigram so the LLM can target lines by `LINE+HASH` without snapshot drift, and (b) **Internal URL Read** — a single `Read(url)` dispatcher that fans out across `local://`, `issue://`, `pr://`, `memory://`, `mcp://`, `skill://`, `rule://`, `agent://`, `artifact://`, `conflict://`. Tools are exposed to daemon clients via RPC methods `tool.call` and `tool.list`.

**Architecture:** All tools live inside `@glm/core` under `packages/core/src/tools/`. Each tool implements the `ToolHandler` interface (`{ name, schema, run(params, ctx) }`). A singleton `ToolRegistry` collects handlers, validates params with `zod`, and runs them inside a permission gate (`checkPermission`) plus an event-emitting `ToolContext` (so future hook plumbing in P5 can intercept). The Internal URL `Read` walks a `Map<scheme, UrlHandler>` populated at registry-init time; the `local://` handler is the only one that touches files in P3, the rest stub with sensible payloads. Hashline tooling sits in `tools/hashline/` and is shared between `Read` (when `format: 'hashline'`) and `Edit/MultiEdit` (for anchor verification).

**Tech Stack:** Node 22+, TypeScript 5.6+, `xxhash-wasm` (hash), `fast-glob` (glob), `picomatch` (permission glob), child_process (Bash), better-sqlite3 (TodoWrite persistence — re-uses P1 `session.db`).

**Acceptance criteria for P3:**
- `ToolRegistry.list()` returns 9 tool descriptors; `register()` rejects duplicate names.
- `Read({ url: 'local://README.md', format: 'hashline' })` returns lines as `42sr|<text>`.
- `Edit({ path, ops: [{ anchor: '5sr', action: 'replace', text: '~new' }] })` verifies hash, applies, writes atomically.
- `Edit` recovery: same hash within ±5 lines → shift correction succeeds; anywhere in file → adjacent-context match succeeds; otherwise abort.
- `MultiEdit` is atomic: any op fails → no write occurs.
- `Grep` falls back to JS regex if `rg` is missing; `Glob` uses fast-glob with `gitignore: true`.
- `Bash` streams stdout/stderr via events, enforces `timeoutMs`, kills tree on timeout.
- `Task` and a few URL schemes (`memory://`, `mcp://`, `skill://`, `agent://`) return a `not_implemented` stub with `phase: 'P4'/'P7'/'P8'`.
- `TodoWrite` persists per-session todos in SQLite (`todos` table, migration 002).
- `tool.call` and `tool.list` are reachable over the daemon RPC; `permissions.allow`/`permissions.deny` glob in settings.json is parsed (enforcement plumbing finishes in P5).
- 80%+ unit coverage on `tools/**`; all P3 integration tests pass.

---

## File Structure

```
glm-code/
├── packages/
│   ├── core/
│   │   ├── package.json                        # +xxhash-wasm, +fast-glob, +picomatch
│   │   ├── src/
│   │   │   ├── tools/
│   │   │   │   ├── index.ts                    # re-exports + default registry factory
│   │   │   │   ├── registry.ts                 # ToolRegistry class
│   │   │   │   ├── context.ts                  # ToolContext + event types
│   │   │   │   ├── permission.ts               # checkPermission(name, params, settings)
│   │   │   │   ├── errors.ts                   # ToolError / ToolErrorCode
│   │   │   │   ├── hashline/
│   │   │   │   │   ├── bigrams.json            # 647-entry bigram table (committed asset)
│   │   │   │   │   ├── bigrams.ts              # loader + ASSERT_LEN
│   │   │   │   │   ├── hash.ts                 # xxhash-wasm singleton + computeAnchor
│   │   │   │   │   ├── format.ts               # toHashlines / parseAnchor
│   │   │   │   │   └── recover.ts              # ±5-line search + adjacent-context match
│   │   │   │   ├── read/
│   │   │   │   │   ├── tool.ts                 # the Read handler
│   │   │   │   │   ├── selector.ts             # ":N" / ":A-B" / ":A+C" / ":raw" parser
│   │   │   │   │   ├── url-router.ts           # scheme → handler dispatch
│   │   │   │   │   └── schemes/
│   │   │   │   │       ├── local.ts            # FULL impl
│   │   │   │   │       ├── memory.ts           # stub (P7)
│   │   │   │   │       ├── mcp.ts              # stub (P4)
│   │   │   │   │       ├── skill.ts            # stub (P4)
│   │   │   │   │       ├── rule.ts             # stub (P4)
│   │   │   │   │       ├── agent.ts            # stub (P8)
│   │   │   │   │       ├── artifact.ts         # stub (P10 blob store)
│   │   │   │   │       ├── conflict.ts         # stub (v0.2)
│   │   │   │   │       ├── issue.ts            # FULL via `gh issue view --json`
│   │   │   │   │       └── pr.ts               # FULL via `gh pr view --json`
│   │   │   │   ├── write/
│   │   │   │   │   └── tool.ts                 # atomic write (tmp + rename)
│   │   │   │   ├── edit/
│   │   │   │   │   ├── tool.ts                 # Edit handler (single op shorthand for MultiEdit)
│   │   │   │   │   ├── multi.ts                # MultiEdit handler (atomic batch)
│   │   │   │   │   ├── apply.ts                # op planner / line splicer
│   │   │   │   │   └── prefixes.ts             # echo-prefix strip ("~" payload separator)
│   │   │   │   ├── grep/
│   │   │   │   │   ├── tool.ts                 # detect rg, dispatch rg | js
│   │   │   │   │   ├── rg.ts                   # rg adapter
│   │   │   │   │   └── js.ts                   # JS fallback (recursive walk + regex)
│   │   │   │   ├── glob/
│   │   │   │   │   └── tool.ts                 # fast-glob wrapper
│   │   │   │   ├── bash/
│   │   │   │   │   ├── tool.ts                 # spawn + stream + timeout
│   │   │   │   │   └── kill-tree.ts            # POSIX process-group kill
│   │   │   │   ├── task/
│   │   │   │   │   └── tool.ts                 # stub (P8) — schema only
│   │   │   │   └── todo/
│   │   │   │       ├── tool.ts                 # TodoWrite handler
│   │   │   │       └── repo.ts                 # SQLite CRUD for todos table
│   │   │   ├── storage/
│   │   │   │   ├── migrations/
│   │   │   │   │   └── 002_tools.sql           # NEW: todos + tool_call_log tables
│   │   │   │   └── todo-repo.ts                # NEW: re-exports tools/todo/repo for storage idiom
│   │   │   └── rpc/
│   │   │       └── methods/
│   │   │           └── tool.ts                 # NEW: tool.call + tool.list RPC handlers
│   │   └── test/
│   │       ├── unit/
│   │       │   ├── tools/
│   │       │   │   ├── registry.test.ts
│   │       │   │   ├── permission.test.ts
│   │       │   │   ├── hashline-format.test.ts
│   │       │   │   ├── hashline-recover.test.ts
│   │       │   │   ├── selector.test.ts
│   │       │   │   ├── url-router.test.ts
│   │       │   │   ├── read-local.test.ts
│   │       │   │   ├── write.test.ts
│   │       │   │   ├── edit-apply.test.ts
│   │       │   │   ├── multi-edit.test.ts
│   │       │   │   ├── grep-js.test.ts
│   │       │   │   ├── glob.test.ts
│   │       │   │   ├── bash.test.ts
│   │       │   │   └── todo-repo.test.ts
│   │       └── integration/
│   │           ├── tool-rpc.test.ts            # round-trip via daemon socket
│   │           └── read-hashline-edit.test.ts  # full Read→hashline→Edit cycle
```

---

## Task 1: Tool layer scaffolding — registry, context, errors, permission stub

**Files:**
- Create: `packages/core/src/tools/index.ts`
- Create: `packages/core/src/tools/registry.ts`
- Create: `packages/core/src/tools/context.ts`
- Create: `packages/core/src/tools/errors.ts`
- Create: `packages/core/src/tools/permission.ts`
- Test:   `packages/core/test/unit/tools/registry.test.ts`
- Test:   `packages/core/test/unit/tools/permission.test.ts`
- Modify: `packages/core/package.json` (add `picomatch`)

- [ ] **Step 1: Add `picomatch` to core deps**

```bash
pnpm --filter @glm/core add picomatch@^4.0.2
pnpm --filter @glm/core add -D @types/picomatch@^3.0.0
```

Expected: `packages/core/package.json` gains `"picomatch": "^4.0.2"`.

- [ ] **Step 2: Write failing test for `ToolRegistry`**

`packages/core/test/unit/tools/registry.test.ts`:
```ts
import { describe, expect, test, vi } from 'vitest'
import { z } from 'zod'
import { ToolRegistry } from '../../../src/tools/registry.js'
import { makeNullContext } from '../../../src/tools/context.js'

describe('ToolRegistry', () => {
  test('register + list returns descriptor', () => {
    const reg = new ToolRegistry()
    reg.register({
      name: 'ping',
      description: 'returns pong',
      schema: z.object({}),
      run: async () => ({ ok: true, data: 'pong' }),
    })
    const list = reg.list()
    expect(list).toHaveLength(1)
    expect(list[0]?.name).toBe('ping')
    expect(list[0]?.description).toBe('returns pong')
  })

  test('duplicate register throws', () => {
    const reg = new ToolRegistry()
    const tool = { name: 'x', description: '', schema: z.object({}), run: async () => ({ ok: true, data: 1 }) }
    reg.register(tool)
    expect(() => reg.register(tool)).toThrow(/already registered/i)
  })

  test('unregister removes a tool by name', () => {
    const reg = new ToolRegistry()
    const tool = { name: 'unreg', description: '', schema: z.object({}), run: async () => ({ ok: true, data: 1 }) }
    reg.register(tool)
    expect(reg.has('unreg')).toBe(true)
    reg.unregister('unreg')
    expect(reg.has('unreg')).toBe(false)
    // After unregister, re-register must succeed.
    expect(() => reg.register(tool)).not.toThrow()
  })

  test('unregister of unknown tool is a silent no-op', () => {
    const reg = new ToolRegistry()
    expect(() => reg.unregister('does-not-exist')).not.toThrow()
  })

  test('call validates params against zod schema', async () => {
    const reg = new ToolRegistry()
    reg.register({
      name: 'echo',
      description: '',
      schema: z.object({ msg: z.string() }),
      run: async (p) => ({ ok: true, data: p.msg }),
    })
    const ok = await reg.call('echo', { msg: 'hi' }, makeNullContext())
    expect(ok.ok).toBe(true)
    expect(ok.ok && ok.data).toBe('hi')
    const bad = await reg.call('echo', { msg: 42 }, makeNullContext())
    expect(bad.ok).toBe(false)
    expect(!bad.ok && bad.error.code).toBe('VALIDATION_ERROR')
  })

  test('call returns NOT_FOUND for unknown tool', async () => {
    const reg = new ToolRegistry()
    const r = await reg.call('nope', {}, makeNullContext())
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error.code).toBe('NOT_FOUND')
  })

  test('run errors are caught and shaped as RUNTIME_ERROR', async () => {
    const reg = new ToolRegistry()
    reg.register({
      name: 'boom', description: '', schema: z.object({}),
      run: async () => { throw new Error('kaboom') },
    })
    const r = await reg.call('boom', {}, makeNullContext())
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error.code).toBe('RUNTIME_ERROR')
    expect(!r.ok && r.error.message).toMatch(/kaboom/)
  })
})
```

- [ ] **Step 3: Run test — should FAIL**

```bash
pnpm vitest run packages/core/test/unit/tools/registry.test.ts
```

Expected: FAIL with "Cannot find module ../../../src/tools/registry".

- [ ] **Step 4: Implement errors + context + registry**

`packages/core/src/tools/errors.ts`:
```ts
export type ToolErrorCode =
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'PERMISSION_DENIED'
  | 'RUNTIME_ERROR'
  | 'TIMEOUT'
  | 'NOT_IMPLEMENTED'
  | 'IO_ERROR'
  | 'HASH_MISMATCH'

export interface ToolError {
  code: ToolErrorCode
  message: string
  detail?: unknown
}

export class ToolFailure extends Error {
  readonly code: ToolErrorCode
  readonly detail?: unknown
  constructor(code: ToolErrorCode, message: string, detail?: unknown) {
    super(message)
    this.code = code
    this.detail = detail
  }
}

export type ToolResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: ToolError }
```

`packages/core/src/tools/context.ts`:
```ts
import { EventEmitter } from 'node:events'
import type { GlmPaths } from '@glm/shared'

export interface ToolEvent {
  type: 'start' | 'progress' | 'stdout' | 'stderr' | 'end' | 'error'
  tool: string
  callId: string
  data?: unknown
}

export interface ToolContext {
  sessionId: string | null
  cwd: string
  paths: GlmPaths
  emit: (e: ToolEvent) => void
  signal: AbortSignal
  settings: Record<string, unknown>
}

export function makeNullContext(overrides: Partial<ToolContext> = {}): ToolContext {
  const ee = new EventEmitter()
  return {
    sessionId: null,
    cwd: process.cwd(),
    paths: {
      root: '/tmp/glm-null',
      socket: '/tmp/glm-null/daemon.sock',
      pid: '/tmp/glm-null/daemon.pid',
      log: '/tmp/glm-null/daemon.log',
      sessionsDir: '/tmp/glm-null/sessions',
      quotaDb: '/tmp/glm-null/quota.db',
      configFile: '/tmp/glm-null/settings.json',
      agentsMd: '/tmp/glm-null/AGENTS.md',
    } as GlmPaths,
    emit: (e) => ee.emit(e.type, e),
    signal: new AbortController().signal,
    settings: {},
    ...overrides,
  }
}
```

`packages/core/src/tools/registry.ts`:
```ts
import { z, ZodError, type ZodTypeAny } from 'zod'
import { ulid } from '@glm/shared'
import type { ToolContext } from './context.js'
import type { ToolError, ToolResult } from './errors.js'
import { ToolFailure } from './errors.js'

export interface ToolHandler<P = unknown, R = unknown> {
  name: string
  description: string
  schema: ZodTypeAny
  run: (params: P, ctx: ToolContext) => Promise<ToolResult<R>>
}

export interface ToolDescriptor {
  name: string
  description: string
  schema: unknown
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolHandler>()

  register(handler: ToolHandler): void {
    if (this.tools.has(handler.name)) {
      throw new Error(`Tool '${handler.name}' already registered`)
    }
    this.tools.set(handler.name, handler)
  }

  unregister(name: string): void {
    this.tools.delete(name)
  }

  has(name: string): boolean {
    return this.tools.has(name)
  }

  list(): ToolDescriptor[] {
    return [...this.tools.values()].map((t) => ({
      name: t.name,
      description: t.description,
      schema: zodToJsonShape(t.schema),
    }))
  }

  async call(name: string, params: unknown, ctx: ToolContext): Promise<ToolResult> {
    const handler = this.tools.get(name)
    if (!handler) return fail('NOT_FOUND', `unknown tool: ${name}`)

    let parsed: unknown
    try {
      parsed = handler.schema.parse(params ?? {})
    } catch (e) {
      const zerr = e as ZodError
      return fail('VALIDATION_ERROR', zerr.message, zerr.issues)
    }

    const callId = ulid()
    ctx.emit({ type: 'start', tool: name, callId })
    try {
      const out = await handler.run(parsed, ctx)
      ctx.emit({ type: 'end', tool: name, callId, data: out })
      return out
    } catch (e) {
      if (e instanceof ToolFailure) {
        ctx.emit({ type: 'error', tool: name, callId, data: e })
        return { ok: false, error: { code: e.code, message: e.message, detail: e.detail } }
      }
      const err = e as Error
      ctx.emit({ type: 'error', tool: name, callId, data: err })
      return fail('RUNTIME_ERROR', err.message ?? String(err))
    }
  }
}

function fail(code: ToolError['code'], message: string, detail?: unknown): ToolResult {
  return { ok: false, error: { code, message, detail } }
}

function zodToJsonShape(schema: ZodTypeAny): unknown {
  // Light-weight schema introspection — enough for `tool.list`. Full JSON-Schema
  // emit comes via `zod-to-json-schema` in P4 once MCP tool surface needs it.
  const def = (schema as unknown as { _def?: { typeName?: string } })._def
  return { _zod: def?.typeName ?? 'unknown' }
}
```

`packages/core/src/tools/index.ts`:
```ts
export * from './registry.js'
export * from './context.js'
export * from './errors.js'
export * from './permission.js'
```

- [ ] **Step 5: Run test — should PASS**

```bash
pnpm vitest run packages/core/test/unit/tools/registry.test.ts
```

Expected: PASS (7 tests).

- [ ] **Step 6: Write failing test for `checkPermission`**

`packages/core/test/unit/tools/permission.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { checkPermission } from '../../../src/tools/permission.js'

describe('checkPermission', () => {
  test('default-allow when no policy is set (P3 placeholder)', () => {
    expect(checkPermission('Bash', { command: 'ls' }, {}).allow).toBe(true)
  })

  test('settings.permissions.deny glob beats allow', () => {
    const r = checkPermission('Bash', { command: 'rm -rf /' }, {
      permissions: {
        allow: ['Bash(*)'],
        deny: ['Bash(rm *)'],
      },
    })
    expect(r.allow).toBe(false)
    expect(r.reason).toMatch(/deny/)
  })

  test('settings.permissions.allow whitelist matches Bash(npm *)', () => {
    const r = checkPermission('Bash', { command: 'npm install' }, {
      permissions: { allow: ['Bash(npm *)'] },
    })
    expect(r.allow).toBe(true)
  })

  test('non-Bash tools match by bare name', () => {
    const r = checkPermission('Read', { url: 'local://x.ts' }, {
      permissions: { allow: ['Read'] },
    })
    expect(r.allow).toBe(true)
  })

  test('url-pattern allow for Read', () => {
    const r = checkPermission('Read', { url: 'issue://owner/repo#42' }, {
      permissions: { allow: ['Read(issue://*)'] },
    })
    expect(r.allow).toBe(true)
  })
})
```

- [ ] **Step 7: Implement `checkPermission`**

`packages/core/src/tools/permission.ts`:
```ts
import picomatch from 'picomatch'

export interface PermissionDecision {
  allow: boolean
  reason?: string
  matchedRule?: string
}

interface Policy {
  permissions?: {
    allow?: string[]
    deny?: string[]
  }
}

/**
 * Settings.json rule grammar (Claude Code compat):
 *   "Bash(npm *)"           — tool=Bash with first arg matching "npm *"
 *   "Read"                  — any Read call
 *   "Read(issue://*)"       — Read with url matching "issue://*"
 *
 * Real enforcement (prompting / event audit) is wired into hooks in P5.
 * P3 only returns a boolean + reason so call-sites can short-circuit.
 */
export function checkPermission(
  tool: string,
  params: unknown,
  settings: Policy,
): PermissionDecision {
  const allow = settings.permissions?.allow ?? []
  const deny = settings.permissions?.deny ?? []
  const candidate = renderRuleArg(tool, params)

  for (const rule of deny) {
    if (matchesRule(rule, tool, candidate)) {
      return { allow: false, reason: `denied by '${rule}'`, matchedRule: rule }
    }
  }
  if (allow.length === 0) {
    // P3 placeholder: no explicit allow-list means allow.
    return { allow: true }
  }
  for (const rule of allow) {
    if (matchesRule(rule, tool, candidate)) {
      return { allow: true, matchedRule: rule }
    }
  }
  return { allow: false, reason: `no allow-rule matched '${tool}'` }
}

function renderRuleArg(tool: string, params: unknown): string {
  if (params && typeof params === 'object') {
    const p = params as Record<string, unknown>
    if (tool === 'Bash' && typeof p.command === 'string') return p.command
    if (tool === 'Read' && typeof p.url === 'string') return p.url
    if (tool === 'Write' && typeof p.path === 'string') return p.path
    if (tool === 'Edit' && typeof p.path === 'string') return p.path
  }
  return ''
}

function matchesRule(rule: string, tool: string, arg: string): boolean {
  const m = rule.match(/^([A-Za-z][A-Za-z0-9_-]*)(?:\((.+)\))?$/)
  if (!m) return false
  const [, ruleTool, ruleArg] = m
  if (ruleTool !== tool) return false
  if (!ruleArg) return true
  return picomatch.isMatch(arg, ruleArg, { dot: true, contains: false })
}
```

- [ ] **Step 8: Run permission test — should PASS**

```bash
pnpm vitest run packages/core/test/unit/tools/permission.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(core): tool registry, context, permission stub (P3 task 1)"
```

---

## Task 2: Hashline algorithm — bigrams asset + xxhash + format

**Files:**
- Create: `packages/core/src/tools/hashline/bigrams.json`
- Create: `packages/core/src/tools/hashline/bigrams.ts`
- Create: `packages/core/src/tools/hashline/hash.ts`
- Create: `packages/core/src/tools/hashline/format.ts`
- Test:   `packages/core/test/unit/tools/hashline-format.test.ts`
- Modify: `packages/core/package.json` (add `xxhash-wasm`)

- [ ] **Step 1: Add `xxhash-wasm` to core deps**

```bash
pnpm --filter @glm/core add xxhash-wasm@^1.0.2
```

Expected: `packages/core/package.json` gains `"xxhash-wasm": "^1.0.2"`.

- [ ] **Step 2: Source the 647-entry bigram table**

The bigram list is a fixed asset adapted from oh-my-pi's `bigrams.json`. Each entry is a 2-character BPE single-token bigram (alpha-low + alpha-low or similar), and the list must be exactly **647** entries long. Two generation paths are supported — pick (a) for v0.1; (b) is reserved for v0.2 when a tokenizer is bundled:

  - **(a) Use the canonical oh-my-pi list (recommended).** Copy the 647 strings as JSON array; commit verbatim.
  - **(b) Re-derive from a tokenizer.** Run an offline script that enumerates two-char BPE single tokens from a target tokenizer (`o200k_base` or similar), filters to ASCII lower-case bigrams whose joined form is exactly 1 token, then takes the first 647 in deterministic Unicode order. This produces the same shape and is a v0.2 task.

`packages/core/src/tools/hashline/bigrams.json` (truncated illustration — the committed file is one line of 647 entries):

```json
[
  "aa","ab","ac","ad","ae","af","ag","ah","ai","aj","ak","al","am","an","ao","ap",
  "aq","ar","as","at","au","av","aw","ax","ay","az","ba","bc","bd","be","bf","bg",
  "bh","bi","bj","bk","bl","bm","bn","bo","bp","br","bs","bt","bu","bw","by","ca",
  "cb","cc","cd","ce","cf","ch","ci","ck","cl","cm","cn","co","cp","cr","cs","ct",
  "cu","cv","cw","cy","cz","da","db","dc","dd","de","df","dg","dh","di","dj","dk",
  "dl","dm","dn","do","dp","dr","ds","dt","du","dv","dw","dy","ea","eb","ec","ed",
  "ee","ef","eg","eh","ei","ej","ek","el","em","en","eo","ep","eq","er","es","et",
  "...":  "(continues to index 646 — 647 strings total)"
]
```

> The committed JSON contains no comments and no `"..."` placeholder. It is a flat array of exactly 647 strings.

Verification command (one-liner) after writing the file:

```bash
node -e "const b=require('./packages/core/src/tools/hashline/bigrams.json');console.log(b.length, new Set(b).size)"
```

Expected: `647 647` (length and unique count both 647).

- [ ] **Step 3: Write failing test for hashline format**

`packages/core/test/unit/tools/hashline-format.test.ts`:
```ts
import { describe, expect, test, beforeAll } from 'vitest'
import { initHashline, computeAnchor } from '../../../src/tools/hashline/hash.js'
import { toHashlines, parseAnchor, splitAnchorRange } from '../../../src/tools/hashline/format.js'

beforeAll(async () => { await initHashline() })

describe('hashline format', () => {
  test('toHashlines emits LINE+HASH|TEXT', () => {
    const lines = toHashlines('alpha\nbeta\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatch(/^1[a-z]{2}\|alpha$/)
    expect(lines[1]).toMatch(/^2[a-z]{2}\|beta$/)
  })

  test('toHashlines is deterministic', () => {
    const a = toHashlines('hello\nworld\n')
    const b = toHashlines('hello\nworld\n')
    expect(a).toEqual(b)
  })

  test('computeAnchor returns hash equal to formatted line hash', () => {
    const lines = toHashlines('foo\n')
    const h = computeAnchor('foo')
    expect(lines[0]).toBe(`1${h}|foo`)
  })

  test('parseAnchor splits LINE and HASH', () => {
    expect(parseAnchor('42sr')).toEqual({ line: 42, hash: 'sr' })
    expect(parseAnchor('1aa')).toEqual({ line: 1, hash: 'aa' })
  })

  test('parseAnchor rejects malformed input', () => {
    expect(() => parseAnchor('42')).toThrow()
    expect(() => parseAnchor('xxsr')).toThrow()
    expect(() => parseAnchor('')).toThrow()
  })

  test('splitAnchorRange handles "5sr-9hd"', () => {
    expect(splitAnchorRange('5sr-9hd')).toEqual({
      start: { line: 5, hash: 'sr' },
      end:   { line: 9, hash: 'hd' },
    })
  })
})
```

- [ ] **Step 4: Run test — should FAIL**

```bash
pnpm vitest run packages/core/test/unit/tools/hashline-format.test.ts
```

Expected: FAIL with "Cannot find module .../hashline/hash".

- [ ] **Step 5: Implement bigram loader**

`packages/core/src/tools/hashline/bigrams.ts`:
```ts
import bigramsData from './bigrams.json' with { type: 'json' }

export const BIGRAMS: readonly string[] = bigramsData as string[]
export const BIGRAM_COUNT = BIGRAMS.length

if (BIGRAM_COUNT !== 647) {
  throw new Error(`hashline: bigrams.json must contain exactly 647 entries (got ${BIGRAM_COUNT})`)
}
```

- [ ] **Step 6: Implement xxhash anchor**

`packages/core/src/tools/hashline/hash.ts`:
```ts
import xxhash from 'xxhash-wasm'
import { BIGRAMS, BIGRAM_COUNT } from './bigrams.js'

type XxApi = Awaited<ReturnType<typeof xxhash>>
let api: XxApi | null = null

export async function initHashline(): Promise<void> {
  if (!api) api = await xxhash()
}

export function isHashlineReady(): boolean {
  return api !== null
}

/**
 * Compute the 2-character hash anchor for a single line's content.
 * Trailing newlines are NOT included in the hash domain — the caller passes raw line text.
 */
export function computeAnchor(line: string): string {
  if (!api) throw new Error('hashline not initialized — call initHashline() first')
  const h32 = api.h32(line, 0) >>> 0
  const idx = h32 % BIGRAM_COUNT
  return BIGRAMS[idx]!
}
```

- [ ] **Step 7: Implement format/parse helpers**

`packages/core/src/tools/hashline/format.ts`:
```ts
import { computeAnchor } from './hash.js'

export interface Anchor { line: number; hash: string }
export interface AnchorRange { start: Anchor; end: Anchor }

const ANCHOR_RE = /^(\d+)([a-z]{2})$/

export function toHashlines(text: string): string[] {
  // Split on \n, drop the trailing empty produced by a trailing newline so we don't emit a phantom line.
  const raw = text.split('\n')
  if (raw.length > 0 && raw[raw.length - 1] === '') raw.pop()
  return raw.map((line, i) => `${i + 1}${computeAnchor(line)}|${line}`)
}

export function parseAnchor(s: string): Anchor {
  const m = ANCHOR_RE.exec(s)
  if (!m) throw new Error(`malformed anchor: '${s}' (expected <line><hash>, e.g. 42sr)`)
  return { line: Number(m[1]), hash: m[2]! }
}

export function splitAnchorRange(s: string): AnchorRange {
  const [a, b] = s.split('-')
  if (!a || !b) throw new Error(`malformed anchor range: '${s}' (expected 'Nxx-Myy')`)
  return { start: parseAnchor(a), end: parseAnchor(b) }
}

export function isAnchor(s: string): boolean {
  return ANCHOR_RE.test(s)
}
```

- [ ] **Step 8: Run hashline-format test — should PASS**

```bash
pnpm vitest run packages/core/test/unit/tools/hashline-format.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(core): hashline bigrams + xxhash anchor + format (P3 task 2)"
```

---

## Task 3: Hashline recovery — shift correction + adjacent-context match

**Files:**
- Create: `packages/core/src/tools/hashline/recover.ts`
- Test:   `packages/core/test/unit/tools/hashline-recover.test.ts`

- [ ] **Step 1: Write failing test for recovery**

`packages/core/test/unit/tools/hashline-recover.test.ts`:
```ts
import { describe, expect, test, beforeAll } from 'vitest'
import { initHashline, computeAnchor } from '../../../src/tools/hashline/hash.js'
import { recoverAnchor } from '../../../src/tools/hashline/recover.js'

beforeAll(async () => { await initHashline() })

describe('recoverAnchor', () => {
  const FILE = [
    'alpha',     // line 1
    'beta',      // line 2
    'gamma',     // line 3
    'delta',     // line 4
    'epsilon',   // line 5
    'zeta',      // line 6
    'eta',       // line 7
    'theta',     // line 8
  ]

  test('exact match returns same line', () => {
    const r = recoverAnchor(FILE, { line: 3, hash: computeAnchor('gamma') })
    expect(r.kind).toBe('exact')
    expect(r.line).toBe(3)
  })

  test('±5-line shift recovers when content moved', () => {
    // The line "gamma" is anchored as if it were at line 7 — searched ±5
    const r = recoverAnchor(FILE, { line: 7, hash: computeAnchor('gamma') })
    expect(r.kind).toBe('shift')
    expect(r.line).toBe(3)
  })

  test('whole-file fallback finds a unique match outside ±5 window', () => {
    const long = Array.from({ length: 50 }, (_, i) => `noise-${i}`)
    long[40] = 'unique-target'
    const r = recoverAnchor(long, { line: 2, hash: computeAnchor('unique-target') })
    expect(r.kind).toBe('whole')
    expect(r.line).toBe(41) // 1-indexed
  })

  test('ambiguous whole-file match returns ambiguous when adjacent context unhelpful', () => {
    const dupes = ['x', 'y', 'dup', 'z', 'w', 'dup', 'q', 'r']
    const r = recoverAnchor(dupes, { line: 99, hash: computeAnchor('dup') }, { adjacentBefore: '', adjacentAfter: '' })
    expect(r.kind).toBe('ambiguous')
  })

  test('adjacent-context disambiguates duplicates', () => {
    const dupes = ['x', 'y', 'dup', 'z', 'w', 'dup', 'q', 'r']
    const r = recoverAnchor(dupes, { line: 99, hash: computeAnchor('dup') }, { adjacentBefore: 'w', adjacentAfter: 'q' })
    expect(r.kind).toBe('whole')
    expect(r.line).toBe(6) // the second 'dup' between 'w' and 'q'
  })

  test('hash not found anywhere returns miss', () => {
    const r = recoverAnchor(FILE, { line: 3, hash: 'zz' })
    expect(r.kind).toBe('miss')
  })
})
```

- [ ] **Step 2: Run test — should FAIL**

```bash
pnpm vitest run packages/core/test/unit/tools/hashline-recover.test.ts
```

Expected: FAIL with "Cannot find module .../hashline/recover".

- [ ] **Step 3: Implement recovery**

`packages/core/src/tools/hashline/recover.ts`:
```ts
import { computeAnchor } from './hash.js'

export interface AnchorTarget { line: number; hash: string }

export interface RecoverHint {
  /** Optional content the LLM saw on the line immediately before the anchor */
  adjacentBefore?: string
  /** Optional content the LLM saw on the line immediately after the anchor */
  adjacentAfter?: string
}

export type RecoverResult =
  | { kind: 'exact';     line: number }
  | { kind: 'shift';     line: number; delta: number }
  | { kind: 'whole';     line: number; method: 'unique' | 'adjacent' }
  | { kind: 'ambiguous'; candidates: number[] }
  | { kind: 'miss' }

const SHIFT_WINDOW = 5

export function recoverAnchor(
  lines: readonly string[],
  target: AnchorTarget,
  hint: RecoverHint = {},
): RecoverResult {
  // 1. Exact: current line matches.
  const exactIdx = target.line - 1
  if (exactIdx >= 0 && exactIdx < lines.length && computeAnchor(lines[exactIdx]!) === target.hash) {
    return { kind: 'exact', line: target.line }
  }

  // 2. ±SHIFT_WINDOW search.
  for (let d = 1; d <= SHIFT_WINDOW; d++) {
    for (const sign of [-1, 1] as const) {
      const idx = exactIdx + sign * d
      if (idx >= 0 && idx < lines.length && computeAnchor(lines[idx]!) === target.hash) {
        return { kind: 'shift', line: idx + 1, delta: sign * d }
      }
    }
  }

  // 3. Whole-file scan for matching hash.
  const hits: number[] = []
  for (let i = 0; i < lines.length; i++) {
    if (computeAnchor(lines[i]!) === target.hash) hits.push(i + 1)
  }
  if (hits.length === 0) return { kind: 'miss' }
  if (hits.length === 1) return { kind: 'whole', line: hits[0]!, method: 'unique' }

  // 4. Adjacent-context disambiguation.
  if (hint.adjacentBefore || hint.adjacentAfter) {
    const scored = hits.map((ln) => {
      const before = lines[ln - 2] ?? ''
      const after  = lines[ln]     ?? ''
      let score = 0
      if (hint.adjacentBefore && before === hint.adjacentBefore) score += 2
      if (hint.adjacentAfter  && after  === hint.adjacentAfter)  score += 2
      // partial-content fuzz: substring overlap counts 1
      if (hint.adjacentBefore && before.includes(hint.adjacentBefore)) score += 1
      if (hint.adjacentAfter  && after.includes(hint.adjacentAfter))   score += 1
      return { ln, score }
    })
    scored.sort((a, b) => b.score - a.score)
    const top = scored[0]!
    if (top.score > 0 && (scored[1]?.score ?? -1) < top.score) {
      return { kind: 'whole', line: top.ln, method: 'adjacent' }
    }
  }

  return { kind: 'ambiguous', candidates: hits }
}
```

- [ ] **Step 4: Run recover test — should PASS**

```bash
pnpm vitest run packages/core/test/unit/tools/hashline-recover.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(core): hashline recovery (shift + whole-file + adjacent) (P3 task 3)"
```

---

## Task 4: Internal URL router + selector parser + `local://` handler

**Files:**
- Create: `packages/core/src/tools/read/selector.ts`
- Create: `packages/core/src/tools/read/url-router.ts`
- Create: `packages/core/src/tools/read/schemes/local.ts`
- Create: `packages/core/src/tools/read/schemes/memory.ts`
- Create: `packages/core/src/tools/read/schemes/mcp.ts`
- Create: `packages/core/src/tools/read/schemes/skill.ts`
- Create: `packages/core/src/tools/read/schemes/rule.ts`
- Create: `packages/core/src/tools/read/schemes/agent.ts`
- Create: `packages/core/src/tools/read/schemes/artifact.ts`
- Create: `packages/core/src/tools/read/schemes/conflict.ts`
- Test:   `packages/core/test/unit/tools/selector.test.ts`
- Test:   `packages/core/test/unit/tools/url-router.test.ts`

- [ ] **Step 1: Write failing test for selector parser**

`packages/core/test/unit/tools/selector.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { parseSelector } from '../../../src/tools/read/selector.js'

describe('parseSelector', () => {
  test('no selector → null range', () => {
    expect(parseSelector('src/x.ts')).toEqual({ path: 'src/x.ts', range: null })
  })

  test(':N → single line', () => {
    expect(parseSelector('src/x.ts:42')).toEqual({
      path: 'src/x.ts',
      range: { kind: 'single', line: 42 },
    })
  })

  test(':A-B → inclusive range', () => {
    expect(parseSelector('src/x.ts:10-50')).toEqual({
      path: 'src/x.ts',
      range: { kind: 'inclusive', start: 10, end: 50 },
    })
  })

  test(':A+C → start + count', () => {
    expect(parseSelector('src/x.ts:10+20')).toEqual({
      path: 'src/x.ts',
      range: { kind: 'count', start: 10, count: 20 },
    })
  })

  test(':raw → raw flag, no range', () => {
    expect(parseSelector('src/x.ts:raw')).toEqual({
      path: 'src/x.ts',
      range: { kind: 'raw' },
    })
  })

  test('Windows-style path with drive letter still parses the last colon as selector', () => {
    expect(parseSelector('/abs/with:colon/x.ts:10-20')).toEqual({
      path: '/abs/with:colon/x.ts',
      range: { kind: 'inclusive', start: 10, end: 20 },
    })
  })

  test('reverse range throws', () => {
    expect(() => parseSelector('src/x.ts:50-10')).toThrow(/range/i)
  })
})
```

- [ ] **Step 2: Run selector test — should FAIL**

```bash
pnpm vitest run packages/core/test/unit/tools/selector.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement selector parser**

`packages/core/src/tools/read/selector.ts`:
```ts
export type Range =
  | { kind: 'single';    line: number }
  | { kind: 'inclusive'; start: number; end: number }
  | { kind: 'count';     start: number; count: number }
  | { kind: 'raw' }

export interface ParsedPath {
  path: string
  range: Range | null
}

// Selector suffix is everything after the LAST ":" — that lets paths with
// embedded colons (rare) still parse correctly.
const SUFFIX_RE = /^(\d+)(?:([-+])(\d+))?$|^(raw)$/

export function parseSelector(input: string): ParsedPath {
  const lastColon = input.lastIndexOf(':')
  if (lastColon < 0) return { path: input, range: null }
  const head = input.slice(0, lastColon)
  const tail = input.slice(lastColon + 1)
  const m = SUFFIX_RE.exec(tail)
  if (!m) return { path: input, range: null }

  if (m[4] === 'raw') return { path: head, range: { kind: 'raw' } }

  const a = Number(m[1])
  if (!m[2]) return { path: head, range: { kind: 'single', line: a } }
  const b = Number(m[3])
  if (m[2] === '-') {
    if (b < a) throw new Error(`invalid range '${tail}': end < start`)
    return { path: head, range: { kind: 'inclusive', start: a, end: b } }
  }
  return { path: head, range: { kind: 'count', start: a, count: b } }
}
```

- [ ] **Step 4: Run selector test — should PASS**

```bash
pnpm vitest run packages/core/test/unit/tools/selector.test.ts
```

Expected: PASS (7 tests).

- [ ] **Step 5: Write failing test for URL router**

`packages/core/test/unit/tools/url-router.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import os from 'node:os'
import fs from 'node:fs/promises'
import path from 'node:path'
import { makeUrlRouter } from '../../../src/tools/read/url-router.js'
import { makeNullContext } from '../../../src/tools/context.js'

describe('UrlRouter', () => {
  test('parses scheme correctly', () => {
    const r = makeUrlRouter()
    expect(r.parse('local://src/x.ts')).toEqual({ scheme: 'local', rest: 'src/x.ts' })
    expect(r.parse('issue://owner/repo#42')).toEqual({ scheme: 'issue', rest: 'owner/repo#42' })
    expect(r.parse('mcp://server/resource/x')).toEqual({ scheme: 'mcp', rest: 'server/resource/x' })
  })

  test('unknown scheme falls back to local://', () => {
    const r = makeUrlRouter()
    expect(r.parse('README.md')).toEqual({ scheme: 'local', rest: 'README.md' })
  })

  test('local handler reads file content', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'glm-url-'))
    const file = path.join(dir, 'a.txt')
    await fs.writeFile(file, 'hi\n')
    const r = makeUrlRouter()
    const ctx = makeNullContext({ cwd: dir })
    const out = await r.dispatch(`local://${file}`, {}, ctx)
    expect(out.ok).toBe(true)
    expect(out.ok && out.data).toMatchObject({ scheme: 'local', text: 'hi\n' })
    await fs.rm(dir, { recursive: true, force: true })
  })

  test('memory:// returns not_implemented with phase P7', async () => {
    const r = makeUrlRouter()
    const out = await r.dispatch('memory://project/style', {}, makeNullContext())
    expect(out.ok).toBe(false)
    expect(!out.ok && out.error.code).toBe('NOT_IMPLEMENTED')
    expect(!out.ok && out.error.detail).toMatchObject({ phase: 'P7' })
  })

  test('top-level read() returns payload directly for ok results', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'glm-url-read-'))
    const file = path.join(dir, 'r.txt')
    await fs.writeFile(file, 'top-level')
    const r = makeUrlRouter()
    const payload = await r.read(`local://${file}`, makeNullContext({ cwd: dir }))
    expect(payload.scheme).toBe('local')
    expect(payload.text).toBe('top-level')
    await fs.rm(dir, { recursive: true, force: true })
  })

  test('top-level read() throws on handler error', async () => {
    const r = makeUrlRouter()
    await expect(r.read('memory://anything', makeNullContext()))
      .rejects.toThrow(/NOT_IMPLEMENTED/)
  })
})
```

- [ ] **Step 6: Run url-router test — should FAIL**

```bash
pnpm vitest run packages/core/test/unit/tools/url-router.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 7: Implement URL router scaffold + stubs**

`packages/core/src/tools/read/url-router.ts`:
```ts
import type { ToolContext } from '../context.js'
import type { ToolResult } from '../errors.js'
import { localScheme } from './schemes/local.js'
import { memoryScheme } from './schemes/memory.js'
import { mcpScheme } from './schemes/mcp.js'
import { skillScheme } from './schemes/skill.js'
import { ruleScheme } from './schemes/rule.js'
import { agentScheme } from './schemes/agent.js'
import { artifactScheme } from './schemes/artifact.js'
import { conflictScheme } from './schemes/conflict.js'
import { issueScheme } from './schemes/issue.js'
import { prScheme } from './schemes/pr.js'

export interface ReadOptions {
  format?: 'raw' | 'hashline'
  encoding?: 'utf-8'
}

export interface UrlPayload {
  scheme: string
  text: string
  meta?: Record<string, unknown>
}

export interface UrlHandler {
  scheme: string
  dispatch: (rest: string, opts: ReadOptions, ctx: ToolContext) => Promise<ToolResult<UrlPayload>>
}

export interface UrlRouter {
  parse: (url: string) => { scheme: string; rest: string }
  dispatch: (url: string, opts: ReadOptions, ctx: ToolContext) => Promise<ToolResult<UrlPayload>>
  /**
   * Top-level read helper (per FIX-MANIFEST §0.4): resolves scheme + rest internally,
   * returns the raw `UrlPayload` (throws on handler error). Convenience wrapper used by
   * P4+ subsystems that don't want to unwrap `ToolResult` themselves.
   */
  read: (url: string, ctx: ToolContext, opts?: ReadOptions) => Promise<UrlPayload>
  register: (h: UrlHandler) => void
}

const SCHEME_RE = /^([a-z][a-z0-9+\-.]*):\/\/(.*)$/

export function makeUrlRouter(): UrlRouter {
  const handlers = new Map<string, UrlHandler>()
  const router: UrlRouter = {
    parse(url) {
      const m = SCHEME_RE.exec(url)
      if (!m) return { scheme: 'local', rest: url }
      return { scheme: m[1]!, rest: m[2]! }
    },
    async dispatch(url, opts, ctx) {
      const { scheme, rest } = router.parse(url)
      const h = handlers.get(scheme)
      if (!h) {
        return { ok: false, error: { code: 'NOT_FOUND', message: `no handler for scheme '${scheme}'` } }
      }
      return h.dispatch(rest, opts, ctx)
    },
    async read(url, ctx, opts = {}) {
      const res = await router.dispatch(url, opts, ctx)
      if (!res.ok) {
        const detail = res.error.detail ? ` (${JSON.stringify(res.error.detail)})` : ''
        throw new Error(`${res.error.code}: ${res.error.message}${detail}`)
      }
      return res.data
    },
    register(h) {
      if (handlers.has(h.scheme)) throw new Error(`scheme '${h.scheme}' already registered`)
      handlers.set(h.scheme, h)
    },
  }

  for (const h of [
    localScheme, memoryScheme, mcpScheme, skillScheme, ruleScheme,
    agentScheme, artifactScheme, conflictScheme, issueScheme, prScheme,
  ]) {
    router.register(h)
  }
  return router
}
```

`packages/core/src/tools/read/schemes/memory.ts` (stub — P7 implements):
```ts
import type { UrlHandler } from '../url-router.js'

// stub — P7 implements (Trio + Hindsight memory layer)
export const memoryScheme: UrlHandler = {
  scheme: 'memory',
  async dispatch() {
    return { ok: false, error: { code: 'NOT_IMPLEMENTED', message: 'memory:// arrives in P7', detail: { phase: 'P7' } } }
  },
}
```

`packages/core/src/tools/read/schemes/mcp.ts` (stub — P4 implements):
```ts
import type { UrlHandler } from '../url-router.js'
// stub — P4 implements (MCP host + resource bridge)
export const mcpScheme: UrlHandler = {
  scheme: 'mcp',
  async dispatch() {
    return { ok: false, error: { code: 'NOT_IMPLEMENTED', message: 'mcp:// arrives in P4', detail: { phase: 'P4' } } }
  },
}
```

`packages/core/src/tools/read/schemes/skill.ts` (stub — P4 implements):
```ts
import type { UrlHandler } from '../url-router.js'
// stub — P4 implements (Skill loader + invoker)
export const skillScheme: UrlHandler = {
  scheme: 'skill',
  async dispatch() {
    return { ok: false, error: { code: 'NOT_IMPLEMENTED', message: 'skill:// arrives in P4', detail: { phase: 'P4' } } }
  },
}
```

`packages/core/src/tools/read/schemes/rule.ts` (stub — P4 implements):
```ts
import type { UrlHandler } from '../url-router.js'
// stub — P4 implements (Rule cascade loader)
export const ruleScheme: UrlHandler = {
  scheme: 'rule',
  async dispatch() {
    return { ok: false, error: { code: 'NOT_IMPLEMENTED', message: 'rule:// arrives in P4', detail: { phase: 'P4' } } }
  },
}
```

`packages/core/src/tools/read/schemes/agent.ts` (stub — P8 implements):
```ts
import type { UrlHandler } from '../url-router.js'
// stub — P8 implements (sub-agent fan-out and worker registry)
export const agentScheme: UrlHandler = {
  scheme: 'agent',
  async dispatch() {
    return { ok: false, error: { code: 'NOT_IMPLEMENTED', message: 'agent:// arrives in P8', detail: { phase: 'P8' } } }
  },
}
```

`packages/core/src/tools/read/schemes/artifact.ts` (stub — P10 implements):
```ts
import type { UrlHandler } from '../url-router.js'
// stub — P10 implements (content-addressable artifact blob store)
export const artifactScheme: UrlHandler = {
  scheme: 'artifact',
  async dispatch() {
    return { ok: false, error: { code: 'NOT_IMPLEMENTED', message: 'artifact:// arrives in P10', detail: { phase: 'P10' } } }
  },
}
```

`packages/core/src/tools/read/schemes/conflict.ts` (stub — v0.2; tracked under P9 series):
```ts
import type { UrlHandler } from '../url-router.js'
// stub — v0.2 implements (conflict resolver alongside checkpoints; tracked under P9 series)
export const conflictScheme: UrlHandler = {
  scheme: 'conflict',
  async dispatch() {
    return { ok: false, error: { code: 'NOT_IMPLEMENTED', message: 'conflict:// arrives in v0.2', detail: { phase: 'v0.2' } } }
  },
}
```

- [ ] **Step 8: Implement `local://` handler**

`packages/core/src/tools/read/schemes/local.ts`:
```ts
import fs from 'node:fs/promises'
import path from 'node:path'
import type { UrlHandler } from '../url-router.js'
import { parseSelector } from '../selector.js'
import { toHashlines, initHashline } from '../../hashline/format.js'

export const localScheme: UrlHandler = {
  scheme: 'local',
  async dispatch(rest, opts, ctx) {
    const parsed = parseSelector(rest)
    const abs = path.isAbsolute(parsed.path) ? parsed.path : path.resolve(ctx.cwd, parsed.path)

    let text: string
    try {
      text = await fs.readFile(abs, 'utf-8')
    } catch (e) {
      const err = e as NodeJS.ErrnoException
      return { ok: false, error: { code: err.code === 'ENOENT' ? 'NOT_FOUND' : 'IO_ERROR', message: err.message } }
    }

    let sliced = text
    if (parsed.range && parsed.range.kind !== 'raw') {
      const lines = text.split('\n')
      const trailingNl = text.endsWith('\n')
      if (trailingNl) lines.pop()
      const total = lines.length
      let from = 1
      let to = total
      if (parsed.range.kind === 'single')    { from = parsed.range.line;  to = parsed.range.line }
      if (parsed.range.kind === 'inclusive') { from = parsed.range.start; to = parsed.range.end }
      if (parsed.range.kind === 'count')     { from = parsed.range.start; to = parsed.range.start + parsed.range.count - 1 }
      from = Math.max(1, Math.min(from, total))
      to   = Math.max(1, Math.min(to,   total))
      sliced = lines.slice(from - 1, to).join('\n') + (trailingNl ? '\n' : '')
    }

    if (opts.format === 'hashline') {
      await initHashline()
      const tagged = toHashlines(sliced).join('\n')
      return { ok: true, data: { scheme: 'local', text: tagged, meta: { path: abs, format: 'hashline' } } }
    }
    return { ok: true, data: { scheme: 'local', text: sliced, meta: { path: abs, format: 'raw' } } }
  },
}
```

Also export `toHashlines` and `initHashline` from `format.ts` if they aren't already:

`packages/core/src/tools/hashline/format.ts` — add at the bottom:
```ts
export { initHashline } from './hash.js'
```

- [ ] **Step 9: Stub `issue://` and `pr://` (gh CLI delegators — minimal)**

`packages/core/src/tools/read/schemes/issue.ts`:
```ts
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { UrlHandler } from '../url-router.js'

const exec = promisify(execFile)

// Form: owner/repo#NUM
const RE = /^([^/]+)\/([^#]+)#(\d+)$/

export const issueScheme: UrlHandler = {
  scheme: 'issue',
  async dispatch(rest) {
    const m = RE.exec(rest)
    if (!m) return { ok: false, error: { code: 'VALIDATION_ERROR', message: `bad issue ref '${rest}'` } }
    const [, owner, repo, num] = m
    try {
      const { stdout } = await exec('gh', [
        'issue', 'view', String(num), '--repo', `${owner}/${repo}`,
        '--json', 'number,title,state,author,body,labels,comments',
      ], { maxBuffer: 4 * 1024 * 1024 })
      return { ok: true, data: { scheme: 'issue', text: stdout, meta: { owner, repo, number: Number(num) } } }
    } catch (e) {
      const err = e as Error & { stderr?: string }
      return { ok: false, error: { code: 'IO_ERROR', message: err.stderr || err.message } }
    }
  },
}
```

`packages/core/src/tools/read/schemes/pr.ts`:
```ts
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { UrlHandler } from '../url-router.js'

const exec = promisify(execFile)
const RE = /^([^/]+)\/([^#]+)#(\d+)$/

export const prScheme: UrlHandler = {
  scheme: 'pr',
  async dispatch(rest) {
    const m = RE.exec(rest)
    if (!m) return { ok: false, error: { code: 'VALIDATION_ERROR', message: `bad pr ref '${rest}'` } }
    const [, owner, repo, num] = m
    try {
      const { stdout } = await exec('gh', [
        'pr', 'view', String(num), '--repo', `${owner}/${repo}`,
        '--json', 'number,title,state,author,body,headRefName,baseRefName,mergeable,additions,deletions,files',
      ], { maxBuffer: 8 * 1024 * 1024 })
      return { ok: true, data: { scheme: 'pr', text: stdout, meta: { owner, repo, number: Number(num) } } }
    } catch (e) {
      const err = e as Error & { stderr?: string }
      return { ok: false, error: { code: 'IO_ERROR', message: err.stderr || err.message } }
    }
  },
}
```

- [ ] **Step 10: Run url-router test — should PASS**

```bash
pnpm vitest run packages/core/test/unit/tools/url-router.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat(core): internal URL router + local/issue/pr handlers + scheme stubs (P3 task 4)"
```

---

## Task 5: `Read` tool — handler + hashline-mode integration test

**Files:**
- Create: `packages/core/src/tools/read/tool.ts`
- Test:   `packages/core/test/unit/tools/read-local.test.ts`

- [ ] **Step 1: Write failing test for `Read` tool**

`packages/core/test/unit/tools/read-local.test.ts`:
```ts
import { describe, expect, test, beforeEach, afterEach, beforeAll } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { readTool } from '../../../src/tools/read/tool.js'
import { makeNullContext } from '../../../src/tools/context.js'
import { initHashline } from '../../../src/tools/hashline/hash.js'

let dir: string

beforeAll(async () => { await initHashline() })
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'glm-read-'))
})
afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }) })

describe('Read tool', () => {
  test('reads local file in raw format', async () => {
    const f = path.join(dir, 'a.ts')
    await fs.writeFile(f, 'hello\nworld\n')
    const r = await readTool.run({ url: `local://${f}` }, makeNullContext({ cwd: dir }))
    expect(r.ok).toBe(true)
    expect(r.ok && r.data.text).toBe('hello\nworld\n')
  })

  test('hashline format emits LINE+HASH|TEXT per line', async () => {
    const f = path.join(dir, 'b.ts')
    await fs.writeFile(f, 'alpha\nbeta\n')
    const r = await readTool.run({ url: `local://${f}`, format: 'hashline' }, makeNullContext({ cwd: dir }))
    expect(r.ok).toBe(true)
    const lines = r.ok ? r.data.text.split('\n') : []
    expect(lines[0]).toMatch(/^1[a-z]{2}\|alpha$/)
    expect(lines[1]).toMatch(/^2[a-z]{2}\|beta$/)
  })

  test('line range slices', async () => {
    const f = path.join(dir, 'c.ts')
    await fs.writeFile(f, 'a\nb\nc\nd\ne\n')
    const r = await readTool.run({ url: `local://${f}:2-4` }, makeNullContext({ cwd: dir }))
    expect(r.ok).toBe(true)
    expect(r.ok && r.data.text).toBe('b\nc\nd\n')
  })

  test('missing file returns NOT_FOUND', async () => {
    const r = await readTool.run({ url: `local://${dir}/nope.ts` }, makeNullContext({ cwd: dir }))
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error.code).toBe('NOT_FOUND')
  })

  test('memory:// surface returns NOT_IMPLEMENTED (P7 phase)', async () => {
    const r = await readTool.run({ url: 'memory://project/style' }, makeNullContext())
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error.code).toBe('NOT_IMPLEMENTED')
  })
})
```

- [ ] **Step 2: Run test — should FAIL**

```bash
pnpm vitest run packages/core/test/unit/tools/read-local.test.ts
```

Expected: FAIL — `Cannot find module .../read/tool`.

- [ ] **Step 3: Implement `Read` tool**

`packages/core/src/tools/read/tool.ts`:
```ts
import { z } from 'zod'
import type { ToolHandler } from '../registry.js'
import { makeUrlRouter, type UrlRouter, type UrlPayload } from './url-router.js'

const RouterSym = Symbol.for('glm.tools.urlRouter')
type RouterHolder = { [k: symbol]: UrlRouter }

function router(): UrlRouter {
  const g = globalThis as unknown as RouterHolder
  if (!g[RouterSym]) g[RouterSym] = makeUrlRouter()
  return g[RouterSym]
}

const Schema = z.object({
  url: z.string().min(1, 'url required'),
  format: z.enum(['raw', 'hashline']).optional(),
})

export const readTool: ToolHandler<z.infer<typeof Schema>, UrlPayload> = {
  name: 'Read',
  description:
    'Read a resource by internal URL. Schemes: local://, issue://, pr://, memory://, mcp://, skill://, rule://, agent://, artifact://, conflict://. Use format:"hashline" to receive LINE+HASH|TEXT lines for Edit anchors.',
  schema: Schema,
  async run(params, ctx) {
    return router().dispatch(params.url, { format: params.format }, ctx)
  },
}
```

- [ ] **Step 4: Run test — should PASS**

```bash
pnpm vitest run packages/core/test/unit/tools/read-local.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(core): Read tool unified over internal URL router (P3 task 5)"
```

---

## Task 6: `Write` tool — atomic full-file write

**Files:**
- Create: `packages/core/src/tools/write/tool.ts`
- Test:   `packages/core/test/unit/tools/write.test.ts`

- [ ] **Step 1: Write failing test**

`packages/core/test/unit/tools/write.test.ts`:
```ts
import { describe, expect, test, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { writeTool } from '../../../src/tools/write/tool.js'
import { makeNullContext } from '../../../src/tools/context.js'

let dir: string
beforeEach(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), 'glm-write-')) })
afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }) })

describe('Write tool', () => {
  test('creates a new file', async () => {
    const f = path.join(dir, 'a.txt')
    const r = await writeTool.run({ path: f, content: 'hello\n' }, makeNullContext({ cwd: dir }))
    expect(r.ok).toBe(true)
    expect(await fs.readFile(f, 'utf-8')).toBe('hello\n')
  })

  test('overwrites existing file', async () => {
    const f = path.join(dir, 'a.txt')
    await fs.writeFile(f, 'old\n')
    const r = await writeTool.run({ path: f, content: 'new\n' }, makeNullContext({ cwd: dir }))
    expect(r.ok).toBe(true)
    expect(await fs.readFile(f, 'utf-8')).toBe('new\n')
  })

  test('createParents creates missing directories', async () => {
    const f = path.join(dir, 'deep/nest/a.txt')
    const r = await writeTool.run({ path: f, content: 'x', createParents: true }, makeNullContext({ cwd: dir }))
    expect(r.ok).toBe(true)
    expect(await fs.readFile(f, 'utf-8')).toBe('x')
  })

  test('refuses to write to missing parent without createParents', async () => {
    const f = path.join(dir, 'missing/a.txt')
    const r = await writeTool.run({ path: f, content: 'x' }, makeNullContext({ cwd: dir }))
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error.code).toBe('IO_ERROR')
  })

  test('relative path resolves against ctx.cwd', async () => {
    const r = await writeTool.run({ path: 'rel.txt', content: 'q' }, makeNullContext({ cwd: dir }))
    expect(r.ok).toBe(true)
    expect(await fs.readFile(path.join(dir, 'rel.txt'), 'utf-8')).toBe('q')
  })
})
```

- [ ] **Step 2: Run test — should FAIL**

```bash
pnpm vitest run packages/core/test/unit/tools/write.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement `Write` tool**

`packages/core/src/tools/write/tool.ts`:
```ts
import fs from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import type { ToolHandler } from '../registry.js'

const Schema = z.object({
  path: z.string().min(1),
  content: z.string(),
  createParents: z.boolean().optional().default(false),
  encoding: z.literal('utf-8').optional().default('utf-8'),
})

export interface WriteResult {
  path: string
  bytes: number
  created: boolean
}

export const writeTool: ToolHandler<z.infer<typeof Schema>, WriteResult> = {
  name: 'Write',
  description: 'Atomically write content to a file (creates or overwrites). Use Edit for targeted line changes.',
  schema: Schema,
  async run(params, ctx) {
    const abs = path.isAbsolute(params.path) ? params.path : path.resolve(ctx.cwd, params.path)
    let preexisted = true
    try { await fs.access(abs) } catch { preexisted = false }

    try {
      if (params.createParents) await fs.mkdir(path.dirname(abs), { recursive: true })
      const tmp = `${abs}.glm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.tmp`
      await fs.writeFile(tmp, params.content, params.encoding)
      await fs.rename(tmp, abs)
      const stat = await fs.stat(abs)
      return { ok: true, data: { path: abs, bytes: stat.size, created: !preexisted } }
    } catch (e) {
      const err = e as Error
      return { ok: false, error: { code: 'IO_ERROR', message: err.message } }
    }
  },
}
```

- [ ] **Step 4: Run test — should PASS**

```bash
pnpm vitest run packages/core/test/unit/tools/write.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(core): Write tool with atomic tmp-rename (P3 task 6)"
```

---

## Task 7: `Edit` op planner — apply + prefixes + single-op shorthand

**Files:**
- Create: `packages/core/src/tools/edit/prefixes.ts`
- Create: `packages/core/src/tools/edit/apply.ts`
- Create: `packages/core/src/tools/edit/tool.ts`
- Test:   `packages/core/test/unit/tools/edit-apply.test.ts`

- [ ] **Step 1: Write failing test for op planner**

`packages/core/test/unit/tools/edit-apply.test.ts`:
```ts
import { describe, expect, test, beforeAll } from 'vitest'
import { planOps, applyPlan } from '../../../src/tools/edit/apply.js'
import { initHashline, computeAnchor } from '../../../src/tools/hashline/hash.js'
import { stripPayloadPrefix } from '../../../src/tools/edit/prefixes.js'

beforeAll(async () => { await initHashline() })

describe('stripPayloadPrefix', () => {
  test('removes leading "~" once', () => {
    expect(stripPayloadPrefix('~hello')).toBe('hello')
    expect(stripPayloadPrefix('~~hello')).toBe('~hello')
    expect(stripPayloadPrefix('no prefix')).toBe('no prefix')
  })
  test('strips LINE+HASH| echo prefix (LLM leaked the read prefix)', () => {
    expect(stripPayloadPrefix('42sr|hello')).toBe('hello')
    expect(stripPayloadPrefix('  42sr|hello')).toBe('  42sr|hello') // only at start
  })
})

describe('planOps + applyPlan', () => {
  const FILE = ['alpha', 'beta', 'gamma', 'delta', 'epsilon']

  test('replace single line', () => {
    const plan = planOps(FILE, [
      { anchor: `2${computeAnchor('beta')}`, action: 'replace', text: '~BETA' },
    ])
    expect(plan.ok).toBe(true)
    const out = applyPlan(FILE, plan.ok ? plan.plan : [])
    expect(out).toEqual(['alpha', 'BETA', 'gamma', 'delta', 'epsilon'])
  })

  test('insert_after appends after the anchored line', () => {
    const plan = planOps(FILE, [
      { anchor: `2${computeAnchor('beta')}`, action: 'insert_after', text: '~NEW' },
    ])
    const out = applyPlan(FILE, plan.ok ? plan.plan : [])
    expect(out).toEqual(['alpha', 'beta', 'NEW', 'gamma', 'delta', 'epsilon'])
  })

  test('insert_before prepends', () => {
    const plan = planOps(FILE, [
      { anchor: `2${computeAnchor('beta')}`, action: 'insert_before', text: '~NEW' },
    ])
    const out = applyPlan(FILE, plan.ok ? plan.plan : [])
    expect(out).toEqual(['alpha', 'NEW', 'beta', 'gamma', 'delta', 'epsilon'])
  })

  test('delete removes line', () => {
    const plan = planOps(FILE, [
      { anchor: `2${computeAnchor('beta')}`, action: 'delete' },
    ])
    const out = applyPlan(FILE, plan.ok ? plan.plan : [])
    expect(out).toEqual(['alpha', 'gamma', 'delta', 'epsilon'])
  })

  test('replace_range with N-M anchor', () => {
    const a = `2${computeAnchor('beta')}-4${computeAnchor('delta')}`
    const plan = planOps(FILE, [{ anchor: a, action: 'replace_range', text: '~ONLY' }])
    const out = applyPlan(FILE, plan.ok ? plan.plan : [])
    expect(out).toEqual(['alpha', 'ONLY', 'epsilon'])
  })

  test('multiple ops applied in DESCENDING line order (atomic mass edit)', () => {
    const plan = planOps(FILE, [
      { anchor: `1${computeAnchor('alpha')}`, action: 'replace', text: '~ALPHA' },
      { anchor: `5${computeAnchor('epsilon')}`, action: 'replace', text: '~EPSILON' },
    ])
    const out = applyPlan(FILE, plan.ok ? plan.plan : [])
    expect(out).toEqual(['ALPHA', 'beta', 'gamma', 'delta', 'EPSILON'])
  })

  test('hash mismatch with no recovery returns HASH_MISMATCH', () => {
    const plan = planOps(FILE, [{ anchor: '2zz', action: 'replace', text: '~x' }])
    expect(plan.ok).toBe(false)
    expect(!plan.ok && plan.error.code).toBe('HASH_MISMATCH')
  })

  test('hash mismatch with shift recovery succeeds and logs delta', () => {
    // anchor claims gamma is at line 7; actually at line 3
    const plan = planOps(FILE, [{ anchor: `7${computeAnchor('gamma')}`, action: 'replace', text: '~G' }])
    expect(plan.ok).toBe(true)
    const out = applyPlan(FILE, plan.ok ? plan.plan : [])
    expect(out).toEqual(['alpha', 'beta', 'G', 'delta', 'epsilon'])
  })

  test('overlapping ranges produce CONFLICTING_OPS', () => {
    const plan = planOps(FILE, [
      { anchor: `${`2${computeAnchor('beta')}-3${computeAnchor('gamma')}`}`, action: 'replace_range', text: '~X' },
      { anchor: `3${computeAnchor('gamma')}`, action: 'replace', text: '~Y' },
    ])
    expect(plan.ok).toBe(false)
    expect(!plan.ok && plan.error.code).toBe('VALIDATION_ERROR')
    expect(!plan.ok && plan.error.message).toMatch(/overlap/i)
  })
})
```

- [ ] **Step 2: Run test — should FAIL**

```bash
pnpm vitest run packages/core/test/unit/tools/edit-apply.test.ts
```

Expected: FAIL — modules missing.

- [ ] **Step 3: Implement `prefixes.ts`**

`packages/core/src/tools/edit/prefixes.ts`:
```ts
const PAYLOAD = '~'
const ECHO_RE = /^\d+[a-z]{2}\|/

/**
 * Normalise an LLM-supplied payload string.
 * 1. If it begins with the payload separator '~', drop one (so "~hello" → "hello").
 * 2. If the LLM echoed back the hashline read prefix ("42sr|hello"), strip that.
 *    We only strip at index 0 so payloads embedding "42sr|" mid-line are safe.
 */
export function stripPayloadPrefix(s: string): string {
  if (s.startsWith(PAYLOAD)) return s.slice(PAYLOAD.length)
  if (ECHO_RE.test(s)) return s.slice(s.indexOf('|') + 1)
  return s
}
```

- [ ] **Step 4: Implement `apply.ts`**

`packages/core/src/tools/edit/apply.ts`:
```ts
import { computeAnchor } from '../hashline/hash.js'
import { parseAnchor, splitAnchorRange, isAnchor } from '../hashline/format.js'
import { recoverAnchor } from '../hashline/recover.js'
import { stripPayloadPrefix } from './prefixes.js'
import type { ToolError } from '../errors.js'

export type EditAction = 'replace' | 'delete' | 'insert_before' | 'insert_after' | 'replace_range'

export interface EditOp {
  anchor: string
  action: EditAction
  text?: string
  hint?: { adjacentBefore?: string; adjacentAfter?: string }
}

export interface PlannedOp {
  action: EditAction
  from: number    // 1-indexed inclusive
  to: number      // 1-indexed inclusive (equal to `from` for non-range ops)
  payload: string[]
  recovery: 'exact' | 'shift' | 'whole' | null
}

export type PlanResult =
  | { ok: true; plan: PlannedOp[] }
  | { ok: false; error: ToolError }

export function planOps(lines: readonly string[], ops: readonly EditOp[]): PlanResult {
  const planned: PlannedOp[] = []

  for (const op of ops) {
    if (op.action === 'replace_range') {
      if (!isAnchor(op.anchor.split('-')[0] ?? '')) {
        return failV(`bad range anchor: '${op.anchor}'`)
      }
      const { start, end } = splitAnchorRange(op.anchor)
      const r1 = resolveAnchor(lines, start, op.hint)
      if (!r1.ok) return r1
      const r2 = resolveAnchor(lines, end, op.hint)
      if (!r2.ok) return r2
      if (r2.line < r1.line) return failV(`range end (${r2.line}) before start (${r1.line})`)
      planned.push({
        action: 'replace_range',
        from: r1.line,
        to:   r2.line,
        payload: op.text ? splitPayload(op.text) : [],
        recovery: r1.kind !== 'exact' || r2.kind !== 'exact' ? 'shift' : 'exact',
      })
    } else {
      if (!isAnchor(op.anchor)) return failV(`bad anchor: '${op.anchor}'`)
      const target = parseAnchor(op.anchor)
      const r = resolveAnchor(lines, target, op.hint)
      if (!r.ok) return r
      planned.push({
        action: op.action,
        from: r.line,
        to:   r.line,
        payload: op.text ? splitPayload(op.text) : [],
        recovery: r.kind === 'exact' ? 'exact' : (r.kind === 'shift' ? 'shift' : 'whole'),
      })
    }
  }

  // Overlap check: no two ops may target overlapping line spans.
  const sorted = [...planned].sort((a, b) => a.from - b.from)
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!
    const cur = sorted[i]!
    if (cur.from <= prev.to && !isInsertOnSameAnchor(prev, cur)) {
      return failV(`overlapping ops: lines ${prev.from}-${prev.to} vs ${cur.from}-${cur.to}`)
    }
  }
  return { ok: true, plan: planned }
}

function isInsertOnSameAnchor(a: PlannedOp, b: PlannedOp): boolean {
  // Two distinct insert_before / insert_after on the same line are allowed (no actual conflict).
  if (a.from !== b.from) return false
  const insertish = (x: PlannedOp) => x.action === 'insert_before' || x.action === 'insert_after'
  return insertish(a) && insertish(b)
}

interface Resolved { ok: true; line: number; kind: 'exact' | 'shift' | 'whole' }

function resolveAnchor(
  lines: readonly string[],
  target: { line: number; hash: string },
  hint: EditOp['hint'],
): Resolved | { ok: false; error: ToolError } {
  const r = recoverAnchor(lines, target, hint ?? {})
  switch (r.kind) {
    case 'exact':     return { ok: true, line: r.line, kind: 'exact' }
    case 'shift':     return { ok: true, line: r.line, kind: 'shift' }
    case 'whole':     return { ok: true, line: r.line, kind: 'whole' }
    case 'ambiguous': return failH(`ambiguous hash match at line ${target.line} (candidates: ${r.candidates.join(',')})`)
    case 'miss':      return failH(`hash mismatch at line ${target.line}: anchor '${target.hash}' not found`)
  }
}

function failV(message: string): { ok: false; error: ToolError } {
  return { ok: false, error: { code: 'VALIDATION_ERROR', message } }
}
function failH(message: string): { ok: false; error: ToolError } {
  return { ok: false, error: { code: 'HASH_MISMATCH', message } }
}

function splitPayload(raw: string): string[] {
  return stripPayloadPrefix(raw).split('\n')
}

export function applyPlan(input: readonly string[], plan: readonly PlannedOp[]): string[] {
  // Apply in descending order so earlier ops' indices stay valid.
  const sorted = [...plan].sort((a, b) => b.from - a.from || b.to - a.to)
  const out = [...input]
  for (const op of sorted) {
    const fromIdx = op.from - 1
    const toIdx = op.to - 1
    if (op.action === 'replace') {
      out.splice(fromIdx, 1, ...op.payload)
    } else if (op.action === 'replace_range') {
      out.splice(fromIdx, toIdx - fromIdx + 1, ...op.payload)
    } else if (op.action === 'delete') {
      out.splice(fromIdx, 1)
    } else if (op.action === 'insert_after') {
      out.splice(fromIdx + 1, 0, ...op.payload)
    } else if (op.action === 'insert_before') {
      out.splice(fromIdx, 0, ...op.payload)
    }
  }
  return out
}
```

Re-export `computeAnchor` once for tests' convenience (already exported in `hash.ts`).

- [ ] **Step 5: Run apply test — should PASS**

```bash
pnpm vitest run packages/core/test/unit/tools/edit-apply.test.ts
```

Expected: PASS (9 tests).

- [ ] **Step 6: Implement `Edit` tool wrapper**

`packages/core/src/tools/edit/tool.ts`:
```ts
import fs from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import type { ToolHandler } from '../registry.js'
import { initHashline } from '../hashline/hash.js'
import { planOps, applyPlan } from './apply.js'

const OpSchema = z.object({
  anchor: z.string().min(2),
  action: z.enum(['replace', 'delete', 'insert_before', 'insert_after', 'replace_range']),
  text: z.string().optional(),
  hint: z.object({
    adjacentBefore: z.string().optional(),
    adjacentAfter: z.string().optional(),
  }).optional(),
})

const Schema = z.object({
  path: z.string().min(1),
  ops: z.array(OpSchema).min(1).max(1, 'Edit accepts exactly one op — use MultiEdit for batches'),
})

export interface EditResult {
  path: string
  applied: number
  recoveries: { line: number; kind: 'exact' | 'shift' | 'whole' }[]
}

export const editTool: ToolHandler<z.infer<typeof Schema>, EditResult> = {
  name: 'Edit',
  description:
    'Apply a single hashline-anchored edit. Anchor format: LINE+HASH (e.g. "42sr"). Payload prefix "~" is stripped. Use MultiEdit for atomic multi-op batches.',
  schema: Schema,
  async run(params, ctx) {
    await initHashline()
    const abs = path.isAbsolute(params.path) ? params.path : path.resolve(ctx.cwd, params.path)
    let text: string
    try {
      text = await fs.readFile(abs, 'utf-8')
    } catch (e) {
      const err = e as NodeJS.ErrnoException
      return { ok: false, error: { code: err.code === 'ENOENT' ? 'NOT_FOUND' : 'IO_ERROR', message: err.message } }
    }
    const trailing = text.endsWith('\n')
    const lines = text.split('\n')
    if (trailing) lines.pop()

    const plan = planOps(lines, params.ops)
    if (!plan.ok) return { ok: false, error: plan.error }

    const next = applyPlan(lines, plan.plan)
    const out = next.join('\n') + (trailing ? '\n' : '')
    const tmp = `${abs}.glm-${Date.now()}.tmp`
    try {
      await fs.writeFile(tmp, out, 'utf-8')
      await fs.rename(tmp, abs)
    } catch (e) {
      return { ok: false, error: { code: 'IO_ERROR', message: (e as Error).message } }
    }
    return {
      ok: true,
      data: {
        path: abs,
        applied: plan.plan.length,
        recoveries: plan.plan
          .filter((p) => p.recovery !== 'exact' && p.recovery !== null)
          .map((p) => ({ line: p.from, kind: p.recovery as 'shift' | 'whole' })),
      },
    }
  },
}
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(core): Edit tool with hashline plan/apply + payload prefix strip (P3 task 7)"
```

---

## Task 8: `MultiEdit` — atomic multi-op batch

**Files:**
- Create: `packages/core/src/tools/edit/multi.ts`
- Test:   `packages/core/test/unit/tools/multi-edit.test.ts`

- [ ] **Step 1: Write failing integration test**

`packages/core/test/unit/tools/multi-edit.test.ts`:
```ts
import { describe, expect, test, beforeEach, afterEach, beforeAll } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { multiEditTool } from '../../../src/tools/edit/multi.js'
import { makeNullContext } from '../../../src/tools/context.js'
import { initHashline, computeAnchor } from '../../../src/tools/hashline/hash.js'

let dir: string
beforeAll(async () => { await initHashline() })
beforeEach(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), 'glm-medit-')) })
afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }) })

describe('MultiEdit', () => {
  test('applies multiple ops atomically', async () => {
    const f = path.join(dir, 'a.ts')
    await fs.writeFile(f, 'alpha\nbeta\ngamma\ndelta\nepsilon\n')
    const r = await multiEditTool.run({
      path: f,
      ops: [
        { anchor: `1${computeAnchor('alpha')}`, action: 'replace', text: '~ALPHA' },
        { anchor: `5${computeAnchor('epsilon')}`, action: 'replace', text: '~EPSILON' },
      ],
    }, makeNullContext({ cwd: dir }))
    expect(r.ok).toBe(true)
    expect(await fs.readFile(f, 'utf-8')).toBe('ALPHA\nbeta\ngamma\ndelta\nEPSILON\n')
  })

  test('any failure aborts the whole batch — file unchanged', async () => {
    const f = path.join(dir, 'a.ts')
    const orig = 'alpha\nbeta\ngamma\n'
    await fs.writeFile(f, orig)
    const r = await multiEditTool.run({
      path: f,
      ops: [
        { anchor: `1${computeAnchor('alpha')}`, action: 'replace', text: '~ALPHA' },
        { anchor: '2zz', action: 'replace', text: '~bad' },
      ],
    }, makeNullContext({ cwd: dir }))
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error.code).toBe('HASH_MISMATCH')
    expect(await fs.readFile(f, 'utf-8')).toBe(orig)
  })

  test('ops are evaluated against the original snapshot (order-independent)', async () => {
    const f = path.join(dir, 'a.ts')
    await fs.writeFile(f, 'alpha\nbeta\ngamma\n')
    const r = await multiEditTool.run({
      path: f,
      ops: [
        { anchor: `3${computeAnchor('gamma')}`, action: 'insert_after', text: '~delta' },
        { anchor: `1${computeAnchor('alpha')}`, action: 'replace', text: '~ALPHA' },
      ],
    }, makeNullContext({ cwd: dir }))
    expect(r.ok).toBe(true)
    expect(await fs.readFile(f, 'utf-8')).toBe('ALPHA\nbeta\ngamma\ndelta\n')
  })
})
```

- [ ] **Step 2: Run test — should FAIL**

```bash
pnpm vitest run packages/core/test/unit/tools/multi-edit.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement `MultiEdit`**

`packages/core/src/tools/edit/multi.ts`:
```ts
import fs from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import type { ToolHandler } from '../registry.js'
import { initHashline } from '../hashline/hash.js'
import { planOps, applyPlan } from './apply.js'

const OpSchema = z.object({
  anchor: z.string().min(2),
  action: z.enum(['replace', 'delete', 'insert_before', 'insert_after', 'replace_range']),
  text: z.string().optional(),
  hint: z.object({
    adjacentBefore: z.string().optional(),
    adjacentAfter: z.string().optional(),
  }).optional(),
})

const Schema = z.object({
  path: z.string().min(1),
  ops: z.array(OpSchema).min(1),
})

export interface MultiEditResult {
  path: string
  applied: number
  recoveries: { line: number; kind: 'exact' | 'shift' | 'whole' }[]
}

export const multiEditTool: ToolHandler<z.infer<typeof Schema>, MultiEditResult> = {
  name: 'MultiEdit',
  description:
    'Apply N hashline-anchored ops atomically. All ops resolve against the same snapshot; if any op fails verification, no write occurs.',
  schema: Schema,
  async run(params, ctx) {
    await initHashline()
    const abs = path.isAbsolute(params.path) ? params.path : path.resolve(ctx.cwd, params.path)
    let text: string
    try {
      text = await fs.readFile(abs, 'utf-8')
    } catch (e) {
      const err = e as NodeJS.ErrnoException
      return { ok: false, error: { code: err.code === 'ENOENT' ? 'NOT_FOUND' : 'IO_ERROR', message: err.message } }
    }
    const trailing = text.endsWith('\n')
    const lines = text.split('\n')
    if (trailing) lines.pop()

    const plan = planOps(lines, params.ops)
    if (!plan.ok) return { ok: false, error: plan.error }

    const next = applyPlan(lines, plan.plan)
    const out = next.join('\n') + (trailing ? '\n' : '')
    const tmp = `${abs}.glm-${Date.now()}.tmp`
    try {
      await fs.writeFile(tmp, out, 'utf-8')
      await fs.rename(tmp, abs)
    } catch (e) {
      return { ok: false, error: { code: 'IO_ERROR', message: (e as Error).message } }
    }
    return {
      ok: true,
      data: {
        path: abs,
        applied: plan.plan.length,
        recoveries: plan.plan
          .filter((p) => p.recovery && p.recovery !== 'exact')
          .map((p) => ({ line: p.from, kind: p.recovery as 'shift' | 'whole' })),
      },
    }
  },
}
```

- [ ] **Step 4: Run multi-edit test — should PASS**

```bash
pnpm vitest run packages/core/test/unit/tools/multi-edit.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(core): MultiEdit atomic batch tool (P3 task 8)"
```

---

## Task 9: `Grep` tool — ripgrep adapter + JS fallback

**Files:**
- Create: `packages/core/src/tools/grep/rg.ts`
- Create: `packages/core/src/tools/grep/js.ts`
- Create: `packages/core/src/tools/grep/tool.ts`
- Test:   `packages/core/test/unit/tools/grep-js.test.ts`

- [ ] **Step 1: Write failing test for JS fallback**

`packages/core/test/unit/tools/grep-js.test.ts`:
```ts
import { describe, expect, test, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { jsGrep } from '../../../src/tools/grep/js.js'

let dir: string
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'glm-grep-'))
  await fs.mkdir(path.join(dir, 'sub'))
  await fs.writeFile(path.join(dir, 'a.ts'), 'hello world\ngoodbye world\n')
  await fs.writeFile(path.join(dir, 'b.ts'), 'hello there\n')
  await fs.writeFile(path.join(dir, 'sub', 'c.ts'), 'hello world\n')
  await fs.writeFile(path.join(dir, 'sub', 'skip.bin'), Buffer.from([0, 1, 2, 0xff]))
  await fs.writeFile(path.join(dir, '.gitignore'), 'skip.bin\n')
})
afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }) })

describe('jsGrep', () => {
  test('matches across all files by default', async () => {
    const r = await jsGrep({ pattern: 'hello', cwd: dir })
    expect(r.matches.map(m => path.basename(m.path)).sort())
      .toEqual(['a.ts', 'b.ts', 'c.ts'].sort())
  })

  test('honors include glob', async () => {
    const r = await jsGrep({ pattern: 'hello', cwd: dir, include: '**/c.ts' })
    expect(r.matches).toHaveLength(1)
    expect(path.basename(r.matches[0]!.path)).toBe('c.ts')
  })

  test('skips binary files heuristically', async () => {
    const r = await jsGrep({ pattern: '\\x00', cwd: dir })
    // No textual hit on the binary file.
    expect(r.matches.some(m => m.path.endsWith('skip.bin'))).toBe(false)
  })

  test('regex flag supports case-insensitive search', async () => {
    const r = await jsGrep({ pattern: 'HELLO', cwd: dir, ignoreCase: true })
    expect(r.matches.length).toBeGreaterThan(0)
  })

  test('returns line numbers and match text', async () => {
    const r = await jsGrep({ pattern: 'goodbye', cwd: dir })
    expect(r.matches[0]).toMatchObject({ line: 2, text: 'goodbye world' })
  })
})
```

- [ ] **Step 2: Run test — should FAIL**

```bash
pnpm vitest run packages/core/test/unit/tools/grep-js.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement JS fallback**

`packages/core/src/tools/grep/js.ts`:
```ts
import fs from 'node:fs/promises'
import path from 'node:path'
import picomatch from 'picomatch'

export interface JsGrepInput {
  pattern: string
  cwd: string
  include?: string
  exclude?: string
  ignoreCase?: boolean
  maxResults?: number
}

export interface GrepMatch {
  path: string
  line: number
  text: string
}

export interface GrepResult {
  matches: GrepMatch[]
  truncated: boolean
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.next', '.turbo', 'coverage'])
const PROBE = 4096
const MAX_FILE = 5 * 1024 * 1024

export async function jsGrep(input: JsGrepInput): Promise<GrepResult> {
  const re = new RegExp(input.pattern, input.ignoreCase ? 'i' : '')
  const matchInclude = input.include ? picomatch(input.include, { dot: true }) : () => true
  const matchExclude = input.exclude ? picomatch(input.exclude, { dot: true }) : () => false
  const cap = input.maxResults ?? 1000
  const matches: GrepMatch[] = []
  let truncated = false

  async function walk(dir: string): Promise<void> {
    if (matches.length >= cap) { truncated = true; return }
    let entries: import('node:fs').Dirent[]
    try { entries = await fs.readdir(dir, { withFileTypes: true }) }
    catch { return }
    for (const e of entries) {
      if (matches.length >= cap) { truncated = true; return }
      const abs = path.join(dir, e.name)
      const rel = path.relative(input.cwd, abs)
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue
        await walk(abs)
      } else if (e.isFile()) {
        if (!matchInclude(rel)) continue
        if (matchExclude(rel)) continue
        await scan(abs, rel)
      }
    }
  }

  async function scan(abs: string, rel: string): Promise<void> {
    let stat: import('node:fs').Stats
    try { stat = await fs.stat(abs) } catch { return }
    if (stat.size > MAX_FILE) return

    // Binary probe: read first PROBE bytes — bail if NUL byte present.
    const fh = await fs.open(abs, 'r')
    try {
      const buf = Buffer.alloc(Math.min(PROBE, stat.size))
      await fh.read(buf, 0, buf.length, 0)
      if (buf.includes(0)) return
    } finally { await fh.close() }

    const text = await fs.readFile(abs, 'utf-8')
    const lines = text.split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i]!)) {
        matches.push({ path: rel || abs, line: i + 1, text: lines[i]! })
        if (matches.length >= cap) { truncated = true; return }
      }
    }
  }

  await walk(input.cwd)
  return { matches, truncated }
}
```

- [ ] **Step 4: Run JS grep test — should PASS**

```bash
pnpm vitest run packages/core/test/unit/tools/grep-js.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Implement ripgrep adapter**

`packages/core/src/tools/grep/rg.ts`:
```ts
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { GrepMatch, GrepResult } from './js.js'

const exec = promisify(execFile)

export async function rgAvailable(): Promise<boolean> {
  try { await exec('rg', ['--version'], { timeout: 2000 }); return true }
  catch { return false }
}

export interface RgInput {
  pattern: string
  cwd: string
  include?: string
  ignoreCase?: boolean
  maxResults?: number
}

export async function rgGrep(input: RgInput): Promise<GrepResult> {
  const args = ['--json', '--no-heading', '--with-filename', '--line-number']
  if (input.ignoreCase) args.push('-i')
  if (input.include) args.push('--glob', input.include)
  if (input.maxResults) args.push('--max-count', String(input.maxResults))
  args.push(input.pattern, '.')

  let stdout = ''
  try {
    const out = await exec('rg', args, { cwd: input.cwd, maxBuffer: 32 * 1024 * 1024 })
    stdout = out.stdout
  } catch (e) {
    // rg exits 1 when there are no matches — that's not a failure here.
    const err = e as { code?: number; stdout?: string }
    if (err.code === 1) return { matches: [], truncated: false }
    if (typeof err.stdout === 'string') stdout = err.stdout
    else throw e
  }

  const matches: GrepMatch[] = []
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue
    let parsed: unknown
    try { parsed = JSON.parse(line) } catch { continue }
    const ev = parsed as { type?: string; data?: { path?: { text?: string }; line_number?: number; lines?: { text?: string } } }
    if (ev.type !== 'match' || !ev.data) continue
    matches.push({
      path: ev.data.path?.text ?? '',
      line: ev.data.line_number ?? 0,
      text: (ev.data.lines?.text ?? '').replace(/\n$/, ''),
    })
  }
  return { matches, truncated: matches.length === (input.maxResults ?? Infinity) }
}
```

- [ ] **Step 6: Implement `Grep` tool**

`packages/core/src/tools/grep/tool.ts`:
```ts
import { z } from 'zod'
import type { ToolHandler } from '../registry.js'
import { jsGrep } from './js.js'
import { rgAvailable, rgGrep } from './rg.js'

const Schema = z.object({
  pattern: z.string().min(1),
  cwd: z.string().optional(),
  include: z.string().optional(),
  exclude: z.string().optional(),
  ignoreCase: z.boolean().optional().default(false),
  maxResults: z.number().int().positive().max(10_000).optional().default(1000),
  engine: z.enum(['auto', 'rg', 'js']).optional().default('auto'),
})

export const grepTool: ToolHandler<z.infer<typeof Schema>, { matches: unknown[]; truncated: boolean; engine: string }> = {
  name: 'Grep',
  description: 'Search files for a regex pattern. Prefers ripgrep; falls back to JS.',
  schema: Schema,
  async run(params, ctx) {
    const cwd = params.cwd ?? ctx.cwd
    let engine = params.engine
    if (engine === 'auto') engine = (await rgAvailable()) ? 'rg' : 'js'
    if (engine === 'rg') {
      const r = await rgGrep({ pattern: params.pattern, cwd, include: params.include, ignoreCase: params.ignoreCase, maxResults: params.maxResults })
      return { ok: true, data: { ...r, engine: 'rg' } }
    }
    const r = await jsGrep({ pattern: params.pattern, cwd, include: params.include, exclude: params.exclude, ignoreCase: params.ignoreCase, maxResults: params.maxResults })
    return { ok: true, data: { ...r, engine: 'js' } }
  },
}
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(core): Grep tool — rg adapter + JS fallback (P3 task 9)"
```

---

## Task 10: `Glob` tool — fast-glob wrapper

**Files:**
- Create: `packages/core/src/tools/glob/tool.ts`
- Test:   `packages/core/test/unit/tools/glob.test.ts`
- Modify: `packages/core/package.json` (add `fast-glob`)

- [ ] **Step 1: Add `fast-glob`**

```bash
pnpm --filter @glm/core add fast-glob@^3.3.2
```

Expected: dependency present.

- [ ] **Step 2: Write failing test**

`packages/core/test/unit/tools/glob.test.ts`:
```ts
import { describe, expect, test, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { globTool } from '../../../src/tools/glob/tool.js'
import { makeNullContext } from '../../../src/tools/context.js'

let dir: string
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'glm-glob-'))
  await fs.mkdir(path.join(dir, 'src'))
  await fs.mkdir(path.join(dir, 'node_modules'))
  await fs.writeFile(path.join(dir, 'src', 'a.ts'), '')
  await fs.writeFile(path.join(dir, 'src', 'b.ts'), '')
  await fs.writeFile(path.join(dir, 'src', 'c.js'), '')
  await fs.writeFile(path.join(dir, 'node_modules', 'd.ts'), '')
})
afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }) })

describe('Glob tool', () => {
  test('matches **/*.ts under cwd', async () => {
    const r = await globTool.run({ pattern: '**/*.ts' }, makeNullContext({ cwd: dir }))
    expect(r.ok).toBe(true)
    const names = r.ok ? r.data.matches.map((p) => path.basename(p)).sort() : []
    expect(names).toEqual(['a.ts', 'b.ts'])
  })

  test('absolute=true returns absolute paths', async () => {
    const r = await globTool.run({ pattern: '**/*.ts', absolute: true }, makeNullContext({ cwd: dir }))
    expect(r.ok).toBe(true)
    expect(r.ok && r.data.matches.every((p) => path.isAbsolute(p))).toBe(true)
  })

  test('ignore overrides default skip list', async () => {
    const r = await globTool.run({ pattern: '**/*.ts', includeNodeModules: true }, makeNullContext({ cwd: dir }))
    const names = r.ok ? r.data.matches.map((p) => path.basename(p)).sort() : []
    expect(names).toContain('d.ts')
  })

  test('limit truncates result', async () => {
    const r = await globTool.run({ pattern: '**/*', limit: 2 }, makeNullContext({ cwd: dir }))
    expect(r.ok).toBe(true)
    expect(r.ok && r.data.matches.length).toBeLessThanOrEqual(2)
    expect(r.ok && r.data.truncated).toBe(true)
  })
})
```

- [ ] **Step 3: Run test — should FAIL**

```bash
pnpm vitest run packages/core/test/unit/tools/glob.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 4: Implement `Glob` tool**

`packages/core/src/tools/glob/tool.ts`:
```ts
import { z } from 'zod'
import fg from 'fast-glob'
import type { ToolHandler } from '../registry.js'

const Schema = z.object({
  pattern: z.union([z.string(), z.array(z.string()).min(1)]),
  cwd: z.string().optional(),
  absolute: z.boolean().optional().default(false),
  includeNodeModules: z.boolean().optional().default(false),
  limit: z.number().int().positive().max(50_000).optional().default(10_000),
})

const DEFAULT_IGNORE = ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/.next/**', '**/.turbo/**', '**/coverage/**']

export const globTool: ToolHandler<z.infer<typeof Schema>, { matches: string[]; truncated: boolean }> = {
  name: 'Glob',
  description: 'Find files by glob pattern. Skips node_modules/.git/dist by default.',
  schema: Schema,
  async run(params, ctx) {
    const cwd = params.cwd ?? ctx.cwd
    const ignore = params.includeNodeModules ? DEFAULT_IGNORE.filter((p) => !p.includes('node_modules')) : DEFAULT_IGNORE
    const stream = fg.stream(params.pattern as string | string[], {
      cwd,
      absolute: params.absolute,
      dot: false,
      onlyFiles: true,
      ignore,
      suppressErrors: true,
    })
    const out: string[] = []
    let truncated = false
    for await (const m of stream) {
      out.push(String(m))
      if (out.length >= params.limit) { truncated = true; break }
    }
    return { ok: true, data: { matches: out, truncated } }
  },
}
```

- [ ] **Step 5: Run test — should PASS**

```bash
pnpm vitest run packages/core/test/unit/tools/glob.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(core): Glob tool via fast-glob with default ignore-list (P3 task 10)"
```

---

## Task 11: `Bash` tool — spawn + stream + timeout + tree-kill

**Files:**
- Create: `packages/core/src/tools/bash/kill-tree.ts`
- Create: `packages/core/src/tools/bash/tool.ts`
- Test:   `packages/core/test/unit/tools/bash.test.ts`

- [ ] **Step 1: Write failing test**

`packages/core/test/unit/tools/bash.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { bashTool } from '../../../src/tools/bash/tool.js'
import { makeNullContext } from '../../../src/tools/context.js'

describe('Bash tool', () => {
  test('captures stdout from a simple command', async () => {
    const r = await bashTool.run({ command: 'echo hello' }, makeNullContext())
    expect(r.ok).toBe(true)
    expect(r.ok && r.data.stdout.trim()).toBe('hello')
    expect(r.ok && r.data.exitCode).toBe(0)
  })

  test('non-zero exit is reflected', async () => {
    const r = await bashTool.run({ command: 'sh -c "exit 7"' }, makeNullContext())
    expect(r.ok).toBe(true)
    expect(r.ok && r.data.exitCode).toBe(7)
  })

  test('timeout kills long-running process', async () => {
    const r = await bashTool.run({ command: 'sleep 10', timeoutMs: 200 }, makeNullContext())
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error.code).toBe('TIMEOUT')
  })

  test('captures stderr separately', async () => {
    const r = await bashTool.run({ command: 'sh -c "echo out; echo err 1>&2"' }, makeNullContext())
    expect(r.ok).toBe(true)
    expect(r.ok && r.data.stdout.trim()).toBe('out')
    expect(r.ok && r.data.stderr.trim()).toBe('err')
  })

  test('cwd overrides ctx.cwd', async () => {
    const r = await bashTool.run({ command: 'pwd', cwd: '/' }, makeNullContext({ cwd: '/tmp' }))
    expect(r.ok).toBe(true)
    expect(r.ok && r.data.stdout.trim()).toBe('/')
  })

  test('emits stdout events while running', async () => {
    const seen: string[] = []
    const ctx = makeNullContext()
    const orig = ctx.emit
    ;(ctx as any).emit = (e: any) => { if (e.type === 'stdout') seen.push(String(e.data)); orig(e) }
    await bashTool.run({ command: 'echo a; echo b' }, ctx)
    expect(seen.join('')).toMatch(/a.*b/s)
  })
})
```

- [ ] **Step 2: Run test — should FAIL**

```bash
pnpm vitest run packages/core/test/unit/tools/bash.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement `kill-tree`**

`packages/core/src/tools/bash/kill-tree.ts`:
```ts
import type { ChildProcess } from 'node:child_process'

/**
 * Kill the child plus any descendants on POSIX by signalling the process group.
 * On Windows, fall back to `process.kill(child.pid)` (no native group concept).
 */
export function killTree(child: ChildProcess, signal: NodeJS.Signals = 'SIGTERM'): void {
  if (!child.pid) return
  if (process.platform === 'win32') {
    try { child.kill(signal) } catch { /* already exited */ }
    return
  }
  try {
    process.kill(-child.pid, signal)
  } catch {
    try { child.kill(signal) } catch { /* swallow */ }
  }
}
```

- [ ] **Step 4: Implement `Bash` tool**

`packages/core/src/tools/bash/tool.ts`:
```ts
import { spawn } from 'node:child_process'
import { z } from 'zod'
import type { ToolHandler } from '../registry.js'
import { killTree } from './kill-tree.js'

const Schema = z.object({
  command: z.string().min(1),
  cwd: z.string().optional(),
  timeoutMs: z.number().int().positive().max(30 * 60 * 1000).optional().default(120_000),
  env: z.record(z.string()).optional(),
  shell: z.string().optional().default('/bin/bash'),
  maxOutputBytes: z.number().int().positive().max(50 * 1024 * 1024).optional().default(8 * 1024 * 1024),
})

export interface BashResult {
  exitCode: number
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
  durationMs: number
  truncated: boolean
}

export const bashTool: ToolHandler<z.infer<typeof Schema>, BashResult> = {
  name: 'Bash',
  description: 'Run a shell command. Streams stdout/stderr via context events; enforces timeoutMs; kills the whole process tree on timeout.',
  schema: Schema,
  async run(params, ctx) {
    const started = Date.now()
    const child = spawn(params.shell ?? '/bin/bash', ['-lc', params.command], {
      cwd: params.cwd ?? ctx.cwd,
      env: { ...process.env, ...(params.env ?? {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32', // process group on POSIX
    })

    let stdout = ''
    let stderr = ''
    let truncated = false
    const cap = params.maxOutputBytes

    child.stdout?.on('data', (chunk: Buffer) => {
      if (stdout.length + chunk.length > cap) {
        const room = Math.max(0, cap - stdout.length)
        stdout += chunk.subarray(0, room).toString('utf-8')
        truncated = true
        killTree(child, 'SIGTERM')
        return
      }
      stdout += chunk.toString('utf-8')
      ctx.emit({ type: 'stdout', tool: 'Bash', callId: '', data: chunk.toString('utf-8') })
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderr.length + chunk.length > cap) {
        const room = Math.max(0, cap - stderr.length)
        stderr += chunk.subarray(0, room).toString('utf-8')
        truncated = true
        killTree(child, 'SIGTERM')
        return
      }
      stderr += chunk.toString('utf-8')
      ctx.emit({ type: 'stderr', tool: 'Bash', callId: '', data: chunk.toString('utf-8') })
    })

    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      killTree(child, 'SIGTERM')
      // Hard kill 5s later.
      setTimeout(() => killTree(child, 'SIGKILL'), 5000).unref()
    }, params.timeoutMs)
    timer.unref()

    const onAbort = () => { killTree(child, 'SIGTERM') }
    ctx.signal.addEventListener('abort', onAbort, { once: true })

    const { code, signal } = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
      child.on('exit', (c, s) => resolve({ code: c, signal: s }))
      child.on('error', () => resolve({ code: null, signal: null }))
    })
    clearTimeout(timer)
    ctx.signal.removeEventListener('abort', onAbort)

    if (timedOut) {
      return { ok: false, error: { code: 'TIMEOUT', message: `command timed out after ${params.timeoutMs}ms`, detail: { stdout, stderr } } }
    }

    return {
      ok: true,
      data: {
        exitCode: code ?? -1,
        signal,
        stdout,
        stderr,
        durationMs: Date.now() - started,
        truncated,
      },
    }
  },
}
```

- [ ] **Step 5: Run bash test — should PASS**

```bash
pnpm vitest run packages/core/test/unit/tools/bash.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(core): Bash tool with timeout + tree-kill + output streaming (P3 task 11)"
```

---

## Task 12: `Task` (stub) + `TodoWrite` with SQLite migration 002

**Files:**
- Create: `packages/core/src/tools/task/tool.ts`
- Create: `packages/core/src/storage/migrations/002_tools.sql`
- Create: `packages/core/src/tools/todo/repo.ts`
- Create: `packages/core/src/tools/todo/tool.ts`
- Create: `packages/core/src/storage/todo-repo.ts` (re-export shim)
- Test:   `packages/core/test/unit/tools/todo-repo.test.ts`

- [ ] **Step 1: Write migration 002**

`packages/core/src/storage/migrations/002_tools.sql`:
```sql
-- 002: Tool-layer tables (P3)

CREATE TABLE IF NOT EXISTS todos (
  id           TEXT PRIMARY KEY,            -- ULID
  session_id   TEXT NOT NULL,
  content      TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('pending','in_progress','completed','cancelled')),
  active_form  TEXT,                        -- gerund form, e.g. "Refactoring auth"
  position     INTEGER NOT NULL,            -- ordering within session
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_todos_session_status ON todos(session_id, status);
CREATE INDEX IF NOT EXISTS idx_todos_session_position ON todos(session_id, position);

CREATE TABLE IF NOT EXISTS tool_call_log (
  id           TEXT PRIMARY KEY,            -- ULID
  session_id   TEXT,                        -- nullable for non-session calls
  tool         TEXT NOT NULL,
  params_json  TEXT NOT NULL,
  ok           INTEGER NOT NULL,            -- 0/1
  error_code   TEXT,
  duration_ms  INTEGER,
  created_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tool_call_log_session ON tool_call_log(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tool_call_log_tool ON tool_call_log(tool, created_at);

-- NOTE: schema_version bump is handled by P1's migration runner — do NOT INSERT it here.
-- (See FIX-MANIFEST §3 P3-Fix-5; runner derives the version from the filename prefix.)
-- NOTE: this `tool_call_log` table is log-only; P7's `tool_calls` (canonical) is added by
-- 007_compaction.sql. The two coexist intentionally — see P7-Fix-1 cross-ref.
```

- [ ] **Step 2: Write failing test for TodoRepo**

`packages/core/test/unit/tools/todo-repo.test.ts`:
```ts
import { describe, expect, test, beforeEach } from 'vitest'
import { openTestDb } from '../../helpers/test-db.js'
import { TodoRepo } from '../../../src/tools/todo/repo.js'

describe('TodoRepo', () => {
  let repo: TodoRepo
  beforeEach(() => { repo = new TodoRepo(openTestDb()) })

  test('replaceAll writes the full list and clears removed ids', () => {
    const session = 'sess-1'
    const a = repo.replaceAll(session, [
      { content: 'task A', status: 'pending', activeForm: 'Doing A' },
      { content: 'task B', status: 'in_progress', activeForm: 'Doing B' },
    ])
    expect(a).toHaveLength(2)
    expect(a[0]?.position).toBe(0)
    expect(a[1]?.position).toBe(1)

    // Reduce to one
    const b = repo.replaceAll(session, [{ content: 'task C', status: 'completed', activeForm: 'Did C' }])
    expect(b).toHaveLength(1)
    expect(repo.listBySession(session)).toHaveLength(1)
  })

  test('listBySession returns ordered todos', () => {
    repo.replaceAll('s', [
      { content: 'one', status: 'pending', activeForm: 'Doing one' },
      { content: 'two', status: 'pending', activeForm: 'Doing two' },
    ])
    const all = repo.listBySession('s')
    expect(all.map(t => t.content)).toEqual(['one', 'two'])
  })

  test('updateStatus updates only the matching id', () => {
    const [t1, t2] = repo.replaceAll('s', [
      { content: 'a', status: 'pending', activeForm: 'Doing a' },
      { content: 'b', status: 'pending', activeForm: 'Doing b' },
    ])
    repo.updateStatus(t2!.id, 'completed')
    const after = repo.listBySession('s')
    expect(after.find(t => t.id === t2!.id)?.status).toBe('completed')
    expect(after.find(t => t.id === t1!.id)?.status).toBe('pending')
  })
})
```

Add a tiny helper used by this and other tests:

`packages/core/test/helpers/test-db.ts`:
```ts
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { openDb, runMigrations } from '../../src/storage/index.js'

export function openTestDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'glm-db-'))
  const db = openDb(path.join(dir, 'test.db'))
  runMigrations(db)
  return db
}
```

> P1 already shipped `openDb` + `runMigrations`. The runner picks up `002_tools.sql` automatically because P1 stipulated lexicographic ordering of `migrations/*.sql`.

- [ ] **Step 3: Run test — should FAIL**

```bash
pnpm vitest run packages/core/test/unit/tools/todo-repo.test.ts
```

Expected: FAIL — `Cannot find module .../todo/repo`.

- [ ] **Step 4: Implement TodoRepo**

`packages/core/src/tools/todo/repo.ts`:
```ts
import type Database from 'better-sqlite3'
import { ulid } from '@glm/shared'

export type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'

export interface TodoInput {
  content: string
  status: TodoStatus
  activeForm: string
}

export interface Todo {
  id: string
  sessionId: string
  content: string
  status: TodoStatus
  activeForm: string
  position: number
  createdAt: number
  updatedAt: number
}

interface Row {
  id: string
  session_id: string
  content: string
  status: TodoStatus
  active_form: string | null
  position: number
  created_at: number
  updated_at: number
}

export class TodoRepo {
  constructor(private readonly db: Database.Database) {}

  replaceAll(sessionId: string, items: readonly TodoInput[]): Todo[] {
    const now = Date.now()
    const tx = this.db.transaction((rows: readonly TodoInput[]) => {
      this.db.prepare('DELETE FROM todos WHERE session_id = ?').run(sessionId)
      const insert = this.db.prepare(`
        INSERT INTO todos(id, session_id, content, status, active_form, position, created_at, updated_at)
        VALUES (@id, @session_id, @content, @status, @active_form, @position, @created_at, @updated_at)
      `)
      const out: Todo[] = []
      rows.forEach((r, i) => {
        const id = ulid()
        insert.run({
          id,
          session_id: sessionId,
          content: r.content,
          status: r.status,
          active_form: r.activeForm,
          position: i,
          created_at: now,
          updated_at: now,
        })
        out.push({
          id, sessionId, content: r.content, status: r.status,
          activeForm: r.activeForm, position: i, createdAt: now, updatedAt: now,
        })
      })
      return out
    })
    return tx(items)
  }

  listBySession(sessionId: string): Todo[] {
    const rows = this.db.prepare(
      'SELECT * FROM todos WHERE session_id = ? ORDER BY position ASC',
    ).all(sessionId) as Row[]
    return rows.map(toTodo)
  }

  updateStatus(id: string, status: TodoStatus): void {
    this.db.prepare('UPDATE todos SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, Date.now(), id)
  }
}

function toTodo(r: Row): Todo {
  return {
    id: r.id,
    sessionId: r.session_id,
    content: r.content,
    status: r.status,
    activeForm: r.active_form ?? '',
    position: r.position,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}
```

`packages/core/src/storage/todo-repo.ts` (shim — keeps the storage-layer import idiom from P1):
```ts
export { TodoRepo } from '../tools/todo/repo.js'
export type { Todo, TodoStatus, TodoInput } from '../tools/todo/repo.js'
```

- [ ] **Step 5: Implement `TodoWrite` tool**

`packages/core/src/tools/todo/tool.ts`:
```ts
import { z } from 'zod'
import type { ToolHandler } from '../registry.js'
import { ToolFailure } from '../errors.js'
import { TodoRepo, type Todo } from './repo.js'
import type Database from 'better-sqlite3'

const Schema = z.object({
  todos: z.array(z.object({
    content: z.string().min(1),
    status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']),
    activeForm: z.string().min(1),
  })).min(0).max(200),
})

// Context decorates a `.db` on `settings` for tools that need persistence.
// (Wired by the daemon when constructing the registry — see Task 13.)
function getDb(ctx: { settings: Record<string, unknown> }): Database.Database {
  const db = ctx.settings._db as Database.Database | undefined
  if (!db) throw new ToolFailure('RUNTIME_ERROR', 'TodoWrite requires a database — daemon context not wired')
  return db
}

export const todoWriteTool: ToolHandler<z.infer<typeof Schema>, { todos: Todo[] }> = {
  name: 'TodoWrite',
  description: 'Replace this session\'s todo list with the supplied items. Use activeForm in present-progressive ("Refactoring auth"). Mark exactly one item in_progress at a time.',
  schema: Schema,
  async run(params, ctx) {
    if (!ctx.sessionId) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'TodoWrite requires an active session' } }
    }
    const repo = new TodoRepo(getDb(ctx))
    const out = repo.replaceAll(ctx.sessionId, params.todos)
    return { ok: true, data: { todos: out } }
  },
}
```

- [ ] **Step 6: Implement `Task` stub**

`packages/core/src/tools/task/tool.ts`:
```ts
import { z } from 'zod'
import type { ToolHandler } from '../registry.js'

const Schema = z.object({
  description: z.string().min(1),
  prompt: z.string().min(1),
  subagent_type: z.string().min(1),
  model: z.string().optional(),
})

export const taskTool: ToolHandler<z.infer<typeof Schema>, never> = {
  name: 'Task',
  description: 'Delegate a self-contained sub-task to a worker subagent. Full implementation arrives in P8; P3 ships schema only.',
  schema: Schema,
  async run() {
    return {
      ok: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'Task tool ships in P8 (sub-agent fan-out). P3 validates the schema only.',
        detail: { phase: 'P8' },
      },
    }
  },
}
```

- [ ] **Step 7: Run todo-repo test — should PASS**

```bash
pnpm vitest run packages/core/test/unit/tools/todo-repo.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(core): Task stub + TodoWrite + migration 002 (P3 task 12)"
```

---

## Task 13: Registry factory + daemon RPC wiring (`tool.call` / `tool.list`)

**Files:**
- Modify: `packages/core/src/tools/index.ts` — add `createDefaultToolRegistry` + LoaderHub subsystem registration (Task 1 already created this file)
- Create: `packages/core/src/rpc/methods/tool.ts`
- Modify: `packages/core/src/rpc/methods/index.ts` — register the new methods
- Test:   `packages/core/test/integration/tool-rpc.test.ts`

> **LoaderHub pattern (per FIX-MANIFEST §0.9 + §3 P3-Fix-6):** P3 does NOT directly edit `packages/core/src/daemon/daemon.ts`. Instead, `tools/index.ts` registers its subsystem via `LoaderHub.registerSubsystem('tools', ...)` at module load. P1 ships an empty `LoaderHub` stub at `packages/core/src/daemon/loader-hub.ts`; the daemon calls `LoaderHub.runAll(this)` once after `runMigrations(db)`.

- [ ] **Step 1: Default-registry factory + LoaderHub subsystem**

Update `packages/core/src/tools/index.ts`:
```ts
export * from './registry.js'
export * from './context.js'
export * from './errors.js'
export * from './permission.js'

import { ToolRegistry } from './registry.js'
import { readTool } from './read/tool.js'
import { writeTool } from './write/tool.js'
import { editTool } from './edit/tool.js'
import { multiEditTool } from './edit/multi.js'
import { grepTool } from './grep/tool.js'
import { globTool } from './glob/tool.js'
import { bashTool } from './bash/tool.js'
import { taskTool } from './task/tool.js'
import { todoWriteTool } from './todo/tool.js'
import { LoaderHub } from '../daemon/loader-hub.js'
import { makeToolMethods } from '../rpc/methods/tool.js'

export function createDefaultToolRegistry(): ToolRegistry {
  const r = new ToolRegistry()
  r.register(readTool as never)
  r.register(writeTool as never)
  r.register(editTool as never)
  r.register(multiEditTool as never)
  r.register(grepTool as never)
  r.register(globTool as never)
  r.register(bashTool as never)
  r.register(taskTool as never)
  r.register(todoWriteTool as never)
  return r
}

// Register P3 tool subsystem via LoaderHub (no direct daemon.ts edits — see FIX-MANIFEST §0.9).
LoaderHub.registerSubsystem('tools', async (daemon) => {
  const registry = createDefaultToolRegistry()
  // Expose to later plans (P4 MCP bridge, P5 hooks, etc.) on the daemon object.
  daemon.toolRegistry = registry
  const methods = makeToolMethods({
    registry,
    paths: daemon.paths,
    db: daemon.db,
    settings: daemon.settings,
    cwd: process.cwd(),
  })
  for (const [name, handler] of Object.entries(methods)) {
    daemon.rpc.on(name, handler)
  }
})
```

- [ ] **Step 2: RPC method handlers**

`packages/core/src/rpc/methods/tool.ts`:
```ts
import { z } from 'zod'
import type { ToolRegistry } from '../../tools/index.js'
import type { ToolContext } from '../../tools/index.js'
import type { GlmPaths } from '@glm/shared'
import type Database from 'better-sqlite3'
import { EventEmitter } from 'node:events'
import { checkPermission } from '../../tools/permission.js'

const CallSchema = z.object({
  name: z.string().min(1),
  params: z.unknown(),
  sessionId: z.string().nullable().optional(),
})

export interface ToolRpcDeps {
  registry: ToolRegistry
  paths: GlmPaths
  db: Database.Database
  settings: Record<string, unknown>
  cwd: string
}

export function makeToolMethods(deps: ToolRpcDeps) {
  return {
    'tool.list': async () => ({ tools: deps.registry.list() }),

    'tool.call': async (paramsIn: unknown) => {
      const { name, params, sessionId } = CallSchema.parse(paramsIn ?? {})
      const decision = checkPermission(name, params, deps.settings)
      if (!decision.allow) {
        return { ok: false, error: { code: 'PERMISSION_DENIED', message: decision.reason ?? 'denied', detail: { rule: decision.matchedRule } } }
      }
      const ee = new EventEmitter()
      const ctx: ToolContext = {
        sessionId: sessionId ?? null,
        cwd: deps.cwd,
        paths: deps.paths,
        emit: (e) => ee.emit(e.type, e),
        signal: new AbortController().signal,
        settings: { ...deps.settings, _db: deps.db },
      }
      return deps.registry.call(name, params, ctx)
    },
  }
}
```

`packages/core/src/rpc/methods/index.ts` (add):
```ts
export { makeToolMethods } from './tool.js'
```

- [ ] **Step 3: Verify LoaderHub registration**

P3 does NOT directly edit `daemon.ts` (per FIX-MANIFEST §0.9). The `LoaderHub.registerSubsystem('tools', ...)` block in `packages/core/src/tools/index.ts` (Step 1) runs at module-load time. P1's `Daemon.start()` calls `await LoaderHub.runAll(this)` once after `runMigrations(db)` and after the P1 baseline RPC handlers (`ping`, `daemon.status`, etc.) are wired. The tools subsystem callback receives the daemon, instantiates the registry, decorates `daemon.toolRegistry`, and calls `daemon.rpc.on(name, handler)` for each method.

Add a sanity import in `packages/core/src/daemon/index.ts` (P1-owned barrel) so the `tools/index.ts` side-effect module is pulled in by the daemon's import graph:

```ts
// packages/core/src/daemon/index.ts — append
import '../tools/index.js'   // registers 'tools' subsystem on LoaderHub (side-effect)
```

(If P1's daemon barrel is not the natural import site, add a `import '../tools/index.js'` line near the top of `packages/core/src/daemon/daemon.ts` instead — the only requirement is that the module be loaded before `LoaderHub.runAll()` runs.)

- [ ] **Step 4: Write integration test for tool RPC round-trip**

`packages/core/test/integration/tool-rpc.test.ts`:
```ts
import { describe, expect, test, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { startDaemon, stopDaemon, type DaemonHandle } from '../../src/daemon/lifecycle.js'
import { createRpcClient } from '../../src/rpc/client.js'

let handle: DaemonHandle
let home: string

beforeAll(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'glm-tool-rpc-'))
  process.env.GLM_HOME = home
  handle = await startDaemon()
})
afterAll(async () => {
  await stopDaemon(handle)
  await fs.rm(home, { recursive: true, force: true })
})

describe('tool RPC', () => {
  test('tool.list returns 9 tools', async () => {
    const client = await createRpcClient(path.join(home, 'daemon.sock'))
    const r = await client.request('tool.list', {}) as { tools: { name: string }[] }
    const names = r.tools.map((t) => t.name).sort()
    expect(names).toEqual(['Bash', 'Edit', 'Glob', 'Grep', 'MultiEdit', 'Read', 'Task', 'TodoWrite', 'Write'])
    await client.close()
  })

  test('tool.call Read local:// round-trips', async () => {
    const f = path.join(home, 'sample.txt')
    await fs.writeFile(f, 'hello\nworld\n')
    const client = await createRpcClient(path.join(home, 'daemon.sock'))
    const r = await client.request('tool.call', {
      name: 'Read',
      params: { url: `local://${f}` },
    }) as { ok: boolean; data?: { text: string } }
    expect(r.ok).toBe(true)
    expect(r.data?.text).toBe('hello\nworld\n')
    await client.close()
  })

  test('tool.call Bash returns exit code', async () => {
    const client = await createRpcClient(path.join(home, 'daemon.sock'))
    const r = await client.request('tool.call', {
      name: 'Bash',
      params: { command: 'echo ok' },
    }) as { ok: boolean; data?: { stdout: string; exitCode: number } }
    expect(r.ok).toBe(true)
    expect(r.data?.exitCode).toBe(0)
    expect(r.data?.stdout.trim()).toBe('ok')
    await client.close()
  })

  test('tool.call unknown tool returns NOT_FOUND', async () => {
    const client = await createRpcClient(path.join(home, 'daemon.sock'))
    const r = await client.request('tool.call', { name: 'Nope', params: {} }) as { ok: false; error: { code: string } }
    expect(r.ok).toBe(false)
    expect(r.error.code).toBe('NOT_FOUND')
    await client.close()
  })
})
```

- [ ] **Step 5: Run integration test — should PASS**

```bash
pnpm vitest run packages/core/test/integration/tool-rpc.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(core,rpc): wire tool.call/tool.list RPC methods + default registry (P3 task 13)"
```

---

## Task 14: Integration — Read(hashline) → Edit → Read(raw) round-trip

**Files:**
- Test: `packages/core/test/integration/read-hashline-edit.test.ts`

- [ ] **Step 1: Write end-to-end test**

`packages/core/test/integration/read-hashline-edit.test.ts`:
```ts
import { describe, expect, test, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { startDaemon, stopDaemon, type DaemonHandle } from '../../src/daemon/lifecycle.js'
import { createRpcClient, type RpcClient } from '../../src/rpc/client.js'

let handle: DaemonHandle
let home: string
let client: RpcClient

const SAMPLE = [
  'export function add(a: number, b: number) {',
  '  return a + b',
  '}',
  '',
  'export function sub(a: number, b: number) {',
  '  return a - b',
  '}',
  '',
].join('\n')

beforeAll(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'glm-e2e-'))
  process.env.GLM_HOME = home
  handle = await startDaemon()
  client = await createRpcClient(path.join(home, 'daemon.sock'))
})
afterAll(async () => {
  await client.close()
  await stopDaemon(handle)
  await fs.rm(home, { recursive: true, force: true })
})

describe('Read(hashline) → Edit → Read(raw)', () => {
  test('the LLM-like loop: get anchored text, replace a line, verify', async () => {
    const file = path.join(home, 'math.ts')
    await fs.writeFile(file, SAMPLE)

    // 1. LLM reads with hashline.
    const read = await client.request('tool.call', {
      name: 'Read', params: { url: `local://${file}`, format: 'hashline' },
    }) as { ok: true; data: { text: string } }
    expect(read.ok).toBe(true)
    const lines = read.data.text.split('\n')
    // Find the anchor for line 2 ("  return a + b").
    const subAnchor = lines[1]!.split('|')[0]
    expect(subAnchor).toMatch(/^2[a-z]{2}$/)

    // 2. Apply Edit with that anchor.
    const edit = await client.request('tool.call', {
      name: 'Edit',
      params: {
        path: file,
        ops: [{ anchor: subAnchor, action: 'replace', text: '~  return a + b + 0 // identity' }],
      },
    }) as { ok: true; data: { applied: number } }
    expect(edit.ok).toBe(true)
    expect(edit.data.applied).toBe(1)

    // 3. Verify with raw Read.
    const after = await client.request('tool.call', {
      name: 'Read', params: { url: `local://${file}` },
    }) as { ok: true; data: { text: string } }
    expect(after.data.text.split('\n')[1]).toBe('  return a + b + 0 // identity')
  })

  test('Edit recovers when the LLM cites a stale line number (whole-file fallback)', async () => {
    const file = path.join(home, 'shift.ts')
    // 20-line file; "A" is at line 2; the LLM will claim line 18 — well outside the ±5 window.
    const lines = ['// header', 'A', ...Array.from({ length: 18 }, (_, i) => `noise-${i}`)]
    await fs.writeFile(file, lines.join('\n') + '\n')
    const read = await client.request('tool.call', {
      name: 'Read', params: { url: `local://${file}`, format: 'hashline' },
    }) as { ok: true; data: { text: string } }
    const aLine = read.data.text.split('\n')[1]! // "2xx|A"
    const hash = aLine.split('|')[0]!.slice(1)
    // Cite line 18 — outside the ±5 window of line 2, so recovery falls through to whole-file scan.
    const edit = await client.request('tool.call', {
      name: 'Edit',
      params: {
        path: file,
        ops: [{ anchor: `18${hash}`, action: 'replace', text: '~A!' }],
      },
    }) as { ok: true; data: { applied: number; recoveries: { kind: string }[] } }
    expect(edit.ok).toBe(true)
    expect(edit.data.recoveries[0]?.kind).toBe('whole')
  })

  test('MultiEdit aborts atomically on any HASH_MISMATCH', async () => {
    const file = path.join(home, 'atomic.ts')
    const orig = 'foo\nbar\nbaz\n'
    await fs.writeFile(file, orig)
    const r = await client.request('tool.call', {
      name: 'MultiEdit',
      params: {
        path: file,
        ops: [
          { anchor: '1aa', action: 'replace', text: '~bad-anchor' },
          { anchor: '2zz', action: 'replace', text: '~also-bad' },
        ],
      },
    }) as { ok: false; error: { code: string } }
    expect(r.ok).toBe(false)
    expect(r.error.code).toBe('HASH_MISMATCH')
    expect(await fs.readFile(file, 'utf-8')).toBe(orig)
  })
})
```

- [ ] **Step 2: Run integration test**

```bash
pnpm vitest run packages/core/test/integration/read-hashline-edit.test.ts
```

Expected: PASS (3 tests). If `shift` recovery picks the wrong line, double-check that the test's "wrong line" claim is at least 6 lines away from the real line so the ±5 window misses and the whole-file scan kicks in.

- [ ] **Step 3: Run the full P3 test suite**

```bash
pnpm vitest run
```

Expected: PASS — all P1 + P3 tests green.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test(core): Read(hashline)→Edit→Read e2e + atomic MultiEdit rollback (P3 task 14)"
```

---

## Task 14.5: Hashline benchmark harness (acceptance gate §13.5)

**Files:**
- Create: `packages/core/src/tools/hashline/benchmark.ts`
- Create: `packages/core/test/bench/hashline-bench.ts`
- Create: `packages/cli/src/commands/bench.ts`
- Modify: `packages/cli/src/bin.ts` (register `bench` subcommand)

> Per spec §13.4 / §13.5, the GLM-5.1 hashline edit pass-rate gate is `edit ≥ 90%` with `patch fail ≤ 8%` and `tokens ±10% vs baseline`. P3 ships the bench harness now (mock-LLM mode for CI); the `--real` mode runs against a live model weekly per spec §13.4.

- [ ] **Step 1: Write failing benchmark unit test**

`packages/core/test/bench/hashline-bench.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { runHashlineBench, type BenchConfig, type BenchReport } from '../../src/tools/hashline/benchmark.js'

const CONFIG: BenchConfig = {
  models: ['mock'],
  separators: ['|'],
  runsPerTask: 2,
  mode: 'mock',
}

describe('hashline benchmark harness', () => {
  test('mock mode produces a complete report', async () => {
    const report: BenchReport = await runHashlineBench(CONFIG)
    expect(report.tasks).toHaveLength(12)         // 12 reference tasks
    expect(report.results.length).toBeGreaterThan(0)
    expect(report.summary.editPassRate).toBeGreaterThanOrEqual(0)
    expect(report.summary.editPassRate).toBeLessThanOrEqual(1)
    expect(report.summary.patchFailRate).toBeGreaterThanOrEqual(0)
    expect(report.summary.patchFailRate).toBeLessThanOrEqual(1)
    expect(typeof report.summary.tokensMean).toBe('number')
  })

  test('mock mode hits the 90% edit gate (deterministic mock)', async () => {
    const report = await runHashlineBench(CONFIG)
    // Mock LLM is engineered to apply the correct anchor; gate must pass.
    expect(report.summary.editPassRate).toBeGreaterThanOrEqual(0.9)
    expect(report.summary.patchFailRate).toBeLessThanOrEqual(0.08)
  })

  test('report serializes to JSON', async () => {
    const report = await runHashlineBench(CONFIG)
    const json = JSON.stringify(report)
    expect(json.length).toBeGreaterThan(100)
    expect(JSON.parse(json)).toMatchObject({
      summary: expect.objectContaining({ editPassRate: expect.any(Number) }),
    })
  })
})
```

- [ ] **Step 2: Run test — should FAIL**

```bash
pnpm vitest run packages/core/test/bench/hashline-bench.ts
```

Expected: FAIL — `Cannot find module .../hashline/benchmark`.

- [ ] **Step 3: Implement benchmark harness**

`packages/core/src/tools/hashline/benchmark.ts`:
```ts
import fs from 'node:fs/promises'
import path from 'node:path'
import { initHashline } from './hash.js'
import { toHashlines } from './format.js'
import { applyEditOps } from '../edit/apply.js'

export type BenchMode = 'mock' | 'real'

export interface BenchTask {
  id: string
  description: string
  original: string         // file content the LLM sees as hashlines
  expected: string         // expected post-edit content
  targetLine: number       // 1-based line the LLM should anchor on
  newText: string          // the desired replacement payload (without echo prefix)
}

export interface BenchConfig {
  models: string[]
  separators: string[]
  runsPerTask: number
  mode: BenchMode
  outDir?: string          // .glm/bench/ default
  apiKeyEnv?: string       // for real mode, env var name (default GLM_API_KEY)
}

export interface BenchRunResult {
  taskId: string
  model: string
  separator: string
  run: number
  taskPass: boolean        // LLM picked the right anchor
  editPass: boolean        // edit actually applied
  patchFail: boolean       // edit attempted but file came out wrong
  tokens: number
  durationMs: number
}

export interface BenchSummary {
  taskPassRate: number
  editPassRate: number
  patchFailRate: number
  tokensMean: number
  tokensStddev: number
}

export interface BenchReport {
  config: BenchConfig
  tasks: BenchTask[]
  results: BenchRunResult[]
  summary: BenchSummary
  generatedAt: string
}

const REFERENCE_TASKS: BenchTask[] = buildReferenceTasks()

export async function runHashlineBench(config: BenchConfig): Promise<BenchReport> {
  await initHashline()
  const results: BenchRunResult[] = []
  for (const task of REFERENCE_TASKS) {
    for (const model of config.models) {
      for (const sep of config.separators) {
        for (let run = 0; run < config.runsPerTask; run++) {
          const r = await runOne(task, model, sep, run, config.mode, config.apiKeyEnv)
          results.push(r)
        }
      }
    }
  }
  const report: BenchReport = {
    config,
    tasks: REFERENCE_TASKS,
    results,
    summary: summarize(results),
    generatedAt: new Date().toISOString(),
  }
  if (config.outDir) {
    const file = path.join(config.outDir, `hashline-${Date.now()}.json`)
    await fs.mkdir(config.outDir, { recursive: true })
    await fs.writeFile(file, JSON.stringify(report, null, 2))
  }
  return report
}

async function runOne(task: BenchTask, model: string, sep: string, run: number, mode: BenchMode, apiKeyEnv = 'GLM_API_KEY'): Promise<BenchRunResult> {
  const started = Date.now()
  const hashlines = toHashlines(task.original, { separator: sep }).join('\n')
  const anchor = await pickAnchor(model, task, hashlines, mode, apiKeyEnv)
  const taskPass = anchor.line === task.targetLine
  let editPass = false
  let patchFail = false
  try {
    const out = applyEditOps(task.original, [{ anchor: anchor.fullAnchor, action: 'replace', text: `~${task.newText}` }])
    editPass = out === task.expected
    patchFail = !editPass
  } catch {
    patchFail = true
  }
  return {
    taskId: task.id, model, separator: sep, run,
    taskPass, editPass, patchFail,
    tokens: anchor.tokens,
    durationMs: Date.now() - started,
  }
}

interface PickedAnchor { line: number; fullAnchor: string; tokens: number }

async function pickAnchor(model: string, task: BenchTask, hashlines: string, mode: BenchMode, apiKeyEnv: string): Promise<PickedAnchor> {
  if (mode === 'mock' || model === 'mock') {
    // Deterministic mock: extract the anchor for the targetLine from the hashline output.
    const line = hashlines.split('\n')[task.targetLine - 1] ?? ''
    const fullAnchor = (line.split('|')[0] ?? '').trim()
    return { line: task.targetLine, fullAnchor, tokens: 32 }
  }
  // real mode: call the configured model via the GLM API; uses LLMService from P6 once available.
  const apiKey = process.env[apiKeyEnv]
  if (!apiKey) throw new Error(`real-mode benchmark requires ${apiKeyEnv} to be set`)
  // P3-stub: until P6 lands, document the wire format; throw so real mode is opt-in only.
  throw new Error(`real-mode hashline benchmark requires P6 LLM router — re-run after P6`)
}

function summarize(results: BenchRunResult[]): BenchSummary {
  if (results.length === 0) {
    return { taskPassRate: 0, editPassRate: 0, patchFailRate: 0, tokensMean: 0, tokensStddev: 0 }
  }
  const taskPass = results.filter(r => r.taskPass).length / results.length
  const editPass = results.filter(r => r.editPass).length / results.length
  const patchFail = results.filter(r => r.patchFail).length / results.length
  const tokens = results.map(r => r.tokens)
  const mean = tokens.reduce((s, x) => s + x, 0) / tokens.length
  const variance = tokens.reduce((s, x) => s + (x - mean) ** 2, 0) / tokens.length
  return {
    taskPassRate: taskPass,
    editPassRate: editPass,
    patchFailRate: patchFail,
    tokensMean: mean,
    tokensStddev: Math.sqrt(variance),
  }
}

function buildReferenceTasks(): BenchTask[] {
  // 12 reference tasks covering: single-line replace, multi-line replace, delete, insert,
  // adjacent-context recovery, whole-file recovery, edge-of-file, indentation preservation,
  // tab vs space, unicode, very-long lines, CRLF.
  const tasks: BenchTask[] = []
  const mk = (id: string, description: string, original: string, expected: string, targetLine: number, newText: string) => {
    tasks.push({ id, description, original, expected, targetLine, newText })
  }
  mk('single-replace',     'replace one line',              'alpha\nbeta\ngamma\n', 'alpha\nBETA\ngamma\n', 2, 'BETA')
  mk('first-line',         'replace first line',            'alpha\nbeta\n',         'ALPHA\nbeta\n',         1, 'ALPHA')
  mk('last-line',          'replace last line',             'a\nb\nc\n',             'a\nb\nC\n',             3, 'C')
  mk('indented',           'preserve indentation',          'fn() {\n  return 1\n}\n', 'fn() {\n  return 2\n}\n', 2, '  return 2')
  mk('with-tabs',          'tabs are preserved',            'fn() {\n\treturn 1\n}\n', 'fn() {\n\treturn 2\n}\n', 2, '\treturn 2')
  mk('unicode',            'unicode anchor + body',         'こんにちは\nworld\n',     'さようなら\nworld\n',     1, 'さようなら')
  mk('long-line',          'very long line',                'short\n' + 'x'.repeat(400) + '\n', 'short\nREPLACED\n', 2, 'REPLACED')
  mk('comment-line',       'comment replace',               '// note\ncode\n',        '// fixed\ncode\n',       1, '// fixed')
  mk('blank-line',         'blank line is editable',        'a\n\nb\n',               'a\n# spacer\nb\n',       2, '# spacer')
  mk('crlf-line',          'CRLF preserved',                'a\r\nb\r\nc\r\n',        'a\r\nB\r\nc\r\n',        2, 'B')
  mk('mid-block',          'middle of 10-line file',        Array.from({ length: 10 }, (_, i) => `line${i}`).join('\n') + '\n',
                           Array.from({ length: 10 }, (_, i) => i === 4 ? 'REPLACED' : `line${i}`).join('\n') + '\n', 5, 'REPLACED')
  mk('punctuation',        'replace punctuation-heavy line', 'a\n[{"key":"value"}]\nb\n', 'a\n[{"key":"NEW"}]\nb\n', 2, '[{"key":"NEW"}]')
  return tasks
}
```

> **Note on `applyEditOps`:** P3 Task 7 implements `applyEditOps`. If the exported name differs, adjust the import in `benchmark.ts` to match. The bench depends only on Task 1-7 surface (hashline format, Edit op planner) — no daemon RPC needed.

- [ ] **Step 4: Run test — should PASS (mock mode)**

```bash
pnpm vitest run packages/core/test/bench/hashline-bench.ts
```

Expected: PASS (3 tests). Mock mode is deterministic so the 90% gate is always hit.

- [ ] **Step 5: Implement CLI `glm bench hashline`**

`packages/cli/src/commands/bench.ts`:
```ts
import { Command } from 'commander'
import { runHashlineBench } from '@glm/core/tools/hashline/benchmark'
import kleur from 'kleur'

export function registerBenchCommand(program: Command): void {
  const cmd = program.command('bench').description('benchmark harnesses (hashline, etc.)')

  cmd.command('hashline')
    .description('run the hashline edit benchmark (12 tasks × N models × M separators × R runs)')
    .option('-m, --model <name...>', 'models to run (mock for fast CI; real models require P6)', ['mock'])
    .option('-s, --separator <ch...>', 'separator candidates to try', ['|'])
    .option('-r, --runs <n>', 'runs per task', (v) => Number(v), 24)
    .option('--real', 'use real LLM (requires GLM_API_KEY + P6)')
    .option('--out <dir>', 'output directory', '.glm/bench')
    .action(async (opts: { model: string[]; separator: string[]; runs: number; real?: boolean; out: string }) => {
      const report = await runHashlineBench({
        models: opts.model,
        separators: opts.separator,
        runsPerTask: opts.runs,
        mode: opts.real ? 'real' : 'mock',
        outDir: opts.out,
      })
      const s = report.summary
      console.log(kleur.cyan('Hashline benchmark summary'))
      console.log(`  edit pass:   ${(s.editPassRate * 100).toFixed(1)}%   (gate ≥ 90%)`)
      console.log(`  patch fail:  ${(s.patchFailRate * 100).toFixed(1)}%  (gate ≤ 8%)`)
      console.log(`  tokens μ/σ:  ${s.tokensMean.toFixed(1)} / ${s.tokensStddev.toFixed(1)}`)
      const editGate = s.editPassRate >= 0.90
      const failGate = s.patchFailRate <= 0.08
      console.log(editGate && failGate ? kleur.green('GATES PASSED') : kleur.red('GATES FAILED'))
      process.exit(editGate && failGate ? 0 : 1)
    })
}
```

- [ ] **Step 6: Register subcommand**

In `packages/cli/src/bin.ts` (mirrors P1 registration style):
```ts
import { registerBenchCommand } from './commands/bench.js'
// ...
registerBenchCommand(program)
```

- [ ] **Step 7: Smoke**

```bash
pnpm build
node packages/cli/dist/bin.js bench hashline
```

Expected: prints a summary table, exits 0 with `GATES PASSED` (mock mode is deterministic).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(core,cli): hashline benchmark harness + glm bench hashline (P3 task 14.5)"
```

---

## Task 15: CLI surface — `glm tool list` + `glm tool call`

**Files:**
- Create: `packages/cli/src/commands/tool.ts`
- Modify: `packages/cli/src/bin.ts` (register `tool` subcommand)

- [ ] **Step 1: Write `glm tool` commands**

`packages/cli/src/commands/tool.ts`:
```ts
import { Command } from 'commander'
import { connectDaemon } from '../auto-spawn.js'
import kleur from 'kleur'

export function registerToolCommand(program: Command): void {
  const cmd = program.command('tool').description('tool registry interaction (developer surface)')

  cmd.command('list').description('list all registered tools').action(async () => {
    const client = await connectDaemon()
    const r = await client.request('tool.list', {}) as { tools: { name: string; description: string }[] }
    for (const t of r.tools) {
      console.log(`${kleur.cyan(t.name.padEnd(12))}  ${t.description}`)
    }
    await client.close()
  })

  cmd.command('call <name>')
    .description('call a tool with JSON params (read from --params <json> or stdin)')
    .option('-p, --params <json>', 'JSON params payload')
    .option('-s, --session <id>', 'session id (for session-scoped tools)')
    .action(async (name: string, opts: { params?: string; session?: string }) => {
      const params = opts.params ? JSON.parse(opts.params) : await readStdinJson()
      const client = await connectDaemon()
      const r = await client.request('tool.call', { name, params, sessionId: opts.session ?? null })
      console.log(JSON.stringify(r, null, 2))
      await client.close()
    })
}

async function readStdinJson(): Promise<unknown> {
  if (process.stdin.isTTY) return {}
  const chunks: Buffer[] = []
  for await (const c of process.stdin) chunks.push(c as Buffer)
  const text = Buffer.concat(chunks).toString('utf-8').trim()
  return text ? JSON.parse(text) : {}
}
```

- [ ] **Step 2: Register subcommand in `bin.ts`**

In `packages/cli/src/bin.ts`, add (mirroring how P1 registers `sessions`, `attach`, etc.):
```ts
import { registerToolCommand } from './commands/tool.js'
// ...
registerToolCommand(program)
```

- [ ] **Step 3: Build + smoke**

```bash
pnpm build
node packages/cli/dist/bin.js tool list
```

Expected (with daemon running):
```
Bash         Run a shell command. ...
Edit         Apply a single hashline-anchored edit. ...
Glob         Find files by glob pattern. ...
Grep         Search files for a regex pattern. ...
MultiEdit    Apply N hashline-anchored ops atomically. ...
Read         Read a resource by internal URL. ...
Task         Delegate a self-contained sub-task ...
TodoWrite    Replace this session's todo list ...
Write        Atomically write content to a file ...
```

- [ ] **Step 4: Smoke `Read` from CLI**

```bash
echo '{"url":"local://README.md","format":"hashline"}' \
  | node packages/cli/dist/bin.js tool call Read
```

Expected: JSON output with `"ok": true` and `data.text` containing hashline-prefixed lines.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(cli): glm tool list + glm tool call (P3 task 15)"
```

---

## P3 Completion — Verification Checklist

Before declaring P3 done, run all of these and confirm output:

- [ ] **Build clean:** `pnpm build` → no errors.
- [ ] **All tests pass:** `pnpm vitest run` → all green (≈45 new tests on top of the ≈20 from P1; total ≈65).
- [ ] **Tool list:**
  ```bash
  node packages/cli/dist/bin.js tool list
  ```
  Expected: exactly 9 rows (`Bash`, `Edit`, `Glob`, `Grep`, `MultiEdit`, `Read`, `Task`, `TodoWrite`, `Write`).

- [ ] **Hashline read:**
  ```bash
  echo '{"url":"local://README.md","format":"hashline"}' \
    | node packages/cli/dist/bin.js tool call Read | jq -r '.data.text' | head -3
  ```
  Expected: 3 lines, each matching `^[0-9]+[a-z]{2}\|`.

- [ ] **Edit round-trip:**
  ```bash
  TMP=$(mktemp); printf 'alpha\nbeta\ngamma\n' > $TMP
  ANCHOR=$(echo "{\"url\":\"local://$TMP\",\"format\":\"hashline\"}" \
    | node packages/cli/dist/bin.js tool call Read | jq -r '.data.text' | sed -n '2p' | cut -d'|' -f1)
  echo "{\"path\":\"$TMP\",\"ops\":[{\"anchor\":\"$ANCHOR\",\"action\":\"replace\",\"text\":\"~BETA\"}]}" \
    | node packages/cli/dist/bin.js tool call Edit
  cat $TMP
  ```
  Expected: file content is `alpha`, `BETA`, `gamma`.

- [ ] **Bash timeout enforced:**
  ```bash
  echo '{"command":"sleep 5","timeoutMs":500}' \
    | node packages/cli/dist/bin.js tool call Bash | jq '.error.code'
  ```
  Expected: `"TIMEOUT"`.

- [ ] **Stubbed schemes return NOT_IMPLEMENTED:**
  ```bash
  for SCHEME in memory mcp skill rule agent artifact conflict; do
    echo "{\"url\":\"$SCHEME://x/y\"}" \
      | node packages/cli/dist/bin.js tool call Read | jq -r '.error.code + " " + (.error.detail.phase // "")'
  done
  ```
  Expected: 7 lines, each `NOT_IMPLEMENTED <phase>` (P7, P4, P4, P4, P8, P10, v0.2).

- [ ] **MultiEdit atomic rollback:** see `read-hashline-edit.test.ts` integration test.

- [ ] **No daemon process leak after stop:**
  ```bash
  node packages/cli/dist/bin.js daemon stop
  ps aux | grep daemon-entry | grep -v grep || echo 'clean'
  ```

If any check fails, fix before declaring P3 done.

---

## What P3 does NOT include (deferred to later P-plans)

These are intentionally out of scope for P3:

- **MCP host / resource fetching** — `mcp://` returns NOT_IMPLEMENTED. Full client + server bridge ships in **P4**.
- **Skill / Rule loaders** — `skill://`, `rule://` are stubs. Skill cascade arrives in **P4**.
- **Memory layer (`memory://`)** — Trio + Hindsight memory ships in **P7**.
- **Sub-agent fan-out (`Task`, `agent://`)** — schema-only stub here; the real workers land in **P8**.
- **Built-in LSP** — diagnostics + go-to-def from `cclsp`/`opencode` come in **P7** (spec §5.10 misnumber: see §9.10).
- **Artifact blob store (`artifact://`)** — content-addressable spillover storage arrives in **P10**.
- **Conflict resolver (`conflict://`)** — token-based merge resolution comes in **P9** alongside checkpoints.
- **Permission prompting / hook intercept** — `checkPermission` returns allow/deny only; UI prompts + audit hooks ship in **P5**.
- **AST-edit / structural rewrites** — v0.2 feature; outside the P-plan series for v0.1.
- **`Task` orchestration** — sub-agent dispatch, model routing, rate-limit aware queues — all in **P8**.
- **Streaming RPC responses** — tools currently return a single result blob; per-event streaming over RPC comes with the chat-stream contract in **P6**.
- **Audit log usage** — the `tool_call_log` table is created in migration 002 but no code writes to it yet. Hook system in **P5** is the natural producer.

P3 is the **agent's hands**. After P3, an LLM can read code, edit code, search code, and run shell — but it still talks to a stub model. P6 will swap in the real GLM API; P4 will plug in MCP and skill resources; P5 will gate every tool call through hooks and permissions. The contracts established here — `ToolRegistry`, `ToolContext`, hashline anchors, internal URLs — are the surface every subsequent P-plan integrates against.
