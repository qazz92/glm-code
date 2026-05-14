# glm code — P7: Memory & Context Engine + Memory Trio + AGENTS.md Cascade + Compaction + Built-in LSP

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Memory & Context Engine — the brain that turns raw conversation history + AGENTS.md cascade + memory trio + skill catalog into a single, cache-friendly LLM request budget — plus the Memory Trio (notepad / project-memory / shared-memory) RPC layer and the Built-in LSP host (auto-spawn language servers, cclsp-style position resolution, PostEdit auto-diagnostics).

**Architecture:** Three orthogonal subsystems wired into the daemon:

1. **Memory Engine** — pure context assembly. Reads AGENTS.md cascade, `## Memories` index + bodies, compacted summary, and conversation tail; emits the final `system + messages` payload that P6's LLM Router consumes. Owns compaction trigger, tool-output pruning, snapshot+diff, prompt-cache marker injection, differential file display.
2. **Memory Trio** — three independent stores accessed via RPC. `notepad` (markdown, compaction-survivor), `project-memory` (JSON, notes vs directives split), `shared-memory` (file-locked KV for cross-agent comms via `proper-lockfile`).
3. **LSP Host** — language registry + auto-spawn via `child_process.spawn`, JSON-RPC client to each LSP, position resolution heuristic, PostEdit auto-diagnostics hook (uses P5's PostToolUse infrastructure). Surfaces 12 LSP tools that the LLM can call.

**Tech Stack additions (on top of P1/P3/P5/P6):** `vscode-jsonrpc` (LSP client transport), `vscode-languageserver-protocol` (LSP type definitions), `proper-lockfile` (cross-process file locks), `js-yaml` (frontmatter parse), `xxhash-wasm` (memory body hashing for dedupe), `gray-matter` (markdown frontmatter parse), `diff` (already in P3 for snapshot diffs).

**Dependencies imported:**
- **P1**: Daemon class, `~/.glm` path resolver, SQLite + migrations, RPC server, `SessionRepo`
- **P3**: `Read` tool (file IO), `Edit` tool (PostEdit hook target), file-versions blob store layout
- **P5**: PostToolUse hook dispatcher (we register `lsp.diagnostics` as a hook target)
- **P6**: `LlmRouter.call(request)` for the compaction summarizer call

**Acceptance criteria for P7:**
- AGENTS.md cascade resolver returns first-match-wins set; global never stacks with project; @filepath imports expand depth 3 with visited-set cycle protection
- Recursive file-relative discovery attaches nearest AGENTS.md once per turn when a deep file is read
- `## Memories` section parser/writer round-trips index entries; body files have frontmatter; caps (200 lines / 25 KB / 200 files / 5 MB / 4 KB body) enforced; score-based eviction triggered when caps exceeded
- `/memory list|show|pin|archive|delete|search|compact` slash commands work end-to-end
- Context Assembler emits 6-block structure with `cache_control: ephemeral` markers on system + skill catalog + AGENTS.md cascade
- Compaction trigger fires at `usable = ctx - reservedOutput - buffer` (≈176K for GLM-5.1); calls P6 LLM Router with structured Markdown template; produces 7-section summary; preserves last 2 turns / max 8K tokens; prunes tool outputs >2K chars (except `skill`/`memory`/`Task`)
- Snapshot+diff: every compaction writes file_versions rows + content-addressable blobs to `~/.glm/sessions/<id>/snapshots/`
- Differential file display: Edit results show diff hunks not full file when the same file appears 2+ times in history
- Memory Trio: `notepad.write*`, `project.{addNote,addDirective,read}`, `shared.{read,write,delete,list}` all reachable via RPC; shared-memory uses `proper-lockfile` with retry; notepad is appended-to-compacted-summary so it survives compaction
- LSP host auto-spawns `typescript-language-server` for `.ts`, `pyright-langserver` for `.py`, `gopls` for `.go`, `rust-analyzer` for `.rs`, `clangd` for `.c/.cpp`, `jdtls` for `.java` (and registry is extensible)
- Position resolution finds symbols using hint-line ± 5 + document symbols + workspace symbols, ranked
- PostEdit auto-diagnostics: after Edit/Write succeeds, LSP `textDocument/publishDiagnostics` results are inlined into the tool result
- 12 LSP tools (`lsp_diagnostics`, `lsp_diagnostics_directory`, `lsp_goto_definition`, `lsp_find_references`, `lsp_hover`, `lsp_rename`, `lsp_document_symbols`, `lsp_workspace_symbols`, `lsp_code_actions`, `lsp_code_action_resolve`, `lsp_prepare_rename`, `lsp_servers`) wired to RPC
- Integration test: load AGENTS.md cascade (global + project + deep file-relative), hit context-usage > threshold, trigger compaction, verify next request carries summary + tail + pruned tool outputs
- 80%+ unit coverage on `memory/`, `context/`, `lsp/`; all integration tests pass

---

## File Structure (additions on top of P1/P3/P5/P6)

```
packages/
├── shared/
│   └── src/
│       ├── types.ts                              # MOD: + MemoryRecord, CompactedSummary, LspServerSpec, ContextBlock
│       └── memory-types.ts                       # NEW: shared memory domain types
├── core/
│   ├── package.json                              # MOD: + vscode-jsonrpc, vscode-languageserver-protocol,
│   │                                             #       proper-lockfile, js-yaml, gray-matter, xxhash-wasm
│   ├── src/
│   │   ├── memory/
│   │   │   ├── index.ts                          # NEW: barrel
│   │   │   ├── cascade.ts                        # NEW: AGENTS.md cascade resolver
│   │   │   ├── imports.ts                        # NEW: @filepath import expander (depth 3, visited set)
│   │   │   ├── file-relative.ts                  # NEW: walk-up file-relative discovery
│   │   │   ├── memories-section.ts               # NEW: ## Memories parser + writer
│   │   │   ├── memory-store.ts                   # NEW: body file CRUD (.glm/memory/<slug>.md)
│   │   │   ├── memory-eviction.ts                # NEW: score formula + cap enforcement
│   │   │   ├── auto-writer.ts                    # NEW: orchestrator-qualified memory append (dedupe)
│   │   │   └── memory-rpc.ts                     # NEW: RPC methods for /memory CRUD
│   │   ├── notepad/
│   │   │   ├── index.ts
│   │   │   ├── notepad-store.ts                  # NEW: .glm/notepad.md 3-tier writer
│   │   │   └── notepad-rpc.ts                    # NEW: notepad.write / read / prune
│   │   ├── project-memory/
│   │   │   ├── index.ts
│   │   │   ├── project-store.ts                  # NEW: .glm/project-memory.json notes vs directives
│   │   │   └── project-rpc.ts                    # NEW: project.add* / get / read
│   │   ├── shared-memory/
│   │   │   ├── index.ts
│   │   │   ├── shared-store.ts                   # NEW: .glm/shared/<key>.json file-locked KV
│   │   │   └── shared-rpc.ts                     # NEW: shared.read / write / delete / list
│   │   ├── context/
│   │   │   ├── index.ts
│   │   │   ├── assembler.ts                      # NEW: 6-block context builder
│   │   │   ├── cache-marker.ts                   # NEW: ephemeral cache_control injection
│   │   │   ├── compaction-trigger.ts             # NEW: usable() calc + threshold check
│   │   │   ├── compactor.ts                      # NEW: LLM-driven summarize (P6 router call)
│   │   │   ├── compaction-template.ts            # NEW: structured Markdown template + parser
│   │   │   ├── tail-preserve.ts                  # NEW: last-N-turn extractor
│   │   │   ├── tool-prune.ts                     # NEW: 2K trim with metadata, protected list
│   │   │   ├── snapshot.ts                       # NEW: file_versions writer + blob store
│   │   │   ├── differential-file.ts              # NEW: same-file diff-only display
│   │   │   ├── distillation.ts                   # NEW: 60-min periodic distillation (long-horizon)
│   │   │   └── context-rpc.ts                    # NEW: context.assemble / context.budget RPC
│   │   ├── lsp/
│   │   │   ├── index.ts
│   │   │   ├── language-registry.ts              # NEW: ext → server spec table
│   │   │   ├── root-markers.ts                   # NEW: walk-up package.json / pyproject.toml etc.
│   │   │   ├── lsp-client.ts                     # NEW: vscode-jsonrpc wrapper around spawned server
│   │   │   ├── lsp-host.ts                       # NEW: server registry + auto-spawn + idle shutdown
│   │   │   ├── position-resolver.ts              # NEW: cclsp-style symbol resolver
│   │   │   ├── post-edit-hook.ts                 # NEW: PostToolUse listener for auto-diagnostics
│   │   │   ├── tools/
│   │   │   │   ├── diagnostics.ts
│   │   │   │   ├── diagnostics-directory.ts
│   │   │   │   ├── goto-definition.ts
│   │   │   │   ├── find-references.ts
│   │   │   │   ├── hover.ts
│   │   │   │   ├── rename.ts
│   │   │   │   ├── document-symbols.ts
│   │   │   │   ├── workspace-symbols.ts
│   │   │   │   ├── code-actions.ts
│   │   │   │   ├── code-action-resolve.ts
│   │   │   │   ├── prepare-rename.ts
│   │   │   │   └── servers.ts
│   │   │   └── lsp-rpc.ts                        # NEW: register 12 LSP tools as RPC methods
│   │   ├── storage/
│   │   │   └── migrations/
│   │   │       ├── 005_memory_distill.sql        # NEW: distillations table, memory_access_log
│   │   │       ├── 006_file_versions.sql         # NEW: file_versions + snapshots tables
│   │   │       └── 007_compaction.sql            # NEW: compactions + message_parts + tool_calls tables
│   │   ├── memory/
│   │   │   └── loader.ts                         # NEW: LoaderHub.registerSubsystem('memory', ...)
│   │   └── lsp/
│   │       └── loader.ts                         # NEW: LoaderHub.registerSubsystem('lsp', ...)
│   │                                              # NOTE: daemon.ts NOT modified — wiring via LoaderHub
│   └── test/
│       ├── unit/
│       │   ├── cascade.test.ts
│       │   ├── imports.test.ts
│       │   ├── file-relative.test.ts
│       │   ├── memories-section.test.ts
│       │   ├── memory-store.test.ts
│       │   ├── memory-eviction.test.ts
│       │   ├── auto-writer.test.ts
│       │   ├── notepad-store.test.ts
│       │   ├── project-store.test.ts
│       │   ├── shared-store.test.ts
│       │   ├── compaction-trigger.test.ts
│       │   ├── compaction-template.test.ts
│       │   ├── tail-preserve.test.ts
│       │   ├── tool-prune.test.ts
│       │   ├── snapshot.test.ts
│       │   ├── differential-file.test.ts
│       │   ├── cache-marker.test.ts
│       │   ├── assembler.test.ts
│       │   ├── language-registry.test.ts
│       │   ├── root-markers.test.ts
│       │   ├── lsp-client.test.ts
│       │   ├── position-resolver.test.ts
│       │   └── lsp-tools.test.ts
│       └── integration/
│           ├── cascade-deep.test.ts
│           ├── memory-crud-rpc.test.ts
│           ├── trio-rpc.test.ts
│           ├── compaction-end-to-end.test.ts
│           ├── post-edit-diagnostics.test.ts
│           └── lsp-typescript-roundtrip.test.ts
├── cli/
│   └── src/
│       └── commands/
│           └── memory.ts                         # NEW: glm memory list|show|pin|archive|delete|search|compact
```

---

## Task 1: Install dependencies + new migrations + shared types

**Files:**
- Modify: `packages/core/package.json`
- Create: `packages/shared/src/memory-types.ts`
- Create: `packages/shared/src/lsp-types.ts`
- Modify: `packages/shared/src/index.ts` (append re-export lines for memory-types + lsp-types — no edit to `types.ts`)
- Create: `packages/core/src/storage/migrations/005_memory_distill.sql`
- Create: `packages/core/src/storage/migrations/006_file_versions.sql`
- Create: `packages/core/src/storage/migrations/007_compaction.sql`

> **Note (P7-Fix-2):** P7 does NOT modify `packages/shared/src/types.ts`. All new shared types live in domain-specific files (`memory-types.ts`, `lsp-types.ts`); `packages/shared/src/index.ts` only gets two re-export lines appended.

- [ ] **Step 1: Add new core dependencies**

Edit `packages/core/package.json` `dependencies`:
```jsonc
{
  "dependencies": {
    "@glm/shared": "workspace:*",
    "better-sqlite3": "^11.5.0",
    "pino": "^9.5.0",
    "pino-pretty": "^11.3.0",
    "zod": "^3.23.0",
    "vscode-jsonrpc": "^8.2.1",
    "vscode-languageserver-protocol": "^3.17.5",
    "proper-lockfile": "^4.1.2",
    "js-yaml": "^4.1.0",
    "gray-matter": "^4.0.3",
    "xxhash-wasm": "^1.0.2",
    "diff": "^7.0.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "@types/js-yaml": "^4.0.9",
    "@types/proper-lockfile": "^4.1.4",
    "@types/diff": "^6.0.0"
  }
}
```

- [ ] **Step 2: Install**

```bash
pnpm install
```

Expected: install succeeds; lockfile updated.

- [ ] **Step 3: Write `005_memory_distill.sql`**

`packages/core/src/storage/migrations/005_memory_distill.sql`:
```sql
-- Periodic distillation snapshots (long-horizon retrospectives)
CREATE TABLE IF NOT EXISTS distillations (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL,
  ts            TEXT NOT NULL,
  tokens        INTEGER NOT NULL,
  summary       TEXT NOT NULL,
  applied       INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_distill_session_ts ON distillations(session_id, ts);

-- Memory access log (drives access_recency in eviction score)
CREATE TABLE IF NOT EXISTS memory_access_log (
  slug          TEXT NOT NULL,
  scope         TEXT NOT NULL,                -- 'project' | 'global'
  accessed_at   TEXT NOT NULL,
  PRIMARY KEY (slug, scope, accessed_at)
);
CREATE INDEX IF NOT EXISTS idx_mal_slug ON memory_access_log(slug, scope);
```

- [ ] **Step 4: Write `006_file_versions.sql`**

`packages/core/src/storage/migrations/006_file_versions.sql`:
```sql
-- File version tracking for snapshot+diff and differential file display
CREATE TABLE IF NOT EXISTS file_versions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    TEXT NOT NULL,
  path          TEXT NOT NULL,
  blob_sha      TEXT NOT NULL,                -- sha256 of content; blob stored under ~/.glm/sessions/<id>/snapshots/<sha[0:2]>/<sha>
  bytes         INTEGER NOT NULL,
  captured_at   TEXT NOT NULL,
  reason        TEXT NOT NULL,                -- 'pre-edit' | 'post-edit' | 'pre-compaction' | 'manual'
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_fv_session_path ON file_versions(session_id, path, captured_at);
CREATE INDEX IF NOT EXISTS idx_fv_blob_sha ON file_versions(blob_sha);

-- Content-addressable blob ref-count store (snapshots reused across sessions/files)
CREATE TABLE IF NOT EXISTS snapshots (
  sha       TEXT PRIMARY KEY,
  size      INTEGER NOT NULL,
  ref_count INTEGER NOT NULL DEFAULT 0
);
```

- [ ] **Step 5: Write `007_compaction.sql`**

`packages/core/src/storage/migrations/007_compaction.sql`:
```sql
-- Compaction events
CREATE TABLE IF NOT EXISTS compactions (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL,
  ts            TEXT NOT NULL,
  trigger       TEXT NOT NULL,                -- 'usable' | 'manual' | 'distillation'
  input_tokens  INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  summary       TEXT NOT NULL,                -- structured Markdown
  preserved_turns INTEGER NOT NULL,
  pruned_tools  INTEGER NOT NULL,             -- count of tool results trimmed
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_compactions_session_ts ON compactions(session_id, ts);

-- Canonical message parts (text / tool_use / tool_result / thinking / image)
-- NOTE: P3's `002_tools.sql` defines `tool_call_log` as a per-call log. This
-- `tool_calls` table below is the canonical store keyed by tool_use_id.
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

- [ ] **Step 6: Write `memory-types.ts`**

`packages/shared/src/memory-types.ts`:
```ts
export type MemoryType = 'user' | 'feedback' | 'project' | 'reference'
export type MemoryScope = 'project' | 'global'

export interface MemoryFrontmatter {
  name: string
  description: string
  metadata: {
    type: MemoryType
    created: string                 // ISO date
    last_accessed: string
    pin: boolean
    archived: boolean
  }
}

export interface MemoryRecord {
  slug: string                      // file basename without .md
  scope: MemoryScope
  path: string                      // absolute path to body file
  frontmatter: MemoryFrontmatter
  body: string                      // body text after frontmatter, ≤ 4 KB
  bytes: number
}

export interface MemoryIndexEntry {
  name: string                      // human label (== frontmatter.name)
  bodyPath: string                  // relative: ".glm/memory/<slug>.md"
  hook: string                      // 1-line summary shown after em-dash
}

export type ContextRole = 'system' | 'user' | 'assistant' | 'tool'

export interface ContextBlock {
  role: ContextRole
  content: string
  cacheable?: boolean               // true → emits cache_control: ephemeral
  source?: string                   // 'cascade' | 'memories' | 'compacted' | 'tail' | 'tool' | 'user'
  tokens?: number                   // estimated tokens
}

export interface CompactedSummary {
  goal: string
  constraints: string
  progress: { done: string[]; inProgress: string[]; blocked: string[] }
  keyDecisions: string[]
  nextSteps: string[]
  criticalContext: string
  relevantFiles: string[]
  raw: string                       // full structured Markdown
}

export interface ContextBudget {
  system: number
  skills: number
  tools: number
  agents: number
  memories: number
  history: number
  free: number
  total: number
}
```

- [ ] **Step 6b: Write `lsp-types.ts`**

`packages/shared/src/lsp-types.ts`:
```ts
export interface LspServerSpec {
  language: string                  // 'typescript' | 'python' | ...
  command: string                   // 'typescript-language-server'
  args: string[]
  extensions: string[]              // ['.ts', '.tsx', '.js', '.jsx']
  rootMarkers: string[]             // ['package.json', 'tsconfig.json']
  initOpts?: Record<string, unknown>
  idleShutdownMs?: number
}
```

- [ ] **Step 7: Re-export from shared `index.ts`**

Modify `packages/shared/src/index.ts` — append **two lines only** (do NOT touch `types.ts`):
```ts
// (existing exports stay)
export * from './memory-types'
export * from './lsp-types'
```

`ContextBudget` lives inside `memory-types.ts` (above); P7 does NOT edit `packages/shared/src/types.ts`.

- [ ] **Step 9: Build, run existing tests, verify migration loads**

```bash
pnpm build
pnpm vitest run packages/core/test/unit/migrations.test.ts
```

Expected: PASS. Migration runner walks the dir and applies 005 / 006 / 007 along with prior 001-004 (P6 owns 003_llm_router; P8 owns 004_orchestrator). Schema version bumps to 7 once P7 is applied.

If the existing migration test from P1 hard-codes `expect(v).toBe(1)`, update it to expect the current latest version constant. Add a helper:

`packages/core/src/storage/migrations.ts` — append:
```ts
export const LATEST_SCHEMA_VERSION = 7
```

And in `migrations.test.ts`, replace literal `1` with `LATEST_SCHEMA_VERSION` to keep the test forward-compatible.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(core): P7 deps + memory/file-version/compaction migrations + memory-types"
```

---

## Task 2: AGENTS.md cascade resolver (first-match-wins, walk-up, dedupe)

**Files:**
- Create: `packages/core/src/memory/cascade.ts`
- Create: `packages/core/src/memory/index.ts`
- Test: `packages/core/test/unit/cascade.test.ts`

- [ ] **Step 1: Write failing cascade test**

`packages/core/test/unit/cascade.test.ts`:
```ts
import { afterEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { resolveCascade } from '../../src/memory/cascade'

let tmp: string
afterEach(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }) })

function mk(root: string, rel: string, content: string): string {
  const full = path.join(root, rel)
  mkdirSync(path.dirname(full), { recursive: true })
  writeFileSync(full, content)
  return full
}

describe('resolveCascade', () => {
  test('global single file wins over .claude/CLAUDE.md', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-casc-'))
    const home = path.join(tmp, 'home')
    mkdirSync(home, { recursive: true })
    mk(home, '.glm/AGENTS.md', '# glm global\n')
    mk(home, '.claude/CLAUDE.md', '# claude global\n')
    const cwd = path.join(tmp, 'wt')
    mkdirSync(cwd, { recursive: true })
    const r = resolveCascade({ cwd, worktree: cwd, home, extraGlobs: [] })
    expect(r.paths.length).toBe(1)
    expect(r.paths[0]!.endsWith('.glm/AGENTS.md')).toBe(true)
  })

  test('falls through to .claude/CLAUDE.md when no .glm', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-casc-'))
    const home = path.join(tmp, 'home')
    mkdirSync(home, { recursive: true })
    mk(home, '.claude/CLAUDE.md', '# claude global\n')
    const cwd = path.join(tmp, 'wt')
    mkdirSync(cwd, { recursive: true })
    const r = resolveCascade({ cwd, worktree: cwd, home, extraGlobs: [] })
    expect(r.paths.length).toBe(1)
    expect(r.paths[0]!.endsWith('.claude/CLAUDE.md')).toBe(true)
  })

  test('project AGENTS.md found at cwd (no ancestor stack)', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-casc-'))
    const home = path.join(tmp, 'home'); mkdirSync(home, { recursive: true })
    const wt = path.join(tmp, 'wt'); mkdirSync(wt, { recursive: true })
    mk(wt, 'AGENTS.md', '# project root\n')
    mk(wt, 'pkg/sub/AGENTS.md', '# nested\n')
    const r = resolveCascade({ cwd: path.join(wt, 'pkg/sub'), worktree: wt, home, extraGlobs: [] })
    // first match wins, walking UP from cwd — nested should be first hit
    expect(r.paths.find(p => p.endsWith('pkg/sub/AGENTS.md'))).toBeTruthy()
    // no ancestor stack — root AGENTS.md should NOT also be included via cascade
    expect(r.paths.find(p => p === path.join(wt, 'AGENTS.md'))).toBeFalsy()
  })

  test('CLAUDE.md falls back when AGENTS.md absent', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-casc-'))
    const home = path.join(tmp, 'home'); mkdirSync(home, { recursive: true })
    const wt = path.join(tmp, 'wt'); mkdirSync(wt, { recursive: true })
    mk(wt, 'CLAUDE.md', '# project claude\n')
    const r = resolveCascade({ cwd: wt, worktree: wt, home, extraGlobs: [] })
    expect(r.paths.find(p => p.endsWith('CLAUDE.md'))).toBeTruthy()
  })

  test('stops walk-up at worktree boundary', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-casc-'))
    const home = path.join(tmp, 'home'); mkdirSync(home, { recursive: true })
    // worktree boundary is /tmp/.../wt — AGENTS.md OUTSIDE wt must not be found
    mk(tmp, 'AGENTS.md', '# outside worktree\n')
    const wt = path.join(tmp, 'wt'); mkdirSync(wt, { recursive: true })
    const cwd = path.join(wt, 'deep/sub'); mkdirSync(cwd, { recursive: true })
    const r = resolveCascade({ cwd, worktree: wt, home, extraGlobs: [] })
    // no project file inside worktree => zero project paths
    expect(r.paths.find(p => p === path.join(tmp, 'AGENTS.md'))).toBeFalsy()
  })

  test('extraGlobs from config are appended after cascade', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-casc-'))
    const home = path.join(tmp, 'home'); mkdirSync(home, { recursive: true })
    const wt = path.join(tmp, 'wt'); mkdirSync(wt, { recursive: true })
    mk(wt, 'AGENTS.md', '# project\n')
    mk(wt, 'extra/rules.md', '# extra\n')
    const r = resolveCascade({
      cwd: wt, worktree: wt, home,
      extraGlobs: [path.join(wt, 'extra/rules.md')]
    })
    expect(r.paths[r.paths.length - 1]!.endsWith('extra/rules.md')).toBe(true)
  })

  test('global + project dedupe (no duplicate if same file)', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-casc-'))
    const home = path.join(tmp, 'home'); mkdirSync(home, { recursive: true })
    const wt = path.join(tmp, 'wt'); mkdirSync(wt, { recursive: true })
    mk(home, '.glm/AGENTS.md', '# global\n')
    mk(wt, 'AGENTS.md', '# project\n')
    const r = resolveCascade({ cwd: wt, worktree: wt, home, extraGlobs: [] })
    expect(r.paths.length).toBe(2)
    expect(new Set(r.paths).size).toBe(2)
  })
})
```

- [ ] **Step 2: Run — FAIL**

```bash
pnpm vitest run packages/core/test/unit/cascade.test.ts
```

Expected: FAIL (module missing).

- [ ] **Step 3: Implement cascade**

`packages/core/src/memory/cascade.ts`:
```ts
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'

export interface ResolveCascadeOpts {
  cwd: string
  worktree: string
  home: string
  extraGlobs?: string[]
}

export interface CascadeResult {
  paths: string[]                   // ordered: global first, then project (walk-up first match), then extras
}

const GLOBAL_CANDIDATES = ['.glm/AGENTS.md', '.claude/CLAUDE.md'] as const
const PROJECT_CANDIDATES = ['AGENTS.md', 'CLAUDE.md'] as const

export function resolveCascade(opts: ResolveCascadeOpts): CascadeResult {
  const out: string[] = []
  const seen = new Set<string>()

  // 1) Global — first match wins
  for (const rel of GLOBAL_CANDIDATES) {
    const p = path.join(opts.home, rel)
    if (existsSync(p) && statSync(p).isFile()) {
      pushUnique(out, seen, p)
      break
    }
  }

  // 2) Project — walk UP from cwd to worktree, first AGENTS.md (or CLAUDE.md) wins
  //    "first-match-wins": NO ancestor stacking. We take the deepest one only.
  const projectHit = findFirstWalkUp(opts.cwd, opts.worktree, PROJECT_CANDIDATES)
  if (projectHit) pushUnique(out, seen, projectHit)

  // 3) Extras (user-defined config.instructions globs) — already resolved by caller
  for (const g of opts.extraGlobs ?? []) {
    if (existsSync(g) && statSync(g).isFile()) pushUnique(out, seen, g)
  }

  return { paths: out }
}

function pushUnique(arr: string[], seen: Set<string>, p: string): void {
  const abs = path.resolve(p)
  if (seen.has(abs)) return
  seen.add(abs)
  arr.push(abs)
}

/**
 * Walk up from `start` toward `boundary` (inclusive). At each dir, try each candidate
 * filename in order. Return the FIRST hit. If nothing found by the time we reach
 * `boundary`, return undefined.
 *
 * NOTE: This is "first-match-wins, deepest-first" — i.e. we do NOT collect every
 * AGENTS.md up the tree (no ancestor stack). Only the closest one to `start`.
 */
function findFirstWalkUp(start: string, boundary: string, candidates: readonly string[]): string | undefined {
  let dir = path.resolve(start)
  const stop = path.resolve(boundary)
  // Walk up until we leave `boundary`
  while (true) {
    for (const name of candidates) {
      const p = path.join(dir, name)
      if (existsSync(p) && statSync(p).isFile()) return p
    }
    if (dir === stop) return undefined
    const parent = path.dirname(dir)
    // If we've climbed above boundary, abort
    if (!isInsideOrEqual(parent, stop)) return undefined
    if (parent === dir) return undefined
    dir = parent
  }
}

function isInsideOrEqual(target: string, root: string): boolean {
  const rel = path.relative(root, target)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}
```

- [ ] **Step 4: Implement memory barrel**

`packages/core/src/memory/index.ts`:
```ts
export * from './cascade'
```

- [ ] **Step 5: Run — PASS**

```bash
pnpm vitest run packages/core/test/unit/cascade.test.ts
```

Expected: 7 passed.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/memory packages/core/test/unit/cascade.test.ts
git commit -m "feat(memory): AGENTS.md cascade resolver (first-match-wins, no ancestor stack)"
```

---

## Task 3: @filepath import expander (depth 3, visited set)

**Files:**
- Create: `packages/core/src/memory/imports.ts`
- Test: `packages/core/test/unit/imports.test.ts`
- Modify: `packages/core/src/memory/index.ts`

- [ ] **Step 1: Write failing import test**

`packages/core/test/unit/imports.test.ts`:
```ts
import { afterEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { expandImports } from '../../src/memory/imports'

let tmp: string
afterEach(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }) })

