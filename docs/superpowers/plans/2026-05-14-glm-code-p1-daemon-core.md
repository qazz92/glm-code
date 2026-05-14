# glm code — P1: Daemon Core + IPC + SQLite Storage

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the foundational daemon that runs in the background, accepts client connections via Unix socket, manages session lifecycle, persists state to SQLite, and supports a working `glm` CLI for daemon lifecycle and basic echo round-trip.

**Architecture:** Single Node.js process (the daemon) listens on `~/.glm/daemon.sock` (Unix domain socket, mode 0600). CLI clients connect, send JSON-RPC 2.0 over newline-delimited JSON, receive responses. Daemon owns SQLite (WAL mode via `better-sqlite3`) for `session.db` and `quota.db`. CLI auto-spawns daemon if the socket is missing. Real session-worker child processes come in P8; P1 uses an in-daemon stub LLM that echoes its input.

**Tech Stack:** Node 22+, TypeScript 5.6+, pnpm workspaces, better-sqlite3, pino (logging), zod (validation), ulid (session IDs), commander (CLI parsing), vitest (testing).

**Acceptance criteria for P1:**
- `glm daemon start | stop | status | restart` works
- `glm "echo hello"` round-trips via daemon stub → prints `hello`
- `glm sessions` lists sessions; `glm attach <id>` re-opens an existing session
- Daemon survives client disconnect; client survives daemon restart (resume next attach)
- SQLite WAL works, migrations run idempotently, schema versioned in `meta` table
- `glm doctor` skeleton verifies runtime, daemon, socket, db
- 80%+ unit coverage on core modules; all integration tests pass

---

## File Structure

```
glm-code/                              # repo root (cwd: /Users/glen/twelvelabs_works/study)
├── package.json                       # workspace root, scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── vitest.config.ts
├── .gitignore
├── README.md
├── packages/
│   ├── shared/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── ulid.ts                # ULID generator
│   │       ├── paths.ts               # ~/.glm/* resolver
│   │       └── types.ts               # cross-package types
│   ├── core/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts               # public API
│   │   │   ├── log.ts                 # pino logger
│   │   │   ├── storage/
│   │   │   │   ├── db.ts              # better-sqlite3 wrapper
│   │   │   │   ├── migrations.ts      # migration runner
│   │   │   │   ├── migrations/
│   │   │   │   │   └── 001_initial.sql
│   │   │   │   ├── session-repo.ts    # CRUD for sessions table
│   │   │   │   └── index.ts
│   │   │   ├── rpc/
│   │   │   │   ├── protocol.ts        # JSON-RPC 2.0 types
│   │   │   │   ├── server.ts          # server (frame parser + dispatch)
│   │   │   │   ├── client.ts          # client (write + match by id)
│   │   │   │   ├── methods/
│   │   │   │   │   ├── ping.ts
│   │   │   │   │   ├── session.ts     # session.create/list/attach/...
│   │   │   │   │   └── chat.ts        # message.send (stub echo)
│   │   │   │   └── index.ts
│   │   │   ├── daemon/
│   │   │   │   ├── daemon.ts          # main Daemon class
│   │   │   │   ├── socket.ts          # Unix socket lifecycle
│   │   │   │   ├── pid.ts             # PID file handling
│   │   │   │   ├── lifecycle.ts       # start/stop/restart/shutdown
│   │   │   │   ├── loader-hub.ts      # subsystem registration hub (stub in P1)
│   │   │   │   └── index.ts
│   │   │   └── session/
│   │   │       ├── manager.ts         # session lifecycle
│   │   │       └── index.ts
│   │   └── test/
│   │       ├── unit/
│   │       │   ├── db.test.ts
│   │       │   ├── migrations.test.ts
│   │       │   ├── session-repo.test.ts
│   │       │   ├── rpc-protocol.test.ts
│   │       │   └── pid.test.ts
│   │       └── integration/
│   │           ├── daemon-lifecycle.test.ts
│   │           ├── rpc-roundtrip.test.ts
│   │           ├── echo-chat.test.ts
│   │           └── crash-recovery.test.ts
│   └── cli/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── bin.ts                 # entry point (#!/usr/bin/env node)
│           ├── auto-spawn.ts          # daemon auto-spawn logic
│           ├── commands/
│           │   ├── daemon.ts
│           │   ├── sessions.ts
│           │   ├── attach.ts
│           │   ├── doctor.ts
│           │   └── chat.ts            # the `glm "text"` shorthand
│           └── index.ts
```

---

## Task 1: Repo scaffolding & workspace setup

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `vitest.config.ts`
- Create: `README.md`
- Create: `packages/{shared,core,cli}/package.json`
- Create: `packages/{shared,core,cli}/tsconfig.json`

- [ ] **Step 1: Init git repo**

```bash
cd /Users/glen/twelvelabs_works/study
test -d .git || git init
```

- [ ] **Step 2: Write `.gitignore`**

```
node_modules/
dist/
.DS_Store
*.log
coverage/
.glm-test-*/
.tsbuildinfo
```

- [ ] **Step 3: Write `package.json` (workspace root)**

```json
{
  "name": "glm-code",
  "version": "0.1.0-alpha.1",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22.0.0", "pnpm": ">=9.0.0" },
  "scripts": {
    "build": "pnpm -r build",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc --build --noEmit",
    "clean": "pnpm -r exec rm -rf dist node_modules .tsbuildinfo"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0"
  },
  "packageManager": "pnpm@9.12.0"
}
```

- [ ] **Step 4: Write `pnpm-workspace.yaml`**

```yaml
packages:
  - 'packages/*'
```

- [ ] **Step 5: Write `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "composite": true,
    "incremental": true,
    "noUncheckedIndexedAccess": true,
    "isolatedModules": true
  }
}
```

- [ ] **Step 6: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    environment: 'node',
    pool: 'forks',         // each test file in its own process — daemon tests need isolation
    poolOptions: { forks: { singleFork: false } },
    testTimeout: 15_000,
    coverage: { reporter: ['text', 'lcov'], include: ['packages/*/src/**/*.ts'] }
  }
})
```

- [ ] **Step 7: Create per-package package.json files**

`packages/shared/package.json`:
```json
{
  "name": "@glm/shared",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": { "build": "tsc -b" },
  "dependencies": { "ulid": "^2.3.0" }
}
```

`packages/core/package.json`:
```json
{
  "name": "@glm/core",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": { "build": "tsc -b" },
  "dependencies": {
    "@glm/shared": "workspace:*",
    "better-sqlite3": "^11.5.0",
    "pino": "^9.5.0",
    "pino-pretty": "^11.3.0",
    "zod": "^3.23.0"
  },
  "devDependencies": { "@types/better-sqlite3": "^7.6.0" }
}
```

`packages/cli/package.json`:
```json
{
  "name": "@glm/cli",
  "version": "0.1.0",
  "type": "module",
  "bin": { "glm": "./dist/bin.js" },
  "main": "./dist/index.js",
  "scripts": { "build": "tsc -b" },
  "dependencies": {
    "@glm/shared": "workspace:*",
    "@glm/core": "workspace:*",
    "commander": "^12.1.0",
    "kleur": "^4.1.5"
  }
}
```

- [ ] **Step 8: Create per-package tsconfig.json**

`packages/shared/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src/**/*"]
}
```

`packages/core/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src/**/*"],
  "references": [{ "path": "../shared" }]
}
```

`packages/cli/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src/**/*"],
  "references": [{ "path": "../shared" }, { "path": "../core" }]
}
```

- [ ] **Step 9: Write `README.md`** (minimal — full readme comes in P10)

```markdown
# glm code

GLM coding agent CLI. Spec: `docs/superpowers/specs/2026-05-14-glm-code-design.md`.

## Install (dev)

```bash
pnpm install
pnpm build
node packages/cli/dist/bin.js daemon start
```

P1 milestone: daemon + IPC + storage skeleton.
```

- [ ] **Step 10: Install dependencies**

```bash
pnpm install
```

Expected: no errors, `node_modules/` and `pnpm-lock.yaml` created.

- [ ] **Step 11: Verify build empty packages**

```bash
mkdir -p packages/shared/src packages/core/src packages/cli/src
echo "export {}" > packages/shared/src/index.ts
echo "export {}" > packages/core/src/index.ts
echo "export {}" > packages/cli/src/index.ts
pnpm build
```

Expected: PASS, `dist/` dirs created.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "chore: scaffold pnpm workspace for glm-code P1"
```

---

## Task 2: Shared utilities (paths, ulid, types)

**Files:**
- Create: `packages/shared/src/paths.ts`
- Create: `packages/shared/src/ulid.ts`
- Create: `packages/shared/src/types.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/test/paths.test.ts`

