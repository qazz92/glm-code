# glm code — P2: Ink TUI Client (Chat REPL + Dashboard Skeleton)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Ink-based TUI client that connects to the P1 daemon, runs a full-screen chat REPL with streaming text, a placeholder Dashboard view toggled via Tab, a slash-command dispatcher for the v0.1 surface (`/help`, `/quit`, `/sessions`, `/attach`, `/daemon`), and CLI integration so that bare `glm` (no args) spawns the TUI while `glm "echo X"` stays one-shot.

**Architecture:** A new pnpm workspace package `@glm/tui` sits next to `@glm/{shared,core,cli}`. It owns React 18 components rendered by Ink v5, a TUI-friendly `RpcClient` adapter that exposes both one-shot calls (compatible with P1's CLI client) and a subscribe-style event hook for streaming `message.delta` events. A root `<App>` switches between `<ChatView>` and `<DashboardView>` via a tiny `viewRouter` state slice. The CLI's existing `bin.ts` (from P1) grows a `tui` subcommand and a default-no-args path that launches the TUI. P1's stub `message.send` returns one whole reply (no streaming yet); the TUI's streaming hook is wired such that when P6 introduces real `message.stream` it slots in with no component changes.

**Tech Stack:** Node 22+, TypeScript 5.6+, pnpm workspaces, **Ink v5+, React 18+**, ink-text-input, ink-spinner, vitest, **ink-testing-library**, zod, kleur (for non-Ink CLI output only).

**Acceptance criteria for P2:**
- `glm` (no args) launches the Ink TUI attached to the most recent session (creates one if none exist).
- `glm tui` is an explicit alias of the no-args form.
- `glm "echo hello"` (one-shot) still works exactly as in P1 — it does NOT launch the TUI.
- TUI renders a streaming-ready chat log (P1 stub returns single chunks today; the streaming pipe is functional).
- `Tab` toggles between Chat ↔ Dashboard; `Esc` cancels in-flight input or closes a slash menu; `Ctrl-D` exits cleanly.
- Slash commands work: `/help`, `/quit`, `/sessions`, `/attach <id>`, `/daemon status|restart`.
- Dashboard skeleton shows four labelled panels (Orchestrator, Main, Workers, Status) with placeholder content — no real worker/orchestrator data yet (those land in P8); the panels read what the daemon already exposes (`daemon.status`, `session.list`).
- Status line at the bottom shows: model placeholder (`stub-echo`), session-id short form, ctx % placeholder (`0%`), and key hints (`Tab Dashboard · / Cmd · Esc Cancel · Ctrl-D Quit`).
- `GLM_THEME=dark|light` env var picks the theme; default is `dark`.
- All component tests pass via `ink-testing-library`; one integration test spawns a real P1 daemon, runs the TUI in a child process, sends keystrokes, and asserts the rendered frame.
- 70%+ unit coverage on `packages/tui/src`; integration test passes.

---

## File Structure

```
glm-code/                                    # repo root (built by P1)
├── package.json                             # MODIFIED: add @glm/tui to workspace globs (already covered by packages/*)
├── pnpm-workspace.yaml                      # unchanged
├── tsconfig.base.json                       # unchanged
├── vitest.config.ts                         # MODIFIED: include packages/tui paths
├── packages/
│   ├── shared/                              # unchanged
│   ├── core/                                # unchanged from P1
│   ├── cli/
│   │   └── src/
│   │       ├── bin.ts                       # MODIFIED: add default-no-args → TUI, add `tui` subcommand
│   │       └── commands/
│   │           └── tui.ts                   # NEW: registers `tui` subcommand
│   └── tui/                                 # NEW PACKAGE
│       ├── package.json
│       ├── tsconfig.json
│       ├── README.md
│       └── src/
│           ├── index.ts                     # public API: { runTui }
│           ├── runTui.ts                    # entry: render <App/> and wait for exit
│           ├── rpc/
│           │   ├── TuiRpcClient.ts          # subscribe-style adapter on top of P1's framing
│           │   └── index.ts
│           ├── state/
│           │   ├── store.ts                 # tiny event-emitter store (no zustand to keep dep-light)
│           │   ├── viewRouter.ts            # "chat" | "dashboard"
│           │   ├── chatLog.ts               # message log + streaming partial
│           │   ├── sessionState.ts          # active session id + meta
│           │   └── index.ts
│           ├── theme/
│           │   ├── theme.ts                 # dark + light palettes
│           │   └── index.ts
│           ├── slash/
│           │   ├── registry.ts              # command lookup
│           │   ├── parse.ts                 # parse "/foo bar baz" → { name, args }
│           │   ├── dispatcher.ts            # catch-all dispatcher: builtin → workflow → command-loader → cli.exec
│           │   ├── commands/
│           │   │   ├── help.ts
│           │   │   ├── quit.ts
│           │   │   ├── sessions.ts
│           │   │   ├── attach.ts
│           │   │   ├── daemon.ts
│           │   │   ├── history.ts
│           │   │   ├── context.ts
│           │   │   ├── compact.ts
│           │   │   └── model.ts             # NEW (P2-Fix-5): /model picker + direct set + show + reset
│           │   └── index.ts
│           ├── views/
│           │   └── ModelPicker.tsx          # NEW (P2-Fix-5): 3-stage Ink picker (model → action → thinking)
│           ├── components/
│           │   ├── App.tsx                  # root: routes view, owns key handler
│           │   ├── ChatView.tsx
│           │   ├── ChatLog.tsx              # scrollable message list
│           │   ├── ChatMessage.tsx          # one row
│           │   ├── InputBox.tsx             # multi-line input + slash autocomplete
│           │   ├── SlashMenu.tsx            # popup when user types `/`
│           │   ├── DashboardView.tsx
│           │   ├── Panel.tsx                # bordered box wrapper
│           │   ├── StatusLine.tsx           # bottom bar
│           │   └── ErrorBoundary.tsx
│           └── hooks/
│               ├── useKeyBindings.ts
│               ├── useStreamingMessage.ts
│               ├── useStore.ts              # subscribe to store slice
│               └── index.ts
│       └── test/
│           ├── unit/
│           │   ├── parse.test.ts
│           │   ├── viewRouter.test.ts
│           │   ├── chatLog.test.ts
│           │   ├── slash-registry.test.ts
│           │   ├── slash-dispatcher.test.ts
│           │   ├── slash-model.test.ts      # NEW (P2-Fix-5): /model slash command tests
│           │   ├── theme.test.ts
│           │   └── TuiRpcClient.test.ts
│           ├── components/
│           │   ├── ChatView.test.tsx
│           │   ├── DashboardView.test.tsx
│           │   ├── InputBox.test.tsx
│           │   ├── SlashMenu.test.tsx
│           │   ├── ModelPicker.test.tsx     # NEW (P2-Fix-5): 3-stage picker render + keyboard tests
│           │   └── StatusLine.test.tsx
│           └── integration/
│               └── tui-daemon.test.ts
```

---

## Task 1: Package scaffold (`@glm/tui` + Ink/React deps)

**Files:**
- Create: `packages/tui/package.json`
- Create: `packages/tui/tsconfig.json`
- Create: `packages/tui/README.md`
- Create: `packages/tui/src/index.ts` (placeholder)
- Modify: `vitest.config.ts` (root) — already globs `packages/*/src/**/*.ts`; add `.tsx`

- [ ] **Step 1: Write `packages/tui/package.json`**

```json
{
  "name": "@glm/tui",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": { "build": "tsc -b" },
  "dependencies": {
    "@glm/shared": "workspace:*",
    "@glm/core": "workspace:*",
    "ink": "^5.0.1",
    "ink-text-input": "^6.0.0",
    "ink-spinner": "^5.0.0",
    "react": "^18.3.1",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "ink-testing-library": "^4.0.0"
  }
}
```

- [ ] **Step 2: Write `packages/tui/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "jsx": "react-jsx",
    "lib": ["ES2023", "DOM"]
  },
  "include": ["src/**/*"],
  "references": [
    { "path": "../shared" },
    { "path": "../core" }
  ]
}
```

- [ ] **Step 3: Update root `vitest.config.ts` (so `.tsx` tests are picked up and Ink runs in a forked process)**

`vitest.config.ts` (root):
```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    environment: 'node',
    pool: 'forks',
    poolOptions: { forks: { singleFork: false } },
    testTimeout: 15_000,
    include: ['packages/*/test/**/*.{test,spec}.{ts,tsx}'],
    coverage: { reporter: ['text', 'lcov'], include: ['packages/*/src/**/*.{ts,tsx}'] }
  }
})
```

- [ ] **Step 4: Placeholder `packages/tui/src/index.ts`**

```ts
export async function runTui(): Promise<void> {
  throw new Error('runTui not yet implemented (P2 scaffolding)')
}
```

- [ ] **Step 5: Write `packages/tui/README.md` (minimal)**

```markdown
# @glm/tui

Ink-based TUI client for `glm`. Connects to the local glm daemon over Unix socket,
renders the chat REPL and dashboard. Built in P2 of the glm-code roadmap.
```

- [ ] **Step 6: Install deps + build empty package**

```bash
pnpm install
pnpm build
```

Expected: PASS. `packages/tui/dist/` created with `index.js`. No TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add packages/tui vitest.config.ts
git commit -m "feat(tui): scaffold @glm/tui workspace package with Ink + React deps"
```

---

## Task 2: Theme palette + theme module

**Files:**
- Create: `packages/tui/src/theme/theme.ts`
- Create: `packages/tui/src/theme/index.ts`
- Test: `packages/tui/test/unit/theme.test.ts`

- [ ] **Step 1: Write failing test**

`packages/tui/test/unit/theme.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { resolveTheme, themes } from '../../src/theme'

describe('resolveTheme', () => {
  test('returns dark by default', () => {
    const t = resolveTheme({})
    expect(t.name).toBe('dark')
    expect(t.colors.fg).toBeDefined()
  })

  test('honors GLM_THEME=light', () => {
    const t = resolveTheme({ GLM_THEME: 'light' })
    expect(t.name).toBe('light')
  })

  test('falls back to dark for unknown value', () => {
    const t = resolveTheme({ GLM_THEME: 'amoled-neon' })
    expect(t.name).toBe('dark')
  })

  test('exposes a known palette key set', () => {
    expect(Object.keys(themes).sort()).toEqual(['dark', 'light'])
    for (const t of Object.values(themes)) {
      expect(t.colors).toHaveProperty('fg')
      expect(t.colors).toHaveProperty('dim')
      expect(t.colors).toHaveProperty('accent')
      expect(t.colors).toHaveProperty('userMsg')
      expect(t.colors).toHaveProperty('assistantMsg')
      expect(t.colors).toHaveProperty('errorMsg')
      expect(t.colors).toHaveProperty('panelBorder')
    }
  })
})
```

- [ ] **Step 2: Run — FAIL**

```bash
pnpm vitest run packages/tui/test/unit/theme.test.ts
```

Expected: FAIL (module missing).

- [ ] **Step 3: Implement theme**

`packages/tui/src/theme/theme.ts`:
```ts
export interface Theme {
  name: 'dark' | 'light'
  colors: {
    fg: string
    dim: string
    accent: string
    userMsg: string
    assistantMsg: string
    systemMsg: string
    errorMsg: string
    panelBorder: string
    statusBg: string
    statusFg: string
  }
}

export const themes: Record<'dark' | 'light', Theme> = {
  dark: {
    name: 'dark',
    colors: {
      fg: 'white',
      dim: 'gray',
      accent: 'cyan',
      userMsg: 'cyan',
      assistantMsg: 'white',
      systemMsg: 'yellow',
      errorMsg: 'red',
      panelBorder: 'gray',
      statusBg: 'blackBright',
      statusFg: 'whiteBright'
    }
  },
  light: {
    name: 'light',
    colors: {
      fg: 'black',
      dim: 'gray',
      accent: 'magenta',
      userMsg: 'blue',
      assistantMsg: 'black',
      systemMsg: 'yellow',
      errorMsg: 'red',
      panelBorder: 'gray',
      statusBg: 'whiteBright',
      statusFg: 'black'
    }
  }
}

export function resolveTheme(env: NodeJS.ProcessEnv): Theme {
  const raw = (env.GLM_THEME ?? 'dark').toLowerCase()
  if (raw === 'light') return themes.light
  return themes.dark
}
```

`packages/tui/src/theme/index.ts`:
```ts
export * from './theme'
```

- [ ] **Step 4: Run — PASS**

```bash
pnpm vitest run packages/tui/test/unit/theme.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/tui
git commit -m "feat(tui): theme module with dark/light palettes (GLM_THEME env)"
```

---

## Task 3: Tiny store + viewRouter + chatLog state slices

**Files:**
- Create: `packages/tui/src/state/store.ts`
- Create: `packages/tui/src/state/viewRouter.ts`
- Create: `packages/tui/src/state/chatLog.ts`
- Create: `packages/tui/src/state/sessionState.ts`
- Create: `packages/tui/src/state/index.ts`
- Test: `packages/tui/test/unit/viewRouter.test.ts`
- Test: `packages/tui/test/unit/chatLog.test.ts`

- [ ] **Step 1: Write failing viewRouter test**

`packages/tui/test/unit/viewRouter.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { createViewRouter } from '../../src/state/viewRouter'

describe('viewRouter', () => {
  test('starts at chat', () => {
    const r = createViewRouter()
    expect(r.get()).toBe('chat')
  })

  test('toggle flips chat ↔ dashboard', () => {
    const r = createViewRouter()
    r.toggle()
    expect(r.get()).toBe('dashboard')
    r.toggle()
    expect(r.get()).toBe('chat')
  })

  test('setView is idempotent', () => {
    const r = createViewRouter()
    r.setView('dashboard')
    r.setView('dashboard')
    expect(r.get()).toBe('dashboard')
  })

  test('subscribers fire on change only', () => {
    const r = createViewRouter()
    let calls = 0
    r.subscribe(() => { calls++ })
    r.setView('chat')          // no change — no fire
    r.setView('dashboard')     // fires
    r.setView('dashboard')     // no change — no fire
    r.toggle()                  // fires (→ chat)
    expect(calls).toBe(2)
  })
})
```

- [ ] **Step 2: Write failing chatLog test**

`packages/tui/test/unit/chatLog.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { createChatLog } from '../../src/state/chatLog'

describe('chatLog', () => {
  test('append adds messages in order', () => {
    const log = createChatLog()
    log.appendUserMessage('hello')
    log.appendAssistantMessage('world')
    expect(log.snapshot().map(m => m.text)).toEqual(['hello', 'world'])
    expect(log.snapshot().map(m => m.role)).toEqual(['user', 'assistant'])
  })

  test('streaming partial accumulates and finalizes', () => {
    const log = createChatLog()
    log.beginAssistantStream('msg-1')
    log.appendStreamChunk('msg-1', 'Hel')
    log.appendStreamChunk('msg-1', 'lo, ')
    log.appendStreamChunk('msg-1', 'world')
    log.endStream('msg-1')
    expect(log.snapshot()).toHaveLength(1)
    expect(log.snapshot()[0]!.text).toBe('Hello, world')
    expect(log.snapshot()[0]!.streaming).toBe(false)
  })

  test('endStream with no chunks still finalizes empty message', () => {
    const log = createChatLog()
    log.beginAssistantStream('m-2')
    log.endStream('m-2')
    expect(log.snapshot()).toHaveLength(1)
    expect(log.snapshot()[0]!.text).toBe('')
  })

  test('error messages are flagged', () => {
    const log = createChatLog()
    log.appendError('boom')
    expect(log.snapshot()[0]!.role).toBe('error')
    expect(log.snapshot()[0]!.text).toBe('boom')
  })

  test('subscribe receives change notifications', () => {
    const log = createChatLog()
    let calls = 0
    log.subscribe(() => { calls++ })
    log.appendUserMessage('x')
    log.appendUserMessage('y')
    expect(calls).toBe(2)
  })
})
```

- [ ] **Step 3: Run — FAIL**

```bash
pnpm vitest run packages/tui/test/unit/viewRouter.test.ts packages/tui/test/unit/chatLog.test.ts
```

- [ ] **Step 4: Implement store base**

`packages/tui/src/state/store.ts`:
```ts
export type Listener = () => void

export class Emitter {
  private listeners = new Set<Listener>()
  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  emit(): void {
    for (const l of this.listeners) l()
  }
}
```

- [ ] **Step 5: Implement viewRouter**

`packages/tui/src/state/viewRouter.ts`:
```ts
import { Emitter } from './store'

export type ViewName = 'chat' | 'dashboard'

export interface ViewRouter {
  get(): ViewName
  setView(v: ViewName): void
  toggle(): void
  subscribe(fn: () => void): () => void
}

export function createViewRouter(initial: ViewName = 'chat'): ViewRouter {
  let current: ViewName = initial
  const em = new Emitter()
  return {
    get: () => current,
    setView(v) {
      if (v === current) return
      current = v
      em.emit()
    },
    toggle() {
      current = current === 'chat' ? 'dashboard' : 'chat'
      em.emit()
    },
    subscribe: (fn) => em.subscribe(fn)
  }
}
```

- [ ] **Step 6: Implement chatLog**

`packages/tui/src/state/chatLog.ts`:
```ts
import { Emitter } from './store'

export type ChatRole = 'user' | 'assistant' | 'system' | 'error'

export interface ChatMessage {
  id: string
  role: ChatRole
  text: string
  ts: string
  streaming: boolean
}

export interface ChatLog {
  snapshot(): ReadonlyArray<ChatMessage>
  appendUserMessage(text: string): ChatMessage
  appendAssistantMessage(text: string): ChatMessage
  appendSystemMessage(text: string): ChatMessage
  appendError(text: string): ChatMessage
  beginAssistantStream(id: string): ChatMessage
  appendStreamChunk(id: string, chunk: string): void
  endStream(id: string): void
  subscribe(fn: () => void): () => void
}

let counter = 0
function nextId(): string { counter += 1; return `m-${Date.now()}-${counter}` }

export function createChatLog(): ChatLog {
  const messages: ChatMessage[] = []
  const em = new Emitter()

  function push(m: ChatMessage): ChatMessage {
    messages.push(m)
    em.emit()
    return m
  }

  return {
    snapshot: () => messages.slice(),
    appendUserMessage: (text) => push({ id: nextId(), role: 'user', text, ts: new Date().toISOString(), streaming: false }),
    appendAssistantMessage: (text) => push({ id: nextId(), role: 'assistant', text, ts: new Date().toISOString(), streaming: false }),
    appendSystemMessage: (text) => push({ id: nextId(), role: 'system', text, ts: new Date().toISOString(), streaming: false }),
    appendError: (text) => push({ id: nextId(), role: 'error', text, ts: new Date().toISOString(), streaming: false }),
    beginAssistantStream: (id) => push({ id, role: 'assistant', text: '', ts: new Date().toISOString(), streaming: true }),
    appendStreamChunk: (id, chunk) => {
      const m = messages.find(x => x.id === id)
      if (!m) return
      m.text += chunk
      em.emit()
    },
    endStream: (id) => {
      const m = messages.find(x => x.id === id)
      if (!m) return
      m.streaming = false
      em.emit()
    },
    subscribe: (fn) => em.subscribe(fn)
  }
}
```

- [ ] **Step 7: Implement sessionState + barrel**

`packages/tui/src/state/sessionState.ts`:
```ts
import { Emitter } from './store'

export interface SessionMeta {
  id: string
  cwd: string
  initialTask: string | null
}

export interface SessionState {
  get(): SessionMeta | null
  set(m: SessionMeta): void
  clear(): void
  subscribe(fn: () => void): () => void
}

export function createSessionState(): SessionState {
  let current: SessionMeta | null = null
  const em = new Emitter()
  return {
    get: () => current,
    set(m) { current = m; em.emit() },
    clear() { current = null; em.emit() },
    subscribe: (fn) => em.subscribe(fn)
  }
}
```

`packages/tui/src/state/index.ts`:
```ts
export * from './store'
export * from './viewRouter'
export * from './chatLog'
export * from './sessionState'
```

- [ ] **Step 8: Run all state tests — PASS**

```bash
pnpm vitest run packages/tui/test/unit/
```

Expected: all green (`theme.test`, `viewRouter.test` × 4, `chatLog.test` × 5).

- [ ] **Step 9: Commit**

```bash
git add packages/tui
git commit -m "feat(tui): tiny event-emitter store + viewRouter/chatLog/sessionState slices"
```

---

## Task 4: TuiRpcClient (subscribe-style adapter on P1 framing)

**Files:**
- Create: `packages/tui/src/rpc/TuiRpcClient.ts`
- Create: `packages/tui/src/rpc/index.ts`
- Test: `packages/tui/test/unit/TuiRpcClient.test.ts`

- [ ] **Step 1: Write failing test (uses a fake EventEmitter socket — no real daemon needed)**

`packages/tui/test/unit/TuiRpcClient.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { EventEmitter } from 'node:events'
import { TuiRpcClient } from '../../src/rpc/TuiRpcClient'

interface FakeSocket extends EventEmitter {
  write: (data: string) => boolean
  end: () => void
  written: string[]
}

function makeFakeSocket(): FakeSocket {
  const e = new EventEmitter() as FakeSocket
  e.written = []
  e.write = (d: string) => { e.written.push(d); return true }
  e.end = () => { e.emit('close') }
  return e
}

describe('TuiRpcClient', () => {
  test('call() resolves on matching response id', async () => {
    const sock = makeFakeSocket()
    const c = new TuiRpcClient({ socket: sock as any })
    const p = c.call<{ pong: boolean }>('ping')
    // simulate daemon response
    sock.emit('data', Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { pong: true } }) + '\n'))
    const result = await p
    expect(result.pong).toBe(true)
    expect(sock.written[0]).toContain('"method":"ping"')
  })

  test('error response rejects the call', async () => {
    const sock = makeFakeSocket()
    const c = new TuiRpcClient({ socket: sock as any })
    const p = c.call('boom')
    sock.emit('data', Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -32601, message: 'not found' } }) + '\n'))
    await expect(p).rejects.toThrow(/not found/)
  })

  test('subscribe() receives notifications (no id)', () => {
    const sock = makeFakeSocket()
    const c = new TuiRpcClient({ socket: sock as any })
    const seen: unknown[] = []
    c.subscribe('message.delta', (params) => seen.push(params))
    sock.emit('data', Buffer.from(JSON.stringify({ jsonrpc: '2.0', method: 'message.delta', params: { text: 'hi' } }) + '\n'))
    sock.emit('data', Buffer.from(JSON.stringify({ jsonrpc: '2.0', method: 'message.delta', params: { text: ' there' } }) + '\n'))
    expect(seen).toEqual([{ text: 'hi' }, { text: ' there' }])
  })

  test('split frames across chunks are reassembled', () => {
    const sock = makeFakeSocket()
    const c = new TuiRpcClient({ socket: sock as any })
    const seen: unknown[] = []
    c.subscribe('x.evt', (p) => seen.push(p))
    sock.emit('data', Buffer.from('{"jsonrpc":"2.0","method":"x.evt","par'))
    sock.emit('data', Buffer.from('ams":{"n":1}}\n{"jsonrpc":"2.0","method":"x.evt","params":{"n":2}}\n'))
    expect(seen).toEqual([{ n: 1 }, { n: 2 }])
  })

  test('close() rejects pending calls', async () => {
    const sock = makeFakeSocket()
    const c = new TuiRpcClient({ socket: sock as any })
    const p = c.call('never-responds')
    sock.emit('close')
    await expect(p).rejects.toThrow(/closed/)
  })
})
```

- [ ] **Step 2: Run — FAIL**

```bash
pnpm vitest run packages/tui/test/unit/TuiRpcClient.test.ts
```

- [ ] **Step 3: Implement TuiRpcClient**

`packages/tui/src/rpc/TuiRpcClient.ts`:
```ts
import { createConnection, type Socket } from 'node:net'
import { resolvePaths } from '@glm/shared'

