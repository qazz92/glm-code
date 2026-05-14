# glm code — P4: MCP / Skill / Plugin / Slash Command Compat + Bundled GLM MCPs

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `glm` a drop-in replacement for the Claude Code MCP / Skill / Plugin / Slash command ecosystem. After P4, dropping `glm` onto a machine that already has `~/.claude/`, `~/.claude.json`, `~/.claude/plugins/`, `~/.claude/skills/`, `~/.claude/commands/` and project-level `.claude/` + `.mcp.json` MUST result in 100% of those assets working unchanged — plus the 4 bundled GLM MCP servers (vision / web-search / web-reader / zread) auto-registered on first daemon start.

**Architecture:** All loading happens in the daemon. The config cascade resolver walks 6 source dirs (global GLM, global Claude, project GLM, project Claude, plus `.mcp.json` and `~/.claude.json`), deep-merging `mcpServers` / `hooks` / `permissions`. A `McpHost` spawns each MCP server (stdio / sse / http transports via `@modelcontextprotocol/sdk`) and registers their `tools`, `resources`, `prompts` into the P3 tool registry. A `SkillLoader` parses `SKILL.md` files (YAML frontmatter + body + `references/` + `scripts/`) from the cascade and registers each skill as a lazy-invoke `Skill` tool in the P3 registry. A `PluginLoader` reads `plugin.json` manifests under `~/.claude/plugins/cache/<name>/<version>/`, namespacing their contents (`<plugin>:<skill>`, `<plugin>:<command>`). A `CommandLoader` walks all command source dirs and resolves `/<cmd>` references at runtime (with `$ARGUMENTS` substitution). The mcp:// URL handler from §9.18 plugs into P3's URL router and forwards reads to the matching MCP server's `resources/read` endpoint. Hook configs are parsed and validated here but the event dispatcher is P5.

**Tech Stack:** Inherits P1 (Node 22+, TypeScript 5.6+, pnpm workspaces, better-sqlite3, pino, zod, ulid, commander, vitest). Adds: `@modelcontextprotocol/sdk` ^1.0, `gray-matter` (frontmatter parsing), `chokidar` (config + skill watch), `eventsource` (SSE polyfill for Node), `open` (browser launch for OAuth callback).

**Acceptance criteria for P4:**
- `glm mcp add/list/remove/auth/call/reload` works; stdio / sse / http servers spawn, list tools, and respond to `tools/call`
- An existing user `~/.claude.json` with MCP servers is read and those servers are spawned identically
- An existing project `.mcp.json` is read and merged on top
- OAuth flow for an MCP server completes via local callback and writes credentials to `~/.glm/credentials/<server>.json`
- `glm skill list` enumerates skills from all cascade dirs; `glm skill show <name>` prints body + references list
- A Skill referenced through the `Skill` tool from P3 is loaded lazily on first invocation
- `glm plugin list/install/uninstall/enable/disable` works on `~/.claude/plugins/cache/...`; namespaced skills appear with `<plugin>:<skill>`
- `glm cmd list` shows all slash commands from cascade with `$ARGUMENTS` substitution working
- Bundled GLM MCPs auto-registered on first daemon start; `WebSearch` / `WebFetch` / `Vision.*` / `Zread.*` LLM-side names route to `glm-web-search` / `glm-web-reader` / `glm-vision` / `glm-zread`
- Web cache stores responses with correct TTLs (1h reader, 10m search) in `~/.glm/cache/web/`
- `Read("mcp://<server>/<resource>")` round-trips via P3 URL router
- Hook configs in `settings.json` load and validate without runtime dispatch
- ≥75% unit coverage on core modules; ≥1 integration test per task that wires an external moving part (dummy MCP server, fake plugin, etc.)

---

## File Structure

```
glm-code/                                # repo root (cwd: /Users/glen/twelvelabs_works/study)
├── packages/
│   ├── core/
│   │   ├── package.json                 # add MCP SDK, gray-matter, chokidar, eventsource, open
│   │   └── src/
│   │       ├── config/
│   │       │   ├── cascade.ts           # 6-source walker, deep merge
│   │       │   ├── schema.ts            # zod validators for settings.json / .mcp.json / plugin.json / SKILL.md FM
│   │       │   ├── merge.ts             # deep-merge with mcpServers/hooks/permissions semantics
│   │       │   ├── watcher.ts           # chokidar wrapper, debounced 200ms
│   │       │   └── index.ts
│   │       ├── mcp/
│   │       │   ├── host.ts              # McpHost — owns all connected servers
│   │       │   ├── server-handle.ts     # one connection (transport + client + manifest)
│   │       │   ├── transports/
│   │       │   │   ├── stdio.ts         # spawn child + framed JSON-RPC over pipes
│   │       │   │   ├── sse.ts           # SSE-based MCP client
│   │       │   │   ├── http.ts          # streamable-http transport
│   │       │   │   └── index.ts
│   │       │   ├── oauth.ts             # OAuth flow + token storage
│   │       │   ├── credentials.ts       # ~/.glm/credentials/ reader/writer
│   │       │   ├── tool-bridge.ts       # adapter that turns MCP tool → P3 ToolRegistry entry
│   │       │   ├── resource-bridge.ts   # adapter for resources/read → URL router handler
│   │       │   ├── env-interp.ts        # ${VAR} interpolation for command/args/env/headers
│   │       │   ├── url-handler.ts       # mcp:// URL scheme handler (registers in P3 URL router)
│   │       │   ├── lifecycle.ts         # start-all / stop-all / reload-one / health
│   │       │   └── index.ts
│   │       ├── skills/
│   │       │   ├── loader.ts            # SkillLoader — cascade walk + parse + watch
│   │       │   ├── parser.ts            # SKILL.md parse (frontmatter + body + refs + scripts)
│   │       │   ├── registry.ts          # in-memory registry keyed by namespaced id
│   │       │   ├── invoker.ts           # lazy-fetch on Skill-tool call (depth=2 sub-skill guard)
│   │       │   ├── catalog.ts           # produces system-prompt summary line per skill
│   │       │   └── index.ts
│   │       ├── plugins/
│   │       │   ├── loader.ts            # ~/.claude/plugins/cache/<name>/<ver>/ scanner
│   │       │   ├── manifest.ts          # plugin.json parser + zod validator
│   │       │   ├── namespace.ts         # prefix helpers
│   │       │   ├── registry.ts          # PluginRegistry (enable/disable state in SQLite)
│   │       │   ├── installer.ts         # install/uninstall (filesystem ops only — no remote fetch in P4)
│   │       │   └── index.ts
│   │       ├── commands/
│   │       │   ├── loader.ts            # cascade walker (builtin / global GLM / global Claude / plugins / project)
│   │       │   ├── parser.ts            # frontmatter + body + $ARGUMENTS substitution
│   │       │   ├── registry.ts
│   │       │   ├── builtin/             # P4 ships 0 builtin commands — P11 fills this
│   │       │   │   └── .gitkeep
│   │       │   └── index.ts
│   │       ├── hooks/
│   │       │   ├── config.ts            # parse hooks block from settings, validate matchers
│   │       │   ├── schema.ts            # zod schema; P5 owns dispatch
│   │       │   └── index.ts
│   │       ├── web-cache/
│   │       │   ├── cache.ts             # SHA-keyed JSON store under ~/.glm/cache/web/
│   │       │   ├── ttl.ts               # per-route TTL policy
│   │       │   └── index.ts
│   │       ├── bundled-mcp/
│   │       │   ├── definitions.ts       # the 4 bundled mcpServers entries
│   │       │   ├── bootstrap.ts         # first-run write to ~/.glm/settings.json
│   │       │   ├── routing.ts           # LLM-name → MCP route map
│   │       │   └── index.ts
│   │       └── rpc/methods/
│   │           ├── mcp.ts               # mcp.add/list/remove/auth/call/reload RPC
│   │           ├── skill.ts             # skill.list/show/invoke
│   │           ├── plugin.ts            # plugin.list/install/uninstall/enable/disable
│   │           └── command.ts           # command.list/run
│   │   └── test/
│   │       ├── unit/
│   │       │   ├── config-cascade.test.ts
│   │       │   ├── config-merge.test.ts
│   │       │   ├── mcp-env-interp.test.ts
│   │       │   ├── mcp-oauth.test.ts
│   │       │   ├── skill-parser.test.ts
│   │       │   ├── skill-loader.test.ts
│   │       │   ├── plugin-manifest.test.ts
│   │       │   ├── plugin-loader.test.ts
│   │       │   ├── command-parser.test.ts
│   │       │   ├── hooks-config.test.ts
│   │       │   ├── web-cache.test.ts
│   │       │   ├── bundled-bootstrap.test.ts
│   │       │   └── bundled-routing.test.ts
│   │       └── integration/
│   │           ├── mcp-stdio-roundtrip.test.ts
│   │           ├── mcp-http-roundtrip.test.ts
│   │           ├── skill-invoke.test.ts
│   │           ├── plugin-namespacing.test.ts
│   │           ├── command-cascade.test.ts
│   │           ├── mcp-url-handler.test.ts
│   │           ├── bundled-firstrun.test.ts
│   │           └── _fixtures/
│   │               ├── dummy-mcp-server.mjs    # tiny stdio MCP server for tests
│   │               ├── fake-plugin/            # plugin.json + 1 skill + 1 command
│   │               │   ├── plugin.json
│   │               │   ├── skills/hello/SKILL.md
│   │               │   └── commands/greet.md
│   │               └── claude-home/            # simulated ~/.claude/ tree
│   │                   ├── settings.json
│   │                   ├── skills/sample/SKILL.md
│   │                   └── commands/sample.md
│   └── cli/
│       └── src/commands/
│           ├── mcp.ts                   # `glm mcp ...`
│           ├── skill.ts                 # `glm skill ...`
│           ├── plugin.ts                # `glm plugin ...`
│           └── cmd.ts                   # `glm cmd ...`
```

---

## Task 1: Dependency add + path additions

**Files:**
- Modify: `packages/core/package.json`
- Modify: `packages/shared/src/paths.ts`
- Test: `packages/shared/test/paths.test.ts` (extend)

- [ ] **Step 1: Add dependencies to `packages/core/package.json`**

Add to `dependencies`:
```jsonc
"@modelcontextprotocol/sdk": "^1.0.0",
"gray-matter": "^4.0.3",
"chokidar": "^4.0.0",
"eventsource": "^2.0.2",
"open": "^10.1.0"
```

Add to `devDependencies`:
```jsonc
"@types/eventsource": "^1.1.15"
```

- [ ] **Step 2: Install**

```bash
pnpm install
```

Expected: no errors. Verify lockfile updated.

- [ ] **Step 3: Extend path resolver — add credentials / cache / plugins / skills / commands roots**

Modify `packages/shared/src/paths.ts` — extend `GlmPaths` interface and `resolvePaths` return value:

```ts
export interface GlmPaths {
  root: string
  socket: string
  pid: string
  log: string
  sessionsDir: string
  quotaDb: string
  configFile: string         // ~/.glm/settings.json (P4 renames from earlier)
  agentsMd: string
  credentialsDir: string     // ~/.glm/credentials/
  webCacheDir: string        // ~/.glm/cache/web/
  pluginsDir: string         // ~/.glm/plugins/ (glm-native; claude plugins read from ~/.claude/plugins/)
  skillsDir: string          // ~/.glm/skills/
  commandsDir: string        // ~/.glm/commands/
  claudeHome: string         // ~/.claude/
  claudeJson: string         // ~/.claude.json
  claudeSettings: string     // ~/.claude/settings.json
  claudePluginsCache: string // ~/.claude/plugins/cache/
  claudeSkillsDir: string    // ~/.claude/skills/
  claudeCommandsDir: string  // ~/.claude/commands/
  claudeCredentialsDir: string // ~/.claude/credentials/
}
```

Update `resolvePaths`:

```ts
export function resolvePaths(opts: ResolveOpts = {}): GlmPaths {
  const env = opts.env ?? process.env
  const home = opts.home ?? os.homedir()
  const root = env.GLM_HOME ?? path.join(home, '.glm')
  const claudeHome = env.CLAUDE_HOME ?? path.join(home, '.claude')
  return {
    root,
    socket: path.join(root, 'daemon.sock'),
    pid: path.join(root, 'daemon.pid'),
    log: path.join(root, 'daemon.log'),
    sessionsDir: path.join(root, 'sessions'),
    quotaDb: path.join(root, 'quota.db'),
    configFile: path.join(root, 'settings.json'),
    agentsMd: path.join(root, 'AGENTS.md'),
    credentialsDir: path.join(root, 'credentials'),
    webCacheDir: path.join(root, 'cache', 'web'),
    pluginsDir: path.join(root, 'plugins'),
    skillsDir: path.join(root, 'skills'),
    commandsDir: path.join(root, 'commands'),
    claudeHome,
    claudeJson: path.join(home, '.claude.json'),
    claudeSettings: path.join(claudeHome, 'settings.json'),
    claudePluginsCache: path.join(claudeHome, 'plugins', 'cache'),
    claudeSkillsDir: path.join(claudeHome, 'skills'),
    claudeCommandsDir: path.join(claudeHome, 'commands'),
    claudeCredentialsDir: path.join(claudeHome, 'credentials'),
  }
}
```

> P1 used `~/.glm/config.json`. P4 standardizes on `settings.json` (Claude Code parity). Any P1 code referencing `paths.configFile` keeps working since the field name is unchanged.

- [ ] **Step 4: Extend the path unit test**

Append to `packages/shared/test/paths.test.ts`:

```ts
test('returns claude-compat paths', () => {
  const p = resolvePaths({ home: '/Users/test' })
  expect(p.claudeHome).toBe('/Users/test/.claude')
  expect(p.claudeJson).toBe('/Users/test/.claude.json')
  expect(p.claudePluginsCache).toBe('/Users/test/.claude/plugins/cache')
  expect(p.webCacheDir).toBe('/Users/test/.glm/cache/web')
})

test('CLAUDE_HOME env override', () => {
  const p = resolvePaths({ home: '/u/t', env: { CLAUDE_HOME: '/tmp/claude' } })
  expect(p.claudeHome).toBe('/tmp/claude')
  expect(p.claudeSkillsDir).toBe('/tmp/claude/skills')
})
```

- [ ] **Step 5: Run tests — PASS**

```bash
pnpm vitest run packages/shared/test/paths.test.ts
```

Expected: 4 passes (2 from P1 + 2 new).

- [ ] **Step 6: Commit**

```bash
git add packages
git commit -m "chore(p4): add MCP/skill deps + extend paths for claude compat"
```

---

## Task 2: Config cascade resolver

**Files:**
- Create: `packages/core/src/config/schema.ts`
- Create: `packages/core/src/config/merge.ts`
- Create: `packages/core/src/config/cascade.ts`
- Create: `packages/core/src/config/index.ts`
- Test: `packages/core/test/unit/config-cascade.test.ts`
- Test: `packages/core/test/unit/config-merge.test.ts`

- [ ] **Step 1: Write the settings schema**

`packages/core/src/config/schema.ts`:

```ts
import { z } from 'zod'

export const McpServerStdio = z.object({
  type: z.literal('stdio').optional(),
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  cwd: z.string().optional(),
  disabled: z.boolean().optional(),
  builtin: z.boolean().optional(),
})

export const McpServerSse = z.object({
  type: z.literal('sse'),
  url: z.string().url(),
  headers: z.record(z.string()).optional(),
  disabled: z.boolean().optional(),
  builtin: z.boolean().optional(),
})

export const McpServerHttp = z.object({
  type: z.literal('http'),
  url: z.string().url(),
  headers: z.record(z.string()).optional(),
  disabled: z.boolean().optional(),
  builtin: z.boolean().optional(),
})

export const McpServerEntry = z.union([McpServerStdio, McpServerSse, McpServerHttp])
export type McpServerEntry = z.infer<typeof McpServerEntry>

export const HookEntry = z.object({
  matcher: z.string().optional(),
  hooks: z.array(z.object({
    type: z.literal('command'),
    command: z.string(),
    timeout: z.number().int().positive().optional(),
  }))
})

export const HooksBlock = z.record(z.array(HookEntry))
export type HooksBlock = z.infer<typeof HooksBlock>

export const PermissionsBlock = z.object({
  allow: z.array(z.string()).optional(),
  deny: z.array(z.string()).optional(),
  ask: z.array(z.string()).optional(),
}).passthrough()

export const SettingsFile = z.object({
  mcpServers: z.record(McpServerEntry).optional(),
  hooks: HooksBlock.optional(),
  permissions: PermissionsBlock.optional(),
  model: z.string().optional(),
  env: z.record(z.string()).optional(),
}).passthrough()

export type SettingsFile = z.infer<typeof SettingsFile>
```

- [ ] **Step 2: Write a deep-merge module**

`packages/core/src/config/merge.ts`:

```ts
import type { SettingsFile } from './schema'

const MERGE_KEYS = new Set(['mcpServers', 'hooks', 'permissions', 'env'])

/**
 * Deep-merges `override` on top of `base`. For top-level keys in MERGE_KEYS,
 * objects/arrays are merged recursively. Other keys are replaced wholesale.
 * mcpServers: per-name override replaces the entry.
 * hooks: per-event-name arrays concatenate (so multiple sources can register hooks).
 * permissions.allow/deny/ask: arrays concatenate and dedup.
 */
export function mergeSettings(base: SettingsFile, override: SettingsFile): SettingsFile {
  const out: SettingsFile = { ...base }
  for (const [k, v] of Object.entries(override)) {
    if (v === undefined) continue
    if (!MERGE_KEYS.has(k)) { (out as Record<string, unknown>)[k] = v; continue }
    if (k === 'mcpServers') {
      out.mcpServers = { ...(base.mcpServers ?? {}), ...(v as Record<string, unknown>) } as SettingsFile['mcpServers']
    } else if (k === 'hooks') {
      const merged: Record<string, unknown[]> = { ...(base.hooks ?? {}) } as Record<string, unknown[]>
      for (const [evt, arr] of Object.entries(v as Record<string, unknown[]>)) {
        merged[evt] = [...(merged[evt] ?? []), ...arr]
      }
      out.hooks = merged as SettingsFile['hooks']
    } else if (k === 'permissions') {
      const a = (base.permissions ?? {}) as Record<string, unknown>
      const b = v as Record<string, unknown>
      const m: Record<string, unknown> = { ...a }
      for (const field of ['allow', 'deny', 'ask']) {
        const aa = (a[field] as string[] | undefined) ?? []
        const bb = (b[field] as string[] | undefined) ?? []
        if (aa.length || bb.length) m[field] = Array.from(new Set([...aa, ...bb]))
      }
      out.permissions = m as SettingsFile['permissions']
    } else if (k === 'env') {
      out.env = { ...(base.env ?? {}), ...(v as Record<string, string>) }
    }
  }
  return out
}

export function mergeAll(layers: SettingsFile[]): SettingsFile {
  return layers.reduce((acc, x) => mergeSettings(acc, x), {} as SettingsFile)
}
```

- [ ] **Step 3: Failing test — merge semantics**

`packages/core/test/unit/config-merge.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { mergeSettings, mergeAll } from '../../src/config/merge'

describe('mergeSettings', () => {
  test('mcpServers: per-name override', () => {
    const base = { mcpServers: { a: { command: 'old' }, b: { command: 'b' } } }
    const ov   = { mcpServers: { a: { command: 'new' } } }
    const out = mergeSettings(base as never, ov as never)
    expect(out.mcpServers!.a).toEqual({ command: 'new' })
    expect(out.mcpServers!.b).toEqual({ command: 'b' })
  })

  test('hooks: per-event arrays concatenate', () => {
    const base = { hooks: { PreToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: 'a' }] }] } }
    const ov   = { hooks: { PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'b' }] }] } }
    const out = mergeSettings(base as never, ov as never)
    expect(out.hooks!.PreToolUse).toHaveLength(2)
  })

  test('permissions.allow: dedup union', () => {
    const base = { permissions: { allow: ['Bash(ls:*)', 'Read'] } }
    const ov   = { permissions: { allow: ['Read', 'Bash(pwd:*)'] } }
    const out = mergeSettings(base as never, ov as never)
    expect(out.permissions!.allow!.sort()).toEqual(['Bash(ls:*)', 'Bash(pwd:*)', 'Read'])
  })

  test('non-merge keys replace wholesale', () => {
    const base = { model: 'glm-4.6' }
    const ov   = { model: 'glm-4.7' }
    expect(mergeSettings(base as never, ov as never).model).toBe('glm-4.7')
  })

  test('mergeAll respects order — last wins for non-merge keys', () => {
    const out = mergeAll([{ model: 'a' }, { model: 'b' }, { model: 'c' }] as never)
    expect(out.model).toBe('c')
  })
})
```

- [ ] **Step 4: Run merge test — PASS**

```bash
pnpm vitest run packages/core/test/unit/config-merge.test.ts
```

Expected: 5 passes.

- [ ] **Step 5: Implement cascade walker**

`packages/core/src/config/cascade.ts`:

```ts
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { resolvePaths, type GlmPaths } from '@glm/shared'
import { SettingsFile } from './schema'
import { mergeAll } from './merge'
import type { Logger } from '../log'

/** Layer source — for logging + provenance tagging. */
export type CascadeSourceKind =
  | 'user-glm'
  | 'user-claude'
  | 'user-claude-json'
  | 'project-glm'
  | 'project-glm-local'
  | 'project-claude'
  | 'project-claude-local'
  | 'project-mcp-json'

export interface CascadeLayer {
  source: CascadeSourceKind
  filepath: string
  data: SettingsFile
}

export interface CascadeResult {
  merged: SettingsFile
  layers: CascadeLayer[]
}

export interface CascadeOpts {
  cwd: string
  paths?: GlmPaths
  log?: Logger
}

/**
 * Walks the cascade in low → high precedence order and returns the merged result.
 * Precedence (low → high):
 *  1. ~/.claude/settings.json (compat read)
 *  2. ~/.claude.json (compat read, may include mcpServers)
 *  3. ~/.glm/settings.json
 *  4. <project>/.mcp.json (compat read, mcpServers only)
 *  5. <project>/.claude/settings.json (compat read)
 *  6. <project>/.claude/settings.local.json (compat read)
 *  7. <project>/.glm/settings.json
 *  8. <project>/.glm/settings.local.json
 *
 * mergeAll applies each in order — later layers override earlier (last-wins for scalars,
 * deep-merge for mcpServers/hooks/permissions/env).
 */
export function loadCascade(opts: CascadeOpts): CascadeResult {
  const paths = opts.paths ?? resolvePaths()
  const cwd = opts.cwd
  const candidates: { source: CascadeSourceKind; filepath: string; mcpOnly?: boolean }[] = [
    { source: 'user-claude',          filepath: paths.claudeSettings },
    { source: 'user-claude-json',     filepath: paths.claudeJson },
    { source: 'user-glm',             filepath: paths.configFile },
    { source: 'project-mcp-json',     filepath: path.join(cwd, '.mcp.json'),                   mcpOnly: true },
    { source: 'project-claude',       filepath: path.join(cwd, '.claude', 'settings.json') },
    { source: 'project-claude-local', filepath: path.join(cwd, '.claude', 'settings.local.json') },
    { source: 'project-glm',          filepath: path.join(cwd, '.glm', 'settings.json') },
    { source: 'project-glm-local',    filepath: path.join(cwd, '.glm', 'settings.local.json') },
  ]
  const layers: CascadeLayer[] = []
  for (const c of candidates) {
    if (!existsSync(c.filepath)) continue
    let raw: unknown
    try { raw = JSON.parse(readFileSync(c.filepath, 'utf8')) }
    catch (e) { opts.log?.warn({ filepath: c.filepath, err: (e as Error).message }, 'cascade: invalid JSON, skipping'); continue }
    let normalized: SettingsFile
    if (c.mcpOnly) {
      normalized = { mcpServers: (raw as Record<string, unknown>).mcpServers as never }
    } else {
      const parsed = SettingsFile.safeParse(raw)
      if (!parsed.success) {
        opts.log?.warn({ filepath: c.filepath, issues: parsed.error.issues.slice(0, 3) }, 'cascade: schema warnings, partial accept')
        normalized = (raw as SettingsFile) ?? {}
      } else {
        normalized = parsed.data
      }
    }
    layers.push({ source: c.source, filepath: c.filepath, data: normalized })
  }
  return { merged: mergeAll(layers.map(l => l.data)), layers }
}
```

- [ ] **Step 6: Failing test — cascade ordering**

`packages/core/test/unit/config-cascade.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { resolvePaths } from '@glm/shared'
import { loadCascade } from '../../src/config/cascade'

let tmp: string
let home: string
let proj: string

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-cascade-'))
  home = path.join(tmp, 'home')
  proj = path.join(tmp, 'proj')
  mkdirSync(path.join(home, '.glm'), { recursive: true })
  mkdirSync(path.join(home, '.claude'), { recursive: true })
  mkdirSync(path.join(proj, '.glm'), { recursive: true })
  mkdirSync(path.join(proj, '.claude'), { recursive: true })
})
afterEach(() => rmSync(tmp, { recursive: true, force: true }))

function paths() { return resolvePaths({ home }) }

describe('loadCascade', () => {
  test('reads user-glm + user-claude + merges', () => {
    writeFileSync(path.join(home, '.glm', 'settings.json'), JSON.stringify({
      mcpServers: { x: { command: 'x' } }
    }))
    writeFileSync(path.join(home, '.claude', 'settings.json'), JSON.stringify({
      mcpServers: { y: { command: 'y' } }
    }))
    const res = loadCascade({ cwd: proj, paths: paths() })
    expect(Object.keys(res.merged.mcpServers ?? {}).sort()).toEqual(['x', 'y'])
  })

  test('project layers override user', () => {
    writeFileSync(path.join(home, '.glm', 'settings.json'), JSON.stringify({
      mcpServers: { x: { command: 'home' } }
    }))
    writeFileSync(path.join(proj, '.glm', 'settings.json'), JSON.stringify({
      mcpServers: { x: { command: 'project' } }
    }))
    const res = loadCascade({ cwd: proj, paths: paths() })
    expect((res.merged.mcpServers!.x as { command: string }).command).toBe('project')
  })

  test('settings.local.json wins over settings.json (project tier)', () => {
    writeFileSync(path.join(proj, '.glm', 'settings.json'),       JSON.stringify({ model: 'a' }))
    writeFileSync(path.join(proj, '.glm', 'settings.local.json'), JSON.stringify({ model: 'b' }))
    const res = loadCascade({ cwd: proj, paths: paths() })
    expect(res.merged.model).toBe('b')
  })

  test('.mcp.json is mcpServers-only', () => {
    writeFileSync(path.join(proj, '.mcp.json'), JSON.stringify({
      mcpServers: { z: { command: 'z' } },
      model: 'ignored-from-mcp-json'
    }))
    const res = loadCascade({ cwd: proj, paths: paths() })
    expect(res.merged.mcpServers!.z).toBeDefined()
    expect(res.merged.model).toBeUndefined()
  })

  test('invalid JSON in one layer is skipped, others still load', () => {
    writeFileSync(path.join(home, '.glm', 'settings.json'), '{ "mcpServers": { "x": { "command": "x" } } }')
    writeFileSync(path.join(proj, '.claude', 'settings.json'), '{ bad json }')
    const res = loadCascade({ cwd: proj, paths: paths() })
    expect(res.merged.mcpServers!.x).toBeDefined()
  })

  test('layers array records provenance', () => {
    writeFileSync(path.join(home, '.glm', 'settings.json'), JSON.stringify({ model: 'h' }))
    writeFileSync(path.join(proj, '.glm', 'settings.json'), JSON.stringify({ model: 'p' }))
    const res = loadCascade({ cwd: proj, paths: paths() })
    expect(res.layers.map(l => l.source)).toEqual(['user-glm', 'project-glm'])
  })
})
```

- [ ] **Step 7: Implement barrel + run all config tests**

`packages/core/src/config/index.ts`:

```ts
export * from './schema'
export * from './merge'
export * from './cascade'
```

```bash
pnpm vitest run packages/core/test/unit/config-cascade.test.ts packages/core/test/unit/config-merge.test.ts
```

Expected: 5 (merge) + 6 (cascade) = 11 pass.

- [ ] **Step 8: Commit**

```bash
git add packages
git commit -m "feat(config): cascade resolver + deep merge for ~/.glm + ~/.claude sources"
```

---

## Task 3: Config watcher (debounced reload)

**Files:**
- Create: `packages/core/src/config/watcher.ts`
- Test: `packages/core/test/unit/config-watcher.test.ts`

- [ ] **Step 1: Implement watcher**

`packages/core/src/config/watcher.ts`:

```ts
import chokidar, { type FSWatcher } from 'chokidar'
import path from 'node:path'
import type { GlmPaths } from '@glm/shared'

export interface WatchOpts {
  cwd: string
  paths: GlmPaths
  debounceMs?: number
  onChange: () => void
}

export class CascadeWatcher {
  private watcher?: FSWatcher
  private timer?: NodeJS.Timeout
  private debounce: number
  constructor(private opts: WatchOpts) { this.debounce = opts.debounceMs ?? 200 }

  start(): void {
    const targets = [
      this.opts.paths.configFile,
      this.opts.paths.claudeSettings,
      this.opts.paths.claudeJson,
      path.join(this.opts.cwd, '.mcp.json'),
      path.join(this.opts.cwd, '.claude', 'settings.json'),
      path.join(this.opts.cwd, '.claude', 'settings.local.json'),
      path.join(this.opts.cwd, '.glm', 'settings.json'),
      path.join(this.opts.cwd, '.glm', 'settings.local.json'),
    ]
    this.watcher = chokidar.watch(targets, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
    })
    const trigger = () => {
      if (this.timer) clearTimeout(this.timer)
      this.timer = setTimeout(() => this.opts.onChange(), this.debounce)
    }
    this.watcher.on('add', trigger)
    this.watcher.on('change', trigger)
    this.watcher.on('unlink', trigger)
  }

  async stop(): Promise<void> {
    if (this.timer) clearTimeout(this.timer)
    if (this.watcher) await this.watcher.close()
  }
}
```

- [ ] **Step 2: Failing test — watcher fires on change after debounce**

`packages/core/test/unit/config-watcher.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { resolvePaths } from '@glm/shared'
import { CascadeWatcher } from '../../src/config/watcher'

let tmp: string
let home: string
let proj: string
let w: CascadeWatcher | undefined

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-watch-'))
  home = path.join(tmp, 'home'); proj = path.join(tmp, 'proj')
  mkdirSync(path.join(home, '.glm'), { recursive: true })
  mkdirSync(path.join(proj, '.glm'), { recursive: true })
})
afterEach(async () => { await w?.stop(); rmSync(tmp, { recursive: true, force: true }) })

describe('CascadeWatcher', () => {
  test('debounces multiple writes into a single onChange', async () => {
    let count = 0
    w = new CascadeWatcher({
      cwd: proj,
      paths: resolvePaths({ home }),
      debounceMs: 80,
      onChange: () => { count++ }
    })
    w.start()
    await new Promise(r => setTimeout(r, 50))
    const f = path.join(proj, '.glm', 'settings.json')
    writeFileSync(f, JSON.stringify({ model: 'a' }))
    writeFileSync(f, JSON.stringify({ model: 'b' }))
    writeFileSync(f, JSON.stringify({ model: 'c' }))
    await new Promise(r => setTimeout(r, 400))
    expect(count).toBeGreaterThanOrEqual(1)
    expect(count).toBeLessThanOrEqual(2)
  })
})
```

- [ ] **Step 3: Run — PASS**

```bash
pnpm vitest run packages/core/test/unit/config-watcher.test.ts
```

Expected: PASS (chokidar awaitWriteFinish + our 80ms debounce coalesces).

- [ ] **Step 4: Commit**

```bash
git add packages
git commit -m "feat(config): chokidar-based cascade watcher with debounce"
```

---

## Task 4: Env interpolation + MCP transports

**Files:**
- Create: `packages/core/src/mcp/env-interp.ts`
- Create: `packages/core/src/mcp/transports/stdio.ts`
- Create: `packages/core/src/mcp/transports/http.ts`
- Create: `packages/core/src/mcp/transports/sse.ts`
- Create: `packages/core/src/mcp/transports/index.ts`
- Test: `packages/core/test/unit/mcp-env-interp.test.ts`

- [ ] **Step 1: Implement env interpolation**

`packages/core/src/mcp/env-interp.ts`:

```ts
/** Replace `${VAR}` and `${VAR:-default}` in any string. Recurses through objects/arrays. */
export function interp(value: unknown, env: NodeJS.ProcessEnv = process.env): unknown {
  if (typeof value === 'string') return interpString(value, env)
  if (Array.isArray(value)) return value.map(v => interp(v, env))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = interp(v, env)
    return out
  }
  return value
}

function interpString(s: string, env: NodeJS.ProcessEnv): string {
  return s.replace(/\$\{([A-Z_][A-Z0-9_]*)(?::-([^}]*))?\}/gi, (_, name: string, dflt?: string) => {
    const v = env[name]
    if (v !== undefined && v !== '') return v
    return dflt ?? ''
  })
}
```

- [ ] **Step 2: Failing test**

`packages/core/test/unit/mcp-env-interp.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { interp } from '../../src/mcp/env-interp'

describe('interp', () => {
  test('substitutes ${VAR}', () => {
    expect(interp('Bearer ${TOKEN}', { TOKEN: 'abc' })).toBe('Bearer abc')
  })
  test('uses default for missing var', () => {
    expect(interp('${MISSING:-fallback}', {})).toBe('fallback')
  })
  test('empty env string treated as missing → default applied', () => {
    expect(interp('${X:-d}', { X: '' })).toBe('d')
  })
  test('recurses into objects + arrays', () => {
    const out = interp({ env: { K: '${V}' }, args: ['--token', '${T}'] }, { V: '1', T: '2' })
    expect(out).toEqual({ env: { K: '1' }, args: ['--token', '2'] })
  })
  test('leaves non-string scalars untouched', () => {
    expect(interp({ n: 42, b: true, x: '${V}' }, { V: 'x' })).toEqual({ n: 42, b: true, x: 'x' })
  })
})
```

- [ ] **Step 3: Run — PASS**

```bash
pnpm vitest run packages/core/test/unit/mcp-env-interp.test.ts
```

Expected: 5 pass.

- [ ] **Step 4: Implement stdio transport**

`packages/core/src/mcp/transports/stdio.ts`:

```ts
import { spawn, type ChildProcess } from 'node:child_process'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { Logger } from '../../log'

export interface StdioConfig {
  command: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
}

export interface StdioConnection {
  transport: Transport
  child: ChildProcess
  stop(): Promise<void>
}

/**
 * Spawns an MCP stdio server as a child process and wraps it with the SDK's
 * StdioClientTransport. We pre-create the ChildProcess ourselves so we can:
 *  - merge env vars on top of process.env
 *  - capture stderr for diagnostics
 *  - guarantee graceful SIGTERM → SIGKILL escalation in stop()
 */
export function spawnStdio(cfg: StdioConfig, log: Logger): StdioConnection {
  const env: NodeJS.ProcessEnv = { ...process.env, ...(cfg.env ?? {}) }
  const child = spawn(cfg.command, cfg.args ?? [], {
    env,
    cwd: cfg.cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  child.stderr?.on('data', (b: Buffer) => log.debug({ stream: 'mcp-stderr' }, b.toString('utf8').trimEnd()))
  child.on('exit', (code, sig) => log.warn({ code, sig }, 'mcp stdio child exited'))

  const transport = new StdioClientTransport({
    command: cfg.command,
    args: cfg.args,
    env: cfg.env,
    cwd: cfg.cwd,
    stderr: 'pipe',
  })

  return {
    transport,
    child,
    stop: async () => {
      try { await transport.close() } catch { /* ignore */ }
      if (!child.killed) {
        child.kill('SIGTERM')
        await new Promise<void>((resolve) => {
          const t = setTimeout(() => { child.kill('SIGKILL'); resolve() }, 3000)
          child.once('exit', () => { clearTimeout(t); resolve() })
        })
      }
    }
  }
}
```

- [ ] **Step 5: Implement http transport**

`packages/core/src/mcp/transports/http.ts`:

```ts
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'

export interface HttpConfig {
  url: string
  headers?: Record<string, string>
}

export interface HttpConnection {
  transport: Transport
  stop(): Promise<void>
}

export function connectHttp(cfg: HttpConfig): HttpConnection {
  const transport = new StreamableHTTPClientTransport(new URL(cfg.url), {
    requestInit: { headers: cfg.headers ?? {} }
  })
  return {
    transport,
    stop: async () => { try { await transport.close() } catch { /* ignore */ } }
  }
}
```

- [ ] **Step 6: Implement sse transport**

`packages/core/src/mcp/transports/sse.ts`:

```ts
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'

export interface SseConfig {
  url: string
  headers?: Record<string, string>
}

export interface SseConnection {
  transport: Transport
  stop(): Promise<void>
}

export function connectSse(cfg: SseConfig): SseConnection {
  const transport = new SSEClientTransport(new URL(cfg.url), {
    requestInit: { headers: cfg.headers ?? {} },
    eventSourceInit: { fetch: undefined } as never,
  })
  return {
    transport,
    stop: async () => { try { await transport.close() } catch { /* ignore */ } }
  }
}
```

- [ ] **Step 7: Barrel**

`packages/core/src/mcp/transports/index.ts`:

```ts
export * from './stdio'
export * from './http'
export * from './sse'
```

- [ ] **Step 8: Verify compile**

```bash
pnpm -F @glm/core build
```

Expected: no TS errors.

- [ ] **Step 9: Commit**

```bash
git add packages
git commit -m "feat(mcp): env interpolation + stdio/http/sse transport wrappers"
```

---

## Task 5: MCP host + server handles

**Files:**
- Create: `packages/core/src/mcp/server-handle.ts`
- Create: `packages/core/src/mcp/host.ts`
- Create: `packages/core/src/mcp/lifecycle.ts`
- Create: `packages/core/src/mcp/index.ts`
- Test: `packages/core/test/integration/_fixtures/dummy-mcp-server.mjs`
- Test: `packages/core/test/integration/mcp-stdio-roundtrip.test.ts`

- [ ] **Step 1: Implement ServerHandle**

`packages/core/src/mcp/server-handle.ts`:

```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import type { Tool, Resource, Prompt } from '@modelcontextprotocol/sdk/types.js'
import type { Logger } from '../log'
import type { McpServerEntry } from '../config/schema'
import { spawnStdio } from './transports/stdio'
import { connectHttp } from './transports/http'
import { connectSse } from './transports/sse'
import { interp } from './env-interp'

export type ServerStatus = 'starting' | 'ready' | 'failed' | 'stopped'

export interface ServerManifest {
  tools: Tool[]
  resources: Resource[]
  prompts: Prompt[]
  protocolVersion?: string
}

export interface ConnectResult {
  ok: boolean
  error?: string
}

export class McpServerHandle {
  client: Client
  status: ServerStatus = 'starting'
  manifest: ServerManifest = { tools: [], resources: [], prompts: [] }
  lastError?: string
  private stopFn: () => Promise<void> = async () => {}
  constructor(public readonly name: string, public readonly entry: McpServerEntry, private log: Logger) {
    this.client = new Client({ name: 'glm-code', version: '0.1.0' }, { capabilities: {} })
  }

  async connect(env: NodeJS.ProcessEnv = process.env): Promise<ConnectResult> {
    try {
      const cfg = interp(this.entry, env) as McpServerEntry
      let transport
      if (!('type' in cfg) || cfg.type === 'stdio' || (!('url' in cfg) && 'command' in cfg)) {
        const c = spawnStdio({
          command: (cfg as { command: string }).command,
          args: (cfg as { args?: string[] }).args,
          env: (cfg as { env?: Record<string, string> }).env,
          cwd: (cfg as { cwd?: string }).cwd,
        }, this.log)
        transport = c.transport
        this.stopFn = c.stop
      } else if (cfg.type === 'http') {
        const c = connectHttp({ url: cfg.url, headers: cfg.headers })
        transport = c.transport; this.stopFn = c.stop
      } else if (cfg.type === 'sse') {
        const c = connectSse({ url: cfg.url, headers: cfg.headers })
        transport = c.transport; this.stopFn = c.stop
      } else {
        throw new Error(`Unknown transport type: ${(cfg as { type: string }).type}`)
      }
      await this.client.connect(transport)
      await this.refreshManifest()
      this.status = 'ready'
      return { ok: true }
    } catch (e) {
      this.status = 'failed'
      this.lastError = (e as Error).message
      this.log.warn({ name: this.name, err: this.lastError }, 'mcp server connect failed')
      return { ok: false, error: this.lastError }
    }
  }

  async refreshManifest(): Promise<void> {
    const [tools, resources, prompts] = await Promise.all([
      this.client.listTools().then(r => r.tools).catch(() => []),
      this.client.listResources().then(r => r.resources).catch(() => []),
      this.client.listPrompts().then(r => r.prompts).catch(() => []),
    ])
    this.manifest = { tools, resources, prompts }
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const res = await this.client.callTool({ name, arguments: args })
    return res
  }

  async readResource(uri: string): Promise<unknown> {
    return this.client.readResource({ uri })
  }

  async stop(): Promise<void> {
    try { await this.client.close() } catch { /* ignore */ }
    await this.stopFn()
    this.status = 'stopped'
  }
}
```

- [ ] **Step 2: Implement McpHost**

`packages/core/src/mcp/host.ts`:

```ts
import type { Logger } from '../log'
import type { McpServerEntry, SettingsFile } from '../config/schema'
import { McpServerHandle } from './server-handle'

export interface HostOpts {
  log: Logger
  env?: NodeJS.ProcessEnv
}

export class McpHost {
  private servers = new Map<string, McpServerHandle>()
  constructor(private opts: HostOpts) {}

  list(): McpServerHandle[] { return Array.from(this.servers.values()) }
  get(name: string): McpServerHandle | undefined { return this.servers.get(name) }

  async applySettings(settings: SettingsFile): Promise<{ started: string[]; failed: string[] }> {
    const desired = settings.mcpServers ?? {}
    const started: string[] = []
    const failed: string[] = []
    // stop servers no longer in settings
    for (const name of this.servers.keys()) {
      if (!desired[name]) {
        await this.remove(name)
      }
    }
    // start/restart servers that are new or changed
    for (const [name, entry] of Object.entries(desired)) {
      if (entry.disabled) {
        if (this.servers.has(name)) await this.remove(name)
        continue
      }
      const existing = this.servers.get(name)
      if (existing && entryEquals(existing.entry, entry)) continue
      if (existing) await this.remove(name)
      const h = new McpServerHandle(name, entry as McpServerEntry, this.opts.log)
      const r = await h.connect(this.opts.env)
      this.servers.set(name, h)
      if (r.ok) started.push(name); else failed.push(name)
    }
    return { started, failed }
  }

  async reload(name: string): Promise<{ ok: boolean; error?: string }> {
    const h = this.servers.get(name)
    if (!h) return { ok: false, error: `unknown server: ${name}` }
    const entry = h.entry
    await this.remove(name)
    const fresh = new McpServerHandle(name, entry, this.opts.log)
    const r = await fresh.connect(this.opts.env)
    this.servers.set(name, fresh)
    return r
  }

  async remove(name: string): Promise<void> {
    const h = this.servers.get(name)
    if (!h) return
    await h.stop()
    this.servers.delete(name)
  }

  async stopAll(): Promise<void> {
    await Promise.all(Array.from(this.servers.values()).map(h => h.stop()))
    this.servers.clear()
  }
}

function entryEquals(a: McpServerEntry, b: McpServerEntry): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
```

- [ ] **Step 3: Implement lifecycle barrel**

`packages/core/src/mcp/lifecycle.ts`:

```ts
import type { McpHost } from './host'
import type { SettingsFile } from '../config/schema'
import type { Logger } from '../log'

export async function startMcpFromSettings(host: McpHost, settings: SettingsFile, log: Logger): Promise<void> {
  const r = await host.applySettings(settings)
  log.info({ started: r.started, failed: r.failed }, 'mcp: initial servers applied')
}
```

`packages/core/src/mcp/index.ts`:

```ts
export * from './server-handle'
export * from './host'
export * from './lifecycle'
export * from './env-interp'
```

- [ ] **Step 4: Write dummy MCP server fixture**

`packages/core/test/integration/_fixtures/dummy-mcp-server.mjs`:

```js
#!/usr/bin/env node
// Minimal stdio MCP server: implements initialize, tools/list, tools/call.
// JSON-RPC 2.0 framed by newline. Used only by tests.
import { createInterface } from 'node:readline'

const rl = createInterface({ input: process.stdin, terminal: false })
const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n')

rl.on('line', (line) => {
  let req
  try { req = JSON.parse(line) } catch { return }
  const { id, method, params } = req
  if (method === 'initialize') {
    send({ jsonrpc: '2.0', id, result: {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {}, resources: {}, prompts: {} },
      serverInfo: { name: 'dummy', version: '0.0.1' }
    }})
  } else if (method === 'tools/list') {
    send({ jsonrpc: '2.0', id, result: { tools: [
      { name: 'echo', description: 'echoes input', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } }
    ]}})
  } else if (method === 'resources/list') {
    send({ jsonrpc: '2.0', id, result: { resources: [
      { uri: 'dummy://hello', name: 'hello', mimeType: 'text/plain' }
    ]}})
  } else if (method === 'prompts/list') {
    send({ jsonrpc: '2.0', id, result: { prompts: [] } })
  } else if (method === 'tools/call') {
    const { name, arguments: a } = params
    if (name === 'echo') {
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: String(a?.text ?? '') }] } })
    } else {
      send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'unknown tool' } })
    }
  } else if (method === 'resources/read') {
    if (params.uri === 'dummy://hello') {
      send({ jsonrpc: '2.0', id, result: { contents: [{ uri: params.uri, mimeType: 'text/plain', text: 'hello' }] } })
    } else {
      send({ jsonrpc: '2.0', id, error: { code: -32602, message: 'unknown uri' } })
    }
  } else if (method?.startsWith('notifications/')) {
    // no-op
  } else {
    if (id !== undefined && id !== null) send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'method not found' } })
  }
})
```

Make executable:

```bash
chmod +x packages/core/test/integration/_fixtures/dummy-mcp-server.mjs
```

- [ ] **Step 5: Failing integration test — stdio round-trip**

`packages/core/test/integration/mcp-stdio-roundtrip.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { McpHost } from '../../src/mcp'
import { createLogger } from '../../src/log'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE = path.join(HERE, '_fixtures', 'dummy-mcp-server.mjs')

let host: McpHost

beforeAll(() => {
  host = new McpHost({ log: createLogger('test-mcp', { level: 'silent' }) })
})
afterAll(async () => { await host.stopAll() })

describe('mcp host stdio round-trip', () => {
  test('connects → lists tools → calls echo tool', async () => {
    const r = await host.applySettings({
      mcpServers: {
        dummy: { command: process.execPath, args: [FIXTURE] }
      }
    })
    expect(r.started).toContain('dummy')
    expect(r.failed).toHaveLength(0)

    const h = host.get('dummy')!
    expect(h.status).toBe('ready')
    expect(h.manifest.tools.map(t => t.name)).toContain('echo')

    const res = await h.callTool('echo', { text: 'hello mcp' }) as { content: { type: string; text: string }[] }
    expect(res.content[0].text).toBe('hello mcp')
  }, 10_000)

  test('removes server when settings drops it', async () => {
    const r = await host.applySettings({ mcpServers: {} })
    expect(r.started).toHaveLength(0)
    expect(host.get('dummy')).toBeUndefined()
  })

  test('reload restarts server', async () => {
    await host.applySettings({
      mcpServers: { dummy: { command: process.execPath, args: [FIXTURE] } }
    })
    const r = await host.reload('dummy')
    expect(r.ok).toBe(true)
    expect(host.get('dummy')!.status).toBe('ready')
  }, 10_000)
})
```

- [ ] **Step 6: Build + run**

```bash
pnpm -F @glm/core build
pnpm vitest run packages/core/test/integration/mcp-stdio-roundtrip.test.ts
```

Expected: 3 pass.

- [ ] **Step 7: Commit**

```bash
git add packages
git commit -m "feat(mcp): McpHost + ServerHandle with stdio integration test (dummy fixture)"
```

---

## Task 6: OAuth flow + credentials store

**Files:**
- Create: `packages/core/src/mcp/credentials.ts`
- Create: `packages/core/src/mcp/oauth.ts`
- Test: `packages/core/test/unit/mcp-oauth.test.ts`

- [ ] **Step 1: Implement credentials store**

`packages/core/src/mcp/credentials.ts`:

```ts
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync, readdirSync, chmodSync } from 'node:fs'
import path from 'node:path'

export interface StoredCreds {
  accessToken: string
  refreshToken?: string
  expiresAt?: number    // epoch ms
  tokenType?: string
  scope?: string
  raw?: Record<string, unknown>
}

export class CredentialsStore {
  constructor(private dir: string) {
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    try { chmodSync(dir, 0o700) } catch { /* may be a symlinked dir; ignore */ }
  }

  private file(server: string): string {
    if (!/^[a-z0-9_-]+$/i.test(server)) throw new Error(`invalid server name: ${server}`)
    return path.join(this.dir, `${server}.json`)
  }

  read(server: string): StoredCreds | undefined {
    const f = this.file(server)
    if (!existsSync(f)) return undefined
    try { return JSON.parse(readFileSync(f, 'utf8')) as StoredCreds }
    catch { return undefined }
  }

  write(server: string, creds: StoredCreds): void {
    const f = this.file(server)
    writeFileSync(f, JSON.stringify(creds, null, 2), { mode: 0o600 })
  }

  remove(server: string): void {
    try { unlinkSync(this.file(server)) } catch { /* ignore */ }
  }

  list(): string[] {
    if (!existsSync(this.dir)) return []
    return readdirSync(this.dir).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''))
  }
}
```

- [ ] **Step 2: Implement OAuth driver**

`packages/core/src/mcp/oauth.ts`:

```ts
import { createServer, type Server } from 'node:http'
import { randomBytes, createHash } from 'node:crypto'
import { URL } from 'node:url'
import type { Logger } from '../log'
import type { CredentialsStore, StoredCreds } from './credentials'

export interface OAuthMetadata {
  authorization_endpoint: string
  token_endpoint: string
  registration_endpoint?: string
  scopes_supported?: string[]
}

export interface OAuthDriverOpts {
  serverName: string
  store: CredentialsStore
  log: Logger
  /** Override for tests — replaces fetch + browser launch. */
  fetchImpl?: typeof fetch
  openBrowser?: (url: string) => Promise<void>
  /** Port range for callback server. */
  portRange?: [number, number]
}

export interface BeginResult {
  authUrl: string
  state: string
  codeVerifier: string
  redirectUri: string
  port: number
  /** Awaits the user's redirect, exchanges code for token, persists, returns creds. */
  finish: () => Promise<StoredCreds>
  cancel: () => Promise<void>
}

function genState(): string { return randomBytes(16).toString('base64url') }
function genVerifier(): string { return randomBytes(32).toString('base64url') }
function challenge(v: string): string { return createHash('sha256').update(v).digest('base64url') }

export class OAuthDriver {
  constructor(private opts: OAuthDriverOpts) {}

  async begin(metadata: OAuthMetadata, clientId: string, clientSecret?: string, scope?: string): Promise<BeginResult> {
    const state = genState()
    const codeVerifier = genVerifier()
    const codeChallenge = challenge(codeVerifier)
    const port = await this.openCallbackPort()
    const redirectUri = `http://127.0.0.1:${port}/callback`

    const authUrl = new URL(metadata.authorization_endpoint)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('client_id', clientId)
    authUrl.searchParams.set('redirect_uri', redirectUri)
    authUrl.searchParams.set('state', state)
    authUrl.searchParams.set('code_challenge', codeChallenge)
    authUrl.searchParams.set('code_challenge_method', 'S256')
    if (scope) authUrl.searchParams.set('scope', scope)

    let resolveCode: (code: string) => void
    let rejectCode: (e: Error) => void
    const codePromise = new Promise<string>((res, rej) => { resolveCode = res; rejectCode = rej })

    this.server = createServer((req, resp) => {
      const u = new URL(req.url ?? '/', `http://127.0.0.1:${port}`)
      if (u.pathname !== '/callback') { resp.writeHead(404); resp.end('not found'); return }
      const gotState = u.searchParams.get('state')
      const code = u.searchParams.get('code')
      const err = u.searchParams.get('error')
      if (err) { resp.writeHead(400); resp.end(`oauth error: ${err}`); rejectCode(new Error(err)); return }
      if (gotState !== state || !code) { resp.writeHead(400); resp.end('bad state'); rejectCode(new Error('bad state')); return }
      resp.writeHead(200, { 'content-type': 'text/html' })
      resp.end('<html><body><h2>Authenticated. You can close this tab.</h2></body></html>')
      resolveCode(code)
    })
    this.server.listen(port)

    const finish = async (): Promise<StoredCreds> => {
      try {
        const fetcher = this.opts.fetchImpl ?? fetch
        const open = this.opts.openBrowser ?? (async (url: string) => {
          const mod = await import('open')
          await mod.default(url)
        })
        await open(authUrl.toString())
        const code = await codePromise
        const body = new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          client_id: clientId,
          code_verifier: codeVerifier,
        })
        if (clientSecret) body.set('client_secret', clientSecret)
        const r = await fetcher(metadata.token_endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body
        })
        if (!r.ok) throw new Error(`token endpoint ${r.status}: ${await r.text()}`)
        const tok = await r.json() as Record<string, unknown>
        const creds: StoredCreds = {
          accessToken: tok.access_token as string,
          refreshToken: tok.refresh_token as string | undefined,
          tokenType: (tok.token_type as string | undefined) ?? 'Bearer',
          scope: tok.scope as string | undefined,
          expiresAt: typeof tok.expires_in === 'number'
            ? Date.now() + (tok.expires_in * 1000)
            : undefined,
          raw: tok,
        }
        this.opts.store.write(this.opts.serverName, creds)
        return creds
      } finally {
        await this.cancel()
      }
    }

    const cancel = async (): Promise<void> => {
      if (this.server) {
        await new Promise<void>(r => this.server!.close(() => r()))
        this.server = undefined
      }
    }

    return { authUrl: authUrl.toString(), state, codeVerifier, redirectUri, port, finish, cancel }
  }

  async refresh(metadata: OAuthMetadata, clientId: string, clientSecret: string | undefined): Promise<StoredCreds | undefined> {
    const cur = this.opts.store.read(this.opts.serverName)
    if (!cur?.refreshToken) return undefined
    const fetcher = this.opts.fetchImpl ?? fetch
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: cur.refreshToken,
      client_id: clientId,
    })
    if (clientSecret) body.set('client_secret', clientSecret)
    const r = await fetcher(metadata.token_endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body
    })
    if (!r.ok) return undefined
    const tok = await r.json() as Record<string, unknown>
    const next: StoredCreds = {
      accessToken: tok.access_token as string,
      refreshToken: (tok.refresh_token as string | undefined) ?? cur.refreshToken,
      tokenType: (tok.token_type as string | undefined) ?? cur.tokenType,
      scope: (tok.scope as string | undefined) ?? cur.scope,
      expiresAt: typeof tok.expires_in === 'number' ? Date.now() + tok.expires_in * 1000 : cur.expiresAt,
      raw: tok,
    }
    this.opts.store.write(this.opts.serverName, next)
    return next
  }

  private server?: Server

  private async openCallbackPort(): Promise<number> {
    const [lo, hi] = this.opts.portRange ?? [49_152, 49_999]
    for (let i = 0; i < 20; i++) {
      const port = lo + Math.floor(Math.random() * (hi - lo))
      const free = await new Promise<boolean>((resolve) => {
        const s = createServer()
        s.once('error', () => resolve(false))
        s.listen(port, '127.0.0.1', () => { s.close(() => resolve(true)) })
      })
      if (free) return port
    }
    throw new Error('no free callback port found')
  }
}
```

- [ ] **Step 2: Failing test — OAuth happy path with mocked fetch + open**

`packages/core/test/unit/mcp-oauth.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createLogger } from '../../src/log'
import { CredentialsStore } from '../../src/mcp/credentials'
import { OAuthDriver } from '../../src/mcp/oauth'

let tmp: string
beforeEach(() => { tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-oauth-')) })
afterEach(() => rmSync(tmp, { recursive: true, force: true }))

describe('OAuthDriver.begin → finish', () => {
  test('exchanges code for token + persists creds', async () => {
    const store = new CredentialsStore(tmp)
    let callbackUrl = ''
    const driver = new OAuthDriver({
      serverName: 'srv',
      store,
      log: createLogger('test', { level: 'silent' }),
      openBrowser: async (url: string) => {
        // simulate browser redirecting to callback after user approves
        const u = new URL(url)
        const state = u.searchParams.get('state')!
        const redirect = u.searchParams.get('redirect_uri')!
        callbackUrl = `${redirect}?code=AUTH_CODE&state=${state}`
        // hit the callback once the server is listening
        setTimeout(() => { void fetch(callbackUrl) }, 50)
      },
      fetchImpl: (async (input: RequestInfo | URL) => {
        const u = String(input)
        if (u.startsWith('http://127.0.0.1:')) return globalThis.fetch(input)
        return new Response(JSON.stringify({
          access_token: 'AT', refresh_token: 'RT', token_type: 'Bearer',
          expires_in: 3600, scope: 'read'
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }) as never,
    })
    const begin = await driver.begin(
      { authorization_endpoint: 'https://idp.example/auth', token_endpoint: 'https://idp.example/token' },
      'client-abc',
      undefined,
      'read'
    )
    const creds = await begin.finish()
    expect(creds.accessToken).toBe('AT')
    expect(creds.refreshToken).toBe('RT')
    expect(store.read('srv')?.accessToken).toBe('AT')
  }, 8_000)

  test('refresh exchanges refresh_token', async () => {
    const store = new CredentialsStore(tmp)
    store.write('srv', { accessToken: 'old', refreshToken: 'rt-1' })
    const driver = new OAuthDriver({
      serverName: 'srv',
      store,
      log: createLogger('test', { level: 'silent' }),
      fetchImpl: (async () => new Response(JSON.stringify({
        access_token: 'NEW', token_type: 'Bearer', expires_in: 3600
      }), { status: 200, headers: { 'content-type': 'application/json' } })) as never,
    })
    const next = await driver.refresh(
      { authorization_endpoint: 'x', token_endpoint: 'https://idp.example/token' },
      'cid', undefined
    )
    expect(next?.accessToken).toBe('NEW')
    expect(next?.refreshToken).toBe('rt-1')   // carried forward
  })

  test('CredentialsStore enforces server name format', () => {
    const store = new CredentialsStore(tmp)
    expect(() => store.write('bad/name', { accessToken: 'x' })).toThrow()
  })
})
```

- [ ] **Step 3: Run — PASS**

```bash
pnpm vitest run packages/core/test/unit/mcp-oauth.test.ts
```

Expected: 3 pass.

- [ ] **Step 4: Commit**

```bash
git add packages
git commit -m "feat(mcp): OAuth driver with PKCE + token store at ~/.glm/credentials/"
```

---

## Task 7: Tool registry bridge + mcp:// URL handler + HTTP integration test

**Files:**
- Create: `packages/core/src/mcp/tool-bridge.ts`
- Create: `packages/core/src/mcp/url-handler.ts`
- Create: `packages/core/src/mcp/resource-bridge.ts`
- Test: `packages/core/test/integration/mcp-url-handler.test.ts`
- Test: `packages/core/test/integration/mcp-http-roundtrip.test.ts`

> **Assumption from P3 (per FIX-MANIFEST §0.3 + §0.4):** P3 exports a `ToolRegistry` with `register(handler)` / `unregister(name)` where the handler is `{ name, description, schema, run }` (the handler's `name` is the registry key) and a `UrlRouter` from `@glm/core/tools/read/url-router` with `register(handler)` / `read(url, ctx, opts?)` where each handler is `{ scheme, read }` (or `{ scheme, dispatch }` — both shapes are exported, see P3 Task 4). P4 imports `makeUrlRouter` (NOT `createUrlRouter`) and the `UrlPayload` type (NOT `UrlHandlerResult`).

- [ ] **Step 1: Implement tool bridge**

`packages/core/src/mcp/tool-bridge.ts`:

```ts
import type { Tool as McpTool } from '@modelcontextprotocol/sdk/types.js'
import type { ToolDefinition, ToolRegistry } from '../tools'  // from P3
import type { McpServerHandle } from './server-handle'
import type { Logger } from '../log'

/**
 * Bridges a connected MCP server's tools into P3's ToolRegistry.
 * Each MCP tool becomes a P3 tool with id = `mcp:<server>:<tool>`.
 * On unregister, the same id set is removed.
 */
export class McpToolBridge {
  private registered = new Map<string, string[]>()  // server → ids registered
  constructor(private registry: ToolRegistry, private log: Logger) {}

  register(server: McpServerHandle): string[] {
    const ids: string[] = []
    for (const t of server.manifest.tools) {
      const id = `mcp:${server.name}:${t.name}`
      const defn = mcpToDefinition(id, server, t)
      // P3 ToolRegistry signature: register(handler) where handler.name is the key.
      this.registry.register({ ...defn, name: id })
      ids.push(id)
    }
    this.registered.set(server.name, ids)
    this.log.info({ server: server.name, count: ids.length }, 'mcp tools registered')
    return ids
  }

  unregister(serverName: string): void {
    const ids = this.registered.get(serverName) ?? []
    for (const id of ids) this.registry.unregister(id)
    this.registered.delete(serverName)
  }

  unregisterAll(): void {
    for (const name of Array.from(this.registered.keys())) this.unregister(name)
  }
}

function mcpToDefinition(id: string, server: McpServerHandle, tool: McpTool): ToolDefinition {
  return {
    id,
    name: tool.name,
    description: tool.description ?? '',
    inputSchema: tool.inputSchema as Record<string, unknown>,
    source: { kind: 'mcp', server: server.name },
    handler: async (args: Record<string, unknown>) => {
      return server.callTool(tool.name, args)
    }
  }
}
```

- [ ] **Step 2: Implement resource bridge**

`packages/core/src/mcp/resource-bridge.ts`:

```ts
import type { McpHost } from './host'

/**
 * Handles mcp:// URLs by routing to the named server's resources/read.
 * Format: mcp://<server>/<resource-uri-suffix>
 *  - If the trailing portion is itself a URI (e.g. `linear://issue/X`), pass it through.
 *  - Otherwise, treat `<server>/<suffix>` as the full URI, mapped per-server.
 */
export function resolveMcpUrl(host: McpHost, url: string): { server: string; uri: string } | undefined {
  const m = url.match(/^mcp:\/\/([^/]+)\/(.+)$/)
  if (!m) return undefined
  const [, server, suffix] = m
  if (!host.get(server)) return undefined
  // pass-through: if suffix is its own URI (contains `://`), use as-is; otherwise prefix the server's own URI scheme.
  const uri = suffix.includes('://') ? suffix : `${server}://${suffix}`
  return { server, uri }
}

export async function readMcpResource(host: McpHost, url: string): Promise<{ uri: string; mimeType?: string; text?: string; blob?: string }[]> {
  const r = resolveMcpUrl(host, url)
  if (!r) throw new Error(`unable to resolve mcp url: ${url}`)
  const h = host.get(r.server)!
  const resp = await h.readResource(r.uri) as { contents: { uri: string; mimeType?: string; text?: string; blob?: string }[] }
  return resp.contents
}
```

- [ ] **Step 3: Implement URL handler registration**

`packages/core/src/mcp/url-handler.ts`:

```ts
import type { UrlRouter, UrlPayload } from '@glm/core/tools/read/url-router'   // from P3 (P3-Fix-4)
import type { McpHost } from './host'
import { readMcpResource } from './resource-bridge'

export function registerMcpUrlScheme(router: UrlRouter, host: McpHost): void {
  // P3 UrlRouter signature: register({ scheme, read: (url, ctx) => Promise<UrlPayload> })
  router.register({
    scheme: 'mcp',
    read: async (url, _ctx): Promise<UrlPayload> => {
      const contents = await readMcpResource(host, url)
      const text = contents.map(c => c.text ?? '').join('\n')
      return {
        scheme: 'mcp',
        text,
        meta: {
          url,
          mimeType: contents[0]?.mimeType ?? 'text/plain',
          raw: contents,
        },
      }
    },
    // P3's existing handler shape also accepts `dispatch(rest, opts, ctx)`; keep `read` to match
    // the canonical signature from FIX-MANIFEST §0.4. A small adapter in P3 normalizes both.
  })
}
```

- [ ] **Step 4: Integration test — mcp:// URL handler**

`packages/core/test/integration/mcp-url-handler.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { McpHost, registerMcpUrlScheme } from '../../src/mcp'
import { createLogger } from '../../src/log'
import { makeUrlRouter } from '../../src/tools/read/url-router'  // from P3 (P3-Fix-4)
import { makeNullContext } from '../../src/tools/context'        // from P3

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE = path.join(HERE, '_fixtures', 'dummy-mcp-server.mjs')

let host: McpHost
const router = makeUrlRouter()

beforeAll(async () => {
  host = new McpHost({ log: createLogger('t', { level: 'silent' }) })
  registerMcpUrlScheme(router, host)
  await host.applySettings({
    mcpServers: { dummy: { command: process.execPath, args: [FIXTURE] } }
  })
})
afterAll(async () => { await host.stopAll() })

describe('mcp:// URL handler', () => {
  test('reads dummy://hello via mcp://dummy/dummy://hello', async () => {
    const r = await router.read('mcp://dummy/dummy://hello', makeNullContext())
    expect(r.text).toBe('hello')
    expect(r.meta?.mimeType).toBe('text/plain')
  })

  test('rejects unknown server', async () => {
    await expect(router.read('mcp://nope/x', makeNullContext())).rejects.toThrow()
  })
})
```

- [ ] **Step 5: Run — PASS**

```bash
pnpm -F @glm/core build
pnpm vitest run packages/core/test/integration/mcp-url-handler.test.ts
```

Expected: 2 pass. The canonical UrlRouter shape lives at `@glm/core/tools/read/url-router` per P3-Fix-4 (FIX-MANIFEST §0.4); if anyone refactors P3, fix the import here and in `url-handler.ts`.

- [ ] **Step 6: HTTP integration test (using a local express-style mock)**

`packages/core/test/integration/mcp-http-roundtrip.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createServer, type Server } from 'node:http'
import { McpHost } from '../../src/mcp'
import { createLogger } from '../../src/log'

let server: Server
let port: number
let host: McpHost

const sessions = new Map<string, true>()

function rpc(id: unknown, result: unknown) { return { jsonrpc: '2.0', id, result } }

beforeAll(async () => {
  // minimal MCP-over-streamable-HTTP stub
  server = createServer((req, resp) => {
    let body = ''
    req.on('data', c => body += c.toString())
    req.on('end', () => {
      const msg = body ? JSON.parse(body) as { id: unknown; method: string } : { id: null, method: '' }
      const out: unknown[] = []
      const handle = (m: { id: unknown; method: string; params?: unknown }) => {
        if (m.method === 'initialize') out.push(rpc(m.id, {
          protocolVersion: '2024-11-05', capabilities: {}, serverInfo: { name: 'http-dummy', version: '0.0.1' }
        }))
        else if (m.method === 'tools/list') out.push(rpc(m.id, { tools: [{ name: 'add',
          description: 'a+b', inputSchema: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } } } }] }))
        else if (m.method === 'resources/list') out.push(rpc(m.id, { resources: [] }))
        else if (m.method === 'prompts/list') out.push(rpc(m.id, { prompts: [] }))
        else if (m.method === 'tools/call') {
          const p = m.params as { name: string; arguments: { a: number; b: number } }
          out.push(rpc(m.id, { content: [{ type: 'text', text: String(p.arguments.a + p.arguments.b) }] }))
        }
      }
      if (Array.isArray(msg)) (msg as never[]).forEach(handle)
      else handle(msg as never)
      sessions.set('s', true)
      resp.writeHead(200, { 'content-type': 'application/json', 'mcp-session-id': 's' })
      resp.end(JSON.stringify(out.length === 1 ? out[0] : out))
    })
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()))
  const addr = server.address()
  port = typeof addr === 'object' && addr ? addr.port : 0
  host = new McpHost({ log: createLogger('t', { level: 'silent' }) })
})
afterAll(async () => {
  await host.stopAll()
  await new Promise<void>(r => server.close(() => r()))
})

describe('mcp host http round-trip', () => {
  test('http transport connects + call tool', async () => {
    const r = await host.applySettings({
      mcpServers: { add: { type: 'http', url: `http://127.0.0.1:${port}/mcp` } }
    })
    expect(r.started).toContain('add')
    const h = host.get('add')!
    expect(h.manifest.tools.map(t => t.name)).toEqual(['add'])
    const res = await h.callTool('add', { a: 2, b: 3 }) as { content: { type: string; text: string }[] }
    expect(res.content[0].text).toBe('5')
  }, 10_000)
})
```

> **Note:** Some MCP SDK versions may require additional HTTP semantics (long-poll GET, content-type negotiation). If this test fails, simplify the mock to match the SDK version's actual wire format — the goal is to prove `connectHttp` works end-to-end, not to test the SDK itself.

- [ ] **Step 7: Run — PASS (or document SDK-version skew)**

```bash
pnpm vitest run packages/core/test/integration/mcp-http-roundtrip.test.ts
```

If failing due to SDK version semantics: mark the test as `test.skip` with a TODO comment referencing the version mismatch and capture the failure mode for P4 follow-up.

- [ ] **Step 8: Commit**

```bash
git add packages
git commit -m "feat(mcp): tool-bridge + resource-bridge + mcp:// URL scheme handler"
```

---

## Task 8: `glm mcp` CLI + RPC methods

**Files:**
- Create: `packages/core/src/rpc/methods/mcp.ts`
- Create: `packages/cli/src/commands/mcp.ts`
- Modify: `packages/core/src/rpc/index.ts` (export mcp methods)
- Modify: `packages/cli/src/bin.ts` (wire `mcp` subcommand)

- [ ] **Step 1: Implement RPC methods**

`packages/core/src/rpc/methods/mcp.ts`:

```ts
import { z } from 'zod'
import type { RpcHandler } from '../protocol'
import type { McpHost } from '../../mcp'
import { McpServerEntry } from '../../config/schema'
import type { SettingsFile } from '../../config'

export interface McpRpcDeps {
  host: McpHost
  /** Returns the currently effective merged settings (cascade output, cached). */
  getMergedSettings: () => SettingsFile
  /** Persists a server entry into ~/.glm/settings.json mcpServers. */
  persistServer: (name: string, entry: McpServerEntry | null) => Promise<void>
}

export function mcpMethods(deps: McpRpcDeps): Record<string, RpcHandler> {
  return {
    'mcp.list': async () => {
      return deps.host.list().map(h => ({
        name: h.name,
        status: h.status,
        type: ('type' in h.entry ? h.entry.type : 'stdio'),
        tools: h.manifest.tools.length,
        resources: h.manifest.resources.length,
        prompts: h.manifest.prompts.length,
        lastError: h.lastError,
      }))
    },

    'mcp.add': async (params) => {
      const p = z.object({ name: z.string().min(1), entry: McpServerEntry }).parse(params)
      await deps.persistServer(p.name, p.entry)
      const settings = deps.getMergedSettings()
      const r = await deps.host.applySettings(settings)
      return { added: p.name, started: r.started, failed: r.failed }
    },

    'mcp.remove': async (params) => {
      const p = z.object({ name: z.string().min(1) }).parse(params)
      await deps.persistServer(p.name, null)
      await deps.host.remove(p.name)
      return { removed: p.name }
    },

    'mcp.reload': async (params) => {
      const p = z.object({ name: z.string().min(1) }).parse(params)
      return deps.host.reload(p.name)
    },

    'mcp.call': async (params) => {
      const p = z.object({
        name: z.string().min(1),
        tool: z.string().min(1),
        args: z.record(z.unknown()).default({})
      }).parse(params)
      const h = deps.host.get(p.name)
      if (!h) throw new Error(`unknown server: ${p.name}`)
      return h.callTool(p.tool, p.args)
    },

    'mcp.auth': async (params) => {
      const p = z.object({ name: z.string().min(1) }).parse(params)
      // P4 returns the authorization URL; the user opens it. Full auth is async via OAuthDriver.
      // CLI will print the URL and poll status.
      return { name: p.name, hint: 'use `glm mcp auth <name>` interactive to complete' }
    },
  }
}
```

- [ ] **Step 2: Implement CLI**

`packages/cli/src/commands/mcp.ts`:

```ts
import { Command } from 'commander'
import { connectAndRpc } from '../auto-spawn'   // from P1

export function mcpCommand(): Command {
  const cmd = new Command('mcp').description('Manage MCP servers')

  cmd.command('list')
    .description('List configured MCP servers')
    .action(async () => {
      const r = await connectAndRpc('mcp.list', {}) as { name: string; status: string; type: string; tools: number; resources: number; prompts: number; lastError?: string }[]
      if (r.length === 0) { console.log('(none configured)'); return }
      console.log('NAME                STATUS    TYPE   TOOLS  RES  PROMPTS')
      for (const s of r) {
        const err = s.lastError ? `  err: ${s.lastError}` : ''
        console.log(
          `${s.name.padEnd(20)}${s.status.padEnd(10)}${s.type.padEnd(7)}${String(s.tools).padStart(5)}${String(s.resources).padStart(5)}${String(s.prompts).padStart(8)}${err}`
        )
      }
    })

  cmd.command('add <name>')
    .description('Add an MCP server')
    .option('--type <t>', 'stdio | sse | http', 'stdio')
    .option('--command <cmd>', 'stdio command')
    .option('--arg <arg...>', 'stdio args (repeatable)')
    .option('--env <kv...>', 'KEY=VALUE pairs')
    .option('--url <url>', 'http/sse url')
    .option('--header <kv...>', 'http/sse headers as KEY=VALUE')
    .action(async (name: string, opts: Record<string, unknown>) => {
      const entry = buildEntry(opts)
      const r = await connectAndRpc('mcp.add', { name, entry }) as { added: string; started: string[]; failed: string[] }
      console.log(`added: ${r.added}; started: ${r.started.join(',') || '-'}; failed: ${r.failed.join(',') || '-'}`)
    })

  cmd.command('remove <name>')
    .description('Remove an MCP server')
    .action(async (name: string) => {
      await connectAndRpc('mcp.remove', { name })
      console.log(`removed ${name}`)
    })

  cmd.command('reload <name>')
    .description('Reload one MCP server (restart connection)')
    .action(async (name: string) => {
      const r = await connectAndRpc('mcp.reload', { name }) as { ok: boolean; error?: string }
      console.log(r.ok ? `reloaded ${name}` : `failed: ${r.error}`)
    })

  cmd.command('call <name> <tool>')
    .description('Call a tool on an MCP server (args via --json)')
    .option('--json <s>', 'JSON args', '{}')
    .action(async (name: string, tool: string, opts: { json: string }) => {
      const args = JSON.parse(opts.json) as Record<string, unknown>
      const r = await connectAndRpc('mcp.call', { name, tool, args })
      console.log(JSON.stringify(r, null, 2))
    })

  cmd.command('auth <name>')
    .description('Trigger OAuth flow for an MCP server')
    .action(async (name: string) => {
      const r = await connectAndRpc('mcp.auth', { name }) as { hint?: string }
      console.log(r.hint ?? 'auth started')
    })

  return cmd
}

function buildEntry(opts: Record<string, unknown>): unknown {
  const t = (opts.type as string | undefined) ?? 'stdio'
  if (t === 'stdio') {
    return {
      type: 'stdio',
      command: opts.command,
      args: (opts.arg as string[] | undefined) ?? [],
      env: parseKv(opts.env as string[] | undefined),
    }
  }
  return {
    type: t,
    url: opts.url,
    headers: parseKv(opts.header as string[] | undefined),
  }
}

function parseKv(arr: string[] | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const s of arr ?? []) {
    const i = s.indexOf('=')
    if (i > 0) out[s.slice(0, i)] = s.slice(i + 1)
  }
  return out
}
```

- [ ] **Step 3: Wire in `packages/cli/src/bin.ts`**

Add to the existing commander program:

```ts
import { mcpCommand } from './commands/mcp'
program.addCommand(mcpCommand())
```

- [ ] **Step 4: Build + smoke**

```bash
pnpm build
GLM_HOME=/tmp/glm-mcp-smoke node packages/cli/dist/bin.js daemon start
node packages/cli/dist/bin.js mcp list   # expect: "(none configured)"
node packages/cli/dist/bin.js daemon stop
```

- [ ] **Step 5: Commit**

```bash
git add packages
git commit -m "feat(cli): glm mcp add/list/remove/reload/call/auth"
```

---

## Task 9: Skill parser + loader

**Files:**
- Create: `packages/core/src/skills/parser.ts`
- Create: `packages/core/src/skills/loader.ts`
- Create: `packages/core/src/skills/registry.ts`
- Create: `packages/core/src/skills/catalog.ts`
- Create: `packages/core/src/skills/index.ts`
- Test: `packages/core/test/unit/skill-parser.test.ts`
- Test: `packages/core/test/unit/skill-loader.test.ts`

- [ ] **Step 1: Implement parser**

`packages/core/src/skills/parser.ts`:

```ts
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import { z } from 'zod'