- [ ] **Step 1: Write failing test for path resolution**

`packages/shared/test/paths.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { resolvePaths } from '../src/paths'

describe('resolvePaths', () => {
  test('returns expected ~/.glm subtree', () => {
    const p = resolvePaths({ home: '/Users/test' })
    expect(p.root).toBe('/Users/test/.glm')
    expect(p.socket).toBe('/Users/test/.glm/daemon.sock')
    expect(p.pid).toBe('/Users/test/.glm/daemon.pid')
    expect(p.log).toBe('/Users/test/.glm/daemon.log')
    expect(p.sessionsDir).toBe('/Users/test/.glm/sessions')
    expect(p.quotaDb).toBe('/Users/test/.glm/quota.db')
  })

  test('honors GLM_HOME env override', () => {
    const p = resolvePaths({ home: '/Users/test', env: { GLM_HOME: '/tmp/x' } })
    expect(p.root).toBe('/tmp/x')
  })
})
```

- [ ] **Step 2: Run test — should FAIL**

```bash
pnpm vitest run packages/shared/test/paths.test.ts
```

Expected: FAIL with "Cannot find module ../src/paths".

- [ ] **Step 3: Implement paths**

`packages/shared/src/paths.ts`:
```ts
import path from 'node:path'
import os from 'node:os'

export interface GlmPaths {
  root: string
  socket: string
  pid: string
  log: string
  sessionsDir: string
  quotaDb: string
  configFile: string
  agentsMd: string
}

export interface ResolveOpts {
  home?: string
  env?: NodeJS.ProcessEnv
}

export function resolvePaths(opts: ResolveOpts = {}): GlmPaths {
  const env = opts.env ?? process.env
  const home = opts.home ?? os.homedir()
  const root = env.GLM_HOME ?? path.join(home, '.glm')
  return {
    root,
    socket: path.join(root, 'daemon.sock'),
    pid: path.join(root, 'daemon.pid'),
    log: path.join(root, 'daemon.log'),
    sessionsDir: path.join(root, 'sessions'),
    quotaDb: path.join(root, 'quota.db'),
    configFile: path.join(root, 'config.json'),
    agentsMd: path.join(root, 'AGENTS.md'),
  }
}
```

- [ ] **Step 4: Implement ULID + types + index export**

`packages/shared/src/ulid.ts`:
```ts
import { ulid as ulidImpl } from 'ulid'
export const ulid = (): string => ulidImpl()
export const isUlid = (s: string): boolean => /^[0-9A-HJKMNP-TV-Z]{26}$/.test(s)
```

`packages/shared/src/types.ts`:
```ts
export type SessionId = string  // ULID
export type WorkerId = string

export interface RpcRequest {
  jsonrpc: '2.0'
  id: number | string | null
  method: string
  params?: unknown
}

export interface RpcResponse {
  jsonrpc: '2.0'
  id: number | string | null
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}
```

`packages/shared/src/index.ts`:
```ts
export * from './paths'
export * from './ulid'
export * from './types'
```

- [ ] **Step 5: Run test — PASS**

```bash
pnpm vitest run packages/shared/test/paths.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): add paths/ulid/types primitives"
```

---

## Task 3: SQLite connection + migration runner

**Files:**
- Create: `packages/core/src/log.ts`
- Create: `packages/core/src/storage/db.ts`
- Create: `packages/core/src/storage/migrations.ts`
- Create: `packages/core/src/storage/migrations/001_initial.sql`
- Modify: `packages/core/src/storage/index.ts`
- Test: `packages/core/test/unit/db.test.ts`

- [ ] **Step 1: Write logger**

`packages/core/src/log.ts`:
```ts
import pino from 'pino'

export function createLogger(component: string, opts: { level?: string; file?: string } = {}) {
  const level = opts.level ?? process.env.GLM_LOG ?? 'info'
  return pino({
    name: `glm:${component}`,
    level,
    base: undefined,
    redact: { paths: ['*.apiKey', '*.token', 'Authorization'], remove: true },
    transport: opts.file
      ? { target: 'pino/file', options: { destination: opts.file, mkdir: true } }
      : { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
  })
}

export type Logger = ReturnType<typeof createLogger>
```

- [ ] **Step 2: Write initial migration SQL**

`packages/core/src/storage/migrations/001_initial.sql`:
```sql
-- Meta table (schema version tracking)
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Sessions
CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  cwd           TEXT NOT NULL,
  worktree      TEXT NOT NULL,
  initial_task  TEXT,
  active        INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(active, updated_at);

-- Messages (one row per turn entry)
CREATE TABLE IF NOT EXISTS messages (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL,
  parent_id     TEXT,
  role          TEXT NOT NULL,
  ts            TEXT NOT NULL,
  content       BLOB NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id)  REFERENCES messages(id)
);
CREATE INDEX IF NOT EXISTS idx_messages_session_ts ON messages(session_id, ts);

-- Events (debug log persistence)
CREATE TABLE IF NOT EXISTS events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ts            TEXT NOT NULL,
  session_id    TEXT,
  topic         TEXT NOT NULL,
  data          BLOB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_topic_ts ON events(topic, ts);
```

- [ ] **Step 3: Write failing db test**

`packages/core/test/unit/db.test.ts`:
```ts
import { afterEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { openDb } from '../../src/storage/db'

let tmpdir: string

afterEach(() => { if (tmpdir) rmSync(tmpdir, { recursive: true, force: true }) })

describe('openDb', () => {
  test('creates file with WAL journal mode', () => {
    tmpdir = mkdtempSync(path.join(os.tmpdir(), 'glm-db-'))
    const db = openDb(path.join(tmpdir, 'test.db'))
    const mode = db.pragma('journal_mode', { simple: true })
    expect(mode).toBe('wal')
    db.close()
  })

  test('foreign_keys is on', () => {
    tmpdir = mkdtempSync(path.join(os.tmpdir(), 'glm-db-'))
    const db = openDb(path.join(tmpdir, 'test.db'))
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
    db.close()
  })
})
```

- [ ] **Step 4: Run test — should FAIL (module missing)**

```bash
pnpm vitest run packages/core/test/unit/db.test.ts
```

Expected: FAIL.

- [ ] **Step 5: Implement `openDb`**

`packages/core/src/storage/db.ts`:
```ts
import Database, { type Database as Db } from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export function openDb(filepath: string): Db {
  mkdirSync(dirname(filepath), { recursive: true })
  const db = new Database(filepath)
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  return db
}
```

- [ ] **Step 6: Implement migrations runner (with pre-migration backup)**

`packages/core/src/storage/migrations.ts`:
```ts
import { readdirSync, readFileSync, copyFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Database } from 'better-sqlite3'

const HERE = dirname(fileURLToPath(import.meta.url))

function currentSchemaVersion(db: Database): number {
  db.exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`)
  return Number(
    (db.prepare(`SELECT value FROM meta WHERE key='schema_version'`).get() as { value?: string } | undefined)?.value
    ?? '0'
  )
}