describe('expandImports', () => {
  test('inlines @relative.md content with banner', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-imp-'))
    writeFileSync(path.join(tmp, 'main.md'), '# main\n@./inc.md\nafter\n')
    writeFileSync(path.join(tmp, 'inc.md'), 'INCLUDED\n')
    const r = expandImports(path.join(tmp, 'main.md'))
    expect(r.text).toContain('INCLUDED')
    expect(r.text).toContain('after')
  })

  test('respects depth=3 limit', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-imp-'))
    writeFileSync(path.join(tmp, 'l0.md'), '@./l1.md')
    writeFileSync(path.join(tmp, 'l1.md'), 'L1\n@./l2.md')
    writeFileSync(path.join(tmp, 'l2.md'), 'L2\n@./l3.md')
    writeFileSync(path.join(tmp, 'l3.md'), 'L3\n@./l4.md')
    writeFileSync(path.join(tmp, 'l4.md'), 'L4-NEVER')
    const r = expandImports(path.join(tmp, 'l0.md'), { maxDepth: 3 })
    expect(r.text).toContain('L1')
    expect(r.text).toContain('L2')
    expect(r.text).toContain('L3')
    expect(r.text).not.toContain('L4-NEVER')
  })

  test('cycle detection via visited set', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-imp-'))
    writeFileSync(path.join(tmp, 'a.md'), 'A\n@./b.md')
    writeFileSync(path.join(tmp, 'b.md'), 'B\n@./a.md')
    const r = expandImports(path.join(tmp, 'a.md'))
    expect(r.text).toContain('A')
    expect(r.text).toContain('B')
    // shouldn't hang; should also surface a "cycle skipped" note
    expect(r.cyclesSkipped).toBeGreaterThan(0)
  })

  test('missing file becomes a [missing] marker, not a throw', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-imp-'))
    writeFileSync(path.join(tmp, 'a.md'), 'A\n@./does-not-exist.md\nZ')
    const r = expandImports(path.join(tmp, 'a.md'))
    expect(r.text).toContain('A')
    expect(r.text).toContain('Z')
    expect(r.text).toMatch(/\[missing import:.*does-not-exist\.md\]/)
    expect(r.missing.length).toBe(1)
  })

  test('absolute path imports also work', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-imp-'))
    writeFileSync(path.join(tmp, 'inc.md'), 'ABS-OK')
    writeFileSync(path.join(tmp, 'main.md'), `@${path.join(tmp, 'inc.md')}\nend`)
    const r = expandImports(path.join(tmp, 'main.md'))
    expect(r.text).toContain('ABS-OK')
  })

  test('@ at start-of-line only — inline @ in prose is preserved', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-imp-'))
    writeFileSync(path.join(tmp, 'a.md'), 'See @user mention here\n@./inc.md')
    writeFileSync(path.join(tmp, 'inc.md'), 'INC')
    const r = expandImports(path.join(tmp, 'a.md'))
    expect(r.text).toContain('See @user mention here')
    expect(r.text).toContain('INC')
  })
})
```

- [ ] **Step 2: Implement imports**

`packages/core/src/memory/imports.ts`:
```ts
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

export interface ExpandOpts {
  maxDepth?: number                 // default 3 (qwen pattern)
}

export interface ExpandResult {
  text: string
  resolved: string[]                // absolute paths that were inlined
  missing: string[]                 // import targets that didn't exist
  cyclesSkipped: number             // count of @import attempts pruned by visited set
}

// Match @path at start-of-line (or after whitespace at start). Path runs until whitespace or EOL.
// Examples that match:   `@./foo.md`   `@/abs/foo.md`   `@../sibling.md`
// Examples that don't:   `Hi @user`    `email@host.com`
const IMPORT_RE = /^[ \t]*@(?<ref>[^\s]+)\s*$/gm

export function expandImports(rootFile: string, opts: ExpandOpts = {}): ExpandResult {
  const maxDepth = opts.maxDepth ?? 3
  const result: ExpandResult = { text: '', resolved: [], missing: [], cyclesSkipped: 0 }
  const visited = new Set<string>()
  result.text = expandOne(rootFile, 0, maxDepth, visited, result)
  return result
}

function expandOne(file: string, depth: number, maxDepth: number, visited: Set<string>, agg: ExpandResult): string {
  const abs = path.resolve(file)
  if (visited.has(abs)) {
    agg.cyclesSkipped++
    return `[cycle skipped: ${abs}]`
  }
  visited.add(abs)
  if (!existsSync(abs) || !statSync(abs).isFile()) {
    agg.missing.push(abs)
    return `[missing import: ${abs}]`
  }
  agg.resolved.push(abs)
  const raw = readFileSync(abs, 'utf8')
  if (depth >= maxDepth) return raw   // depth gate: include verbatim, do not recurse

  return raw.replace(IMPORT_RE, (_match, _captured, _offset, _whole, groups: { ref: string } | undefined) => {
    const ref = groups?.ref
    if (!ref) return _match
    const target = path.isAbsolute(ref) ? ref : path.resolve(path.dirname(abs), ref)
    const inner = expandOne(target, depth + 1, maxDepth, visited, agg)
    return `<!-- begin import: ${path.relative(path.dirname(abs), target)} -->\n${inner}\n<!-- end import -->`
  })
}
```

- [ ] **Step 3: Re-export**

Modify `packages/core/src/memory/index.ts`:
```ts
export * from './cascade'
export * from './imports'
```

- [ ] **Step 4: Run — PASS**

```bash
pnpm vitest run packages/core/test/unit/imports.test.ts
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/memory/imports.ts packages/core/src/memory/index.ts packages/core/test/unit/imports.test.ts
git commit -m "feat(memory): @filepath import expander (depth 3 + visited-set cycle protection)"
```

---

## Task 4: Recursive file-relative AGENTS.md discovery

**Files:**
- Create: `packages/core/src/memory/file-relative.ts`
- Test: `packages/core/test/unit/file-relative.test.ts`
- Modify: `packages/core/src/memory/index.ts`

- [ ] **Step 1: Write failing test**

`packages/core/test/unit/file-relative.test.ts`:
```ts
import { afterEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { FileRelativeDiscovery } from '../../src/memory/file-relative'

let tmp: string
afterEach(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }) })

describe('FileRelativeDiscovery', () => {
  test('returns nearest AGENTS.md when reading a deep file', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-fr-'))
    mkdirSync(path.join(tmp, 'a/b/c'), { recursive: true })
    writeFileSync(path.join(tmp, 'a/AGENTS.md'), 'A-mid\n')
    writeFileSync(path.join(tmp, 'a/b/c/file.ts'), 'code\n')
    const d = new FileRelativeDiscovery({ worktree: tmp })
    const hits = d.discoverFor(path.join(tmp, 'a/b/c/file.ts'))
    expect(hits.length).toBe(1)
    expect(hits[0]!.endsWith('a/AGENTS.md')).toBe(true)
  })

  test('returns multiple if AGENTS.md at multiple ancestor dirs (closest first)', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-fr-'))
    mkdirSync(path.join(tmp, 'a/b/c'), { recursive: true })
    writeFileSync(path.join(tmp, 'AGENTS.md'), 'ROOT\n')
    writeFileSync(path.join(tmp, 'a/b/AGENTS.md'), 'MID\n')
    writeFileSync(path.join(tmp, 'a/b/c/file.ts'), 'code\n')
    const d = new FileRelativeDiscovery({ worktree: tmp })
    const hits = d.discoverFor(path.join(tmp, 'a/b/c/file.ts'))
    // closest-first; we expose all hits and let cascade resolver decide which to attach
    expect(hits[0]!.endsWith('a/b/AGENTS.md')).toBe(true)
    expect(hits[1]!.endsWith('AGENTS.md')).toBe(true)
  })

  test('marks already-attached AGENTS.md so they are skipped', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-fr-'))
    mkdirSync(path.join(tmp, 'a'), { recursive: true })
    writeFileSync(path.join(tmp, 'a/AGENTS.md'), 'A\n')
    writeFileSync(path.join(tmp, 'a/file.ts'), 'code\n')
    const d = new FileRelativeDiscovery({ worktree: tmp })
    const first = d.discoverFor(path.join(tmp, 'a/file.ts'))
    expect(first.length).toBe(1)
    d.markAttached(first[0]!)
    const second = d.discoverFor(path.join(tmp, 'a/file.ts'))
    expect(second.length).toBe(0)
  })

  test('one-shot per turn — resetTurn() re-enables', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-fr-'))
    mkdirSync(path.join(tmp, 'a'), { recursive: true })
    writeFileSync(path.join(tmp, 'a/AGENTS.md'), 'A\n')
    writeFileSync(path.join(tmp, 'a/file.ts'), 'code\n')
    const d = new FileRelativeDiscovery({ worktree: tmp })
    d.markAttached(d.discoverFor(path.join(tmp, 'a/file.ts'))[0]!)
    d.resetTurn()
    expect(d.discoverFor(path.join(tmp, 'a/file.ts')).length).toBe(1)
  })

  test('file outside worktree → no hits', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-fr-'))
    const wt = path.join(tmp, 'wt'); mkdirSync(wt, { recursive: true })
    writeFileSync(path.join(tmp, 'AGENTS.md'), 'outside\n')
    writeFileSync(path.join(tmp, 'outside.ts'), 'code\n')
    const d = new FileRelativeDiscovery({ worktree: wt })
    expect(d.discoverFor(path.join(tmp, 'outside.ts'))).toEqual([])
  })
})
```

- [ ] **Step 2: Implement file-relative discovery**

`packages/core/src/memory/file-relative.ts`:
```ts
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'

const CANDIDATES = ['AGENTS.md', 'CLAUDE.md'] as const

export interface FileRelativeOpts {
  worktree: string
}

/**
 * Per-turn helper. Tracks AGENTS.md files that have already been attached in this
 * turn so we never attach the same one twice (cap on "drift attachments").
 *
 * Lifecycle: created once per session-worker, `resetTurn()` called before each turn.
 */
export class FileRelativeDiscovery {
  private attached = new Set<string>()
  private worktree: string

  constructor(opts: FileRelativeOpts) {
    this.worktree = path.resolve(opts.worktree)
  }

  /**
   * Given a file we are about to read, find every AGENTS.md (or CLAUDE.md) sitting
   * at or above that file's directory, up to the worktree boundary. Returns them
   * closest-first, EXCLUDING ones already attached this turn (or attached as part
   * of the global+project cascade already).
   *
   * If `filepath` is outside the worktree, returns [].
   */
  discoverFor(filepath: string): string[] {
    const abs = path.resolve(filepath)
    if (!this.insideWorktree(abs)) return []
    const hits: string[] = []
    let dir = path.dirname(abs)
    while (true) {
      for (const name of CANDIDATES) {
        const p = path.join(dir, name)
        if (existsSync(p) && statSync(p).isFile() && !this.attached.has(p)) {
          hits.push(p)
        }
      }
      if (dir === this.worktree) break
      const parent = path.dirname(dir)
      if (parent === dir) break
      if (!this.insideWorktree(parent)) break
      dir = parent
    }
    return hits
  }

  /** Mark file as attached so future discoverFor() calls in this turn ignore it. */
  markAttached(filepath: string): void {
    this.attached.add(path.resolve(filepath))
  }

  /** Call at the start of each LLM turn. */
  resetTurn(): void {
    this.attached.clear()
  }

  /** Pre-seed with files attached via the global+project cascade. */
  seedAttached(paths: string[]): void {
    for (const p of paths) this.attached.add(path.resolve(p))
  }

  private insideWorktree(p: string): boolean {
    const rel = path.relative(this.worktree, p)
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
  }
}
```

- [ ] **Step 3: Update barrel**

Modify `packages/core/src/memory/index.ts`:
```ts
export * from './cascade'
export * from './imports'
export * from './file-relative'
```

- [ ] **Step 4: Run — PASS**

```bash
pnpm vitest run packages/core/test/unit/file-relative.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/memory/file-relative.ts packages/core/src/memory/index.ts packages/core/test/unit/file-relative.test.ts
git commit -m "feat(memory): file-relative AGENTS.md discovery (one-shot per turn)"
```

---

## Task 5: `## Memories` section parser + writer

**Files:**
- Create: `packages/core/src/memory/memories-section.ts`
- Test: `packages/core/test/unit/memories-section.test.ts`

- [ ] **Step 1: Write failing test**

`packages/core/test/unit/memories-section.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { parseMemoriesSection, writeMemoriesSection, upsertEntry, removeEntry } from '../../src/memory/memories-section'

const SAMPLE = `# AGENTS.md

Some rules.

## Memories
<!-- Auto-managed by glm. Bodies in .glm/memory/. -->

- [user-role](.glm/memory/user_role.md) — Data scientist exploring logging infra
- [feedback-tdd](.glm/memory/feedback_tdd.md) — Tests hit real DB

## Other Section
unrelated
`

describe('memories-section', () => {
  test('parseMemoriesSection extracts entries', () => {
    const r = parseMemoriesSection(SAMPLE)
    expect(r.entries.length).toBe(2)
    expect(r.entries[0]!.name).toBe('user-role')
    expect(r.entries[0]!.bodyPath).toBe('.glm/memory/user_role.md')
    expect(r.entries[0]!.hook).toBe('Data scientist exploring logging infra')
    expect(r.entries[1]!.name).toBe('feedback-tdd')
  })

  test('parseMemoriesSection captures pre/post-text', () => {
    const r = parseMemoriesSection(SAMPLE)
    expect(r.preText).toMatch(/^# AGENTS\.md/)
    expect(r.preText).toContain('Some rules')
    expect(r.postText).toContain('Other Section')
  })

  test('writeMemoriesSection round-trips', () => {
    const r = parseMemoriesSection(SAMPLE)
    const out = writeMemoriesSection(r)
    expect(out).toContain('## Memories')
    expect(out).toContain('[user-role]')
    expect(out).toContain('[feedback-tdd]')
    expect(out).toContain('Other Section')
  })

  test('upsertEntry adds new and updates existing', () => {
    const r = parseMemoriesSection(SAMPLE)
    upsertEntry(r, { name: 'new-one', bodyPath: '.glm/memory/new_one.md', hook: 'first hook' })
    expect(r.entries.find(e => e.name === 'new-one')?.hook).toBe('first hook')
    upsertEntry(r, { name: 'user-role', bodyPath: '.glm/memory/user_role.md', hook: 'updated' })
    expect(r.entries.find(e => e.name === 'user-role')?.hook).toBe('updated')
  })

  test('removeEntry drops by name', () => {
    const r = parseMemoriesSection(SAMPLE)
    removeEntry(r, 'user-role')
    expect(r.entries.find(e => e.name === 'user-role')).toBeUndefined()
    expect(r.entries.find(e => e.name === 'feedback-tdd')).toBeDefined()
  })

  test('emits standard banner when no Memories section exists', () => {
    const src = '# AGENTS.md\nno memories yet\n'
    const r = parseMemoriesSection(src)
    expect(r.entries.length).toBe(0)
    upsertEntry(r, { name: 'first', bodyPath: '.glm/memory/first.md', hook: 'hello' })
    const out = writeMemoriesSection(r)
    expect(out).toContain('## Memories')
    expect(out).toContain('<!-- Auto-managed by glm. Bodies in .glm/memory/. -->')
    expect(out).toContain('[first](.glm/memory/first.md) — hello')
  })

  test('measures byte size + line count for cap enforcement', () => {
    const r = parseMemoriesSection(SAMPLE)
    expect(r.byteSize).toBeGreaterThan(0)
    expect(r.lineCount).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Implement**

`packages/core/src/memory/memories-section.ts`:
```ts
import type { MemoryIndexEntry } from '@glm/shared'

const HEADER = '## Memories'
const BANNER = '<!-- Auto-managed by glm. Bodies in .glm/memory/. -->'
// Match a single index entry line: `- [name](path) — hook`
const ENTRY_RE = /^- \[(?<name>[^\]]+)\]\((?<path>[^)]+)\)(?:\s+[—-]\s+(?<hook>.+))?$/

export interface ParsedMemoriesDoc {
  preText: string                   // everything before `## Memories`
  entries: MemoryIndexEntry[]
  postText: string                  // everything after the `## Memories` block (i.e. next ## heading onward)
  byteSize: number                  // size of the Memories block alone (when re-emitted)
  lineCount: number                 // lines in the Memories block (entries only, including banner)
}

export function parseMemoriesSection(doc: string): ParsedMemoriesDoc {
  const lines = doc.split('\n')
  let start = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.trim() === HEADER) { start = i; break }
  }

  if (start === -1) {
    const out: ParsedMemoriesDoc = {
      preText: doc.endsWith('\n') ? doc : doc + '\n',
      entries: [],
      postText: '',
      byteSize: 0,
      lineCount: 0
    }
    return out
  }

  // Section continues until the next `## ` heading or EOF
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i]!.startsWith('## ')) { end = i; break }
  }

  const preText = lines.slice(0, start).join('\n') + (start > 0 ? '\n' : '')
  const sectionLines = lines.slice(start + 1, end)
  const postText = lines.slice(end).join('\n')

  const entries: MemoryIndexEntry[] = []
  for (const raw of sectionLines) {
    const m = raw.match(ENTRY_RE)
    if (m?.groups) {
      entries.push({
        name: m.groups.name!,
        bodyPath: m.groups.path!,
        hook: (m.groups.hook ?? '').trim()
      })
    }
  }

  const block = renderBlock(entries)
  return { preText, entries, postText, byteSize: Buffer.byteLength(block, 'utf8'), lineCount: block.split('\n').length }
}

export function writeMemoriesSection(doc: ParsedMemoriesDoc): string {
  const block = renderBlock(doc.entries)
  const tail = doc.postText.length > 0 ? (doc.postText.startsWith('\n') ? doc.postText : '\n' + doc.postText) : ''
  const head = doc.preText.endsWith('\n') ? doc.preText : doc.preText + '\n'
  return `${head}${block}${tail}`
}

function renderBlock(entries: MemoryIndexEntry[]): string {
  const lines: string[] = [HEADER, BANNER, '']
  for (const e of entries) {
    const hook = e.hook ? ` — ${e.hook}` : ''
    lines.push(`- [${e.name}](${e.bodyPath})${hook}`)
  }
  if (entries.length === 0) lines.push('(no memories yet)')
  lines.push('')
  return lines.join('\n')
}

export function upsertEntry(doc: ParsedMemoriesDoc, entry: MemoryIndexEntry): void {
  const i = doc.entries.findIndex(e => e.name === entry.name)
  if (i >= 0) doc.entries[i] = entry
  else doc.entries.push(entry)
  refreshMetrics(doc)
}

export function removeEntry(doc: ParsedMemoriesDoc, name: string): boolean {
  const i = doc.entries.findIndex(e => e.name === name)
  if (i < 0) return false
  doc.entries.splice(i, 1)
  refreshMetrics(doc)
  return true
}

function refreshMetrics(doc: ParsedMemoriesDoc): void {
  const block = renderBlock(doc.entries)
  doc.byteSize = Buffer.byteLength(block, 'utf8')
  doc.lineCount = block.split('\n').length
}
```

- [ ] **Step 3: Re-export**

Modify `packages/core/src/memory/index.ts`:
```ts
export * from './cascade'
export * from './imports'
export * from './file-relative'
export * from './memories-section'
```

- [ ] **Step 4: Run — PASS**

```bash
pnpm vitest run packages/core/test/unit/memories-section.test.ts
```

Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/memory/memories-section.ts packages/core/src/memory/index.ts packages/core/test/unit/memories-section.test.ts
git commit -m "feat(memory): parse/write ## Memories index section with upsert/remove"
```

---

## Task 6: Memory body file store (.glm/memory/<slug>.md)

**Files:**
- Create: `packages/core/src/memory/memory-store.ts`
- Test: `packages/core/test/unit/memory-store.test.ts`

- [ ] **Step 1: Write failing test**

`packages/core/test/unit/memory-store.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { MemoryStore } from '../../src/memory/memory-store'

let tmp: string
let store: MemoryStore
beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-mstore-'))
  store = new MemoryStore({ projectRoot: tmp, globalDir: path.join(tmp, 'global') })
})
afterEach(() => { rmSync(tmp, { recursive: true, force: true }) })

describe('MemoryStore', () => {
  test('write produces body file with frontmatter', () => {
    const r = store.write({
      slug: 'feedback-tdd',
      scope: 'project',
      type: 'feedback',
      description: 'Tests hit real DB',
      body: 'Tests must hit real DB, not mocks.'
    })
    expect(existsSync(r.path)).toBe(true)
    const raw = readFileSync(r.path, 'utf8')
    expect(raw).toMatch(/^---\n/)
    expect(raw).toContain('name: feedback-tdd')
    expect(raw).toContain('type: feedback')
    expect(raw).toContain('Tests must hit real DB')
  })

  test('read parses frontmatter + body', () => {
    store.write({ slug: 'rule-a', scope: 'project', type: 'project', description: 'x', body: 'BODY' })
    const r = store.read('rule-a', 'project')
    expect(r).toBeDefined()
    expect(r!.frontmatter.name).toBe('rule-a')
    expect(r!.frontmatter.metadata.type).toBe('project')
    expect(r!.body.trim()).toBe('BODY')
  })

  test('list returns all in scope, sorted by name', () => {
    store.write({ slug: 'b-rule', scope: 'project', type: 'project', description: 'x', body: 'b' })
    store.write({ slug: 'a-rule', scope: 'project', type: 'project', description: 'x', body: 'a' })
    const rs = store.list('project')
    expect(rs.map(r => r.slug)).toEqual(['a-rule', 'b-rule'])
  })

  test('archive sets archived=true without delete', () => {
    store.write({ slug: 'x', scope: 'project', type: 'project', description: 'x', body: 'b' })
    store.archive('x', 'project')
    const r = store.read('x', 'project')
    expect(r!.frontmatter.metadata.archived).toBe(true)
  })

  test('pin sets pin=true', () => {
    store.write({ slug: 'x', scope: 'project', type: 'project', description: 'x', body: 'b' })
    store.pin('x', 'project', true)
    expect(store.read('x', 'project')!.frontmatter.metadata.pin).toBe(true)
    store.pin('x', 'project', false)
    expect(store.read('x', 'project')!.frontmatter.metadata.pin).toBe(false)
  })

  test('delete removes file', () => {
    const r = store.write({ slug: 'x', scope: 'project', type: 'project', description: 'x', body: 'b' })
    store.delete('x', 'project')
    expect(existsSync(r.path)).toBe(false)
  })

  test('touch updates last_accessed', async () => {
    store.write({ slug: 'x', scope: 'project', type: 'project', description: 'x', body: 'b' })
    const t0 = store.read('x', 'project')!.frontmatter.metadata.last_accessed
    await new Promise(r => setTimeout(r, 1100))
    store.touch('x', 'project')
    const t1 = store.read('x', 'project')!.frontmatter.metadata.last_accessed
    expect(t1 > t0).toBe(true)
  })

  test('write enforces 4KB body cap (truncates with warning)', () => {
    const huge = 'x'.repeat(5000)
    const r = store.write({ slug: 'big', scope: 'project', type: 'project', description: 'x', body: huge })
    expect(r.bytes).toBeLessThanOrEqual(4096 + 1024)   // body ≤ 4KB; total file includes frontmatter
    expect(r.body.length).toBeLessThanOrEqual(4096)
    expect(r.body).toMatch(/\[truncated\]/)
  })

  test('search finds by body substring (case-insensitive)', () => {
    store.write({ slug: 'a', scope: 'project', type: 'project', description: 'x', body: 'OAuth login flow' })
    store.write({ slug: 'b', scope: 'project', type: 'project', description: 'x', body: 'DB connection' })
    const hits = store.search('oauth', 'project')
    expect(hits.length).toBe(1)
    expect(hits[0]!.slug).toBe('a')
  })

  test('global scope uses globalDir', () => {
    store.write({ slug: 'g', scope: 'global', type: 'user', description: 'x', body: 'global rule' })
    const r = store.read('g', 'global')
    expect(r).toBeDefined()
    expect(r!.path).toContain(path.join(tmp, 'global'))
  })
})
```

- [ ] **Step 2: Implement memory body store**

`packages/core/src/memory/memory-store.ts`:
```ts
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync, statSync } from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import type { MemoryRecord, MemoryScope, MemoryType, MemoryFrontmatter } from '@glm/shared'

const BODY_CAP_BYTES = 4096
const SCOPE_SUFFIX = '.md'

export interface MemoryStoreOpts {
  projectRoot: string               // ".glm/memory/" lives under projectRoot
  globalDir: string                 // "~/.glm/memory/" for scope='global'
}

export interface WriteInput {
  slug: string
  scope: MemoryScope
  type: MemoryType
  description: string
  body: string
  pin?: boolean
}

export class MemoryStore {
  constructor(private opts: MemoryStoreOpts) {}

  private dirFor(scope: MemoryScope): string {
    return scope === 'global' ? this.opts.globalDir : path.join(this.opts.projectRoot, '.glm', 'memory')
  }

  private pathFor(slug: string, scope: MemoryScope): string {
    return path.join(this.dirFor(scope), slug + SCOPE_SUFFIX)
  }

  write(input: WriteInput): MemoryRecord {
    const dir = this.dirFor(input.scope)
    mkdirSync(dir, { recursive: true })
    const now = new Date().toISOString()
    const existing = this.read(input.slug, input.scope)
    const created = existing?.frontmatter.metadata.created ?? now
    const archived = existing?.frontmatter.metadata.archived ?? false
    let body = input.body
    if (Buffer.byteLength(body, 'utf8') > BODY_CAP_BYTES) {
      body = body.slice(0, BODY_CAP_BYTES - 32) + '\n\n[truncated by 4KB cap]'
    }
    const fm: MemoryFrontmatter = {
      name: input.slug,
      description: input.description,
      metadata: {
        type: input.type,
        created,
        last_accessed: now,
        pin: input.pin ?? existing?.frontmatter.metadata.pin ?? false,
        archived
      }
    }
    const out = matter.stringify(body.endsWith('\n') ? body : body + '\n', fm as unknown as Record<string, unknown>)
    const p = this.pathFor(input.slug, input.scope)
    writeFileSync(p, out, 'utf8')
    return {
      slug: input.slug,
      scope: input.scope,
      path: p,
      frontmatter: fm,
      body,
      bytes: statSync(p).size
    }
  }

  read(slug: string, scope: MemoryScope): MemoryRecord | undefined {
    const p = this.pathFor(slug, scope)
    if (!existsSync(p)) return undefined
    const raw = readFileSync(p, 'utf8')
    const parsed = matter(raw)
    const data = parsed.data as Partial<MemoryFrontmatter> | undefined
    if (!data?.name) return undefined
    return {
      slug,
      scope,
      path: p,
      frontmatter: {
        name: data.name,
        description: data.description ?? '',
        metadata: {
          type: (data.metadata?.type as MemoryType) ?? 'reference',
          created: data.metadata?.created ?? '',
          last_accessed: data.metadata?.last_accessed ?? '',
          pin: data.metadata?.pin ?? false,
          archived: data.metadata?.archived ?? false
        }
      },
      body: parsed.content,
      bytes: statSync(p).size
    }
  }

  list(scope: MemoryScope): MemoryRecord[] {
    const dir = this.dirFor(scope)
    if (!existsSync(dir)) return []
    const out: MemoryRecord[] = []
    for (const f of readdirSync(dir).sort()) {
      if (!f.endsWith(SCOPE_SUFFIX)) continue
      const slug = f.slice(0, -SCOPE_SUFFIX.length)
      const r = this.read(slug, scope)
      if (r) out.push(r)
    }
    return out
  }

  archive(slug: string, scope: MemoryScope): boolean {
    const r = this.read(slug, scope)
    if (!r) return false
    this.write({
      slug, scope,
      type: r.frontmatter.metadata.type,
      description: r.frontmatter.description,
      body: r.body
    })
    // re-read then flip flag
    const reread = this.read(slug, scope)!
    reread.frontmatter.metadata.archived = true
    const out = matter.stringify(reread.body, reread.frontmatter as unknown as Record<string, unknown>)
    writeFileSync(reread.path, out, 'utf8')
    return true
  }

  pin(slug: string, scope: MemoryScope, value: boolean): boolean {
    const r = this.read(slug, scope)
    if (!r) return false
    r.frontmatter.metadata.pin = value
    const out = matter.stringify(r.body, r.frontmatter as unknown as Record<string, unknown>)
    writeFileSync(r.path, out, 'utf8')
    return true
  }

  delete(slug: string, scope: MemoryScope): boolean {
    const p = this.pathFor(slug, scope)
    if (!existsSync(p)) return false
    unlinkSync(p)
    return true
  }

  touch(slug: string, scope: MemoryScope): boolean {
    const r = this.read(slug, scope)
    if (!r) return false
    r.frontmatter.metadata.last_accessed = new Date().toISOString()
    const out = matter.stringify(r.body, r.frontmatter as unknown as Record<string, unknown>)
    writeFileSync(r.path, out, 'utf8')
    return true
  }

  search(query: string, scope: MemoryScope): MemoryRecord[] {
    const q = query.toLowerCase()
    return this.list(scope).filter(r =>
      r.body.toLowerCase().includes(q) ||
      r.frontmatter.description.toLowerCase().includes(q) ||
      r.slug.toLowerCase().includes(q)
    )
  }
}
```

- [ ] **Step 3: Update barrel**

Modify `packages/core/src/memory/index.ts`:
```ts
export * from './cascade'
export * from './imports'
export * from './file-relative'
export * from './memories-section'
export * from './memory-store'
```

- [ ] **Step 4: Run — PASS**

```bash
pnpm vitest run packages/core/test/unit/memory-store.test.ts
```

Expected: 10 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/memory/memory-store.ts packages/core/test/unit/memory-store.test.ts packages/core/src/memory/index.ts
git commit -m "feat(memory): body file store with frontmatter, archive/pin/touch/search, 4KB cap"
```

---

## Task 7: Score-based eviction + cap enforcement

**Files:**
- Create: `packages/core/src/memory/memory-eviction.ts`
- Test: `packages/core/test/unit/memory-eviction.test.ts`

- [ ] **Step 1: Write failing test**

`packages/core/test/unit/memory-eviction.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { scoreRecord, sortForEviction, CAPS, enforceIndexCap, enforceFileCountCap } from '../../src/memory/memory-eviction'
import type { MemoryRecord } from '@glm/shared'

function rec(opts: Partial<MemoryRecord['frontmatter']['metadata']> & { slug: string; body?: string }): MemoryRecord {
  return {
    slug: opts.slug,
    scope: 'project',
    path: `/tmp/${opts.slug}.md`,
    frontmatter: {
      name: opts.slug,
      description: '',
      metadata: {
        type: opts.type ?? 'project',
        created: opts.created ?? new Date().toISOString(),
        last_accessed: opts.last_accessed ?? new Date().toISOString(),
        pin: opts.pin ?? false,
        archived: opts.archived ?? false
      }
    },
    body: opts.body ?? 'x',
    bytes: 100
  }
}