export const SkillFrontmatter = z.object({
  name: z.string().min(1),
  description: z.string().default(''),
  trigger_keywords: z.array(z.string()).optional(),
  plugin: z.string().optional(),
  permissions: z.array(z.string()).optional(),
  model_hint: z.string().optional(),
  allowed_tools: z.array(z.string()).optional(),
  version: z.string().optional(),
})
export type SkillFrontmatter = z.infer<typeof SkillFrontmatter>

export interface SkillReference {
  filename: string
  path: string
  bytes: number
}

export interface SkillScript {
  filename: string
  path: string
  bytes: number
}

export interface ParsedSkill {
  id: string             // namespaced: `${plugin}:${name}` if plugin set, else name
  name: string
  description: string
  body: string
  frontmatter: SkillFrontmatter
  dir: string            // skill directory
  filepath: string       // SKILL.md path
  references: SkillReference[]
  scripts: SkillScript[]
}

/** Parses a single skill directory. The skill manifest must be `SKILL.md` at the root. */
export function parseSkillDir(dir: string, opts: { pluginPrefix?: string } = {}): ParsedSkill | undefined {
  const md = path.join(dir, 'SKILL.md')
  if (!existsSync(md)) return undefined
  const raw = readFileSync(md, 'utf8')
  const parsed = matter(raw)
  const fmResult = SkillFrontmatter.safeParse(parsed.data)
  if (!fmResult.success) {
    throw new Error(`invalid SKILL.md frontmatter at ${md}: ${fmResult.error.issues.map(i => i.message).join('; ')}`)
  }
  const fm = fmResult.data
  const references = scanDir(path.join(dir, 'references'))
  const scripts = scanDir(path.join(dir, 'scripts'))
  const id = opts.pluginPrefix ? `${opts.pluginPrefix}:${fm.name}` : fm.name
  return {
    id,
    name: fm.name,
    description: fm.description,
    body: parsed.content,
    frontmatter: fm,
    dir,
    filepath: md,
    references,
    scripts,
  }
}

function scanDir(d: string): { filename: string; path: string; bytes: number }[] {
  if (!existsSync(d)) return []
  const out: { filename: string; path: string; bytes: number }[] = []
  for (const f of readdirSync(d)) {
    const full = path.join(d, f)
    const s = statSync(full)
    if (s.isFile()) out.push({ filename: f, path: full, bytes: s.size })
  }
  return out
}
```

- [ ] **Step 2: Failing test — parser**

`packages/core/test/unit/skill-parser.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { parseSkillDir } from '../../src/skills/parser'

let tmp: string

beforeEach(() => { tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-skill-')) })
afterEach(() => rmSync(tmp, { recursive: true, force: true }))

function writeSkill(name: string, fm: string, body: string): string {
  const d = path.join(tmp, name)
  mkdirSync(d, { recursive: true })
  writeFileSync(path.join(d, 'SKILL.md'), `---\n${fm}\n---\n${body}`)
  return d
}

describe('parseSkillDir', () => {
  test('parses frontmatter + body', () => {
    const d = writeSkill('hello', 'name: hello\ndescription: greet the user\ntrigger_keywords: [hi, greet]', 'do this and that')
    const s = parseSkillDir(d)!
    expect(s.name).toBe('hello')
    expect(s.description).toBe('greet the user')
    expect(s.frontmatter.trigger_keywords).toEqual(['hi', 'greet'])
    expect(s.body.trim()).toBe('do this and that')
  })

  test('returns undefined for dir without SKILL.md', () => {
    mkdirSync(path.join(tmp, 'empty'), { recursive: true })
    expect(parseSkillDir(path.join(tmp, 'empty'))).toBeUndefined()
  })

  test('plugin prefix → namespaced id', () => {
    const d = writeSkill('hi', 'name: hi\ndescription: x', '')
    const s = parseSkillDir(d, { pluginPrefix: 'omc' })!
    expect(s.id).toBe('omc:hi')
  })

  test('scans references + scripts dirs', () => {
    const d = writeSkill('s1', 'name: s1\ndescription: x', '')
    mkdirSync(path.join(d, 'references'), { recursive: true })
    mkdirSync(path.join(d, 'scripts'), { recursive: true })
    writeFileSync(path.join(d, 'references', 'a.md'), 'ref')
    writeFileSync(path.join(d, 'scripts', 'run.sh'), '#!/bin/sh\necho hi')
    const s = parseSkillDir(d)!
    expect(s.references.map(r => r.filename)).toEqual(['a.md'])
    expect(s.scripts.map(r => r.filename)).toEqual(['run.sh'])
  })

  test('rejects invalid frontmatter (missing name)', () => {
    const d = writeSkill('bad', 'description: nothing', '')
    expect(() => parseSkillDir(d)).toThrow()
  })
})
```

- [ ] **Step 3: Run — PASS**

```bash
pnpm vitest run packages/core/test/unit/skill-parser.test.ts
```

Expected: 5 pass.

- [ ] **Step 4: Implement registry + catalog**

`packages/core/src/skills/registry.ts`:

```ts
import type { ParsedSkill } from './parser'

export interface SkillSource {
  kind: 'project-glm' | 'project-claude' | 'user-glm' | 'user-claude' | 'plugin' | 'builtin'
  origin: string   // path or plugin name
}

export interface RegisteredSkill {
  skill: ParsedSkill
  source: SkillSource
}

export class SkillRegistry {
  private byId = new Map<string, RegisteredSkill>()

  put(skill: ParsedSkill, source: SkillSource): void {
    this.byId.set(skill.id, { skill, source })
  }

  get(id: string): RegisteredSkill | undefined { return this.byId.get(id) }
  list(): RegisteredSkill[] { return Array.from(this.byId.values()) }

  clearSource(predicate: (s: SkillSource) => boolean): void {
    for (const [id, r] of this.byId) if (predicate(r.source)) this.byId.delete(id)
  }

  clear(): void { this.byId.clear() }
}
```

`packages/core/src/skills/catalog.ts`:

```ts
import type { SkillRegistry } from './registry'

export interface CatalogEntry {
  id: string
  description: string
  source: string
}

/** One-line-per-skill summary for the system prompt. */
export function buildCatalog(registry: SkillRegistry): CatalogEntry[] {
  return registry.list().map(r => ({
    id: r.skill.id,
    description: r.skill.description,
    source: `${r.source.kind}:${r.source.origin}`,
  }))
}

export function catalogToPromptLines(entries: CatalogEntry[]): string[] {
  return entries.map(e => `- ${e.id}: ${e.description}`)
}
```

- [ ] **Step 5: Implement loader (cascade walker)**

`packages/core/src/skills/loader.ts`:

```ts
import { existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import type { GlmPaths } from '@glm/shared'
import type { Logger } from '../log'
import { parseSkillDir, type ParsedSkill } from './parser'
import { SkillRegistry, type SkillSource } from './registry'

export interface LoaderOpts {
  cwd: string
  paths: GlmPaths
  log: Logger
  /** Plugin skill roots discovered by PluginLoader (each entry = `{ pluginName, skillsRoot }`). */
  pluginSkillRoots?: { pluginName: string; root: string }[]
}

export class SkillLoader {
  constructor(private opts: LoaderOpts, public registry: SkillRegistry = new SkillRegistry()) {}

  loadAll(): { loaded: number; errors: { path: string; error: string }[] } {
    this.registry.clear()
    const errs: { path: string; error: string }[] = []
    let loaded = 0
    const tiers: { kind: SkillSource['kind']; origin: string; root: string; pluginPrefix?: string }[] = [
      { kind: 'user-claude',   origin: this.opts.paths.claudeSkillsDir, root: this.opts.paths.claudeSkillsDir },
      { kind: 'user-glm',      origin: this.opts.paths.skillsDir,       root: this.opts.paths.skillsDir },
      { kind: 'project-claude',origin: path.join(this.opts.cwd, '.claude', 'skills'), root: path.join(this.opts.cwd, '.claude', 'skills') },
      { kind: 'project-glm',   origin: path.join(this.opts.cwd, '.glm', 'skills'),    root: path.join(this.opts.cwd, '.glm', 'skills') },
    ]
    for (const t of tiers) loaded += this.loadTier(t, errs)
    for (const p of this.opts.pluginSkillRoots ?? []) {
      loaded += this.loadTier({ kind: 'plugin', origin: p.pluginName, root: p.root, pluginPrefix: p.pluginName }, errs)
    }
    return { loaded, errors: errs }
  }

  private loadTier(t: { kind: SkillSource['kind']; origin: string; root: string; pluginPrefix?: string }, errs: { path: string; error: string }[]): number {
    if (!existsSync(t.root)) return 0
    let n = 0
    for (const name of readdirSync(t.root)) {
      const dir = path.join(t.root, name)
      if (!statSync(dir).isDirectory()) continue
      try {
        const skill = parseSkillDir(dir, { pluginPrefix: t.pluginPrefix })
        if (skill) {
          this.registry.put(skill, { kind: t.kind, origin: t.origin })
          n++
        }
      } catch (e) {
        errs.push({ path: dir, error: (e as Error).message })
      }
    }
    this.opts.log.debug({ kind: t.kind, root: t.root, n }, 'skills tier loaded')
    return n
  }
}
```

- [ ] **Step 6: Failing test — loader**

`packages/core/test/unit/skill-loader.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { resolvePaths } from '@glm/shared'
import { createLogger } from '../../src/log'
import { SkillLoader } from '../../src/skills/loader'

let tmp: string, home: string, proj: string
beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-sloader-'))
  home = path.join(tmp, 'home'); proj = path.join(tmp, 'proj')
  mkdirSync(path.join(home, '.claude', 'skills'), { recursive: true })
  mkdirSync(path.join(home, '.glm', 'skills'),    { recursive: true })
  mkdirSync(path.join(proj, '.claude', 'skills'), { recursive: true })
  mkdirSync(path.join(proj, '.glm', 'skills'),    { recursive: true })
})
afterEach(() => rmSync(tmp, { recursive: true, force: true }))

function mkSkill(root: string, name: string, desc: string) {
  const d = path.join(root, name); mkdirSync(d, { recursive: true })
  writeFileSync(path.join(d, 'SKILL.md'), `---\nname: ${name}\ndescription: ${desc}\n---\nbody`)
}

describe('SkillLoader', () => {
  test('loads skills from all 4 cascade tiers', () => {
    mkSkill(path.join(home, '.claude', 'skills'), 'a', 'from user-claude')
    mkSkill(path.join(home, '.glm', 'skills'),    'b', 'from user-glm')
    mkSkill(path.join(proj, '.claude', 'skills'), 'c', 'from project-claude')
    mkSkill(path.join(proj, '.glm', 'skills'),    'd', 'from project-glm')
    const l = new SkillLoader({ cwd: proj, paths: resolvePaths({ home }), log: createLogger('t', { level: 'silent' }) })
    const r = l.loadAll()
    expect(r.loaded).toBe(4)
    expect(l.registry.list().map(x => x.skill.name).sort()).toEqual(['a', 'b', 'c', 'd'])
  })

  test('project tier overrides user tier (same name)', () => {
    mkSkill(path.join(home, '.glm', 'skills'), 'dup', 'user version')
    mkSkill(path.join(proj, '.glm', 'skills'), 'dup', 'project version')
    const l = new SkillLoader({ cwd: proj, paths: resolvePaths({ home }), log: createLogger('t', { level: 'silent' }) })
    l.loadAll()
    expect(l.registry.get('dup')!.skill.description).toBe('project version')
  })

  test('plugin skills get namespaced ids', () => {
    const pluginRoot = path.join(tmp, 'plugin', 'omc', 'skills'); mkdirSync(pluginRoot, { recursive: true })
    mkSkill(pluginRoot, 'autopilot', 'omc autopilot')
    const l = new SkillLoader({
      cwd: proj, paths: resolvePaths({ home }), log: createLogger('t', { level: 'silent' }),
      pluginSkillRoots: [{ pluginName: 'omc', root: pluginRoot }]
    })
    l.loadAll()
    expect(l.registry.get('omc:autopilot')).toBeDefined()
  })

  test('invalid skill reported in errors but does not abort tier', () => {
    const root = path.join(proj, '.glm', 'skills')
    mkdirSync(path.join(root, 'bad'), { recursive: true })
    writeFileSync(path.join(root, 'bad', 'SKILL.md'), '---\ndescription: no name\n---\nbody')
    mkSkill(root, 'good', 'ok')
    const l = new SkillLoader({ cwd: proj, paths: resolvePaths({ home }), log: createLogger('t', { level: 'silent' }) })
    const r = l.loadAll()
    expect(r.loaded).toBe(1)
    expect(r.errors).toHaveLength(1)
  })
})
```

- [ ] **Step 7: Implement barrel**

`packages/core/src/skills/index.ts`:

```ts
export * from './parser'
export * from './registry'
export * from './loader'
export * from './catalog'
export * from './invoker'
```

(Invoker is added in Task 10. Add the export now to avoid a barrel rewrite next task.)

- [ ] **Step 8: Run — PASS**

```bash
pnpm vitest run packages/core/test/unit/skill-loader.test.ts
```

Expected: 4 pass.

- [ ] **Step 9: Commit**

```bash
git add packages
git commit -m "feat(skills): SKILL.md parser + cascade loader + registry + catalog"
```

---

## Task 10: Skill invoker (lazy fetch via Skill tool) + RPC + CLI

**Files:**
- Create: `packages/core/src/skills/invoker.ts`
- Create: `packages/core/src/rpc/methods/skill.ts`
- Create: `packages/cli/src/commands/skill.ts`
- Test: `packages/core/test/integration/skill-invoke.test.ts`

- [ ] **Step 1: Implement invoker (depth-2 sub-skill guard)**

`packages/core/src/skills/invoker.ts`:

```ts
import { readFileSync } from 'node:fs'
import type { SkillRegistry } from './registry'
import type { Logger } from '../log'

export interface InvokeOpts {
  /** Caller skill id (for sub-skill depth tracking). undefined = top-level. */
  callerStack?: string[]
  /** Optional reference filename(s) to include verbatim in result. */
  includeReferences?: string[]
}

export interface InvokeResult {
  id: string
  body: string
  appendedReferences: { filename: string; content: string }[]
  warnings: string[]
}

export const MAX_SKILL_DEPTH = 2

export class SkillInvoker {
  constructor(private registry: SkillRegistry, private log: Logger) {}

  invoke(id: string, opts: InvokeOpts = {}): InvokeResult {
    const stack = opts.callerStack ?? []
    if (stack.length >= MAX_SKILL_DEPTH) {
      throw new Error(`skill depth limit (${MAX_SKILL_DEPTH}) exceeded: ${[...stack, id].join(' -> ')}`)
    }
    if (stack.includes(id)) {
      throw new Error(`skill cycle detected: ${[...stack, id].join(' -> ')}`)
    }
    const entry = this.registry.get(id)
    if (!entry) throw new Error(`unknown skill: ${id}`)
    const appended: { filename: string; content: string }[] = []
    const warnings: string[] = []
    for (const fn of opts.includeReferences ?? []) {
      const ref = entry.skill.references.find(r => r.filename === fn)
      if (!ref) { warnings.push(`reference not found: ${fn}`); continue }
      appended.push({ filename: fn, content: readFileSync(ref.path, 'utf8') })
    }
    this.log.debug({ id, stack }, 'skill invoked')
    return { id, body: entry.skill.body, appendedReferences: appended, warnings }
  }
}
```

- [ ] **Step 2: Wire into P3 tool registry — `Skill` tool**

Append to `packages/core/src/skills/invoker.ts`:

```ts
import type { ToolDefinition, ToolRegistry } from '../tools'

export function registerSkillTool(toolRegistry: ToolRegistry, invoker: SkillInvoker, skillRegistry: SkillRegistry): void {
  const defn: ToolDefinition = {
    id: 'builtin:Skill',
    name: 'Skill',
    description: 'Invoke a registered skill by id. Use the catalog from the system prompt to choose the id.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'Skill id, e.g. `hyperplan` or `omc:autopilot`' },
        includeReferences: { type: 'array', items: { type: 'string' } },
      }
    },
    source: { kind: 'builtin' },
    handler: async (args: Record<string, unknown>) => {
      const id = String(args.id)
      const refs = (args.includeReferences as string[] | undefined) ?? []
      return invoker.invoke(id, { includeReferences: refs })
    },
  }
  // P3 ToolRegistry signature: register(handler) where handler.name is the key.
  toolRegistry.register({ ...defn, name: 'builtin:Skill' })
  void skillRegistry
}
```

- [ ] **Step 3: RPC methods**

`packages/core/src/rpc/methods/skill.ts`:

```ts
import { z } from 'zod'
import type { RpcHandler } from '../protocol'
import type { SkillRegistry } from '../../skills'
import type { SkillInvoker } from '../../skills/invoker'
import { buildCatalog } from '../../skills/catalog'