export function runMigrations(db: Database, dir = join(HERE, 'migrations')) {
  const cur = currentSchemaVersion(db)
  const files = readdirSync(dir).filter(f => f.endsWith('.sql')).sort()
  const pending = files.filter(f => {
    const n = Number(f.split('_')[0])
    return !Number.isNaN(n) && n > cur
  })

  // Pre-migration backup: if there are pending migrations and the db file
  // already exists, copy it aside before mutating schema. Idempotent — the
  // backup is keyed on the *current* schema version so re-running won't
  // clobber a prior backup.
  if (pending.length > 0) {
    const dbFile = db.name        // better-sqlite3 exposes the underlying file path
    if (dbFile && existsSync(dbFile)) {
      const bak = `${dbFile}.pre_migration_v${cur}.bak`
      if (!existsSync(bak)) copyFileSync(dbFile, bak)
    }
  }

  let applied = cur
  for (const f of pending) {
    const n = Number(f.split('_')[0])
    const sql = readFileSync(join(dir, f), 'utf8')
    db.exec('BEGIN')
    try {
      db.exec(sql)
      db.prepare(`INSERT OR REPLACE INTO meta(key,value) VALUES ('schema_version', ?)`).run(String(n))
      db.exec('COMMIT')
      applied = n
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
  }
  return applied
}
```

- [ ] **Step 7: Migrations test**

`packages/core/test/unit/migrations.test.ts`:
```ts
import { afterEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { openDb } from '../../src/storage/db'
import { runMigrations } from '../../src/storage/migrations'

let tmpdir: string
afterEach(() => { if (tmpdir) rmSync(tmpdir, { recursive: true, force: true }) })

describe('runMigrations', () => {
  test('applies 001_initial and bumps schema_version to 1', () => {
    tmpdir = mkdtempSync(path.join(os.tmpdir(), 'glm-mig-'))
    const db = openDb(path.join(tmpdir, 'test.db'))
    const v = runMigrations(db)
    expect(v).toBe(1)
    const cnt = db.prepare(`SELECT COUNT(*) as n FROM sqlite_master WHERE type='table' AND name='sessions'`).get() as { n: number }
    expect(cnt.n).toBe(1)
    db.close()
  })

  test('is idempotent (rerun = no-op)', () => {
    tmpdir = mkdtempSync(path.join(os.tmpdir(), 'glm-mig-'))
    const db = openDb(path.join(tmpdir, 'test.db'))
    runMigrations(db)
    const v2 = runMigrations(db)
    expect(v2).toBe(1)
    db.close()
  })

  test('writes pre_migration_v<N>.bak when pending migrations exist on an existing db', async () => {
    const { existsSync } = await import('node:fs')
    tmpdir = mkdtempSync(path.join(os.tmpdir(), 'glm-mig-bak-'))
    const file = path.join(tmpdir, 'test.db')
    // first migration bumps schema_version from 0 → 1 on a freshly-created file.
    // The file pre-exists from `openDb`, so a backup at v0 should be written.
    const db = openDb(file)
    runMigrations(db)
    expect(existsSync(`${file}.pre_migration_v0.bak`)).toBe(true)
    db.close()
  })
})
```

- [ ] **Step 8: Update storage barrel**

`packages/core/src/storage/index.ts`:
```ts
export * from './db'
export * from './migrations'
export * from './session-repo'
```

- [ ] **Step 9: Run all unit tests so far — PASS**

```bash
pnpm vitest run packages/core/test/unit/
```

Expected: 5 passed (db.test × 2, migrations.test × 3). session-repo test is in Task 4.

- [ ] **Step 10: Commit**

```bash
git add packages/core
git commit -m "feat(core): SQLite WAL connection + migration runner with 001_initial schema"
```

---

## Task 4: Session repository (CRUD)

**Files:**
- Create: `packages/core/src/storage/session-repo.ts`
- Test: `packages/core/test/unit/session-repo.test.ts`

- [ ] **Step 1: Write failing test**

`packages/core/test/unit/session-repo.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { Database } from 'better-sqlite3'
import { openDb, runMigrations, SessionRepo } from '../../src/storage'

let tmpdir: string
let db: Database
let repo: SessionRepo

beforeEach(() => {
  tmpdir = mkdtempSync(path.join(os.tmpdir(), 'glm-srepo-'))
  db = openDb(path.join(tmpdir, 's.db'))
  runMigrations(db)
  repo = new SessionRepo(db)
})
afterEach(() => { db.close(); rmSync(tmpdir, { recursive: true, force: true }) })

describe('SessionRepo', () => {
  test('create + get round-trip', () => {
    const s = repo.create({ cwd: '/tmp/x', worktree: '/tmp/x', initialTask: 'hello' })
    const got = repo.get(s.id)
    expect(got).toBeDefined()
    expect(got!.cwd).toBe('/tmp/x')
    expect(got!.initialTask).toBe('hello')
    expect(got!.active).toBe(true)
  })

  test('list returns most recent first', () => {
    const a = repo.create({ cwd: '/a', worktree: '/a' })
    const b = repo.create({ cwd: '/b', worktree: '/b' })
    const all = repo.list({ limit: 10 })
    expect(all.map(s => s.id)).toEqual([b.id, a.id])
  })

  test('markInactive sets active=false', () => {
    const s = repo.create({ cwd: '/x', worktree: '/x' })
    repo.markInactive(s.id)
    expect(repo.get(s.id)!.active).toBe(false)
  })

  test('updateTimestamp refreshes updated_at', async () => {
    const s = repo.create({ cwd: '/x', worktree: '/x' })
    const t0 = repo.get(s.id)!.updatedAt
    await new Promise(r => setTimeout(r, 10))
    repo.touch(s.id)
    expect(repo.get(s.id)!.updatedAt > t0).toBe(true)
  })
})
```

- [ ] **Step 2: Run — FAIL**

```bash
pnpm vitest run packages/core/test/unit/session-repo.test.ts
```

- [ ] **Step 3: Implement `SessionRepo`**

`packages/core/src/storage/session-repo.ts`:
```ts
import type { Database } from 'better-sqlite3'
import { ulid, type SessionId } from '@glm/shared'

export interface SessionRow {
  id: SessionId
  createdAt: string
  updatedAt: string
  cwd: string
  worktree: string
  initialTask: string | null
  active: boolean
}

export interface CreateInput {
  cwd: string
  worktree: string
  initialTask?: string
}

export class SessionRepo {
  constructor(private db: Database) {}

  create(input: CreateInput): SessionRow {
    const id = ulid()
    const now = new Date().toISOString()
    this.db.prepare(`
      INSERT INTO sessions(id, created_at, updated_at, cwd, worktree, initial_task, active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(id, now, now, input.cwd, input.worktree, input.initialTask ?? null)
    return { id, createdAt: now, updatedAt: now, cwd: input.cwd, worktree: input.worktree,
             initialTask: input.initialTask ?? null, active: true }
  }

  get(id: SessionId): SessionRow | undefined {
    const r = this.db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(id) as Record<string, unknown> | undefined
    if (!r) return undefined
    return rowToSession(r)
  }

  list(opts: { limit?: number; activeOnly?: boolean } = {}): SessionRow[] {
    const where = opts.activeOnly ? 'WHERE active = 1' : ''
    const limit = opts.limit ?? 50
    const rows = this.db.prepare(`SELECT * FROM sessions ${where} ORDER BY updated_at DESC LIMIT ?`).all(limit) as Record<string, unknown>[]
    return rows.map(rowToSession)
  }

  touch(id: SessionId): void {
    this.db.prepare(`UPDATE sessions SET updated_at = ? WHERE id = ?`).run(new Date().toISOString(), id)
  }

  markInactive(id: SessionId): void {
    this.db.prepare(`UPDATE sessions SET active = 0, updated_at = ? WHERE id = ?`).run(new Date().toISOString(), id)
  }
}

function rowToSession(r: Record<string, unknown>): SessionRow {
  return {
    id: r.id as string,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    cwd: r.cwd as string,
    worktree: r.worktree as string,
    initialTask: (r.initial_task as string | null) ?? null,
    active: (r.active as number) === 1
  }
}
```

- [ ] **Step 4: Run — PASS**

```bash
pnpm vitest run packages/core/test/unit/session-repo.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): SessionRepo with create/get/list/touch/markInactive"
```

---

## Task 5: JSON-RPC 2.0 protocol (frame parser + dispatcher)

**Files:**
- Create: `packages/core/src/rpc/protocol.ts`
- Create: `packages/core/src/rpc/server.ts`
- Create: `packages/core/src/rpc/methods/ping.ts`
- Create: `packages/core/src/rpc/index.ts`
- Test: `packages/core/test/unit/rpc-protocol.test.ts`

- [ ] **Step 1: Write protocol types**

`packages/core/src/rpc/protocol.ts`:
```ts
import type { RpcRequest, RpcResponse } from '@glm/shared'

export type RpcHandler = (params: unknown, ctx: RpcContext) => Promise<unknown>

export interface RpcContext {
  clientId: string
  sessionId?: string
  log: import('../log').Logger
}

export const RPC_ERRORS = {
  PARSE_ERROR:      { code: -32700, message: 'Parse error' },
  INVALID_REQUEST:  { code: -32600, message: 'Invalid Request' },
  METHOD_NOT_FOUND: { code: -32601, message: 'Method not found' },
  INVALID_PARAMS:   { code: -32602, message: 'Invalid params' },
  INTERNAL_ERROR:   { code: -32603, message: 'Internal error' }
} as const

export type { RpcRequest, RpcResponse }
```

- [ ] **Step 2: Write failing test for frame parsing**

`packages/core/test/unit/rpc-protocol.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { framesFromChunk } from '../../src/rpc/server'

describe('framesFromChunk', () => {
  test('splits newline-delimited JSON into frames', () => {
    const { frames, leftover } = framesFromChunk(Buffer.from('{"a":1}\n{"b":2}\n'), '')
    expect(frames).toEqual(['{"a":1}', '{"b":2}'])
    expect(leftover).toBe('')
  })

  test('preserves partial frame as leftover', () => {
    const { frames, leftover } = framesFromChunk(Buffer.from('{"a":1}\n{"b":'), '')
    expect(frames).toEqual(['{"a":1}'])
    expect(leftover).toBe('{"b":')
  })

  test('joins with previous leftover', () => {
    const { frames, leftover } = framesFromChunk(Buffer.from('2}\n'), '{"b":')
    expect(frames).toEqual(['{"b":2}'])
    expect(leftover).toBe('')
  })
})
```

- [ ] **Step 3: Run — FAIL**

```bash
pnpm vitest run packages/core/test/unit/rpc-protocol.test.ts
```

- [ ] **Step 4: Implement RPC server**

`packages/core/src/rpc/server.ts`:
```ts
import type { Socket } from 'node:net'
import type { Logger } from '../log'
import type { RpcHandler, RpcContext } from './protocol'
import { RPC_ERRORS, type RpcRequest, type RpcResponse } from './protocol'

export function framesFromChunk(chunk: Buffer, leftover: string): { frames: string[]; leftover: string } {
  const combined = leftover + chunk.toString('utf8')
  const parts = combined.split('\n')
  const next = parts.pop() ?? ''
  return { frames: parts.filter(Boolean), leftover: next }
}

export class RpcServer {
  private handlers = new Map<string, RpcHandler>()
  constructor(private log: Logger) {}

  on(method: string, h: RpcHandler): void { this.handlers.set(method, h) }

  attach(socket: Socket, ctx: Omit<RpcContext, 'log'>): void {
    let leftover = ''
    const fullCtx: RpcContext = { ...ctx, log: this.log }
    socket.on('data', async (chunk) => {
      const { frames, leftover: lo } = framesFromChunk(chunk, leftover)
      leftover = lo
      for (const f of frames) await this.handleFrame(f, socket, fullCtx)
    })
    socket.on('error', (e) => this.log.warn({ err: e, clientId: ctx.clientId }, 'rpc socket error'))
  }

  private async handleFrame(frame: string, socket: Socket, ctx: RpcContext): Promise<void> {
    let req: RpcRequest
    try { req = JSON.parse(frame) as RpcRequest } catch {
      return this.send(socket, { jsonrpc: '2.0', id: null, error: RPC_ERRORS.PARSE_ERROR })
    }
    if (req.jsonrpc !== '2.0' || typeof req.method !== 'string') {
      return this.send(socket, { jsonrpc: '2.0', id: req.id ?? null, error: RPC_ERRORS.INVALID_REQUEST })
    }
    const h = this.handlers.get(req.method)
    if (!h) {
      return this.send(socket, { jsonrpc: '2.0', id: req.id, error: RPC_ERRORS.METHOD_NOT_FOUND })
    }
    try {
      const result = await h(req.params, ctx)
      this.send(socket, { jsonrpc: '2.0', id: req.id, result })
    } catch (e) {
      this.log.error({ err: e, method: req.method }, 'rpc handler error')
      this.send(socket, { jsonrpc: '2.0', id: req.id, error: { code: RPC_ERRORS.INTERNAL_ERROR.code, message: (e as Error).message } })
    }
  }

  private send(socket: Socket, res: RpcResponse): void {
    socket.write(JSON.stringify(res) + '\n')
  }
}
```

- [ ] **Step 5: Implement ping method + barrel**

`packages/core/src/rpc/methods/ping.ts`:
```ts
import type { RpcHandler } from '../protocol'
export const pingHandler: RpcHandler = async () => ({ pong: true, ts: new Date().toISOString() })
```

`packages/core/src/rpc/index.ts`:
```ts
export * from './protocol'
export { RpcServer, framesFromChunk } from './server'
export { pingHandler } from './methods/ping'
```

- [ ] **Step 6: Run all tests so far — PASS**

```bash
pnpm vitest run packages/core/test/unit/
```

Expected: all tests pass (db × 2, migrations × 2, session-repo × 4, rpc-protocol × 3).

- [ ] **Step 7: Commit**

```bash
git add packages/core
git commit -m "feat(core): JSON-RPC 2.0 server with frame parser + ping handler"
```

---

## Task 6: Unix socket server + PID file

**Files:**
- Create: `packages/core/src/daemon/pid.ts`
- Create: `packages/core/src/daemon/socket.ts`
- Test: `packages/core/test/unit/pid.test.ts`

- [ ] **Step 1: Write failing PID test**

`packages/core/test/unit/pid.test.ts`:
```ts
import { afterEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { readPid, writePid, removePid, isPidAlive } from '../../src/daemon/pid'

let tmp: string
afterEach(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }) })

describe('pid file', () => {
  test('writePid + readPid round-trip', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-pid-'))
    const f = path.join(tmp, 'd.pid')
    writePid(f, 12345)
    expect(readPid(f)).toBe(12345)
  })

  test('readPid returns undefined for missing file', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-pid-'))
    expect(readPid(path.join(tmp, 'none.pid'))).toBeUndefined()
  })

  test('readPid returns undefined for garbage', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-pid-'))
    const f = path.join(tmp, 'g.pid')
    writeFileSync(f, 'not-a-number')
    expect(readPid(f)).toBeUndefined()
  })

  test('isPidAlive(current)', () => {
    expect(isPidAlive(process.pid)).toBe(true)
  })

  test('isPidAlive(unlikely large)', () => {
    expect(isPidAlive(2_000_000_000)).toBe(false)
  })

  test('removePid is safe on missing file', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-pid-'))
    removePid(path.join(tmp, 'none.pid'))
    expect(existsSync(path.join(tmp, 'none.pid'))).toBe(false)
  })
})
```

- [ ] **Step 2: Implement pid module**

`packages/core/src/daemon/pid.ts`:
```ts
import { readFileSync, writeFileSync, mkdirSync, unlinkSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'

export function writePid(file: string, pid: number): void {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, String(pid), { mode: 0o600 })
}

export function readPid(file: string): number | undefined {
  if (!existsSync(file)) return undefined
  const raw = readFileSync(file, 'utf8').trim()
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

export function removePid(file: string): void {
  try { unlinkSync(file) } catch { /* ignore */ }
}

export function isPidAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true } catch { return false }
}
```

- [ ] **Step 3: Run PID tests — PASS**

```bash
pnpm vitest run packages/core/test/unit/pid.test.ts
```

- [ ] **Step 4: Implement socket lifecycle**

`packages/core/src/daemon/socket.ts`:
```ts
import { createServer, type Server, type Socket } from 'node:net'
import { unlinkSync, existsSync, chmodSync } from 'node:fs'
import type { Logger } from '../log'

export interface SocketServerOpts {
  path: string
  log: Logger
  onConnection: (sock: Socket) => void
}

export function createSocketServer(opts: SocketServerOpts): Server {
  if (existsSync(opts.path)) {
    try { unlinkSync(opts.path) } catch { /* ignore */ }
  }
  const server = createServer((sock) => {
    sock.setNoDelay(true)
    opts.onConnection(sock)
  })
  server.on('error', (e) => opts.log.error({ err: e }, 'socket server error'))
  server.listen(opts.path, () => {
    try { chmodSync(opts.path, 0o600) } catch { /* may be unsupported on tmpfs */ }
    opts.log.info({ path: opts.path }, 'socket listening')
  })
  return server
}

export function closeSocketServer(server: Server, path: string): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => {
      try { unlinkSync(path) } catch { /* ignore */ }
      resolve()
    })
  })
}
```

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(daemon): PID file + Unix socket server lifecycle"
```

---

## Task 7: Daemon class + lifecycle + session/chat RPC methods

**Files:**
- Create: `packages/core/src/rpc/methods/session.ts`
- Create: `packages/core/src/rpc/methods/chat.ts`
- Create: `packages/core/src/daemon/loader-hub.ts`
- Create: `packages/core/src/daemon/daemon.ts`
- Create: `packages/core/src/daemon/index.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Implement session RPC methods**

`packages/core/src/rpc/methods/session.ts`:
```ts
import { z } from 'zod'
import type { RpcHandler } from '../protocol'
import { RPC_ERRORS } from '../protocol'
import type { SessionRepo } from '../../storage/session-repo'

const CreateParams = z.object({ cwd: z.string(), worktree: z.string().optional(), initialTask: z.string().optional() })
const IdParams = z.object({ sessionId: z.string() })
const ListParams = z.object({ limit: z.number().int().positive().max(500).optional(), activeOnly: z.boolean().optional() }).optional()

export function makeSessionHandlers(repo: SessionRepo): Record<string, RpcHandler> {
  return {
    'session.create': async (p) => {
      const parsed = CreateParams.safeParse(p)
      if (!parsed.success) throw { ...RPC_ERRORS.INVALID_PARAMS, data: parsed.error.flatten() }
      const s = repo.create({ cwd: parsed.data.cwd, worktree: parsed.data.worktree ?? parsed.data.cwd, initialTask: parsed.data.initialTask })
      return s
    },
    'session.get': async (p) => {
      const parsed = IdParams.safeParse(p)
      if (!parsed.success) throw { ...RPC_ERRORS.INVALID_PARAMS, data: parsed.error.flatten() }
      return repo.get(parsed.data.sessionId)
    },
    'session.list': async (p) => {
      const parsed = ListParams.safeParse(p)
      if (!parsed.success) throw { ...RPC_ERRORS.INVALID_PARAMS, data: parsed.error.flatten() }
      return repo.list(parsed.data ?? {})
    },
    'session.touch': async (p) => {
      const parsed = IdParams.safeParse(p)
      if (!parsed.success) throw { ...RPC_ERRORS.INVALID_PARAMS, data: parsed.error.flatten() }
      repo.touch(parsed.data.sessionId)
      return { ok: true }
    },
    'session.markInactive': async (p) => {
      const parsed = IdParams.safeParse(p)
      if (!parsed.success) throw { ...RPC_ERRORS.INVALID_PARAMS, data: parsed.error.flatten() }
      repo.markInactive(parsed.data.sessionId)
      return { ok: true }
    }
  }
}
```

- [ ] **Step 2: Implement chat stub (echo)**

`packages/core/src/rpc/methods/chat.ts`:
```ts
import { z } from 'zod'
import type { RpcHandler } from '../protocol'
import { RPC_ERRORS } from '../protocol'

const SendParams = z.object({ sessionId: z.string(), text: z.string() })

// P1 stub: echo input as "response" (real LLM router in P6).
export const messageSendStub: RpcHandler = async (p) => {
  const parsed = SendParams.safeParse(p)
  if (!parsed.success) throw { ...RPC_ERRORS.INVALID_PARAMS, data: parsed.error.flatten() }
  return {
    sessionId: parsed.data.sessionId,
    role: 'assistant',
    content: parsed.data.text,            // echo
    model: 'stub-echo',
    ts: new Date().toISOString()
  }
}
```

- [ ] **Step 3: Implement LoaderHub (subsystem registration stub)**

`packages/core/src/daemon/loader-hub.ts`:
```ts
import type { Daemon } from './daemon'

export type SubsystemInit = (daemon: Daemon) => void | Promise<void>

class LoaderHubImpl {
  private subsystems: Array<{ name: string; init: SubsystemInit }> = []

  registerSubsystem(name: string, init: SubsystemInit): void {
    this.subsystems.push({ name, init })
  }

  async runAll(daemon: Daemon): Promise<void> {
    for (const { name, init } of this.subsystems) {
      try { await init(daemon) }
      catch (e) { throw new Error(`LoaderHub subsystem '${name}' failed: ${(e as Error).message}`) }
    }
  }

  /** Test-only — drop registered subsystems. */
  reset(): void { this.subsystems = [] }
}

// Process-wide singleton. Subsystems (P3+) call `LoaderHub.registerSubsystem(...)`
// at import-time; Daemon.start() invokes `LoaderHub.runAll(this)` once after
// migrations + handler wiring.
export const LoaderHub = new LoaderHubImpl()
```

P1 ships LoaderHub as an empty hub. Plans P3+ each export a module that calls
`LoaderHub.registerSubsystem(name, async (daemon) => { /* wire handlers */ })`
at import side-effect time. As long as the daemon-entry imports those modules
(transitively via barrel re-exports), the subsystems are picked up automatically
without further `daemon.ts` edits.

- [ ] **Step 4: Implement Daemon class**

`packages/core/src/daemon/daemon.ts`:
```ts
import type { Server, Socket } from 'node:net'
import { resolvePaths, ulid } from '@glm/shared'
import { createLogger, type Logger } from '../log'
import { openDb, runMigrations } from '../storage/db'
import { SessionRepo } from '../storage/session-repo'
import { RpcServer, pingHandler } from '../rpc'
import { makeSessionHandlers } from '../rpc/methods/session'
import { messageSendStub } from '../rpc/methods/chat'
import { createSocketServer, closeSocketServer } from './socket'
import { writePid, removePid, readPid, isPidAlive } from './pid'
import { LoaderHub } from './loader-hub'
import type { Database } from 'better-sqlite3'

export interface DaemonOpts { home?: string }

export class Daemon {
  private paths = resolvePaths({ home: undefined })
  private log: Logger
  private db?: Database
  private repo?: SessionRepo
  private rpc?: RpcServer
  private socketServer?: Server
  private startedAt?: Date

  constructor(opts: DaemonOpts = {}) {
    if (opts.home) this.paths = resolvePaths({ home: opts.home })
    this.log = createLogger('daemon', { file: this.paths.log })
  }

  async start(): Promise<void> {
    const existing = readPid(this.paths.pid)
    if (existing && isPidAlive(existing)) {
      throw new Error(`Daemon already running (PID ${existing}). Use 'glm daemon stop' first.`)
    }
    this.db = openDb(`${this.paths.root}/registry.db`)
    runMigrations(this.db)
    this.repo = new SessionRepo(this.db)
    this.rpc = new RpcServer(this.log)

    this.rpc.on('ping', pingHandler)
    for (const [name, h] of Object.entries(makeSessionHandlers(this.repo))) this.rpc.on(name, h)
    this.rpc.on('message.send', messageSendStub)
    this.rpc.on('daemon.status', async () => ({
      pid: process.pid,
      uptimeMs: this.startedAt ? Date.now() - this.startedAt.getTime() : 0,
      version: '0.1.0-alpha.1'
    }))
    this.rpc.on('daemon.shutdown', async () => { setImmediate(() => this.stop()); return { ok: true } })
    // Stub — P8 replaces with real dashboard event stream. P1 returns a stub
    // stream id so TUI/Dashboard callers don't see a METHOD_NOT_FOUND.
    this.rpc.on('dashboard.subscribe', async () => ({
      ok: true,
      streamId: ulid(),
      version: 'stub-p1'
    }))

    // Run all subsystems registered via LoaderHub (none in P1; P3+ populate).
    await LoaderHub.runAll(this)

    this.socketServer = createSocketServer({
      path: this.paths.socket,
      log: this.log,
      onConnection: (sock: Socket) => this.rpc!.attach(sock, { clientId: ulid() })
    })

    writePid(this.paths.pid, process.pid)
    this.startedAt = new Date()
    this.log.info({ pid: process.pid, socket: this.paths.socket }, 'daemon started')

    process.on('SIGTERM', () => this.stop())
    process.on('SIGINT',  () => this.stop())
  }

  async stop(): Promise<void> {
    this.log.info('daemon stopping')
    if (this.socketServer) await closeSocketServer(this.socketServer, this.paths.socket)
    if (this.db) this.db.close()
    removePid(this.paths.pid)
    this.log.info('daemon stopped')
    process.exit(0)
  }
}
```

- [ ] **Step 5: Update core barrels**

`packages/core/src/daemon/index.ts`:
```ts
export { Daemon } from './daemon'
export { LoaderHub } from './loader-hub'
export * from './pid'
export * from './socket'
```

`packages/core/src/index.ts`:
```ts
export * from './log'
export * from './storage'
export * from './rpc'
export * from './daemon'
```

- [ ] **Step 6: Build to verify wiring**

```bash
pnpm build
```

Expected: clean build, no TS errors.

- [ ] **Step 7: Commit**

```bash
git add packages/core
git commit -m "feat(daemon): Daemon class wires socket + RPC + SQLite + handlers + LoaderHub + dashboard.subscribe stub"
```

---

## Task 8: CLI entry point + commander setup + auto-spawn

**Files:**
- Create: `packages/cli/src/bin.ts`
- Create: `packages/cli/src/registry.ts`
- Create: `packages/cli/src/commands/index.ts` (barrel — side-effect imports)
- Create: `packages/cli/src/auto-spawn.ts`
- Create: `packages/cli/src/commands/daemon.ts`

- [ ] **Step 1: Implement auto-spawn helper**

`packages/cli/src/auto-spawn.ts`:
```ts
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { setTimeout as wait } from 'node:timers/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolvePaths } from '@glm/shared'

const HERE = path.dirname(fileURLToPath(import.meta.url))

export async function ensureDaemonRunning(opts: { timeoutMs?: number } = {}): Promise<void> {
  const paths = resolvePaths()
  if (existsSync(paths.socket)) return            // assume alive; caller will surface errors

  // spawn detached daemon
  const daemonBin = path.join(HERE, 'daemon-entry.js')
  const child = spawn(process.execPath, [daemonBin], {
    detached: true,
    stdio: 'ignore',
    env: process.env
  })
  child.unref()

  const deadline = Date.now() + (opts.timeoutMs ?? 4000)
  while (Date.now() < deadline) {
    if (existsSync(paths.socket)) return
    await wait(50)
  }
  throw new Error(`Daemon socket did not appear at ${paths.socket} within ${opts.timeoutMs ?? 4000}ms`)
}
```

- [ ] **Step 2: Add daemon-entry helper (the detached child runs this)**

`packages/cli/src/daemon-entry.ts`:
```ts
import { Daemon } from '@glm/core'
const d = new Daemon()
d.start().catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 3: Implement RPC client (simple promise-by-id)**

`packages/cli/src/rpc-client.ts`:
```ts
import { createConnection, type Socket } from 'node:net'
import { resolvePaths } from '@glm/shared'

export class RpcClient {
  private socket?: Socket
  private nextId = 1
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  private leftover = ''

  async connect(): Promise<void> {
    const paths = resolvePaths()
    await new Promise<void>((resolve, reject) => {
      const s = createConnection(paths.socket, () => resolve())
      s.on('error', reject)
      s.on('data', (chunk) => this.onData(chunk))
      s.on('close', () => {
        for (const { reject } of this.pending.values()) reject(new Error('connection closed'))
        this.pending.clear()
      })
      this.socket = s
    })
  }

  private onData(chunk: Buffer): void {
    const combined = this.leftover + chunk.toString('utf8')
    const parts = combined.split('\n')
    this.leftover = parts.pop() ?? ''
    for (const f of parts.filter(Boolean)) {
      const msg = JSON.parse(f) as { id: number; result?: unknown; error?: { code: number; message: string } }
      const p = this.pending.get(msg.id)
      if (!p) continue
      this.pending.delete(msg.id)
      if (msg.error) p.reject(new Error(`${msg.error.code}: ${msg.error.message}`))
      else p.resolve(msg.result)
    }
  }

  call<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.socket) throw new Error('not connected')
    const id = this.nextId++
    const frame = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
      this.socket!.write(frame)
    })
  }

  close(): void { this.socket?.end() }
}
```

- [ ] **Step 4: Implement command registry helper**

`packages/cli/src/registry.ts`:
```ts
import type { Command } from 'commander'

/**
 * Each `commands/*.ts` calls `registerCommand(registerXxxCommand)` at import time.
 * `bin.ts` imports the `commands/` barrel (side-effect import) then calls
 * `registerAll(program)`. This avoids the "every plan textually edits bin.ts"
 * anti-pattern: new commands just push into this list at import time.
 */
const registrations: Array<(p: Command) => void> = []

export function registerCommand(fn: (p: Command) => void): void {
  registrations.push(fn)
}

export function registerAll(program: Command): void {
  for (const fn of registrations) fn(program)
}

/** Test-only — clear registrations between cases. */
export function _resetRegistry(): void {
  registrations.length = 0
}
```

- [ ] **Step 5: Implement daemon subcommand (and self-register)**

`packages/cli/src/commands/daemon.ts`:
```ts
import { Command } from 'commander'
import kleur from 'kleur'
import { existsSync, readFileSync } from 'node:fs'
import { resolvePaths } from '@glm/shared'
import { ensureDaemonRunning } from '../auto-spawn'
import { RpcClient } from '../rpc-client'
import { registerCommand } from '../registry'

export function registerDaemonCommand(program: Command): void {
  const daemon = program.command('daemon').description('Manage glm daemon')

  daemon.command('start').description('Start the daemon').action(async () => {
    await ensureDaemonRunning()
    console.log(kleur.green('✓') + ' daemon running')
  })

  daemon.command('status').description('Show daemon status').action(async () => {
    const paths = resolvePaths()
    if (!existsSync(paths.socket)) { console.log(kleur.gray('● daemon not running')); return }
    const cli = new RpcClient(); await cli.connect()
    const s = await cli.call<{ pid: number; uptimeMs: number; version: string }>('daemon.status')
    cli.close()
    const pidFromFile = readFileSync(paths.pid, 'utf8').trim()
    console.log(`${kleur.green('●')} pid ${s.pid} (file: ${pidFromFile})  uptime ${Math.round(s.uptimeMs/1000)}s  v${s.version}`)
  })

  daemon.command('stop').description('Stop the daemon').action(async () => {
    const paths = resolvePaths()
    if (!existsSync(paths.socket)) { console.log(kleur.gray('● not running')); return }
    const cli = new RpcClient(); await cli.connect()
    try { await cli.call('daemon.shutdown') } catch { /* normal: socket closes mid-flight */ }
    cli.close()
    console.log(kleur.green('✓') + ' stopped')
  })

  daemon.command('restart').description('Restart the daemon').action(async () => {
    const paths = resolvePaths()
    if (existsSync(paths.socket)) {
      const cli = new RpcClient(); await cli.connect()
      try { await cli.call('daemon.shutdown') } catch { /* ok */ }
      cli.close()
      // brief delay so socket file is fully removed
      await new Promise(r => setTimeout(r, 200))
    }
    await ensureDaemonRunning()
    console.log(kleur.green('✓') + ' restarted')
  })
}

// Self-register so the commands barrel just imports this module for side-effects.
registerCommand(registerDaemonCommand)
```

- [ ] **Step 6: Implement the commands barrel (side-effect imports only)**

`packages/cli/src/commands/index.ts`:
```ts
// Importing each command module for its side-effect registration call.
// Adding a new CLI command = drop a file under commands/ and add one line here.
import './daemon'
import './sessions'
import './attach'
import './chat'
import './doctor'
```

Note: the stub command files written in Step 8 below (sessions/attach/chat/doctor) each ALSO end with `registerCommand(registerXxxCommand)` — same self-registration pattern as `daemon.ts`. Task 9 / Task 10 replace those stubs with full implementations but preserve the trailing `registerCommand(...)` line.

- [ ] **Step 7: Implement bin entry (no command-list edits ever again)**

`packages/cli/src/bin.ts`:
```ts
#!/usr/bin/env node
import { Command } from 'commander'
import { registerAll } from './registry'
import './commands'   // side-effect: each command file registers itself

const program = new Command()
program.name('glm').description('GLM coding agent CLI').version('0.1.0-alpha.1')

registerAll(program)

program.parseAsync(process.argv).catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
```

- [ ] **Step 8: Build and smoke test**

```bash
pnpm build
node packages/cli/dist/bin.js --help
```

Expected: `Usage: glm [options] [command]` listing subcommands.
Note: `sessions`/`attach`/`chat`/`doctor` registrations will be replaced by Tasks 9–10 — for now stub them out so the `commands/` barrel resolves. Each stub follows the self-registration pattern:

```ts
// packages/cli/src/commands/sessions.ts
import type { Command } from 'commander'
import { registerCommand } from '../registry'
export function registerSessionsCommand(p: Command): void { p.command('sessions').action(() => {}) }
registerCommand(registerSessionsCommand)

// packages/cli/src/commands/attach.ts
import type { Command } from 'commander'
import { registerCommand } from '../registry'
export function registerAttachCommand(p: Command): void { p.command('attach <id>').action(() => {}) }
registerCommand(registerAttachCommand)

// packages/cli/src/commands/chat.ts
import type { Command } from 'commander'
import { registerCommand } from '../registry'
export function registerChatCommand(p: Command): void { p.argument('[text]').action(() => {}) }
registerCommand(registerChatCommand)

// packages/cli/src/commands/doctor.ts
import type { Command } from 'commander'
import { registerCommand } from '../registry'
export function registerDoctorCommand(p: Command): void { p.command('doctor').action(() => {}) }
registerCommand(registerDoctorCommand)
```

- [ ] **Step 9: Manual smoke test daemon lifecycle**

```bash
GLM_HOME=/tmp/glm-smoke-$$ node packages/cli/dist/bin.js daemon start
GLM_HOME=/tmp/glm-smoke-$$ node packages/cli/dist/bin.js daemon status
GLM_HOME=/tmp/glm-smoke-$$ node packages/cli/dist/bin.js daemon stop
```

Expected: each prints success line, no hangs.

- [ ] **Step 10: Commit**

```bash
git add packages
git commit -m "feat(cli): bin entry + auto-spawn + command registry + daemon start/status/stop/restart"
```

---

## Task 9: `glm sessions`, `glm attach`, `glm "text"`

**Files:**
- Create: `packages/cli/src/commands/sessions.ts`
- Create: `packages/cli/src/commands/attach.ts`
- Create: `packages/cli/src/commands/chat.ts`

- [ ] **Step 1: Implement `sessions`**

`packages/cli/src/commands/sessions.ts`:
```ts
import { Command } from 'commander'
import kleur from 'kleur'
import { ensureDaemonRunning } from '../auto-spawn'
import { RpcClient } from '../rpc-client'
import { registerCommand } from '../registry'

interface SessionRow {
  id: string; createdAt: string; updatedAt: string;
  cwd: string; worktree: string; initialTask: string | null; active: boolean
}

export function registerSessionsCommand(program: Command): void {
  program.command('sessions')
    .description('List sessions')
    .option('--limit <n>', 'max rows', '20')
    .option('--all', 'include inactive', false)
    .action(async (opts: { limit: string; all: boolean }) => {
      await ensureDaemonRunning()
      const cli = new RpcClient(); await cli.connect()
      const rows = await cli.call<SessionRow[]>('session.list', { limit: Number(opts.limit), activeOnly: !opts.all })
      cli.close()
      if (rows.length === 0) { console.log(kleur.gray('(no sessions)')); return }
      for (const r of rows) {
        const flag = r.active ? kleur.green('●') : kleur.gray('○')
        console.log(`${flag} ${r.id.slice(0,10)}  ${r.updatedAt}  ${kleur.dim(r.cwd)}  ${r.initialTask ?? ''}`)
      }
    })
}

registerCommand(registerSessionsCommand)
```

- [ ] **Step 2: Implement `attach`**

`packages/cli/src/commands/attach.ts`:
```ts
import { Command } from 'commander'
import kleur from 'kleur'
import { ensureDaemonRunning } from '../auto-spawn'
import { RpcClient } from '../rpc-client'
import { registerCommand } from '../registry'

export function registerAttachCommand(program: Command): void {
  program.command('attach <sessionId>')
    .description('Attach to an existing session (P1: just verifies it exists)')
    .action(async (sessionId: string) => {
      await ensureDaemonRunning()
      const cli = new RpcClient(); await cli.connect()
      const s = await cli.call<{ id: string; cwd: string; initialTask: string | null } | undefined>('session.get', { sessionId })
      cli.close()
      if (!s) { console.error(kleur.red(`session ${sessionId} not found`)); process.exit(2) }
      console.log(`${kleur.green('●')} attached ${s.id}  cwd=${s.cwd}  task="${s.initialTask ?? ''}"`)
    })
}

registerCommand(registerAttachCommand)
```

- [ ] **Step 3: Implement `chat` (the bare `glm "text"`)**

`packages/cli/src/commands/chat.ts`:
```ts
import { Command } from 'commander'
import kleur from 'kleur'
import { ensureDaemonRunning } from '../auto-spawn'
import { RpcClient } from '../rpc-client'
import { registerCommand } from '../registry'

export function registerChatCommand(program: Command): void {
  program
    .argument('[text...]', 'text to send (P1: echoes back)')
    .option('-s, --session <id>', 'existing session to use')
    .description('Send a chat turn (default command)')
    .action(async (textParts: string[], opts: { session?: string }) => {
      const text = textParts.join(' ').trim()
      if (!text) {
        // no text + no subcommand → show help. commander handles this if .helpInformation is invoked
        program.help()
        return
      }
      await ensureDaemonRunning()
      const cli = new RpcClient(); await cli.connect()
      let sid = opts.session
      if (!sid) {
        const s = await cli.call<{ id: string }>('session.create', { cwd: process.cwd(), initialTask: text })
        sid = s.id
      }
      const r = await cli.call<{ content: string; model: string }>('message.send', { sessionId: sid, text })
      cli.close()
      console.log(`${kleur.cyan('assistant')} [${r.model}]  ${r.content}`)
      console.log(kleur.gray(`session ${sid?.slice(0,10)}…`))
    })
}

registerCommand(registerChatCommand)
```

- [ ] **Step 4: Build + smoke**

```bash
pnpm build
export GLM_HOME=/tmp/glm-smoke-$$
node packages/cli/dist/bin.js daemon start
node packages/cli/dist/bin.js "echo hello"
node packages/cli/dist/bin.js sessions
node packages/cli/dist/bin.js daemon stop
```

Expected:
- `echo hello` prints `assistant [stub-echo]  echo hello` + `session <id>...`
- `sessions` lists the one session
- `daemon stop` exits cleanly

- [ ] **Step 5: Commit**

```bash
git add packages
git commit -m "feat(cli): sessions / attach / chat (echo stub) commands"
```

---

## Task 10: `glm doctor` skeleton

**Files:**
- Create: `packages/cli/src/commands/doctor.ts`

- [ ] **Step 1: Implement doctor**

`packages/cli/src/commands/doctor.ts`:
```ts
import { Command } from 'commander'
import kleur from 'kleur'
import { existsSync, statSync } from 'node:fs'
import { resolvePaths } from '@glm/shared'
import { RpcClient } from '../rpc-client'
import { readPid, isPidAlive } from '@glm/core'
import { registerCommand } from '../registry'

interface Check { name: string; ok: boolean; detail: string }

export function registerDoctorCommand(program: Command): void {
  program.command('doctor')
    .description('Health check (P1: runtime + daemon + socket + db)')
    .action(async () => {
      const checks: Check[] = []
      const paths = resolvePaths()
      const major = Number(process.versions.node.split('.')[0])
      checks.push({ name: 'Node >= 22', ok: major >= 22, detail: process.versions.node })
      checks.push({ name: '~/.glm exists', ok: existsSync(paths.root), detail: paths.root })
      checks.push({ name: 'daemon.pid', ok: existsSync(paths.pid), detail: paths.pid })

      const pid = readPid(paths.pid)
      checks.push({ name: 'daemon PID alive', ok: !!pid && isPidAlive(pid), detail: pid ? `pid ${pid}` : '(no pid)' })
      checks.push({ name: 'daemon.sock exists', ok: existsSync(paths.socket), detail: paths.socket })

      if (existsSync(paths.socket)) {
        try {
          const cli = new RpcClient(); await cli.connect()
          const s = await cli.call<{ version: string }>('daemon.status')
          cli.close()
          checks.push({ name: 'RPC ping', ok: true, detail: `version ${s.version}` })
        } catch (e) {
          checks.push({ name: 'RPC ping', ok: false, detail: (e as Error).message })
        }
      } else {
        checks.push({ name: 'RPC ping', ok: false, detail: '(socket missing)' })
      }

      const dbFile = `${paths.root}/registry.db`
      checks.push({ name: 'registry.db', ok: existsSync(dbFile), detail: existsSync(dbFile) ? `${statSync(dbFile).size}B` : '(missing)' })

      let allOk = true
      for (const c of checks) {
        const mark = c.ok ? kleur.green('✓') : kleur.red('✗')
        console.log(`${mark} ${c.name.padEnd(24)} ${kleur.dim(c.detail)}`)
        if (!c.ok) allOk = false
      }
      console.log()
      console.log(allOk ? kleur.green('HEALTHY') : kleur.yellow('WARNINGS — see above'))
      process.exit(allOk ? 0 : 1)
    })
}

registerCommand(registerDoctorCommand)
```

- [ ] **Step 2: Build + manual smoke test**

```bash
pnpm build
export GLM_HOME=/tmp/glm-smoke-$$
node packages/cli/dist/bin.js daemon start
node packages/cli/dist/bin.js doctor
node packages/cli/dist/bin.js daemon stop
node packages/cli/dist/bin.js doctor    # should report ✗ on socket
```

Expected: first doctor all ✓, second doctor shows socket/RPC ✗ and exits 1.

- [ ] **Step 3: Commit**

```bash
git add packages
git commit -m "feat(cli): doctor command (runtime + daemon + socket + db checks)"
```

---

## Task 11: Integration test — daemon lifecycle + RPC round-trip

**Files:**
- Create: `packages/core/test/integration/daemon-lifecycle.test.ts`
- Create: `packages/core/test/integration/echo-chat.test.ts`
- Create: `packages/core/test/integration/_helper.ts`

- [ ] **Step 1: Write integration test helper**

`packages/core/test/integration/_helper.ts`:
```ts
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { setTimeout as wait } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { spawn, type ChildProcess } from 'node:child_process'

// ESM-safe __dirname equivalent
const HERE = path.dirname(fileURLToPath(import.meta.url))

export interface SpawnedDaemon {
  home: string
  socket: string
  child: ChildProcess
  shutdown: () => Promise<void>
}

export interface SpawnOpts {
  home?: string   // override; default is fresh mkdtemp
}

export async function spawnDaemonProcess(opts: SpawnOpts = {}): Promise<SpawnedDaemon> {
  const home = opts.home ?? mkdtempSync(path.join(os.tmpdir(), 'glm-int-'))
  const glmHome = path.join(home, '.glm')
  const socket = path.join(glmHome, 'daemon.sock')
  // _helper.ts lives at: packages/core/test/integration/_helper.ts
  // daemon-entry.js (built) lives at: packages/cli/dist/daemon-entry.js
  // So we go up 4 levels then into cli/dist.
  const entry = path.resolve(HERE, '../../../cli/dist/daemon-entry.js')
  const child = spawn(process.execPath, [entry], {
    detached: false,
    stdio: 'pipe',
    env: { ...process.env, GLM_HOME: glmHome }
  })
  for (let i = 0; i < 80; i++) {
    if (existsSync(socket)) break
    await wait(50)
  }
  if (!existsSync(socket)) {
    child.kill('SIGTERM')
    throw new Error(`daemon socket did not appear at ${socket}`)
  }
  return {
    home,
    socket,
    child,
    shutdown: async () => {
      child.kill('SIGTERM')
      await new Promise<void>((resolve) => child.once('exit', () => resolve()))
      // only clean up if we created the dir
      if (!opts.home) rmSync(home, { recursive: true, force: true })
    }
  }
}
```

- [ ] **Step 2: Write daemon-lifecycle integration test**

`packages/core/test/integration/daemon-lifecycle.test.ts`:
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

describe('daemon lifecycle (integration)', () => {
  test('starts, responds to ping, status, shuts down', async () => {
    const d = await spawnDaemonProcess()
    try {
      const ping = await rpcCall(d.socket, 'ping')
      expect(ping).toMatchObject({ pong: true })
      const status = await rpcCall(d.socket, 'daemon.status') as { version: string }
      expect(status.version).toMatch(/^0\.1\.0/)
    } finally {
      await d.shutdown()
    }
  })
})
```

- [ ] **Step 3: Echo chat integration test**

`packages/core/test/integration/echo-chat.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { spawnDaemonProcess } from './_helper'
import { createConnection } from 'node:net'

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

describe('chat echo round-trip (integration)', () => {
  test('create session + send message → echo response', async () => {
    const d = await spawnDaemonProcess()
    try {
      const s = await rpcCall(d.socket, 'session.create', { cwd: '/tmp', initialTask: 'hi' }) as { id: string }
      expect(s.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
      const r = await rpcCall(d.socket, 'message.send', { sessionId: s.id, text: 'hello world' }) as { content: string; model: string }
      expect(r.content).toBe('hello world')
      expect(r.model).toBe('stub-echo')
      const list = await rpcCall(d.socket, 'session.list') as { id: string }[]
      expect(list.find(x => x.id === s.id)).toBeTruthy()
    } finally {
      await d.shutdown()
    }
  })
})
```

- [ ] **Step 4: Build then run all tests**

```bash
pnpm build
pnpm vitest run
```

Expected: all unit + integration tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages
git commit -m "test(core): integration tests for daemon lifecycle + echo chat round-trip"
```

---

## Task 12: Crash recovery — stale PID + leftover socket cleanup

**Files:**
- Modify: `packages/core/src/daemon/daemon.ts`
- Create: `packages/core/test/integration/crash-recovery.test.ts`

- [ ] **Step 1: Write failing crash-recovery test**

`packages/core/test/integration/crash-recovery.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { spawnDaemonProcess } from './_helper'
import { createConnection } from 'node:net'

async function pingViaSocket(socket: string): Promise<boolean> {
  return new Promise((resolve) => {
    const s = createConnection(socket)
    s.on('connect', () => { s.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }) + '\n') })
    s.on('data', () => { s.end(); resolve(true) })
    s.on('error', () => resolve(false))
    setTimeout(() => { s.destroy(); resolve(false) }, 1000)
  })
}