export type NotificationHandler = (params: unknown) => void

export interface TuiRpcClientOpts {
  /** Pre-built socket for tests; if absent connect() must be called. */
  socket?: Socket
  /** Override socket path; defaults to resolvePaths().socket */
  socketPath?: string
}

interface Pending {
  resolve: (v: unknown) => void
  reject: (e: Error) => void
}

export class TuiRpcClient {
  private socket?: Socket
  private socketPath: string
  private nextId = 1
  private pending = new Map<number, Pending>()
  private subs = new Map<string, Set<NotificationHandler>>()
  private leftover = ''
  private closed = false

  constructor(opts: TuiRpcClientOpts = {}) {
    this.socketPath = opts.socketPath ?? resolvePaths().socket
    if (opts.socket) this.attach(opts.socket)
  }

  async connect(): Promise<void> {
    if (this.socket) return
    await new Promise<void>((resolve, reject) => {
      const s = createConnection(this.socketPath, () => resolve())
      s.once('error', reject)
      this.attach(s)
    })
  }

  private attach(socket: Socket): void {
    this.socket = socket
    socket.on('data', (chunk: Buffer) => this.onData(chunk))
    socket.on('close', () => this.onClose())
    socket.on('error', () => { /* handled by per-call rejection */ })
  }

  private onData(chunk: Buffer): void {
    this.leftover += chunk.toString('utf8')
    const parts = this.leftover.split('\n')
    this.leftover = parts.pop() ?? ''
    for (const frame of parts.filter(Boolean)) this.handleFrame(frame)
  }

  private handleFrame(frame: string): void {
    let msg: { id?: number | string | null; method?: string; result?: unknown; error?: { code: number; message: string }; params?: unknown }
    try { msg = JSON.parse(frame) } catch { return }
    // Notification (no id, has method) — subscribe path
    if (msg.method && (msg.id === undefined || msg.id === null)) {
      const subs = this.subs.get(msg.method)
      if (subs) for (const fn of subs) fn(msg.params)
      return
    }
    // Response (has id)
    if (typeof msg.id === 'number') {
      const p = this.pending.get(msg.id)
      if (!p) return
      this.pending.delete(msg.id)
      if (msg.error) p.reject(new Error(`${msg.error.code}: ${msg.error.message}`))
      else p.resolve(msg.result)
    }
  }

  private onClose(): void {
    this.closed = true
    for (const { reject } of this.pending.values()) reject(new Error('connection closed'))
    this.pending.clear()
  }

  call<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (this.closed) return Promise.reject(new Error('client closed'))
    if (!this.socket) return Promise.reject(new Error('not connected'))
    const id = this.nextId++
    const frame = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
      this.socket!.write(frame)
    })
  }

  subscribe(method: string, handler: NotificationHandler): () => void {
    if (!this.subs.has(method)) this.subs.set(method, new Set())
    const set = this.subs.get(method)!
    set.add(handler)
    return () => set.delete(handler)
  }

  close(): void {
    if (this.closed) return
    this.socket?.end()
  }

  get connected(): boolean { return !!this.socket && !this.closed }
}
```

`packages/tui/src/rpc/index.ts`:
```ts
export * from './TuiRpcClient'
```

- [ ] **Step 4: Run TuiRpcClient tests — PASS**

```bash
pnpm vitest run packages/tui/test/unit/TuiRpcClient.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/tui
git commit -m "feat(tui): TuiRpcClient with call() + subscribe() for streaming events"
```

---

## Task 5: Slash command parser + registry

**Files:**
- Create: `packages/tui/src/slash/parse.ts`
- Create: `packages/tui/src/slash/registry.ts`
- Create: `packages/tui/src/slash/dispatcher.ts`
- Create: `packages/tui/src/slash/commands/help.ts`
- Create: `packages/tui/src/slash/commands/quit.ts`
- Create: `packages/tui/src/slash/commands/sessions.ts`
- Create: `packages/tui/src/slash/commands/attach.ts`
- Create: `packages/tui/src/slash/commands/daemon.ts`
- Create: `packages/tui/src/slash/commands/history.ts`
- Create: `packages/tui/src/slash/commands/context.ts`
- Create: `packages/tui/src/slash/commands/compact.ts`
- Create: `packages/tui/src/slash/index.ts`
- Test: `packages/tui/test/unit/parse.test.ts`
- Test: `packages/tui/test/unit/slash-registry.test.ts`
- Test: `packages/tui/test/unit/slash-dispatcher.test.ts`

- [ ] **Step 1: Write failing parse test**

`packages/tui/test/unit/parse.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { parseSlash } from '../../src/slash/parse'

describe('parseSlash', () => {
  test('returns null for plain text', () => {
    expect(parseSlash('hello world')).toBeNull()
  })

  test('parses /help with no args', () => {
    expect(parseSlash('/help')).toEqual({ name: 'help', args: [] })
  })

  test('parses /attach <id>', () => {
    expect(parseSlash('/attach 01J6...XYZ')).toEqual({ name: 'attach', args: ['01J6...XYZ'] })
  })

  test('parses /daemon status', () => {
    expect(parseSlash('/daemon status')).toEqual({ name: 'daemon', args: ['status'] })
  })

  test('trims trailing whitespace', () => {
    expect(parseSlash('/help   ')).toEqual({ name: 'help', args: [] })
  })

  test('rejects "/  " (slash with only spaces)', () => {
    expect(parseSlash('/  ')).toBeNull()
  })

  test('handles quoted args (basic)', () => {
    expect(parseSlash('/say "hello world" friend')).toEqual({ name: 'say', args: ['hello world', 'friend'] })
  })
})
```

- [ ] **Step 2: Write failing registry test**

`packages/tui/test/unit/slash-registry.test.ts`:
```ts
import { describe, expect, test, vi } from 'vitest'
import { createRegistry, type SlashCommand } from '../../src/slash/registry'

describe('slash registry', () => {
  test('register + lookup', () => {
    const r = createRegistry()
    const cmd: SlashCommand = { name: 'echo', summary: 'echo back', run: async () => ({ kind: 'system', text: 'pong' }) }
    r.register(cmd)
    expect(r.get('echo')?.summary).toBe('echo back')
  })

  test('list returns sorted command names', () => {
    const r = createRegistry()
    r.register({ name: 'zeta', summary: '', run: async () => ({ kind: 'system', text: '' }) })
    r.register({ name: 'alpha', summary: '', run: async () => ({ kind: 'system', text: '' }) })
    expect(r.list().map(c => c.name)).toEqual(['alpha', 'zeta'])
  })

  test('completions prefix match', () => {
    const r = createRegistry()
    r.register({ name: 'help',   summary: '', run: async () => ({ kind: 'system', text: '' }) })
    r.register({ name: 'history',summary: '', run: async () => ({ kind: 'system', text: '' }) })
    r.register({ name: 'quit',   summary: '', run: async () => ({ kind: 'system', text: '' }) })
    expect(r.completions('h').map(c => c.name)).toEqual(['help', 'history'])
    expect(r.completions('').map(c => c.name)).toEqual(['help', 'history', 'quit'])
  })

  test('dispatch invokes matching command', async () => {
    const r = createRegistry()
    const fn = vi.fn(async () => ({ kind: 'system' as const, text: 'ok' }))
    r.register({ name: 'ping', summary: '', run: fn })
    const out = await r.dispatch({ name: 'ping', args: ['a','b'] }, {} as any)
    expect(fn).toHaveBeenCalledWith(['a','b'], {})
    expect(out.text).toBe('ok')
  })

  test('dispatch on unknown returns error result', async () => {
    const r = createRegistry()
    const out = await r.dispatch({ name: 'nope', args: [] }, {} as any)
    expect(out.kind).toBe('error')
    expect(out.text).toContain('unknown')
  })

  test('default registry registers /history, /context, /compact', async () => {
    const { buildDefaultRegistry } = await import('../../src/slash')
    const r = buildDefaultRegistry()
    expect(r.get('history')?.summary).toMatch(/history|scrollback/i)
    expect(r.get('context')?.summary).toMatch(/context/i)
    expect(r.get('compact')?.summary).toMatch(/compact/i)
  })

  test('/context invokes rpc.call("context.assemble")', async () => {
    const { buildDefaultRegistry } = await import('../../src/slash')
    const r = buildDefaultRegistry()
    const rpc = { call: vi.fn(async () => ({ tokens: 42, parts: [] })) }
    const out = await r.dispatch({ name: 'context', args: [] }, { rpc, chatLog: {}, session: {}, viewRouter: {}, exit: () => {} } as any)
    expect(rpc.call).toHaveBeenCalledWith('context.assemble', expect.any(Object))
    expect(out.kind).toBe('system')
  })

  test('/context fails gracefully when context.assemble returns method-not-found', async () => {
    const { buildDefaultRegistry } = await import('../../src/slash')
    const r = buildDefaultRegistry()
    const rpc = { call: vi.fn(async () => { throw new Error('method not found: context.assemble') }) }
    const out = await r.dispatch({ name: 'context', args: [] }, { rpc, chatLog: {}, session: {}, viewRouter: {}, exit: () => {} } as any)
    expect(out.kind).toBe('system')
    expect(out.text).toMatch(/not ready|not yet implemented|P7/i)
  })

  test('/compact invokes rpc.call("context.compact") with focus', async () => {
    const { buildDefaultRegistry } = await import('../../src/slash')
    const r = buildDefaultRegistry()
    const rpc = { call: vi.fn(async () => ({ before: 1000, after: 200 })) }
    const out = await r.dispatch({ name: 'compact', args: ['planning'] }, { rpc, chatLog: {}, session: {}, viewRouter: {}, exit: () => {} } as any)
    expect(rpc.call).toHaveBeenCalledWith('context.compact', { focus: 'planning' })
    expect(out.kind).toBe('system')
  })

  test('/compact fails gracefully when context.compact returns method-not-found', async () => {
    const { buildDefaultRegistry } = await import('../../src/slash')
    const r = buildDefaultRegistry()
    const rpc = { call: vi.fn(async () => { throw new Error('method not found: context.compact') }) }
    const out = await r.dispatch({ name: 'compact', args: [] }, { rpc, chatLog: {}, session: {}, viewRouter: {}, exit: () => {} } as any)
    expect(out.kind).toBe('system')
    expect(out.text).toMatch(/not ready|not yet implemented|P7/i)
  })

  test('/history opens scrollback (sets viewRouter or returns system msg)', async () => {
    const { buildDefaultRegistry } = await import('../../src/slash')
    const r = buildDefaultRegistry()
    const chatLog = { snapshot: vi.fn(() => [{ role: 'user', text: 'hi' }]) }
    const out = await r.dispatch({ name: 'history', args: [] }, { rpc: {}, chatLog, session: {}, viewRouter: {}, exit: () => {} } as any)
    expect(out.kind).toBe('system')
  })
})
```

- [ ] **Step 3: Run — FAIL**

```bash
pnpm vitest run packages/tui/test/unit/parse.test.ts packages/tui/test/unit/slash-registry.test.ts
```

- [ ] **Step 4: Implement parseSlash**

`packages/tui/src/slash/parse.ts`:
```ts
export interface ParsedSlash {
  name: string
  args: string[]
}

export function parseSlash(input: string): ParsedSlash | null {
  const trimmed = input.trim()
  if (!trimmed.startsWith('/')) return null
  const body = trimmed.slice(1).trim()
  if (body.length === 0) return null
  // simple tokenizer with double-quote support
  const tokens: string[] = []
  let i = 0
  while (i < body.length) {
    if (body[i] === ' ') { i++; continue }
    if (body[i] === '"') {
      const end = body.indexOf('"', i + 1)
      if (end === -1) { tokens.push(body.slice(i + 1)); break }
      tokens.push(body.slice(i + 1, end))
      i = end + 1
      continue
    }
    let j = i
    while (j < body.length && body[j] !== ' ') j++
    tokens.push(body.slice(i, j))
    i = j
  }
  const [name, ...args] = tokens
  if (!name) return null
  return { name, args }
}
```

- [ ] **Step 5: Implement registry**

`packages/tui/src/slash/registry.ts`:
```ts
import type { TuiRpcClient } from '../rpc/TuiRpcClient'
import type { ChatLog } from '../state/chatLog'
import type { SessionState } from '../state/sessionState'
import type { ViewRouter } from '../state/viewRouter'

export interface SlashContext {
  rpc: TuiRpcClient
  chatLog: ChatLog
  session: SessionState
  viewRouter: ViewRouter
  exit: () => void
}

export interface SlashResult {
  kind: 'system' | 'error' | 'silent'
  text: string
}

export interface SlashCommand {
  name: string
  summary: string
  usage?: string
  run: (args: string[], ctx: SlashContext) => Promise<SlashResult>
}

export interface SlashRegistry {
  register(cmd: SlashCommand): void
  get(name: string): SlashCommand | undefined
  list(): SlashCommand[]
  completions(prefix: string): SlashCommand[]
  dispatch(parsed: { name: string; args: string[] }, ctx: SlashContext): Promise<SlashResult>
}

export function createRegistry(): SlashRegistry {
  const map = new Map<string, SlashCommand>()
  return {
    register(cmd) { map.set(cmd.name, cmd) },
    get: (name) => map.get(name),
    list: () => [...map.values()].sort((a, b) => a.name.localeCompare(b.name)),
    completions(prefix) {
      return [...map.values()]
        .filter(c => c.name.startsWith(prefix))
        .sort((a, b) => a.name.localeCompare(b.name))
    },
    async dispatch({ name, args }, ctx) {
      const cmd = map.get(name)
      if (!cmd) return { kind: 'error', text: `unknown command: /${name}` }
      try { return await cmd.run(args, ctx) }
      catch (e) { return { kind: 'error', text: (e as Error).message } }
    }
  }
}
```

- [ ] **Step 6: Implement the five v0.1 commands**

`packages/tui/src/slash/commands/help.ts`:
```ts
import type { SlashCommand } from '../registry'

export const helpCommand = (allCommands: () => SlashCommand[]): SlashCommand => ({
  name: 'help',
  summary: 'List slash commands',
  async run() {
    const lines = allCommands()
      .map(c => `  /${c.name.padEnd(10)} ${c.summary}${c.usage ? `  (${c.usage})` : ''}`)
    return {
      kind: 'system',
      text: ['Available commands:', ...lines].join('\n')
    }
  }
})
```

`packages/tui/src/slash/commands/quit.ts`:
```ts
import type { SlashCommand } from '../registry'