export function skillMethods(deps: { registry: SkillRegistry; invoker: SkillInvoker }): Record<string, RpcHandler> {
  return {
    'skill.list': async () => buildCatalog(deps.registry),

    'skill.show': async (params) => {
      const p = z.object({ id: z.string() }).parse(params)
      const r = deps.registry.get(p.id)
      if (!r) throw new Error(`unknown skill: ${p.id}`)
      return {
        id: r.skill.id,
        name: r.skill.name,
        description: r.skill.description,
        frontmatter: r.skill.frontmatter,
        body: r.skill.body,
        references: r.skill.references.map(x => x.filename),
        scripts: r.skill.scripts.map(x => x.filename),
        source: r.source,
      }
    },

    'skill.invoke': async (params) => {
      const p = z.object({
        id: z.string(),
        includeReferences: z.array(z.string()).optional()
      }).parse(params)
      return deps.invoker.invoke(p.id, { includeReferences: p.includeReferences })
    },
  }
}
```

- [ ] **Step 4: CLI**

`packages/cli/src/commands/skill.ts`:

```ts
import { Command } from 'commander'
import { connectAndRpc } from '../auto-spawn'

export function skillCommand(): Command {
  const cmd = new Command('skill').description('Manage skills')

  cmd.command('list').action(async () => {
    const r = await connectAndRpc('skill.list', {}) as { id: string; description: string; source: string }[]
    if (r.length === 0) { console.log('(no skills loaded)'); return }
    for (const e of r) console.log(`${e.id.padEnd(36)} ${e.description}`)
  })

  cmd.command('show <id>').action(async (id: string) => {
    const r = await connectAndRpc('skill.show', { id }) as { body: string; references: string[]; scripts: string[]; source: { kind: string; origin: string } }
    console.log(`source: ${r.source.kind} (${r.source.origin})`)
    console.log(`references: ${r.references.join(', ') || '-'}`)
    console.log(`scripts: ${r.scripts.join(', ') || '-'}`)
    console.log('---')
    console.log(r.body)
  })

  cmd.command('invoke <id>')
    .option('--ref <name...>', 'reference files to attach')
    .action(async (id: string, opts: { ref?: string[] }) => {
      const r = await connectAndRpc('skill.invoke', { id, includeReferences: opts.ref ?? [] })
      console.log(JSON.stringify(r, null, 2))
    })

  return cmd
}
```

Wire into `bin.ts`: `program.addCommand(skillCommand())`.

- [ ] **Step 5: Integration test**

`packages/core/test/integration/skill-invoke.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { resolvePaths } from '@glm/shared'
import { createLogger } from '../../src/log'
import { SkillLoader, SkillInvoker, MAX_SKILL_DEPTH } from '../../src/skills'

let tmp: string, home: string, proj: string

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-sinvoke-'))
  home = path.join(tmp, 'home'); proj = path.join(tmp, 'proj')
  for (const p of ['.glm/skills', '.claude/skills']) {
    mkdirSync(path.join(home, p), { recursive: true })
    mkdirSync(path.join(proj, p), { recursive: true })
  }
})
afterEach(() => rmSync(tmp, { recursive: true, force: true }))

function mkSkill(root: string, name: string, body: string, refs?: Record<string, string>) {
  const d = path.join(root, name); mkdirSync(d, { recursive: true })
  writeFileSync(path.join(d, 'SKILL.md'), `---\nname: ${name}\ndescription: x\n---\n${body}`)
  if (refs) {
    mkdirSync(path.join(d, 'references'), { recursive: true })
    for (const [fn, content] of Object.entries(refs)) writeFileSync(path.join(d, 'references', fn), content)
  }
}

describe('skill invoker (integration)', () => {
  test('invokes skill + attaches references', () => {
    mkSkill(path.join(proj, '.glm', 'skills'), 'plan', 'PLAN BODY', { 'refA.md': 'REF A CONTENT' })
    const loader = new SkillLoader({ cwd: proj, paths: resolvePaths({ home }), log: createLogger('t', { level: 'silent' }) })
    loader.loadAll()
    const inv = new SkillInvoker(loader.registry, createLogger('t', { level: 'silent' }))
    const r = inv.invoke('plan', { includeReferences: ['refA.md'] })
    expect(r.body).toContain('PLAN BODY')
    expect(r.appendedReferences).toEqual([{ filename: 'refA.md', content: 'REF A CONTENT' }])
  })

  test('rejects cycles', () => {
    mkSkill(path.join(proj, '.glm', 'skills'), 's', 'B')
    const loader = new SkillLoader({ cwd: proj, paths: resolvePaths({ home }), log: createLogger('t', { level: 'silent' }) })
    loader.loadAll()
    const inv = new SkillInvoker(loader.registry, createLogger('t', { level: 'silent' }))
    expect(() => inv.invoke('s', { callerStack: ['s'] })).toThrow(/cycle/)
  })

  test('rejects depth > MAX_SKILL_DEPTH', () => {
    mkSkill(path.join(proj, '.glm', 'skills'), 'leaf', 'B')
    const loader = new SkillLoader({ cwd: proj, paths: resolvePaths({ home }), log: createLogger('t', { level: 'silent' }) })
    loader.loadAll()
    const inv = new SkillInvoker(loader.registry, createLogger('t', { level: 'silent' }))
    const stack = Array.from({ length: MAX_SKILL_DEPTH }, (_, i) => `s${i}`)
    expect(() => inv.invoke('leaf', { callerStack: stack })).toThrow(/depth/)
  })
})
```

- [ ] **Step 6: Run — PASS**

```bash
pnpm -F @glm/core build
pnpm vitest run packages/core/test/integration/skill-invoke.test.ts
```

Expected: 3 pass.

- [ ] **Step 7: Commit**

```bash
git add packages
git commit -m "feat(skills): invoker with depth-guard + Skill tool + RPC + CLI"
```

---

## Task 11: Plugin manifest + loader

**Files:**
- Create: `packages/core/src/plugins/manifest.ts`
- Create: `packages/core/src/plugins/namespace.ts`
- Create: `packages/core/src/plugins/loader.ts`
- Create: `packages/core/src/plugins/registry.ts`
- Create: `packages/core/src/plugins/installer.ts`
- Create: `packages/core/src/plugins/index.ts`
- Test: `packages/core/test/unit/plugin-manifest.test.ts`
- Test: `packages/core/test/unit/plugin-loader.test.ts`
- Test: `packages/core/test/integration/plugin-namespacing.test.ts`

- [ ] **Step 1: Implement manifest schema**

`packages/core/src/plugins/manifest.ts`:

```ts
import { z } from 'zod'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { McpServerEntry, HooksBlock } from '../config/schema'

export const PluginManifest = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().optional(),
  author: z.string().optional(),
  homepage: z.string().optional(),
  // Subdirs (relative to plugin root) the loader will scan if these keys are TRUE
  skills: z.union([z.boolean(), z.string()]).optional(),     // boolean or override-path
  commands: z.union([z.boolean(), z.string()]).optional(),
  agents: z.union([z.boolean(), z.string()]).optional(),
  // Direct embedded items
  mcpServers: z.record(McpServerEntry).optional(),
  hooks: HooksBlock.optional(),
}).passthrough()
export type PluginManifest = z.infer<typeof PluginManifest>

export function readManifest(pluginRoot: string): PluginManifest | undefined {
  const f = path.join(pluginRoot, 'plugin.json')
  if (!existsSync(f)) return undefined
  const raw = JSON.parse(readFileSync(f, 'utf8')) as unknown
  const r = PluginManifest.safeParse(raw)
  if (!r.success) throw new Error(`invalid plugin.json at ${f}: ${r.error.issues.map(i => i.message).join('; ')}`)
  return r.data
}
```

- [ ] **Step 2: Failing test — manifest**

`packages/core/test/unit/plugin-manifest.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { readManifest } from '../../src/plugins/manifest'

let tmp: string
beforeEach(() => { tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-pm-')) })
afterEach(() => rmSync(tmp, { recursive: true, force: true }))

describe('readManifest', () => {
  test('parses minimal manifest', () => {
    writeFileSync(path.join(tmp, 'plugin.json'), JSON.stringify({ name: 'p1', version: '0.1.0' }))
    const m = readManifest(tmp)!
    expect(m.name).toBe('p1')
    expect(m.version).toBe('0.1.0')
  })
  test('parses full manifest with mcpServers / hooks / skills flag', () => {
    writeFileSync(path.join(tmp, 'plugin.json'), JSON.stringify({
      name: 'p2', version: '0.2.0',
      skills: true, commands: true,
      mcpServers: { x: { command: 'x' } },
      hooks: { PostToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: 'echo' }] }] }
    }))
    const m = readManifest(tmp)!
    expect(m.skills).toBe(true)
    expect(m.mcpServers?.x).toBeDefined()
    expect(m.hooks?.PostToolUse).toHaveLength(1)
  })
  test('returns undefined when plugin.json missing', () => {
    expect(readManifest(tmp)).toBeUndefined()
  })
  test('throws on schema violation', () => {
    writeFileSync(path.join(tmp, 'plugin.json'), JSON.stringify({ version: '1' })) // missing name
    expect(() => readManifest(tmp)).toThrow()
  })
})
```

- [ ] **Step 3: Run — PASS**

```bash
pnpm vitest run packages/core/test/unit/plugin-manifest.test.ts
```

Expected: 4 pass.

- [ ] **Step 4: Implement namespace helpers**

`packages/core/src/plugins/namespace.ts`:

```ts
export function nsSkill(plugin: string, name: string): string { return `${plugin}:${name}` }
export function nsCommand(plugin: string, name: string): string { return `${plugin}:${name}` }
export function nsMcp(plugin: string, name: string): string { return `${plugin}/${name}` }
export function splitNs(id: string): { plugin?: string; name: string } {
  const i = id.indexOf(':')
  if (i < 0) return { name: id }
  return { plugin: id.slice(0, i), name: id.slice(i + 1) }
}
```

- [ ] **Step 5: Implement registry (in-memory + SQLite-persisted enable state)**

`packages/core/src/plugins/registry.ts`:

```ts
import type { Database } from 'better-sqlite3'
import type { PluginManifest } from './manifest'

export interface LoadedPlugin {
  name: string
  version: string
  root: string
  manifest: PluginManifest
  enabled: boolean
}

const TABLE = `
CREATE TABLE IF NOT EXISTS plugin_state (
  name TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1
);
`

export class PluginRegistry {
  private items = new Map<string, LoadedPlugin>()

  constructor(private db: Database) { db.exec(TABLE) }

  put(p: LoadedPlugin): void { this.items.set(p.name, p) }

  list(): LoadedPlugin[] { return Array.from(this.items.values()) }
  get(name: string): LoadedPlugin | undefined { return this.items.get(name) }

  setEnabled(name: string, enabled: boolean): void {
    this.db.prepare('INSERT OR REPLACE INTO plugin_state(name, enabled) VALUES (?, ?)').run(name, enabled ? 1 : 0)
    const p = this.items.get(name); if (p) p.enabled = enabled
  }

  readEnabled(name: string, defaultValue = true): boolean {
    const row = this.db.prepare('SELECT enabled FROM plugin_state WHERE name = ?').get(name) as { enabled: number } | undefined
    if (!row) return defaultValue
    return row.enabled === 1
  }

  clear(): void { this.items.clear() }
}
```

- [ ] **Step 6: Implement loader (~/.claude/plugins/cache/<name>/<version>/)**

`packages/core/src/plugins/loader.ts`:

```ts
import { existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import type { GlmPaths } from '@glm/shared'
import type { Logger } from '../log'
import type { Database } from 'better-sqlite3'
import { readManifest } from './manifest'
import { PluginRegistry, type LoadedPlugin } from './registry'

export interface PluginLoaderOpts {
  paths: GlmPaths
  log: Logger
  db: Database
}

export class PluginLoader {
  registry: PluginRegistry
  constructor(private opts: PluginLoaderOpts) {
    this.registry = new PluginRegistry(opts.db)
  }

  /**
   * Walks claude plugins cache + glm plugins dir.
   * For each `<root>/<name>/<version>/plugin.json` (claude cache layout)
   *   OR  `<root>/<name>/plugin.json` (glm layout — flat).
   * If multiple versions exist, latest semver wins.
   */
  loadAll(): { loaded: number; errors: { path: string; error: string }[] } {
    this.registry.clear()
    const errs: { path: string; error: string }[] = []
    const roots: { root: string; nested: boolean }[] = [
      { root: this.opts.paths.claudePluginsCache, nested: true },
      { root: this.opts.paths.pluginsDir, nested: false },
    ]
    let n = 0
    for (const r of roots) {
      if (!existsSync(r.root)) continue
      for (const name of readdirSync(r.root)) {
        const nameDir = path.join(r.root, name)
        if (!statSync(nameDir).isDirectory()) continue
        let pluginRoot: string
        if (r.nested) {
          const versions = readdirSync(nameDir).filter(v => statSync(path.join(nameDir, v)).isDirectory()).sort(compareSemverDesc)
          if (versions.length === 0) continue
          pluginRoot = path.join(nameDir, versions[0])
        } else {
          pluginRoot = nameDir
        }
        try {
          const manifest = readManifest(pluginRoot)
          if (!manifest) continue
          const enabled = this.registry.readEnabled(manifest.name, true)
          const plugin: LoadedPlugin = {
            name: manifest.name,
            version: manifest.version,
            root: pluginRoot,
            manifest,
            enabled,
          }
          this.registry.put(plugin)
          n++
        } catch (e) {
          errs.push({ path: pluginRoot, error: (e as Error).message })
        }
      }
    }
    return { loaded: n, errors: errs }
  }

  /** Returns plugin skill roots for SkillLoader consumption. */
  skillRoots(): { pluginName: string; root: string }[] {
    const out: { pluginName: string; root: string }[] = []
    for (const p of this.registry.list()) {
      if (!p.enabled) continue
      const sk = p.manifest.skills
      if (!sk) continue
      const sub = typeof sk === 'string' ? sk : 'skills'
      const root = path.join(p.root, sub)
      if (existsSync(root)) out.push({ pluginName: p.name, root })
    }
    return out
  }

  /** Returns plugin command roots for CommandLoader. */
  commandRoots(): { pluginName: string; root: string }[] {
    const out: { pluginName: string; root: string }[] = []
    for (const p of this.registry.list()) {
      if (!p.enabled) continue
      const c = p.manifest.commands
      if (!c) continue
      const sub = typeof c === 'string' ? c : 'commands'
      const root = path.join(p.root, sub)
      if (existsSync(root)) out.push({ pluginName: p.name, root })
    }
    return out
  }

  /** Returns combined mcpServers from all enabled plugins (namespaced). */
  pluginMcpServers(): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const p of this.registry.list()) {
      if (!p.enabled) continue
      for (const [n, entry] of Object.entries(p.manifest.mcpServers ?? {})) {
        out[`${p.name}/${n}`] = entry
      }
    }
    return out
  }
}

function compareSemverDesc(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const da = pa[i] ?? 0, db = pb[i] ?? 0
    if (da !== db) return db - da
  }
  return b.localeCompare(a)
}
```

- [ ] **Step 7: Implement installer (file ops only)**

`packages/core/src/plugins/installer.ts`:

```ts
import { existsSync, rmSync, cpSync } from 'node:fs'
import path from 'node:path'

export function installFromPath(srcDir: string, claudePluginsCache: string, name: string, version: string): string {
  const dest = path.join(claudePluginsCache, name, version)
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true })
  cpSync(srcDir, dest, { recursive: true })
  return dest
}

export function uninstall(claudePluginsCache: string, name: string, version?: string): boolean {
  const root = path.join(claudePluginsCache, name)
  if (!existsSync(root)) return false
  if (version) {
    const d = path.join(root, version)
    if (!existsSync(d)) return false
    rmSync(d, { recursive: true, force: true })
  } else {
    rmSync(root, { recursive: true, force: true })
  }
  return true
}
```

- [ ] **Step 8: Barrel**

`packages/core/src/plugins/index.ts`:

```ts
export * from './manifest'
export * from './namespace'
export * from './registry'
export * from './loader'
export * from './installer'
```

- [ ] **Step 9: Failing loader test**

`packages/core/test/unit/plugin-loader.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { resolvePaths } from '@glm/shared'
import Database from 'better-sqlite3'
import { createLogger } from '../../src/log'
import { PluginLoader } from '../../src/plugins'

let tmp: string, home: string
let db: Database.Database

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-pl-'))
  home = path.join(tmp, 'home')
  mkdirSync(path.join(home, '.claude', 'plugins', 'cache'), { recursive: true })
  db = new Database(':memory:')
})
afterEach(() => { db.close(); rmSync(tmp, { recursive: true, force: true }) })

function mkPlugin(name: string, version: string, manifest: Record<string, unknown>, extras?: () => void): string {
  const d = path.join(home, '.claude', 'plugins', 'cache', name, version)
  mkdirSync(d, { recursive: true })
  writeFileSync(path.join(d, 'plugin.json'), JSON.stringify({ name, version, ...manifest }))
  if (extras) {
    const prev = process.cwd()
    try { process.chdir(d); extras() } finally { process.chdir(prev) }
  }
  return d
}