describe('crash recovery (integration)', () => {
  test('daemon starts even when stale PID file points to dead process', async () => {
    // pre-write a stale PID to simulate prior crash
    const homeDir = path.join('/tmp', `glm-crash-${process.pid}-${Date.now()}`)
    mkdirSync(path.join(homeDir, '.glm'), { recursive: true })
    writeFileSync(path.join(homeDir, '.glm', 'daemon.pid'), '2000000000') // unlikely to be a live PID

    // spawn daemon pointing GLM_HOME at our pre-staged dir
    const d = await spawnDaemonProcess({ home: homeDir })
    try {
      expect(await pingViaSocket(d.socket)).toBe(true)
    } finally {
      await d.shutdown()
      // we own the dir since we passed home; clean up here
      rmSync(homeDir, { recursive: true, force: true })
    }
  })
})
```

Note: this test uses the `{ home: homeDir }` form of `spawnDaemonProcess` (already supported by the helper from Task 11 Step 1). The helper does NOT auto-clean when `home` is supplied — the test owns the dir.

- [ ] **Step 2: Update daemon.start() — handle stale PID**

Modify `packages/core/src/daemon/daemon.ts` `start()` method's existing PID check:

```ts
async start(): Promise<void> {
  const existing = readPid(this.paths.pid)
  if (existing) {
    if (isPidAlive(existing)) {
      throw new Error(`Daemon already running (PID ${existing}). Use 'glm daemon stop' first.`)
    } else {
      // stale PID — clean up
      this.log.warn({ stalePid: existing }, 'removing stale PID file')
      removePid(this.paths.pid)
    }
  }
  // ... rest unchanged: openDb / runMigrations / etc.
}
```

The existing `createSocketServer` already unlinks stale socket file (Task 6 Step 4) — no change needed there.

- [ ] **Step 3: Run crash-recovery test — PASS**

```bash
pnpm build
pnpm vitest run packages/core/test/integration/crash-recovery.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run full suite**