describe('eviction scoring', () => {
  test('pinned record has effectively-infinite score (never evicted)', () => {
    const pinned = rec({ slug: 'p', pin: true, created: '2020-01-01T00:00:00Z', last_accessed: '2020-01-01T00:00:00Z' })
    expect(scoreRecord(pinned)).toBeGreaterThan(1000)
  })

  test('older record scores lower than newer', () => {
    const old = rec({ slug: 'old', created: '2024-01-01T00:00:00Z', last_accessed: '2024-01-01T00:00:00Z' })
    const fresh = rec({ slug: 'fresh' })   // now
    expect(scoreRecord(fresh)).toBeGreaterThan(scoreRecord(old))
  })

  test('user type weighted higher than reference', () => {
    const user = rec({ slug: 'u', type: 'user' })
    const ref = rec({ slug: 'r', type: 'reference' })
    expect(scoreRecord(user)).toBeGreaterThan(scoreRecord(ref))
  })

  test('sortForEviction puts lowest-score first', () => {
    const a = rec({ slug: 'a', type: 'user' })
    const b = rec({ slug: 'b', type: 'reference', created: '2020-01-01T00:00:00Z' })
    const sorted = sortForEviction([a, b])
    expect(sorted[0]!.slug).toBe('b')
  })

  test('CAPS reflects spec values', () => {
    expect(CAPS.memoriesSection.maxLines).toBe(200)
    expect(CAPS.memoriesSection.maxBytes).toBe(25 * 1024)
    expect(CAPS.memoryDir.maxFiles).toBe(200)
    expect(CAPS.memoryDir.maxBytes).toBe(5 * 1024 * 1024)
    expect(CAPS.body.maxBytes).toBe(4 * 1024)
  })

  test('enforceIndexCap evicts when lineCount > maxLines', () => {
    const entries = Array.from({ length: 250 }, (_, i) => ({
      name: `m${i}`, bodyPath: `.glm/memory/m${i}.md`, hook: '...'
    }))
    const records = entries.map(e => rec({ slug: e.name, type: 'reference' }))
    const r = enforceIndexCap({ entries, records, lineCount: 250, byteSize: 20_000 })
    expect(r.evicted.length).toBeGreaterThan(0)
    expect(r.kept.length + r.evicted.length).toBe(250)
  })

  test('enforceFileCountCap evicts archived first', () => {
    const records = [
      rec({ slug: 'a', archived: true, type: 'reference' }),
      rec({ slug: 'b', archived: false, type: 'user' })
    ]
    const r = enforceFileCountCap(records, /* maxFiles */ 1)
    expect(r.evicted.length).toBe(1)
    expect(r.evicted[0]!.slug).toBe('a')
  })
})
```

- [ ] **Step 2: Implement eviction**

`packages/core/src/memory/memory-eviction.ts`:
```ts
import type { MemoryRecord, MemoryIndexEntry, MemoryType } from '@glm/shared'

export const CAPS = {
  memoriesSection: { maxLines: 200, maxBytes: 25 * 1024 },
  memoryDir:       { maxFiles: 200, maxBytes: 5 * 1024 * 1024 },
  globalMemoryDir: { maxFiles: 50, maxBytes: 5 * 1024 * 1024 },
  body:            { maxBytes: 4 * 1024 }
} as const

const TYPE_WEIGHT: Record<MemoryType, number> = {
  user: 1.0,
  feedback: 0.9,
  project: 0.5,
  reference: 0.7
}

const PIN_BONUS = 10_000

export function scoreRecord(r: MemoryRecord, now: Date = new Date()): number {
  const md = r.frontmatter.metadata
  if (md.pin) return PIN_BONUS

  const createdAt = parseDate(md.created, now)
  const accessedAt = parseDate(md.last_accessed, now)
  const daysSinceCreated  = (now.getTime() - createdAt.getTime())  / (1000 * 60 * 60 * 24)
  const daysSinceAccessed = (now.getTime() - accessedAt.getTime()) / (1000 * 60 * 60 * 24)

  const ageDecay      = 1 - Math.min(daysSinceCreated / 180, 1)
  const typeWeight    = TYPE_WEIGHT[md.type] ?? 0.5
  const accessRecency = 1 - Math.min(daysSinceAccessed / 30, 1)

  return 0.5 * ageDecay + 0.3 * typeWeight + 0.2 * accessRecency
}

function parseDate(s: string, fallback: Date): Date {
  if (!s) return fallback
  const t = Date.parse(s)
  return Number.isFinite(t) ? new Date(t) : fallback
}

export function sortForEviction(records: MemoryRecord[]): MemoryRecord[] {
  return [...records].sort((a, b) => scoreRecord(a) - scoreRecord(b))
}

export interface IndexCapInput {
  entries: MemoryIndexEntry[]
  records: MemoryRecord[]           // parallel to entries; used for scoring
  lineCount: number                 // current rendered lineCount of ## Memories block
  byteSize: number                  // current rendered byteSize of ## Memories block
}

export interface IndexCapResult {
  kept: MemoryIndexEntry[]
  evicted: MemoryIndexEntry[]
}

export function enforceIndexCap(input: IndexCapInput): IndexCapResult {
  const { entries, records } = input
  const overByLines = input.lineCount > CAPS.memoriesSection.maxLines
  const overByBytes = input.byteSize > CAPS.memoriesSection.maxBytes
  if (!overByLines && !overByBytes) return { kept: entries, evicted: [] }

  // Pair each entry with its record (by name) — records missing a corresponding entry are ignored
  const byName = new Map(records.map(r => [r.slug, r]))
  const pairs = entries.map(e => ({ entry: e, record: byName.get(e.name) }))
  // Sort by score ASCENDING — lowest first to evict
  pairs.sort((a, b) => {
    const sa = a.record ? scoreRecord(a.record) : 0
    const sb = b.record ? scoreRecord(b.record) : 0
    return sa - sb
  })

  // Target: 80% of cap (avoid thrashing back and forth across the line)
  const targetLines = Math.floor(CAPS.memoriesSection.maxLines * 0.8)
  const targetBytes = Math.floor(CAPS.memoriesSection.maxBytes * 0.8)
  // Estimate: each line ~ avg byteSize/lineCount
  const avgPerEntry = input.lineCount > 0 ? input.byteSize / input.lineCount : 100
  const evicted: MemoryIndexEntry[] = []
  let lines = input.lineCount
  let bytes = input.byteSize
  for (const p of pairs) {
    if (lines <= targetLines && bytes <= targetBytes) break
    if (p.record?.frontmatter.metadata.pin) continue
    evicted.push(p.entry)
    lines -= 1
    bytes -= avgPerEntry
  }
  const evictedSet = new Set(evicted.map(e => e.name))
  return {
    kept: entries.filter(e => !evictedSet.has(e.name)),
    evicted
  }
}

export interface FileCountCapResult {
  kept: MemoryRecord[]
  evicted: MemoryRecord[]
}

export function enforceFileCountCap(records: MemoryRecord[], maxFiles: number = CAPS.memoryDir.maxFiles): FileCountCapResult {
  if (records.length <= maxFiles) return { kept: records, evicted: [] }
  // Step 1: archived first (oldest archived → deletion)
  const archived = records.filter(r => r.frontmatter.metadata.archived)
  const live = records.filter(r => !r.frontmatter.metadata.archived)
  archived.sort((a, b) => scoreRecord(a) - scoreRecord(b))
  live.sort((a, b) => scoreRecord(a) - scoreRecord(b))

  const evicted: MemoryRecord[] = []
  const queue = [...archived, ...live]
  let remaining = records.length
  for (const r of queue) {
    if (remaining <= maxFiles) break
    if (r.frontmatter.metadata.pin) continue
    evicted.push(r)
    remaining--
  }
  const evictedNames = new Set(evicted.map(r => r.slug))
  return {
    kept: records.filter(r => !evictedNames.has(r.slug)),
    evicted
  }
}
```

- [ ] **Step 3: Update barrel**

```ts
// packages/core/src/memory/index.ts
export * from './cascade'
export * from './imports'
export * from './file-relative'
export * from './memories-section'
export * from './memory-store'
export * from './memory-eviction'
```

- [ ] **Step 4: Run — PASS**

```bash
pnpm vitest run packages/core/test/unit/memory-eviction.test.ts
```

Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/memory/memory-eviction.ts packages/core/src/memory/index.ts packages/core/test/unit/memory-eviction.test.ts
git commit -m "feat(memory): eviction score (age_decay+type_weight+access_recency-pin) + cap enforcers"
```

---

## Task 8: Auto-memory writer (dedupe by similarity, orchestrator-qualified)

**Files:**
- Create: `packages/core/src/memory/auto-writer.ts`
- Test: `packages/core/test/unit/auto-writer.test.ts`

- [ ] **Step 1: Write failing test**

`packages/core/test/unit/auto-writer.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { MemoryStore } from '../../src/memory/memory-store'
import { AutoMemoryWriter } from '../../src/memory/auto-writer'

let tmp: string
let store: MemoryStore
let writer: AutoMemoryWriter

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-aw-'))
  store = new MemoryStore({ projectRoot: tmp, globalDir: path.join(tmp, 'global') })
  writer = new AutoMemoryWriter({ store })
})
afterEach(() => { rmSync(tmp, { recursive: true, force: true }) })

describe('AutoMemoryWriter', () => {
  test('writes a new memory when qualified=true', async () => {
    const r = await writer.maybeWrite({
      qualified: true,
      slug: 'feedback-tdd',
      type: 'feedback',
      description: 'Tests hit real DB',
      body: 'Tests must hit real DB, not mocks.'
    })
    expect(r.action).toBe('written')
    expect(store.read('feedback-tdd', 'project')).toBeDefined()
  })

  test('skips when qualified=false', async () => {
    const r = await writer.maybeWrite({
      qualified: false,
      slug: 'x', type: 'feedback', description: 'x', body: 'x'
    })
    expect(r.action).toBe('skipped')
    expect(store.read('x', 'project')).toBeUndefined()
  })

  test('dedupes when body very similar (≥ 80% by jaccard on shingles)', async () => {
    await writer.maybeWrite({
      qualified: true, slug: 'first', type: 'feedback', description: 'tests',
      body: 'Tests must always hit a real database not mocks'
    })
    const r2 = await writer.maybeWrite({
      qualified: true, slug: 'second', type: 'feedback', description: 'tests',
      body: 'Tests must always hit a real database not mocks please'
    })
    expect(r2.action).toBe('deduped')
    expect(r2.dedupedAgainst).toBe('first')
  })

  test('keeps when slug exists but content different — updates', async () => {
    await writer.maybeWrite({
      qualified: true, slug: 'same', type: 'feedback', description: 'a', body: 'original content'
    })
    const r = await writer.maybeWrite({
      qualified: true, slug: 'same', type: 'feedback', description: 'b', body: 'completely different content here'
    })
    expect(r.action).toBe('updated')
    expect(store.read('same', 'project')!.body).toContain('completely different')
  })
})
```

- [ ] **Step 2: Implement auto-writer**

`packages/core/src/memory/auto-writer.ts`:
```ts
import type { MemoryStore } from './memory-store'
import type { MemoryRecord, MemoryType } from '@glm/shared'

export interface AutoWriteInput {
  qualified: boolean                // orchestrator decision: should this become a memory?
  slug: string
  type: MemoryType
  description: string
  body: string
  scope?: 'project' | 'global'      // default 'project'
}

export interface AutoWriteResult {
  action: 'written' | 'updated' | 'skipped' | 'deduped'
  slug: string
  dedupedAgainst?: string
}

export interface AutoWriterOpts {
  store: MemoryStore
  similarityThreshold?: number      // default 0.8
}

const SHINGLE_SIZE = 3

export class AutoMemoryWriter {
  private store: MemoryStore
  private threshold: number

  constructor(opts: AutoWriterOpts) {
    this.store = opts.store
    this.threshold = opts.similarityThreshold ?? 0.8
  }

  async maybeWrite(input: AutoWriteInput): Promise<AutoWriteResult> {
    if (!input.qualified) return { action: 'skipped', slug: input.slug }

    const scope = input.scope ?? 'project'
    const existing = this.store.read(input.slug, scope)
    if (existing) {
      if (jaccard(shingles(existing.body), shingles(input.body)) >= this.threshold) {
        return { action: 'deduped', slug: input.slug, dedupedAgainst: input.slug }
      }
      this.store.write({ slug: input.slug, scope, type: input.type, description: input.description, body: input.body })
      return { action: 'updated', slug: input.slug }
    }

    // Cross-slug dedupe — scan all in scope, find similar
    const all = this.store.list(scope)
    const inSh = shingles(input.body)
    for (const r of all) {
      if (r.frontmatter.metadata.archived) continue
      if (jaccard(inSh, shingles(r.body)) >= this.threshold) {
        return { action: 'deduped', slug: input.slug, dedupedAgainst: r.slug }
      }
    }

    this.store.write({ slug: input.slug, scope, type: input.type, description: input.description, body: input.body })
    return { action: 'written', slug: input.slug }
  }
}

function shingles(text: string): Set<string> {
  const norm = text.toLowerCase().replace(/\s+/g, ' ').trim()
  const out = new Set<string>()
  for (let i = 0; i + SHINGLE_SIZE <= norm.length; i++) out.add(norm.slice(i, i + SHINGLE_SIZE))
  return out
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  const union = a.size + b.size - inter
  return union === 0 ? 0 : inter / union
}
```

- [ ] **Step 3: Update barrel**

```ts
// packages/core/src/memory/index.ts
export * from './cascade'
export * from './imports'
export * from './file-relative'
export * from './memories-section'
export * from './memory-store'
export * from './memory-eviction'
export * from './auto-writer'
```

- [ ] **Step 4: Run — PASS**

```bash
pnpm vitest run packages/core/test/unit/auto-writer.test.ts
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/memory/auto-writer.ts packages/core/src/memory/index.ts packages/core/test/unit/auto-writer.test.ts
git commit -m "feat(memory): AutoMemoryWriter with jaccard-shingle dedupe + qualification gate"
```

---

## Task 9: Memory Trio — Notepad (compaction-resistant, 3-tier write)

**Files:**
- Create: `packages/core/src/notepad/notepad-store.ts`
- Create: `packages/core/src/notepad/notepad-rpc.ts`
- Create: `packages/core/src/notepad/index.ts`
- Test: `packages/core/test/unit/notepad-store.test.ts`

- [ ] **Step 1: Write failing test**

`packages/core/test/unit/notepad-store.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { NotepadStore } from '../../src/notepad/notepad-store'

let tmp: string
let np: NotepadStore

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-np-'))
  np = new NotepadStore({ projectRoot: tmp })
})
afterEach(() => { rmSync(tmp, { recursive: true, force: true }) })

describe('NotepadStore', () => {
  test('writePriority puts entry in PRIORITY tier (top of file)', () => {
    np.writePriority('FOUND BUG IN AUTH.TS')
    const text = np.read()
    expect(text).toContain('## Priority')
    expect(text).toContain('FOUND BUG')
  })

  test('writeWorking appends to WORKING tier', () => {
    np.writeWorking('checking config')
    np.writeWorking('found yaml mismatch')
    const text = np.read()
    expect(text.indexOf('## Working')).toBeGreaterThanOrEqual(0)
    expect(text).toContain('checking config')
    expect(text).toContain('found yaml mismatch')
  })

  test('writeManual appends to MANUAL tier', () => {
    np.writeManual('user said remember this')
    const text = np.read()
    expect(text).toContain('## Manual')
    expect(text).toContain('user said remember this')
  })

  test('tier ordering: Priority → Working → Manual', () => {
    np.writeManual('M')
    np.writeWorking('W')
    np.writePriority('P')
    const text = np.read()
    const ip = text.indexOf('## Priority')
    const iw = text.indexOf('## Working')
    const im = text.indexOf('## Manual')
    expect(ip).toBeGreaterThanOrEqual(0)
    expect(iw).toBeGreaterThan(ip)
    expect(im).toBeGreaterThan(iw)
  })

  test('prune drops working-tier entries with age > maxAge', async () => {
    np.writeWorking('old entry')
    await new Promise(r => setTimeout(r, 50))
    np.writeWorking('fresh entry')
    np.prune({ workingMaxAgeMs: 25 })
    const text = np.read()
    expect(text).not.toContain('old entry')
    expect(text).toContain('fresh entry')
  })

  test('priority and manual tiers never auto-pruned', () => {
    np.writePriority('P')
    np.writeManual('M')
    np.prune({ workingMaxAgeMs: 0 })
    const text = np.read()
    expect(text).toContain('P')
    expect(text).toContain('M')
  })

  test('forCompaction emits markdown for inclusion in compacted summary', () => {
    np.writePriority('P1')
    np.writeWorking('W1')
    np.writeManual('M1')
    const md = np.forCompaction()
    expect(md).toContain('## Notepad (preserved through compaction)')
    expect(md).toContain('P1')
    expect(md).toContain('M1')
    // working tier may or may not be present depending on policy; verify priority/manual at minimum
  })

  test('file is created lazily; reading missing notepad returns empty header', () => {
    const text = np.read()
    expect(text).toMatch(/^# Notepad/)
  })

  test('persistence: new instance sees prior writes', () => {
    np.writePriority('persist-me')
    const np2 = new NotepadStore({ projectRoot: tmp })
    expect(np2.read()).toContain('persist-me')
  })
})
```

- [ ] **Step 2: Implement notepad store**

`packages/core/src/notepad/notepad-store.ts`:
```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

type Tier = 'priority' | 'working' | 'manual'

interface Entry {
  tier: Tier
  text: string
  ts: string
}

export interface NotepadOpts {
  projectRoot: string
}

export interface PruneOpts {
  workingMaxAgeMs?: number          // default: 60 * 60 * 1000 (1h)
}

const FILE_HEADER = '# Notepad'
const PRIORITY_HEAD = '## Priority'
const WORKING_HEAD = '## Working'
const MANUAL_HEAD = '## Manual'

export class NotepadStore {
  private filePath: string

  constructor(opts: NotepadOpts) {
    this.filePath = path.join(opts.projectRoot, '.glm', 'notepad.md')
  }

  writePriority(text: string): void { this.append('priority', text) }
  writeWorking(text: string): void  { this.append('working', text) }
  writeManual(text: string): void   { this.append('manual', text) }

  read(): string {
    if (!existsSync(this.filePath)) return `${FILE_HEADER}\n\n`
    return readFileSync(this.filePath, 'utf8')
  }

  /** Snapshot used by Context Assembler — only tiers that survive compaction. */
  forCompaction(): string {
    const entries = this.parse()
    const priority = entries.filter(e => e.tier === 'priority')
    const manual = entries.filter(e => e.tier === 'manual')
    const lines: string[] = ['## Notepad (preserved through compaction)']
    if (priority.length) {
      lines.push('', '### Priority')
      for (const e of priority) lines.push(`- ${e.text}`)
    }
    if (manual.length) {
      lines.push('', '### Manual')
      for (const e of manual) lines.push(`- ${e.text}`)
    }
    return lines.join('\n') + '\n'
  }

  prune(opts: PruneOpts = {}): { kept: number; dropped: number } {
    const maxAge = opts.workingMaxAgeMs ?? 60 * 60 * 1000
    const now = Date.now()
    const before = this.parse()
    const kept = before.filter(e => {
      if (e.tier !== 'working') return true
      const age = now - Date.parse(e.ts)
      return age < maxAge
    })
    this.writeAll(kept)
    return { kept: kept.length, dropped: before.length - kept.length }
  }

  private append(tier: Tier, text: string): void {
    const entries = this.parse()
    entries.push({ tier, text: text.trim(), ts: new Date().toISOString() })
    this.writeAll(entries)
  }

  private writeAll(entries: Entry[]): void {
    mkdirSync(path.dirname(this.filePath), { recursive: true })
    const priority = entries.filter(e => e.tier === 'priority')
    const working  = entries.filter(e => e.tier === 'working')
    const manual   = entries.filter(e => e.tier === 'manual')
    const lines: string[] = [FILE_HEADER, '']
    lines.push(PRIORITY_HEAD)
    for (const e of priority) lines.push(`- ${e.text}  <!-- ts=${e.ts} -->`)
    lines.push('', WORKING_HEAD)
    for (const e of working) lines.push(`- ${e.text}  <!-- ts=${e.ts} -->`)
    lines.push('', MANUAL_HEAD)
    for (const e of manual) lines.push(`- ${e.text}  <!-- ts=${e.ts} -->`)
    lines.push('')
    writeFileSync(this.filePath, lines.join('\n'), 'utf8')
  }

  private parse(): Entry[] {
    if (!existsSync(this.filePath)) return []
    const raw = readFileSync(this.filePath, 'utf8')
    const out: Entry[] = []
    let tier: Tier | undefined
    for (const line of raw.split('\n')) {
      const t = line.trim()
      if (t === PRIORITY_HEAD) { tier = 'priority'; continue }
      if (t === WORKING_HEAD)  { tier = 'working'; continue }
      if (t === MANUAL_HEAD)   { tier = 'manual'; continue }
      if (!tier) continue
      const m = line.match(/^- (.*?)\s+<!-- ts=([^>]+) -->\s*$/)
      if (m) out.push({ tier, text: m[1]!, ts: m[2]! })
    }
    return out
  }
}
```

- [ ] **Step 3: Implement notepad RPC handlers**

`packages/core/src/notepad/notepad-rpc.ts`:
```ts
import { z } from 'zod'
import type { RpcHandler } from '../rpc/protocol'
import { RPC_ERRORS } from '../rpc/protocol'
import { NotepadStore } from './notepad-store'

const WriteParams = z.object({
  text: z.string().min(1).max(2000),
  tier: z.enum(['priority', 'working', 'manual']).default('working'),
  projectRoot: z.string()
})
const ReadParams = z.object({ projectRoot: z.string() })
const PruneParams = z.object({ projectRoot: z.string(), workingMaxAgeMs: z.number().optional() })

export function makeNotepadHandlers(): Record<string, RpcHandler> {
  return {
    'notepad.write': async (p) => {
      const v = WriteParams.safeParse(p)
      if (!v.success) throw { ...RPC_ERRORS.INVALID_PARAMS, data: v.error.flatten() }
      const np = new NotepadStore({ projectRoot: v.data.projectRoot })
      if (v.data.tier === 'priority') np.writePriority(v.data.text)
      else if (v.data.tier === 'manual') np.writeManual(v.data.text)
      else np.writeWorking(v.data.text)
      return { ok: true }
    },
    'notepad.read': async (p) => {
      const v = ReadParams.safeParse(p)
      if (!v.success) throw { ...RPC_ERRORS.INVALID_PARAMS, data: v.error.flatten() }
      return { content: new NotepadStore({ projectRoot: v.data.projectRoot }).read() }
    },
    'notepad.forCompaction': async (p) => {
      const v = ReadParams.safeParse(p)
      if (!v.success) throw { ...RPC_ERRORS.INVALID_PARAMS, data: v.error.flatten() }
      return { content: new NotepadStore({ projectRoot: v.data.projectRoot }).forCompaction() }
    },
    'notepad.prune': async (p) => {
      const v = PruneParams.safeParse(p)
      if (!v.success) throw { ...RPC_ERRORS.INVALID_PARAMS, data: v.error.flatten() }
      const np = new NotepadStore({ projectRoot: v.data.projectRoot })
      return np.prune({ workingMaxAgeMs: v.data.workingMaxAgeMs })
    }
  }
}
```

- [ ] **Step 4: Barrel**

`packages/core/src/notepad/index.ts`:
```ts
export * from './notepad-store'
export * from './notepad-rpc'
```

- [ ] **Step 5: Run — PASS**

```bash
pnpm vitest run packages/core/test/unit/notepad-store.test.ts
```

Expected: 9 passed.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/notepad packages/core/test/unit/notepad-store.test.ts
git commit -m "feat(notepad): 3-tier priority/working/manual store + RPC + prune + forCompaction"
```

---

## Task 10: Memory Trio — Project Memory (notes vs directives, JSON)

**Files:**
- Create: `packages/core/src/project-memory/project-store.ts`
- Create: `packages/core/src/project-memory/project-rpc.ts`
- Create: `packages/core/src/project-memory/index.ts`
- Test: `packages/core/test/unit/project-store.test.ts`

- [ ] **Step 1: Write failing test**

`packages/core/test/unit/project-store.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { ProjectMemoryStore } from '../../src/project-memory/project-store'

let tmp: string
let pm: ProjectMemoryStore

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-pm-'))
  pm = new ProjectMemoryStore({ projectRoot: tmp })
})
afterEach(() => { rmSync(tmp, { recursive: true, force: true }) })

describe('ProjectMemoryStore', () => {
  test('addNote appends to notes[]', () => {
    pm.addNote('discovered that auth.ts owns OAuth flow')
    const d = pm.read()
    expect(d.notes.length).toBe(1)
    expect(d.notes[0]!.text).toContain('auth.ts')
  })

  test('addDirective appends to directives[]', () => {
    pm.addDirective('always run pnpm tsc before committing')
    const d = pm.read()
    expect(d.directives.length).toBe(1)
    expect(d.directives[0]!.text).toContain('pnpm tsc')
  })

  test('notes and directives are separately structured in JSON', () => {
    pm.addNote('N1'); pm.addDirective('D1')
    const raw = JSON.parse(readFileSync(pm.filePath(), 'utf8'))
    expect(Array.isArray(raw.notes)).toBe(true)
    expect(Array.isArray(raw.directives)).toBe(true)
    expect(raw.notes[0].text).toBe('N1')
    expect(raw.directives[0].text).toBe('D1')
  })

  test('persistence: new instance sees prior writes', () => {
    pm.addNote('persist')
    const pm2 = new ProjectMemoryStore({ projectRoot: tmp })
    expect(pm2.read().notes[0]!.text).toBe('persist')
  })

  test('removeNote removes by index', () => {
    pm.addNote('A'); pm.addNote('B'); pm.addNote('C')
    pm.removeNote(1)
    expect(pm.read().notes.map(n => n.text)).toEqual(['A', 'C'])
  })

  test('removeDirective removes by index', () => {
    pm.addDirective('D1'); pm.addDirective('D2')
    pm.removeDirective(0)
    expect(pm.read().directives.map(n => n.text)).toEqual(['D2'])
  })

  test('forContext emits markdown with directives bolded first', () => {
    pm.addDirective('use tsx for scripts')
    pm.addNote('this is a pnpm workspace')
    const md = pm.forContext()
    expect(md.indexOf('Directives')).toBeLessThan(md.indexOf('Notes'))
    expect(md).toContain('use tsx for scripts')
    expect(md).toContain('this is a pnpm workspace')
  })

  test('json is corruption-resistant — bad file → empty + warn', () => {
    const fp = pm.filePath()
    require('node:fs').mkdirSync(path.dirname(fp), { recursive: true })
    require('node:fs').writeFileSync(fp, '{ this is not json')
    expect(pm.read()).toEqual({ notes: [], directives: [] })
  })
})
```

- [ ] **Step 2: Implement store**

`packages/core/src/project-memory/project-store.ts`:
```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

interface Entry { text: string; ts: string }
export interface ProjectMemoryDoc { notes: Entry[]; directives: Entry[] }

export class ProjectMemoryStore {
  private path: string
  constructor(opts: { projectRoot: string }) {
    this.path = path.join(opts.projectRoot, '.glm', 'project-memory.json')
  }

  filePath(): string { return this.path }

  read(): ProjectMemoryDoc {
    if (!existsSync(this.path)) return { notes: [], directives: [] }
    try {
      const raw = JSON.parse(readFileSync(this.path, 'utf8')) as Partial<ProjectMemoryDoc>
      return {
        notes: Array.isArray(raw.notes) ? raw.notes : [],
        directives: Array.isArray(raw.directives) ? raw.directives : []
      }
    } catch {
      return { notes: [], directives: [] }
    }
  }

  addNote(text: string): void {
    const d = this.read()
    d.notes.push({ text, ts: new Date().toISOString() })
    this.write(d)
  }

  addDirective(text: string): void {
    const d = this.read()
    d.directives.push({ text, ts: new Date().toISOString() })
    this.write(d)
  }

  removeNote(i: number): boolean {
    const d = this.read()
    if (i < 0 || i >= d.notes.length) return false
    d.notes.splice(i, 1)
    this.write(d)
    return true
  }

  removeDirective(i: number): boolean {
    const d = this.read()
    if (i < 0 || i >= d.directives.length) return false
    d.directives.splice(i, 1)
    this.write(d)
    return true
  }

  /** Markdown rendering for context assembly. Directives always come first, bolded. */
  forContext(): string {
    const d = this.read()
    const lines: string[] = ['## Project Memory']
    if (d.directives.length) {
      lines.push('', '### Directives')
      for (const e of d.directives) lines.push(`- **${e.text}**`)
    }
    if (d.notes.length) {
      lines.push('', '### Notes')
      for (const e of d.notes) lines.push(`- ${e.text}`)
    }
    return lines.join('\n') + '\n'
  }

  private write(d: ProjectMemoryDoc): void {
    mkdirSync(path.dirname(this.path), { recursive: true })
    writeFileSync(this.path, JSON.stringify(d, null, 2), 'utf8')
  }
}
```

- [ ] **Step 3: Implement RPC**

`packages/core/src/project-memory/project-rpc.ts`:
```ts
import { z } from 'zod'
import type { RpcHandler } from '../rpc/protocol'
import { RPC_ERRORS } from '../rpc/protocol'
import { ProjectMemoryStore } from './project-store'

const RootOnly = z.object({ projectRoot: z.string() })
const AddText  = z.object({ projectRoot: z.string(), text: z.string().min(1).max(4000) })
const RemoveIx = z.object({ projectRoot: z.string(), index: z.number().int().nonnegative() })