describe('PluginLoader', () => {
  test('loads plugin from claude cache layout', () => {
    mkPlugin('hello', '1.0.0', {})
    const l = new PluginLoader({ paths: resolvePaths({ home }), log: createLogger('t', { level: 'silent' }), db })
    const r = l.loadAll()
    expect(r.loaded).toBe(1)
    expect(l.registry.get('hello')!.version).toBe('1.0.0')
  })

  test('picks latest version when multiple exist', () => {
    mkPlugin('multi', '1.0.0', {})
    mkPlugin('multi', '1.2.3', {})
    mkPlugin('multi', '1.1.0', {})
    const l = new PluginLoader({ paths: resolvePaths({ home }), log: createLogger('t', { level: 'silent' }), db })
    l.loadAll()
    expect(l.registry.get('multi')!.version).toBe('1.2.3')
  })

  test('reports plugin skill / command roots', () => {
    const d = mkPlugin('omc', '0.5.0', { skills: true, commands: true })
    mkdirSync(path.join(d, 'skills', 'autopilot'), { recursive: true })
    writeFileSync(path.join(d, 'skills', 'autopilot', 'SKILL.md'), '---\nname: autopilot\ndescription: x\n---\nbody')
    mkdirSync(path.join(d, 'commands'), { recursive: true })
    writeFileSync(path.join(d, 'commands', 'hello.md'), '---\ndescription: hi\n---\nbody')
    const l = new PluginLoader({ paths: resolvePaths({ home }), log: createLogger('t', { level: 'silent' }), db })
    l.loadAll()
    expect(l.skillRoots()).toEqual([{ pluginName: 'omc', root: path.join(d, 'skills') }])
    expect(l.commandRoots()).toEqual([{ pluginName: 'omc', root: path.join(d, 'commands') }])
  })

  test('pluginMcpServers returns namespaced entries', () => {
    mkPlugin('p', '1.0.0', { mcpServers: { srv: { command: 'x' } } })
    const l = new PluginLoader({ paths: resolvePaths({ home }), log: createLogger('t', { level: 'silent' }), db })
    l.loadAll()
    expect(Object.keys(l.pluginMcpServers())).toEqual(['p/srv'])
  })

  test('disabled plugins are excluded from skill/command/mcp aggregation', () => {
    mkPlugin('p', '1.0.0', { mcpServers: { srv: { command: 'x' } } })
    const l = new PluginLoader({ paths: resolvePaths({ home }), log: createLogger('t', { level: 'silent' }), db })
    l.loadAll()
    l.registry.setEnabled('p', false)
    expect(l.pluginMcpServers()).toEqual({})
  })
})
```

- [ ] **Step 10: Run — PASS**

```bash
pnpm vitest run packages/core/test/unit/plugin-loader.test.ts packages/core/test/unit/plugin-manifest.test.ts
```

Expected: 4 + 5 = 9 pass.

- [ ] **Step 11: Integration test — plugin namespacing end-to-end**

`packages/core/test/integration/plugin-namespacing.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import Database from 'better-sqlite3'
import { resolvePaths } from '@glm/shared'
import { createLogger } from '../../src/log'
import { PluginLoader } from '../../src/plugins'
import { SkillLoader } from '../../src/skills'

let tmp: string, home: string, proj: string
let db: Database.Database

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-pns-'))
  home = path.join(tmp, 'home'); proj = path.join(tmp, 'proj')
  mkdirSync(path.join(home, '.claude', 'plugins', 'cache', 'demo', '0.1.0', 'skills', 'autopilot'), { recursive: true })
  mkdirSync(path.join(proj, '.glm', 'skills'), { recursive: true })
  db = new Database(':memory:')
})
afterEach(() => { db.close(); rmSync(tmp, { recursive: true, force: true }) })

describe('plugin namespacing integration', () => {
  test('plugin skill autopilot becomes demo:autopilot in SkillRegistry', () => {
    const pluginDir = path.join(home, '.claude', 'plugins', 'cache', 'demo', '0.1.0')
    writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({ name: 'demo', version: '0.1.0', skills: true }))
    writeFileSync(path.join(pluginDir, 'skills', 'autopilot', 'SKILL.md'),
      `---\nname: autopilot\ndescription: end-to-end\n---\nplugin body`)
    const paths = resolvePaths({ home })
    const log = createLogger('t', { level: 'silent' })
    const pl = new PluginLoader({ paths, log, db })
    pl.loadAll()
    const sl = new SkillLoader({ cwd: proj, paths, log, pluginSkillRoots: pl.skillRoots() })
    sl.loadAll()
    expect(sl.registry.get('demo:autopilot')).toBeDefined()
    // a plain "autopilot" id from project tier still wins over plugin:autopilot when colliding,
    // because plugin namespace forces unique id
    writeFileSync(path.join(proj, '.glm', 'skills', 'autopilot.skill.md'), '')  // unused (must be dir)
    mkdirSync(path.join(proj, '.glm', 'skills', 'autopilot'), { recursive: true })
    writeFileSync(path.join(proj, '.glm', 'skills', 'autopilot', 'SKILL.md'),
      `---\nname: autopilot\ndescription: project version\n---\nproject body`)
    sl.loadAll()
    expect(sl.registry.get('autopilot')!.skill.description).toBe('project version')
    expect(sl.registry.get('demo:autopilot')!.skill.description).toBe('end-to-end')
  })
})
```

- [ ] **Step 12: Run — PASS**

```bash
pnpm vitest run packages/core/test/integration/plugin-namespacing.test.ts
```

- [ ] **Step 13: Commit**

```bash
git add packages
git commit -m "feat(plugins): manifest reader + cache-aware loader + namespacing + installer"
```

---

## Task 12: Plugin RPC + CLI

**Files:**
- Create: `packages/core/src/rpc/methods/plugin.ts`
- Create: `packages/cli/src/commands/plugin.ts`

- [ ] **Step 1: RPC methods**

`packages/core/src/rpc/methods/plugin.ts`:

```ts
import { z } from 'zod'
import path from 'node:path'
import type { RpcHandler } from '../protocol'
import type { PluginLoader } from '../../plugins'
import type { GlmPaths } from '@glm/shared'
import { installFromPath, uninstall } from '../../plugins/installer'

export interface PluginRpcDeps {
  loader: PluginLoader
  paths: GlmPaths
  /** Trigger a settings reload (re-load skills/commands/mcps after plugin enable/disable/install). */
  reload: () => Promise<void>
}

export function pluginMethods(deps: PluginRpcDeps): Record<string, RpcHandler> {
  return {
    'plugin.list': async () => deps.loader.registry.list().map(p => ({
      name: p.name, version: p.version, root: p.root, enabled: p.enabled,
      description: p.manifest.description ?? '',
    })),
    'plugin.install': async (params) => {
      const p = z.object({
        srcDir: z.string(),
        name: z.string().min(1),
        version: z.string().min(1)
      }).parse(params)
      const cache = deps.paths.claudePluginsCache
      const dest = installFromPath(path.resolve(p.srcDir), cache, p.name, p.version)
      await deps.reload()
      return { installed: p.name, version: p.version, dest }
    },
    'plugin.uninstall': async (params) => {
      const p = z.object({ name: z.string(), version: z.string().optional() }).parse(params)
      const ok = uninstall(deps.paths.claudePluginsCache, p.name, p.version)
      await deps.reload()
      return { uninstalled: p.name, ok }
    },
    'plugin.enable': async (params) => {
      const p = z.object({ name: z.string() }).parse(params)
      deps.loader.registry.setEnabled(p.name, true)
      await deps.reload()
      return { name: p.name, enabled: true }
    },
    'plugin.disable': async (params) => {
      const p = z.object({ name: z.string() }).parse(params)
      deps.loader.registry.setEnabled(p.name, false)
      await deps.reload()
      return { name: p.name, enabled: false }
    },
  }
}
```

- [ ] **Step 2: CLI**

`packages/cli/src/commands/plugin.ts`:

```ts
import { Command } from 'commander'
import { connectAndRpc } from '../auto-spawn'

export function pluginCommand(): Command {
  const cmd = new Command('plugin').description('Manage plugins')

  cmd.command('list').action(async () => {
    const r = await connectAndRpc('plugin.list', {}) as { name: string; version: string; enabled: boolean; description: string }[]
    if (r.length === 0) { console.log('(no plugins)'); return }
    for (const p of r) {
      console.log(`${(p.enabled ? '*' : '-')} ${p.name}@${p.version}  ${p.description}`)
    }
  })

  cmd.command('install <srcDir>')
    .description('Install a plugin from a local directory (containing plugin.json)')
    .requiredOption('--name <n>')
    .requiredOption('--version <v>')
    .action(async (srcDir: string, opts: { name: string; version: string }) => {
      const r = await connectAndRpc('plugin.install', { srcDir, name: opts.name, version: opts.version }) as { installed: string; version: string; dest: string }
      console.log(`installed ${r.installed}@${r.version} → ${r.dest}`)
    })

  cmd.command('uninstall <name>')
    .option('--version <v>')
    .action(async (name: string, opts: { version?: string }) => {
      const r = await connectAndRpc('plugin.uninstall', { name, version: opts.version }) as { ok: boolean }
      console.log(r.ok ? `uninstalled ${name}` : `not found: ${name}`)
    })

  cmd.command('enable <name>').action(async (name: string) => {
    await connectAndRpc('plugin.enable', { name })
    console.log(`enabled ${name}`)
  })

  cmd.command('disable <name>').action(async (name: string) => {
    await connectAndRpc('plugin.disable', { name })
    console.log(`disabled ${name}`)
  })

  return cmd
}
```

Wire into `bin.ts`: `program.addCommand(pluginCommand())`.

- [ ] **Step 3: Build + smoke**

```bash
pnpm build
GLM_HOME=/tmp/glm-plug-smoke CLAUDE_HOME=/tmp/glm-plug-smoke-claude \
  node packages/cli/dist/bin.js daemon start
node packages/cli/dist/bin.js plugin list   # expect: "(no plugins)"
node packages/cli/dist/bin.js daemon stop
```

- [ ] **Step 4: Commit**

```bash
git add packages
git commit -m "feat(cli): glm plugin list/install/uninstall/enable/disable"
```

---

## Task 13: Slash command system

**Files:**
- Create: `packages/core/src/commands/parser.ts`
- Create: `packages/core/src/commands/loader.ts`
- Create: `packages/core/src/commands/registry.ts`
- Create: `packages/core/src/commands/index.ts`
- Create: `packages/core/src/rpc/methods/command.ts`
- Create: `packages/cli/src/commands/cmd.ts`
- Test: `packages/core/test/unit/command-parser.test.ts`
- Test: `packages/core/test/integration/command-cascade.test.ts`

- [ ] **Step 1: Parser**

`packages/core/src/commands/parser.ts`:

```ts
import { readFileSync } from 'node:fs'
import matter from 'gray-matter'
import { z } from 'zod'

export const CommandFrontmatter = z.object({
  description: z.string().optional(),
  argument_hint: z.string().optional(),
  allowed_tools: z.array(z.string()).optional(),
  model: z.string().optional(),
}).passthrough()
export type CommandFrontmatter = z.infer<typeof CommandFrontmatter>

export interface ParsedCommand {
  id: string                  // namespaced if from plugin: `${plugin}:${name}`
  name: string                // bare name (basename without `.md`)
  description: string
  body: string                // raw body with $ARGUMENTS placeholders
  frontmatter: CommandFrontmatter
  filepath: string
}

/** Substitutes `$ARGUMENTS` with the joined user args. Also supports `$1`, `$2`, ... for positional. */
export function applyArguments(body: string, args: string[]): string {
  const joined = args.join(' ')
  let out = body.replaceAll('$ARGUMENTS', joined)
  out = out.replace(/\$(\d+)/g, (_m, n: string) => args[Number(n) - 1] ?? '')
  return out
}

export function parseCommandFile(filepath: string, opts: { pluginPrefix?: string; bareName: string }): ParsedCommand {
  const raw = readFileSync(filepath, 'utf8')
  const parsed = matter(raw)
  const fm = CommandFrontmatter.parse(parsed.data)
  const id = opts.pluginPrefix ? `${opts.pluginPrefix}:${opts.bareName}` : opts.bareName
  return {
    id,
    name: opts.bareName,
    description: fm.description ?? '',
    body: parsed.content,
    frontmatter: fm,
    filepath,
  }
}
```

- [ ] **Step 2: Failing parser test**

`packages/core/test/unit/command-parser.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { parseCommandFile, applyArguments } from '../../src/commands/parser'

let tmp: string
beforeEach(() => { tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-cmd-')) })
afterEach(() => rmSync(tmp, { recursive: true, force: true }))

describe('parseCommandFile', () => {
  test('parses frontmatter + body', () => {
    const f = path.join(tmp, 'hello.md')
    writeFileSync(f, `---\ndescription: greet\nargument_hint: <name>\n---\nHello $ARGUMENTS!`)
    const c = parseCommandFile(f, { bareName: 'hello' })
    expect(c.description).toBe('greet')
    expect(c.frontmatter.argument_hint).toBe('<name>')
    expect(c.body).toContain('$ARGUMENTS')
  })

  test('plugin prefix yields namespaced id', () => {
    const f = path.join(tmp, 'review.md'); writeFileSync(f, `---\ndescription: x\n---\nbody`)
    const c = parseCommandFile(f, { bareName: 'review', pluginPrefix: 'gh-pack' })
    expect(c.id).toBe('gh-pack:review')
  })
})

describe('applyArguments', () => {
  test('substitutes $ARGUMENTS', () => {
    expect(applyArguments('hi $ARGUMENTS', ['world'])).toBe('hi world')
  })
  test('substitutes positional $1 $2', () => {
    expect(applyArguments('$1 + $2 = $1$2', ['a', 'b'])).toBe('a + b = ab')
  })
  test('multi-arg $ARGUMENTS joins with space', () => {
    expect(applyArguments('msg: $ARGUMENTS', ['hello', 'big', 'world'])).toBe('msg: hello big world')
  })
})
```

- [ ] **Step 3: Run — PASS**

```bash
pnpm vitest run packages/core/test/unit/command-parser.test.ts
```

Expected: 5 pass.

- [ ] **Step 4: Registry**

`packages/core/src/commands/registry.ts`:

```ts
import type { ParsedCommand } from './parser'

export interface CommandSource {
  kind: 'builtin' | 'user-glm' | 'user-claude' | 'plugin' | 'project-glm' | 'project-claude'
  origin: string
}

export interface RegisteredCommand {
  cmd: ParsedCommand
  source: CommandSource
}

export class CommandRegistry {
  private byId = new Map<string, RegisteredCommand>()
  put(cmd: ParsedCommand, source: CommandSource): void { this.byId.set(cmd.id, { cmd, source }) }
  get(id: string): RegisteredCommand | undefined { return this.byId.get(id) }
  list(): RegisteredCommand[] { return Array.from(this.byId.values()) }
  clear(): void { this.byId.clear() }
}
```

- [ ] **Step 5: Loader (cascade walker)**

`packages/core/src/commands/loader.ts`:

```ts
import { existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { GlmPaths } from '@glm/shared'
import type { Logger } from '../log'
import { parseCommandFile } from './parser'
import { CommandRegistry, type CommandSource } from './registry'

const BUILTIN_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'builtin')

export interface CommandLoaderOpts {
  cwd: string
  paths: GlmPaths
  log: Logger
  pluginCommandRoots?: { pluginName: string; root: string }[]
}

export class CommandLoader {
  constructor(private opts: CommandLoaderOpts, public registry: CommandRegistry = new CommandRegistry()) {}

  loadAll(): { loaded: number; errors: { path: string; error: string }[] } {
    this.registry.clear()
    const errs: { path: string; error: string }[] = []
    const tiers: { kind: CommandSource['kind']; origin: string; root: string; pluginPrefix?: string }[] = [
      { kind: 'builtin',         origin: 'builtin',                                       root: BUILTIN_DIR },
      { kind: 'user-claude',     origin: this.opts.paths.claudeCommandsDir,               root: this.opts.paths.claudeCommandsDir },
      { kind: 'user-glm',        origin: this.opts.paths.commandsDir,                     root: this.opts.paths.commandsDir },
      { kind: 'project-claude',  origin: path.join(this.opts.cwd, '.claude', 'commands'), root: path.join(this.opts.cwd, '.claude', 'commands') },
      { kind: 'project-glm',     origin: path.join(this.opts.cwd, '.glm', 'commands'),    root: path.join(this.opts.cwd, '.glm', 'commands') },
    ]
    let n = 0
    for (const t of tiers) n += this.loadTier(t, errs)
    for (const p of this.opts.pluginCommandRoots ?? []) {
      n += this.loadTier({ kind: 'plugin', origin: p.pluginName, root: p.root, pluginPrefix: p.pluginName }, errs)
    }
    return { loaded: n, errors: errs }
  }

  private loadTier(t: { kind: CommandSource['kind']; origin: string; root: string; pluginPrefix?: string }, errs: { path: string; error: string }[]): number {
    if (!existsSync(t.root)) return 0
    let n = 0
    for (const file of readdirSync(t.root)) {
      if (!file.endsWith('.md')) continue
      const filepath = path.join(t.root, file)
      if (!statSync(filepath).isFile()) continue
      const bareName = file.replace(/\.md$/, '')
      try {
        const cmd = parseCommandFile(filepath, { pluginPrefix: t.pluginPrefix, bareName })
        this.registry.put(cmd, { kind: t.kind, origin: t.origin })
        n++
      } catch (e) {
        errs.push({ path: filepath, error: (e as Error).message })
      }
    }
    this.opts.log.debug({ kind: t.kind, root: t.root, n }, 'commands tier loaded')
    return n
  }
}
```

- [ ] **Step 6: Barrel**

`packages/core/src/commands/index.ts`:

```ts
export * from './parser'
export * from './registry'
export * from './loader'
```

- [ ] **Step 7: Integration test — cascade**

`packages/core/test/integration/command-cascade.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { resolvePaths } from '@glm/shared'
import { createLogger } from '../../src/log'
import { CommandLoader, applyArguments } from '../../src/commands'

let tmp: string, home: string, proj: string
beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-cmd-int-'))
  home = path.join(tmp, 'home'); proj = path.join(tmp, 'proj')
  for (const p of ['.claude/commands', '.glm/commands']) {
    mkdirSync(path.join(home, p), { recursive: true })
    mkdirSync(path.join(proj, p), { recursive: true })
  }
})
afterEach(() => rmSync(tmp, { recursive: true, force: true }))

function mkCmd(root: string, name: string, body: string, fm = '') {
  writeFileSync(path.join(root, `${name}.md`), `---\n${fm}\n---\n${body}`)
}

describe('command cascade (integration)', () => {
  test('all tiers load, project wins on bare name collision', () => {
    mkCmd(path.join(home, '.claude', 'commands'), 'hi', 'home claude', 'description: x')
    mkCmd(path.join(home, '.glm', 'commands'),    'hi', 'home glm', 'description: x')
    mkCmd(path.join(proj, '.claude', 'commands'), 'hi', 'proj claude', 'description: x')
    mkCmd(path.join(proj, '.glm', 'commands'),    'hi', 'proj glm', 'description: x')
    mkCmd(path.join(proj, '.glm', 'commands'),    'only-proj', 'unique', 'description: y')
    const loader = new CommandLoader({ cwd: proj, paths: resolvePaths({ home }), log: createLogger('t', { level: 'silent' }) })
    loader.loadAll()
    expect(loader.registry.get('hi')!.cmd.body.trim()).toBe('proj glm')
    expect(loader.registry.get('only-proj')!.source.kind).toBe('project-glm')
  })

  test('plugin commands get namespaced ids', () => {
    const pluginRoot = path.join(tmp, 'plugin-cmds'); mkdirSync(pluginRoot, { recursive: true })
    mkCmd(pluginRoot, 'review', 'plugin body', 'description: review thing')
    const loader = new CommandLoader({
      cwd: proj, paths: resolvePaths({ home }), log: createLogger('t', { level: 'silent' }),
      pluginCommandRoots: [{ pluginName: 'omc', root: pluginRoot }]
    })
    loader.loadAll()
    expect(loader.registry.get('omc:review')!.cmd.body.trim()).toBe('plugin body')
  })

  test('applyArguments substitution', () => {
    expect(applyArguments('hi $ARGUMENTS! $1 from $2', ['glen', 'cli'])).toBe('hi glen cli! glen from cli')
  })
})
```

- [ ] **Step 8: RPC + CLI**

`packages/core/src/rpc/methods/command.ts`:

```ts
import { z } from 'zod'
import type { RpcHandler } from '../protocol'
import { applyArguments } from '../../commands/parser'
import type { CommandRegistry } from '../../commands/registry'

export interface CommandRpcDeps { registry: CommandRegistry }

export function commandMethods(deps: CommandRpcDeps): Record<string, RpcHandler> {
  return {
    'command.list': async () => deps.registry.list().map(r => ({
      id: r.cmd.id, description: r.cmd.description, source: r.source.kind
    })),
    'command.show': async (params) => {
      const p = z.object({ id: z.string() }).parse(params)
      const r = deps.registry.get(p.id)
      if (!r) throw new Error(`unknown command: ${p.id}`)
      return { id: r.cmd.id, body: r.cmd.body, frontmatter: r.cmd.frontmatter, source: r.source }
    },
    'command.render': async (params) => {
      const p = z.object({ id: z.string(), args: z.array(z.string()).default([]) }).parse(params)
      const r = deps.registry.get(p.id)
      if (!r) throw new Error(`unknown command: ${p.id}`)
      return { id: r.cmd.id, rendered: applyArguments(r.cmd.body, p.args), frontmatter: r.cmd.frontmatter }
    },
  }
}
```

`packages/cli/src/commands/cmd.ts`:

```ts
import { Command } from 'commander'
import { connectAndRpc } from '../auto-spawn'

export function cmdCommand(): Command {
  const cmd = new Command('cmd').description('Slash command catalog')
  cmd.command('list').action(async () => {
    const r = await connectAndRpc('command.list', {}) as { id: string; description: string; source: string }[]
    for (const e of r) console.log(`/${e.id.padEnd(34)} [${e.source}]  ${e.description}`)
  })
  cmd.command('show <id>').action(async (id: string) => {
    const r = await connectAndRpc('command.show', { id }) as { body: string; source: { kind: string; origin: string } }
    console.log(`source: ${r.source.kind} (${r.source.origin})\n---\n${r.body}`)
  })
  cmd.command('render <id> [args...]').action(async (id: string, args: string[]) => {
    const r = await connectAndRpc('command.render', { id, args }) as { rendered: string }
    process.stdout.write(r.rendered)
  })
  return cmd
}
```

Wire into `bin.ts`: `program.addCommand(cmdCommand())`.

- [ ] **Step 9: Run — PASS**

```bash
pnpm -F @glm/core build
pnpm vitest run packages/core/test/integration/command-cascade.test.ts
```

Expected: 3 pass.

- [ ] **Step 10: Commit**

```bash
git add packages
git commit -m "feat(commands): cascade loader + parser with \$ARGUMENTS + RPC + CLI"
```

---

## Task 14: Hooks config (parse-only, dispatch is P5)

**Files:**
- Create: `packages/core/src/hooks/schema.ts`
- Create: `packages/core/src/hooks/config.ts`
- Create: `packages/core/src/hooks/index.ts`
- Test: `packages/core/test/unit/hooks-config.test.ts`

- [ ] **Step 1: Schema (extracted from config/schema for clarity)**

`packages/core/src/hooks/schema.ts`:

```ts
import { z } from 'zod'

export const HOOK_EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PreCompact',
  'PostCompact',
  'Stop',
  'Notification',
  'SubagentStart',
  'SubagentStop',
] as const

export type HookEvent = (typeof HOOK_EVENTS)[number]

export const HookCommand = z.object({
  type: z.literal('command'),
  command: z.string().min(1),
  timeout: z.number().int().positive().max(60_000).optional(),  // ms; default 30s enforced later
})

export const HookGroup = z.object({
  matcher: z.string().optional(),   // tool name pattern (e.g. "Edit", "*", regex like "/^(Edit|Write)$/")
  hooks: z.array(HookCommand).min(1),
})