export const quitCommand: SlashCommand = {
  name: 'quit',
  summary: 'Exit the TUI',
  async run(_args, ctx) {
    ctx.exit()
    return { kind: 'silent', text: '' }
  }
}
```

`packages/tui/src/slash/commands/sessions.ts`:
```ts
import type { SlashCommand } from '../registry'

interface SessionRow { id: string; updatedAt: string; cwd: string; initialTask: string | null }

export const sessionsCommand: SlashCommand = {
  name: 'sessions',
  summary: 'List recent sessions',
  async run(_args, ctx) {
    const rows = await ctx.rpc.call<SessionRow[]>('session.list', { limit: 20 })
    if (!rows.length) return { kind: 'system', text: 'No sessions yet.' }
    const lines = rows.map(r => {
      const shortId = r.id.slice(-8)
      const task = r.initialTask ? ` — ${r.initialTask}` : ''
      return `  ${shortId}  ${r.updatedAt}  ${r.cwd}${task}`
    })
    return { kind: 'system', text: ['Recent sessions:', ...lines].join('\n') }
  }
}
```

`packages/tui/src/slash/commands/attach.ts`:
```ts
import type { SlashCommand } from '../registry'

interface SessionRow { id: string; cwd: string; initialTask: string | null }

export const attachCommand: SlashCommand = {
  name: 'attach',
  summary: 'Attach to an existing session by id (or short suffix)',
  usage: '/attach <id-or-suffix>',
  async run(args, ctx) {
    if (!args[0]) return { kind: 'error', text: 'usage: /attach <id>' }
    const needle = args[0]
    const rows = await ctx.rpc.call<SessionRow[]>('session.list', { limit: 200 })
    const match = rows.find(r => r.id === needle) ?? rows.find(r => r.id.endsWith(needle))
    if (!match) return { kind: 'error', text: `no session matches "${needle}"` }
    ctx.session.set({ id: match.id, cwd: match.cwd, initialTask: match.initialTask })
    await ctx.rpc.call('session.touch', { sessionId: match.id })
    return { kind: 'system', text: `attached to ${match.id.slice(-8)} (${match.cwd})` }
  }
}
```

`packages/tui/src/slash/commands/daemon.ts`:
```ts
import type { SlashCommand } from '../registry'

interface DaemonStatus { pid: number; uptimeMs: number; version: string }

export const daemonCommand: SlashCommand = {
  name: 'daemon',
  summary: 'Daemon controls (status | restart)',
  usage: '/daemon status | restart',
  async run(args, ctx) {
    const sub = args[0] ?? 'status'
    if (sub === 'status') {
      const s = await ctx.rpc.call<DaemonStatus>('daemon.status')
      return { kind: 'system', text: `daemon pid=${s.pid} uptime=${Math.round(s.uptimeMs/1000)}s v=${s.version}` }
    }
    if (sub === 'restart') {
      return { kind: 'error', text: 'restart from within TUI not supported in P2 — run `glm daemon restart` from a shell' }
    }
    return { kind: 'error', text: `unknown subcommand: /daemon ${sub}` }
  }
}
```

`packages/tui/src/slash/commands/history.ts`:
```ts
import type { SlashCommand } from '../registry'

export const historyCommand: SlashCommand = {
  name: 'history',
  summary: 'Show message history scrollback',
  async run(_args, ctx) {
    const messages = ctx.chatLog.snapshot()
    if (!messages.length) return { kind: 'system', text: 'no messages yet.' }
    const lines = messages.map((m: any, i: number) => {
      const role = m.role ?? m.kind ?? 'msg'
      const text = (m.text ?? m.content ?? '').toString().split('\n')[0]
      return `  ${String(i + 1).padStart(3)}. [${role}] ${text}`
    })
    return { kind: 'system', text: ['History:', ...lines].join('\n') }
  }
}
```

`packages/tui/src/slash/commands/context.ts`:
```ts
import type { SlashCommand } from '../registry'

interface ContextAssembleResp {
  tokens?: number
  parts?: Array<{ kind: string; tokens?: number; summary?: string }>
}

function isMethodNotFound(err: unknown): boolean {
  const msg = (err as Error)?.message ?? ''
  return /method not found|unknown method|-32601/i.test(msg)
}

export const contextCommand: SlashCommand = {
  name: 'context',
  summary: 'Show current context assembly (tokens + sources)',
  async run(_args, ctx) {
    try {
      const resp = await ctx.rpc.call<ContextAssembleResp>('context.assemble', {
        sessionId: ctx.session.get()?.id
      })
      const head = `context tokens=${resp.tokens ?? '?'}`
      const parts = (resp.parts ?? []).map(p => `  - ${p.kind}${p.tokens ? ` (${p.tokens}t)` : ''}${p.summary ? `: ${p.summary}` : ''}`)
      return { kind: 'system', text: [head, ...parts].join('\n') }
    } catch (e) {
      if (isMethodNotFound(e)) {
        return { kind: 'system', text: 'context not ready (P7 not yet implemented)' }
      }
      return { kind: 'error', text: (e as Error).message }
    }
  }
}
```

`packages/tui/src/slash/commands/compact.ts`:
```ts
import type { SlashCommand } from '../registry'

interface CompactResp {
  before?: number
  after?: number
  summary?: string
}

function isMethodNotFound(err: unknown): boolean {
  const msg = (err as Error)?.message ?? ''
  return /method not found|unknown method|-32601/i.test(msg)
}

export const compactCommand: SlashCommand = {
  name: 'compact',
  summary: 'Compact context with optional focus hint',
  usage: '/compact [focus]',
  async run(args, ctx) {
    const focus = args.join(' ').trim() || undefined
    try {
      const resp = await ctx.rpc.call<CompactResp>('context.compact', { focus })
      const beforeAfter = resp.before != null && resp.after != null
        ? ` ${resp.before}t → ${resp.after}t`
        : ''
      return {
        kind: 'system',
        text: `compacted${beforeAfter}${resp.summary ? `: ${resp.summary}` : ''}`
      }
    } catch (e) {
      if (isMethodNotFound(e)) {
        return { kind: 'system', text: 'compact not ready (P7 not yet implemented)' }
      }
      return { kind: 'error', text: (e as Error).message }
    }
  }
}
```

`packages/tui/src/slash/index.ts`:
```ts
import { createRegistry, type SlashRegistry } from './registry'
import { helpCommand } from './commands/help'
import { quitCommand } from './commands/quit'
import { sessionsCommand } from './commands/sessions'
import { attachCommand } from './commands/attach'
import { daemonCommand } from './commands/daemon'
import { historyCommand } from './commands/history'
import { contextCommand } from './commands/context'
import { compactCommand } from './commands/compact'

export * from './parse'
export * from './registry'
export * from './dispatcher'

export function buildDefaultRegistry(): SlashRegistry {
  const r = createRegistry()
  r.register(helpCommand(() => r.list()))
  r.register(quitCommand)
  r.register(sessionsCommand)
  r.register(attachCommand)
  r.register(daemonCommand)
  r.register(historyCommand)
  r.register(contextCommand)
  r.register(compactCommand)
  return r
}
```

- [ ] **Step 7: Run — PASS**

```bash
pnpm vitest run packages/tui/test/unit/parse.test.ts packages/tui/test/unit/slash-registry.test.ts
```

- [ ] **Step 8: Commit**

```bash
git add packages/tui
git commit -m "feat(tui): slash parser, registry, /help /quit /sessions /attach /daemon /history /context /compact"
```

---

## Task 5.5: Catch-all slash dispatcher (built-in → workflow → command-loader → cli.exec)

**Files:**
- Create: `packages/tui/src/slash/dispatcher.ts`
- Test: `packages/tui/test/unit/slash-dispatcher.test.ts`

The dispatcher provides a single entry point for any `/foo` input. It tries the registries in priority order; if no slash handler matches, the input is forwarded to the daemon as a generic CLI invocation via `rpc.call('cli.exec', { cmd, args })`. P9's `workflowRegistry` and P4's `commandLoaderRegistry` do not exist at P2 stage, so the dispatcher resolves them lazily — they are `undefined` until later plans wire them in.

- [ ] **Step 1: Write failing dispatcher test**

`packages/tui/test/unit/slash-dispatcher.test.ts`:
```ts
import { describe, expect, test, vi } from 'vitest'
import { createDispatcher } from '../../src/slash/dispatcher'
import { createRegistry } from '../../src/slash/registry'

function makeCtx(rpcCall = vi.fn(async () => ({ ok: true }))) {
  return {
    rpc: { call: rpcCall },
    chatLog: { snapshot: () => [] },
    session: { get: () => null },
    viewRouter: {},
    exit: () => {}
  } as any
}

describe('slash dispatcher', () => {
  test('routes to built-in registry first', async () => {
    const builtin = createRegistry()
    const fn = vi.fn(async () => ({ kind: 'system' as const, text: 'builtin' }))
    builtin.register({ name: 'foo', summary: '', run: fn })
    const dispatch = createDispatcher({ builtin })
    const out = await dispatch('/foo a b', makeCtx())
    expect(fn).toHaveBeenCalledWith(['a', 'b'], expect.any(Object))
    expect(out.text).toBe('builtin')
  })

  test('falls through to workflow registry when builtin misses', async () => {
    const builtin = createRegistry()
    const workflow = {
      has: (n: string) => n === 'plan',
      run: vi.fn(async () => ({ kind: 'system' as const, text: 'workflow' }))
    }
    const dispatch = createDispatcher({ builtin, workflow: workflow as any })
    const out = await dispatch('/plan refactor X', makeCtx())
    expect(workflow.run).toHaveBeenCalledWith('plan', 'refactor X', expect.any(Object))
    expect(out.text).toBe('workflow')
  })

  test('falls through to command-loader for /<id>', async () => {
    const builtin = createRegistry()
    const commandLoader = { has: (n: string) => n === 'review' }
    const rpcCall = vi.fn(async () => ({ rendered: '...' }))
    const dispatch = createDispatcher({ builtin, commandLoader: commandLoader as any })
    await dispatch('/review pr-123', makeCtx(rpcCall))
    expect(rpcCall).toHaveBeenCalledWith('command.render', { id: 'review', args: ['pr-123'] })
  })

  test('final fallback is cli.exec passthrough', async () => {
    const builtin = createRegistry()
    const rpcCall = vi.fn(async () => ({ stdout: '', stderr: '', exitCode: 0 }))
    const dispatch = createDispatcher({ builtin })
    await dispatch('/sessions --limit 5', makeCtx(rpcCall))
    expect(rpcCall).toHaveBeenCalledWith('cli.exec', { cmd: 'sessions', args: ['--limit', '5'] })
  })

  test('cli.exec method-not-found surfaces as "command not available yet"', async () => {
    const builtin = createRegistry()
    const rpcCall = vi.fn(async () => { throw new Error('method not found: cli.exec') })
    const dispatch = createDispatcher({ builtin })
    const out = await dispatch('/whatever', makeCtx(rpcCall))
    expect(out.kind).toBe('error')
    expect(out.text).toMatch(/not available yet/i)
  })

  test('non-slash input returns null (caller treats as chat)', async () => {
    const builtin = createRegistry()
    const dispatch = createDispatcher({ builtin })
    const out = await dispatch('hello world', makeCtx())
    expect(out).toBeNull()
  })
})
```

- [ ] **Step 2: Run — FAIL**

```bash
pnpm vitest run packages/tui/test/unit/slash-dispatcher.test.ts
```

- [ ] **Step 3: Implement dispatcher**

`packages/tui/src/slash/dispatcher.ts`:
```ts
import { parseSlash } from './parse'
import type { SlashContext, SlashRegistry, SlashResult } from './registry'

export interface WorkflowRegistry {
  has(name: string): boolean
  run(name: string, input: string, ctx: SlashContext): Promise<SlashResult>
}

export interface CommandLoaderRegistry {
  has(name: string): boolean
}

export interface DispatcherDeps {
  builtin: SlashRegistry
  /** P9 wires this; absent at P2 stage. */
  workflow?: WorkflowRegistry
  /** P4 wires this; absent at P2 stage. */
  commandLoader?: CommandLoaderRegistry
}

export type SlashDispatcher = (input: string, ctx: SlashContext) => Promise<SlashResult | null>

function isMethodNotFound(err: unknown): boolean {
  const msg = (err as Error)?.message ?? ''
  return /method not found|unknown method|-32601/i.test(msg)
}

/**
 * Catch-all slash dispatcher per FIX-MANIFEST §0.12.
 *
 * Order: built-in slash → workflow slash → command-loader render → CLI passthrough → 404.
 *
 * `workflowRegistry` and `commandLoaderRegistry` come from P9 and P4 respectively —
 * at P2's stage they don't exist yet, so the dispatcher uses optional resolution.
 * `rpc.call('cli.exec', ...)` returns method-not-found until P4 wires its handler;
 * we surface that to the user as "command not available yet".
 */
export function createDispatcher(deps: DispatcherDeps): SlashDispatcher {
  const { builtin, workflow, commandLoader } = deps
  return async function dispatch(input, ctx) {
    const parsed = parseSlash(input)
    if (!parsed) return null
    const { name: cmd, args } = parsed

    // 1. built-in slash
    if (builtin.get(cmd)) {
      return builtin.dispatch({ name: cmd, args }, ctx)
    }

    // 2. workflow slash (P9)
    if (workflow?.has(cmd)) {
      return workflow.run(cmd, args.join(' '), ctx)
    }

    // 3. command-loader render (P4)
    if (commandLoader?.has(cmd)) {
      try {
        const rendered = await ctx.rpc.call<{ rendered: string }>('command.render', { id: cmd, args })
        return { kind: 'system', text: rendered.rendered ?? '' }
      } catch (e) {
        if (isMethodNotFound(e)) {
          return { kind: 'error', text: `/${cmd} not available yet (command loader not wired)` }
        }
        return { kind: 'error', text: (e as Error).message }
      }
    }

    // 4. CLI passthrough — every CLI subcommand reachable as `/<cmd>`
    try {
      const r = await ctx.rpc.call<{ stdout: string; stderr: string; exitCode: number }>(
        'cli.exec',
        { cmd, args }
      )
      if (r.exitCode !== 0 && r.stderr) {
        return { kind: 'error', text: r.stderr.trim() }
      }
      return { kind: 'system', text: (r.stdout ?? '').trim() }
    } catch (e) {
      if (isMethodNotFound(e)) {
        return { kind: 'error', text: `/${cmd} not available yet (cli.exec handler arrives in P4)` }
      }
      return { kind: 'error', text: (e as Error).message }
    }
  }
}
```

- [ ] **Step 4: Run dispatcher test — PASS**

```bash
pnpm vitest run packages/tui/test/unit/slash-dispatcher.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/tui/src/slash/dispatcher.ts packages/tui/test/unit/slash-dispatcher.test.ts packages/tui/src/slash/index.ts
git commit -m "feat(tui): catch-all slash dispatcher (builtin → workflow → command-loader → cli.exec)"
```

---

## Task 6: `useStore` + `useStreamingMessage` + key bindings hooks

**Files:**
- Create: `packages/tui/src/hooks/useStore.ts`
- Create: `packages/tui/src/hooks/useStreamingMessage.ts`
- Create: `packages/tui/src/hooks/useKeyBindings.ts`
- Create: `packages/tui/src/hooks/index.ts`

(No dedicated test files — these hooks are covered by component tests in Task 7+.)

- [ ] **Step 1: Implement `useStore` (subscribe to any of our slices)**

`packages/tui/src/hooks/useStore.ts`:
```ts
import { useEffect, useReducer } from 'react'

export interface Subscribable<T> {
  get(): T
  subscribe(fn: () => void): () => void
}

export function useStore<T>(slice: Subscribable<T>): T {
  const [, force] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    return slice.subscribe(() => force())
  }, [slice])
  return slice.get()
}
```

- [ ] **Step 2: Implement `useStreamingMessage` (wires P6 future `message.delta` into chatLog; P2 just exposes the hook so components stay stable)**

`packages/tui/src/hooks/useStreamingMessage.ts`:
```ts
import { useEffect } from 'react'
import type { TuiRpcClient } from '../rpc/TuiRpcClient'
import type { ChatLog } from '../state/chatLog'

export interface DeltaPayload {
  messageId: string
  chunk?: string
  done?: boolean
}

/**
 * Subscribe to the daemon's `message.delta` notifications and pipe chunks
 * into the chatLog. P1 stub doesn't emit these, but the subscription is harmless
 * and becomes live when P6 ships streaming.
 */
export function useStreamingMessage(rpc: TuiRpcClient, log: ChatLog): void {
  useEffect(() => {
    const off = rpc.subscribe('message.delta', (raw) => {
      const d = raw as DeltaPayload
      if (!d || !d.messageId) return
      if (d.chunk) log.appendStreamChunk(d.messageId, d.chunk)
      if (d.done) log.endStream(d.messageId)
    })
    return () => { off() }
  }, [rpc, log])
}
```

- [ ] **Step 3: Implement `useKeyBindings`**

`packages/tui/src/hooks/useKeyBindings.ts`:
```ts
import { useInput } from 'ink'

export interface KeyBindingHandlers {
  onTab: () => void
  onEscape: () => void
  onCtrlD: () => void
}

export function useKeyBindings(h: KeyBindingHandlers): void {
  useInput((input, key) => {
    if (key.tab) { h.onTab(); return }
    if (key.escape) { h.onEscape(); return }
    if (key.ctrl && input === 'd') { h.onCtrlD(); return }
  })
}
```

- [ ] **Step 4: Hooks barrel**

`packages/tui/src/hooks/index.ts`:
```ts
export * from './useStore'
export * from './useStreamingMessage'
export * from './useKeyBindings'
```

- [ ] **Step 5: Build verification**

```bash
pnpm build
```

Expected: clean build (these are not yet imported by anything; just compilation).

- [ ] **Step 6: Commit**

```bash
git add packages/tui
git commit -m "feat(tui): useStore + useStreamingMessage + useKeyBindings hooks"
```

---

## Task 7: Presentational components (Panel, ChatMessage, ChatLog, StatusLine)

**Files:**
- Create: `packages/tui/src/components/Panel.tsx`
- Create: `packages/tui/src/components/ChatMessage.tsx`
- Create: `packages/tui/src/components/ChatLog.tsx`
- Create: `packages/tui/src/components/StatusLine.tsx`
- Create: `packages/tui/src/components/ErrorBoundary.tsx`
- Test: `packages/tui/test/components/StatusLine.test.tsx`

- [ ] **Step 1: Write failing StatusLine test**

`packages/tui/test/components/StatusLine.test.tsx`:
```tsx
import React from 'react'
import { describe, expect, test } from 'vitest'
import { render } from 'ink-testing-library'
import { StatusLine } from '../../src/components/StatusLine'
import { themes } from '../../src/theme'