```bash
pnpm vitest run
```

Expected: all 4 unit files (~15 tests) + 3 integration files (~5 tests) pass.

- [ ] **Step 5: Coverage check**

```bash
pnpm vitest run --coverage
```

Expected: core/storage > 80%, core/rpc > 80%, core/daemon > 70% (lifecycle has spawn-paths that integration covers but coverage tool sees as missed in unit). If lower, add targeted unit tests for specific branches.

- [ ] **Step 6: Final commit**

```bash
git add packages
git commit -m "feat(daemon): handle stale PID gracefully + crash recovery integration test"
```

---

## P1 Completion — Verification Checklist

Before claiming P1 done, run all of these and confirm output:

- [ ] **Build clean:** `pnpm build` → no errors
- [ ] **All tests pass:** `pnpm vitest run` → all green, total ~20 tests
- [ ] **Daemon lifecycle manual smoke:**
  ```bash
  export GLM_HOME=/tmp/glm-smoke-$$
  rm -rf $GLM_HOME
  node packages/cli/dist/bin.js daemon start
  node packages/cli/dist/bin.js daemon status     # expect: pid X uptime Ys v0.1.0...
  node packages/cli/dist/bin.js "echo hello"      # expect: assistant [stub-echo] echo hello
  node packages/cli/dist/bin.js sessions          # expect: 1 row
  node packages/cli/dist/bin.js doctor            # expect: all ✓, HEALTHY
  node packages/cli/dist/bin.js daemon stop       # expect: ✓ stopped
  node packages/cli/dist/bin.js doctor            # expect: ✗ on socket/RPC, WARNINGS
  ```