export function makeProjectMemoryHandlers(): Record<string, RpcHandler> {
  return {
    'project.read': async (p) => {
      const v = RootOnly.safeParse(p)
      if (!v.success) throw { ...RPC_ERRORS.INVALID_PARAMS, data: v.error.flatten() }
      return new ProjectMemoryStore({ projectRoot: v.data.projectRoot }).read()
    },
    'project.addNote': async (p) => {
      const v = AddText.safeParse(p)
      if (!v.success) throw { ...RPC_ERRORS.INVALID_PARAMS, data: v.error.flatten() }
      new ProjectMemoryStore({ projectRoot: v.data.projectRoot }).addNote(v.data.text)
      return { ok: true }
    },
    'project.addDirective': async (p) => {
      const v = AddText.safeParse(p)
      if (!v.success) throw { ...RPC_ERRORS.INVALID_PARAMS, data: v.error.flatten() }
      new ProjectMemoryStore({ projectRoot: v.data.projectRoot }).addDirective(v.data.text)
      return { ok: true }
    },
    'project.removeNote': async (p) => {
      const v = RemoveIx.safeParse(p)
      if (!v.success) throw { ...RPC_ERRORS.INVALID_PARAMS, data: v.error.flatten() }
      return { removed: new ProjectMemoryStore({ projectRoot: v.data.projectRoot }).removeNote(v.data.index) }
    },
    'project.removeDirective': async (p) => {
      const v = RemoveIx.safeParse(p)
      if (!v.success) throw { ...RPC_ERRORS.INVALID_PARAMS, data: v.error.flatten() }
      return { removed: new ProjectMemoryStore({ projectRoot: v.data.projectRoot }).removeDirective(v.data.index) }
    },
    'project.forContext': async (p) => {
      const v = RootOnly.safeParse(p)
      if (!v.success) throw { ...RPC_ERRORS.INVALID_PARAMS, data: v.error.flatten() }
      return { markdown: new ProjectMemoryStore({ projectRoot: v.data.projectRoot }).forContext() }
    }
  }
}
```

- [ ] **Step 4: Barrel**

`packages/core/src/project-memory/index.ts`:
```ts
export * from './project-store'
export * from './project-rpc'
```

- [ ] **Step 5: Run — PASS**

```bash
pnpm vitest run packages/core/test/unit/project-store.test.ts
```

Expected: 8 passed.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/project-memory packages/core/test/unit/project-store.test.ts
git commit -m "feat(project-memory): notes vs directives JSON store + RPC + forContext"
```

---

## Task 11: Memory Trio — Shared Memory (file-locked KV)

**Files:**
- Create: `packages/core/src/shared-memory/shared-store.ts`
- Create: `packages/core/src/shared-memory/shared-rpc.ts`
- Create: `packages/core/src/shared-memory/index.ts`
- Test: `packages/core/test/unit/shared-store.test.ts`

- [ ] **Step 1: Write failing test**

`packages/core/test/unit/shared-store.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { SharedMemoryStore } from '../../src/shared-memory/shared-store'

let tmp: string
let sm: SharedMemoryStore

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-sm-'))
  sm = new SharedMemoryStore({ projectRoot: tmp })
})
afterEach(() => { rmSync(tmp, { recursive: true, force: true }) })

describe('SharedMemoryStore', () => {
  test('write + read round-trip', async () => {
    await sm.write('progress-w1', { phase: 'analyzing', percent: 45 })
    const r = await sm.read('progress-w1')
    expect(r).toMatchObject({ value: { phase: 'analyzing', percent: 45 } })
  })

  test('read of missing key returns undefined', async () => {
    expect(await sm.read('missing')).toBeUndefined()
  })

  test('write stores meta (writtenAt, writer)', async () => {
    await sm.write('k', { x: 1 }, { writer: 'worker-3' })
    const r = await sm.read('k')
    expect(r!.writer).toBe('worker-3')
    expect(r!.writtenAt).toBeDefined()
  })

  test('list returns all keys', async () => {
    await sm.write('a', 1); await sm.write('b', 2); await sm.write('c', 3)
    const keys = await sm.list()
    expect(keys.sort()).toEqual(['a', 'b', 'c'])
  })

  test('delete removes key', async () => {
    await sm.write('k', 1)
    expect(await sm.delete('k')).toBe(true)
    expect(await sm.read('k')).toBeUndefined()
  })

  test('TTL: expired entry auto-cleaned on read', async () => {
    await sm.write('k', 'v', { ttlMs: 30 })
    await new Promise(r => setTimeout(r, 60))
    expect(await sm.read('k')).toBeUndefined()
  })

  test('concurrent writes preserve last-writer-wins via file lock', async () => {
    // 20 concurrent writers — final value must be a valid one, never corrupted
    const all = Array.from({ length: 20 }, (_, i) => sm.write('k', i))
    await Promise.all(all)
    const r = await sm.read('k')
    expect(r!.value).toBeGreaterThanOrEqual(0)
    expect(r!.value).toBeLessThan(20)
  })

  test('key sanitization rejects path traversal', async () => {
    await expect(sm.write('../etc/passwd', 'hi')).rejects.toThrow()
    await expect(sm.write('a/b', 'hi')).rejects.toThrow()
  })

  test('files live under .glm/shared/', async () => {
    await sm.write('hello', { x: 1 })
    expect(existsSync(path.join(tmp, '.glm', 'shared', 'hello.json'))).toBe(true)
  })
})
```

- [ ] **Step 2: Implement shared store with proper-lockfile**

`packages/core/src/shared-memory/shared-store.ts`:
```ts
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import lockfile from 'proper-lockfile'

export interface SharedRecord<T = unknown> {
  value: T
  writer?: string
  writtenAt: string
  expiresAt?: string
}

export interface WriteOpts {
  writer?: string
  ttlMs?: number
}

const KEY_RE = /^[A-Za-z0-9_\-.][A-Za-z0-9_\-. ]{0,127}$/

export class SharedMemoryStore {
  private dir: string
  constructor(opts: { projectRoot: string }) {
    this.dir = path.join(opts.projectRoot, '.glm', 'shared')
  }

  private validateKey(key: string): void {
    if (!KEY_RE.test(key)) throw new Error(`invalid shared-memory key: ${JSON.stringify(key)}`)
    if (key.includes('/') || key.includes('..')) throw new Error('shared-memory key may not contain path separators or ".."')
  }

  private pathFor(key: string): string { return path.join(this.dir, `${key}.json`) }

  async write<T>(key: string, value: T, opts: WriteOpts = {}): Promise<void> {
    this.validateKey(key)
    mkdirSync(this.dir, { recursive: true })
    const fp = this.pathFor(key)
    // touch the file so proper-lockfile can lock it
    if (!existsSync(fp)) writeFileSync(fp, '{}', { flag: 'w' })
    const release = await lockfile.lock(fp, {
      retries: { retries: 10, minTimeout: 5, maxTimeout: 50, factor: 1.5 },
      stale: 10_000
    })
    try {
      const rec: SharedRecord<T> = {
        value,
        writer: opts.writer,
        writtenAt: new Date().toISOString(),
        expiresAt: opts.ttlMs ? new Date(Date.now() + opts.ttlMs).toISOString() : undefined
      }
      writeFileSync(fp, JSON.stringify(rec, null, 2), 'utf8')
    } finally {
      await release()
    }
  }

  async read<T = unknown>(key: string): Promise<SharedRecord<T> | undefined> {
    this.validateKey(key)
    const fp = this.pathFor(key)
    if (!existsSync(fp)) return undefined
    let release: (() => Promise<void>) | undefined
    try {
      release = await lockfile.lock(fp, { retries: { retries: 5, minTimeout: 5, maxTimeout: 50 }, stale: 10_000 })
      const raw = JSON.parse(readFileSync(fp, 'utf8')) as SharedRecord<T>
      if (raw.expiresAt && Date.parse(raw.expiresAt) < Date.now()) {
        unlinkSync(fp)
        return undefined
      }
      return raw
    } catch {
      return undefined
    } finally {
      if (release) await release()
    }
  }

  async delete(key: string): Promise<boolean> {
    this.validateKey(key)
    const fp = this.pathFor(key)
    if (!existsSync(fp)) return false
    unlinkSync(fp)
    return true
  }

  async list(): Promise<string[]> {
    if (!existsSync(this.dir)) return []
    return readdirSync(this.dir).filter(f => f.endsWith('.json')).map(f => f.slice(0, -'.json'.length))
  }
}
```

- [ ] **Step 3: RPC handlers**

`packages/core/src/shared-memory/shared-rpc.ts`:
```ts
import { z } from 'zod'
import type { RpcHandler } from '../rpc/protocol'
import { RPC_ERRORS } from '../rpc/protocol'
import { SharedMemoryStore } from './shared-store'

const RW = z.object({
  projectRoot: z.string(),
  key: z.string().min(1).max(128),
  value: z.unknown(),
  writer: z.string().optional(),
  ttlMs: z.number().int().positive().optional()
})
const RD = z.object({ projectRoot: z.string(), key: z.string().min(1).max(128) })
const LS = z.object({ projectRoot: z.string() })

export function makeSharedMemoryHandlers(): Record<string, RpcHandler> {
  return {
    'shared.write': async (p) => {
      const v = RW.safeParse(p)
      if (!v.success) throw { ...RPC_ERRORS.INVALID_PARAMS, data: v.error.flatten() }
      const sm = new SharedMemoryStore({ projectRoot: v.data.projectRoot })
      await sm.write(v.data.key, v.data.value, { writer: v.data.writer, ttlMs: v.data.ttlMs })
      return { ok: true }
    },
    'shared.read': async (p) => {
      const v = RD.safeParse(p)
      if (!v.success) throw { ...RPC_ERRORS.INVALID_PARAMS, data: v.error.flatten() }
      return (await new SharedMemoryStore({ projectRoot: v.data.projectRoot }).read(v.data.key)) ?? null
    },
    'shared.delete': async (p) => {
      const v = RD.safeParse(p)
      if (!v.success) throw { ...RPC_ERRORS.INVALID_PARAMS, data: v.error.flatten() }
      return { deleted: await new SharedMemoryStore({ projectRoot: v.data.projectRoot }).delete(v.data.key) }
    },
    'shared.list': async (p) => {
      const v = LS.safeParse(p)
      if (!v.success) throw { ...RPC_ERRORS.INVALID_PARAMS, data: v.error.flatten() }
      return { keys: await new SharedMemoryStore({ projectRoot: v.data.projectRoot }).list() }
    }
  }
}
```

- [ ] **Step 4: Barrel**

`packages/core/src/shared-memory/index.ts`:
```ts
export * from './shared-store'
export * from './shared-rpc'
```

- [ ] **Step 5: Run — PASS**

```bash
pnpm vitest run packages/core/test/unit/shared-store.test.ts
```

Expected: 9 passed. Concurrent-write test may take a moment due to lock retry.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/shared-memory packages/core/test/unit/shared-store.test.ts
git commit -m "feat(shared-memory): file-locked KV store via proper-lockfile + TTL + path safety"
```

---

## Task 12: Cache marker injector + context block primitives

**Files:**
- Create: `packages/core/src/context/cache-marker.ts`
- Create: `packages/core/src/context/index.ts`
- Test: `packages/core/test/unit/cache-marker.test.ts`

- [ ] **Step 1: Write failing test**

`packages/core/test/unit/cache-marker.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { markCacheable, splitForCache, estimateTokens } from '../../src/context/cache-marker'
import type { ContextBlock } from '@glm/shared'

const sys: ContextBlock = { role: 'system', content: 'system text', cacheable: true, source: 'system' }
const skills: ContextBlock = { role: 'system', content: 'skill catalog', cacheable: true, source: 'cascade' }
const user: ContextBlock = { role: 'user', content: 'hi', cacheable: false, source: 'user' }

describe('cache-marker', () => {
  test('markCacheable wraps content with cache_control on cacheable blocks', () => {
    const out = markCacheable([sys, skills, user])
    expect(out[0]!.content[0]).toMatchObject({ type: 'text', text: 'system text', cache_control: { type: 'ephemeral' } })
    expect(out[1]!.content[0]).toMatchObject({ cache_control: { type: 'ephemeral' } })
    expect(out[2]!.content[0]).not.toHaveProperty('cache_control')
  })

  test('non-cacheable blocks emit plain text content array (no marker)', () => {
    const out = markCacheable([user])
    expect(out[0]).toMatchObject({ role: 'user' })
    expect(out[0]!.content[0]).toEqual({ type: 'text', text: 'hi' })
  })

  test('splitForCache returns separate cacheable / volatile arrays', () => {
    const r = splitForCache([sys, skills, user])
    expect(r.cacheable).toEqual([sys, skills])
    expect(r.volatile).toEqual([user])
  })

  test('estimateTokens approximates 4 chars/token', () => {
    expect(estimateTokens('1234')).toBe(1)
    expect(estimateTokens('12345678')).toBe(2)
    expect(estimateTokens('')).toBe(0)
  })
})
```

- [ ] **Step 2: Implement cache-marker**

`packages/core/src/context/cache-marker.ts`:
```ts
import type { ContextBlock } from '@glm/shared'

export interface AnthropicContentPart {
  type: 'text'
  text: string
  cache_control?: { type: 'ephemeral' }
}

export interface RenderedMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: AnthropicContentPart[]
}

/**
 * Convert ContextBlock[] into Anthropic-style messages with cache_control: ephemeral
 * attached to cacheable parts.
 */
export function markCacheable(blocks: ContextBlock[]): RenderedMessage[] {
  return blocks.map(b => ({
    role: b.role,
    content: [
      b.cacheable
        ? { type: 'text', text: b.content, cache_control: { type: 'ephemeral' } }
        : { type: 'text', text: b.content }
    ]
  }))
}

export function splitForCache(blocks: ContextBlock[]): { cacheable: ContextBlock[]; volatile: ContextBlock[] } {
  return {
    cacheable: blocks.filter(b => b.cacheable),
    volatile: blocks.filter(b => !b.cacheable)
  }
}

/** Cheap token estimator: 4 chars/token (English baseline). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}
```

- [ ] **Step 3: Barrel**

`packages/core/src/context/index.ts`:
```ts
export * from './cache-marker'
```

- [ ] **Step 4: Run — PASS**

```bash
pnpm vitest run packages/core/test/unit/cache-marker.test.ts
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/context/cache-marker.ts packages/core/src/context/index.ts packages/core/test/unit/cache-marker.test.ts
git commit -m "feat(context): cache_control ephemeral marker injector + token estimator"
```

---

## Task 13: Tail preservation + tool output pruning + compaction trigger

**Files:**
- Create: `packages/core/src/context/tail-preserve.ts`
- Create: `packages/core/src/context/tool-prune.ts`
- Create: `packages/core/src/context/compaction-trigger.ts`
- Test: `packages/core/test/unit/tail-preserve.test.ts`
- Test: `packages/core/test/unit/tool-prune.test.ts`
- Test: `packages/core/test/unit/compaction-trigger.test.ts`

- [ ] **Step 1: Tail preserve test**

`packages/core/test/unit/tail-preserve.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { extractTail } from '../../src/context/tail-preserve'
import type { ContextBlock } from '@glm/shared'

function turn(role: 'user' | 'assistant', text: string): ContextBlock {
  return { role, content: text, cacheable: false, source: role }
}

describe('extractTail', () => {
  test('returns last 2 turns by default', () => {
    const h: ContextBlock[] = [
      turn('user', 'q1'),
      turn('assistant', 'a1'),
      turn('user', 'q2'),
      turn('assistant', 'a2'),
      turn('user', 'q3'),
      turn('assistant', 'a3')
    ]
    const t = extractTail(h)
    expect(t.tail.length).toBe(4)            // 2 user+assistant pairs
    expect(t.tail[0]!.content).toBe('q2')
    expect(t.compactable.length).toBe(2)     // q1 + a1
  })

  test('honors maxTokens cap', () => {
    const huge = 'x'.repeat(20_000)          // ~5K tokens
    const h: ContextBlock[] = [
      turn('user', 'small'),
      turn('assistant', 'small'),
      turn('user', huge),
      turn('assistant', huge)
    ]
    const t = extractTail(h, { maxTokens: 2_000 })
    // shouldn't return the huge pair (over budget)
    expect(t.tail.find(b => b.content === huge)).toBeFalsy()
  })

  test('always preserves last assistant turn even if alone over budget', () => {
    const h: ContextBlock[] = [
      turn('user', 'q1'),
      turn('assistant', 'a1')
    ]
    const t = extractTail(h, { maxTokens: 1 })
    // the last turn pair must still be returned (cannot make budget negative)
    expect(t.tail.length).toBeGreaterThan(0)
  })

  test('returns empty tail for empty history', () => {
    expect(extractTail([]).tail).toEqual([])
  })
})
```

- [ ] **Step 2: Implement tail-preserve**

`packages/core/src/context/tail-preserve.ts`:
```ts
import type { ContextBlock } from '@glm/shared'
import { estimateTokens } from './cache-marker'

export interface TailOpts {
  preserveTurns?: number            // default 2 user/assistant pairs
  maxTokens?: number                // default 8000
  minTokens?: number                // default 2000 (always keep at least this much)
}

export interface TailResult {
  compactable: ContextBlock[]       // history that may be summarized
  tail: ContextBlock[]              // history to keep verbatim
}

export function extractTail(history: ContextBlock[], opts: TailOpts = {}): TailResult {
  const preserveTurns = opts.preserveTurns ?? 2
  const maxTokens = opts.maxTokens ?? 8000
  const minTokens = opts.minTokens ?? 2000

  if (history.length === 0) return { compactable: [], tail: [] }

  // Collect last preserveTurns user+assistant pairs (walk backwards)
  const tail: ContextBlock[] = []
  let userTurnCount = 0
  let tokens = 0
  for (let i = history.length - 1; i >= 0; i--) {
    const b = history[i]!
    const bTok = estimateTokens(b.content)
    // Stop when we've collected enough turns AND we're over min budget
    if (userTurnCount >= preserveTurns && tokens >= minTokens) break
    // Skip if adding this would blow the cap UNLESS tail is still empty
    if (tail.length > 0 && tokens + bTok > maxTokens) break
    tail.unshift(b)
    tokens += bTok
    if (b.role === 'user') userTurnCount++
  }

  const compactable = history.slice(0, history.length - tail.length)
  return { compactable, tail }
}
```

- [ ] **Step 3: Tool prune test**

`packages/core/test/unit/tool-prune.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { pruneToolOutput, pruneAll } from '../../src/context/tool-prune'

describe('pruneToolOutput', () => {
  test('untouched when ≤ 2000 chars', () => {
    const r = pruneToolOutput({ tool: 'Read', content: 'small' })
    expect(r.content).toBe('small')
    expect(r.trimmed).toBe(false)
  })

  test('trims content > 2000 chars and appends metadata', () => {
    const big = 'x'.repeat(5000)
    const r = pruneToolOutput({ tool: 'Bash', content: big })
    expect(r.content.length).toBeLessThanOrEqual(2000 + 200)  // 2k + metadata footer
    expect(r.content).toContain('[trimmed')
    expect(r.content).toContain('5000 chars')
    expect(r.trimmed).toBe(true)
  })

  test('protected tools never trimmed (skill, memory, Task)', () => {
    const big = 'x'.repeat(10_000)
    const skill = pruneToolOutput({ tool: 'Skill', content: big })
    expect(skill.content).toBe(big)
    expect(skill.trimmed).toBe(false)
    const memo = pruneToolOutput({ tool: 'memory', content: big })
    expect(memo.trimmed).toBe(false)
    const task = pruneToolOutput({ tool: 'Task', content: big })
    expect(task.trimmed).toBe(false)
  })

  test('pruneAll applies across array, returns count', () => {
    const big = 'x'.repeat(5000)
    const r = pruneAll([
      { tool: 'Read', content: big },
      { tool: 'Skill', content: big },
      { tool: 'Bash', content: 'small' }
    ])
    expect(r.outputs[0]!.trimmed).toBe(true)
    expect(r.outputs[1]!.trimmed).toBe(false)
    expect(r.outputs[2]!.trimmed).toBe(false)
    expect(r.trimmedCount).toBe(1)
  })
})
```

- [ ] **Step 4: Implement tool-prune**

`packages/core/src/context/tool-prune.ts`:
```ts
const PROTECTED_TOOLS = new Set(['Skill', 'skill', 'memory', 'Memory', 'Task', 'TodoWrite'])
const TRIM_THRESHOLD = 2000

export interface ToolOutput {
  tool: string
  content: string
  meta?: Record<string, unknown>
}

export interface PrunedOutput extends ToolOutput {
  trimmed: boolean
}

export function pruneToolOutput(o: ToolOutput): PrunedOutput {
  if (PROTECTED_TOOLS.has(o.tool)) return { ...o, trimmed: false }
  if (o.content.length <= TRIM_THRESHOLD) return { ...o, trimmed: false }
  const head = o.content.slice(0, TRIM_THRESHOLD - 100)
  const meta = `\n\n[trimmed by glm-context: ${o.content.length} chars total, kept first ${head.length}]`
  return { ...o, content: head + meta, trimmed: true }
}

export function pruneAll(outputs: ToolOutput[]): { outputs: PrunedOutput[]; trimmedCount: number } {
  const result = outputs.map(pruneToolOutput)
  return { outputs: result, trimmedCount: result.filter(r => r.trimmed).length }
}
```

- [ ] **Step 5: Compaction trigger test**

`packages/core/test/unit/compaction-trigger.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { usable, shouldCompact } from '../../src/context/compaction-trigger'

describe('compaction-trigger', () => {
  test('usable subtracts reservedOutput + buffer from ctx', () => {
    const u = usable({ ctx: 200_000, maxOutput: 128_000 }, { reservedOutput: 16_000, buffer: 8_000 })
    expect(u).toBe(200_000 - 16_000 - 8_000)
  })

  test('reservedOutput clamped to model.maxOutput', () => {
    const u = usable({ ctx: 200_000, maxOutput: 4_000 }, { reservedOutput: 16_000, buffer: 8_000 })
    expect(u).toBe(200_000 - 4_000 - 8_000)
  })

  test('GLM-5.1 default usable ~ 176K', () => {
    const u = usable({ ctx: 200_000, maxOutput: 128_000 }, {})
    expect(u).toBeGreaterThan(170_000)
    expect(u).toBeLessThan(185_000)
  })

  test('shouldCompact at 88% of usable', () => {
    const u = 176_000
    expect(shouldCompact({ tokensInContext: Math.floor(u * 0.5), usable: u })).toBe(false)
    expect(shouldCompact({ tokensInContext: Math.floor(u * 0.9), usable: u })).toBe(true)
  })

  test('shouldCompact respects user threshold override', () => {
    expect(shouldCompact({ tokensInContext: 100, usable: 1000, thresholdPct: 0.05 })).toBe(true)
    expect(shouldCompact({ tokensInContext: 100, usable: 1000, thresholdPct: 0.5 })).toBe(false)
  })
})
```

- [ ] **Step 6: Implement compaction-trigger**

`packages/core/src/context/compaction-trigger.ts`:
```ts
export interface ModelLimits {
  ctx: number                       // total context window
  maxOutput: number                 // model maxOutput (used to clamp reservedOutput)
}

export interface UsableCfg {
  reservedOutput?: number           // default 16_000
  buffer?: number                   // default 8_000
}

export function usable(m: ModelLimits, cfg: UsableCfg = {}): number {
  const reservedOutput = Math.min(cfg.reservedOutput ?? 16_000, m.maxOutput)
  const buffer = cfg.buffer ?? 8_000
  return m.ctx - reservedOutput - buffer
}

export interface CompactDecisionInput {
  tokensInContext: number
  usable: number
  thresholdPct?: number             // default 0.88
}

export function shouldCompact(i: CompactDecisionInput): boolean {
  const pct = i.thresholdPct ?? 0.88
  return i.tokensInContext / i.usable >= pct
}
```

- [ ] **Step 7: Update barrel + run all tests**

`packages/core/src/context/index.ts`:
```ts
export * from './cache-marker'
export * from './tail-preserve'
export * from './tool-prune'
export * from './compaction-trigger'
```

```bash
pnpm vitest run packages/core/test/unit/tail-preserve.test.ts packages/core/test/unit/tool-prune.test.ts packages/core/test/unit/compaction-trigger.test.ts
```

Expected: 4 + 4 + 5 = 13 passed.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/context packages/core/test/unit
git commit -m "feat(context): tail-preserve + tool-prune + compaction-trigger (usable/shouldCompact)"
```

---

## Task 14: Compaction template (Markdown structured) + parser

**Files:**
- Create: `packages/core/src/context/compaction-template.ts`
- Test: `packages/core/test/unit/compaction-template.test.ts`

- [ ] **Step 1: Failing test**

`packages/core/test/unit/compaction-template.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { renderCompactionPrompt, parseCompactedSummary } from '../../src/context/compaction-template'

describe('compaction-template', () => {
  test('renderCompactionPrompt produces a structured Markdown prompt', () => {
    const p = renderCompactionPrompt({
      conversationDump: 'A bunch of turns ...',
      relevantFiles: ['src/auth/oauth.ts', 'src/index.ts'],
      currentGoal: 'add refresh-token support'
    })
    expect(p).toContain('## Goal')
    expect(p).toContain('## Constraints')
    expect(p).toContain('## Progress')
    expect(p).toContain('## Key Decisions')
    expect(p).toContain('## Next Steps')
    expect(p).toContain('## Critical Context')
    expect(p).toContain('## Relevant Files')
    expect(p).toContain('add refresh-token support')
    expect(p).toContain('src/auth/oauth.ts')
  })

  test('parseCompactedSummary parses all 7 sections', () => {
    const text = `
## Goal
add refresh-token support to oauth flow

## Constraints
- pnpm tsc must pass
- no new deps

## Progress
### Done
- wrote AuthService

### InProgress
- adding token refresh

### Blocked
- token expiry not yet detectable

## Key Decisions
- use refresh-token rotation (RFC 6749 §6)

## Next Steps
1. parse expiry from JWT
2. implement refresh()

## Critical Context
the OAuth provider expects refresh on 401, not on expiry.

## Relevant Files
- src/auth/oauth.ts
- src/auth/refresh.ts
`
    const r = parseCompactedSummary(text)
    expect(r.goal).toContain('refresh-token')
    expect(r.constraints).toContain('pnpm tsc')
    expect(r.progress.done.length).toBeGreaterThan(0)
    expect(r.progress.inProgress.length).toBeGreaterThan(0)
    expect(r.progress.blocked.length).toBeGreaterThan(0)
    expect(r.keyDecisions[0]).toContain('refresh-token rotation')
    expect(r.nextSteps.length).toBe(2)
    expect(r.criticalContext).toContain('expects refresh on 401')
    expect(r.relevantFiles).toEqual(['src/auth/oauth.ts', 'src/auth/refresh.ts'])
  })

  test('parser handles missing optional sections gracefully', () => {
    const text = `## Goal\nfoo\n## Next Steps\n1. bar\n`
    const r = parseCompactedSummary(text)
    expect(r.goal).toBe('foo')
    expect(r.nextSteps).toEqual(['bar'])
    expect(r.constraints).toBe('')
    expect(r.relevantFiles).toEqual([])
  })
})
```

- [ ] **Step 2: Implement template**

`packages/core/src/context/compaction-template.ts`:
```ts
import type { CompactedSummary } from '@glm/shared'

export interface CompactionPromptInput {
  conversationDump: string
  relevantFiles: string[]
  currentGoal?: string
}

/**
 * The prompt the LLM router sees when asked to compact a conversation.
 * Output spec is "produce a structured Markdown summary with these 7 sections".
 */
export function renderCompactionPrompt(i: CompactionPromptInput): string {
  return `You are summarizing a coding-agent conversation so that the agent can continue
without losing critical context. Produce a structured Markdown summary using EXACTLY
the following section headings, in this order. Be terse, factual, and concrete.

## Goal
<1-2 sentences: what the user is trying to accomplish overall>

## Constraints
<bullet list of project rules, user preferences, dependencies that must be respected>

## Progress
### Done
- <completed steps>

### InProgress
- <in-flight steps>

### Blocked
- <steps waiting on info / failing>

## Key Decisions
- <design / architectural choices made and rationale (terse)>

## Next Steps
1. <ordered list of immediate actions>

## Critical Context
<one paragraph: facts the next turn MUST know that aren't obvious from files alone>

## Relevant Files
- <file path 1>
- <file path 2>

---

CURRENT GOAL (from caller): ${i.currentGoal ?? '(not specified)'}

RELEVANT FILES (from caller):
${i.relevantFiles.map(f => `- ${f}`).join('\n')}

CONVERSATION TO SUMMARIZE:
${i.conversationDump}
`
}

export function parseCompactedSummary(raw: string): CompactedSummary {
  const goal = extractSection(raw, 'Goal').trim()
  const constraints = extractSection(raw, 'Constraints').trim()
  const progressRaw = extractSection(raw, 'Progress')
  const progress = {
    done: extractBulletList(progressRaw, 'Done'),
    inProgress: extractBulletList(progressRaw, 'InProgress'),
    blocked: extractBulletList(progressRaw, 'Blocked')
  }
  const keyDecisions = extractBullets(extractSection(raw, 'Key Decisions'))
  const nextSteps = extractBullets(extractSection(raw, 'Next Steps'))
  const criticalContext = extractSection(raw, 'Critical Context').trim()
  const relevantFiles = extractBullets(extractSection(raw, 'Relevant Files'))

  return {
    goal,
    constraints,
    progress,
    keyDecisions,
    nextSteps,
    criticalContext,
    relevantFiles,
    raw
  }
}

function extractSection(raw: string, heading: string): string {
  // Match `## heading` (level 2) up to next `## ` or EOF
  const re = new RegExp(`^##\\s+${heading}\\b[^\\n]*\\n([\\s\\S]*?)(?=^##\\s|^$(?![\\s\\S]))`, 'm')
  const m = raw.match(re)
  return m ? m[1] ?? '' : ''
}

function extractBulletList(raw: string, sub: string): string[] {
  // Match `### sub` (level 3) inside a section
  const re = new RegExp(`^###\\s+${sub}\\b[^\\n]*\\n([\\s\\S]*?)(?=^###\\s|^##\\s|^$(?![\\s\\S]))`, 'm')
  const m = raw.match(re)
  return extractBullets(m?.[1] ?? '')
}