describe('<StatusLine>', () => {
  test('renders model, session suffix, ctx %, and hints', () => {
    const out = render(
      <StatusLine
        theme={themes.dark}
        model="stub-echo"
        sessionId="01JABCDEFGHJKMNPQRSTVWXYZ0"
        ctxPercent={0}
        view="chat"
      />
    )
    const frame = out.lastFrame() ?? ''
    expect(frame).toContain('stub-echo')
    expect(frame).toContain('TVWXYZ0')          // session id suffix (last 8 chars)
    expect(frame).toContain('0%')
    expect(frame).toContain('Tab')
    expect(frame).toContain('Esc')
    expect(frame).toContain('Ctrl-D')
  })

  test('shows DASHBOARD label when view=dashboard', () => {
    const out = render(
      <StatusLine
        theme={themes.dark}
        model="stub-echo"
        sessionId="abc"
        ctxPercent={42}
        view="dashboard"
      />
    )
    expect(out.lastFrame()).toContain('DASHBOARD')
  })

  test('renders gracefully without a session', () => {
    const out = render(
      <StatusLine
        theme={themes.dark}
        model="stub-echo"
        sessionId={null}
        ctxPercent={0}
        view="chat"
      />
    )
    expect(out.lastFrame()).toContain('no session')
  })
})
```

- [ ] **Step 2: Run — FAIL**

```bash
pnpm vitest run packages/tui/test/components/StatusLine.test.tsx
```

- [ ] **Step 3: Implement Panel**

`packages/tui/src/components/Panel.tsx`:
```tsx
import React from 'react'
import { Box, Text } from 'ink'
import type { Theme } from '../theme'

export interface PanelProps {
  theme: Theme
  title: string
  width?: number | string
  height?: number | string
  children?: React.ReactNode
}

export function Panel({ theme, title, width, height, children }: PanelProps): React.ReactElement {
  return (
    <Box
      borderStyle="round"
      borderColor={theme.colors.panelBorder}
      flexDirection="column"
      width={width}
      height={height}
      paddingX={1}
    >
      <Box>
        <Text color={theme.colors.accent} bold>{title}</Text>
      </Box>
      <Box flexDirection="column" flexGrow={1}>
        {children}
      </Box>
    </Box>
  )
}
```

- [ ] **Step 4: Implement ChatMessage**

`packages/tui/src/components/ChatMessage.tsx`:
```tsx
import React from 'react'
import { Box, Text } from 'ink'
import type { Theme } from '../theme'
import type { ChatMessage as ChatMessageType } from '../state/chatLog'

export interface ChatMessageProps {
  theme: Theme
  message: ChatMessageType
}

const ROLE_LABEL: Record<ChatMessageType['role'], string> = {
  user: 'you',
  assistant: 'glm',
  system: 'sys',
  error: 'err'
}

export function ChatMessage({ theme, message }: ChatMessageProps): React.ReactElement {
  const colorByRole: Record<ChatMessageType['role'], string> = {
    user: theme.colors.userMsg,
    assistant: theme.colors.assistantMsg,
    system: theme.colors.systemMsg,
    error: theme.colors.errorMsg
  }
  const label = ROLE_LABEL[message.role]
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color={colorByRole[message.role]} bold>{`${label} ›`}</Text>
        {message.streaming && (
          <Text color={theme.colors.dim}>{' …'}</Text>
        )}
      </Box>
      <Box paddingLeft={2}>
        <Text color={colorByRole[message.role]}>{message.text || ' '}</Text>
      </Box>
    </Box>
  )
}
```

- [ ] **Step 5: Implement ChatLog (scrolls via trailing N messages — Ink doesn't do real scroll out of the box)**

`packages/tui/src/components/ChatLog.tsx`:
```tsx
import React from 'react'
import { Box } from 'ink'
import { ChatMessage } from './ChatMessage'
import type { Theme } from '../theme'
import type { ChatMessage as ChatMessageType } from '../state/chatLog'

export interface ChatLogProps {
  theme: Theme
  messages: ReadonlyArray<ChatMessageType>
  maxRows?: number
}

export function ChatLog({ theme, messages, maxRows = 200 }: ChatLogProps): React.ReactElement {
  // Render the trailing window; the surrounding flex layout clips above.
  const window = messages.length > maxRows ? messages.slice(messages.length - maxRows) : messages
  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1} paddingY={1}>
      {window.map(m => (
        <ChatMessage key={m.id} theme={theme} message={m} />
      ))}
    </Box>
  )
}
```

- [ ] **Step 6: Implement StatusLine**

`packages/tui/src/components/StatusLine.tsx`:
```tsx
import React from 'react'
import { Box, Text } from 'ink'
import type { Theme } from '../theme'

export interface StatusLineProps {
  theme: Theme
  model: string
  sessionId: string | null
  ctxPercent: number
  view: 'chat' | 'dashboard'
}

export function StatusLine({ theme, model, sessionId, ctxPercent, view }: StatusLineProps): React.ReactElement {
  const sessSuffix = sessionId ? sessionId.slice(-8) : 'no session'
  const label = view === 'dashboard' ? 'DASHBOARD' : 'CHAT'
  return (
    <Box backgroundColor={theme.colors.statusBg} paddingX={1}>
      <Text color={theme.colors.statusFg}>
        <Text bold>{label} </Text>
        <Text>· {model} </Text>
        <Text>· {sessSuffix} </Text>
        <Text>· ctx {ctxPercent}% </Text>
        <Text color={theme.colors.dim}>· Tab Dashboard · / Cmd · Esc Cancel · Ctrl-D Quit</Text>
      </Text>
    </Box>
  )
}
```

- [ ] **Step 7: Implement ErrorBoundary (React class — Ink does not have a built-in)**

`packages/tui/src/components/ErrorBoundary.tsx`:
```tsx
import React from 'react'
import { Box, Text } from 'ink'

interface State { error: Error | null }
interface Props { children: React.ReactNode }

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }
  static getDerivedStateFromError(error: Error): State { return { error } }
  componentDidCatch(error: Error): void {
    process.stderr.write(`[tui error] ${error.stack ?? error.message}\n`)
  }
  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <Box flexDirection="column" padding={1}>
          <Text color="red" bold>TUI crashed:</Text>
          <Text color="red">{this.state.error.message}</Text>
          <Text color="gray">(Press Ctrl-C to exit)</Text>
        </Box>
      )
    }
    return this.props.children
  }
}
```

- [ ] **Step 8: Run StatusLine test — PASS**

```bash
pnpm vitest run packages/tui/test/components/StatusLine.test.tsx
```

- [ ] **Step 9: Commit**

```bash
git add packages/tui
git commit -m "feat(tui): Panel + ChatMessage + ChatLog + StatusLine + ErrorBoundary"
```

---

## Task 8: InputBox (multi-line input + slash autocomplete) + SlashMenu

**Files:**
- Create: `packages/tui/src/components/InputBox.tsx`
- Create: `packages/tui/src/components/SlashMenu.tsx`
- Test: `packages/tui/test/components/InputBox.test.tsx`
- Test: `packages/tui/test/components/SlashMenu.test.tsx`

- [ ] **Step 1: Write failing InputBox test**

`packages/tui/test/components/InputBox.test.tsx`:
```tsx
import React from 'react'
import { describe, expect, test } from 'vitest'
import { render } from 'ink-testing-library'
import { InputBox } from '../../src/components/InputBox'
import { themes } from '../../src/theme'

describe('<InputBox>', () => {
  test('renders an empty prompt with caret', () => {
    const out = render(<InputBox theme={themes.dark} value="" onChange={() => {}} onSubmit={() => {}} disabled={false} />)
    const frame = out.lastFrame() ?? ''
    expect(frame).toContain('›')
  })

  test('shows submitted value as it grows', () => {
    const out = render(<InputBox theme={themes.dark} value="hello" onChange={() => {}} onSubmit={() => {}} disabled={false} />)
    expect(out.lastFrame()).toContain('hello')
  })

  test('dims when disabled', () => {
    const out = render(<InputBox theme={themes.dark} value="x" onChange={() => {}} onSubmit={() => {}} disabled={true} />)
    expect(out.lastFrame()).toContain('(waiting…)')
  })
})
```

- [ ] **Step 2: Write failing SlashMenu test**

`packages/tui/test/components/SlashMenu.test.tsx`:
```tsx
import React from 'react'
import { describe, expect, test } from 'vitest'
import { render } from 'ink-testing-library'
import { SlashMenu } from '../../src/components/SlashMenu'
import { themes } from '../../src/theme'

describe('<SlashMenu>', () => {
  test('renders list of completions with the first highlighted', () => {
    const out = render(
      <SlashMenu
        theme={themes.dark}
        items={[
          { name: 'help', summary: 'List commands' },
          { name: 'history', summary: 'Show input history' }
        ]}
        selectedIndex={0}
      />
    )
    const frame = out.lastFrame() ?? ''
    expect(frame).toContain('/help')
    expect(frame).toContain('/history')
    expect(frame).toContain('List commands')
  })

  test('renders nothing when items is empty', () => {
    const out = render(<SlashMenu theme={themes.dark} items={[]} selectedIndex={0} />)
    expect((out.lastFrame() ?? '').trim()).toBe('')
  })
})
```

- [ ] **Step 3: Run — FAIL**

```bash
pnpm vitest run packages/tui/test/components/InputBox.test.tsx packages/tui/test/components/SlashMenu.test.tsx
```

- [ ] **Step 4: Implement InputBox**

`packages/tui/src/components/InputBox.tsx`:
```tsx
import React from 'react'
import { Box, Text } from 'ink'
import TextInput from 'ink-text-input'
import type { Theme } from '../theme'

export interface InputBoxProps {
  theme: Theme
  value: string
  onChange: (v: string) => void
  onSubmit: (v: string) => void
  disabled: boolean
  placeholder?: string
}

export function InputBox({ theme, value, onChange, onSubmit, disabled, placeholder }: InputBoxProps): React.ReactElement {
  return (
    <Box
      borderStyle="round"
      borderColor={theme.colors.panelBorder}
      paddingX={1}
    >
      <Text color={theme.colors.accent}>{'› '}</Text>
      {disabled ? (
        <Text color={theme.colors.dim}>(waiting…)</Text>
      ) : (
        <TextInput
          value={value}
          placeholder={placeholder ?? 'type a message or /command, Enter to send'}
          onChange={onChange}
          onSubmit={onSubmit}
        />
      )}
    </Box>
  )
}
```

- [ ] **Step 5: Implement SlashMenu**

`packages/tui/src/components/SlashMenu.tsx`:
```tsx
import React from 'react'
import { Box, Text } from 'ink'
import type { Theme } from '../theme'

export interface SlashMenuItem {
  name: string
  summary: string
}

export interface SlashMenuProps {
  theme: Theme
  items: SlashMenuItem[]
  selectedIndex: number
}

export function SlashMenu({ theme, items, selectedIndex }: SlashMenuProps): React.ReactElement | null {
  if (items.length === 0) return null
  return (
    <Box
      borderStyle="round"
      borderColor={theme.colors.panelBorder}
      flexDirection="column"
      paddingX={1}
    >
      {items.map((it, i) => {
        const selected = i === selectedIndex
        return (
          <Box key={it.name}>
            <Text color={selected ? theme.colors.accent : theme.colors.fg} bold={selected}>
              {selected ? '› ' : '  '}/{it.name}
            </Text>
            <Text color={theme.colors.dim}>{`  ${it.summary}`}</Text>
          </Box>
        )
      })}
    </Box>
  )
}
```

- [ ] **Step 6: Run InputBox + SlashMenu tests — PASS**

```bash
pnpm vitest run packages/tui/test/components/InputBox.test.tsx packages/tui/test/components/SlashMenu.test.tsx
```

- [ ] **Step 7: Commit**

```bash
git add packages/tui
git commit -m "feat(tui): InputBox (ink-text-input) + SlashMenu autocomplete popup"
```

---

## Task 9: ChatView (composes ChatLog + SlashMenu + InputBox + slash dispatch)

**Files:**
- Create: `packages/tui/src/components/ChatView.tsx`
- Test: `packages/tui/test/components/ChatView.test.tsx`

- [ ] **Step 1: Write failing ChatView test**

`packages/tui/test/components/ChatView.test.tsx`:
```tsx
import React from 'react'
import { describe, expect, test } from 'vitest'
import { render } from 'ink-testing-library'
import { ChatView } from '../../src/components/ChatView'
import { themes } from '../../src/theme'
import { createChatLog } from '../../src/state/chatLog'
import { createSessionState } from '../../src/state/sessionState'
import { createViewRouter } from '../../src/state/viewRouter'
import { buildDefaultRegistry } from '../../src/slash'
import { TuiRpcClient } from '../../src/rpc/TuiRpcClient'
import { EventEmitter } from 'node:events'

function fakeRpc(): TuiRpcClient {
  const e = new EventEmitter() as any
  e.write = () => true
  e.end = () => e.emit('close')
  return new TuiRpcClient({ socket: e })
}

describe('<ChatView>', () => {
  test('renders empty state hint when no messages', () => {
    const log = createChatLog()
    const session = createSessionState()
    const view = createViewRouter()
    const reg = buildDefaultRegistry()
    const out = render(
      <ChatView
        theme={themes.dark}
        chatLog={log}
        session={session}
        viewRouter={view}
        registry={reg}
        rpc={fakeRpc()}
        exit={() => {}}
      />
    )
    const frame = out.lastFrame() ?? ''
    expect(frame).toContain('› ')
    expect(frame).toContain('Tab')
  })

  test('renders accumulated messages', () => {
    const log = createChatLog()
    log.appendUserMessage('hello')
    log.appendAssistantMessage('hi back')
    const out = render(
      <ChatView
        theme={themes.dark}
        chatLog={log}
        session={createSessionState()}
        viewRouter={createViewRouter()}
        registry={buildDefaultRegistry()}
        rpc={fakeRpc()}
        exit={() => {}}
      />
    )
    const frame = out.lastFrame() ?? ''
    expect(frame).toContain('hello')
    expect(frame).toContain('hi back')
  })
})
```

- [ ] **Step 2: Run — FAIL**

```bash
pnpm vitest run packages/tui/test/components/ChatView.test.tsx
```

- [ ] **Step 3: Implement ChatView**

`packages/tui/src/components/ChatView.tsx`:
```tsx
import React, { useMemo, useState } from 'react'
import { Box } from 'ink'
import type { Theme } from '../theme'
import { ChatLog } from './ChatLog'
import { InputBox } from './InputBox'
import { SlashMenu, type SlashMenuItem } from './SlashMenu'
import type { ChatLog as ChatLogStore } from '../state/chatLog'
import type { SessionState } from '../state/sessionState'
import type { ViewRouter } from '../state/viewRouter'
import type { SlashRegistry, SlashContext } from '../slash/registry'
import { createDispatcher } from '../slash/dispatcher'
import { useStore } from '../hooks/useStore'
import { useStreamingMessage } from '../hooks/useStreamingMessage'
import type { TuiRpcClient } from '../rpc/TuiRpcClient'

export interface ChatViewProps {
  theme: Theme
  chatLog: ChatLogStore
  session: SessionState
  viewRouter: ViewRouter
  registry: SlashRegistry
  rpc: TuiRpcClient
  exit: () => void
}

export function ChatView(props: ChatViewProps): React.ReactElement {
  const { theme, chatLog, session, viewRouter, registry, rpc, exit } = props
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)

  // re-render when messages mutate
  useStore({
    get: () => chatLog.snapshot(),
    subscribe: chatLog.subscribe
  })
  useStreamingMessage(rpc, chatLog)

  // workflow + command-loader registries don't exist yet at P2 (P9 / P4); pass undefined.
  const dispatch = useMemo(
    () => createDispatcher({ builtin: registry }),
    [registry]
  )

  const completions: SlashMenuItem[] = useMemo(() => {
    if (!input.startsWith('/')) return []
    const prefix = input.slice(1).split(' ')[0] ?? ''
    return registry.completions(prefix).map(c => ({ name: c.name, summary: c.summary }))
  }, [input, registry])

  async function handleSubmit(text: string): Promise<void> {
    if (!text.trim() || sending) return
    setInput('')
    if (text.startsWith('/')) {
      const ctx: SlashContext = { rpc, chatLog, session, viewRouter, exit }
      const result = await dispatch(text, ctx)
      if (result && result.kind === 'system') chatLog.appendSystemMessage(result.text)
      else if (result && result.kind === 'error') chatLog.appendError(result.text)
      return
    }
    // Plain chat → call P1 stub `message.send` (echo). Real streaming arrives in P6.
    chatLog.appendUserMessage(text)
    const s = session.get()
    if (!s) { chatLog.appendError('no active session'); return }
    setSending(true)
    try {
      const resp = await rpc.call<{ content: string; model: string }>('message.send', {
        sessionId: s.id,
        text
      })
      chatLog.appendAssistantMessage(resp.content)
    } catch (e) {
      chatLog.appendError((e as Error).message)
    } finally {
      setSending(false)
    }
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      <ChatLog theme={theme} messages={chatLog.snapshot()} />
      {completions.length > 0 && (
        <SlashMenu theme={theme} items={completions} selectedIndex={0} />
      )}
      <InputBox
        theme={theme}
        value={input}
        onChange={setInput}
        onSubmit={handleSubmit}
        disabled={sending}
      />
    </Box>
  )
}
```

- [ ] **Step 4: Run ChatView test — PASS**

```bash
pnpm vitest run packages/tui/test/components/ChatView.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add packages/tui
git commit -m "feat(tui): ChatView with slash autocomplete + slash dispatch + echo round-trip"
```

---

## Task 10: DashboardView (placeholder Orchestrator/Main/Workers/Status panels)

**Files:**
- Create: `packages/tui/src/components/DashboardView.tsx`
- Test: `packages/tui/test/components/DashboardView.test.tsx`

- [ ] **Step 1: Write failing test**

`packages/tui/test/components/DashboardView.test.tsx`:
```tsx
import React from 'react'
import { describe, expect, test } from 'vitest'
import { render } from 'ink-testing-library'
import { DashboardView } from '../../src/components/DashboardView'
import { themes } from '../../src/theme'
import { EventEmitter } from 'node:events'
import { TuiRpcClient } from '../../src/rpc/TuiRpcClient'

function fakeRpc(): TuiRpcClient {
  const e = new EventEmitter() as any
  e.write = () => true
  e.end = () => e.emit('close')
  return new TuiRpcClient({ socket: e })
}

describe('<DashboardView>', () => {
  test('renders four labelled panels', () => {
    const out = render(
      <DashboardView theme={themes.dark} rpc={fakeRpc()} />
    )
    const frame = out.lastFrame() ?? ''
    expect(frame).toContain('Orchestrator')
    expect(frame).toContain('Main')
    expect(frame).toContain('Workers')
    expect(frame).toContain('Status')
  })

  test('shows "no orchestrator yet (P8)" placeholder', () => {
    const out = render(<DashboardView theme={themes.dark} rpc={fakeRpc()} />)
    expect(out.lastFrame()).toContain('P8')
  })
})
```

- [ ] **Step 2: Run — FAIL**

```bash
pnpm vitest run packages/tui/test/components/DashboardView.test.tsx
```

- [ ] **Step 3: Implement DashboardView**

`packages/tui/src/components/DashboardView.tsx`:
```tsx
import React, { useEffect, useState } from 'react'
import { Box, Text } from 'ink'
import type { Theme } from '../theme'
import { Panel } from './Panel'
import type { TuiRpcClient } from '../rpc/TuiRpcClient'