export const HooksConfig = z.record(z.array(HookGroup))
export type HooksConfig = z.infer<typeof HooksConfig>
```

- [ ] **Step 2: Config loader + validation**

`packages/core/src/hooks/config.ts`:

```ts
import type { Logger } from '../log'
import { HooksConfig, HOOK_EVENTS, type HookEvent } from './schema'

export interface ValidatedHooks {
  hooks: HooksConfig
  warnings: string[]
  totalGroups: number
}

export function validateHooks(raw: unknown, log: Logger): ValidatedHooks {
  const warnings: string[] = []
  const parsed = HooksConfig.safeParse(raw ?? {})
  if (!parsed.success) {
    warnings.push(`hooks schema violation: ${parsed.error.issues.map(i => i.path.join('.') + ':' + i.message).join('; ')}`)
    log.warn({ issues: parsed.error.issues.slice(0, 5) }, 'hooks config rejected')
    return { hooks: {}, warnings, totalGroups: 0 }
  }
  const out: HooksConfig = {}
  let total = 0
  for (const [event, groups] of Object.entries(parsed.data)) {
    if (!(HOOK_EVENTS as readonly string[]).includes(event)) {
      warnings.push(`unknown hook event: ${event} (skipped)`)
      continue
    }
    out[event as HookEvent] = groups
    total += groups.length
  }
  return { hooks: out, warnings, totalGroups: total }
}

/** Returns a matcher predicate. Supports: literal name, "*", `/regex/flags`, comma-separated list. */
export function compileMatcher(matcher: string | undefined): (toolName: string) => boolean {
  if (!matcher || matcher === '*') return () => true
  if (matcher.startsWith('/') && matcher.lastIndexOf('/') > 0) {
    const last = matcher.lastIndexOf('/')
    const pattern = matcher.slice(1, last)
    const flags = matcher.slice(last + 1)
    const re = new RegExp(pattern, flags)
    return (n) => re.test(n)
  }
  if (matcher.includes(',')) {
    const names = new Set(matcher.split(',').map(s => s.trim()))
    return (n) => names.has(n)
  }
  return (n) => n === matcher
}
```

- [ ] **Step 3: Failing test**

`packages/core/test/unit/hooks-config.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { createLogger } from '../../src/log'
import { validateHooks, compileMatcher } from '../../src/hooks/config'

const log = createLogger('t', { level: 'silent' })

describe('validateHooks', () => {
  test('accepts well-formed config', () => {
    const r = validateHooks({
      PreToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: 'prettier' }] }]
    }, log)
    expect(r.totalGroups).toBe(1)
    expect(r.warnings).toHaveLength(0)
  })
  test('rejects malformed entries entirely', () => {
    const r = validateHooks({ PreToolUse: [{ hooks: [{ type: 'unknown' }] }] }, log)
    expect(r.totalGroups).toBe(0)
    expect(r.warnings).toHaveLength(1)
  })
  test('warns + skips unknown events', () => {
    const r = validateHooks({
      MadeUpEvent: [{ matcher: 'X', hooks: [{ type: 'command', command: 'x' }] }],
      PostToolUse: [{ matcher: 'X', hooks: [{ type: 'command', command: 'y' }] }],
    }, log)
    expect(r.totalGroups).toBe(1)
    expect(r.warnings[0]).toContain('MadeUpEvent')
  })
  test('rejects timeout > 60s', () => {
    const r = validateHooks({
      PreToolUse: [{ matcher: 'X', hooks: [{ type: 'command', command: 'x', timeout: 120_000 }] }]
    }, log)
    expect(r.totalGroups).toBe(0)
  })
})

describe('compileMatcher', () => {
  test('"*" matches all', () => { expect(compileMatcher('*')('Edit')).toBe(true) })
  test('literal match', () => {
    const m = compileMatcher('Edit')
    expect(m('Edit')).toBe(true); expect(m('Read')).toBe(false)
  })
  test('comma-separated list', () => {
    const m = compileMatcher('Edit,Write,MultiEdit')
    expect(m('Write')).toBe(true); expect(m('Read')).toBe(false)
  })
  test('regex form', () => {
    const m = compileMatcher('/^(Edit|Write)$/')
    expect(m('Edit')).toBe(true); expect(m('Read')).toBe(false)
  })
  test('undefined matches all', () => { expect(compileMatcher(undefined)('Anything')).toBe(true) })
})
```

- [ ] **Step 4: Barrel**

`packages/core/src/hooks/index.ts`:

```ts
export * from './schema'
export * from './config'
```

- [ ] **Step 5: Run — PASS**

```bash
pnpm vitest run packages/core/test/unit/hooks-config.test.ts
```

Expected: 9 pass.

- [ ] **Step 6: Commit**

```bash
git add packages
git commit -m "feat(hooks): config parser + validator + matcher compiler (no dispatch yet — P5)"
```

---

## Task 15: Web cache (URL → content, TTL)

**Files:**
- Create: `packages/core/src/web-cache/ttl.ts`
- Create: `packages/core/src/web-cache/cache.ts`
- Create: `packages/core/src/web-cache/index.ts`
- Test: `packages/core/test/unit/web-cache.test.ts`

- [ ] **Step 1: TTL policy**

`packages/core/src/web-cache/ttl.ts`:

```ts
/** Routes that should be cached, and their TTLs in ms. Per spec §9.12. */
export const TTL_MS = {
  webReader: 60 * 60 * 1000,   // 1 hour
  webSearch: 10 * 60 * 1000,   // 10 minutes
  zread: 60 * 60 * 1000,       // 1 hour (matches reader semantics)
} as const

export type CacheRoute = keyof typeof TTL_MS
```

- [ ] **Step 2: Cache implementation (sha-keyed JSON files)**

`packages/core/src/web-cache/cache.ts`:

```ts
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, readdirSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { TTL_MS, type CacheRoute } from './ttl'

export interface CacheEntry<T = unknown> {
  url: string
  route: CacheRoute
  storedAt: number
  expiresAt: number
  data: T
}

export class WebCache {
  constructor(private dir: string) { mkdirSync(dir, { recursive: true, mode: 0o700 }) }

  private key(url: string, route: CacheRoute): string {
    return createHash('sha256').update(`${route}:${url}`).digest('hex').slice(0, 32)
  }

  private file(key: string): string { return path.join(this.dir, `${key}.json`) }

  get<T = unknown>(url: string, route: CacheRoute, now: number = Date.now()): T | undefined {
    const f = this.file(this.key(url, route))
    if (!existsSync(f)) return undefined
    try {
      const entry = JSON.parse(readFileSync(f, 'utf8')) as CacheEntry<T>
      if (entry.expiresAt < now) { try { unlinkSync(f) } catch { /* race */ } return undefined }
      return entry.data
    } catch {
      return undefined
    }
  }

  put<T>(url: string, route: CacheRoute, data: T, now: number = Date.now()): void {
    const entry: CacheEntry<T> = {
      url, route, storedAt: now,
      expiresAt: now + TTL_MS[route],
      data,
    }
    writeFileSync(this.file(this.key(url, route)), JSON.stringify(entry), { mode: 0o600 })
  }

  /** Sweep expired entries. Returns count removed. */
  sweep(now: number = Date.now()): number {
    if (!existsSync(this.dir)) return 0
    let removed = 0
    for (const f of readdirSync(this.dir)) {
      if (!f.endsWith('.json')) continue
      const full = path.join(this.dir, f)
      try {
        const entry = JSON.parse(readFileSync(full, 'utf8')) as CacheEntry
        if (entry.expiresAt < now) { unlinkSync(full); removed++ }
      } catch {
        // corrupt → remove
        try { unlinkSync(full); removed++ } catch { /* ignore */ }
      }
    }
    return removed
  }

  /** Sum of cache file sizes in bytes (debug/HUD use). */
  bytes(): number {
    if (!existsSync(this.dir)) return 0
    let sum = 0
    for (const f of readdirSync(this.dir)) {
      try { sum += statSync(path.join(this.dir, f)).size } catch { /* ignore */ }
    }
    return sum
  }
}
```

- [ ] **Step 3: Barrel**

`packages/core/src/web-cache/index.ts`:

```ts
export * from './ttl'
export * from './cache'
```

- [ ] **Step 4: Failing test**

`packages/core/test/unit/web-cache.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { WebCache, TTL_MS } from '../../src/web-cache'

let tmp: string
beforeEach(() => { tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-wc-')) })
afterEach(() => rmSync(tmp, { recursive: true, force: true }))

describe('WebCache', () => {
  test('put + get round-trip', () => {
    const c = new WebCache(tmp)
    c.put('https://example.com', 'webReader', { html: '<p>x</p>' })
    expect(c.get('https://example.com', 'webReader')).toEqual({ html: '<p>x</p>' })
  })

  test('get returns undefined for expired entries (and removes file)', () => {
    const c = new WebCache(tmp)
    const now = Date.now()
    c.put('u', 'webSearch', { results: [] }, now)
    const later = now + TTL_MS.webSearch + 1
    expect(c.get('u', 'webSearch', later)).toBeUndefined()
    expect(c.get('u', 'webSearch', later)).toBeUndefined()  // file removed
  })

  test('different routes do not collide', () => {
    const c = new WebCache(tmp)
    c.put('same-url', 'webReader', { kind: 'reader' })
    c.put('same-url', 'webSearch', { kind: 'search' })
    expect((c.get('same-url', 'webReader') as { kind: string }).kind).toBe('reader')
    expect((c.get('same-url', 'webSearch') as { kind: string }).kind).toBe('search')
  })

  test('sweep removes expired only', () => {
    const c = new WebCache(tmp)
    const t0 = Date.now()
    c.put('a', 'webSearch', { a: 1 }, t0)                // expires sooner
    c.put('b', 'webReader', { b: 1 }, t0)                // expires later
    const sweepTime = t0 + TTL_MS.webSearch + 1
    expect(c.sweep(sweepTime)).toBe(1)
    expect(c.get('a', 'webSearch', sweepTime)).toBeUndefined()
    expect(c.get('b', 'webReader', sweepTime)).toEqual({ b: 1 })
  })
})
```

- [ ] **Step 5: Run — PASS**

```bash
pnpm vitest run packages/core/test/unit/web-cache.test.ts
```

Expected: 4 pass.

- [ ] **Step 6: Commit**

```bash
git add packages
git commit -m "feat(web-cache): sha-keyed JSON cache with per-route TTLs"
```

---

## Task 16: Bundled GLM MCPs + auto-bootstrap + LLM-name routing

**Files:**
- Create: `packages/core/src/bundled-mcp/definitions.ts`
- Create: `packages/core/src/bundled-mcp/bootstrap.ts`
- Create: `packages/core/src/bundled-mcp/routing.ts`
- Create: `packages/core/src/bundled-mcp/index.ts`
- Test: `packages/core/test/unit/bundled-bootstrap.test.ts`
- Test: `packages/core/test/unit/bundled-routing.test.ts`
- Test: `packages/core/test/integration/bundled-firstrun.test.ts`

- [ ] **Step 1: Definitions**

`packages/core/src/bundled-mcp/definitions.ts`:

```ts
import type { McpServerEntry } from '../config/schema'

export const BUNDLED_GLM_MCP: Record<string, McpServerEntry> = {
  'glm-vision': {
    type: 'stdio',
    command: 'npx',
    args: ['-y', '@z_ai/mcp-server'],
    env: { Z_AI_API_KEY: '${GLM_API_KEY}', Z_AI_MODE: 'ZAI' },
    builtin: true,
  } as McpServerEntry,
  'glm-web-search': {
    type: 'http',
    url: 'https://api.z.ai/api/mcp/web_search_prime/mcp',
    headers: { Authorization: 'Bearer ${GLM_API_KEY}' },
    builtin: true,
  } as McpServerEntry,
  'glm-web-reader': {
    type: 'http',
    url: 'https://api.z.ai/api/mcp/web_reader/mcp',
    headers: { Authorization: 'Bearer ${GLM_API_KEY}' },
    builtin: true,
  } as McpServerEntry,
  'glm-zread': {
    type: 'http',
    url: 'https://api.z.ai/api/mcp/zread/mcp',
    headers: { Authorization: 'Bearer ${GLM_API_KEY}' },
    builtin: true,
  } as McpServerEntry,
}

export const BUNDLED_NAMES = Object.keys(BUNDLED_GLM_MCP)
```

- [ ] **Step 2: Bootstrap (first-run write into ~/.glm/settings.json)**

`packages/core/src/bundled-mcp/bootstrap.ts`:

```ts
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import type { GlmPaths } from '@glm/shared'
import type { Logger } from '../log'
import { BUNDLED_GLM_MCP, BUNDLED_NAMES } from './definitions'

export interface BootstrapOpts {
  paths: GlmPaths
  log: Logger
  /** When true, overwrite existing bundled entries. Default false (do not touch user edits). */
  force?: boolean
}

export interface BootstrapResult {
  added: string[]
  kept: string[]
  marker: string
}

const MARKER_FILE = 'bundled-mcp.bootstrapped'

/**
 * On first daemon start (or after `glm mcp bundled reset`), ensures the 4 bundled
 * GLM MCP servers are present in ~/.glm/settings.json under mcpServers.
 *
 * Behavior:
 *  - If the marker file `~/.glm/.state/bundled-mcp.bootstrapped` exists, this is a no-op
 *    (the user has already had a chance to delete or modify entries; we must not re-add).
 *  - Otherwise, add any missing bundled entry. Preserve user-added customizations:
 *    if an entry with the same name exists, leave it alone (unless `force`).
 *  - Always write the marker afterward.
 */
export function bootstrapBundledMcp(opts: BootstrapOpts): BootstrapResult {
  const markerPath = path.join(opts.paths.root, '.state', MARKER_FILE)
  const settingsPath = opts.paths.configFile
  mkdirSync(opts.paths.root, { recursive: true })
  mkdirSync(path.dirname(markerPath), { recursive: true })

  if (existsSync(markerPath) && !opts.force) {
    return { added: [], kept: BUNDLED_NAMES, marker: markerPath }
  }

  let settings: { mcpServers?: Record<string, unknown> } = {}
  if (existsSync(settingsPath)) {
    try { settings = JSON.parse(readFileSync(settingsPath, 'utf8')) }
    catch (e) { opts.log.warn({ err: (e as Error).message }, 'bundled-mcp: settings.json invalid, starting fresh') }
  }
  settings.mcpServers = settings.mcpServers ?? {}
  const added: string[] = []
  const kept: string[] = []
  for (const name of BUNDLED_NAMES) {
    if (!opts.force && settings.mcpServers[name]) { kept.push(name); continue }
    settings.mcpServers[name] = BUNDLED_GLM_MCP[name]
    added.push(name)
  }
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), { mode: 0o600 })
  writeFileSync(markerPath, new Date().toISOString())
  opts.log.info({ added, kept }, 'bundled-mcp bootstrap done')
  return { added, kept, marker: markerPath }
}

/** Delete the marker file so a subsequent bootstrap will re-evaluate. */
export function resetBundledMarker(paths: GlmPaths): boolean {
  const markerPath = path.join(paths.root, '.state', MARKER_FILE)
  if (!existsSync(markerPath)) return false
  try { require('node:fs').unlinkSync(markerPath); return true } catch { return false }
}
```

- [ ] **Step 3: Routing**

`packages/core/src/bundled-mcp/routing.ts`:

```ts
import type { McpHost } from '../mcp'
import type { WebCache } from '../web-cache'
import type { Logger } from '../log'

/**
 * Maps LLM-side standard tool names → bundled MCP server + tool.
 * Per spec §9.12 routing table.
 */
export const LLM_TOOL_ROUTES = {
  WebSearch:               { server: 'glm-web-search', tool: 'webSearchPrime', cacheRoute: 'webSearch' as const },
  WebFetch:                { server: 'glm-web-reader', tool: 'webReader',      cacheRoute: 'webReader' as const },
  'Vision.imageAnalysis':  { server: 'glm-vision',     tool: 'image_analysis', cacheRoute: undefined },
  'Vision.ocr':            { server: 'glm-vision',     tool: 'extract_text_from_screenshot', cacheRoute: undefined },
  'Vision.uiToCode':       { server: 'glm-vision',     tool: 'ui_to_artifact', cacheRoute: undefined },
  'Vision.diagnoseError':  { server: 'glm-vision',     tool: 'diagnose_error_screenshot', cacheRoute: undefined },
  'Zread.search':          { server: 'glm-zread',      tool: 'search_doc',     cacheRoute: 'zread' as const },
  'Zread.structure':       { server: 'glm-zread',      tool: 'structure',      cacheRoute: 'zread' as const },
  'Zread.readFile':        { server: 'glm-zread',      tool: 'readFile',       cacheRoute: 'zread' as const },
} as const

export type LlmToolName = keyof typeof LLM_TOOL_ROUTES

export interface RouteOpts {
  host: McpHost
  cache: WebCache
  log: Logger
}

/**
 * Route an LLM-standard tool name to the matching MCP server. If the route
 * specifies a `cacheRoute` and the call has a URL-style identifier (`url` or
 * `query` arg), cache lookups happen automatically.
 */
export async function dispatchLlmTool(name: LlmToolName, args: Record<string, unknown>, opts: RouteOpts): Promise<unknown> {
  const route = LLM_TOOL_ROUTES[name]
  if (!route) throw new Error(`no route for LLM tool: ${name}`)
  const h = opts.host.get(route.server)
  if (!h) throw new Error(`bundled MCP not connected: ${route.server}`)

  // Cache key: prefer args.url, then args.query
  const cacheKeyInput = (args.url as string | undefined) ?? (args.query as string | undefined)
  if (route.cacheRoute && cacheKeyInput) {
    const hit = opts.cache.get(cacheKeyInput, route.cacheRoute)
    if (hit !== undefined) {
      opts.log.debug({ name, cacheKeyInput }, 'web-cache hit')
      return hit
    }
  }

  const result = await h.callTool(route.tool, args)

  if (route.cacheRoute && cacheKeyInput) {
    opts.cache.put(cacheKeyInput, route.cacheRoute, result)
  }
  return result
}

/** Returns the route table for catalog/diagnostic display. */
export function listRoutes(): { llmName: string; server: string; tool: string; cached: boolean }[] {
  return Object.entries(LLM_TOOL_ROUTES).map(([k, v]) => ({
    llmName: k, server: v.server, tool: v.tool, cached: Boolean(v.cacheRoute)
  }))
}
```

- [ ] **Step 4: Barrel**

`packages/core/src/bundled-mcp/index.ts`:

```ts
export * from './definitions'
export * from './bootstrap'
export * from './routing'
```

- [ ] **Step 5: Failing bootstrap test**

`packages/core/test/unit/bundled-bootstrap.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { resolvePaths } from '@glm/shared'
import { createLogger } from '../../src/log'
import { bootstrapBundledMcp } from '../../src/bundled-mcp'

const log = createLogger('t', { level: 'silent' })

let tmp: string, home: string
beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-boot-'))
  home = path.join(tmp, 'home'); mkdirSync(path.join(home, '.glm'), { recursive: true })
})
afterEach(() => rmSync(tmp, { recursive: true, force: true }))

describe('bootstrapBundledMcp', () => {
  test('adds all 4 servers on first run + writes marker', () => {
    const paths = resolvePaths({ home })
    const r = bootstrapBundledMcp({ paths, log })
    expect(r.added.sort()).toEqual(['glm-vision', 'glm-web-reader', 'glm-web-search', 'glm-zread'])
    expect(existsSync(r.marker)).toBe(true)
    const settings = JSON.parse(readFileSync(paths.configFile, 'utf8'))
    expect(Object.keys(settings.mcpServers).sort()).toEqual(['glm-vision', 'glm-web-reader', 'glm-web-search', 'glm-zread'])
  })

  test('is no-op when marker exists', () => {
    const paths = resolvePaths({ home })
    bootstrapBundledMcp({ paths, log })   // first run
    // remove a server manually → simulate user delete
    const s = JSON.parse(readFileSync(paths.configFile, 'utf8'))
    delete s.mcpServers['glm-vision']
    writeFileSync(paths.configFile, JSON.stringify(s))
    // second run must NOT re-add it
    const r = bootstrapBundledMcp({ paths, log })
    expect(r.added).toEqual([])
    const after = JSON.parse(readFileSync(paths.configFile, 'utf8'))
    expect(after.mcpServers['glm-vision']).toBeUndefined()
  })

  test('preserves user-customized entries with bundled names', () => {
    const paths = resolvePaths({ home })
    writeFileSync(paths.configFile, JSON.stringify({
      mcpServers: { 'glm-vision': { command: 'my-custom-vision' } }
    }))
    const r = bootstrapBundledMcp({ paths, log })
    expect(r.added).not.toContain('glm-vision')
    expect(r.kept).toContain('glm-vision')
    const settings = JSON.parse(readFileSync(paths.configFile, 'utf8'))
    expect(settings.mcpServers['glm-vision'].command).toBe('my-custom-vision')
  })

  test('force=true overwrites and adds even if marker exists', () => {
    const paths = resolvePaths({ home })
    bootstrapBundledMcp({ paths, log })
    // wipe settings
    writeFileSync(paths.configFile, JSON.stringify({ mcpServers: {} }))
    const r = bootstrapBundledMcp({ paths, log, force: true })
    expect(r.added).toHaveLength(4)
  })

  test('survives a corrupt existing settings.json', () => {
    const paths = resolvePaths({ home })
    writeFileSync(paths.configFile, '{ bad json')
    const r = bootstrapBundledMcp({ paths, log })
    expect(r.added).toHaveLength(4)
  })
})
```

- [ ] **Step 6: Run — PASS**

```bash
pnpm vitest run packages/core/test/unit/bundled-bootstrap.test.ts
```

Expected: 5 pass.

- [ ] **Step 7: Failing routing test (with mock host + real cache)**

`packages/core/test/unit/bundled-routing.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createLogger } from '../../src/log'
import { WebCache } from '../../src/web-cache'
import { dispatchLlmTool, listRoutes, LLM_TOOL_ROUTES } from '../../src/bundled-mcp'

const log = createLogger('t', { level: 'silent' })

class FakeHost {
  servers = new Map<string, { callTool: (n: string, a: Record<string, unknown>) => Promise<unknown> }>()
  get(name: string) { return this.servers.get(name) }
  put(name: string, callTool: (n: string, a: Record<string, unknown>) => Promise<unknown>) { this.servers.set(name, { callTool }) }
}