function extractBullets(text: string): string[] {
  const lines = text.split('\n')
  const out: string[] = []
  for (const line of lines) {
    // accept `- foo`, `* foo`, `1. foo`, `1) foo`
    const m = line.match(/^\s*(?:[-*]|\d+[.)])\s+(.+)$/)
    if (m) out.push(m[1]!.trim())
  }
  return out
}
```

- [ ] **Step 3: Update barrel**

```ts
// packages/core/src/context/index.ts
export * from './cache-marker'
export * from './tail-preserve'
export * from './tool-prune'
export * from './compaction-trigger'
export * from './compaction-template'
```

- [ ] **Step 4: Run — PASS**

```bash
pnpm vitest run packages/core/test/unit/compaction-template.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/context packages/core/test/unit/compaction-template.test.ts
git commit -m "feat(context): structured Markdown compaction template + 7-section parser"
```

---

## Task 15: Compactor (LLM-driven summarize) + Snapshot store

**Files:**
- Create: `packages/core/src/context/compactor.ts`
- Create: `packages/core/src/context/snapshot.ts`
- Test: `packages/core/test/unit/snapshot.test.ts`

- [ ] **Step 1: Failing snapshot test**

`packages/core/test/unit/snapshot.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { Database } from 'better-sqlite3'
import { openDb, runMigrations } from '../../src/storage'
import { SessionRepo } from '../../src/storage/session-repo'
import { SnapshotStore } from '../../src/context/snapshot'

let tmp: string
let db: Database
let snap: SnapshotStore
let sessionId: string

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-snap-'))
  db = openDb(path.join(tmp, 's.db'))
  runMigrations(db)
  const s = new SessionRepo(db).create({ cwd: tmp, worktree: tmp })
  sessionId = s.id
  snap = new SnapshotStore({ db, sessionsRoot: path.join(tmp, 'sessions') })
})
afterEach(() => { db.close(); rmSync(tmp, { recursive: true, force: true }) })

describe('SnapshotStore', () => {
  test('capture writes blob + row', () => {
    const f = path.join(tmp, 'a.txt')
    writeFileSync(f, 'hello')
    const r = snap.capture({ sessionId, path: f, reason: 'pre-edit' })
    expect(r.blobSha).toMatch(/^[a-f0-9]{64}$/)
    expect(existsSync(r.blobPath)).toBe(true)
    const rows = db.prepare('SELECT * FROM file_versions WHERE session_id = ?').all(sessionId)
    expect(rows.length).toBe(1)
  })

  test('content-addressable: same content = same blob path, no duplicate write', () => {
    const f1 = path.join(tmp, 'a.txt'); writeFileSync(f1, 'identical')
    const f2 = path.join(tmp, 'b.txt'); writeFileSync(f2, 'identical')
    const r1 = snap.capture({ sessionId, path: f1, reason: 'manual' })
    const r2 = snap.capture({ sessionId, path: f2, reason: 'manual' })
    expect(r1.blobSha).toBe(r2.blobSha)
    expect(r1.blobPath).toBe(r2.blobPath)
  })

  test('history returns versions for a path, newest first', async () => {
    const f = path.join(tmp, 'a.txt')
    writeFileSync(f, 'v1'); snap.capture({ sessionId, path: f, reason: 'pre-edit' })
    await new Promise(r => setTimeout(r, 10))
    writeFileSync(f, 'v2'); snap.capture({ sessionId, path: f, reason: 'post-edit' })
    const hist = snap.history(sessionId, f)
    expect(hist.length).toBe(2)
    expect(hist[0]!.reason).toBe('post-edit')
  })

  test('readBlob returns content', () => {
    const f = path.join(tmp, 'a.txt'); writeFileSync(f, 'CONTENT')
    const r = snap.capture({ sessionId, path: f, reason: 'manual' })
    expect(snap.readBlob(r.blobSha)).toBe('CONTENT')
  })

  test('blobs sharded by 2-char prefix', () => {
    const f = path.join(tmp, 'a.txt'); writeFileSync(f, 'hi')
    const r = snap.capture({ sessionId, path: f, reason: 'manual' })
    const rel = path.relative(path.join(tmp, 'sessions', sessionId, 'snapshots'), r.blobPath)
    expect(rel.split(path.sep)[0]!.length).toBe(2)
  })
})
```

- [ ] **Step 2: Implement snapshot store**

`packages/core/src/context/snapshot.ts`:
```ts
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import path from 'node:path'
import type { Database } from 'better-sqlite3'

export interface SnapshotOpts {
  db: Database
  sessionsRoot: string              // e.g. ~/.glm/sessions
}

export type CaptureReason = 'pre-edit' | 'post-edit' | 'pre-compaction' | 'manual'

export interface CaptureInput {
  sessionId: string
  path: string                      // absolute path being captured
  reason: CaptureReason
}

export interface CaptureResult {
  blobSha: string
  blobPath: string
  bytes: number
  rowId: number
}

export interface VersionRow {
  id: number
  sessionId: string
  path: string
  blobSha: string
  bytes: number
  capturedAt: string
  reason: CaptureReason
}

export class SnapshotStore {
  constructor(private opts: SnapshotOpts) {}

  private blobDir(sessionId: string): string {
    return path.join(this.opts.sessionsRoot, sessionId, 'snapshots')
  }

  private blobPath(sessionId: string, sha: string): string {
    return path.join(this.blobDir(sessionId), sha.slice(0, 2), sha)
  }

  capture(i: CaptureInput): CaptureResult {
    if (!existsSync(i.path)) throw new Error(`snapshot: file does not exist: ${i.path}`)
    const content = readFileSync(i.path, 'utf8')
    const sha = createHash('sha256').update(content).digest('hex')
    const bp = this.blobPath(i.sessionId, sha)
    if (!existsSync(bp)) {
      mkdirSync(path.dirname(bp), { recursive: true })
      writeFileSync(bp, content, 'utf8')
    }
    const bytes = statSync(bp).size
    const info = this.opts.db.prepare(`
      INSERT INTO file_versions (session_id, path, blob_sha, bytes, captured_at, reason)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(i.sessionId, i.path, sha, bytes, new Date().toISOString(), i.reason)
    return { blobSha: sha, blobPath: bp, bytes, rowId: info.lastInsertRowid as number }
  }

  history(sessionId: string, path: string): VersionRow[] {
    const rows = this.opts.db.prepare(`
      SELECT * FROM file_versions WHERE session_id = ? AND path = ? ORDER BY captured_at DESC
    `).all(sessionId, path) as Array<Record<string, unknown>>
    return rows.map(r => ({
      id: r.id as number,
      sessionId: r.session_id as string,
      path: r.path as string,
      blobSha: r.blob_sha as string,
      bytes: r.bytes as number,
      capturedAt: r.captured_at as string,
      reason: r.reason as CaptureReason
    }))
  }

  readBlob(sha: string): string | undefined {
    // Find any session that has this blob (content-addressable across all sessions)
    const dir = this.opts.sessionsRoot
    if (!existsSync(dir)) return undefined
    const fs = require('node:fs') as typeof import('node:fs')
    for (const sid of fs.readdirSync(dir)) {
      const p = path.join(dir, sid, 'snapshots', sha.slice(0, 2), sha)
      if (existsSync(p)) return readFileSync(p, 'utf8')
    }
    return undefined
  }
}
```

- [ ] **Step 3: Run snapshot test**

```bash
pnpm vitest run packages/core/test/unit/snapshot.test.ts
```

Expected: 5 passed.

- [ ] **Step 4: Implement compactor (P6 router caller)**

`packages/core/src/context/compactor.ts`:
```ts
import type { Database } from 'better-sqlite3'
import { ulid } from '@glm/shared'
import type { ContextBlock, CompactedSummary } from '@glm/shared'
import { renderCompactionPrompt, parseCompactedSummary } from './compaction-template'
import { estimateTokens } from './cache-marker'
import { extractTail } from './tail-preserve'
import { pruneAll, type ToolOutput } from './tool-prune'
import { SnapshotStore } from './snapshot'

/**
 * Caller contract: must supply a `routerCall` that talks to P6's LlmRouter.
 * We intentionally don't import LlmRouter directly to avoid a hard P6 dependency
 * — the caller wires it.
 */
export interface RouterCall {
  (req: { model: string; system: string; messages: Array<{ role: string; content: string }>; max_tokens: number }): Promise<{ text: string; tokensIn: number; tokensOut: number }>
}

export interface CompactorOpts {
  db: Database
  snapshots: SnapshotStore
  routerCall: RouterCall
  summarizerModel?: string          // default 'GLM-4.5-Air' (cheap + fast)
}

export interface CompactInput {
  sessionId: string
  history: ContextBlock[]
  toolOutputs: ToolOutput[]
  relevantFiles: string[]
  currentGoal?: string
}

export interface CompactResult {
  summary: CompactedSummary
  tail: ContextBlock[]
  prunedToolOutputCount: number
  snapshotIds: number[]
  tokensIn: number
  tokensOut: number
}

export class Compactor {
  constructor(private opts: CompactorOpts) {}

  async compact(i: CompactInput): Promise<CompactResult> {
    const tailExtract = extractTail(i.history, { preserveTurns: 2, maxTokens: 8000 })

    // Pre-compaction snapshot all relevant files (for audit trail)
    const snapIds: number[] = []
    for (const f of i.relevantFiles) {
      try {
        const r = this.opts.snapshots.capture({ sessionId: i.sessionId, path: f, reason: 'pre-compaction' })
        snapIds.push(r.rowId)
      } catch { /* file may have been deleted — skip */ }
    }

    // Build conversation dump from `compactable` slice
    const conversationDump = tailExtract.compactable
      .map(b => `[${b.role}] ${b.content}`)
      .join('\n\n')

    const prompt = renderCompactionPrompt({
      conversationDump,
      relevantFiles: i.relevantFiles,
      currentGoal: i.currentGoal
    })

    const out = await this.opts.routerCall({
      model: this.opts.summarizerModel ?? 'GLM-4.5-Air',
      system: 'You are a compaction summarizer for a coding agent. Output ONLY the structured Markdown — no preamble.',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 4096
    })

    const summary = parseCompactedSummary(out.text)

    // Prune tool outputs (the result row is what the caller persists)
    const pruned = pruneAll(i.toolOutputs)

    // Persist compaction row
    const compactionId = ulid()
    this.opts.db.prepare(`
      INSERT INTO compactions (id, session_id, ts, trigger, input_tokens, output_tokens, summary, preserved_turns, pruned_tools)
      VALUES (?, ?, ?, 'usable', ?, ?, ?, ?, ?)
    `).run(
      compactionId,
      i.sessionId,
      new Date().toISOString(),
      out.tokensIn,
      out.tokensOut,
      summary.raw,
      countTurns(tailExtract.tail),
      pruned.trimmedCount
    )

    return {
      summary,
      tail: tailExtract.tail,
      prunedToolOutputCount: pruned.trimmedCount,
      snapshotIds: snapIds,
      tokensIn: out.tokensIn,
      tokensOut: out.tokensOut
    }
  }
}

function countTurns(tail: ContextBlock[]): number {
  return tail.filter(b => b.role === 'user' || b.role === 'assistant').length
}
```

- [ ] **Step 5: Add unit test for compactor with mocked router**

`packages/core/test/unit/compactor.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { Database } from 'better-sqlite3'
import { openDb, runMigrations } from '../../src/storage'
import { SessionRepo } from '../../src/storage/session-repo'
import { Compactor } from '../../src/context/compactor'
import { SnapshotStore } from '../../src/context/snapshot'
import type { ContextBlock } from '@glm/shared'

let tmp: string
let db: Database
let sessionId: string

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-comp-'))
  db = openDb(path.join(tmp, 's.db'))
  runMigrations(db)
  const s = new SessionRepo(db).create({ cwd: tmp, worktree: tmp })
  sessionId = s.id
})
afterEach(() => { db.close(); rmSync(tmp, { recursive: true, force: true }) })

describe('Compactor', () => {
  test('returns parsed summary + tail + snapshot ids', async () => {
    const snapshots = new SnapshotStore({ db, sessionsRoot: path.join(tmp, 'sessions') })
    const f = path.join(tmp, 'a.ts'); writeFileSync(f, 'export const x = 1\n')

    const fakeSummary = `
## Goal
make x bigger
## Constraints
no new deps
## Progress
### Done
- read file
### InProgress
- nothing
### Blocked
- nothing
## Key Decisions
- export pattern stays
## Next Steps
1. ship it
## Critical Context
x is a number
## Relevant Files
- a.ts
`
    const compactor = new Compactor({
      db, snapshots,
      routerCall: async () => ({ text: fakeSummary, tokensIn: 100, tokensOut: 200 })
    })

    const history: ContextBlock[] = [
      { role: 'user', content: 'do a thing', source: 'user' },
      { role: 'assistant', content: 'doing it', source: 'assistant' },
      { role: 'user', content: 'last thing', source: 'user' },
      { role: 'assistant', content: 'final answer', source: 'assistant' }
    ]
    const r = await compactor.compact({
      sessionId, history, toolOutputs: [{ tool: 'Bash', content: 'x'.repeat(5000) }],
      relevantFiles: [f], currentGoal: 'make x bigger'
    })
    expect(r.summary.goal).toContain('make x bigger')
    expect(r.tail.length).toBe(2)               // last user+assistant
    expect(r.snapshotIds.length).toBe(1)
    expect(r.prunedToolOutputCount).toBe(1)
    const rows = db.prepare('SELECT * FROM compactions WHERE session_id = ?').all(sessionId)
    expect(rows.length).toBe(1)
  })
})
```

```bash
pnpm vitest run packages/core/test/unit/compactor.test.ts
```

Expected: PASS.

- [ ] **Step 6: Update barrel + commit**

```ts
// packages/core/src/context/index.ts
export * from './cache-marker'
export * from './tail-preserve'
export * from './tool-prune'
export * from './compaction-trigger'
export * from './compaction-template'
export * from './compactor'
export * from './snapshot'
```

```bash
git add packages/core/src/context packages/core/test/unit
git commit -m "feat(context): Compactor (LLM-driven) + SnapshotStore (content-addressable blobs)"
```

---

## Task 16: Differential file display

**Files:**
- Create: `packages/core/src/context/differential-file.ts`
- Test: `packages/core/test/unit/differential-file.test.ts`

- [ ] **Step 1: Failing test**

`packages/core/test/unit/differential-file.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { renderDifferentialFile, DifferentialTracker } from '../../src/context/differential-file'

describe('DifferentialTracker', () => {
  test('first appearance returns full file', () => {
    const t = new DifferentialTracker()
    const r = t.render({ path: 'a.ts', content: 'line1\nline2\n' })
    expect(r.kind).toBe('full')
    expect(r.text).toContain('line1')
  })

  test('second appearance with same content returns "unchanged" marker', () => {
    const t = new DifferentialTracker()
    t.render({ path: 'a.ts', content: 'x\n' })
    const r = t.render({ path: 'a.ts', content: 'x\n' })
    expect(r.kind).toBe('unchanged')
    expect(r.text).toContain('unchanged since')
  })

  test('second appearance with changes returns diff hunks only', () => {
    const t = new DifferentialTracker()
    t.render({ path: 'a.ts', content: 'line1\nline2\nline3\n' })
    const r = t.render({ path: 'a.ts', content: 'line1\nLINE2-modified\nline3\n' })
    expect(r.kind).toBe('diff')
    expect(r.text).toContain('+LINE2-modified')
    expect(r.text).toContain('-line2')
    expect(r.text).not.toContain('line3')   // unchanged context lines may exist but no full reprint
  })
})

describe('renderDifferentialFile', () => {
  test('produces unified diff format', () => {
    const r = renderDifferentialFile('a.ts', 'old\nsame\n', 'new\nsame\n')
    expect(r).toContain('@@')
    expect(r).toContain('-old')
    expect(r).toContain('+new')
  })

  test('reports total +X / -Y in header', () => {
    const r = renderDifferentialFile('a.ts', 'a\nb\nc\n', 'a\nB\nC\nD\n')
    expect(r).toMatch(/\+\d+/)
    expect(r).toMatch(/-\d+/)
  })
})
```

- [ ] **Step 2: Implement**

`packages/core/src/context/differential-file.ts`:
```ts
import { createTwoFilesPatch, diffLines } from 'diff'

export interface FileRender {
  path: string
  content: string
}

export interface DifferentialRender {
  kind: 'full' | 'diff' | 'unchanged'
  text: string
}

/** Per-turn tracker; reset between turns. */
export class DifferentialTracker {
  private lastSeen = new Map<string, string>()

  render(input: FileRender): DifferentialRender {
    const prev = this.lastSeen.get(input.path)
    this.lastSeen.set(input.path, input.content)
    if (prev === undefined) {
      return { kind: 'full', text: `// ${input.path}\n${input.content}` }
    }
    if (prev === input.content) {
      return { kind: 'unchanged', text: `// ${input.path} — unchanged since last reference` }
    }
    return { kind: 'diff', text: renderDifferentialFile(input.path, prev, input.content) }
  }

  reset(): void { this.lastSeen.clear() }
}

export function renderDifferentialFile(filePath: string, before: string, after: string): string {
  // Count +/-
  let plus = 0, minus = 0
  for (const part of diffLines(before, after)) {
    if (part.added) plus += part.count ?? 0
    if (part.removed) minus += part.count ?? 0
  }
  const patch = createTwoFilesPatch(filePath, filePath, before, after, '', '', { context: 1 })
  return `● Edit ${filePath} (+${plus} / -${minus})\n${patch}`
}
```

- [ ] **Step 3: Update barrel**

```ts
// packages/core/src/context/index.ts (append)
export * from './differential-file'
```

- [ ] **Step 4: Run — PASS**

```bash
pnpm vitest run packages/core/test/unit/differential-file.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/context packages/core/test/unit/differential-file.test.ts
git commit -m "feat(context): differential file display (full→diff→unchanged tracker)"
```

---

## Task 17: Context Assembler — the 6-block pipeline

**Files:**
- Create: `packages/core/src/context/assembler.ts`
- Create: `packages/core/src/context/distillation.ts`
- Create: `packages/core/src/context/context-rpc.ts`
- Test: `packages/core/test/unit/assembler.test.ts`

- [ ] **Step 1: Failing test**

`packages/core/test/unit/assembler.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { ContextAssembler } from '../../src/context/assembler'
import type { ContextBlock } from '@glm/shared'

let tmp: string
beforeEach(() => { tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-asm-')) })
afterEach(() => { rmSync(tmp, { recursive: true, force: true }) })

describe('ContextAssembler', () => {
  test('produces 6 blocks in cacheable→volatile order', () => {
    mkdirSync(path.join(tmp, '.glm'), { recursive: true })
    writeFileSync(path.join(tmp, 'AGENTS.md'), '# project rules\n## Memories\n- [m1](.glm/memory/m1.md) — hook')
    mkdirSync(path.join(tmp, '.glm/memory'), { recursive: true })
    writeFileSync(path.join(tmp, '.glm/memory/m1.md'), '---\nname: m1\ndescription: x\nmetadata:\n  type: project\n  created: 2026-05-01\n  last_accessed: 2026-05-01\n  pin: false\n  archived: false\n---\nproject rule')

    const a = new ContextAssembler({
      worktree: tmp,
      home: path.join(tmp, 'home'),
      systemPrompt: 'You are glm-code.',
      skillCatalog: 'skill: foo'
    })
    const history: ContextBlock[] = [
      { role: 'user', content: 'hi', source: 'user' },
      { role: 'assistant', content: 'hello', source: 'assistant' }
    ]
    const r = a.assemble({ history, latestUserMessage: 'do thing' })
    // expect blocks in order: system, skills, cascade+memories, [compacted], tail, latest
    const sources = r.blocks.map(b => b.source)
    expect(sources).toContain('system')
    expect(sources).toContain('cascade')
    expect(sources).toContain('user')
    expect(r.blocks.find(b => b.source === 'system')!.cacheable).toBe(true)
    expect(r.blocks.find(b => b.source === 'cascade')!.cacheable).toBe(true)
    expect(r.blocks.find(b => b.source === 'user')!.cacheable).toBe(false)
  })

  test('budget breakdown reports per-source token estimates', () => {
    const a = new ContextAssembler({
      worktree: tmp,
      home: path.join(tmp, 'home'),
      systemPrompt: 'sys',
      skillCatalog: ''
    })
    const r = a.assemble({ history: [], latestUserMessage: 'msg' })
    expect(r.budget.system).toBeGreaterThan(0)
    expect(r.budget.total).toBe(r.budget.system + r.budget.skills + r.budget.tools + r.budget.agents + r.budget.memories + r.budget.history)
    expect(r.budget.free).toBeGreaterThanOrEqual(0)
  })

  test('compacted summary injected after cascade when present', () => {
    const a = new ContextAssembler({
      worktree: tmp, home: path.join(tmp, 'home'),
      systemPrompt: 'sys', skillCatalog: ''
    })
    const r = a.assemble({
      history: [],
      latestUserMessage: 'go',
      compactedSummary: '## Goal\nfoo'
    })
    const compacted = r.blocks.find(b => b.source === 'compacted')
    expect(compacted).toBeDefined()
    expect(compacted!.content).toContain('## Goal')
    // compacted is NOT cacheable (changes when re-compacted)
    expect(compacted!.cacheable).toBe(false)
  })

  test('notepad block appears after cascade when projectRoot supplied', () => {
    mkdirSync(path.join(tmp, '.glm'), { recursive: true })
    writeFileSync(path.join(tmp, '.glm/notepad.md'), '# Notepad\n\n## Priority\n- IMPORTANT  <!-- ts=2026-05-14T00:00:00Z -->\n\n## Working\n\n## Manual\n')
    const a = new ContextAssembler({
      worktree: tmp, home: path.join(tmp, 'home'),
      systemPrompt: 'sys', skillCatalog: '',
      projectRoot: tmp
    })
    const r = a.assemble({ history: [], latestUserMessage: 'go' })
    const notepad = r.blocks.find(b => b.content.includes('IMPORTANT'))
    expect(notepad).toBeDefined()
  })
})
```

- [ ] **Step 2: Implement assembler**

`packages/core/src/context/assembler.ts`:
```ts
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { ContextBlock, ContextBudget } from '@glm/shared'
import { resolveCascade } from '../memory/cascade'
import { expandImports } from '../memory/imports'
import { estimateTokens } from './cache-marker'
import { NotepadStore } from '../notepad/notepad-store'
import { ProjectMemoryStore } from '../project-memory/project-store'

export interface AssemblerOpts {
  worktree: string
  home: string
  systemPrompt: string
  skillCatalog: string
  toolSchemas?: string              // serialized tool schemas (~10 default)
  extraInstructionGlobs?: string[]
  projectRoot?: string              // for notepad + project-memory pickup
  modelCtx?: number                 // for `free` budget calc (default 200_000)
}

export interface AssembleInput {
  history: ContextBlock[]
  latestUserMessage: string
  compactedSummary?: string         // raw structured Markdown
}

export interface AssembleResult {
  blocks: ContextBlock[]
  budget: ContextBudget
}

export class ContextAssembler {
  constructor(private opts: AssemblerOpts) {}

  assemble(i: AssembleInput): AssembleResult {
    const blocks: ContextBlock[] = []

    // (1) system prompt (cacheable)
    blocks.push({
      role: 'system',
      content: this.opts.systemPrompt,
      cacheable: true,
      source: 'system',
      tokens: estimateTokens(this.opts.systemPrompt)
    })

    // (2) skill catalog (cacheable)
    if (this.opts.skillCatalog) {
      blocks.push({
        role: 'system',
        content: this.opts.skillCatalog,
        cacheable: true,
        source: 'cascade',
        tokens: estimateTokens(this.opts.skillCatalog)
      })
    }

    // (3) AGENTS.md cascade + ## Memories (cacheable)
    const cascade = resolveCascade({
      cwd: i.history.length > 0 ? this.opts.worktree : this.opts.worktree,
      worktree: this.opts.worktree,
      home: this.opts.home,
      extraGlobs: this.opts.extraInstructionGlobs ?? []
    })
    const cascadeText = cascade.paths.map(p => {
      const r = expandImports(p, { maxDepth: 3 })
      return `<!-- from ${p} -->\n${r.text}`
    }).join('\n\n')
    if (cascadeText) {
      blocks.push({
        role: 'system',
        content: cascadeText,
        cacheable: true,
        source: 'cascade',
        tokens: estimateTokens(cascadeText)
      })
    }

    // (3b) Notepad (cacheable — survives compaction)
    if (this.opts.projectRoot) {
      const np = new NotepadStore({ projectRoot: this.opts.projectRoot }).read()
      if (np.includes('- ')) {
        blocks.push({
          role: 'system',
          content: np,
          cacheable: true,
          source: 'memories',
          tokens: estimateTokens(np)
        })
      }
      const pm = new ProjectMemoryStore({ projectRoot: this.opts.projectRoot }).forContext()
      if (pm.includes('- ')) {
        blocks.push({
          role: 'system',
          content: pm,
          cacheable: true,
          source: 'memories',
          tokens: estimateTokens(pm)
        })
      }
    }

    // (4) Compacted summary if present (NOT cacheable — changes per compaction)
    if (i.compactedSummary) {
      blocks.push({
        role: 'system',
        content: i.compactedSummary,
        cacheable: false,
        source: 'compacted',
        tokens: estimateTokens(i.compactedSummary)
      })
    }

    // (5) Conversation tail (volatile)
    for (const h of i.history) {
      blocks.push({ ...h, cacheable: false, tokens: estimateTokens(h.content) })
    }

    // (6) Latest user turn (volatile)
    blocks.push({
      role: 'user',
      content: i.latestUserMessage,
      cacheable: false,
      source: 'user',
      tokens: estimateTokens(i.latestUserMessage)
    })

    // Budget breakdown
    const sum = (source: ContextBlock['source']) =>
      blocks.filter(b => b.source === source).reduce((a, b) => a + (b.tokens ?? 0), 0)
    const total = blocks.reduce((a, b) => a + (b.tokens ?? 0), 0)
    const ctx = this.opts.modelCtx ?? 200_000
    const budget: ContextBudget = {
      system: sum('system'),
      skills: 0,
      tools: estimateTokens(this.opts.toolSchemas ?? ''),
      agents: sum('cascade'),
      memories: sum('memories'),
      history: sum('user') + sum('assistant') + sum('tool'),
      free: Math.max(0, ctx - total),
      total
    }
    // Recompute total as sum of per-source so test invariant holds
    budget.total = budget.system + budget.skills + budget.tools + budget.agents + budget.memories + budget.history

    return { blocks, budget }
  }
}
```

- [ ] **Step 3: Implement distillation (long-horizon)**

`packages/core/src/context/distillation.ts`:
```ts
import type { Database } from 'better-sqlite3'
import { ulid } from '@glm/shared'

export interface DistillationOpts {
  db: Database
  intervalMs?: number               // default 60 minutes
}

export type DistillCall = (sessionId: string) => Promise<{ summary: string; tokens: number }>

/**
 * Periodic long-horizon distillation. Calls `distillCall` (which talks to LLM
 * router) and appends summary to AGENTS.md ## Memories or to project-memory.
 *
 * Returns timer handle that must be `.unref()`d and `.clearInterval()`d on session end.
 */
export class Distiller {
  private timer?: NodeJS.Timeout
  private running = false

  constructor(private opts: DistillationOpts) {}

  start(sessionId: string, fn: DistillCall): void {
    const ms = this.opts.intervalMs ?? 60 * 60 * 1000
    this.timer = setInterval(async () => {
      if (this.running) return
      this.running = true
      try {
        const r = await fn(sessionId)
        this.opts.db.prepare(`
          INSERT INTO distillations (id, session_id, ts, tokens, summary, applied)
          VALUES (?, ?, ?, ?, ?, 0)
        `).run(ulid(), sessionId, new Date().toISOString(), r.tokens, r.summary)
      } catch { /* swallow — distillation is best-effort */ }
      finally { this.running = false }
    }, ms)
    this.timer.unref?.()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
  }
}
```

- [ ] **Step 4: Implement context RPC**

`packages/core/src/context/context-rpc.ts`:
```ts
import { z } from 'zod'
import type { RpcHandler } from '../rpc/protocol'
import { RPC_ERRORS } from '../rpc/protocol'
import { ContextAssembler, type AssemblerOpts } from './assembler'
import type { ContextBlock } from '@glm/shared'

const AssembleParams = z.object({
  worktree: z.string(),
  home: z.string(),
  systemPrompt: z.string(),
  skillCatalog: z.string().default(''),
  projectRoot: z.string().optional(),
  history: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant', 'tool']),
    content: z.string(),
    source: z.string().optional()
  })).default([]),
  latestUserMessage: z.string(),
  compactedSummary: z.string().optional()
})

export function makeContextHandlers(): Record<string, RpcHandler> {
  return {
    'context.assemble': async (p) => {
      const v = AssembleParams.safeParse(p)
      if (!v.success) throw { ...RPC_ERRORS.INVALID_PARAMS, data: v.error.flatten() }
      const opts: AssemblerOpts = {
        worktree: v.data.worktree, home: v.data.home,
        systemPrompt: v.data.systemPrompt, skillCatalog: v.data.skillCatalog,
        projectRoot: v.data.projectRoot
      }
      const r = new ContextAssembler(opts).assemble({
        history: v.data.history as ContextBlock[],
        latestUserMessage: v.data.latestUserMessage,
        compactedSummary: v.data.compactedSummary
      })
      return r
    }
  }
}
```

> **P7-Fix-4 note:** The `/context` and `/compact` slash commands are wired in **P2** (`packages/tui/src/slash/dispatcher.ts`) — P2-Fix-3. P7's job is only to ensure the underlying RPCs exist:
> - `context.assemble` (above)
> - `context.compact` (registered alongside the Compactor in Task 24 — see P7-Fix-3)

- [ ] **Step 5: Update barrel + run**

```ts
// packages/core/src/context/index.ts (append)
export * from './assembler'
export * from './distillation'
export * from './context-rpc'
```

```bash
pnpm vitest run packages/core/test/unit/assembler.test.ts
```

Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/context packages/core/test/unit/assembler.test.ts
git commit -m "feat(context): 6-block ContextAssembler + Distiller + context.assemble RPC"
```