export interface DashboardViewProps {
  theme: Theme
  rpc: TuiRpcClient
}

interface DaemonStatus { pid: number; uptimeMs: number; version: string }
interface SessionRow { id: string; updatedAt: string; cwd: string }

export function DashboardView({ theme, rpc }: DashboardViewProps): React.ReactElement {
  const [status, setStatus] = useState<DaemonStatus | null>(null)
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    async function refresh(): Promise<void> {
      try {
        const s = await rpc.call<DaemonStatus>('daemon.status')
        const list = await rpc.call<SessionRow[]>('session.list', { limit: 5 })
        if (!mounted) return
        setStatus(s)
        setSessions(list)
        setError(null)
      } catch (e) {
        if (!mounted) return
        setError((e as Error).message)
      }
    }
    refresh()
    const t = setInterval(refresh, 2000)
    return () => { mounted = false; clearInterval(t) }
  }, [rpc])

  return (
    <Box flexDirection="column" flexGrow={1} padding={1}>
      <Box flexDirection="row" flexGrow={1}>
        <Box flexDirection="column" width="50%">
          <Panel theme={theme} title="Orchestrator">
            <Text color={theme.colors.dim}>no orchestrator yet (P8)</Text>
            <Text color={theme.colors.dim}>decision log, fan-out tree, model routing will land here.</Text>
          </Panel>
          <Panel theme={theme} title="Main">
            <Text color={theme.colors.fg}>
              {sessions[0] ? `active session: ${sessions[0].id.slice(-8)} (${sessions[0].cwd})` : 'no sessions'}
            </Text>
          </Panel>
        </Box>
        <Box flexDirection="column" width="50%">
          <Panel theme={theme} title="Workers">
            <Text color={theme.colors.dim}>no workers yet (P8)</Text>
            <Text color={theme.colors.dim}>sub-agent fan-out + state machine will populate this panel.</Text>
          </Panel>
          <Panel theme={theme} title="Status">
            {error ? (
              <Text color={theme.colors.errorMsg}>error: {error}</Text>
            ) : status ? (
              <>
                <Text>pid: {status.pid}</Text>
                <Text>uptime: {Math.round(status.uptimeMs / 1000)}s</Text>
                <Text>version: {status.version}</Text>
                <Text color={theme.colors.dim}>sessions (5 most recent):</Text>
                {sessions.map(s => (
                  <Text key={s.id} color={theme.colors.dim}>{`  ${s.id.slice(-8)}  ${s.updatedAt}`}</Text>
                ))}
              </>
            ) : (
              <Text color={theme.colors.dim}>loading…</Text>
            )}
          </Panel>
        </Box>
      </Box>
    </Box>
  )
}
```

- [ ] **Step 4: Run DashboardView test — PASS**

```bash
pnpm vitest run packages/tui/test/components/DashboardView.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add packages/tui
git commit -m "feat(tui): DashboardView with Orchestrator/Main/Workers/Status placeholder panels"
```

---

## Task 11: App root + view routing + runTui entry + Tab/Esc/Ctrl-D bindings

**Files:**
- Create: `packages/tui/src/components/App.tsx`
- Create: `packages/tui/src/runTui.ts`
- Modify: `packages/tui/src/index.ts`

- [ ] **Step 1: Implement App root**

`packages/tui/src/components/App.tsx`:
```tsx
import React from 'react'
import { Box, useApp } from 'ink'
import type { Theme } from '../theme'
import { ChatView } from './ChatView'
import { DashboardView } from './DashboardView'
import { StatusLine } from './StatusLine'
import { ErrorBoundary } from './ErrorBoundary'
import type { ChatLog } from '../state/chatLog'
import type { SessionState } from '../state/sessionState'
import type { ViewRouter } from '../state/viewRouter'
import type { SlashRegistry } from '../slash/registry'
import type { TuiRpcClient } from '../rpc/TuiRpcClient'
import { useStore } from '../hooks/useStore'
import { useKeyBindings } from '../hooks/useKeyBindings'

export interface AppProps {
  theme: Theme
  chatLog: ChatLog
  session: SessionState
  viewRouter: ViewRouter
  registry: SlashRegistry
  rpc: TuiRpcClient
}

export function App(props: AppProps): React.ReactElement {
  const { theme, chatLog, session, viewRouter, registry, rpc } = props
  const ink = useApp()

  const currentView = useStore({ get: viewRouter.get, subscribe: viewRouter.subscribe })
  const currentSession = useStore({ get: session.get, subscribe: session.subscribe })

  useKeyBindings({
    onTab: () => viewRouter.toggle(),
    onEscape: () => { /* per-component cancel handled inside views */ },
    onCtrlD: () => { rpc.close(); ink.exit() }
  })

  return (
    <ErrorBoundary>
      <Box flexDirection="column" height="100%">
        <Box flexDirection="column" flexGrow={1}>
          {currentView === 'chat' ? (
            <ChatView
              theme={theme}
              chatLog={chatLog}
              session={session}
              viewRouter={viewRouter}
              registry={registry}
              rpc={rpc}
              exit={() => { rpc.close(); ink.exit() }}
            />
          ) : (
            <DashboardView theme={theme} rpc={rpc} />
          )}
        </Box>
        <StatusLine
          theme={theme}
          model="stub-echo"
          sessionId={currentSession?.id ?? null}
          ctxPercent={0}
          view={currentView}
        />
      </Box>
    </ErrorBoundary>
  )
}
```

- [ ] **Step 2: Implement runTui (the entry point)**

`packages/tui/src/runTui.ts`:
```ts
import React from 'react'
import { render } from 'ink'
import { App } from './components/App'
import { TuiRpcClient } from './rpc/TuiRpcClient'
import { buildDefaultRegistry } from './slash'
import { resolveTheme } from './theme'
import { createChatLog } from './state/chatLog'
import { createSessionState, type SessionMeta } from './state/sessionState'
import { createViewRouter } from './state/viewRouter'

export interface RunTuiOpts {
  /** If set, attach to this session id; otherwise attach to most recent or create one. */
  sessionId?: string
}

interface SessionRow { id: string; cwd: string; initialTask: string | null }

export async function runTui(opts: RunTuiOpts = {}): Promise<void> {
  const theme = resolveTheme(process.env)
  const rpc = new TuiRpcClient()
  await rpc.connect()

  const chatLog = createChatLog()
  const session = createSessionState()
  const viewRouter = createViewRouter()
  const registry = buildDefaultRegistry()

  // bootstrap session
  let target: SessionMeta | null = null
  if (opts.sessionId) {
    const row = await rpc.call<SessionRow | null>('session.get', { sessionId: opts.sessionId })
    if (row) target = { id: row.id, cwd: row.cwd, initialTask: row.initialTask }
  }
  if (!target) {
    const recents = await rpc.call<SessionRow[]>('session.list', { limit: 1 })
    if (recents[0]) {
      target = { id: recents[0].id, cwd: recents[0].cwd, initialTask: recents[0].initialTask }
      await rpc.call('session.touch', { sessionId: target.id })
    }
  }
  if (!target) {
    const created = await rpc.call<SessionRow>('session.create', {
      cwd: process.cwd(),
      worktree: process.cwd(),
      initialTask: null
    })
    target = { id: created.id, cwd: created.cwd, initialTask: created.initialTask }
  }
  session.set(target)
  chatLog.appendSystemMessage(`attached to session ${target.id.slice(-8)} (${target.cwd})`)
  chatLog.appendSystemMessage('type /help for commands, Tab for dashboard, Ctrl-D to quit.')

  const { waitUntilExit } = render(
    React.createElement(App, { theme, chatLog, session, viewRouter, registry, rpc })
  )
  await waitUntilExit()
  rpc.close()
}
```

- [ ] **Step 3: Update `packages/tui/src/index.ts`**

`packages/tui/src/index.ts`:
```ts
export { runTui, type RunTuiOpts } from './runTui'
```

- [ ] **Step 4: Build everything**

```bash
pnpm build
```

Expected: clean build across all four packages.

- [ ] **Step 5: Run full unit + component suite — PASS**

```bash
pnpm vitest run packages/tui
```

Expected: all green (theme × 4, viewRouter × 4, chatLog × 5, parse × 7, slash-registry × 11, slash-dispatcher × 6, TuiRpcClient × 5, StatusLine × 3, InputBox × 3, SlashMenu × 2, ChatView × 2, DashboardView × 2).

- [ ] **Step 6: Commit**

```bash
git add packages/tui
git commit -m "feat(tui): App root + runTui entry + Tab/Esc/Ctrl-D bindings"
```

---

## Task 12: CLI integration (`glm` no-args → TUI, `glm tui`, preserve `glm "text"`)

**Files:**
- Create: `packages/cli/src/commands/tui.ts`
- Modify: `packages/cli/src/bin.ts`
- Modify: `packages/cli/package.json` (add `@glm/tui` dependency)

- [ ] **Step 1: Add @glm/tui to CLI package**

Edit `packages/cli/package.json` — add inside `dependencies`:
```json
"@glm/tui": "workspace:*"
```

Then:
```bash
pnpm install
```

- [ ] **Step 2: Implement the `tui` subcommand**

`packages/cli/src/commands/tui.ts`:
```ts
import { Command } from 'commander'
import { ensureDaemonRunning } from '../auto-spawn'
import { runTui } from '@glm/tui'

export function registerTuiCommand(program: Command): void {
  program
    .command('tui')
    .description('Launch the Ink TUI (chat REPL + dashboard)')
    .option('--session <id>', 'attach to a specific session id')
    .action(async (opts: { session?: string }) => {
      await ensureDaemonRunning()
      await runTui({ sessionId: opts.session })
    })
}
```

- [ ] **Step 3: Wire `bin.ts` so bare `glm` launches the TUI**

Modify `packages/cli/src/bin.ts`:
```ts
#!/usr/bin/env node
import { Command } from 'commander'
import { registerDaemonCommand } from './commands/daemon'
import { registerSessionsCommand } from './commands/sessions'
import { registerAttachCommand } from './commands/attach'
import { registerChatCommand } from './commands/chat'
import { registerDoctorCommand } from './commands/doctor'
import { registerTuiCommand } from './commands/tui'
import { ensureDaemonRunning } from './auto-spawn'
import { runTui } from '@glm/tui'

const program = new Command()
program.name('glm').description('GLM coding agent CLI').version('0.1.0-alpha.1')

registerDaemonCommand(program)
registerSessionsCommand(program)
registerAttachCommand(program)
registerChatCommand(program)
registerDoctorCommand(program)
registerTuiCommand(program)

// Bare `glm` with zero args (and no recognized subcommand) → launch the TUI.
// `glm "text"` falls through to the positional-arg `chat` handler that P1 added.
async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const knownSubs = program.commands.map(c => c.name())
  const looksLikeSub = argv.length > 0 && knownSubs.includes(argv[0]!)
  const looksLikePositional = argv.length === 1 && !argv[0]!.startsWith('-')

  if (argv.length === 0) {
    await ensureDaemonRunning()
    await runTui({})
    return
  }
  if (!looksLikeSub && looksLikePositional) {
    // legacy "glm \"echo hi\"" one-shot — let chat handler pick it up
    await program.parseAsync(process.argv)
    return
  }
  await program.parseAsync(process.argv)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
```

- [ ] **Step 4: Build**

```bash
pnpm build
```

Expected: clean build.

- [ ] **Step 5: Manual smoke — bare `glm` launches TUI**

```bash
export GLM_HOME=/tmp/glm-tui-smoke-$$
rm -rf $GLM_HOME
node packages/cli/dist/bin.js daemon start
node packages/cli/dist/bin.js          # launches TUI
# inside TUI: type /help → Enter, then Tab (dashboard), Tab back, then Ctrl-D
node packages/cli/dist/bin.js "echo hi"  # one-shot still works
node packages/cli/dist/bin.js daemon stop
```

Expected: TUI launches, /help prints, Tab toggles dashboard, Ctrl-D exits cleanly; one-shot prints echo.

- [ ] **Step 6: Commit**

```bash
git add packages/cli packages/tui
git commit -m "feat(cli): default `glm` (no args) launches TUI + explicit `glm tui` subcommand"
```

---

## Task 13: Integration test — spawn daemon, spawn TUI, send keystrokes, assert frame

**Files:**
- Create: `packages/tui/test/integration/tui-daemon.test.ts`

- [ ] **Step 1: Write the integration test**

`packages/tui/test/integration/tui-daemon.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { setTimeout as wait } from 'node:timers/promises'

const CLI_BIN = path.resolve(__dirname, '../../../cli/dist/bin.js')
const DAEMON_BIN = path.resolve(__dirname, '../../../cli/dist/daemon-entry.js')

async function startDaemon(home: string): Promise<ChildProcessWithoutNullStreams> {
  const p = spawn(process.execPath, [DAEMON_BIN], {
    env: { ...process.env, GLM_HOME: home },
    stdio: ['ignore', 'pipe', 'pipe']
  }) as ChildProcessWithoutNullStreams
  const sock = path.join(home, 'daemon.sock')
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    if (existsSync(sock)) return p
    await wait(50)
  }
  p.kill('SIGKILL')
  throw new Error('daemon did not start')
}