- [ ] **Crash recovery:**
  ```bash
  rm -rf $GLM_HOME
  mkdir -p $GLM_HOME
  echo "2000000000" > $GLM_HOME/daemon.pid       # stale PID
  node packages/cli/dist/bin.js daemon start     # expect: still works
  node packages/cli/dist/bin.js daemon stop
  ```
- [ ] **No leaked processes:** `ps aux | grep daemon-entry` shows nothing after stop.

If anything above fails, fix before declaring P1 done.

---

## What P1 does NOT include (deferred to later P-plans)

These are intentionally out of scope for P1:

- **No real LLM call** — `message.send` returns echo. Real GLM API integration is in **P6 (LLM Router)**.
- **No tools (Read/Edit/Bash/etc.)** — those are **P3**.
- **No MCP / Skill / Plugin / Hook system** — **P4 / P5**.
- **No TUI** — `glm` here is one-shot CLI only. Ink TUI REPL is **P2**.
- **No orchestrator / sub-agent fan-out** — **P8**.
- **No memory / AGENTS.md cascade / compaction** — **P7**.
- **No checkpoint / journal / yolo / long-horizon** — **P10**.
- **No process recycling, idle cold-out** — basic SIGTERM handling only.
- **Session-worker is in-daemon** (no fork yet) — full session-worker child process model arrives in **P8**.

P1 is the **foundation**. Subsequent P-plans build on this exact contract: daemon owns SQLite, CLI talks JSON-RPC over Unix socket, sessions persist, lifecycle is clean.