---

## Task 18: Memory CRUD RPC + slash command `/memory` + `glm memory` CLI

**Files:**
- Create: `packages/core/src/memory/memory-rpc.ts`
- Modify: `packages/core/src/memory/index.ts`
- Create: `packages/cli/src/commands/memory.ts`
- Modify: `packages/cli/src/bin.ts`

- [ ] **Step 1: Implement memory RPC**

`packages/core/src/memory/memory-rpc.ts`:
```ts
import { z } from 'zod'
import path from 'node:path'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import type { RpcHandler } from '../rpc/protocol'
import { RPC_ERRORS } from '../rpc/protocol'
import { MemoryStore } from './memory-store'
import { parseMemoriesSection, upsertEntry, removeEntry, writeMemoriesSection } from './memories-section'
import { AutoMemoryWriter } from './auto-writer'
import { enforceIndexCap, enforceFileCountCap, CAPS } from './memory-eviction'

const Scope = z.enum(['project', 'global'])
const RootScope = z.object({ projectRoot: z.string(), globalDir: z.string(), scope: Scope.default('project') })

const ListParams = RootScope
const ShowParams = RootScope.extend({ slug: z.string() })
const PinParams  = RootScope.extend({ slug: z.string(), value: z.boolean() })
const ArchiveParams = RootScope.extend({ slug: z.string() })
const DeleteParams  = RootScope.extend({ slug: z.string() })
const SearchParams  = RootScope.extend({ query: z.string().min(1) })
const WriteParams   = RootScope.extend({
  slug: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
  type: z.enum(['user', 'feedback', 'project', 'reference']),
  description: z.string(),
  body: z.string().min(1)
})
const AutoParams = WriteParams.extend({ qualified: z.boolean() })
const CompactParams = RootScope               // runs cap enforcement + AGENTS.md sync

export function makeMemoryHandlers(): Record<string, RpcHandler> {
  return {
    'memory.list': async (p) => {
      const v = ListParams.safeParse(p)
      if (!v.success) throw { ...RPC_ERRORS.INVALID_PARAMS, data: v.error.flatten() }
      const store = new MemoryStore({ projectRoot: v.data.projectRoot, globalDir: v.data.globalDir })
      return store.list(v.data.scope).map(r => ({
        slug: r.slug, scope: r.scope, type: r.frontmatter.metadata.type,
        description: r.frontmatter.description, pin: r.frontmatter.metadata.pin,
        archived: r.frontmatter.metadata.archived, bytes: r.bytes,
        last_accessed: r.frontmatter.metadata.last_accessed
      }))
    },
    'memory.show': async (p) => {
      const v = ShowParams.safeParse(p)
      if (!v.success) throw { ...RPC_ERRORS.INVALID_PARAMS, data: v.error.flatten() }
      const r = new MemoryStore({ projectRoot: v.data.projectRoot, globalDir: v.data.globalDir }).read(v.data.slug, v.data.scope)
      return r ?? null
    },
    'memory.pin': async (p) => {
      const v = PinParams.safeParse(p)
      if (!v.success) throw { ...RPC_ERRORS.INVALID_PARAMS, data: v.error.flatten() }
      return { ok: new MemoryStore({ projectRoot: v.data.projectRoot, globalDir: v.data.globalDir }).pin(v.data.slug, v.data.scope, v.data.value) }
    },
    'memory.archive': async (p) => {
      const v = ArchiveParams.safeParse(p)
      if (!v.success) throw { ...RPC_ERRORS.INVALID_PARAMS, data: v.error.flatten() }
      return { ok: new MemoryStore({ projectRoot: v.data.projectRoot, globalDir: v.data.globalDir }).archive(v.data.slug, v.data.scope) }
    },
    'memory.delete': async (p) => {
      const v = DeleteParams.safeParse(p)
      if (!v.success) throw { ...RPC_ERRORS.INVALID_PARAMS, data: v.error.flatten() }
      const store = new MemoryStore({ projectRoot: v.data.projectRoot, globalDir: v.data.globalDir })
      const ok = store.delete(v.data.slug, v.data.scope)
      if (ok) await syncIndexAfterDelete(v.data.projectRoot, v.data.slug)
      return { ok }
    },
    'memory.search': async (p) => {
      const v = SearchParams.safeParse(p)
      if (!v.success) throw { ...RPC_ERRORS.INVALID_PARAMS, data: v.error.flatten() }
      return new MemoryStore({ projectRoot: v.data.projectRoot, globalDir: v.data.globalDir })
        .search(v.data.query, v.data.scope)
        .map(r => ({ slug: r.slug, description: r.frontmatter.description, body: r.body }))
    },
    'memory.write': async (p) => {
      const v = WriteParams.safeParse(p)
      if (!v.success) throw { ...RPC_ERRORS.INVALID_PARAMS, data: v.error.flatten() }
      const store = new MemoryStore({ projectRoot: v.data.projectRoot, globalDir: v.data.globalDir })
      const r = store.write({ slug: v.data.slug, scope: v.data.scope, type: v.data.type, description: v.data.description, body: v.data.body })
      await syncIndexAfterWrite(v.data.projectRoot, r.slug, v.data.description)
      return { slug: r.slug, bytes: r.bytes }
    },
    'memory.autoWrite': async (p) => {
      const v = AutoParams.safeParse(p)
      if (!v.success) throw { ...RPC_ERRORS.INVALID_PARAMS, data: v.error.flatten() }
      const store = new MemoryStore({ projectRoot: v.data.projectRoot, globalDir: v.data.globalDir })
      const writer = new AutoMemoryWriter({ store })
      const r = await writer.maybeWrite({
        qualified: v.data.qualified, slug: v.data.slug, type: v.data.type,
        description: v.data.description, body: v.data.body, scope: v.data.scope
      })
      if (r.action === 'written' || r.action === 'updated') {
        await syncIndexAfterWrite(v.data.projectRoot, r.slug, v.data.description)
      }
      return r
    },
    'memory.compact': async (p) => {
      const v = CompactParams.safeParse(p)
      if (!v.success) throw { ...RPC_ERRORS.INVALID_PARAMS, data: v.error.flatten() }
      const store = new MemoryStore({ projectRoot: v.data.projectRoot, globalDir: v.data.globalDir })
      const records = store.list(v.data.scope)
      const agentsMd = path.join(v.data.projectRoot, 'AGENTS.md')
      const doc = parseMemoriesSection(existsSync(agentsMd) ? readFileSync(agentsMd, 'utf8') : '# AGENTS.md\n')
      const indexResult = enforceIndexCap({ entries: doc.entries, records, lineCount: doc.lineCount, byteSize: doc.byteSize })
      const fileResult = enforceFileCountCap(records, CAPS.memoryDir.maxFiles)
      // Archive evicted index entries (keep file but mark archived) — see spec 8.3
      for (const e of indexResult.evicted) {
        removeEntry(doc, e.name)
        store.archive(e.name, v.data.scope)
      }
      // Delete files evicted by file-count cap
      for (const r of fileResult.evicted) store.delete(r.slug, r.scope)
      writeFileSync(agentsMd, writeMemoriesSection(doc), 'utf8')
      return {
        evictedIndex: indexResult.evicted.map(e => e.name),
        evictedFiles: fileResult.evicted.map(r => r.slug)
      }
    }
  }
}

async function syncIndexAfterWrite(projectRoot: string, slug: string, hook: string): Promise<void> {
  const agentsMd = path.join(projectRoot, 'AGENTS.md')
  const raw = existsSync(agentsMd) ? readFileSync(agentsMd, 'utf8') : '# AGENTS.md\n'
  const doc = parseMemoriesSection(raw)
  upsertEntry(doc, { name: slug, bodyPath: `.glm/memory/${slug}.md`, hook })
  writeFileSync(agentsMd, writeMemoriesSection(doc), 'utf8')
}

async function syncIndexAfterDelete(projectRoot: string, slug: string): Promise<void> {
  const agentsMd = path.join(projectRoot, 'AGENTS.md')
  if (!existsSync(agentsMd)) return
  const doc = parseMemoriesSection(readFileSync(agentsMd, 'utf8'))
  if (removeEntry(doc, slug)) writeFileSync(agentsMd, writeMemoriesSection(doc), 'utf8')
}
```

- [ ] **Step 2: Re-export**

```ts
// packages/core/src/memory/index.ts (append)
export * from './memory-rpc'
```

- [ ] **Step 3: Build CLI command**

`packages/cli/src/commands/memory.ts`:
```ts
import { Command } from 'commander'
import kleur from 'kleur'
import path from 'node:path'
import os from 'node:os'
import { ensureDaemonRunning } from '../auto-spawn'
import { RpcClient } from '../rpc-client'

interface MemoryListItem {
  slug: string; type: string; description: string; pin: boolean; archived: boolean; bytes: number
}

export function registerMemoryCommand(program: Command): void {
  const mem = program.command('memory').description('Manage memories (## Memories index + bodies)')

  const projectRoot = () => process.cwd()
  const globalDir = () => path.join(os.homedir(), '.glm', 'memory')

  async function rpc<T = unknown>(method: string, params: object): Promise<T> {
    await ensureDaemonRunning()
    const cli = new RpcClient(); await cli.connect()
    try { return await cli.call<T>(method, params) } finally { cli.close() }
  }

  mem.command('list')
    .option('--scope <s>', 'project | global', 'project')
    .action(async (opts: { scope: 'project' | 'global' }) => {
      const rows = await rpc<MemoryListItem[]>('memory.list', { projectRoot: projectRoot(), globalDir: globalDir(), scope: opts.scope })
      if (!rows.length) { console.log(kleur.gray('(no memories)')); return }
      for (const r of rows) {
        const flag = r.pin ? kleur.yellow('📌') : (r.archived ? kleur.gray('🗄') : kleur.green('●'))
        console.log(`${flag} ${r.slug.padEnd(28)} ${kleur.dim(r.type.padEnd(10))} ${r.description}`)
      }
    })

  mem.command('show <slug>')
    .option('--scope <s>', 'project | global', 'project')
    .action(async (slug: string, opts: { scope: 'project' | 'global' }) => {
      const r = await rpc<{ body?: string; frontmatter?: unknown } | null>('memory.show', { projectRoot: projectRoot(), globalDir: globalDir(), scope: opts.scope, slug })
      if (!r) { console.error(kleur.red('not found')); process.exit(2) }
      console.log(JSON.stringify(r.frontmatter, null, 2))
      console.log()
      console.log(r.body)
    })

  mem.command('pin <slug>').option('--scope <s>', 'project | global', 'project')
    .action(async (slug: string, opts: { scope: 'project' | 'global' }) => {
      await rpc('memory.pin', { projectRoot: projectRoot(), globalDir: globalDir(), scope: opts.scope, slug, value: true })
      console.log(kleur.green('✓') + ` pinned ${slug}`)
    })

  mem.command('unpin <slug>').option('--scope <s>', 'project | global', 'project')
    .action(async (slug: string, opts: { scope: 'project' | 'global' }) => {
      await rpc('memory.pin', { projectRoot: projectRoot(), globalDir: globalDir(), scope: opts.scope, slug, value: false })
      console.log(kleur.green('✓') + ` unpinned ${slug}`)
    })

  mem.command('archive <slug>').option('--scope <s>', 'project | global', 'project')
    .action(async (slug: string, opts: { scope: 'project' | 'global' }) => {
      await rpc('memory.archive', { projectRoot: projectRoot(), globalDir: globalDir(), scope: opts.scope, slug })
      console.log(kleur.green('✓') + ` archived ${slug}`)
    })

  mem.command('delete <slug>').option('--scope <s>', 'project | global', 'project')
    .action(async (slug: string, opts: { scope: 'project' | 'global' }) => {
      await rpc('memory.delete', { projectRoot: projectRoot(), globalDir: globalDir(), scope: opts.scope, slug })
      console.log(kleur.green('✓') + ` deleted ${slug}`)
    })

  mem.command('search <query>').option('--scope <s>', 'project | global', 'project')
    .action(async (query: string, opts: { scope: 'project' | 'global' }) => {
      const hits = await rpc<Array<{ slug: string; description: string }>>('memory.search', { projectRoot: projectRoot(), globalDir: globalDir(), scope: opts.scope, query })
      for (const h of hits) console.log(`${kleur.cyan(h.slug)}  ${kleur.dim(h.description)}`)
      if (!hits.length) console.log(kleur.gray('(no matches)'))
    })

  mem.command('compact').option('--scope <s>', 'project | global', 'project')
    .description('Apply caps + archive low-score entries')
    .action(async (opts: { scope: 'project' | 'global' }) => {
      const r = await rpc<{ evictedIndex: string[]; evictedFiles: string[] }>('memory.compact', { projectRoot: projectRoot(), globalDir: globalDir(), scope: opts.scope })
      console.log(`${kleur.green('✓')} index evictions: ${r.evictedIndex.length}, file deletions: ${r.evictedFiles.length}`)
      if (r.evictedIndex.length) console.log(kleur.dim('  ' + r.evictedIndex.join(', ')))
    })
}
```

- [ ] **Step 4: Wire CLI command**

Modify `packages/cli/src/bin.ts` — add:
```ts
import { registerMemoryCommand } from './commands/memory'
// ... later ...
registerMemoryCommand(program)
```

- [ ] **Step 5: Build + smoke**

```bash
pnpm build
export GLM_HOME=/tmp/glm-mem-$$
mkdir -p $GLM_HOME
cd /tmp && mkdir -p mem-test && cd mem-test
node $OLDPWD/packages/cli/dist/bin.js daemon start
node $OLDPWD/packages/cli/dist/bin.js memory list
node $OLDPWD/packages/cli/dist/bin.js daemon stop
```

Expected: list reports `(no memories)`, no errors.

- [ ] **Step 6: Commit**

```bash
git add packages
git commit -m "feat(memory): /memory CRUD RPC + glm memory CLI (list/show/pin/archive/delete/search/compact)"
```

---

## Task 19: LSP language registry + root markers

**Files:**
- Create: `packages/core/src/lsp/language-registry.ts`
- Create: `packages/core/src/lsp/root-markers.ts`
- Create: `packages/core/src/lsp/index.ts`
- Test: `packages/core/test/unit/language-registry.test.ts`
- Test: `packages/core/test/unit/root-markers.test.ts`

- [ ] **Step 1: Failing test for language registry**

`packages/core/test/unit/language-registry.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { LANGUAGE_REGISTRY, languageForFile, serverSpecForFile, registerCustomServer } from '../../src/lsp/language-registry'

describe('language-registry', () => {
  test('TypeScript ext → typescript-language-server', () => {
    const lang = languageForFile('src/foo.ts')
    expect(lang).toBe('typescript')
    expect(serverSpecForFile('foo.ts')!.command).toBe('typescript-language-server')
  })

  test('Python ext → pyright', () => {
    expect(languageForFile('a.py')).toBe('python')
    expect(serverSpecForFile('a.py')!.command).toBe('pyright-langserver')
  })

  test('Go → gopls', () => { expect(serverSpecForFile('a.go')!.command).toBe('gopls') })
  test('Rust → rust-analyzer', () => { expect(serverSpecForFile('a.rs')!.command).toBe('rust-analyzer') })
  test('C → clangd', () => { expect(serverSpecForFile('a.c')!.command).toBe('clangd') })
  test('C++ → clangd', () => { expect(serverSpecForFile('a.cpp')!.command).toBe('clangd') })
  test('Java → jdtls', () => { expect(serverSpecForFile('a.java')!.command).toBe('jdtls') })

  test('Unknown extension → undefined', () => {
    expect(serverSpecForFile('mystery.zzz')).toBeUndefined()
  })

  test('registerCustomServer adds entry (order: custom first wins)', () => {
    registerCustomServer({
      language: 'fictional', command: 'custom-lsp', args: ['--stdio'],
      extensions: ['.fic'], rootMarkers: ['fic.toml']
    })
    expect(serverSpecForFile('a.fic')!.command).toBe('custom-lsp')
  })

  test('LANGUAGE_REGISTRY covers >= 8 languages', () => {
    const langs = new Set(LANGUAGE_REGISTRY.map(s => s.language))
    expect(langs.size).toBeGreaterThanOrEqual(8)
  })
})
```

- [ ] **Step 2: Implement registry**

`packages/core/src/lsp/language-registry.ts`:
```ts
import path from 'node:path'
import type { LspServerSpec } from '@glm/shared'

const BUILTIN: LspServerSpec[] = [
  {
    language: 'typescript', command: 'typescript-language-server', args: ['--stdio'],
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts'],
    rootMarkers: ['package.json', 'tsconfig.json', 'jsconfig.json']
  },
  {
    language: 'python', command: 'pyright-langserver', args: ['--stdio'],
    extensions: ['.py', '.pyi'],
    rootMarkers: ['pyproject.toml', 'setup.py', 'requirements.txt', 'Pipfile']
  },
  {
    language: 'go', command: 'gopls', args: [],
    extensions: ['.go'],
    rootMarkers: ['go.mod', 'go.work']
  },
  {
    language: 'rust', command: 'rust-analyzer', args: [],
    extensions: ['.rs'],
    rootMarkers: ['Cargo.toml', 'Cargo.lock']
  },
  {
    language: 'cpp', command: 'clangd', args: [],
    extensions: ['.c', '.cc', '.cpp', '.cxx', '.h', '.hh', '.hpp', '.hxx'],
    rootMarkers: ['compile_commands.json', 'CMakeLists.txt', 'Makefile']
  },
  {
    language: 'java', command: 'jdtls', args: [],
    extensions: ['.java'],
    rootMarkers: ['pom.xml', 'build.gradle', 'build.gradle.kts']
  },
  {
    language: 'ruby', command: 'ruby-lsp', args: [],
    extensions: ['.rb', '.rake'],
    rootMarkers: ['Gemfile', '.ruby-version']
  },
  {
    language: 'lua', command: 'lua-language-server', args: [],
    extensions: ['.lua'],
    rootMarkers: ['.luarc.json', 'init.lua']
  },
  {
    language: 'zig', command: 'zls', args: [],
    extensions: ['.zig'],
    rootMarkers: ['build.zig']
  },
  {
    language: 'csharp', command: 'omnisharp', args: ['-lsp'],
    extensions: ['.cs'],
    rootMarkers: ['*.csproj', '*.sln']
  },
  {
    language: 'markdown', command: 'markdown-oxide', args: [],
    extensions: ['.md', '.markdown'],
    rootMarkers: ['.git']
  },
  {
    language: 'yaml', command: 'yaml-language-server', args: ['--stdio'],
    extensions: ['.yaml', '.yml'],
    rootMarkers: ['.git']
  }
]

const CUSTOM: LspServerSpec[] = []

export const LANGUAGE_REGISTRY = BUILTIN

export function registerCustomServer(spec: LspServerSpec): void { CUSTOM.unshift(spec) }

export function languageForFile(filepath: string): string | undefined {
  return serverSpecForFile(filepath)?.language
}

export function serverSpecForFile(filepath: string): LspServerSpec | undefined {
  const ext = path.extname(filepath).toLowerCase()
  if (!ext) return undefined
  // Custom take precedence
  for (const s of CUSTOM) if (s.extensions.includes(ext)) return s
  for (const s of BUILTIN) if (s.extensions.includes(ext)) return s
  return undefined
}

export function serverSpecForLanguage(language: string): LspServerSpec | undefined {
  for (const s of CUSTOM) if (s.language === language) return s
  for (const s of BUILTIN) if (s.language === language) return s
  return undefined
}
```

- [ ] **Step 3: Failing root-markers test**

`packages/core/test/unit/root-markers.test.ts`:
```ts
import { afterEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { findRoot } from '../../src/lsp/root-markers'

let tmp: string
afterEach(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }) })

describe('findRoot', () => {
  test('walks up until a marker is found', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-rm-'))
    mkdirSync(path.join(tmp, 'a/b/c'), { recursive: true })
    writeFileSync(path.join(tmp, 'a/package.json'), '{}')
    const r = findRoot(path.join(tmp, 'a/b/c/x.ts'), ['package.json'])
    expect(r).toBe(path.join(tmp, 'a'))
  })

  test('returns file dir if no marker found and bound = worktree', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-rm-'))
    mkdirSync(path.join(tmp, 'a/b'), { recursive: true })
    const r = findRoot(path.join(tmp, 'a/b/x.ts'), ['package.json'], { worktree: tmp })
    expect(r).toBe(tmp)
  })

  test('honors multiple markers (first match wins per dir)', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-rm-'))
    mkdirSync(path.join(tmp, 'a/b'), { recursive: true })
    writeFileSync(path.join(tmp, 'a/tsconfig.json'), '{}')
    const r = findRoot(path.join(tmp, 'a/b/x.ts'), ['package.json', 'tsconfig.json'])
    expect(r).toBe(path.join(tmp, 'a'))
  })

  test('glob marker (*.csproj) matches by extension', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-rm-'))
    mkdirSync(path.join(tmp, 'a/b'), { recursive: true })
    writeFileSync(path.join(tmp, 'a/Foo.csproj'), '<Project/>')
    const r = findRoot(path.join(tmp, 'a/b/x.cs'), ['*.csproj'])
    expect(r).toBe(path.join(tmp, 'a'))
  })
})
```

- [ ] **Step 4: Implement root markers**

`packages/core/src/lsp/root-markers.ts`:
```ts
import { existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

export interface FindRootOpts {
  worktree?: string
}

export function findRoot(filepath: string, markers: string[], opts: FindRootOpts = {}): string {
  const boundary = opts.worktree ? path.resolve(opts.worktree) : path.parse(filepath).root
  let dir = path.dirname(path.resolve(filepath))
  while (true) {
    if (matchesAny(dir, markers)) return dir
    if (dir === boundary) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return dir
    dir = parent
  }
}

function matchesAny(dir: string, markers: string[]): boolean {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return false
  for (const m of markers) {
    if (m.startsWith('*')) {
      const ext = m.slice(1)
      try {
        for (const f of readdirSync(dir)) if (f.endsWith(ext)) return true
      } catch { /* unreadable */ }
    } else {
      if (existsSync(path.join(dir, m))) return true
    }
  }
  return false
}
```

- [ ] **Step 5: Barrel + run**

`packages/core/src/lsp/index.ts`:
```ts
export * from './language-registry'
export * from './root-markers'
```

```bash
pnpm vitest run packages/core/test/unit/language-registry.test.ts packages/core/test/unit/root-markers.test.ts
```

Expected: 11 + 4 = 15 passed.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/lsp packages/core/test/unit
git commit -m "feat(lsp): language registry (12 builtins + custom) + root-marker walk-up"
```

---

## Task 20: LSP client (vscode-jsonrpc wrapper)

**Files:**
- Create: `packages/core/src/lsp/lsp-client.ts`
- Test: `packages/core/test/unit/lsp-client.test.ts`

- [ ] **Step 1: Implement LSP client (transport wrapper)**

`packages/core/src/lsp/lsp-client.ts`:
```ts
import { spawn, type ChildProcess } from 'node:child_process'
import * as rpc from 'vscode-jsonrpc/node'
import {
  InitializeRequest, InitializedNotification,
  ShutdownRequest, ExitNotification,
  DidOpenTextDocumentNotification, DidCloseTextDocumentNotification,
  DidChangeTextDocumentNotification, PublishDiagnosticsNotification,
  DefinitionRequest, ReferencesRequest, HoverRequest, RenameRequest,
  DocumentSymbolRequest, WorkspaceSymbolRequest,
  CodeActionRequest, CodeActionResolveRequest, PrepareRenameRequest,
  type InitializeParams, type Diagnostic, type Location, type Hover,
  type WorkspaceEdit, type DocumentSymbol, type SymbolInformation,
  type CodeAction, type Range
} from 'vscode-languageserver-protocol'
import type { LspServerSpec } from '@glm/shared'
import type { Logger } from '../log'

export interface LspClientOpts {
  spec: LspServerSpec
  rootUri: string                   // file://...
  log: Logger
}

export class LspClient {
  private proc?: ChildProcess
  private conn?: rpc.MessageConnection
  private diagnostics = new Map<string, Diagnostic[]>()         // uri → diags
  private opened = new Set<string>()
  readonly spec: LspServerSpec
  readonly rootUri: string
  lastUsedAt = Date.now()
  private starting?: Promise<void>

  constructor(opts: LspClientOpts) {
    this.spec = opts.spec
    this.rootUri = opts.rootUri
    this.log = opts.log
  }

  private log: Logger

  async start(): Promise<void> {
    if (this.starting) return this.starting
    this.starting = this._start()
    return this.starting
  }

  private async _start(): Promise<void> {
    this.proc = spawn(this.spec.command, this.spec.args, { stdio: 'pipe' })
    this.proc.on('error', (e) => this.log.error({ err: e, cmd: this.spec.command }, 'lsp spawn error'))
    this.proc.on('exit', (code) => this.log.info({ code, cmd: this.spec.command }, 'lsp exited'))
    this.conn = rpc.createMessageConnection(
      new rpc.StreamMessageReader(this.proc.stdout!),
      new rpc.StreamMessageWriter(this.proc.stdin!)
    )
    this.conn.onNotification(PublishDiagnosticsNotification.type, (p) => {
      this.diagnostics.set(p.uri, p.diagnostics)
    })
    this.conn.listen()

    const init: InitializeParams = {
      processId: process.pid,
      rootUri: this.rootUri,
      capabilities: {
        textDocument: {
          synchronization: { didSave: true, willSave: false, dynamicRegistration: false },
          completion: { dynamicRegistration: false },
          hover: { dynamicRegistration: false },
          definition: { dynamicRegistration: false },
          references: { dynamicRegistration: false },
          documentSymbol: { dynamicRegistration: false, hierarchicalDocumentSymbolSupport: true },
          codeAction: { dynamicRegistration: false, resolveSupport: { properties: ['edit'] } },
          rename: { dynamicRegistration: false, prepareSupport: true },
          publishDiagnostics: { relatedInformation: true }
        },
        workspace: {
          symbol: { dynamicRegistration: false }
        }
      },
      workspaceFolders: [{ uri: this.rootUri, name: 'root' }],
      initializationOptions: this.spec.initOpts ?? {}
    }
    await this.conn.sendRequest(InitializeRequest.type, init)
    this.conn.sendNotification(InitializedNotification.type, {})
  }

  async stop(): Promise<void> {
    if (!this.conn) return
    try { await this.conn.sendRequest(ShutdownRequest.type) } catch { /* ignore */ }
    try { this.conn.sendNotification(ExitNotification.type) } catch { /* ignore */ }
    this.conn.dispose()
    this.proc?.kill('SIGTERM')
    this.conn = undefined
    this.proc = undefined
  }

  private async ensure(): Promise<rpc.MessageConnection> {
    if (!this.conn) await this.start()
    this.lastUsedAt = Date.now()
    return this.conn!
  }

  async didOpen(uri: string, languageId: string, text: string): Promise<void> {
    if (this.opened.has(uri)) return
    const c = await this.ensure()
    c.sendNotification(DidOpenTextDocumentNotification.type, {
      textDocument: { uri, languageId, version: 1, text }
    })
    this.opened.add(uri)
  }

  async didChange(uri: string, version: number, newText: string): Promise<void> {
    const c = await this.ensure()
    c.sendNotification(DidChangeTextDocumentNotification.type, {
      textDocument: { uri, version },
      contentChanges: [{ text: newText }]
    })
  }

  async didClose(uri: string): Promise<void> {
    if (!this.opened.has(uri)) return
    const c = await this.ensure()
    c.sendNotification(DidCloseTextDocumentNotification.type, { textDocument: { uri } })
    this.opened.delete(uri)
  }

  /** Returns the latest published diagnostics for a uri. May be empty if server has not yet emitted. */
  getDiagnostics(uri: string): Diagnostic[] { return this.diagnostics.get(uri) ?? [] }

  async definition(uri: string, line: number, character: number): Promise<Location | Location[] | null | undefined> {
    const c = await this.ensure()
    return c.sendRequest(DefinitionRequest.type, { textDocument: { uri }, position: { line, character } })
  }

  async references(uri: string, line: number, character: number, includeDeclaration = true): Promise<Location[] | null | undefined> {
    const c = await this.ensure()
    return c.sendRequest(ReferencesRequest.type, {
      textDocument: { uri }, position: { line, character },
      context: { includeDeclaration }
    })
  }

  async hover(uri: string, line: number, character: number): Promise<Hover | null | undefined> {
    const c = await this.ensure()
    return c.sendRequest(HoverRequest.type, { textDocument: { uri }, position: { line, character } })
  }

  async rename(uri: string, line: number, character: number, newName: string): Promise<WorkspaceEdit | null | undefined> {
    const c = await this.ensure()
    return c.sendRequest(RenameRequest.type, { textDocument: { uri }, position: { line, character }, newName })
  }

  async prepareRename(uri: string, line: number, character: number): Promise<Range | { range: Range; placeholder: string } | null | undefined> {
    const c = await this.ensure()
    return c.sendRequest(PrepareRenameRequest.type, { textDocument: { uri }, position: { line, character } }) as any
  }

  async documentSymbols(uri: string): Promise<DocumentSymbol[] | SymbolInformation[] | null | undefined> {
    const c = await this.ensure()
    return c.sendRequest(DocumentSymbolRequest.type, { textDocument: { uri } })
  }

  async workspaceSymbols(query: string): Promise<SymbolInformation[] | null | undefined> {
    const c = await this.ensure()
    return c.sendRequest(WorkspaceSymbolRequest.type, { query })
  }