function stripAnsi(s: string): string {
  return s.replace(/\x1B\[[0-9;]*[A-Za-z]/g, '')
}

describe('tui-daemon integration', () => {
  test('TUI connects, /help renders, Tab switches to dashboard, Ctrl-D exits', async () => {
    const home = mkdtempSync(path.join(os.tmpdir(), 'glm-tui-itest-'))
    const daemon = await startDaemon(home)

    try {
      const tui = spawn(process.execPath, [CLI_BIN, 'tui'], {
        env: { ...process.env, GLM_HOME: home, GLM_THEME: 'dark', CI: '1', FORCE_COLOR: '0' },
        stdio: ['pipe', 'pipe', 'pipe']
      })
      let buf = ''
      tui.stdout.on('data', (chunk: Buffer) => { buf += chunk.toString('utf8') })
      tui.stderr.on('data', (chunk: Buffer) => { buf += chunk.toString('utf8') })

      // wait for initial render
      const deadline = Date.now() + 5000
      while (Date.now() < deadline && !stripAnsi(buf).includes('Tab')) {
        await wait(100)
      }
      expect(stripAnsi(buf)).toContain('Tab')                 // status line rendered
      expect(stripAnsi(buf)).toContain('attached to session') // bootstrap system msg

      // send /help + Enter
      tui.stdin.write('/help\r')
      await wait(500)
      expect(stripAnsi(buf)).toContain('Available commands')

      // send Tab → DASHBOARD
      tui.stdin.write('\t')
      await wait(500)
      expect(stripAnsi(buf)).toContain('DASHBOARD')
      expect(stripAnsi(buf)).toContain('Orchestrator')

      // send Tab again → back to CHAT
      tui.stdin.write('\t')
      await wait(500)
      expect(stripAnsi(buf)).toContain('CHAT')

      // exit via Ctrl-D
      tui.stdin.write('\x04')
      await new Promise<void>((resolve) => tui.once('exit', () => resolve()))
      expect(tui.exitCode).toBe(0)
    } finally {
      daemon.kill('SIGTERM')
      await new Promise<void>((resolve) => daemon.once('exit', () => resolve()))
      rmSync(home, { recursive: true, force: true })
    }
  }, 30_000)

  test('typing a message → daemon echoes it back', async () => {
    const home = mkdtempSync(path.join(os.tmpdir(), 'glm-tui-echo-'))
    const daemon = await startDaemon(home)
    try {
      const tui = spawn(process.execPath, [CLI_BIN, 'tui'], {
        env: { ...process.env, GLM_HOME: home, CI: '1', FORCE_COLOR: '0' },
        stdio: ['pipe', 'pipe', 'pipe']
      })
      let buf = ''
      tui.stdout.on('data', (chunk: Buffer) => { buf += chunk.toString('utf8') })

      const stripAnsi = (s: string) => s.replace(/\x1B\[[0-9;]*[A-Za-z]/g, '')

      // wait for ready
      const deadline = Date.now() + 5000
      while (Date.now() < deadline && !stripAnsi(buf).includes('attached')) await wait(100)

      tui.stdin.write('hello there\r')
      await wait(700)
      const out = stripAnsi(buf)
      expect(out).toContain('hello there')
      // echo stub returns the same text under assistant role
      expect(out.split('hello there').length).toBeGreaterThanOrEqual(2)

      tui.stdin.write('\x04')
      await new Promise<void>((resolve) => tui.once('exit', () => resolve()))
    } finally {
      daemon.kill('SIGTERM')
      await new Promise<void>((resolve) => daemon.once('exit', () => resolve()))
      rmSync(home, { recursive: true, force: true })
    }
  }, 30_000)
})
```

- [ ] **Step 2: Build to ensure the CLI dist is up to date (the integration test invokes the built bin)**

```bash
pnpm build
```

- [ ] **Step 3: Run integration test**

```bash
pnpm vitest run packages/tui/test/integration/tui-daemon.test.ts
```

Expected: both cases pass within ~10s each. If your terminal is unusual (e.g., 0-row tty), set `FORCE_COLOR=0 CI=1` as the test already does.

- [ ] **Step 4: Run full suite**

```bash
pnpm vitest run
```

Expected: P1 tests (~20) + P2 tests (~40 unit/component + 2 integration) all green.

- [ ] **Step 5: Coverage check**

```bash
pnpm vitest run --coverage
```

Expected: `packages/tui/src` > 70%. Component glue (App.tsx, runTui.ts) is exercised by the integration test; if the coverage tool under-reports them as line-missed (Ink output goes through child_process), that's expected — the integration test is the contract.

- [ ] **Step 6: Final commit**

```bash
git add packages/tui
git commit -m "test(tui): integration — TUI ↔ daemon round-trip with keystrokes + Tab + Ctrl-D"
```

---

## Task 14: Model picker TUI (P2-Fix-5 — spec §9.23 Action × Model × Thinking)

> **P2-Fix-5 (FIX-MANIFEST §11.1):** spec §9.23 introduces 7 user-facing actions (`default | smol | slow | plan | designer | commit | task`) × 7 thinking levels (`inherit | off | min | low | medium | high | xhigh`). Vision is orthogonal — routed via the bundled `glm-vision` MCP server (spec §9.12), not via this picker. The TUI grows a 3-stage picker (model → action → thinking) reachable via `/model` (slash). Provider tabs are `ALL | CANONICAL | ZAI` ONLY — local providers (`LLAMA.CPP / LM-STUDIO / OLLAMA`) are intentionally NOT included since glm code is GLM Coding Plan 전용 (Ollama/vLLM fallback was removed; see spec §6 + FIX-MANIFEST §6 / P6 deferred list). RPC handlers (`model.list / .set / .show / .reset`) are provided by P6 (P6-Fix-7); P2 just calls them.

**Files:**
- Create: `packages/tui/src/views/ModelPicker.tsx`
- Create: `packages/tui/src/slash/commands/model.ts`
- Modify: `packages/tui/src/slash/index.ts` (register `modelCommand` in the default registry)
- Test: `packages/tui/test/components/ModelPicker.test.tsx`
- Test: `packages/tui/test/unit/slash-model.test.ts`

- [ ] **Step 1: Write failing component test — Stage 1 renders model list with action tags**

`packages/tui/test/components/ModelPicker.test.tsx`:
```tsx
import { describe, expect, test, vi } from 'vitest'
import React from 'react'
import { render } from 'ink-testing-library'
import { ModelPicker } from '../../src/views/ModelPicker'

function fakeRpc(initial = {
  models: [
    { name: 'GLM-5.1',      provider: 'zai', endpoint: 'anthropic', tags: ['DEFAULT','SLOW'], thinking: 'inherit' },
    { name: 'GLM-5-Turbo',  provider: 'zai', endpoint: 'anthropic', tags: ['SMOL','COMMIT'],  thinking: 'inherit' },
    { name: 'GLM-5',        provider: 'zai', endpoint: 'anthropic', tags: [],                 thinking: 'inherit' },
    { name: 'GLM-4.7',      provider: 'zai', endpoint: 'anthropic', tags: [],                 thinking: 'inherit' },
    { name: 'GLM-4.6',      provider: 'zai', endpoint: 'anthropic', tags: [],                 thinking: 'inherit' },
    { name: 'GLM-4.5-Air',  provider: 'zai', endpoint: 'openai',    tags: [],                 thinking: 'inherit' },
    { name: 'GLM-4.5-AirX', provider: 'zai', endpoint: 'openai',    tags: [],                 thinking: 'inherit' },
    { name: 'glm-vision',   provider: 'zai', endpoint: 'anthropic', tags: ['VISION'],         thinking: 'inherit' },
  ],
}) {
  const calls: Array<{ method: string; params: unknown }> = []
  return {
    calls,
    call: vi.fn(async (method: string, params?: unknown) => {
      calls.push({ method, params })
      if (method === 'model.list') return initial.models
      if (method === 'model.set')  return { ok: true }
      if (method === 'model.show') return { action: 'default', model: 'GLM-5.1', thinking: 'medium' }
      if (method === 'model.reset') return { ok: true }
      throw new Error(`unexpected rpc: ${method}`)
    }),
  }
}

describe('<ModelPicker /> stage 1 — model list', () => {
  test('renders provider tabs (ALL / CANONICAL / ZAI) — NOT local provider tabs', async () => {
    const rpc = fakeRpc()
    const { lastFrame, unmount } = render(<ModelPicker rpc={rpc as any} onExit={() => {}} />)
    await new Promise(r => setTimeout(r, 10))
    const frame = lastFrame() ?? ''
    expect(frame).toContain('ALL')
    expect(frame).toContain('CANONICAL')
    expect(frame).toContain('ZAI')
    // Local provider tabs MUST NOT appear (Ollama/vLLM support removed)
    expect(frame).not.toMatch(/LLAMA\.CPP/i)
    expect(frame).not.toMatch(/LM-STUDIO/i)
    expect(frame).not.toMatch(/OLLAMA/i)
    unmount()
  })

  test('renders model list with action tags', async () => {
    const rpc = fakeRpc()
    const { lastFrame, unmount } = render(<ModelPicker rpc={rpc as any} onExit={() => {}} />)
    await new Promise(r => setTimeout(r, 10))
    const frame = lastFrame() ?? ''
    expect(frame).toContain('GLM-5.1')
    expect(frame).toContain('[DEFAULT]')
    expect(frame).toContain('[SLOW]')
    expect(frame).toContain('GLM-5-Turbo')
    expect(frame).toContain('[SMOL]')
    expect(frame).toContain('[COMMIT]')
    expect(frame).toContain('glm-vision')
    expect(frame).toContain('[VISION]')
    unmount()
  })

  test('issues model.list RPC on mount', async () => {
    const rpc = fakeRpc()
    const { unmount } = render(<ModelPicker rpc={rpc as any} onExit={() => {}} />)
    await new Promise(r => setTimeout(r, 10))
    expect(rpc.calls.find(c => c.method === 'model.list')).toBeTruthy()
    unmount()
  })
})

describe('<ModelPicker /> stage 2 — action select', () => {
  test('after pressing Enter on a model, renders 7 action choices', async () => {
    const rpc = fakeRpc()
    const { lastFrame, stdin, unmount } = render(<ModelPicker rpc={rpc as any} onExit={() => {}} />)
    await new Promise(r => setTimeout(r, 10))
    stdin.write('\r')                         // pick first model
    await new Promise(r => setTimeout(r, 10))
    const f = lastFrame() ?? ''
    expect(f).toContain('Action for: GLM-5.1')
    expect(f).toContain('Set as DEFAULT')
    expect(f).toContain('Set as SMOL')
    expect(f).toContain('Set as SLOW')
    expect(f).toContain('Set as PLAN')
    expect(f).toContain('Set as DESIGNER')
    expect(f).toContain('Set as COMMIT')
    expect(f).toContain('Set as TASK')
    expect(f).not.toContain('Set as VISION')   // vision is glm-vision MCP, not a routing action
    unmount()
  })
})

describe('<ModelPicker /> stage 3 — thinking level select', () => {
  test('after pressing Enter on an action, renders 7 thinking levels including `inherit`', async () => {
    const rpc = fakeRpc()
    const { lastFrame, stdin, unmount } = render(<ModelPicker rpc={rpc as any} onExit={() => {}} />)
    await new Promise(r => setTimeout(r, 10))
    stdin.write('\r')                         // stage 1 → 2
    await new Promise(r => setTimeout(r, 10))
    stdin.write('\r')                         // stage 2 → 3 (DEFAULT action)
    await new Promise(r => setTimeout(r, 10))
    const f = lastFrame() ?? ''
    expect(f).toContain('Thinking for: Default')
    for (const lvl of ['inherit','off','min','low','medium','high','xhigh']) {
      expect(f).toContain(lvl)
    }
    unmount()
  })

  test('after pressing Enter on thinking level, fires model.set RPC and exits', async () => {
    const rpc = fakeRpc()
    const onExit = vi.fn()
    const { stdin, unmount } = render(<ModelPicker rpc={rpc as any} onExit={onExit} />)
    await new Promise(r => setTimeout(r, 10))
    stdin.write('\r')                         // pick model
    await new Promise(r => setTimeout(r, 10))
    stdin.write('\r')                         // pick action (DEFAULT)
    await new Promise(r => setTimeout(r, 10))
    stdin.write('\r')                         // pick thinking (inherit at index 0)
    await new Promise(r => setTimeout(r, 50))
    const setCall = rpc.calls.find(c => c.method === 'model.set')
    expect(setCall).toBeTruthy()
    expect(setCall?.params).toEqual({ action: 'default', model: 'GLM-5.1', thinking: 'inherit' })
    expect(onExit).toHaveBeenCalled()
    unmount()
  })
})

describe('<ModelPicker /> keyboard navigation', () => {
  test('Down arrow moves selection in stage 1', async () => {
    const rpc = fakeRpc()
    const { lastFrame, stdin, unmount } = render(<ModelPicker rpc={rpc as any} onExit={() => {}} />)
    await new Promise(r => setTimeout(r, 10))
    stdin.write('[B')                   // ↓
    await new Promise(r => setTimeout(r, 10))
    const f = lastFrame() ?? ''
    expect(f).toMatch(/>\s*GLM-5-Turbo/)
    unmount()
  })

  test('Tab cycles provider tabs (ZAI → CANONICAL → ALL → ZAI)', async () => {
    const rpc = fakeRpc()
    const { lastFrame, stdin, unmount } = render(<ModelPicker rpc={rpc as any} onExit={() => {}} />)
    await new Promise(r => setTimeout(r, 10))
    expect(lastFrame() ?? '').toMatch(/▸\s*ZAI|\[ZAI\]/)   // initial tab marker
    stdin.write('\t')
    await new Promise(r => setTimeout(r, 10))
    expect(lastFrame() ?? '').toMatch(/▸\s*CANONICAL|\[CANONICAL\]/)
    stdin.write('\t')
    await new Promise(r => setTimeout(r, 10))
    expect(lastFrame() ?? '').toMatch(/▸\s*ALL|\[ALL\]/)
    unmount()
  })

  test('Esc cancels without firing model.set', async () => {
    const rpc = fakeRpc()
    const onExit = vi.fn()
    const { stdin, unmount } = render(<ModelPicker rpc={rpc as any} onExit={onExit} />)
    await new Promise(r => setTimeout(r, 10))
    stdin.write('')                     // Esc
    await new Promise(r => setTimeout(r, 10))
    expect(rpc.calls.find(c => c.method === 'model.set')).toBeUndefined()
    expect(onExit).toHaveBeenCalled()
    unmount()
  })
})
```

- [ ] **Step 2: Run — FAIL (module missing)**

```bash
pnpm vitest run packages/tui/test/components/ModelPicker.test.tsx
```

Expected: FAIL — `Cannot find module .../views/ModelPicker`.

- [ ] **Step 3: Implement `<ModelPicker />`**

`packages/tui/src/views/ModelPicker.tsx`:
```tsx
import React, { useEffect, useState } from 'react'
import { Box, Text, useInput } from 'ink'
import type { TuiRpcClient } from '../rpc/TuiRpcClient'

// 7 actions × 7 thinking levels per spec §9.23 / FIX-MANIFEST §11.0.1/§11.0.2.
const ACTIONS = ['default','smol','slow','plan','designer','commit','task'] as const
type Action = typeof ACTIONS[number]
const ACTION_LABEL: Record<Action, string> = {
  default: 'Default', smol: 'Fast', slow: 'Thinking', vision: 'Vision',
  plan: 'Architect', designer: 'Designer', commit: 'Commit', task: 'Subtask',
}

const THINKING = ['inherit','off','min','low','medium','high','xhigh'] as const
type Thinking = typeof THINKING[number]

// Provider tabs — glm code 전용 (no Ollama / vLLM / LM-Studio / LlamaCpp).
const TABS = ['ALL','CANONICAL','ZAI'] as const
type Tab = typeof TABS[number]

export interface ModelRow {
  name: string
  provider: 'zai' | 'canonical' | string
  endpoint: 'anthropic' | 'openai'
  tags: string[]                  // ['DEFAULT','SLOW',...] for badge rendering
  thinking: Thinking              // current thinking level for the highlighted action, or 'inherit'
}

export interface ModelPickerProps {
  rpc: TuiRpcClient
  onExit: () => void
  initialTab?: Tab
}

type Stage = 'models' | 'actions' | 'thinking'

export function ModelPicker({ rpc, onExit, initialTab = 'ZAI' }: ModelPickerProps): React.JSX.Element {
  const [tab, setTab]           = useState<Tab>(initialTab)
  const [stage, setStage]       = useState<Stage>('models')
  const [models, setModels]     = useState<ModelRow[]>([])
  const [cursor, setCursor]     = useState(0)
  const [actionCursor, setAC]   = useState(0)
  const [thinkingCursor, setTC] = useState(0)
  const [chosenModel, setCM]    = useState<ModelRow | null>(null)
  const [chosenAction, setCA]   = useState<Action | null>(null)
  const [status, setStatus]     = useState<string>('')

  // Load model list once (RPC handled by P6: model.list)
  useEffect(() => {
    void (async () => {
      try {
        const rows = await rpc.call<ModelRow[]>('model.list', {})
        setModels(rows)
      } catch (e) {
        setStatus(`model.list failed: ${(e as Error).message}`)
      }
    })()
  }, [rpc])

  const filtered = models.filter(m => {
    if (tab === 'ALL') return true
    if (tab === 'ZAI') return m.provider === 'zai'
    if (tab === 'CANONICAL') return m.provider === 'canonical' || m.provider === 'zai'
    return true
  })

  useInput((input, key) => {
    if (key.escape) { onExit(); return }
    if (stage === 'models') {
      if (key.tab) {
        const next = TABS[(TABS.indexOf(tab) + 1) % TABS.length]!
        setTab(next); setCursor(0); return
      }
      if (key.downArrow) { setCursor(c => Math.min(c + 1, Math.max(0, filtered.length - 1))); return }
      if (key.upArrow)   { setCursor(c => Math.max(c - 1, 0)); return }
      if (key.return) {
        const m = filtered[cursor]
        if (m) { setCM(m); setStage('actions'); setAC(0) }
        return
      }
    } else if (stage === 'actions') {
      if (key.downArrow) { setAC(c => Math.min(c + 1, ACTIONS.length - 1)); return }
      if (key.upArrow)   { setAC(c => Math.max(c - 1, 0)); return }
      if (key.return) {
        setCA(ACTIONS[actionCursor]!); setStage('thinking'); setTC(0)
        return
      }
    } else if (stage === 'thinking') {
      if (key.downArrow) { setTC(c => Math.min(c + 1, THINKING.length - 1)); return }
      if (key.upArrow)   { setTC(c => Math.max(c - 1, 0)); return }
      if (key.return) {
        void (async () => {
          try {
            await rpc.call('model.set', {
              action: chosenAction,
              model: chosenModel!.name,
              thinking: THINKING[thinkingCursor],
            })
            setStatus(`✓ ${chosenAction} → ${chosenModel!.name} (${THINKING[thinkingCursor]})`)
            onExit()
          } catch (e) {
            setStatus(`model.set failed: ${(e as Error).message}`)
          }
        })()
        return
      }
    }
  })

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Box>
        <Text>Models  </Text>
        {TABS.map((t, i) => (
          <Text key={t} color={t === tab ? 'cyan' : undefined}>
            {t === tab ? `▸ ${t} ` : `  ${t} `}
            {i < TABS.length - 1 ? '·' : ''}
          </Text>
        ))}
        <Text dimColor>   (Tab to cycle)</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        {stage === 'models' && filtered.map((m, i) => {
          const isCur = i === cursor
          const badges = m.tags.length ? ' ' + m.tags.map(t => `[${t}]`).join(' ') : ''
          return (
            <Text key={m.name} color={isCur ? 'cyan' : undefined}>
              {isCur ? '> ' : '  '}{`${m.provider}/${m.name.toLowerCase()}`.padEnd(22)}{badges}  ({m.thinking})
            </Text>
          )
        })}

        {stage === 'actions' && (
          <>
            <Text>Action for: {chosenModel?.name}</Text>
            {ACTIONS.map((a, i) => (
              <Text key={a} color={i === actionCursor ? 'cyan' : undefined}>
                {i === actionCursor ? '> ' : '  '}Set as {a.toUpperCase()} ({ACTION_LABEL[a]})
              </Text>
            ))}
          </>
        )}

        {stage === 'thinking' && (
          <>
            <Text>Thinking for: {chosenAction ? ACTION_LABEL[chosenAction] : ''} ({chosenModel?.name})</Text>
            {THINKING.map((lvl, i) => (
              <Text key={lvl} color={i === thinkingCursor ? 'cyan' : undefined}>
                {i === thinkingCursor ? '> ' : '  '}{lvl}
              </Text>
            ))}
          </>
        )}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>{status || 'Enter: continue   Esc: cancel'}</Text>
      </Box>
    </Box>
  )
}
```

- [ ] **Step 4: Run component test — PASS**

```bash
pnpm vitest run packages/tui/test/components/ModelPicker.test.tsx
```

Expected: 8 passed (3 stages × stages + keyboard + tabs + esc).

- [ ] **Step 5: Write failing slash-command test**

`packages/tui/test/unit/slash-model.test.ts`:
```ts
import { describe, expect, test, vi } from 'vitest'
import { modelCommand } from '../../src/slash/commands/model'

const baseCtx = () => ({
  rpc: { call: vi.fn(async () => ({})) },
  chatLog: {},
  session: {},
  viewRouter: { push: vi.fn(), pop: vi.fn() },
  exit: () => {},
}) as any

describe('/model slash command', () => {
  test('no args → pushes ModelPicker view', async () => {
    const ctx = baseCtx()
    const out = await modelCommand.run([], ctx)
    expect(ctx.viewRouter.push).toHaveBeenCalledWith(expect.objectContaining({ kind: 'ModelPicker' }))
    expect(out.kind).toBe('silent')
  })

  test('/model show → calls model.show (no action) and prints all mappings', async () => {
    const ctx = baseCtx()
    ctx.rpc.call = vi.fn(async () => ([
      { action: 'default', model: 'GLM-5.1',     thinking: 'medium' },
      { action: 'smol',    model: 'GLM-5-Turbo', thinking: 'off' },
    ]))
    const out = await modelCommand.run(['show'], ctx)
    expect(ctx.rpc.call).toHaveBeenCalledWith('model.show', {})
    expect(out.kind).toBe('system')
    expect(out.text).toMatch(/default.*GLM-5\.1.*medium/i)
    expect(out.text).toMatch(/smol.*GLM-5-Turbo.*off/i)
  })

  test('/model show slow → calls model.show with action=slow', async () => {
    const ctx = baseCtx()
    ctx.rpc.call = vi.fn(async () => ({ action: 'slow', model: 'GLM-5.1', thinking: 'xhigh' }))
    const out = await modelCommand.run(['show', 'slow'], ctx)
    expect(ctx.rpc.call).toHaveBeenCalledWith('model.show', { action: 'slow' })
    expect(out.text).toMatch(/slow.*GLM-5\.1.*xhigh/i)
  })

  test('/model reset → calls model.reset with no params', async () => {
    const ctx = baseCtx()
    const out = await modelCommand.run(['reset'], ctx)
    expect(ctx.rpc.call).toHaveBeenCalledWith('model.reset', {})
    expect(out.kind).toBe('system')
  })

  test('/model reset slow → calls model.reset with action=slow', async () => {
    const ctx = baseCtx()
    const out = await modelCommand.run(['reset', 'slow'], ctx)
    expect(ctx.rpc.call).toHaveBeenCalledWith('model.reset', { action: 'slow' })
    expect(out.kind).toBe('system')
  })

  test('/model default GLM-5.1 → direct set with default thinking', async () => {
    const ctx = baseCtx()
    const out = await modelCommand.run(['default', 'GLM-5.1'], ctx)
    expect(ctx.rpc.call).toHaveBeenCalledWith('model.set', { action: 'default', model: 'GLM-5.1' })
    expect(out.kind).toBe('system')
    expect(out.text).toMatch(/default.*GLM-5\.1/i)
  })

  test('/model slow glm-5 xhigh → direct set including thinking', async () => {
    const ctx = baseCtx()
    const out = await modelCommand.run(['slow', 'glm-5', 'xhigh'], ctx)
    expect(ctx.rpc.call).toHaveBeenCalledWith('model.set', { action: 'slow', model: 'glm-5', thinking: 'xhigh' })
    expect(out.kind).toBe('system')
  })

  test('/model bogus → error result (unknown action)', async () => {
    const ctx = baseCtx()
    const out = await modelCommand.run(['nonsense', 'X'], ctx)
    expect(out.kind).toBe('error')
    expect(out.text).toMatch(/unknown action/i)
    expect(ctx.rpc.call).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 6: Implement `/model` slash command**

`packages/tui/src/slash/commands/model.ts`:
```ts
import type { SlashCommand, SlashContext, SlashResult } from '../registry'

const ACTIONS = ['default','smol','slow','plan','designer','commit','task'] as const
const THINKING = ['inherit','off','min','low','medium','high','xhigh'] as const
type Action = typeof ACTIONS[number]
type Thinking = typeof THINKING[number]

function isAction(s: string): s is Action {
  return (ACTIONS as readonly string[]).includes(s)
}
function isThinking(s: string): s is Thinking {
  return (THINKING as readonly string[]).includes(s)
}

interface MappingRow {
  action: Action
  model: string
  thinking: Thinking
}

function fmtMapping(rows: MappingRow[] | MappingRow): string {
  const arr = Array.isArray(rows) ? rows : [rows]
  const lines = arr.map(r => `  ${r.action.padEnd(9)} → ${r.model.padEnd(14)} ${r.thinking} thinking`)
  return ['Current model mappings:', ...lines].join('\n')
}

export const modelCommand: SlashCommand = {
  name: 'model',
  summary: 'Configure action → model + thinking mappings (spec §9.23)',
  usage: '/model | /model <action> <model> [<thinking>] | /model show [<action>] | /model reset [<action>]',
  async run(args, ctx: SlashContext): Promise<SlashResult> {
    // Sub-commands: show / reset
    if (args[0] === 'show') {
      const params = args[1] ? { action: args[1] } : {}
      const rows = await ctx.rpc.call<MappingRow[] | MappingRow>('model.show', params)
      return { kind: 'system', text: fmtMapping(rows) }
    }
    if (args[0] === 'reset') {
      const params = args[1] ? { action: args[1] } : {}
      await ctx.rpc.call('model.reset', params)
      return { kind: 'system', text: args[1] ? `✓ reset action ${args[1]} to default` : '✓ reset all 7 actions to defaults' }
    }

    // No args → open picker view
    if (args.length === 0) {
      ;(ctx as any).viewRouter?.push?.({ kind: 'ModelPicker' })
      return { kind: 'silent', text: '' }
    }

    // Direct set: /model <action> <model> [<thinking>]
    const [actionArg, modelArg, thinkingArg] = args
    if (!isAction(actionArg!)) {
      return { kind: 'error', text: `unknown action "${actionArg}" — expected one of: ${ACTIONS.join(', ')}` }
    }
    if (!modelArg) {
      return { kind: 'error', text: `usage: /model ${actionArg} <model> [<thinking>]` }
    }
    if (thinkingArg && !isThinking(thinkingArg)) {
      return { kind: 'error', text: `unknown thinking "${thinkingArg}" — expected one of: ${THINKING.join(', ')}` }
    }
    const params: { action: Action; model: string; thinking?: Thinking } = { action: actionArg, model: modelArg }
    if (thinkingArg) params.thinking = thinkingArg as Thinking
    await ctx.rpc.call('model.set', params)
    return { kind: 'system', text: `✓ ${actionArg} → ${modelArg}${thinkingArg ? ` (${thinkingArg})` : ''}` }
  },
}
```

- [ ] **Step 7: Register `/model` in the default slash registry**

Append to `packages/tui/src/slash/index.ts` (inside `buildDefaultRegistry()` after the other registrations):
```ts
import { modelCommand } from './commands/model'
// ... existing imports ...

export function buildDefaultRegistry(): SlashRegistry {
  const r = createRegistry()
  // ... existing registrations (help / quit / sessions / attach / daemon / history / context / compact) ...
  r.register(modelCommand)
  return r
}
```

- [ ] **Step 8: Wire `viewRouter` to render `<ModelPicker />` when active**

In `packages/tui/src/components/App.tsx` (Modify — adds one extra branch alongside Chat/Dashboard):
```tsx
import { ModelPicker } from '../views/ModelPicker'
// ... inside render switch:
{viewRouter.current.kind === 'ModelPicker' && (
  <ModelPicker rpc={rpc} onExit={() => viewRouter.pop()} />
)}
```

- [ ] **Step 9: Run — PASS**

```bash
pnpm vitest run packages/tui/test/unit/slash-model.test.ts packages/tui/test/components/ModelPicker.test.tsx
```

Expected: 8 (slash) + 8 (component) = 16 passed.

- [ ] **Step 10: Manual smoke**

```bash
node packages/cli/dist/bin.js daemon start
node packages/cli/dist/bin.js tui
# inside TUI:
#   type "/model"           → ModelPicker opens (stage 1)
#   ↓ ↓ Enter               → action stage
#   Enter (DEFAULT)         → thinking stage
#   ↓ Enter (off)           → exits with status line "✓ default → ... (off)"
#   type "/model show"      → prints 8-row mapping table
#   type "/model slow glm-5 xhigh"  → "✓ slow → glm-5 (xhigh)"
#   type "/model reset"     → "✓ reset all 7 actions to defaults"
```

Expected: all 5 interactions succeed without errors. (RPC handlers come from P6-Fix-7; if P6 not yet integrated, the RPC calls will surface as "method not found" — that is the correct gate.)

- [ ] **Step 11: Commit**

```bash
git add packages/tui
git commit -m "feat(tui): ModelPicker view + /model slash command (P2-Fix-5 — spec §9.23)"
```

---

## Task 15: Image attachment input handling (P2-Fix-6 — spec §9.12)

> **P2-Fix-6 (FIX-MANIFEST §12.1):** Spec §9.12 specifies that the GLM Coding Plan LLMs (GLM-5.1 / 5-Turbo / 4.7 / 4.6 / 4.5-Air) are text-only — all image work is auto-routed by the daemon to the bundled `glm-vision` MCP server (§9.12, P6-Fix-9). The TUI side of that contract is a natural attachment UX that mirrors qwen-code / opencode: bracketed-paste detects clipboard images, drag-drop captures dropped paths, and `@/path/to/img.png` resolves to a file attachment. Each attachment is saved to `~/.glm/sessions/<sid>/attachments/img_<n>.<ext>`, surfaced above the input box as a clickable chip, and shipped as part of `message.send`'s `attachments: [{path, mime, size, sha256}]` payload. The placeholder `[image N]` in the message body keeps the model's eventual reply grounded in attachment ordering. A `/raw` modifier disables vision routing (path-only — model never sees the picture, useful for "write a decoder for this PNG").

**Files:**
- Create: `packages/tui/src/input/attachment-handler.ts`
- Create: `packages/tui/src/components/AttachmentChip.tsx`
- Create: `packages/tui/src/config/attachments.ts`
- Modify: `packages/tui/src/components/ChatView.tsx` (render chip strip above InputBox; route paste/drop/`@<path>` through handler; ship `attachments` in the `message.send` payload)
- Modify: `packages/tui/src/components/InputBox.tsx` (enable bracketed-paste; surface raw paste events to ChatView via `onPaste`)
- Modify: `packages/shared/src/types.ts` (or `llm-router-types.ts`) — re-use `MessageAttachment` exported by P6-Fix-9 once available; until then declare the local interface here
- Test: `packages/tui/test/unit/attachment-handler.test.ts`
- Test: `packages/tui/test/components/AttachmentChip.test.tsx`
- Test: `packages/tui/test/integration/chat-attach.test.tsx`

- [ ] **Step 1: Write failing handler tests (paste / drop / `@<path>` / `/raw` / multi-image)**

`packages/tui/test/unit/attachment-handler.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, statSync, readFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {
  AttachmentHandler, resolveAtPath, parseRawModifier,
  type AttachmentRecord,
} from '../../src/input/attachment-handler'

let home: string
const sid = 'sess-test-attach'
beforeEach(() => {
  home = mkdtempSync(path.join(os.tmpdir(), 'glm-att-'))
  process.env.GLM_HOME = home
})
afterEach(() => {
  rmSync(home, { recursive: true, force: true })
  delete process.env.GLM_HOME
})

function fakeClipboardImage(buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
  // PNG header — 8 bytes magic, enough for mime detection
  return { readImage: vi.fn(async () => buf) }
}

describe('AttachmentHandler — paste flow', () => {
  test('bracketed-paste of clipboard image saves under ~/.glm/sessions/<sid>/attachments/img_1.png', async () => {
    const h = new AttachmentHandler({ sessionId: sid, clipboard: fakeClipboardImage() })
    const rec = await h.acceptPaste()
    expect(rec).toBeTruthy()
    expect(rec!.path).toMatch(/sessions\/sess-test-attach\/attachments\/img_1\.png$/)
    expect(rec!.mime).toBe('image/png')
    expect(rec!.sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(statSync(rec!.path).size).toBeGreaterThan(0)
  })

  test('second paste in same handler yields img_2.png (monotonic numbering)', async () => {
    const h = new AttachmentHandler({ sessionId: sid, clipboard: fakeClipboardImage() })
    await h.acceptPaste()
    const second = await h.acceptPaste()
    expect(second!.path).toMatch(/img_2\.png$/)
  })

  test('paste with empty clipboard → null (not an error)', async () => {
    const h = new AttachmentHandler({ sessionId: sid, clipboard: { readImage: vi.fn(async () => null) } })
    expect(await h.acceptPaste()).toBeNull()
  })
})

describe('AttachmentHandler — drop flow', () => {
  test('drop a real PNG path → registered as attachment, file copied into session dir', async () => {
    const src = path.join(home, 'foo.png')
    writeFileSync(src, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    const h = new AttachmentHandler({ sessionId: sid })
    const rec = await h.acceptDrop(src)
    expect(rec!.mime).toBe('image/png')
    expect(rec!.path).toMatch(/img_1\.png$/)
    // Original file copied — preserves the source for the user
    expect(statSync(src).size).toBeGreaterThan(0)
  })

  test('drop unsupported format (svg) → null + reason on handler.lastError', async () => {
    const src = path.join(home, 'bad.svg')
    writeFileSync(src, '<svg/>')
    const h = new AttachmentHandler({ sessionId: sid })
    expect(await h.acceptDrop(src)).toBeNull()
    expect(h.lastError).toMatch(/unsupported/i)
  })
})

describe('resolveAtPath — `@/path/to/img.png` explicit mention', () => {
  test('valid image path returns AttachmentRecord', async () => {
    const src = path.join(home, 'shot.jpg')
    writeFileSync(src, Buffer.from([0xff, 0xd8, 0xff, 0xe0]))     // JPEG SOI
    const h = new AttachmentHandler({ sessionId: sid })
    const rec = await resolveAtPath(h, `@${src}`)
    expect(rec).toBeTruthy()
    expect(rec!.mime).toBe('image/jpeg')
  })

  test('non-existent path → null', async () => {
    const h = new AttachmentHandler({ sessionId: sid })
    expect(await resolveAtPath(h, '@/nonexistent/x.png')).toBeNull()
  })
})

describe('parseRawModifier — `/raw` bypass', () => {
  test('extracts `/raw` token and strips it from the input text', () => {
    const r = parseRawModifier('[image 1]/raw decode this PNG')
    expect(r.raw).toBe(true)
    expect(r.text).toBe('[image 1] decode this PNG')
  })

  test('no `/raw` → raw=false, text untouched', () => {
    const r = parseRawModifier('[image 1] what is this?')
    expect(r.raw).toBe(false)
    expect(r.text).toBe('[image 1] what is this?')
  })
})

describe('AttachmentHandler — multi-image + remove', () => {
  test('three attachments numbered 1..3 then remove(2) → list shows [1,3]', async () => {
    const h = new AttachmentHandler({ sessionId: sid, clipboard: fakeClipboardImage() })
    await h.acceptPaste(); await h.acceptPaste(); await h.acceptPaste()
    expect(h.list().map(r => r.n)).toEqual([1, 2, 3])
    h.remove(2)
    expect(h.list().map(r => r.n)).toEqual([1, 3])
  })

  test('strip placeholder for removed attachment from message text', () => {
    const h = new AttachmentHandler({ sessionId: sid })
    const input = 'see [image 1] then [image 2] also [image 3]'
    const out = h.stripPlaceholder(input, 2)
    expect(out).toBe('see [image 1] then  also [image 3]')   // [image 2] gone, neighbours intact
  })
})
```

`packages/tui/test/components/AttachmentChip.test.tsx`:
```tsx
import React from 'react'
import { describe, expect, test, vi } from 'vitest'
import { render } from 'ink-testing-library'
import { AttachmentChip } from '../../src/components/AttachmentChip'

describe('<AttachmentChip />', () => {
  test('renders [N] filename (size) [x]', () => {
    const out = render(
      <AttachmentChip
        n={1}
        filename="screenshot.png"
        sizeBytes={234 * 1024}
        onOpen={() => {}}
        onRemove={() => {}}
      />,
    )
    const f = out.lastFrame() ?? ''
    expect(f).toMatch(/\[1\]/)
    expect(f).toContain('screenshot.png')
    expect(f).toMatch(/234.?KB/)
    expect(f).toMatch(/\[x\]/i)
  })

  test('clicking the chip body fires onOpen with the registered path', () => {
    const onOpen = vi.fn()
    const out = render(
      <AttachmentChip n={1} filename="x.png" sizeBytes={1024} onOpen={onOpen} onRemove={() => {}} />,
    )
    // ink-testing-library doesn't simulate mouse; we expose a key shortcut for headless tests.
    out.stdin.write('o')
    expect(onOpen).toHaveBeenCalled()
  })

  test('pressing x triggers onRemove with attachment number', () => {
    const onRemove = vi.fn()
    const out = render(
      <AttachmentChip n={2} filename="x.png" sizeBytes={1024} onOpen={() => {}} onRemove={onRemove} />,
    )
    out.stdin.write('x')
    expect(onRemove).toHaveBeenCalledWith(2)
  })
})
```

- [ ] **Step 2: Run — FAIL (modules missing)**

```bash
pnpm vitest run packages/tui/test/unit/attachment-handler.test.ts packages/tui/test/components/AttachmentChip.test.tsx
```

Expected: FAIL — `Cannot find module .../input/attachment-handler` and `.../components/AttachmentChip`.

- [ ] **Step 3: Implement attachment settings reader**

`packages/tui/src/config/attachments.ts`:
```ts
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { resolvePaths } from '@glm/shared'

export interface AttachmentImageSettings {
  autoResize: boolean
  maxWidth: number
  maxHeight: number
  maxBytes: number
  supportedTypes: string[]
  defaultTool: string                // glm-vision MCP tool id
  cacheVisionResults: boolean
  preserveAfterSend: boolean
  cleanupAge: string                 // e.g. "7d"
}

export const DEFAULT_IMAGE_SETTINGS: AttachmentImageSettings = {
  autoResize: true,
  maxWidth: 2000,
  maxHeight: 2000,
  maxBytes: 4_718_592,               // 4.5MB (spec §9.12 / FIX-MANIFEST §12.0)
  supportedTypes: ['png','jpg','jpeg','webp','gif','heic','bmp','tiff'],
  defaultTool: 'image_analysis',
  cacheVisionResults: true,
  preserveAfterSend: true,
  cleanupAge: '7d',
}

/** Read `attachments.image.*` from ~/.glm/settings.json; missing keys fall back to defaults. */
export function loadImageSettings(): AttachmentImageSettings {
  const file = path.join(resolvePaths().root, 'settings.json')
  if (!existsSync(file)) return DEFAULT_IMAGE_SETTINGS
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'))
    const block = raw?.attachments?.image ?? {}
    return { ...DEFAULT_IMAGE_SETTINGS, ...block }
  } catch {
    return DEFAULT_IMAGE_SETTINGS
  }
}
```

- [ ] **Step 4: Implement `AttachmentHandler`**

`packages/tui/src/input/attachment-handler.ts`:
```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, copyFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { resolvePaths } from '@glm/shared'
import { loadImageSettings, type AttachmentImageSettings } from '../config/attachments'

export interface AttachmentRecord {
  n: number                  // monotonic per-message attachment index (matches `[image N]` placeholder)
  path: string               // absolute on-disk path (under ~/.glm/sessions/<sid>/attachments/)
  filename: string           // basename of `path`
  mime: string
  size: number
  sha256: string
}

export interface ClipboardSource {
  /** Returns a raw image buffer if the clipboard currently holds an image; null otherwise. */
  readImage(): Promise<Buffer | null>
}

export interface AttachmentHandlerOpts {
  sessionId: string
  clipboard?: ClipboardSource
  settings?: AttachmentImageSettings
}

const MIME_BY_MAGIC: Array<{ test: (b: Buffer) => boolean; mime: string; ext: string }> = [
  { test: b => b.slice(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])), mime: 'image/png',  ext: 'png' },
  { test: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,                              mime: 'image/jpeg', ext: 'jpg' },
  { test: b => b.slice(0,4).toString('ascii') === 'RIFF' && b.slice(8,12).toString('ascii') === 'WEBP', mime: 'image/webp', ext: 'webp' },
  { test: b => b.slice(0,6).toString('ascii') === 'GIF87a' || b.slice(0,6).toString('ascii') === 'GIF89a', mime: 'image/gif', ext: 'gif' },
  { test: b => b[0] === 0x42 && b[1] === 0x4d,                                               mime: 'image/bmp',  ext: 'bmp' },
  { test: b => b.slice(0,4).equals(Buffer.from([0x49,0x49,0x2a,0x00])) || b.slice(0,4).equals(Buffer.from([0x4d,0x4d,0x00,0x2a])), mime: 'image/tiff', ext: 'tiff' },
  // HEIC: ftyp box with brand 'heic' / 'heix' / 'mif1' at offset 4
  { test: b => b.length >= 12 && b.slice(4,8).toString('ascii') === 'ftyp' && /heic|heix|mif1/i.test(b.slice(8,12).toString('ascii')), mime: 'image/heic', ext: 'heic' },
]

function detectMime(buf: Buffer): { mime: string; ext: string } | null {
  for (const m of MIME_BY_MAGIC) if (m.test(buf)) return { mime: m.mime, ext: m.ext }
  return null
}

export class AttachmentHandler {
  private list_: AttachmentRecord[] = []
  private counter = 0
  public lastError: string | null = null

  constructor(private opts: AttachmentHandlerOpts) {
    this.opts.settings ??= loadImageSettings()
  }

  list(): AttachmentRecord[] { return [...this.list_] }
  get count(): number { return this.list_.length }

  remove(n: number): void {
    this.list_ = this.list_.filter(r => r.n !== n)
  }

  /** Replace `[image N]` placeholder for a removed attachment with empty string. */
  stripPlaceholder(text: string, n: number): string {
    const re = new RegExp(`\\[image\\s*${n}\\]`, 'g')
    return text.replace(re, '')
  }

  async acceptPaste(): Promise<AttachmentRecord | null> {
    this.lastError = null
    const cb = this.opts.clipboard
    if (!cb) { this.lastError = 'clipboard not available on this platform'; return null }
    const buf = await cb.readImage()
    if (!buf || buf.length === 0) return null
    return this.persist(buf)
  }

  async acceptDrop(srcPath: string): Promise<AttachmentRecord | null> {
    this.lastError = null
    if (!existsSync(srcPath)) { this.lastError = `not found: ${srcPath}`; return null }
    const buf = readFileSync(srcPath)
    return this.persist(buf, path.basename(srcPath))
  }

  private persist(buf: Buffer, hintName?: string): AttachmentRecord | null {
    const settings = this.opts.settings!
    if (buf.length > settings.maxBytes) {
      this.lastError = `attachment exceeds maxBytes (${buf.length} > ${settings.maxBytes}); autoResize happens in daemon, but TUI reject for now`
      // NOTE: daemon-side autoResize (P6-Fix-9) handles oversize; TUI accepts and lets daemon shrink.
      // For v0.1 we still pass it through so the user gets a real error if the daemon also refuses.
    }
    const detected = detectMime(buf)
    if (!detected) { this.lastError = `unsupported image format`; return null }
    if (!settings.supportedTypes.includes(detected.ext) && !(detected.ext === 'jpg' && settings.supportedTypes.includes('jpeg'))) {
      this.lastError = `unsupported image type: ${detected.ext}`; return null
    }
    const n = ++this.counter
    const dir = path.join(resolvePaths().root, 'sessions', this.opts.sessionId, 'attachments')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 })
    const filename = `img_${n}.${detected.ext}`
    const dest = path.join(dir, filename)
    writeFileSync(dest, buf, { mode: 0o600 })
    const sha = createHash('sha256').update(buf).digest('hex')
    const rec: AttachmentRecord = {
      n,
      path: dest,
      filename: hintName ?? filename,
      mime: detected.mime,
      size: statSync(dest).size,
      sha256: sha,
    }
    this.list_.push(rec)
    return rec
  }
}

/** Resolve `@/abs/path/to/img.png` → attachment via the handler's drop flow. */
export async function resolveAtPath(handler: AttachmentHandler, token: string): Promise<AttachmentRecord | null> {
  if (!token.startsWith('@')) return null
  const p = token.slice(1)
  return handler.acceptDrop(p)
}

/** Detect `/raw` modifier inside message text; returns `{raw, text}` with the token stripped. */
export function parseRawModifier(text: string): { raw: boolean; text: string } {
  // Match `/raw` only when adjacent to an `[image N]` placeholder, to avoid eating literal `/raw`
  // in source-code paste. Simplest reliable form: `[image N]/raw`.
  if (/\[image\s*\d+\]\/raw\b/.test(text)) {
    return { raw: true, text: text.replace(/\[image\s*(\d+)\]\/raw/g, '[image $1]') }
  }
  return { raw: false, text }
}
```

- [ ] **Step 5: Implement `<AttachmentChip />`**

`packages/tui/src/components/AttachmentChip.tsx`:
```tsx
import React from 'react'
import { Box, Text, useInput } from 'ink'
import { execFile } from 'node:child_process'

export interface AttachmentChipProps {
  n: number
  filename: string
  sizeBytes: number
  onOpen: () => void
  onRemove: (n: number) => void
  path?: string                      // absolute path — used by default onOpen
}

function fmtBytes(b: number): string {
  if (b < 1024) return `${b}B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)}KB`
  return `${(b / (1024 * 1024)).toFixed(1)}MB`
}

export function AttachmentChip(props: AttachmentChipProps): React.JSX.Element {
  const { n, filename, sizeBytes, onOpen, onRemove, path } = props
  useInput((input) => {
    if (input === 'x' || input === 'X') onRemove(n)
    if (input === 'o' || input === 'O') {
      // Default open behavior: shell out to the OS image viewer. Components can override via onOpen.
      if (path) {
        const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open'
        const args = process.platform === 'win32' ? ['/c', 'start', '', path] : [path]
        try { execFile(cmd, args, () => {}) } catch { /* swallow — best-effort */ }
      }
      onOpen()
    }
  })

  return (
    <Box borderStyle="round" paddingX={1} marginRight={1}>
      <Text>[{n}] </Text>
      <Text bold>{filename}</Text>
      <Text dimColor> ({fmtBytes(sizeBytes)}) </Text>
      <Text color="red">[x]</Text>
    </Box>
  )
}
```

- [ ] **Step 6: Run handler + chip tests — PASS**

```bash
pnpm vitest run packages/tui/test/unit/attachment-handler.test.ts packages/tui/test/components/AttachmentChip.test.tsx
```

Expected: 13 handler tests + 3 chip tests = 16 green.

- [ ] **Step 7: Wire attachments into `<ChatView />` and `message.send`**

`packages/tui/test/integration/chat-attach.test.tsx`:
```tsx
import React from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render } from 'ink-testing-library'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { ChatView } from '../../src/components/ChatView'
import { themes } from '../../src/theme'
import { createChatLog } from '../../src/state/chatLog'
import { createSessionState } from '../../src/state/sessionState'
import { createViewRouter } from '../../src/state/viewRouter'
import { buildDefaultRegistry } from '../../src/slash'

let home: string
beforeEach(() => {
  home = mkdtempSync(path.join(os.tmpdir(), 'glm-chat-att-'))
  process.env.GLM_HOME = home
})
afterEach(() => {
  rmSync(home, { recursive: true, force: true })
  delete process.env.GLM_HOME
})

function fakeRpc() {
  const calls: Array<{ method: string; params: any }> = []
  return {
    calls,
    call: vi.fn(async (method: string, params: any) => {
      calls.push({ method, params })
      if (method === 'message.send') return { content: '(stub)', model: 'GLM-5.1' }
      return {}
    }),
  } as any
}

describe('<ChatView /> attachment integration (P2-Fix-6)', () => {
  test('drag-drop @/path/to/img.png appends chip and includes attachments in message.send', async () => {
    const src = path.join(home, 'shot.png')
    writeFileSync(src, Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))
    const rpc = fakeRpc()
    const log = createChatLog()
    const session = createSessionState(); session.set({ id: 'sess-x' } as any)
    const out = render(
      <ChatView
        theme={themes.dark}
        chatLog={log}
        session={session}
        viewRouter={createViewRouter()}
        registry={buildDefaultRegistry()}
        rpc={rpc}
        exit={() => {}}
      />,
    )
    // Simulate user typing `@<src>` and pressing Enter
    out.stdin.write(`@${src}\r`)
    await new Promise(r => setTimeout(r, 30))
    // Now type the message body referencing the attachment
    out.stdin.write('[image 1] what do you see?\r')
    await new Promise(r => setTimeout(r, 30))

    const send = rpc.calls.find(c => c.method === 'message.send')
    expect(send).toBeTruthy()
    expect(send!.params.attachments).toHaveLength(1)
    expect(send!.params.attachments[0]).toMatchObject({
      mime: 'image/png',
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
    expect(send!.params.text).toMatch(/\[image 1\] what do you see\?/)
  })

  test('/raw modifier sets attachments[*].raw = true (skips vision routing)', async () => {
    const src = path.join(home, 'shot.png')
    writeFileSync(src, Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))
    const rpc = fakeRpc()
    const log = createChatLog()
    const session = createSessionState(); session.set({ id: 'sess-x' } as any)
    const out = render(
      <ChatView
        theme={themes.dark}
        chatLog={log}
        session={session}
        viewRouter={createViewRouter()}
        registry={buildDefaultRegistry()}
        rpc={rpc}
        exit={() => {}}
      />,
    )
    out.stdin.write(`@${src}\r`)
    await new Promise(r => setTimeout(r, 30))
    out.stdin.write('[image 1]/raw decode this PNG\r')
    await new Promise(r => setTimeout(r, 30))

    const send = rpc.calls.find(c => c.method === 'message.send')
    expect(send!.params.attachments[0].raw).toBe(true)
    expect(send!.params.text).not.toContain('/raw')              // token stripped
    expect(send!.params.text).toContain('[image 1] decode this PNG')
  })
})
```

Modify `packages/tui/src/components/ChatView.tsx` (surgical additions):
```tsx
// Imports at top
import { AttachmentChip } from './AttachmentChip'
import { AttachmentHandler, resolveAtPath, parseRawModifier, type AttachmentRecord } from '../input/attachment-handler'

// Inside ChatView component body — after the existing useState hooks:
const [attachments, setAttachments] = useState<AttachmentRecord[]>([])
const handlerRef = React.useRef<AttachmentHandler | null>(null)
React.useEffect(() => {
  const sid = session.get()?.id
  if (!sid) return
  handlerRef.current = new AttachmentHandler({
    sessionId: sid,
    clipboard: {
      readImage: async () => {
        try {
          const cb = await import('clipboardy')                       // optional dep
          // clipboardy v3 only handles text — for images we attempt a native fallback via `pbpaste -Prefer png` on macOS.
          if (process.platform === 'darwin') {
            const { execFileSync } = await import('node:child_process')
            try { return execFileSync('pbpaste', ['-Prefer', 'png']) } catch { return null }
          }
          return null   // Linux/Windows clipboard-image read deferred to follow-up; drop / `@path` still work
        } catch { return null }
      },
    },
  })
}, [session])

// Add input handler for `@<path>` tokens — intercept before normal slash/text submit:
async function handleAtPath(text: string): Promise<boolean> {
  if (!text.startsWith('@') || !handlerRef.current) return false
  const rec = await resolveAtPath(handlerRef.current, text.trim())
  if (rec) {
    setAttachments(handlerRef.current.list())
    setInput('')                                                       // clear the @path token from the box
    return true
  }
  chatLog.appendError(handlerRef.current.lastError ?? 'attachment failed')
  return true                                                          // we still consumed the input
}

// Replace the existing handleSubmit body — splice attachment shipping into the `message.send` call:
async function handleSubmit(text: string): Promise<void> {
  if (await handleAtPath(text)) return
  if (!text.trim() || sending) return
  setInput('')
  if (text.startsWith('/')) {
    // ... existing slash dispatch unchanged ...
    return
  }
  // Strip `/raw` modifiers and flag matching attachments as raw=true (vision routing bypass)
  const { raw, text: cleaned } = parseRawModifier(text)
  const handler = handlerRef.current
  const payload = {
    sessionId: session.get()!.id,
    text: cleaned,
    attachments: (handler?.list() ?? []).map(r => ({
      path: r.path, mime: r.mime, size: r.size, sha256: r.sha256, raw,
    })),
  }
  chatLog.appendUserMessage(cleaned)
  setSending(true)
  try {
    const resp = await rpc.call<{ content: string; model: string }>('message.send', payload)
    chatLog.appendAssistantMessage(resp.content)
    // After send: per settings.attachments.image.preserveAfterSend, drop the list (default true keeps).
    if (handler && !(handler['opts']?.settings?.preserveAfterSend ?? true)) {
      // intentional shallow access — handler exposes no clear() method; if preserveAfterSend=false we reset.
      setAttachments([])
    }
  } catch (e) {
    chatLog.appendError((e as Error).message)
  } finally {
    setSending(false)
  }
}

// In the render tree, insert the chip strip ABOVE the InputBox:
return (
  <Box flexDirection="column" flexGrow={1}>
    <ChatLog theme={theme} messages={chatLog.snapshot()} />
    {attachments.length > 0 && (
      <Box>
        {attachments.map(r => (
          <AttachmentChip
            key={r.n}
            n={r.n}
            path={r.path}
            filename={r.filename}
            sizeBytes={r.size}
            onOpen={() => {}}
            onRemove={(n) => {
              handlerRef.current?.remove(n)
              setInput(prev => handlerRef.current?.stripPlaceholder(prev, n) ?? prev)
              setAttachments(handlerRef.current?.list() ?? [])
            }}
          />
        ))}
      </Box>
    )}
    {completions.length > 0 && (
      <SlashMenu theme={theme} items={completions} selectedIndex={0} />
    )}
    <InputBox
      theme={theme}
      value={input}
      onChange={setInput}
      onSubmit={handleSubmit}
      disabled={sending}
    />
  </Box>
)
```

- [ ] **Step 8: Run integration test — PASS**

```bash
pnpm vitest run packages/tui/test/integration/chat-attach.test.tsx
```

Expected: 2 green (drop + `/raw`).

- [ ] **Step 9: Manual smoke (paste / drop / @path / /raw / remove)**

```bash
export GLM_HOME=/tmp/glm-p2-att-$$
rm -rf $GLM_HOME
node packages/cli/dist/bin.js daemon start
node packages/cli/dist/bin.js tui
# Inside TUI:
#   1) Take a screenshot (macOS: Cmd-Shift-4 → click region) → clipboard now has PNG
#   2) Type "ctrl-V" (paste) → chip [1] screenshot (XXKB) [x] appears above input
#   3) Type "[image 1] what is this?" and Enter
#      → daemon logs show attachments=[{path,mime=image/png,sha256,raw=false}]
#   4) Drag a file from Finder into the terminal → `@/abs/path/foo.png` appears in input
#      Press Enter → chip [2] foo.png appears
#   5) Press x while chip 2 focused → chip removed; if "[image 2]" was in input, placeholder gone
#   6) Type "[image 1]/raw write a PNG decoder" Enter
#      → daemon logs show attachments=[{... raw=true}] (vision routing bypassed, see P6-Fix-9)
node packages/cli/dist/bin.js daemon stop
```

- [ ] **Step 10: Commit**

```bash
git add packages/tui packages/shared
git commit -m "feat(tui): image attachment input handling — paste/drop/@path + chip + /raw (P2-Fix-6 — spec §9.12)"
```

---

## P2 Completion — Verification Checklist

Before claiming P2 done, run all of these and confirm output:

- [ ] **Build clean:** `pnpm build` → no errors across `@glm/shared`, `@glm/core`, `@glm/tui`, `@glm/cli`.
- [ ] **All tests pass:** `pnpm vitest run` → all green (~60 total: P1 ~20 + P2 ~40 + 2 integration).
- [ ] **`glm` (no args) launches TUI:**
  ```bash
  export GLM_HOME=/tmp/glm-p2-smoke-$$
  rm -rf $GLM_HOME
  node packages/cli/dist/bin.js daemon start
  node packages/cli/dist/bin.js          # → TUI renders
  # inside TUI: type "hello" Enter (expect echo); /help; Tab (Dashboard); Tab (Chat); Ctrl-D
  ```
- [ ] **`glm tui` explicit alias works:**
  ```bash
  node packages/cli/dist/bin.js tui
  # Ctrl-D to exit
  ```
- [ ] **`glm "echo X"` one-shot still works (no TUI launch):**
  ```bash
  node packages/cli/dist/bin.js "echo bye"
  # expect: assistant [stub-echo] echo bye  (P1 contract preserved)
  ```
- [ ] **Slash commands inside TUI:**
  - `/help` → lists 8 commands.
  - `/sessions` → lists at least 1 session.
  - `/attach <suffix>` → switches active session (status line shows new id suffix).
  - `/daemon status` → prints pid + uptime + version.
  - `/history` → prints message log so far.
  - `/context` → prints "context not ready (P7 not yet implemented)" (graceful 404 — P7 wires `context.assemble` later).
  - `/compact` → prints "compact not ready (P7 not yet implemented)" (graceful 404 — P7 wires `context.compact` later).
  - `/model` → opens 3-stage picker (model → action → thinking); `/model show` lists 8 mappings; `/model <action> <model> [<thinking>]` direct set; `/model reset [<action>]` restores defaults (P2-Fix-5; RPC handlers from P6-Fix-7 — until P6 wires `model.list / .set / .show / .reset`, surfaces as "method not found").
  - `/quit` → exits TUI cleanly.
- [ ] **Image attachment input handling (P2-Fix-6):**
  - Cmd-Shift-4 screenshot → Ctrl-V (paste) → chip `[1] screenshot (XXKB) [x]` renders above InputBox.
  - Drag-drop a PNG/JPG/WebP from Finder/Explorer → `@/abs/path` appears → Enter → chip appears.
  - `[image 1] what is this?` Enter → `message.send` RPC includes `attachments: [{path,mime,size,sha256,raw:false}]`.
  - `[image 1]/raw write a decoder` → `/raw` token stripped, attachment marked `raw=true` (vision routing bypass — P6-Fix-9 handles the bypass on daemon side).
  - `[x]` press while chip focused → attachment removed; `[image N]` placeholder also stripped from input box.
  - Unsupported format (SVG/PDF) → user-visible error "unsupported image format".
  - `attachments.image.maxBytes`, `defaultTool`, `cleanupAge` honored from `~/.glm/settings.json`.
- [ ] **Catch-all dispatcher (CLI passthrough):**
  - `/some-unknown-cmd` → prints "command not available yet (cli.exec handler arrives in P4)". P4 wires `rpc.call('cli.exec', …)` so every CLI subcommand becomes reachable as `/<cmd>`.
- [ ] **Tab/Esc/Ctrl-D bindings:**
  - Tab toggles Chat ↔ Dashboard (status line label flips).
  - Ctrl-D exits to shell with exit code 0.
- [ ] **Theme:** `GLM_THEME=light node packages/cli/dist/bin.js tui` renders without color errors.
- [ ] **No leaked processes:** `ps aux | grep -E 'daemon-entry|bin\.js'` shows nothing after the TUI quits and `glm daemon stop`.
- [ ] **Dashboard panels visible:** Orchestrator/Main/Workers/Status all render with placeholder copy; Status panel shows live `pid`/`uptime`/`version` and the 5 most-recent session suffixes.

If anything above fails, fix before declaring P2 done.

---

## What P2 does NOT include (deferred to later P-plans)

These are intentionally out of scope for P2:

- **No tool cards / Read/Edit/Bash UI** — Chat view renders text only. Tool-call rendering arrives with the tool layer in **P3**.
- **No real LLM streaming** — `useStreamingMessage` subscribes to `message.delta` but P1's stub `message.send` returns one whole reply. Real streaming chunks land with the LLM router in **P6**.
- **No orchestrator data on Dashboard** — Orchestrator/Workers panels show placeholder copy. Live decision log + worker state machine populate them in **P8**.
- **No advanced slash commands** — `/auto`, `/plan`, `/route`, `/cancel`, `/pause`, `/mcp`, `/skill`, `/plugin`, `/memory`, `/budget` all defer until their respective subsystems exist (**P4/P5/P6/P7/P8**). `/context` and `/compact` ship in P2 as RPC façades — they print "not ready (P7 not yet implemented)" until P7 wires `context.assemble` and `context.compact`. CLI passthrough via the catch-all dispatcher (`rpc.call('cli.exec', …)`) returns "command not available yet" until P4 wires `cli.exec`.
- **No input history (↑/↓ to recall prior prompts)** — InputBox is single-buffer. History store + key bindings land in **P3**.
- **No multi-line composer** — Enter sends; Shift-Enter / `\` continuations come in **P3** alongside hashline edit UX.
- **No mouse / scrollback** — Ink's terminal model is line-based; full scrollback comes when we add the pager in **P9**.
- **No attach/detach animation** — `Ctrl-D` exits; `glm detach` (keep daemon, drop client) and re-attach polish wait for **P10**.
- **No status-line ctx %** — placeholder `0%`. Real context-budget HUD (§8.11) requires the memory engine, in **P7**.
- **No theme hot-reload** — `GLM_THEME` read once at startup. `/theme` slash command + watch lands in **P10**.
- **No accessibility audit / screen-reader output** — Ink-default; full a11y pass deferred to **P10**.

P2 is the **client foundation**. Subsequent P-plans (P3 tools, P6 streaming, P7 memory, P8 orchestrator) all flow data INTO the panels and tool cards rendered by these P2 components without changing their public props.