let tmp: string
beforeEach(() => { tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-route-')) })
afterEach(() => rmSync(tmp, { recursive: true, force: true }))

describe('dispatchLlmTool', () => {
  test('routes WebSearch → glm-web-search/webSearchPrime', async () => {
    const host = new FakeHost()
    let received: { tool: string; args: Record<string, unknown> } | undefined
    host.put('glm-web-search', async (tool, args) => { received = { tool, args }; return { results: [{ url: 'x' }] } })
    const cache = new WebCache(tmp)
    const out = await dispatchLlmTool('WebSearch', { query: 'foo' }, { host: host as never, cache, log })
    expect(received).toEqual({ tool: 'webSearchPrime', args: { query: 'foo' } })
    expect(out).toEqual({ results: [{ url: 'x' }] })
  })

  test('WebFetch hits cache on 2nd call', async () => {
    const host = new FakeHost()
    let calls = 0
    host.put('glm-web-reader', async () => { calls++; return { html: '<p>x</p>' } })
    const cache = new WebCache(tmp)
    await dispatchLlmTool('WebFetch', { url: 'https://e.com' }, { host: host as never, cache, log })
    await dispatchLlmTool('WebFetch', { url: 'https://e.com' }, { host: host as never, cache, log })
    expect(calls).toBe(1)
  })

  test('Vision.* not cached', async () => {
    const host = new FakeHost()
    let calls = 0
    host.put('glm-vision', async () => { calls++; return { text: 'hi' } })
    const cache = new WebCache(tmp)
    await dispatchLlmTool('Vision.ocr', { url: 'file:///x.png' }, { host: host as never, cache, log })
    await dispatchLlmTool('Vision.ocr', { url: 'file:///x.png' }, { host: host as never, cache, log })
    expect(calls).toBe(2)
  })

  test('throws when server not connected', async () => {
    const host = new FakeHost()
    const cache = new WebCache(tmp)
    await expect(dispatchLlmTool('WebSearch', { query: 'x' }, { host: host as never, cache, log })).rejects.toThrow(/not connected/)
  })

  test('listRoutes covers all spec routes', () => {
    const r = listRoutes()
    expect(r.find(x => x.llmName === 'WebSearch')?.server).toBe('glm-web-search')
    expect(r.find(x => x.llmName === 'WebFetch')?.cached).toBe(true)
    expect(r.find(x => x.llmName === 'Vision.ocr')?.cached).toBe(false)
    expect(Object.keys(LLM_TOOL_ROUTES)).toHaveLength(r.length)
  })
})
```

- [ ] **Step 8: Run — PASS**

```bash
pnpm vitest run packages/core/test/unit/bundled-routing.test.ts
```

Expected: 5 pass.

- [ ] **Step 9: First-run integration test**

`packages/core/test/integration/bundled-firstrun.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { resolvePaths } from '@glm/shared'
import { createLogger } from '../../src/log'
import { bootstrapBundledMcp } from '../../src/bundled-mcp'

let tmp: string, home: string
beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'glm-first-'))
  home = path.join(tmp, 'home'); mkdirSync(path.join(home, '.glm'), { recursive: true })
})
afterEach(() => rmSync(tmp, { recursive: true, force: true }))

describe('bundled MCP first-run integration', () => {
  test('idempotent across multiple daemon starts', () => {
    const paths = resolvePaths({ home })
    const log = createLogger('t', { level: 'silent' })
    const r1 = bootstrapBundledMcp({ paths, log })
    const settingsAfter1 = readFileSync(paths.configFile, 'utf8')
    const r2 = bootstrapBundledMcp({ paths, log })
    const settingsAfter2 = readFileSync(paths.configFile, 'utf8')
    expect(r1.added).toHaveLength(4)
    expect(r2.added).toHaveLength(0)
    expect(settingsAfter1).toBe(settingsAfter2)   // byte-identical
    expect(existsSync(r1.marker)).toBe(true)
  })

  test('written entries contain valid ${GLM_API_KEY} placeholders', () => {
    const paths = resolvePaths({ home })
    const log = createLogger('t', { level: 'silent' })
    bootstrapBundledMcp({ paths, log })
    const settings = JSON.parse(readFileSync(paths.configFile, 'utf8'))
    expect(settings.mcpServers['glm-web-search'].headers.Authorization).toContain('${GLM_API_KEY}')
    expect(settings.mcpServers['glm-vision'].env.Z_AI_API_KEY).toBe('${GLM_API_KEY}')
  })
})
```

- [ ] **Step 10: Run — PASS**

```bash
pnpm vitest run packages/core/test/integration/bundled-firstrun.test.ts
```

Expected: 2 pass.

- [ ] **Step 11: Commit**

```bash
git add packages
git commit -m "feat(bundled-mcp): glm-vision/web-search/web-reader/zread + bootstrap + LLM-name routing"
```

---

## Task 17: Daemon wire-up — single LoaderHub + reload + boot order

**Files:**
- Modify: `packages/core/src/daemon/loader-hub.ts` (upgrade P1's stub to full implementation)
- Modify: `packages/core/src/rpc/index.ts` (register new methods)

> P1 already creates `loader-hub.ts` as a stub and wires `await LoaderHub.runAll(this)` into `Daemon.start()` (P1-Fix-5). P4 only upgrades the stub here; no `daemon.ts` edit required.

- [ ] **Step 1: Implement LoaderHub — the single owner of all cascade-dependent state**

`packages/core/src/daemon/loader-hub.ts`:

```ts
import type { Database } from 'better-sqlite3'
import type { GlmPaths } from '@glm/shared'
import type { Logger } from '../log'
import type { ToolRegistry } from '../tools'                        // from P3
import type { UrlRouter } from '../tools/read/url-router'           // from P3 (P3-Fix-4)
import { loadCascade, type CascadeResult } from '../config'
import { CascadeWatcher } from '../config/watcher'
import { McpHost, registerMcpUrlScheme } from '../mcp'
import { McpToolBridge } from '../mcp/tool-bridge'
import { PluginLoader } from '../plugins'
import { SkillLoader, SkillInvoker, registerSkillTool } from '../skills'
import { CommandLoader } from '../commands'
import { validateHooks, type ValidatedHooks } from '../hooks'
import { bootstrapBundledMcp } from '../bundled-mcp'
import { WebCache } from '../web-cache'

export interface HubOpts {
  cwd: string
  paths: GlmPaths
  log: Logger
  db: Database
  toolRegistry: ToolRegistry
  urlRouter: UrlRouter
  env?: NodeJS.ProcessEnv
}

/**
 * Owns: McpHost, McpToolBridge, PluginLoader, SkillLoader, CommandLoader, WebCache,
 *       CascadeWatcher, validated hooks (parse only).
 *
 * Boot order:
 *  1. bootstrapBundledMcp (first run only)
 *  2. loadCascade → merged settings
 *  3. plugins.loadAll
 *  4. host.applySettings (mcp + plugin-namespaced)
 *  5. mcpToolBridge.register per server
 *  6. skills.loadAll (with plugin skill roots)
 *  7. registerSkillTool (P3 ToolRegistry)
 *  8. commands.loadAll (with plugin command roots)
 *  9. validateHooks (P5 will consume)
 * 10. registerMcpUrlScheme (mcp:// → host)
 * 11. start watcher
 *
 * Reload re-runs steps 2-9 (preserves server connections that didn't change).
 */
export class LoaderHub {
  host: McpHost
  toolBridge: McpToolBridge
  plugins: PluginLoader
  skills: SkillLoader
  invoker: SkillInvoker
  commands: CommandLoader
  cache: WebCache
  hooks: ValidatedHooks = { hooks: {}, warnings: [], totalGroups: 0 }
  private watcher?: CascadeWatcher
  private currentSettings?: CascadeResult
  private bootstrapDone = false

  constructor(private opts: HubOpts) {
    this.host = new McpHost({ log: opts.log, env: opts.env })
    this.toolBridge = new McpToolBridge(opts.toolRegistry, opts.log)
    this.plugins = new PluginLoader({ paths: opts.paths, log: opts.log, db: opts.db })
    this.skills = new SkillLoader({ cwd: opts.cwd, paths: opts.paths, log: opts.log })
    this.invoker = new SkillInvoker(this.skills.registry, opts.log)
    this.commands = new CommandLoader({ cwd: opts.cwd, paths: opts.paths, log: opts.log })
    this.cache = new WebCache(opts.paths.webCacheDir)
  }

  async boot(): Promise<void> {
    if (!this.bootstrapDone) {
      bootstrapBundledMcp({ paths: this.opts.paths, log: this.opts.log })
      this.bootstrapDone = true
    }
    await this.reload()
    registerMcpUrlScheme(this.opts.urlRouter, this.host)
    registerSkillTool(this.opts.toolRegistry, this.invoker, this.skills.registry)
    this.watcher = new CascadeWatcher({
      cwd: this.opts.cwd,
      paths: this.opts.paths,
      onChange: () => { void this.reload().catch(e => this.opts.log.error({ err: e.message }, 'reload after settings change failed')) }
    })
    this.watcher.start()
  }

  async reload(): Promise<void> {
    this.currentSettings = loadCascade({ cwd: this.opts.cwd, paths: this.opts.paths, log: this.opts.log })
    this.plugins.loadAll()
    // Merge plugin mcpServers into settings before host.applySettings
    const merged = { ...this.currentSettings.merged }
    merged.mcpServers = { ...(merged.mcpServers ?? {}), ...(this.plugins.pluginMcpServers() as Record<string, never>) }
    this.toolBridge.unregisterAll()
    const r = await this.host.applySettings(merged)
    this.opts.log.info({ started: r.started, failed: r.failed }, 'mcp host applied settings')
    for (const server of this.host.list()) this.toolBridge.register(server)
    this.skills = new SkillLoader(
      { cwd: this.opts.cwd, paths: this.opts.paths, log: this.opts.log, pluginSkillRoots: this.plugins.skillRoots() },
      this.skills.registry
    )
    const sl = this.skills.loadAll()
    this.opts.log.info({ skills: sl.loaded, errors: sl.errors.length }, 'skills loaded')
    this.invoker = new SkillInvoker(this.skills.registry, this.opts.log)
    this.commands = new CommandLoader(
      { cwd: this.opts.cwd, paths: this.opts.paths, log: this.opts.log, pluginCommandRoots: this.plugins.commandRoots() },
      this.commands.registry
    )
    const cl = this.commands.loadAll()
    this.opts.log.info({ commands: cl.loaded, errors: cl.errors.length }, 'commands loaded')
    this.hooks = validateHooks(this.currentSettings.merged.hooks, this.opts.log)
  }

  getMergedSettings() { return this.currentSettings?.merged ?? {} }

  async shutdown(): Promise<void> {
    await this.watcher?.stop()
    this.toolBridge.unregisterAll()
    await this.host.stopAll()
  }
}
```

- [ ] **Step 2: Wire LoaderHub into daemon**

Modify `packages/core/src/daemon/daemon.ts` `start()` after migrations:

```ts
// inside start(), after openDb + runMigrations + RpcServer setup
import { LoaderHub } from './loader-hub'
import { mcpMethods } from '../rpc/methods/mcp'
import { skillMethods } from '../rpc/methods/skill'
import { pluginMethods } from '../rpc/methods/plugin'
import { commandMethods } from '../rpc/methods/command'

// ToolRegistry + UrlRouter come from P3 — daemon already constructs them by P4.
const toolRegistry = this.toolRegistry   // P3
const urlRouter = this.urlRouter         // P3

const hub = new LoaderHub({
  cwd: process.cwd(),
  paths: this.paths,
  log: this.log,
  db: this.db,
  toolRegistry,
  urlRouter,
})
this.hub = hub
await hub.boot()

// Register RPC methods
const mcpFns = mcpMethods({
  host: hub.host,
  getMergedSettings: () => hub.getMergedSettings(),
  persistServer: async (name, entry) => persistServerToGlmSettings(this.paths.configFile, name, entry),
})
for (const [k, fn] of Object.entries(mcpFns)) this.rpcServer.on(k, fn)

const skillFns = skillMethods({ registry: hub.skills.registry, invoker: hub.invoker })
for (const [k, fn] of Object.entries(skillFns)) this.rpcServer.on(k, fn)

const pluginFns = pluginMethods({
  loader: hub.plugins, paths: this.paths,
  reload: () => hub.reload(),
})
for (const [k, fn] of Object.entries(pluginFns)) this.rpcServer.on(k, fn)

const commandFns = commandMethods({ registry: hub.commands.registry })
for (const [k, fn] of Object.entries(commandFns)) this.rpcServer.on(k, fn)
```

And add `persistServerToGlmSettings` helper to daemon.ts (or a small helper file):

```ts
function persistServerToGlmSettings(filepath: string, name: string, entry: unknown | null): void {
  let s: { mcpServers?: Record<string, unknown> } = {}
  if (existsSync(filepath)) {
    try { s = JSON.parse(readFileSync(filepath, 'utf8')) } catch { s = {} }
  }
  s.mcpServers = s.mcpServers ?? {}
  if (entry === null) delete s.mcpServers[name]
  else s.mcpServers[name] = entry
  writeFileSync(filepath, JSON.stringify(s, null, 2), { mode: 0o600 })
}
```

Wire `shutdown()`:

```ts
async stop(): Promise<void> {
  await this.hub?.shutdown()
  // ... existing stop logic
}
```

- [ ] **Step 3: Re-export RPC methods**

Modify `packages/core/src/rpc/index.ts`:

```ts
export * from './protocol'
export { RpcServer, framesFromChunk } from './server'
export { pingHandler } from './methods/ping'
export { mcpMethods } from './methods/mcp'
export { skillMethods } from './methods/skill'
export { pluginMethods } from './methods/plugin'
export { commandMethods } from './methods/command'
```

- [ ] **Step 4: End-to-end daemon smoke**

```bash
pnpm build
export GLM_HOME=/tmp/glm-p4-smoke
export CLAUDE_HOME=/tmp/glm-p4-smoke-claude
rm -rf $GLM_HOME $CLAUDE_HOME
mkdir -p $CLAUDE_HOME/skills/sample
cat > $CLAUDE_HOME/skills/sample/SKILL.md <<EOF
---
name: sample
description: a sample skill
---
body
EOF
mkdir -p $CLAUDE_HOME/commands
cat > $CLAUDE_HOME/commands/hi.md <<EOF
---
description: say hi
---
Hello \$ARGUMENTS!
EOF
node packages/cli/dist/bin.js daemon start
node packages/cli/dist/bin.js skill list      # expect: at least `sample` listed
node packages/cli/dist/bin.js cmd list        # expect: at least `/hi` listed
node packages/cli/dist/bin.js mcp list        # expect: 4 bundled servers (status: failed without GLM_API_KEY — OK)
node packages/cli/dist/bin.js plugin list     # expect: "(no plugins)"
node packages/cli/dist/bin.js daemon stop
```

If `mcp list` shows the 4 bundled entries as `failed` because `GLM_API_KEY` isn't set, that's expected (LLM router work is P6); the important thing is they're listed.

- [ ] **Step 5: Commit**

```bash
git add packages
git commit -m "feat(daemon): LoaderHub — boots MCP/skills/plugins/commands/hooks + reload on settings change"
```

---

## P4 Completion — Verification Checklist

Before claiming P4 done, run all of these and confirm output:

- [ ] **Build clean:** `pnpm build` → no errors
- [ ] **All tests pass:** `pnpm vitest run` → all green. Expected counts (approximate):
  - Unit: paths (+2), config-merge (5), config-cascade (6), config-watcher (1), mcp-env-interp (5), mcp-oauth (3), skill-parser (5), skill-loader (4), plugin-manifest (4), plugin-loader (5), command-parser (5), hooks-config (9), web-cache (4), bundled-bootstrap (5), bundled-routing (5) → ~68
  - Integration: mcp-stdio-roundtrip (3), mcp-http-roundtrip (1, may be skipped), skill-invoke (3), plugin-namespacing (1), command-cascade (3), mcp-url-handler (2), bundled-firstrun (2) → ~15
- [ ] **Coverage:** `pnpm vitest run --coverage` → core/config >80%, core/skills >75%, core/plugins >75%, core/mcp >70% (transports rely on integration), core/bundled-mcp >85%
- [ ] **End-to-end smoke:**
  ```bash
  export GLM_HOME=/tmp/glm-p4-e2e
  export CLAUDE_HOME=/tmp/glm-p4-e2e-claude
  rm -rf $GLM_HOME $CLAUDE_HOME
  # 1. fresh start writes 4 bundled MCPs
  node packages/cli/dist/bin.js daemon start
  test -f $GLM_HOME/settings.json
  grep -q glm-vision $GLM_HOME/settings.json
  test -f $GLM_HOME/.state/bundled-mcp.bootstrapped
  # 2. mcp list shows them
  node packages/cli/dist/bin.js mcp list | grep -q glm-vision
  # 3. user-installed claude skill is loaded
  mkdir -p $CLAUDE_HOME/skills/echo
  cat > $CLAUDE_HOME/skills/echo/SKILL.md <<EOF
---
name: echo
description: echo skill
---
hi
EOF
  node packages/cli/dist/bin.js daemon restart
  node packages/cli/dist/bin.js skill list | grep -q '^echo '
  node packages/cli/dist/bin.js skill show echo | grep -q 'hi'
  # 4. command cascade
  mkdir -p $CLAUDE_HOME/commands
  echo -e "---\ndescription: greet\n---\nHello \$ARGUMENTS" > $CLAUDE_HOME/commands/hi.md
  node packages/cli/dist/bin.js daemon restart
  node packages/cli/dist/bin.js cmd render hi world | grep -q 'Hello world'
  # 5. plugin install
  PLUGDIR=/tmp/glm-p4-plugin
  rm -rf $PLUGDIR && mkdir -p $PLUGDIR/skills/auto
  echo '{"name":"omc","version":"0.1.0","skills":true}' > $PLUGDIR/plugin.json
  echo -e "---\nname: auto\ndescription: autopilot\n---\nbody" > $PLUGDIR/skills/auto/SKILL.md
  node packages/cli/dist/bin.js plugin install $PLUGDIR --name omc --version 0.1.0
  node packages/cli/dist/bin.js skill list | grep -q '^omc:auto'
  # 6. plugin disable
  node packages/cli/dist/bin.js plugin disable omc
  node packages/cli/dist/bin.js skill list | grep -v '^omc:auto'
  # 7. clean
  node packages/cli/dist/bin.js daemon stop
  rm -rf $GLM_HOME $CLAUDE_HOME $PLUGDIR
  ```
- [ ] **Settings reload smoke** (watcher works end-to-end):
  ```bash
  export GLM_HOME=/tmp/glm-p4-watch
  rm -rf $GLM_HOME
  node packages/cli/dist/bin.js daemon start
  echo '{"mcpServers":{"dummy":{"command":"echo","args":["never"]}}}' > $GLM_HOME/settings.json
  sleep 1
  node packages/cli/dist/bin.js mcp list | grep -q dummy
  node packages/cli/dist/bin.js daemon stop
  rm -rf $GLM_HOME
  ```
- [ ] **Compat smoke** — drop in a real `~/.claude.json` and confirm its MCP servers appear:
  ```bash
  cp ~/.claude.json /tmp/glm-p4-claudejson.bak  # back up real one
  cat > ~/.claude.json <<EOF
{
  "mcpServers": {
    "test-noop": { "command": "/bin/sleep", "args": ["3600"] }
  }
}
EOF
  export GLM_HOME=/tmp/glm-p4-compat
  rm -rf $GLM_HOME
  node packages/cli/dist/bin.js daemon start
  node packages/cli/dist/bin.js mcp list | grep -q test-noop
  node packages/cli/dist/bin.js daemon stop
  mv /tmp/glm-p4-claudejson.bak ~/.claude.json   # restore
  rm -rf $GLM_HOME
  ```
- [ ] **No leaked child processes:** `ps aux | grep -E '(mcp|dummy)' | grep -v grep` is empty after `daemon stop`.
- [ ] **Hook config parse-only verified** — drop `~/.claude/settings.json` with a `hooks` block, `glm daemon start`, then `cat $GLM_HOME/daemon.log` should show `validated hooks` log line with `totalGroups: N` and **no execution attempted** (dispatcher is P5).

If anything above fails, fix before declaring P4 done.

---

## What P4 does NOT include (deferred to later P-plans)

These are intentionally out of scope for P4:

- **Hook event dispatch / execution** — config is parsed and validated; actual SessionStart / PreToolUse / PostToolUse / Stop / Notification firing is **P5 (Hook Event System)**.
- **Hook env injection (`$CLAUDE_*` / `$GLM_*`)** and **the loop-protection counter** — **P5**.
- **Plugin remote install / npm-style fetch** — P4 ships `installFromPath` only. Pull-from-registry is **P9 (Plugin Marketplace)**.
- **TUI slash command autocompletion + `/` shortcut UI** — TUI is **P2**, P4 only powers `cmd.list/show/render` RPC and the `glm cmd …` CLI.
- **Skill `permissions` enforcement at invocation time** — the field is parsed but P4's `Skill` tool doesn't yet gate access. Permission engine is **P5+P3 (permissions)**.
- **Skill script execution sandbox / cwd append** — `scripts/` directory contents are enumerated but not auto-added to Bash's PATH or executed. **P5 (sub-agent runtime)**.
- **Sub-skill recursion beyond depth 2** — hard cap enforced. Cross-skill delegation patterns require **P8 (orchestrator)**.
- **Web cache eviction on size budget** — only TTL-based expiry. Size-based LRU + budget HUD is **P10 (resource budgets)**.
- **Bundled MCP quota tracking** (Vision 5h, Web 100/1k/4k per month) — quota tables live in P1's `quota.db`; tracker that decrements them is **P6 (LLM Router + Quota Tracker)**.
- **`Vision.*` triggered automatically on image-in-message detection** — wiring image-input → `glm-vision/image_analysis` is **P6 (LLM Router)**, P4 only registers the route table.
- **OAuth flow auto-triggered when an MCP tool returns 401** — the `OAuthDriver` exists; the auto-trigger path lives in **P5** (tool execution layer).
- **All §9.13–§9.21 features** (workflow catalog, agent role catalog, memory layer, natural language activation, notification bridges, resilience hooks, workspace-aware tools) — separate later P-plans.
- **`Read("mcp://…")` from inside the LLM tool-call loop** — URL router scheme is registered, but the LLM-side `Read` tool is **P3**; P4 only proves the scheme handler resolves correctly.

---

## Summary

P4 closes the Claude Code compatibility loop and seeds the GLM-specific MCP fleet. After this milestone:
- Any existing `~/.claude/` user can swap to `glm` without losing MCP servers, skills, commands, or plugins.
- The 4 bundled GLM MCPs are present on first start and routable from LLM-side names.
- Hook configs are parsed and ready for P5 dispatch.
- The internal `mcp://` URL scheme integrates with P3's URL router.
- Cascade reload is hot — editing any settings file in any of the 8 locations triggers a debounced reload of MCP, skills, commands, plugins, hooks in ~200ms.