  async codeActions(uri: string, range: Range): Promise<(CodeAction | null)[] | null | undefined> {
    const c = await this.ensure()
    return c.sendRequest(CodeActionRequest.type, {
      textDocument: { uri }, range, context: { diagnostics: this.getDiagnostics(uri) }
    }) as any
  }

  async codeActionResolve(action: CodeAction): Promise<CodeAction> {
    const c = await this.ensure()
    return c.sendRequest(CodeActionResolveRequest.type, action) as any
  }
}
```

- [ ] **Step 2: Failing test (mock-based)**

`packages/core/test/unit/lsp-client.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { LspClient } from '../../src/lsp/lsp-client'
import { createLogger } from '../../src/log'

describe('LspClient', () => {
  test('stop() before start() does not throw', async () => {
    const c = new LspClient({
      spec: { language: 'noop', command: '/bin/true', args: [], extensions: ['.x'], rootMarkers: [] },
      rootUri: 'file:///tmp', log: createLogger('test')
    })
    await c.stop()                          // must be safe
    expect(true).toBe(true)
  })

  test('getDiagnostics returns [] when nothing published', async () => {
    const c = new LspClient({
      spec: { language: 'noop', command: '/bin/true', args: [], extensions: ['.x'], rootMarkers: [] },
      rootUri: 'file:///tmp', log: createLogger('test')
    })
    expect(c.getDiagnostics('file:///tmp/x.x')).toEqual([])
  })

  test('lastUsedAt is set on construction', () => {
    const c = new LspClient({
      spec: { language: 'noop', command: '/bin/true', args: [], extensions: ['.x'], rootMarkers: [] },
      rootUri: 'file:///tmp', log: createLogger('test')
    })
    expect(c.lastUsedAt).toBeLessThanOrEqual(Date.now())
  })
})
```

Note: a full integration test with a real `typescript-language-server` lives in Task 24.

- [ ] **Step 3: Run unit**

```bash
pnpm vitest run packages/core/test/unit/lsp-client.test.ts
```

Expected: 3 passed.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/lsp/lsp-client.ts packages/core/test/unit/lsp-client.test.ts
git commit -m "feat(lsp): LspClient wrapping vscode-jsonrpc with init/shutdown + 8 request methods"
```

---

## Task 21: LSP host (auto-spawn, idle shutdown, registry)

**Files:**
- Create: `packages/core/src/lsp/lsp-host.ts`
- Test: included in integration tests later (mocked here is too brittle)

- [ ] **Step 1: Implement LSP host**

`packages/core/src/lsp/lsp-host.ts`:
```ts
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { existsSync, readFileSync } from 'node:fs'
import { LspClient } from './lsp-client'
import { serverSpecForFile, serverSpecForLanguage } from './language-registry'
import { findRoot } from './root-markers'
import type { LspServerSpec } from '@glm/shared'
import type { Logger } from '../log'

export interface LspHostOpts {
  log: Logger
  worktree: string
  idleShutdownMs?: number           // default 30 min
}

interface ClientEntry {
  client: LspClient
  rootUri: string
}

export class LspHost {
  private clients = new Map<string, ClientEntry>()   // key = `${language}|${rootUri}`
  private idleTimer?: NodeJS.Timeout
  private idleMs: number
  private log: Logger
  private worktree: string

  constructor(opts: LspHostOpts) {
    this.log = opts.log
    this.worktree = opts.worktree
    this.idleMs = opts.idleShutdownMs ?? 30 * 60 * 1000
    this.startIdleSweep()
  }

  async stopAll(): Promise<void> {
    if (this.idleTimer) clearInterval(this.idleTimer)
    for (const e of this.clients.values()) await e.client.stop()
    this.clients.clear()
  }

  /**
   * Get-or-spawn a client for the file. Returns undefined if no registered
   * language for the file's extension (caller must handle gracefully).
   */
  async clientForFile(filepath: string): Promise<LspClient | undefined> {
    const spec = serverSpecForFile(filepath)
    if (!spec) return undefined
    return this.clientFor(spec, filepath)
  }

  async clientForLanguage(language: string, hintPath?: string): Promise<LspClient | undefined> {
    const spec = serverSpecForLanguage(language)
    if (!spec) return undefined
    return this.clientFor(spec, hintPath ?? this.worktree)
  }

  private async clientFor(spec: LspServerSpec, hint: string): Promise<LspClient> {
    const root = findRoot(hint, spec.rootMarkers, { worktree: this.worktree })
    const rootUri = pathToFileURL(root).toString()
    const key = `${spec.language}|${rootUri}`
    let e = this.clients.get(key)
    if (e) {
      e.client.lastUsedAt = Date.now()
      return e.client
    }
    const client = new LspClient({ spec, rootUri, log: this.log })
    await client.start()
    e = { client, rootUri }
    this.clients.set(key, e)
    this.log.info({ language: spec.language, root, command: spec.command }, 'lsp spawned')
    return client
  }

  /** Open `filepath` in its language server (idempotent). */
  async didOpen(filepath: string): Promise<void> {
    const client = await this.clientForFile(filepath)
    if (!client) return
    const uri = pathToFileURL(filepath).toString()
    const text = existsSync(filepath) ? readFileSync(filepath, 'utf8') : ''
    await client.didOpen(uri, client.spec.language, text)
  }

  /** Used by post-edit hook to push fresh content into LSP. */
  async didChange(filepath: string, version: number, newText: string): Promise<void> {
    const client = await this.clientForFile(filepath)
    if (!client) return
    const uri = pathToFileURL(filepath).toString()
    if (!await this.openIfMissing(client, uri, newText)) {
      await client.didChange(uri, version, newText)
    }
  }

  private async openIfMissing(c: LspClient, uri: string, text: string): Promise<boolean> {
    // Use didOpen as a fallback when server didn't see the file yet
    try { await c.didOpen(uri, c.spec.language, text); return true } catch { return false }
  }

  /** Return list of running servers for `lsp_servers` tool. */
  list(): Array<{ language: string; command: string; rootUri: string; lastUsedMs: number }> {
    const now = Date.now()
    return Array.from(this.clients.values()).map(e => ({
      language: e.client.spec.language,
      command: e.client.spec.command,
      rootUri: e.rootUri,
      lastUsedMs: now - e.client.lastUsedAt
    }))
  }

  private startIdleSweep(): void {
    this.idleTimer = setInterval(() => {
      const now = Date.now()
      for (const [key, e] of this.clients.entries()) {
        if (now - e.client.lastUsedAt > this.idleMs) {
          this.log.info({ key }, 'idle-shutdown lsp')
          e.client.stop().catch(() => {})
          this.clients.delete(key)
        }
      }
    }, Math.min(this.idleMs / 4, 60_000))
    this.idleTimer.unref?.()
  }
}
```

- [ ] **Step 2: Re-export**

```ts
// packages/core/src/lsp/index.ts (append)
export * from './lsp-client'
export * from './lsp-host'
```

- [ ] **Step 3: Build (no test yet — host is exercised in integration)**

```bash
pnpm build
```

Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/lsp
git commit -m "feat(lsp): LspHost — get-or-spawn per (language, root), 30-min idle shutdown"
```

---

## Task 22: Position resolver (cclsp-style symbol locator)

**Files:**
- Create: `packages/core/src/lsp/position-resolver.ts`
- Test: `packages/core/test/unit/position-resolver.test.ts`

- [ ] **Step 1: Failing test**

`packages/core/test/unit/position-resolver.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import type { SymbolInformation, DocumentSymbol } from 'vscode-languageserver-protocol'
import { rankCandidates, mergeAndRank } from '../../src/lsp/position-resolver'

const range = (line: number) => ({ start: { line, character: 0 }, end: { line, character: 1 } })

describe('rankCandidates', () => {
  test('exact name match scores higher than partial', () => {
    const a = { name: 'foo', kind: 12, location: { uri: 'u', range: range(10) } } as SymbolInformation
    const b = { name: 'fooBar', kind: 12, location: { uri: 'u', range: range(10) } } as SymbolInformation
    const r = rankCandidates([a, b], { name: 'foo', hintLine: 10 })
    expect(r[0]!.symbol.name).toBe('foo')
  })

  test('closer to hint line ranks higher', () => {
    const a = { name: 'foo', kind: 12, location: { uri: 'u', range: range(100) } } as SymbolInformation
    const b = { name: 'foo', kind: 12, location: { uri: 'u', range: range(12) } } as SymbolInformation
    const r = rankCandidates([a, b], { name: 'foo', hintLine: 10 })
    expect(r[0]!.symbol.location.range.start.line).toBe(12)
  })

  test('mergeAndRank dedupes by uri+range', () => {
    const s: SymbolInformation = { name: 'x', kind: 12, location: { uri: 'u', range: range(5) } }
    const r = mergeAndRank([s, s, s], { name: 'x' })
    expect(r.length).toBe(1)
  })
})
```

- [ ] **Step 2: Implement resolver**

`packages/core/src/lsp/position-resolver.ts`:
```ts
import type { SymbolInformation, DocumentSymbol, Position, Range } from 'vscode-languageserver-protocol'
import { pathToFileURL } from 'node:url'
import type { LspHost } from './lsp-host'

export interface FindSymbolOpts {
  name: string
  hintLine?: number
  hintUri?: string
}

export interface Candidate {
  symbol: SymbolInformation
  score: number
}

export function rankCandidates(symbols: SymbolInformation[], opts: FindSymbolOpts): Candidate[] {
  const out: Candidate[] = []
  for (const s of symbols) {
    let score = 0
    if (s.name === opts.name) score += 10
    else if (s.name.includes(opts.name)) score += 3
    if (opts.hintUri && s.location.uri === opts.hintUri) score += 5
    if (opts.hintLine !== undefined) {
      const dist = Math.abs(s.location.range.start.line - opts.hintLine)
      score += Math.max(0, 5 - dist / 10)
    }
    out.push({ symbol: s, score })
  }
  return out.sort((a, b) => b.score - a.score)
}

export function mergeAndRank(symbols: SymbolInformation[], opts: FindSymbolOpts): SymbolInformation[] {
  const seen = new Set<string>()
  const merged: SymbolInformation[] = []
  for (const s of symbols) {
    const k = `${s.location.uri}|${s.location.range.start.line}|${s.location.range.start.character}|${s.name}`
    if (seen.has(k)) continue
    seen.add(k)
    merged.push(s)
  }
  return rankCandidates(merged, opts).map(c => c.symbol)
}

export interface FindSymbolInput {
  filepath: string
  name: string
  hintLine?: number
}

/**
 * cclsp heuristic: collect from hint-line ± 5 (via documentSymbols filtered to range),
 * plus full document symbols matching name, plus workspaceSymbols, then rank.
 */
export async function findSymbol(host: LspHost, input: FindSymbolInput): Promise<SymbolInformation | undefined> {
  const client = await host.clientForFile(input.filepath)
  if (!client) return undefined
  const uri = pathToFileURL(input.filepath).toString()

  const candidates: SymbolInformation[] = []
  const ds = await client.documentSymbols(uri).catch(() => undefined)
  if (Array.isArray(ds)) {
    for (const s of ds) {
      const flat = flattenDocumentSymbol(s, uri)
      for (const f of flat) {
        const matchName = f.name === input.name || f.name.includes(input.name)
        const inHintRange = input.hintLine !== undefined && Math.abs(f.location.range.start.line - input.hintLine) <= 5
        if (matchName || inHintRange) candidates.push(f)
      }
    }
  }

  const ws = await client.workspaceSymbols(input.name).catch(() => undefined)
  if (Array.isArray(ws)) candidates.push(...ws)

  const ranked = mergeAndRank(candidates, { name: input.name, hintLine: input.hintLine, hintUri: uri })
  return ranked[0]
}

function flattenDocumentSymbol(s: DocumentSymbol | SymbolInformation, uri: string): SymbolInformation[] {
  const out: SymbolInformation[] = []
  if ('location' in s) {
    out.push(s)
    return out
  }
  const ds = s as DocumentSymbol
  out.push({
    name: ds.name,
    kind: ds.kind,
    location: { uri, range: ds.range }
  })
  for (const c of ds.children ?? []) out.push(...flattenDocumentSymbol(c, uri))
  return out
}
```

- [ ] **Step 3: Re-export + run**

```ts
// packages/core/src/lsp/index.ts (append)
export * from './position-resolver'
```

```bash
pnpm vitest run packages/core/test/unit/position-resolver.test.ts
```

Expected: 3 passed.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/lsp packages/core/test/unit/position-resolver.test.ts
git commit -m "feat(lsp): cclsp-style position resolver (hintLine±5 + documentSymbols + workspaceSymbols, ranked)"
```

---

## Task 23: 12 LSP tool implementations + PostEdit auto-diagnostics hook

**Files:**
- Create: `packages/core/src/lsp/tools/diagnostics.ts`
- Create: `packages/core/src/lsp/tools/diagnostics-directory.ts`
- Create: `packages/core/src/lsp/tools/goto-definition.ts`
- Create: `packages/core/src/lsp/tools/find-references.ts`
- Create: `packages/core/src/lsp/tools/hover.ts`
- Create: `packages/core/src/lsp/tools/rename.ts`
- Create: `packages/core/src/lsp/tools/document-symbols.ts`
- Create: `packages/core/src/lsp/tools/workspace-symbols.ts`
- Create: `packages/core/src/lsp/tools/code-actions.ts`
- Create: `packages/core/src/lsp/tools/code-action-resolve.ts`
- Create: `packages/core/src/lsp/tools/prepare-rename.ts`
- Create: `packages/core/src/lsp/tools/servers.ts`
- Create: `packages/core/src/lsp/lsp-rpc.ts`
- Create: `packages/core/src/lsp/post-edit-hook.ts`
- Test: `packages/core/test/unit/lsp-tools.test.ts`

- [ ] **Step 1: Implement tool modules (one fn each, thin LSP host adapter)**

`packages/core/src/lsp/tools/diagnostics.ts`:
```ts
import { pathToFileURL } from 'node:url'
import { readFileSync, existsSync } from 'node:fs'
import { setTimeout as wait } from 'node:timers/promises'
import type { LspHost } from '../lsp-host'

export async function lspDiagnostics(host: LspHost, filepath: string, waitMs = 300): Promise<{ diagnostics: unknown[] }> {
  const client = await host.clientForFile(filepath)
  if (!client) return { diagnostics: [] }
  const uri = pathToFileURL(filepath).toString()
  if (existsSync(filepath)) await client.didOpen(uri, client.spec.language, readFileSync(filepath, 'utf8'))
  await wait(waitMs)
  return { diagnostics: client.getDiagnostics(uri) }
}
```

`packages/core/src/lsp/tools/diagnostics-directory.ts`:
```ts
import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { lspDiagnostics } from './diagnostics'
import type { LspHost } from '../lsp-host'

export async function lspDiagnosticsDirectory(host: LspHost, dir: string, extension?: string): Promise<{ files: Array<{ path: string; diagnostics: unknown[] }> }> {
  const out: Array<{ path: string; diagnostics: unknown[] }> = []
  for (const f of walk(dir, extension)) {
    const r = await lspDiagnostics(host, f, 200)
    if (Array.isArray(r.diagnostics) && r.diagnostics.length > 0) out.push({ path: f, diagnostics: r.diagnostics })
  }
  return { files: out }
}

function* walk(dir: string, extension?: string): Generator<string> {
  for (const ent of readdirSync(dir)) {
    if (ent === 'node_modules' || ent.startsWith('.')) continue
    const p = path.join(dir, ent)
    const st = statSync(p)
    if (st.isDirectory()) yield* walk(p, extension)
    else if (!extension || p.endsWith(extension)) yield p
  }
}
```

`packages/core/src/lsp/tools/goto-definition.ts`:
```ts
import { pathToFileURL } from 'node:url'
import type { LspHost } from '../lsp-host'
export async function lspGotoDefinition(host: LspHost, filepath: string, line: number, character: number) {
  const c = await host.clientForFile(filepath); if (!c) return { result: null }
  await host.didOpen(filepath)
  const uri = pathToFileURL(filepath).toString()
  return { result: await c.definition(uri, line, character) }
}
```

`packages/core/src/lsp/tools/find-references.ts`:
```ts
import { pathToFileURL } from 'node:url'
import type { LspHost } from '../lsp-host'
export async function lspFindReferences(host: LspHost, filepath: string, line: number, character: number, includeDeclaration = true) {
  const c = await host.clientForFile(filepath); if (!c) return { result: [] }
  await host.didOpen(filepath)
  return { result: await c.references(pathToFileURL(filepath).toString(), line, character, includeDeclaration) }
}
```

`packages/core/src/lsp/tools/hover.ts`:
```ts
import { pathToFileURL } from 'node:url'
import type { LspHost } from '../lsp-host'
export async function lspHover(host: LspHost, filepath: string, line: number, character: number) {
  const c = await host.clientForFile(filepath); if (!c) return { result: null }
  await host.didOpen(filepath)
  return { result: await c.hover(pathToFileURL(filepath).toString(), line, character) }
}
```

`packages/core/src/lsp/tools/rename.ts`:
```ts
import { pathToFileURL } from 'node:url'
import type { LspHost } from '../lsp-host'
export async function lspRename(host: LspHost, filepath: string, line: number, character: number, newName: string) {
  const c = await host.clientForFile(filepath); if (!c) return { workspaceEdit: null }
  await host.didOpen(filepath)
  return { workspaceEdit: await c.rename(pathToFileURL(filepath).toString(), line, character, newName) }
}
```

`packages/core/src/lsp/tools/document-symbols.ts`:
```ts
import { pathToFileURL } from 'node:url'
import type { LspHost } from '../lsp-host'
export async function lspDocumentSymbols(host: LspHost, filepath: string) {
  const c = await host.clientForFile(filepath); if (!c) return { symbols: [] }
  await host.didOpen(filepath)
  return { symbols: await c.documentSymbols(pathToFileURL(filepath).toString()) }
}
```

`packages/core/src/lsp/tools/workspace-symbols.ts`:
```ts
import type { LspHost } from '../lsp-host'
export async function lspWorkspaceSymbols(host: LspHost, language: string, query: string) {
  const c = await host.clientForLanguage(language); if (!c) return { symbols: [] }
  return { symbols: await c.workspaceSymbols(query) }
}
```

`packages/core/src/lsp/tools/code-actions.ts`:
```ts
import { pathToFileURL } from 'node:url'
import type { Range } from 'vscode-languageserver-protocol'
import type { LspHost } from '../lsp-host'
export async function lspCodeActions(host: LspHost, filepath: string, range: Range) {
  const c = await host.clientForFile(filepath); if (!c) return { actions: [] }
  await host.didOpen(filepath)
  return { actions: await c.codeActions(pathToFileURL(filepath).toString(), range) }
}
```

`packages/core/src/lsp/tools/code-action-resolve.ts`:
```ts
import type { CodeAction } from 'vscode-languageserver-protocol'
import type { LspHost } from '../lsp-host'
export async function lspCodeActionResolve(host: LspHost, language: string, action: CodeAction) {
  const c = await host.clientForLanguage(language); if (!c) return { action }
  return { action: await c.codeActionResolve(action) }
}
```

`packages/core/src/lsp/tools/prepare-rename.ts`:
```ts
import { pathToFileURL } from 'node:url'
import type { LspHost } from '../lsp-host'
export async function lspPrepareRename(host: LspHost, filepath: string, line: number, character: number) {
  const c = await host.clientForFile(filepath); if (!c) return { result: null }
  await host.didOpen(filepath)
  return { result: await c.prepareRename(pathToFileURL(filepath).toString(), line, character) }
}
```

`packages/core/src/lsp/tools/servers.ts`:
```ts
import type { LspHost } from '../lsp-host'
export async function lspServers(host: LspHost) {
  return { servers: host.list() }
}
```

- [ ] **Step 2: RPC binding for all 12 tools**

`packages/core/src/lsp/lsp-rpc.ts`:
```ts
import { z } from 'zod'
import type { RpcHandler } from '../rpc/protocol'
import { RPC_ERRORS } from '../rpc/protocol'
import type { LspHost } from './lsp-host'
import { lspDiagnostics } from './tools/diagnostics'
import { lspDiagnosticsDirectory } from './tools/diagnostics-directory'
import { lspGotoDefinition } from './tools/goto-definition'
import { lspFindReferences } from './tools/find-references'
import { lspHover } from './tools/hover'
import { lspRename } from './tools/rename'
import { lspDocumentSymbols } from './tools/document-symbols'
import { lspWorkspaceSymbols } from './tools/workspace-symbols'
import { lspCodeActions } from './tools/code-actions'
import { lspCodeActionResolve } from './tools/code-action-resolve'
import { lspPrepareRename } from './tools/prepare-rename'
import { lspServers } from './tools/servers'

const Pos = z.object({ filepath: z.string(), line: z.number().int().nonnegative(), character: z.number().int().nonnegative() })
const FilepathOnly = z.object({ filepath: z.string() })
const RangeSchema = z.object({ start: z.object({ line: z.number(), character: z.number() }), end: z.object({ line: z.number(), character: z.number() }) })

function check<T extends z.ZodTypeAny>(s: T, p: unknown): z.infer<T> {
  const v = s.safeParse(p)
  if (!v.success) throw { ...RPC_ERRORS.INVALID_PARAMS, data: v.error.flatten() }
  return v.data
}

export function makeLspHandlers(host: LspHost): Record<string, RpcHandler> {
  return {
    'lsp.diagnostics': async (p) => {
      const v = check(FilepathOnly.extend({ waitMs: z.number().optional() }), p)
      return lspDiagnostics(host, v.filepath, v.waitMs)
    },
    'lsp.diagnostics_directory': async (p) => {
      const v = check(z.object({ dir: z.string(), extension: z.string().optional() }), p)
      return lspDiagnosticsDirectory(host, v.dir, v.extension)
    },
    'lsp.goto_definition': async (p) => {
      const v = check(Pos, p); return lspGotoDefinition(host, v.filepath, v.line, v.character)
    },
    'lsp.find_references': async (p) => {
      const v = check(Pos.extend({ includeDeclaration: z.boolean().optional() }), p)
      return lspFindReferences(host, v.filepath, v.line, v.character, v.includeDeclaration)
    },
    'lsp.hover': async (p) => { const v = check(Pos, p); return lspHover(host, v.filepath, v.line, v.character) },
    'lsp.rename': async (p) => {
      const v = check(Pos.extend({ newName: z.string().min(1) }), p)
      return lspRename(host, v.filepath, v.line, v.character, v.newName)
    },
    'lsp.document_symbols': async (p) => { const v = check(FilepathOnly, p); return lspDocumentSymbols(host, v.filepath) },
    'lsp.workspace_symbols': async (p) => {
      const v = check(z.object({ language: z.string(), query: z.string() }), p)
      return lspWorkspaceSymbols(host, v.language, v.query)
    },
    'lsp.code_actions': async (p) => {
      const v = check(z.object({ filepath: z.string(), range: RangeSchema }), p)
      return lspCodeActions(host, v.filepath, v.range)
    },
    'lsp.code_action_resolve': async (p) => {
      const v = check(z.object({ language: z.string(), action: z.unknown() }), p)
      return lspCodeActionResolve(host, v.language, v.action as any)
    },
    'lsp.prepare_rename': async (p) => { const v = check(Pos, p); return lspPrepareRename(host, v.filepath, v.line, v.character) },
    'lsp.servers': async () => lspServers(host)
  }
}
```

- [ ] **Step 3: Implement PostEdit auto-diagnostics hook**

`packages/core/src/lsp/post-edit-hook.ts`:
```ts
import { readFileSync, existsSync } from 'node:fs'
import { setTimeout as wait } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import type { LspHost } from './lsp-host'

export interface PostEditHookOpts {
  host: LspHost
  waitMs?: number                   // how long to give LSP to publish; default 400
}

/**
 * Register a PostToolUse-style handler that, after Edit/Write succeeds on a file,
 * synchronously pushes the new content to the LSP and waits briefly for diagnostics.
 *
 * Returns a stringified inline block that the daemon can append to the tool result.
 */
export class PostEditDiagnosticsHook {
  private versions = new Map<string, number>()
  constructor(private opts: PostEditHookOpts) {}

  /** Call after Edit/Write completes successfully. */
  async run(filepath: string): Promise<{ inline: string; diagnostics: unknown[] }> {
    if (!existsSync(filepath)) return { inline: '', diagnostics: [] }
    const v = (this.versions.get(filepath) ?? 0) + 1
    this.versions.set(filepath, v)
    const text = readFileSync(filepath, 'utf8')
    const client = await this.opts.host.clientForFile(filepath)
    if (!client) return { inline: '', diagnostics: [] }
    const uri = pathToFileURL(filepath).toString()
    await client.didOpen(uri, client.spec.language, text)
    await client.didChange(uri, v, text)
    await wait(this.opts.waitMs ?? 400)
    const diags = client.getDiagnostics(uri)
    if (diags.length === 0) return { inline: '', diagnostics: [] }
    const inline = renderDiagnostics(filepath, diags)
    return { inline, diagnostics: diags }
  }
}

function renderDiagnostics(filepath: string, diags: unknown[]): string {
  const lines: string[] = [`\n[lsp diagnostics: ${filepath} — ${diags.length} issue(s)]`]
  for (const d of diags as Array<{ severity?: number; range?: { start: { line: number; character: number } }; message?: string; source?: string }>) {
    const sev = d.severity === 1 ? 'error' : d.severity === 2 ? 'warn' : d.severity === 3 ? 'info' : 'hint'
    const line = (d.range?.start.line ?? 0) + 1
    const col  = (d.range?.start.character ?? 0) + 1
    lines.push(`  ${sev} L${line}:${col} ${d.source ? `[${d.source}] ` : ''}${d.message ?? ''}`)
  }
  return lines.join('\n')
}
```

- [ ] **Step 4: Unit test for lsp-rpc bindings (mock host)**

`packages/core/test/unit/lsp-tools.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { makeLspHandlers } from '../../src/lsp/lsp-rpc'

const fakeHost = {
  list: () => ([{ language: 'typescript', command: 'tsserver', rootUri: 'file:///tmp', lastUsedMs: 0 }]),
  clientForFile: async () => undefined,
  clientForLanguage: async () => undefined,
  didOpen: async () => {}
} as any

describe('lsp-rpc bindings', () => {
  test('lsp.servers returns running list', async () => {
    const handlers = makeLspHandlers(fakeHost)
    const r = await handlers['lsp.servers']!(undefined, {} as any)
    expect((r as any).servers.length).toBe(1)
    expect((r as any).servers[0].language).toBe('typescript')
  })

  test('lsp.hover with no client returns null result', async () => {
    const handlers = makeLspHandlers(fakeHost)
    const r = await handlers['lsp.hover']!({ filepath: '/tmp/x.ts', line: 0, character: 0 }, {} as any)
    expect((r as any).result).toBeNull()
  })

  test('lsp.diagnostics with no client returns empty', async () => {
    const handlers = makeLspHandlers(fakeHost)
    const r = await handlers['lsp.diagnostics']!({ filepath: '/tmp/x.ts' }, {} as any)
    expect((r as any).diagnostics).toEqual([])
  })

  test('invalid params rejected with INVALID_PARAMS', async () => {
    const handlers = makeLspHandlers(fakeHost)
    await expect(handlers['lsp.hover']!({}, {} as any)).rejects.toMatchObject({ code: -32602 })
  })
})
```

- [ ] **Step 5: Update LSP barrel + run**

```ts
// packages/core/src/lsp/index.ts (final)
export * from './language-registry'
export * from './root-markers'
export * from './lsp-client'
export * from './lsp-host'
export * from './position-resolver'
export * from './lsp-rpc'
export * from './post-edit-hook'
```

```bash
pnpm vitest run packages/core/test/unit/lsp-tools.test.ts
```

Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/lsp packages/core/test/unit/lsp-tools.test.ts
git commit -m "feat(lsp): 12 LSP tools + RPC bindings + PostEditDiagnosticsHook with inline render"
```

---

## Task 24: Daemon wiring (memory / trio / context / lsp handlers + lifecycle)

**Files:**
- Create: `packages/core/src/memory/loader.ts`           (registers `memory` subsystem with LoaderHub)
- Create: `packages/core/src/lsp/loader.ts`              (registers `lsp` subsystem with LoaderHub)

> **P7-Fix-7 + P7-Fix-6 + P7-Fix-3:** P7 does **NOT** edit `packages/core/src/daemon/daemon.ts` directly. All wiring goes through `LoaderHub.registerSubsystem(...)` (P4 ships the hub, P1 stubs it per §0.9). The Compactor's `llm` adapter is bound to `LLMService.complete()` (P6 — §0.5). The `context.compact` RPC is registered here.

- [ ] **Step 1: Register `memory` subsystem via LoaderHub**

`packages/core/src/memory/loader.ts`:

```ts
import { LoaderHub } from '../daemon/loader-hub'
import { makeMemoryHandlers } from './memory-rpc'
import { makeNotepadHandlers } from '../notepad/notepad-rpc'
import { makeProjectMemoryHandlers } from '../project-memory/project-rpc'
import { makeSharedMemoryHandlers } from '../shared-memory/shared-rpc'
import { makeContextHandlers } from '../context/context-rpc'
import { Compactor } from '../context/compactor'
import { SnapshotStore } from '../context/snapshot'

LoaderHub.registerSubsystem('memory', async (daemon) => {
  // Memory + trio + context RPCs
  for (const [n, h] of Object.entries(makeMemoryHandlers()))         daemon.rpc.on(n, h)
  for (const [n, h] of Object.entries(makeNotepadHandlers()))        daemon.rpc.on(n, h)
  for (const [n, h] of Object.entries(makeProjectMemoryHandlers()))  daemon.rpc.on(n, h)
  for (const [n, h] of Object.entries(makeSharedMemoryHandlers()))   daemon.rpc.on(n, h)
  for (const [n, h] of Object.entries(makeContextHandlers()))        daemon.rpc.on(n, h)

  // P7-Fix-6: wire Compactor.opts.llm to LLMService.complete()
  // (daemon.llmService is provided by P6's LoaderHub registration of 'llm-router')
  const snapshots = new SnapshotStore({ db: daemon.db, sessionsRoot: daemon.sessionsRoot })
  const compactor = new Compactor({
    db: daemon.db,
    snapshots,
    // text-only adapter: LLMService.complete -> { text, usage }; Compactor expects raw text
    routerCall: async (req) => {
      const r = await daemon.llmService.complete(
        [
          { role: 'system', content: req.system },
          ...req.messages,
        ],
        { model: req.model, max_tokens: req.max_tokens },
      )
      return { text: r.text, tokensIn: r.usage?.input_tokens ?? 0, tokensOut: r.usage?.output_tokens ?? 0 }
    },
  })
  daemon.compactor = compactor

  // P7-Fix-3: register `context.compact` RPC alongside `context.assemble`
  daemon.rpc.on('context.compact', async (params: { focus?: string }, ctx) => {
    // session id comes from RpcContext (P1 attaches sessionId to context)
    return compactor.compact(ctx.sessionId, params.focus)
  })
})
```

- [ ] **Step 2: Register `lsp` subsystem via LoaderHub**

`packages/core/src/lsp/loader.ts`:

```ts
import { LoaderHub } from '../daemon/loader-hub'
import { LspHost } from './lsp-host'
import { makeLspHandlers } from './lsp-rpc'
import { PostEditDiagnosticsHook } from './post-edit-hook'

LoaderHub.registerSubsystem('lsp', async (daemon) => {
  const lspHost = new LspHost({ log: daemon.log, worktree: daemon.cwd })
  const postEdit = new PostEditDiagnosticsHook({ host: lspHost })

  for (const [n, h] of Object.entries(makeLspHandlers(lspHost))) daemon.rpc.on(n, h)

  // PostToolUse:Edit/Write hook target
  daemon.rpc.on('postEdit.diagnostics', async (p) => {
    const { filepath } = p as { filepath: string }
    return postEdit.run(filepath)
  })

  // Lifecycle hook: ensure LSP servers are stopped on daemon shutdown.
  daemon.onStop(async () => { await lspHost.stopAll() })

  daemon.lspHost = lspHost
})
```

Both `memory/loader.ts` and `lsp/loader.ts` are imported by the package barrels (`packages/core/src/memory/index.ts` and `packages/core/src/lsp/index.ts`) so their `LoaderHub.registerSubsystem` calls fire at import time. P1's `Daemon.start()` calls `await LoaderHub.runAll(this)` once and the subsystems wire themselves.

- [ ] **Step 2: Build + smoke**

```bash
pnpm build
export GLM_HOME=/tmp/glm-wire-$$
node packages/cli/dist/bin.js daemon start
node packages/cli/dist/bin.js daemon status
node packages/cli/dist/bin.js daemon stop
```

Expected: clean lifecycle, no LSP spawn (no file touched), no memory file touched.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/memory/loader.ts packages/core/src/lsp/loader.ts
git commit -m "feat(daemon): register memory + lsp subsystems via LoaderHub (memory/trio/context + LSP handlers)"
```

---

## Task 25: Integration test — AGENTS.md cascade with deep file-relative discovery

**Files:**
- Create: `packages/core/test/integration/cascade-deep.test.ts`

- [ ] **Step 1: Write integration test**

`packages/core/test/integration/cascade-deep.test.ts`:
```ts
import { afterEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { resolveCascade, FileRelativeDiscovery, expandImports, parseMemoriesSection } from '../../src/memory'
import { ContextAssembler } from '../../src/context'

let tmp: string
afterEach(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }) })

describe('cascade end-to-end', () => {
  test('global + project + file-relative + @imports all wired through assembler', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-int-casc-'))
    const home = path.join(tmp, 'home')
    const wt = path.join(tmp, 'wt')
    mkdirSync(home, { recursive: true })
    mkdirSync(path.join(wt, 'pkg/auth'), { recursive: true })

    // Global
    mkdirSync(path.join(home, '.glm'), { recursive: true })
    writeFileSync(path.join(home, '.glm/AGENTS.md'), `# global\n@./shared.md\n`)
    writeFileSync(path.join(home, '.glm/shared.md'), `GLOBAL SHARED RULE\n`)

    // Project root AGENTS.md
    writeFileSync(path.join(wt, 'AGENTS.md'), `# project root\n\n## Memories\n- [m1](.glm/memory/m1.md) — top memory\n`)

    // Deep-folder AGENTS.md
    writeFileSync(path.join(wt, 'pkg/auth/AGENTS.md'), `# auth-local rules\nDO NOT MUTATE GLOBALS\n`)

    // Deep file the agent is reading
    const deepFile = path.join(wt, 'pkg/auth/login.ts')
    writeFileSync(deepFile, 'export {}\n')

    // Sanity: cascade walks from worktree root
    const c = resolveCascade({ cwd: wt, worktree: wt, home, extraGlobs: [] })
    expect(c.paths.length).toBe(2)
    expect(c.paths[0]).toContain('home/.glm/AGENTS.md')
    expect(c.paths[1]).toContain('wt/AGENTS.md')

    // file-relative discovery for the deep file: should surface pkg/auth/AGENTS.md
    const fr = new FileRelativeDiscovery({ worktree: wt })
    fr.seedAttached(c.paths)
    const hits = fr.discoverFor(deepFile)
    expect(hits.length).toBe(1)
    expect(hits[0]).toContain('pkg/auth/AGENTS.md')

    // @import expander
    const r = expandImports(path.join(home, '.glm/AGENTS.md'))
    expect(r.text).toContain('GLOBAL SHARED RULE')

    // assembler bundles them
    const a = new ContextAssembler({
      worktree: wt, home,
      systemPrompt: 'sys',
      skillCatalog: 'skill catalog',
      projectRoot: wt,
      extraInstructionGlobs: hits   // promote file-relative hits as instructions
    })
    const out = a.assemble({ history: [], latestUserMessage: 'go' })
    const cascadeBlocks = out.blocks.filter(b => b.source === 'cascade')
    expect(cascadeBlocks.length).toBeGreaterThan(0)
    const cascadeText = cascadeBlocks.map(b => b.content).join('\n')
    expect(cascadeText).toContain('global')
    expect(cascadeText).toContain('project root')
    expect(cascadeText).toContain('GLOBAL SHARED RULE')
    expect(cascadeText).toContain('DO NOT MUTATE GLOBALS')

    // The ## Memories section is parsed and present in project AGENTS.md cascade text
    const projectMd = require('node:fs').readFileSync(path.join(wt, 'AGENTS.md'), 'utf8')
    const mem = parseMemoriesSection(projectMd)
    expect(mem.entries.length).toBe(1)
    expect(mem.entries[0]!.name).toBe('m1')
  })
})
```

- [ ] **Step 2: Run**

```bash
pnpm build
pnpm vitest run packages/core/test/integration/cascade-deep.test.ts
```

Expected: 1 passed.

- [ ] **Step 3: Commit**

```bash
git add packages/core/test/integration/cascade-deep.test.ts
git commit -m "test(memory): integration — cascade + file-relative + @imports + memories index"
```

---

## Task 26: Integration test — Memory CRUD + Trio over live daemon

**Files:**
- Create: `packages/core/test/integration/memory-crud-rpc.test.ts`
- Create: `packages/core/test/integration/trio-rpc.test.ts`

- [ ] **Step 1: Memory CRUD over RPC**

`packages/core/test/integration/memory-crud-rpc.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { createConnection } from 'node:net'
import path from 'node:path'
import { spawnDaemonProcess } from './_helper'

async function rpcCall(socket: string, method: string, params?: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const s = createConnection(socket)
    let leftover = ''
    s.on('connect', () => s.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) + '\n'))
    s.on('data', (chunk) => {
      leftover += chunk.toString('utf8')
      const i = leftover.indexOf('\n')
      if (i < 0) return
      const frame = leftover.slice(0, i)
      try {
        const msg = JSON.parse(frame) as { error?: { message: string }; result?: unknown }
        if (msg.error) reject(new Error(msg.error.message))
        else resolve(msg.result)
      } finally { s.end() }
    })
    s.on('error', reject)
  })
}

describe('memory CRUD over RPC', () => {
  test('write → list → show → pin → archive → delete', async () => {
    const d = await spawnDaemonProcess()
    const projectRoot = d.home
    const globalDir = path.join(d.home, '.glm', 'memory')
    try {
      await rpcCall(d.socket, 'memory.write', {
        projectRoot, globalDir, scope: 'project',
        slug: 'feedback-tdd', type: 'feedback', description: 'Tests hit real DB',
        body: 'Tests must hit real DB, not mocks'
      })

      const list = await rpcCall(d.socket, 'memory.list', { projectRoot, globalDir, scope: 'project' }) as Array<{ slug: string }>
      expect(list.find(r => r.slug === 'feedback-tdd')).toBeTruthy()

      const show = await rpcCall(d.socket, 'memory.show', { projectRoot, globalDir, scope: 'project', slug: 'feedback-tdd' }) as { body: string } | null
      expect(show?.body).toContain('hit real DB')

      await rpcCall(d.socket, 'memory.pin', { projectRoot, globalDir, scope: 'project', slug: 'feedback-tdd', value: true })
      const afterPin = await rpcCall(d.socket, 'memory.show', { projectRoot, globalDir, scope: 'project', slug: 'feedback-tdd' }) as any
      expect(afterPin.frontmatter.metadata.pin).toBe(true)

      await rpcCall(d.socket, 'memory.archive', { projectRoot, globalDir, scope: 'project', slug: 'feedback-tdd' })
      const afterArch = await rpcCall(d.socket, 'memory.show', { projectRoot, globalDir, scope: 'project', slug: 'feedback-tdd' }) as any
      expect(afterArch.frontmatter.metadata.archived).toBe(true)

      await rpcCall(d.socket, 'memory.delete', { projectRoot, globalDir, scope: 'project', slug: 'feedback-tdd' })
      const afterDel = await rpcCall(d.socket, 'memory.show', { projectRoot, globalDir, scope: 'project', slug: 'feedback-tdd' })
      expect(afterDel).toBeNull()
    } finally {
      await d.shutdown()
    }
  })

  test('auto-write dedupes against existing similar body', async () => {
    const d = await spawnDaemonProcess()
    const projectRoot = d.home
    const globalDir = path.join(d.home, '.glm', 'memory')
    try {
      await rpcCall(d.socket, 'memory.autoWrite', {
        projectRoot, globalDir, scope: 'project', qualified: true,
        slug: 'first', type: 'feedback', description: 'tdd',
        body: 'Tests must hit a real database, never mocks.'
      })
      const r = await rpcCall(d.socket, 'memory.autoWrite', {
        projectRoot, globalDir, scope: 'project', qualified: true,
        slug: 'second', type: 'feedback', description: 'tdd',
        body: 'Tests must hit a real database, never mocks please.'
      }) as { action: string }
      expect(r.action).toBe('deduped')
    } finally {
      await d.shutdown()
    }
  })
})
```

- [ ] **Step 2: Trio over RPC**

`packages/core/test/integration/trio-rpc.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { createConnection } from 'node:net'
import { spawnDaemonProcess } from './_helper'

async function rpcCall(socket: string, method: string, params?: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const s = createConnection(socket)
    let leftover = ''
    s.on('connect', () => s.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) + '\n'))
    s.on('data', (chunk) => {
      leftover += chunk.toString('utf8')
      const i = leftover.indexOf('\n')
      if (i < 0) return
      try {
        const msg = JSON.parse(leftover.slice(0, i)) as { error?: { message: string }; result?: unknown }
        if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result)
      } finally { s.end() }
    })
    s.on('error', reject)
  })
}

describe('memory trio over RPC', () => {
  test('notepad write/read', async () => {
    const d = await spawnDaemonProcess()
    try {
      await rpcCall(d.socket, 'notepad.write', { projectRoot: d.home, tier: 'priority', text: 'HOT BUG' })
      const r = await rpcCall(d.socket, 'notepad.read', { projectRoot: d.home }) as { content: string }
      expect(r.content).toContain('HOT BUG')
    } finally { await d.shutdown() }
  })

  test('project-memory addNote + addDirective + forContext', async () => {
    const d = await spawnDaemonProcess()
    try {
      await rpcCall(d.socket, 'project.addNote', { projectRoot: d.home, text: 'pnpm workspace' })
      await rpcCall(d.socket, 'project.addDirective', { projectRoot: d.home, text: 'always run tsc before commit' })
      const r = await rpcCall(d.socket, 'project.forContext', { projectRoot: d.home }) as { markdown: string }
      expect(r.markdown).toContain('pnpm workspace')
      expect(r.markdown).toContain('always run tsc')
      expect(r.markdown.indexOf('Directives')).toBeLessThan(r.markdown.indexOf('Notes'))
    } finally { await d.shutdown() }
  })

  test('shared-memory write/read/list/delete', async () => {
    const d = await spawnDaemonProcess()
    try {
      await rpcCall(d.socket, 'shared.write', { projectRoot: d.home, key: 'progress', value: { pct: 45 } })
      const r = await rpcCall(d.socket, 'shared.read', { projectRoot: d.home, key: 'progress' }) as { value: { pct: number } }
      expect(r.value.pct).toBe(45)
      const ls = await rpcCall(d.socket, 'shared.list', { projectRoot: d.home }) as { keys: string[] }
      expect(ls.keys).toContain('progress')
      const del = await rpcCall(d.socket, 'shared.delete', { projectRoot: d.home, key: 'progress' }) as { deleted: boolean }
      expect(del.deleted).toBe(true)
    } finally { await d.shutdown() }
  })
})
```

- [ ] **Step 3: Run**

```bash
pnpm vitest run packages/core/test/integration/memory-crud-rpc.test.ts packages/core/test/integration/trio-rpc.test.ts
```

Expected: 2 + 3 = 5 passed.

- [ ] **Step 4: Commit**

```bash
git add packages/core/test/integration
git commit -m "test(memory): integration — memory CRUD + auto-write dedupe + trio RPC end-to-end"
```

---

## Task 27: Integration test — compaction end-to-end with mock router

**Files:**
- Create: `packages/core/test/integration/compaction-end-to-end.test.ts`

- [ ] **Step 1: Write the test**

`packages/core/test/integration/compaction-end-to-end.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { Database } from 'better-sqlite3'
import { openDb, runMigrations } from '../../src/storage'
import { SessionRepo } from '../../src/storage/session-repo'
import { Compactor, SnapshotStore, usable, shouldCompact, ContextAssembler, extractTail } from '../../src/context'
import type { ContextBlock } from '@glm/shared'

let tmp: string
let db: Database
let sessionId: string

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-e2e-comp-'))
  db = openDb(path.join(tmp, 's.db'))
  runMigrations(db)
  sessionId = new SessionRepo(db).create({ cwd: tmp, worktree: tmp }).id
})
afterEach(() => { db.close(); rmSync(tmp, { recursive: true, force: true }) })

describe('compaction end-to-end', () => {
  test('trigger → summarize → next request carries summary + tail + pruned tools', async () => {
    // Step 1: simulate an over-budget history.
    const history: ContextBlock[] = []
    for (let i = 0; i < 30; i++) {
      history.push({ role: 'user', content: `turn ${i}: long context ${'x'.repeat(800)}`, source: 'user' })
      history.push({ role: 'assistant', content: `reply ${i}: also long ${'y'.repeat(800)}`, source: 'assistant' })
    }
    const tokenBudget = usable({ ctx: 200_000, maxOutput: 128_000 }, {})
    // Pretend we used > 88% of usable
    const used = Math.floor(tokenBudget * 0.92)
    expect(shouldCompact({ tokensInContext: used, usable: tokenBudget })).toBe(true)

    // Step 2: write a relevant file so snapshot has something to capture
    const f = path.join(tmp, 'src.ts')
    writeFileSync(f, 'export const x = 1\n')

    // Step 3: stub router
    const fakeSummary = `
## Goal
keep going
## Constraints
no new deps
## Progress
### Done
- a bunch of turns
### InProgress
- compaction itself
### Blocked
- nothing
## Key Decisions
- compact at 88%
## Next Steps
1. resume
## Critical Context
last user wanted X
## Relevant Files
- src.ts
`
    const snap = new SnapshotStore({ db, sessionsRoot: path.join(tmp, 'sessions') })
    const compactor = new Compactor({
      db, snapshots: snap,
      routerCall: async () => ({ text: fakeSummary, tokensIn: 12_000, tokensOut: 1_500 })
    })

    const r = await compactor.compact({
      sessionId,
      history,
      toolOutputs: [
        { tool: 'Bash', content: 'x'.repeat(5000) },
        { tool: 'Skill', content: 'protected'.repeat(500) }
      ],
      relevantFiles: [f],
      currentGoal: 'keep going'
    })

    expect(r.summary.goal).toContain('keep going')
    expect(r.tail.length).toBeGreaterThan(0)
    expect(r.prunedToolOutputCount).toBe(1)            // Bash trimmed, Skill protected
    expect(r.snapshotIds.length).toBe(1)

    // Step 4: assembler picks up the summary on the NEXT request
    mkdirSync(path.join(tmp, 'home'), { recursive: true })
    const assembler = new ContextAssembler({
      worktree: tmp, home: path.join(tmp, 'home'),
      systemPrompt: 'sys', skillCatalog: ''
    })
    const next = assembler.assemble({
      history: r.tail,
      latestUserMessage: 'continue',
      compactedSummary: r.summary.raw
    })
    const compactedBlock = next.blocks.find(b => b.source === 'compacted')
    expect(compactedBlock).toBeDefined()
    expect(compactedBlock!.content).toContain('keep going')
    // tail preserved
    expect(next.blocks.some(b => b.role === 'assistant' && b.content.includes('reply 29'))).toBe(true)
  })
})
```

- [ ] **Step 2: Run**

```bash
pnpm vitest run packages/core/test/integration/compaction-end-to-end.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/core/test/integration/compaction-end-to-end.test.ts
git commit -m "test(context): end-to-end — trigger → compact → tail → snapshot → next assembly"
```

---

## Task 28: Integration test — TypeScript LSP roundtrip + PostEdit auto-diagnostics

**Files:**
- Create: `packages/core/test/integration/lsp-typescript-roundtrip.test.ts`
- Create: `packages/core/test/integration/post-edit-diagnostics.test.ts`

- [ ] **Step 1: Detect availability of `typescript-language-server`**

These integration tests require a real LSP binary. Skip-with-message when absent.

`packages/core/test/integration/lsp-typescript-roundtrip.test.ts`:
```ts
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { execSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { LspHost } from '../../src/lsp/lsp-host'
import { lspDiagnostics } from '../../src/lsp/tools/diagnostics'
import { lspWorkspaceSymbols } from '../../src/lsp/tools/workspace-symbols'
import { createLogger } from '../../src/log'

function tsServerAvailable(): boolean {
  try {
    execSync('typescript-language-server --version', { stdio: 'ignore' })
    return true
  } catch { return false }
}

const SKIP = !tsServerAvailable()
const itOrSkip = SKIP ? test.skip : test

let tmp: string
let host: LspHost

beforeAll(() => {
  if (SKIP) return
  tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-lsp-ts-'))
  // minimal TS project
  writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 't', version: '0.0.0', private: true }))
  writeFileSync(path.join(tmp, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2023', module: 'NodeNext', strict: true } }))
  mkdirSync(path.join(tmp, 'src'), { recursive: true })
  writeFileSync(path.join(tmp, 'src/main.ts'), `export function hello(name: string): string { return 'hi ' + name }\nconst x: number = "not a number"\n`)
  host = new LspHost({ log: createLogger('test-lsp'), worktree: tmp })
})

afterAll(async () => {
  if (SKIP) return
  await host?.stopAll()
  rmSync(tmp, { recursive: true, force: true })
})

describe('lsp typescript roundtrip', () => {
  itOrSkip('lspDiagnostics returns error on bad assignment', async () => {
    const r = await lspDiagnostics(host, path.join(tmp, 'src/main.ts'), 1500)
    expect(Array.isArray(r.diagnostics)).toBe(true)
    expect(r.diagnostics.length).toBeGreaterThan(0)
    const msgs = (r.diagnostics as Array<{ message?: string }>).map(d => d.message ?? '')
    expect(msgs.some(m => m.toLowerCase().includes('type'))).toBe(true)
  }, 30_000)

  itOrSkip('workspace_symbols finds `hello`', async () => {
    const r = await lspWorkspaceSymbols(host, 'typescript', 'hello')
    expect((r.symbols as unknown[])?.length ?? 0).toBeGreaterThan(0)
  }, 30_000)
})
```

- [ ] **Step 2: PostEdit auto-diagnostics test**

`packages/core/test/integration/post-edit-diagnostics.test.ts`:
```ts
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { execSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { LspHost } from '../../src/lsp/lsp-host'
import { PostEditDiagnosticsHook } from '../../src/lsp/post-edit-hook'
import { createLogger } from '../../src/log'

function ok(): boolean { try { execSync('typescript-language-server --version', { stdio: 'ignore' }); return true } catch { return false } }
const SKIP = !ok()
const itOrSkip = SKIP ? test.skip : test

let tmp: string
let host: LspHost
let hook: PostEditDiagnosticsHook
let target: string

beforeAll(() => {
  if (SKIP) return
  tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-postedit-'))
  writeFileSync(path.join(tmp, 'package.json'), '{ "name": "t", "version": "0.0.0", "private": true }')
  writeFileSync(path.join(tmp, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true } }))
  mkdirSync(path.join(tmp, 'src'), { recursive: true })
  target = path.join(tmp, 'src/a.ts')
  writeFileSync(target, `export const x: number = 1\n`)
  host = new LspHost({ log: createLogger('test-pe'), worktree: tmp })
  hook = new PostEditDiagnosticsHook({ host, waitMs: 1500 })
})

afterAll(async () => {
  if (SKIP) return
  await host.stopAll()
  rmSync(tmp, { recursive: true, force: true })
})

describe('post-edit auto-diagnostics', () => {
  itOrSkip('Edit that introduces a type error surfaces inline', async () => {
    // simulate an Edit that broke types
    writeFileSync(target, `export const x: number = "not a number"\n`)
    const r = await hook.run(target)
    expect(r.diagnostics.length).toBeGreaterThan(0)
    expect(r.inline).toContain('lsp diagnostics')
    expect(r.inline.toLowerCase()).toMatch(/(error|type)/)
  }, 30_000)

  itOrSkip('Edit that keeps types valid returns empty inline', async () => {
    writeFileSync(target, `export const x: number = 42\n`)
    const r = await hook.run(target)
    // possibly other warnings, but errors should be empty; allow some leniency
    const errCount = (r.diagnostics as Array<{ severity?: number }>).filter(d => d.severity === 1).length
    expect(errCount).toBe(0)
  }, 30_000)
})
```

- [ ] **Step 3: Run (will SKIP if typescript-language-server is not in PATH)**

```bash
pnpm vitest run packages/core/test/integration/lsp-typescript-roundtrip.test.ts packages/core/test/integration/post-edit-diagnostics.test.ts
```

Expected (with `typescript-language-server` installed): all PASS. Otherwise SKIPPED with notice.

- [ ] **Step 4: Commit**

```bash
git add packages/core/test/integration
git commit -m "test(lsp): integration — TS roundtrip + post-edit auto-diagnostics (skip when LSP absent)"
```

---

## P7 Completion — Verification Checklist

Before claiming P7 done, run all of these and confirm output.

- [ ] **Build clean:** `pnpm build` → no errors

- [ ] **All unit tests pass:** `pnpm vitest run packages/core/test/unit/` → all green
  - Expected counts (approximate):
    - cascade × 7, imports × 6, file-relative × 5, memories-section × 7
    - memory-store × 10, memory-eviction × 7, auto-writer × 4
    - notepad-store × 9, project-store × 8, shared-store × 9
    - cache-marker × 4, tail-preserve × 4, tool-prune × 4
    - compaction-trigger × 5, compaction-template × 3, snapshot × 5, compactor × 1
    - differential-file × 5, assembler × 4
    - language-registry × 11, root-markers × 4, lsp-client × 3, position-resolver × 3, lsp-tools × 4

- [ ] **Integration tests pass:** `pnpm vitest run packages/core/test/integration/`
  - cascade-deep × 1, memory-crud-rpc × 2, trio-rpc × 3, compaction-end-to-end × 1
  - lsp-typescript-roundtrip × 2 (or SKIPPED), post-edit-diagnostics × 2 (or SKIPPED)

- [ ] **Memory cascade manual smoke:**
  ```bash
  export GLM_HOME=/tmp/glm-mem-$$
  rm -rf $GLM_HOME
  mkdir -p $GLM_HOME/.glm && echo '# global rule' > $GLM_HOME/.glm/AGENTS.md
  cd /tmp && mkdir -p p7smoke && cd p7smoke
  echo '# project rule' > AGENTS.md

  node $OLDPWD/packages/cli/dist/bin.js daemon start
  node $OLDPWD/packages/cli/dist/bin.js memory list        # expect: (no memories)
  node $OLDPWD/packages/cli/dist/bin.js daemon stop
  ```
  Expected: clean start/stop, list empty.

- [ ] **Notepad write/read smoke:**
  ```bash
  node packages/cli/dist/bin.js daemon start
  # invoke notepad.write directly over socket (or via a one-off node script)
  node -e '
    const { createConnection } = require("net")
    const s = createConnection(process.env.HOME + "/.glm/daemon.sock")
    s.write(JSON.stringify({jsonrpc:"2.0",id:1,method:"notepad.write",
            params:{projectRoot: process.cwd(), tier:"priority", text:"manual smoke"}}) + "\n")
    s.on("data", d => { console.log(d.toString()); s.end() })
  '
  ls .glm/notepad.md && head -10 .glm/notepad.md  # expect: ## Priority + entry
  node packages/cli/dist/bin.js daemon stop
  ```

- [ ] **LSP availability check:**
  ```bash
  which typescript-language-server pyright-langserver gopls rust-analyzer clangd
  ```
  Expected: at least one resolves. If none, install with: `npm i -g typescript-language-server` for the smoke path below.

- [ ] **LSP smoke (TS):**
  ```bash
  node packages/cli/dist/bin.js daemon start
  cd /tmp && mkdir -p ts-smoke && cd ts-smoke
  echo '{"name":"t","version":"0","private":true}' > package.json
  echo '{"compilerOptions":{"strict":true}}' > tsconfig.json
  mkdir -p src && echo 'const x: number = "hi"' > src/a.ts
  node -e '
    const { createConnection } = require("net")
    const s = createConnection(process.env.HOME + "/.glm/daemon.sock")
    s.write(JSON.stringify({jsonrpc:"2.0",id:1,method:"lsp.diagnostics",
            params:{filepath: process.cwd() + "/src/a.ts", waitMs: 1500}}) + "\n")
    s.on("data", d => { console.log(d.toString()); s.end() })
  '
  node $OLDPWD/packages/cli/dist/bin.js daemon stop
  ```
  Expected: response includes at least one diagnostic about the type mismatch.

- [ ] **Coverage:** `pnpm vitest run --coverage packages/core/test/unit/`
  - memory/ ≥ 80%, context/ ≥ 80%, lsp/ ≥ 70% (LSP coverage capped by integration-only branches)
  - notepad/ ≥ 80%, project-memory/ ≥ 80%, shared-memory/ ≥ 80%

If anything above fails, fix before declaring P7 done.

---

## What P7 does NOT include (deferred to later P-plans)

These are intentionally out of scope for P7:

- **Hindsight `<memories>` inject** — spec §9.16 mentions `bank/`, `mental-models/`, `seeds/` and the auto `<memories>` block at first user turn. Implementation deferred to **v0.2 (see spec §9.22)**; P7 ships the trio (notepad / project / shared) but not hindsight RAG.
- **Session Wiki (`.glm/wiki/`)** — v0.2, not in v0.1.
- **AST-edit / structured rewrite** — v0.2.
- **Workspace symbols ↔ grep auto-routing** — orchestrator-level decision; **P8 (orchestrator)** owns this.
- **`/context` slash command, `/compact` slash command UI** — TUI lives in **P2**; P7 ships the RPC surface those commands will call.
- **HUD live update wiring** — `ContextAssembler.assemble().budget` is computed every turn; the dashboard TUI consumer is in **P2** (HUD) and the daemon broadcast plumbing is in **P10 (long-horizon / dashboard)**.
- **Periodic distillation scheduler integration** — `Distiller` exists but is started/stopped by the **P8 session-worker** lifecycle, not P7.
- **`memory.recall` semantic search** — present as a slug+body substring scan only; vector recall is v0.2.
- **Hashline-edit aware snapshot diff** — `SnapshotStore` captures full content; the hashline-aware view is in **P3 (Edit tool)**.
- **Auto-install of LSP binaries** — out of scope by design; we surface `glm lsp install` guidance (CLI placeholder), real install plumbing is v0.2.
- **MCP / Skill catalog rendering** — the skill catalog string passed to `ContextAssembler` is owned by **P4 (Skills)**; P7 just consumes it.
- **Prompt cache analytics** — we mark `cache_control: ephemeral`; surfacing cache hit % is in **P6 (LLM Router telemetry)**.
- **Compaction LLM model selection** — defaults to `GLM-4.5-Air`; caller can override. Smart model routing for compaction lives in **P8 (orchestrator)**.

P7 is the **memory + context backbone**. Subsequent P-plans plug into the exact RPC contract here:

- `context.assemble` → P8 orchestrator + P6 router pipeline
- `memory.*` / `notepad.*` / `project.*` / `shared.*` → P4 (skills can read/write), P8 (sub-agents shared state)
- `lsp.*` (12 tools) → P3 (Read/Edit augmentation), P4 (skills can call), P8 (orchestrator hints)
- `postEdit.diagnostics` → P5 hook target on PostToolUse:Edit/Write













