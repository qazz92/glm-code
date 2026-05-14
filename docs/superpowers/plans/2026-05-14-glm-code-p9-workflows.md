# glm code — P9: Built-in Workflow Catalog (14 workflows)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the 14 first-class built-in workflows as `/<name>` slash commands and `glm <name>` CLI subcommands. Each workflow is a declarative file under `packages/workflows/<name>/` (frontmatter + body + `phases.json` + `acceptance.json`) that composes the 20 agent roles delivered in P8 via the orchestrator + scheduler. The workflow runtime is the single execution lane all higher-level features (autopilot, ralph, ultrawork, team, plan, ralplan, deep-dive, trace, ultraqa, self-improve, debug, verify, critic, skillify) share.

**Architecture:**
- **Workflow definition** = a directory in `packages/workflows/<name>/` containing `WORKFLOW.md` (frontmatter + human body), `phases.json` (ordered phase pipeline), and optional `acceptance.json` (gate DSL). Spec §9.13.
- **Workflow registry** resolves a workflow name across the same cascade as skills (§9.4): built-in (`packages/workflows`) → plugin (`~/.claude/plugins/.../workflows`) → user (`.glm/workflows`, `~/.glm/workflows`). Built-in wins on name collision; users may always qualify with `<plugin>:<name>`.
- **Workflow loader** parses + validates a workflow against a Zod schema and produces an in-memory `WorkflowDef`. Caches by mtime.
- **Workflow runner** consumes `WorkflowDef` + user arguments and drives the P8 `Orchestrator` (model routing) + `Scheduler` (rate-limit/quota-aware fan-out). Each phase yields a `PhaseResult` with handoff state; the runner enforces handoff policy + acceptance gates between phases.
- **Acceptance DSL** is a small JSON expression language: `{op: "all", checks: [{kind: "tests-pass"}, {kind: "lsp-clean"}, {kind: "no-todo-in-diff"}, {kind: "agent-says", agent: "verifier", verdict: "pass"}]}`. The runner evaluates per phase + at workflow end.
- **CLI ↔ slash 1:1** (§9.7 / §5.9): every workflow is exposed both ways with identical args. TUI `/autopilot foo` ≡ CLI `glm autopilot foo`.
- **Keyword auto-trigger** (§9.17): P5's keyword detector maps phrases (e.g., `"ralph"`, `"autopilot"`, `"ulw"`, `"ccg"`, `"ralplan"`) to a workflow name + injects it as `UserPromptSubmit` hook output. The detector is wired in P5; P9 only registers each workflow's trigger keywords via frontmatter so the table populates automatically.
- **Tests:** each workflow ships an integration test (`packages/workflows/<name>/test/<name>.golden.test.ts`) that runs the workflow end-to-end with a mocked LLM (golden replay using fixtures in `__fixtures__/llm/<name>.jsonl`). Workflows pass when phases complete + acceptance gates fire on the expected fixture state.

**Tech stack additions (from P1):** none — reuses Node 22 / TS / Zod / Vitest / pino / better-sqlite3. The runner is pure orchestration, no new runtime deps.

**Dependencies (must be complete before P9 can be implemented):**
- P1: daemon + JSON-RPC + SQLite (workflow run state persists into `workflow_runs` table)
- P2: TUI for `/slash` parsing
- P3: built-in tools (executor needs Read/Edit/Bash/Grep/Glob)
- P4: MCP / skill / plugin / hook system (workflows are surfaced via the slash dispatcher + UserPromptSubmit hook)
- P5: keyword detector (P9 only registers trigger keywords; P5 owns the regex engine + injector)
- P6: LLM router (orchestrator calls go through P6)
- P7: memory cascade + compaction + memory trio (notepad/project-memory/shared-memory) — workflows write run journals and read AGENTS.md
- P8: orchestrator + scheduler + 20 agent roles + worker preamble — the *primitive* P9 composes

**Acceptance criteria for P9:**
- `glm workflow list` enumerates 14 built-in workflows + any plugin/user-added ones
- `glm workflow info <name>` prints frontmatter + phases + acceptance + composed agent roles
- `glm <name> <args>` and TUI `/<name> <args>` both run the workflow end-to-end on a small repro repo
- Each of the 14 workflows has a golden-replay integration test that PASSES with the canned LLM fixture
- Acceptance DSL evaluator passes all unit tests; `tests-pass`, `lsp-clean`, `no-todo-in-diff`, `agent-says`, `file-exists`, `regex-not-in-diff`, `phase-completed`, `all`/`any`/`not` all supported
- Keyword auto-activation: typing `"autopilot build me X"` in the TUI fires `/autopilot build me X` via P5 detector (with `trigger_keywords` declared in frontmatter)
- Built-in workflow wins over a plugin workflow of the same name; `/<plugin>:<name>` form selects the plugin version
- Run state persists to `workflow_runs` + `workflow_phase_runs` tables; `glm workflow resume <run-id>` re-enters a paused/crashed run at the failed phase
- 80%+ unit coverage on runner/loader/registry/dsl; all 14 golden tests + 6+ infra integration tests green

---

## File Structure

```
glm-code/
├── packages/
│   ├── workflow-runtime/                       # the shared engine
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── schema.ts                       # Zod schemas for WorkflowDef / Phase / Handoff
│   │   │   ├── loader.ts                       # parse WORKFLOW.md + phases.json + acceptance.json
│   │   │   ├── registry.ts                     # cascade resolver (built-in → plugin → user)
│   │   │   ├── runner.ts                       # core execution: phases → orchestrator → scheduler
│   │   │   ├── handoff.ts                      # PhaseResult merge / state propagation
│   │   │   ├── acceptance/
│   │   │   │   ├── dsl.ts                      # parse + evaluate acceptance JSON
│   │   │   │   ├── checks/
│   │   │   │   │   ├── tests-pass.ts
│   │   │   │   │   ├── lsp-clean.ts
│   │   │   │   │   ├── no-todo-in-diff.ts
│   │   │   │   │   ├── agent-says.ts
│   │   │   │   │   ├── file-exists.ts
│   │   │   │   │   ├── regex-not-in-diff.ts
│   │   │   │   │   ├── phase-completed.ts
│   │   │   │   │   └── index.ts
│   │   │   │   └── index.ts
│   │   │   ├── persistence/
│   │   │   │   ├── migrations/
│   │   │   │   │   └── 009_workflow_runs.sql
│   │   │   │   └── workflow-run-repo.ts
│   │   │   ├── llm-mock/
│   │   │   │   └── golden-replay.ts            # test-only: replay JSONL fixtures
│   │   │   └── events.ts                       # WorkflowRunStarted / PhaseStarted / Phase...
│   │   └── test/
│   │       ├── unit/
│   │       │   ├── loader.test.ts
│   │       │   ├── registry-cascade.test.ts
│   │       │   ├── acceptance-dsl.test.ts
│   │       │   ├── handoff.test.ts
│   │       │   └── workflow-run-repo.test.ts
│   │       └── integration/
│   │           ├── runner-basic.test.ts
│   │           ├── resume.test.ts
│   │           └── plugin-cascade.test.ts
│   ├── workflows/                              # the 14 built-in workflows
│   │   ├── autopilot/
│   │   │   ├── WORKFLOW.md
│   │   │   ├── phases.json
│   │   │   ├── acceptance.json
│   │   │   ├── __fixtures__/llm/autopilot.jsonl
│   │   │   └── test/autopilot.golden.test.ts
│   │   ├── ralph/
│   │   │   ├── WORKFLOW.md
│   │   │   ├── phases.json
│   │   │   ├── acceptance.json
│   │   │   ├── __fixtures__/llm/ralph.jsonl
│   │   │   └── test/ralph.golden.test.ts
│   │   ├── ultrawork/{ … same shape … }
│   │   ├── team/{ … }
│   │   ├── plan/{ … }
│   │   ├── ralplan/{ … }
│   │   ├── deep-dive/{ … }
│   │   ├── trace/{ … }
│   │   ├── ultraqa/{ … }
│   │   ├── self-improve/{ … }
│   │   ├── debug/{ … }
│   │   ├── verify/{ … }
│   │   ├── critic/{ … }
│   │   └── skillify/{ … }
│   └── cli/                                    # extended from P1
│       └── src/commands/
│           ├── workflow.ts                     # `glm workflow list|info|run|resume`
│           ├── autopilot.ts                    # thin alias → workflow run autopilot
│           ├── ralph.ts
│           ├── ultrawork.ts
│           ├── team.ts
│           ├── plan.ts
│           ├── ralplan.ts
│           ├── deep-dive.ts
│           ├── trace.ts
│           ├── ultraqa.ts
│           ├── self-improve.ts
│           ├── debug.ts
│           ├── verify.ts
│           ├── critic.ts
│           └── skillify.ts
```

---

## Task 1: workflow-runtime package scaffold + schema

**Files:**
- Create: `packages/workflow-runtime/package.json`
- Create: `packages/workflow-runtime/tsconfig.json`
- Create: `packages/workflow-runtime/src/index.ts`
- Create: `packages/workflow-runtime/src/schema.ts`
- Test: `packages/workflow-runtime/test/unit/schema.test.ts`

- [ ] **Step 1: Add workspace package**

`packages/workflow-runtime/package.json`:
```json
{
  "name": "@glm/workflow-runtime",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": { "build": "tsc -b" },
  "dependencies": {
    "@glm/shared": "workspace:*",
    "@glm/core": "workspace:*",
    "@glm/orchestrator": "workspace:*",
    "@glm/agents": "workspace:*",
    "@glm/lsp": "workspace:*",
    "zod": "^3.23.0",
    "gray-matter": "^4.0.3"
  },
  "devDependencies": { "@types/node": "^22.0.0" }
}
```

`packages/workflow-runtime/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src/**/*"],
  "references": [
    { "path": "../shared" },
    { "path": "../core" },
    { "path": "../orchestrator" },
    { "path": "../agents" },
    { "path": "../lsp" }
  ]
}
```

Note: `@glm/orchestrator`, `@glm/agents`, `@glm/lsp` are P8 / P3 packages — they MUST exist by the time P9 starts.

- [ ] **Step 2: Write failing schema test**

`packages/workflow-runtime/test/unit/schema.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { WorkflowDefSchema, PhaseSchema, AcceptanceSchema } from '../../src/schema'

describe('WorkflowDefSchema', () => {
  test('accepts a minimal valid workflow', () => {
    const r = WorkflowDefSchema.safeParse({
      name: 'autopilot',
      description: 'end-to-end pipeline',
      level: 4,
      argumentHint: '<idea>',
      triggerKeywords: ['autopilot', 'build me'],
      phases: [{ id: 'analyst', agent: 'analyst', model: 'GLM-5.1' }],
      handoffPolicy: 'sequential',
      acceptance: { op: 'all', checks: [{ kind: 'phase-completed', phase: 'analyst' }] },
    })
    expect(r.success).toBe(true)
  })

  test('rejects unknown level', () => {
    const r = WorkflowDefSchema.safeParse({
      name: 'x', description: 'y', level: 9, phases: [],
      handoffPolicy: 'sequential', acceptance: { op: 'all', checks: [] },
    })
    expect(r.success).toBe(false)
  })

  test('PhaseSchema requires either agent or sub-workflow', () => {
    expect(PhaseSchema.safeParse({ id: 'a' }).success).toBe(false)
    expect(PhaseSchema.safeParse({ id: 'a', agent: 'planner' }).success).toBe(true)
    expect(PhaseSchema.safeParse({ id: 'a', workflow: 'plan' }).success).toBe(true)
  })

  test('AcceptanceSchema is recursive (all/any/not nest)', () => {
    const r = AcceptanceSchema.safeParse({
      op: 'all',
      checks: [
        { op: 'any', checks: [{ kind: 'tests-pass' }, { kind: 'lsp-clean' }] },
        { op: 'not', check: { kind: 'regex-not-in-diff', pattern: 'TODO' } },
      ],
    })
    expect(r.success).toBe(true)
  })
})
```

- [ ] **Step 3: Run — FAIL**

```bash
pnpm vitest run packages/workflow-runtime/test/unit/schema.test.ts
```

- [ ] **Step 4: Implement schema**

`packages/workflow-runtime/src/schema.ts`:
```ts
import { z } from 'zod'

export const HandoffPolicySchema = z.enum([
  'sequential',          // phase N completes before N+1
  'parallel-fanout',     // multiple workers run same phase concurrently
  'pipeline',            // streamed phase-to-phase (autopilot)
  'consensus',           // N voters + tiebreaker (ralplan)
  'peer-team',           // shared task list (team)
  'persistence-loop',    // ralph: re-run until acceptance true
  'tournament',          // self-improve: variants compete
])
export type HandoffPolicy = z.infer<typeof HandoffPolicySchema>

const AgentNameSchema = z.enum([
  'analyst', 'planner', 'architect', 'executor', 'verifier', 'critic',
  'code-reviewer', 'code-simplifier', 'security-reviewer', 'test-engineer',
  'qa-tester', 'debugger', 'tracer', 'explore', 'scientist', 'designer',
  'document-specialist', 'writer', 'git-master', 'orchestrator',
])

export const PhaseSchema = z.object({
  id: z.string().min(1),
  description: z.string().optional(),
  agent: AgentNameSchema.optional(),
  workflow: z.string().optional(),                          // composes another workflow
  model: z.string().optional(),                             // override default agent model
  thinking: z.boolean().optional(),
  parallel: z.number().int().positive().optional(),         // fan-out width
  inputsFromPhase: z.string().optional(),                   // pull artifacts of prior phase
  promptTemplate: z.string().optional(),                    // additional preamble
  maxIters: z.number().int().positive().optional(),         // for loop phases
  acceptance: z.lazy(() => AcceptanceSchema).optional(),    // per-phase gate
  onFail: z.enum(['stop', 'retry', 'next', 'goto']).optional(),
  gotoPhase: z.string().optional(),
}).refine((p) => p.agent || p.workflow, { message: 'phase needs agent or workflow' })
export type Phase = z.infer<typeof PhaseSchema>

const CheckLeafSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('tests-pass'), command: z.string().optional() }),
  z.object({ kind: z.literal('lsp-clean'), root: z.string().optional() }),
  z.object({ kind: z.literal('no-todo-in-diff') }),
  z.object({ kind: z.literal('regex-not-in-diff'), pattern: z.string() }),
  z.object({ kind: z.literal('file-exists'), path: z.string() }),
  z.object({ kind: z.literal('agent-says'), agent: AgentNameSchema, verdict: z.string() }),
  z.object({ kind: z.literal('phase-completed'), phase: z.string() }),
])

export type AcceptanceNode =
  | { op: 'all'; checks: AcceptanceNode[] }
  | { op: 'any'; checks: AcceptanceNode[] }
  | { op: 'not'; check: AcceptanceNode }
  | z.infer<typeof CheckLeafSchema>

export const AcceptanceSchema: z.ZodType<AcceptanceNode> = z.lazy(() =>
  z.union([
    z.object({ op: z.literal('all'),  checks: z.array(AcceptanceSchema) }),
    z.object({ op: z.literal('any'),  checks: z.array(AcceptanceSchema) }),
    z.object({ op: z.literal('not'),  check:  AcceptanceSchema }),
    CheckLeafSchema,
  ])
)

export const WorkflowDefSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9-]*$/),
  description: z.string().min(1),
  level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  argumentHint: z.string().optional(),
  triggerKeywords: z.array(z.string()).default([]),
  phases: z.array(PhaseSchema),
  handoffPolicy: HandoffPolicySchema,
  acceptance: AcceptanceSchema,
  maxIter: z.number().int().positive().optional(),
  body: z.string().optional(),    // human prose section (populated by loader)
  source: z.enum(['builtin', 'plugin', 'user']).default('builtin'),
  sourcePath: z.string().optional(),
})
export type WorkflowDef = z.infer<typeof WorkflowDefSchema>
```

- [ ] **Step 5: Index barrel**

`packages/workflow-runtime/src/index.ts`:
```ts
export * from './schema'
```

- [ ] **Step 6: Run schema test — PASS**

```bash
pnpm vitest run packages/workflow-runtime/test/unit/schema.test.ts
```

Expected: PASS (4 cases).

- [ ] **Step 7: Commit**

```bash
git add packages/workflow-runtime
git commit -m "feat(workflow-runtime): scaffold package + Zod schema for WorkflowDef / Phase / Acceptance"
```

---

## Task 2: Workflow loader (Markdown + frontmatter + sidecar JSON)

**Files:**
- Create: `packages/workflow-runtime/src/loader.ts`
- Test: `packages/workflow-runtime/test/unit/loader.test.ts`

- [ ] **Step 1: Failing test**

`packages/workflow-runtime/test/unit/loader.test.ts`:
```ts
import { afterEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { loadWorkflowDir } from '../../src/loader'

let dir: string
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }) })

function stage(files: Record<string, string>): string {
  dir = mkdtempSync(path.join(os.tmpdir(), 'glm-wf-'))
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel)
    mkdirSync(path.dirname(abs), { recursive: true })
    writeFileSync(abs, content)
  }
  return dir
}

describe('loadWorkflowDir', () => {
  test('loads a complete workflow (frontmatter + phases.json + acceptance.json)', async () => {
    const d = stage({
      'WORKFLOW.md': `---
name: tinyflow
description: tiny test workflow
level: 2
argument-hint: <task>
trigger-keywords: [tiny, tinyflow]
handoff-policy: sequential
---
# Tiny flow
Body prose.`,
      'phases.json': JSON.stringify([
        { id: 'plan', agent: 'planner' },
        { id: 'exec', agent: 'executor', inputsFromPhase: 'plan' },
      ]),
      'acceptance.json': JSON.stringify({
        op: 'all', checks: [{ kind: 'phase-completed', phase: 'exec' }],
      }),
    })
    const w = await loadWorkflowDir(d, 'builtin')
    expect(w.name).toBe('tinyflow')
    expect(w.level).toBe(2)
    expect(w.triggerKeywords).toEqual(['tiny', 'tinyflow'])
    expect(w.phases).toHaveLength(2)
    expect(w.body).toContain('Body prose')
    expect(w.source).toBe('builtin')
    expect(w.sourcePath).toBe(d)
  })

  test('inline acceptance in frontmatter is accepted (no acceptance.json file)', async () => {
    const d = stage({
      'WORKFLOW.md': `---
name: inlineflow
description: x
level: 2
handoff-policy: sequential
acceptance: { op: all, checks: [{ kind: tests-pass }] }
---
body`,
      'phases.json': JSON.stringify([{ id: 'a', agent: 'executor' }]),
    })
    const w = await loadWorkflowDir(d, 'builtin')
    expect(w.acceptance).toEqual({ op: 'all', checks: [{ kind: 'tests-pass' }] })
  })

  test('rejects when WORKFLOW.md missing', async () => {
    const d = stage({ 'phases.json': '[]' })
    await expect(loadWorkflowDir(d, 'builtin')).rejects.toThrow(/WORKFLOW\.md/)
  })

  test('rejects schema-invalid (bad agent name)', async () => {
    const d = stage({
      'WORKFLOW.md': `---
name: bad
description: x
level: 2
handoff-policy: sequential
acceptance: { op: all, checks: [] }
---`,
      'phases.json': JSON.stringify([{ id: 'a', agent: 'wizard' }]),
    })
    await expect(loadWorkflowDir(d, 'builtin')).rejects.toThrow(/agent/)
  })
})
```

- [ ] **Step 2: Run — FAIL**

```bash
pnpm vitest run packages/workflow-runtime/test/unit/loader.test.ts
```

- [ ] **Step 3: Implement loader**

`packages/workflow-runtime/src/loader.ts`:
```ts
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import matter from 'gray-matter'
import { WorkflowDefSchema, type WorkflowDef } from './schema'

export type WorkflowSource = 'builtin' | 'plugin' | 'user'

function camelizeKeys<T>(obj: any): any {
  if (Array.isArray(obj)) return obj.map(camelizeKeys)
  if (obj && typeof obj === 'object') {
    const out: any = {}
    for (const [k, v] of Object.entries(obj)) {
      const camel = k.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
      out[camel] = camelizeKeys(v)
    }
    return out
  }
  return obj
}

export async function loadWorkflowDir(dir: string, source: WorkflowSource): Promise<WorkflowDef> {
  const wfMd = path.join(dir, 'WORKFLOW.md')
  let raw: string
  try { raw = await readFile(wfMd, 'utf8') }
  catch { throw new Error(`WORKFLOW.md not found in ${dir}`) }

  const fm = matter(raw)
  const front = camelizeKeys(fm.data)
  const body = fm.content.trim() || undefined

  // Sidecar phases.json — required if not in frontmatter
  let phases = front.phases
  if (!phases) {
    const p = path.join(dir, 'phases.json')
    try { phases = JSON.parse(await readFile(p, 'utf8')) }
    catch { /* phases must come from frontmatter then */ }
  }

  // Sidecar acceptance.json — optional override of frontmatter
  let acceptance = front.acceptance
  try {
    const a = path.join(dir, 'acceptance.json')
    await stat(a)
    acceptance = JSON.parse(await readFile(a, 'utf8'))
  } catch { /* sidecar missing → use frontmatter */ }

  const parsed = WorkflowDefSchema.parse({
    ...front,
    phases,
    acceptance,
    body,
    source,
    sourcePath: dir,
  })
  return parsed
}
```

- [ ] **Step 4: Run — PASS**

```bash
pnpm vitest run packages/workflow-runtime/test/unit/loader.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/workflow-runtime
git commit -m "feat(workflow-runtime): WORKFLOW.md + sidecar JSON loader with frontmatter merge"
```

---

## Task 3: Workflow registry (cascade built-in → plugin → user)

**Files:**
- Create: `packages/workflow-runtime/src/registry.ts`
- Test: `packages/workflow-runtime/test/unit/registry-cascade.test.ts`

- [ ] **Step 1: Failing test**

`packages/workflow-runtime/test/unit/registry-cascade.test.ts`:
```ts
import { afterEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { WorkflowRegistry } from '../../src/registry'

let dir: string
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }) })

function stageWorkflow(root: string, name: string, level = 2) {
  const d = path.join(root, name)
  mkdirSync(d, { recursive: true })
  writeFileSync(path.join(d, 'WORKFLOW.md'), `---
name: ${name}
description: stage
level: ${level}
handoff-policy: sequential
acceptance: { op: all, checks: [] }
---`)
  writeFileSync(path.join(d, 'phases.json'), JSON.stringify([{ id: 'a', agent: 'executor' }]))
}

describe('WorkflowRegistry cascade', () => {
  test('built-in resolves first', async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'glm-reg-'))
    const builtin = path.join(dir, 'builtin'); mkdirSync(builtin)
    const plugin  = path.join(dir, 'plugin');  mkdirSync(plugin)
    stageWorkflow(builtin, 'autopilot')
    stageWorkflow(plugin,  'autopilot')
    const reg = new WorkflowRegistry({ builtinDirs: [builtin], pluginDirs: [plugin], userDirs: [] })
    await reg.scan()
    const w = await reg.resolve('autopilot')
    expect(w!.source).toBe('builtin')
  })

  test('plugin-qualified name selects plugin version', async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'glm-reg-'))
    const builtin = path.join(dir, 'builtin'); mkdirSync(builtin)
    const omc = path.join(dir, 'plugins', 'oh-my-claudecode'); mkdirSync(omc, { recursive: true })
    stageWorkflow(builtin, 'autopilot')
    stageWorkflow(omc, 'autopilot')
    const reg = new WorkflowRegistry({
      builtinDirs: [builtin],
      pluginDirs: [{ name: 'oh-my-claudecode', dir: omc }],
      userDirs: [],
    })
    await reg.scan()
    const w = await reg.resolve('oh-my-claudecode:autopilot')
    expect(w!.source).toBe('plugin')
    expect(w!.sourcePath).toBe(omc)
  })

  test('user > plugin when plugin name is not built-in', async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'glm-reg-'))
    const plugin = path.join(dir, 'plugin'); mkdirSync(plugin)
    const user   = path.join(dir, 'user');   mkdirSync(user)
    stageWorkflow(plugin, 'myflow')
    stageWorkflow(user,   'myflow')
    const reg = new WorkflowRegistry({ builtinDirs: [], pluginDirs: [plugin], userDirs: [user] })
    await reg.scan()
    expect((await reg.resolve('myflow'))!.source).toBe('user')
  })

  test('list returns deduped by precedence', async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'glm-reg-'))
    const builtin = path.join(dir, 'builtin'); mkdirSync(builtin)
    const user    = path.join(dir, 'user');    mkdirSync(user)
    stageWorkflow(builtin, 'autopilot')
    stageWorkflow(builtin, 'plan')
    stageWorkflow(user,    'autopilot')   // overridden
    stageWorkflow(user,    'myflow')
    const reg = new WorkflowRegistry({ builtinDirs: [builtin], pluginDirs: [], userDirs: [user] })
    await reg.scan()
    const names = (await reg.list()).map(w => `${w.name}/${w.source}`).sort()
    expect(names).toEqual(['autopilot/builtin', 'myflow/user', 'plan/builtin'])
  })
})
```

- [ ] **Step 2: Run — FAIL**

```bash
pnpm vitest run packages/workflow-runtime/test/unit/registry-cascade.test.ts
```

- [ ] **Step 3: Implement registry**

`packages/workflow-runtime/src/registry.ts`:
```ts
import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { loadWorkflowDir } from './loader'
import type { WorkflowDef } from './schema'

export interface PluginDir { name: string; dir: string }

export interface RegistryOpts {
  builtinDirs: string[]
  pluginDirs: (string | PluginDir)[]
  userDirs: string[]
}

interface Entry { def: WorkflowDef; plugin?: string }

export class WorkflowRegistry {
  private builtin = new Map<string, Entry>()
  private plugins = new Map<string, Map<string, Entry>>()   // plugin -> name -> entry
  private user    = new Map<string, Entry>()

  constructor(private opts: RegistryOpts) {}

  async scan(): Promise<void> {
    this.builtin.clear(); this.plugins.clear(); this.user.clear()
    for (const root of this.opts.builtinDirs) {
      for (const [n, d] of await this.scanRoot(root)) this.builtin.set(n, { def: d })
    }
    for (const p of this.opts.pluginDirs) {
      const { name, dir } = typeof p === 'string' ? { name: path.basename(p), dir: p } : p
      const m = new Map<string, Entry>()
      for (const [n, d] of await this.scanRoot(dir)) m.set(n, { def: d, plugin: name })
      this.plugins.set(name, m)
    }
    for (const root of this.opts.userDirs) {
      for (const [n, d] of await this.scanRoot(root)) this.user.set(n, { def: d })
    }
  }

  private async scanRoot(root: string): Promise<[string, WorkflowDef][]> {
    let entries: string[]
    try { entries = await readdir(root) } catch { return [] }
    const out: [string, WorkflowDef][] = []
    for (const e of entries) {
      const abs = path.join(root, e)
      try {
        const st = await stat(abs)
        if (!st.isDirectory()) continue
        const def = await loadWorkflowDir(abs, root.includes('plugins') ? 'plugin' : root.startsWith(this.opts.builtinDirs[0] ?? '__') ? 'builtin' : 'user')
        out.push([def.name, def])
      } catch { /* skip malformed */ }
    }
    return out
  }

  async resolve(qualified: string): Promise<WorkflowDef | undefined> {
    if (qualified.includes(':')) {
      const [pluginName, name] = qualified.split(':', 2)
      return this.plugins.get(pluginName)?.get(name)?.def
    }
    // unqualified: built-in > user > first plugin match
    if (this.builtin.has(qualified)) return this.builtin.get(qualified)!.def
    if (this.user.has(qualified))    return this.user.get(qualified)!.def
    for (const m of this.plugins.values()) if (m.has(qualified)) return m.get(qualified)!.def
    return undefined
  }

  async list(): Promise<WorkflowDef[]> {
    const merged = new Map<string, WorkflowDef>()
    // lowest precedence first so higher overwrites
    for (const m of this.plugins.values()) for (const [n, e] of m) merged.set(n, e.def)
    for (const [n, e] of this.user)    merged.set(n, e.def)
    for (const [n, e] of this.builtin) merged.set(n, e.def)
    return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name))
  }
}
```

- [ ] **Step 4: Run — PASS**

```bash
pnpm vitest run packages/workflow-runtime/test/unit/registry-cascade.test.ts
```

Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/workflow-runtime
git commit -m "feat(workflow-runtime): cascade registry (builtin > user > plugin) with plugin-qualified resolve"
```

---

## Task 4: Acceptance DSL evaluator

**Files:**
- Create: `packages/workflow-runtime/src/acceptance/dsl.ts`
- Create: `packages/workflow-runtime/src/acceptance/checks/*.ts`
- Create: `packages/workflow-runtime/src/acceptance/checks/index.ts`
- Create: `packages/workflow-runtime/src/acceptance/index.ts`
- Test: `packages/workflow-runtime/test/unit/acceptance-dsl.test.ts`

- [ ] **Step 1: Failing test**

`packages/workflow-runtime/test/unit/acceptance-dsl.test.ts`:
```ts
import { describe, expect, test, vi } from 'vitest'
import { evaluateAcceptance } from '../../src/acceptance/dsl'
import type { AcceptanceContext } from '../../src/acceptance/dsl'

function ctx(over: Partial<AcceptanceContext> = {}): AcceptanceContext {
  return {
    runId: 'r1', cwd: '/tmp/repo',
    phaseResults: new Map([['plan', { ok: true, output: 'p' }], ['exec', { ok: true, output: 'e' }]]),
    agentVerdicts: new Map([['verifier', 'pass'], ['critic', 'block']]),
    runCommand: vi.fn(async (cmd) => ({ exitCode: cmd === 'pnpm test' ? 0 : 1, stdout: '', stderr: '' })),
    diffText: 'diff --git a/x b/x\n+ const x = 1\n+ // FOO\n',
    lspErrors: 0,
    fileExists: vi.fn(async (p: string) => p === '/tmp/repo/README.md'),
    ...over,
  }
}

describe('evaluateAcceptance', () => {
  test('phase-completed checks phaseResults map', async () => {
    const r = await evaluateAcceptance({ kind: 'phase-completed', phase: 'plan' }, ctx())
    expect(r.passed).toBe(true)
  })

  test('phase-completed fails when phase missing', async () => {
    const r = await evaluateAcceptance({ kind: 'phase-completed', phase: 'missing' }, ctx())
    expect(r.passed).toBe(false)
    expect(r.reason).toContain('missing')
  })

  test('tests-pass runs command and checks exit code', async () => {
    const r = await evaluateAcceptance({ kind: 'tests-pass' }, ctx())
    expect(r.passed).toBe(true)
  })

  test('lsp-clean: 0 errors → pass; >0 → fail', async () => {
    expect((await evaluateAcceptance({ kind: 'lsp-clean' }, ctx())).passed).toBe(true)
    expect((await evaluateAcceptance({ kind: 'lsp-clean' }, ctx({ lspErrors: 3 }))).passed).toBe(false)
  })

  test('no-todo-in-diff fails when diff contains TODO', async () => {
    const c = ctx({ diffText: '+ // TODO: refactor\n' })
    expect((await evaluateAcceptance({ kind: 'no-todo-in-diff' }, c)).passed).toBe(false)
  })

  test('regex-not-in-diff matches arbitrary pattern', async () => {
    expect((await evaluateAcceptance({ kind: 'regex-not-in-diff', pattern: 'FOO' }, ctx())).passed).toBe(false)
    expect((await evaluateAcceptance({ kind: 'regex-not-in-diff', pattern: 'BAR' }, ctx())).passed).toBe(true)
  })

  test('agent-says reads verdict map', async () => {
    expect((await evaluateAcceptance({ kind: 'agent-says', agent: 'verifier', verdict: 'pass' }, ctx())).passed).toBe(true)
    expect((await evaluateAcceptance({ kind: 'agent-says', agent: 'critic', verdict: 'pass' }, ctx())).passed).toBe(false)
  })

  test('file-exists', async () => {
    expect((await evaluateAcceptance({ kind: 'file-exists', path: 'README.md' }, ctx())).passed).toBe(true)
    expect((await evaluateAcceptance({ kind: 'file-exists', path: 'NOPE.md' }, ctx())).passed).toBe(false)
  })

  test('all/any/not compose', async () => {
    const r1 = await evaluateAcceptance({
      op: 'all',
      checks: [{ kind: 'phase-completed', phase: 'plan' }, { kind: 'lsp-clean' }],
    }, ctx())
    expect(r1.passed).toBe(true)

    const r2 = await evaluateAcceptance({
      op: 'any',
      checks: [{ kind: 'phase-completed', phase: 'missing' }, { kind: 'lsp-clean' }],
    }, ctx())
    expect(r2.passed).toBe(true)

    const r3 = await evaluateAcceptance({
      op: 'not',
      check: { kind: 'phase-completed', phase: 'plan' },
    }, ctx())
    expect(r3.passed).toBe(false)
  })

  test('result carries per-check breakdown', async () => {
    const r = await evaluateAcceptance({
      op: 'all',
      checks: [
        { kind: 'phase-completed', phase: 'plan' },
        { kind: 'phase-completed', phase: 'missing' },
      ],
    }, ctx())
    expect(r.passed).toBe(false)
    expect(r.breakdown).toHaveLength(2)
    expect(r.breakdown[0].passed).toBe(true)
    expect(r.breakdown[1].passed).toBe(false)
  })
})
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement DSL evaluator**

`packages/workflow-runtime/src/acceptance/dsl.ts`:
```ts
import type { AcceptanceNode } from '../schema'

export interface PhaseResultSummary { ok: boolean; output?: string }

export interface AcceptanceContext {
  runId: string
  cwd: string
  phaseResults: Map<string, PhaseResultSummary>
  agentVerdicts: Map<string, string>
  diffText: string
  lspErrors: number
  runCommand: (cmd: string) => Promise<{ exitCode: number; stdout: string; stderr: string }>
  fileExists: (path: string) => Promise<boolean>
}

export interface CheckResult {
  passed: boolean
  reason?: string
  kind: string
}
export interface AcceptanceResult {
  passed: boolean
  breakdown: CheckResult[]
}

export async function evaluateAcceptance(node: AcceptanceNode, ctx: AcceptanceContext): Promise<AcceptanceResult> {
  const breakdown: CheckResult[] = []
  const passed = await evalNode(node, ctx, breakdown)
  return { passed, breakdown }
}

async function evalNode(n: AcceptanceNode, ctx: AcceptanceContext, bd: CheckResult[]): Promise<boolean> {
  if ('op' in n) {
    if (n.op === 'all') {
      let allOk = true
      for (const c of n.checks) {
        const ok = await evalNode(c, ctx, bd)
        if (!ok) allOk = false
      }
      return allOk
    }
    if (n.op === 'any') {
      let anyOk = false
      for (const c of n.checks) {
        const ok = await evalNode(c, ctx, bd)
        if (ok) anyOk = true
      }
      return anyOk
    }
    if (n.op === 'not') {
      const inner: CheckResult[] = []
      const ok = await evalNode(n.check, ctx, inner)
      const inverted = !ok
      bd.push({ kind: 'not', passed: inverted, reason: inverted ? undefined : 'inner check passed' })
      return inverted
    }
  }
  return evalLeaf(n as any, ctx, bd)
}

async function evalLeaf(n: any, ctx: AcceptanceContext, bd: CheckResult[]): Promise<boolean> {
  switch (n.kind) {
    case 'phase-completed': {
      const r = ctx.phaseResults.get(n.phase)
      const ok = !!(r && r.ok)
      bd.push({ kind: n.kind, passed: ok, reason: ok ? undefined : `phase ${n.phase} missing or failed` })
      return ok
    }
    case 'tests-pass': {
      const cmd = n.command ?? 'pnpm test'
      const r = await ctx.runCommand(cmd)
      const ok = r.exitCode === 0
      bd.push({ kind: n.kind, passed: ok, reason: ok ? undefined : `${cmd} exited ${r.exitCode}` })
      return ok
    }
    case 'lsp-clean': {
      const ok = ctx.lspErrors === 0
      bd.push({ kind: n.kind, passed: ok, reason: ok ? undefined : `${ctx.lspErrors} LSP errors` })
      return ok
    }
    case 'no-todo-in-diff': {
      const ok = !/\bTODO\b/.test(ctx.diffText)
      bd.push({ kind: n.kind, passed: ok, reason: ok ? undefined : 'diff contains TODO' })
      return ok
    }
    case 'regex-not-in-diff': {
      const ok = !new RegExp(n.pattern).test(ctx.diffText)
      bd.push({ kind: n.kind, passed: ok, reason: ok ? undefined : `diff matches /${n.pattern}/` })
      return ok
    }
    case 'agent-says': {
      const v = ctx.agentVerdicts.get(n.agent)
      const ok = v === n.verdict
      bd.push({ kind: n.kind, passed: ok, reason: ok ? undefined : `${n.agent} said '${v}' (want '${n.verdict}')` })
      return ok
    }
    case 'file-exists': {
      const p = n.path.startsWith('/') ? n.path : `${ctx.cwd}/${n.path}`
      const ok = await ctx.fileExists(p)
      bd.push({ kind: n.kind, passed: ok, reason: ok ? undefined : `${p} not found` })
      return ok
    }
  }
  bd.push({ kind: n.kind ?? 'unknown', passed: false, reason: 'unknown check' })
  return false
}
```

`packages/workflow-runtime/src/acceptance/index.ts`:
```ts
export * from './dsl'
```

- [ ] **Step 4: Run — PASS**

```bash
pnpm vitest run packages/workflow-runtime/test/unit/acceptance-dsl.test.ts
```

Expected: ~10 PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/workflow-runtime
git commit -m "feat(workflow-runtime): acceptance DSL evaluator (all/any/not + 7 leaf checks)"
```

---

## Task 5: Workflow run persistence (SQLite migration + repo)

**Files:**
- Create: `packages/workflow-runtime/src/persistence/migrations/009_workflow_runs.sql`
- Create: `packages/workflow-runtime/src/persistence/workflow-run-repo.ts`
- Test: `packages/workflow-runtime/test/unit/workflow-run-repo.test.ts`

- [ ] **Step 1: Migration SQL**

`packages/workflow-runtime/src/persistence/migrations/009_workflow_runs.sql`:
```sql
CREATE TABLE IF NOT EXISTS workflow_runs (
  id              TEXT PRIMARY KEY,           -- ULID
  session_id      TEXT NOT NULL,
  workflow_name   TEXT NOT NULL,
  workflow_source TEXT NOT NULL,              -- builtin|plugin|user
  argument        TEXT,
  status          TEXT NOT NULL,              -- pending|running|paused|failed|completed
  started_at      TEXT NOT NULL,
  ended_at        TEXT,
  current_phase   TEXT,
  iter            INTEGER NOT NULL DEFAULT 0,
  acceptance_json TEXT,                       -- final eval result JSON
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_wfruns_session ON workflow_runs(session_id, started_at);
CREATE INDEX IF NOT EXISTS idx_wfruns_status  ON workflow_runs(status);

CREATE TABLE IF NOT EXISTS workflow_phase_runs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id          TEXT NOT NULL,
  phase_id        TEXT NOT NULL,
  iter            INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL,              -- queued|running|ok|failed|skipped
  started_at      TEXT NOT NULL,
  ended_at        TEXT,
  worker_id       TEXT,
  output_blob     BLOB,                       -- truncated agent output
  artifacts_json  TEXT,                       -- JSON: file paths, agent verdict, etc.
  FOREIGN KEY (run_id) REFERENCES workflow_runs(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_wfphase_run ON workflow_phase_runs(run_id, iter);
```

- [ ] **Step 2: Failing repo test**

`packages/workflow-runtime/test/unit/workflow-run-repo.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { Database } from 'better-sqlite3'
import { openDb, runMigrations } from '@glm/core/storage'
import { WorkflowRunRepo } from '../../src/persistence/workflow-run-repo'

let dir: string; let db: Database; let repo: WorkflowRunRepo

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'glm-wfr-'))
  db = openDb(path.join(dir, 's.db'))
  runMigrations(db)
  // P1 migrations already create `sessions`; this repo's migration adds workflow_runs
  repo = new WorkflowRunRepo(db)
  repo.applyMigration()
  db.prepare(`INSERT INTO sessions (id, created_at, updated_at, cwd, worktree, active) VALUES ('s1','t','t','/x','/x',1)`).run()
})
afterEach(() => { db.close(); rmSync(dir, { recursive: true, force: true }) })

describe('WorkflowRunRepo', () => {
  test('start + update + complete round-trip', () => {
    const run = repo.start({ sessionId: 's1', workflowName: 'autopilot', workflowSource: 'builtin', argument: 'build X' })
    expect(run.status).toBe('running')
    repo.recordPhase(run.id, { phaseId: 'analyst', iter: 0, status: 'ok', startedAt: 't', endedAt: 't' })
    repo.recordPhase(run.id, { phaseId: 'planner', iter: 0, status: 'ok', startedAt: 't', endedAt: 't' })
    repo.complete(run.id, { passed: true, breakdown: [] })
    const got = repo.get(run.id)!
    expect(got.status).toBe('completed')
    expect(repo.listPhases(run.id)).toHaveLength(2)
  })

  test('listResumable returns paused/failed runs', () => {
    const a = repo.start({ sessionId: 's1', workflowName: 'ralph', workflowSource: 'builtin' })
    const b = repo.start({ sessionId: 's1', workflowName: 'plan',  workflowSource: 'builtin' })
    repo.fail(a.id, 'crash')
    repo.complete(b.id, { passed: true, breakdown: [] })
    const r = repo.listResumable('s1')
    expect(r.map(x => x.id)).toEqual([a.id])
  })

  test('pause + resume transitions status', () => {
    const a = repo.start({ sessionId: 's1', workflowName: 'ultrawork', workflowSource: 'builtin' })
    repo.pause(a.id, 'analyst')
    expect(repo.get(a.id)!.status).toBe('paused')
    expect(repo.get(a.id)!.currentPhase).toBe('analyst')
    repo.markRunning(a.id)
    expect(repo.get(a.id)!.status).toBe('running')
  })
})
```

- [ ] **Step 3: Run — FAIL**

- [ ] **Step 4: Implement repo**

`packages/workflow-runtime/src/persistence/workflow-run-repo.ts`:
```ts
import type { Database } from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ulid } from '@glm/shared'

const HERE = dirname(fileURLToPath(import.meta.url))

export type RunStatus = 'pending' | 'running' | 'paused' | 'failed' | 'completed'

export interface RunRow {
  id: string
  sessionId: string
  workflowName: string
  workflowSource: 'builtin' | 'plugin' | 'user'
  argument: string | null
  status: RunStatus
  startedAt: string
  endedAt: string | null
  currentPhase: string | null
  iter: number
  acceptanceJson: string | null
}

export interface PhaseRow {
  id: number
  runId: string
  phaseId: string
  iter: number
  status: 'queued' | 'running' | 'ok' | 'failed' | 'skipped'
  startedAt: string
  endedAt: string | null
  workerId: string | null
  outputBlob: Buffer | null
  artifactsJson: string | null
}

export class WorkflowRunRepo {
  constructor(private db: Database) {}

  applyMigration() {
    const sql = readFileSync(join(HERE, 'migrations', '009_workflow_runs.sql'), 'utf8')
    this.db.exec(sql)
  }

  start(input: { sessionId: string; workflowName: string; workflowSource: 'builtin'|'plugin'|'user'; argument?: string }): RunRow {
    const id = ulid()
    const now = new Date().toISOString()
    this.db.prepare(`INSERT INTO workflow_runs (id, session_id, workflow_name, workflow_source, argument, status, started_at, iter) VALUES (?, ?, ?, ?, ?, 'running', ?, 0)`)
      .run(id, input.sessionId, input.workflowName, input.workflowSource, input.argument ?? null, now)
    return this.get(id)!
  }

  recordPhase(runId: string, p: { phaseId: string; iter: number; status: PhaseRow['status']; startedAt: string; endedAt: string; workerId?: string; output?: string; artifacts?: any }) {
    this.db.prepare(`INSERT INTO workflow_phase_runs (run_id, phase_id, iter, status, started_at, ended_at, worker_id, output_blob, artifacts_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(runId, p.phaseId, p.iter, p.status, p.startedAt, p.endedAt, p.workerId ?? null,
           p.output ? Buffer.from(p.output) : null,
           p.artifacts ? JSON.stringify(p.artifacts) : null)
  }

  pause(runId: string, phase: string) {
    this.db.prepare(`UPDATE workflow_runs SET status='paused', current_phase=? WHERE id=?`).run(phase, runId)
  }

  markRunning(runId: string) {
    this.db.prepare(`UPDATE workflow_runs SET status='running' WHERE id=?`).run(runId)
  }

  fail(runId: string, _reason: string) {
    this.db.prepare(`UPDATE workflow_runs SET status='failed', ended_at=? WHERE id=?`).run(new Date().toISOString(), runId)
  }

  complete(runId: string, acceptance: any) {
    this.db.prepare(`UPDATE workflow_runs SET status='completed', ended_at=?, acceptance_json=? WHERE id=?`)
      .run(new Date().toISOString(), JSON.stringify(acceptance), runId)
  }

  get(id: string): RunRow | undefined {
    const r = this.db.prepare(`SELECT * FROM workflow_runs WHERE id=?`).get(id) as any
    return r ? rowToRun(r) : undefined
  }

  listResumable(sessionId: string): RunRow[] {
    return (this.db.prepare(`SELECT * FROM workflow_runs WHERE session_id=? AND status IN ('paused','failed') ORDER BY started_at DESC`).all(sessionId) as any[]).map(rowToRun)
  }

  listPhases(runId: string): PhaseRow[] {
    return (this.db.prepare(`SELECT * FROM workflow_phase_runs WHERE run_id=? ORDER BY id ASC`).all(runId) as any[]).map(rowToPhase)
  }
}

function rowToRun(r: any): RunRow {
  return { id: r.id, sessionId: r.session_id, workflowName: r.workflow_name, workflowSource: r.workflow_source, argument: r.argument, status: r.status, startedAt: r.started_at, endedAt: r.ended_at, currentPhase: r.current_phase, iter: r.iter, acceptanceJson: r.acceptance_json }
}
function rowToPhase(r: any): PhaseRow {
  return { id: r.id, runId: r.run_id, phaseId: r.phase_id, iter: r.iter, status: r.status, startedAt: r.started_at, endedAt: r.ended_at, workerId: r.worker_id, outputBlob: r.output_blob, artifactsJson: r.artifacts_json }
}
```

- [ ] **Step 5: Run — PASS**

```bash
pnpm vitest run packages/workflow-runtime/test/unit/workflow-run-repo.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add packages/workflow-runtime
git commit -m "feat(workflow-runtime): SQLite persistence (workflow_runs + workflow_phase_runs) + repo CRUD"
```

---

## Task 6: Workflow runner core (sequential + pipeline handoff)

**Files:**
- Create: `packages/workflow-runtime/src/handoff.ts`
- Create: `packages/workflow-runtime/src/events.ts`
- Create: `packages/workflow-runtime/src/runner.ts`
- Test: `packages/workflow-runtime/test/unit/handoff.test.ts`
- Test: `packages/workflow-runtime/test/integration/runner-basic.test.ts`

- [ ] **Step 1: Handoff types + reducer**

`packages/workflow-runtime/src/handoff.ts`:
```ts
export interface PhaseResult {
  phaseId: string
  ok: boolean
  workerId?: string
  output?: string
  artifacts?: Record<string, unknown>
  verdict?: string                   // for agents that produce one ("pass"/"block"/...)
  agentName?: string
}

export interface RunState {
  cwd: string
  argument: string
  phaseResults: Map<string, PhaseResult>
  agentVerdicts: Map<string, string>
  scratchpad: Record<string, unknown>
}

export function makeInitialState(cwd: string, argument: string): RunState {
  return { cwd, argument, phaseResults: new Map(), agentVerdicts: new Map(), scratchpad: {} }
}

export function applyPhase(state: RunState, r: PhaseResult): RunState {
  state.phaseResults.set(r.phaseId, r)
  if (r.agentName && r.verdict) state.agentVerdicts.set(r.agentName, r.verdict)
  return state
}
```

- [ ] **Step 2: Event types**

`packages/workflow-runtime/src/events.ts`:
```ts
export type WorkflowEvent =
  | { type: 'WorkflowRunStarted';  runId: string; workflow: string; argument: string }
  | { type: 'PhaseStarted';        runId: string; phaseId: string; iter: number; agent?: string; workerId?: string }
  | { type: 'PhaseCompleted';      runId: string; phaseId: string; iter: number; ok: boolean; output?: string }
  | { type: 'AcceptanceEvaluated'; runId: string; passed: boolean; breakdown: { kind: string; passed: boolean; reason?: string }[] }
  | { type: 'WorkflowRunPaused';   runId: string; phaseId: string; reason: string }
  | { type: 'WorkflowRunFailed';   runId: string; reason: string }
  | { type: 'WorkflowRunCompleted';runId: string }

export type EventSink = (e: WorkflowEvent) => void
```

- [ ] **Step 3: Handoff unit test**

`packages/workflow-runtime/test/unit/handoff.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { makeInitialState, applyPhase } from '../../src/handoff'

describe('handoff', () => {
  test('applyPhase records result + verdict', () => {
    const s = makeInitialState('/x', 'task')
    applyPhase(s, { phaseId: 'p', ok: true, agentName: 'verifier', verdict: 'pass', output: 'ok' })
    expect(s.phaseResults.get('p')!.ok).toBe(true)
    expect(s.agentVerdicts.get('verifier')).toBe('pass')
  })

  test('later phase overwrites prior result with same id', () => {
    const s = makeInitialState('/x', 'task')
    applyPhase(s, { phaseId: 'p', ok: false })
    applyPhase(s, { phaseId: 'p', ok: true })
    expect(s.phaseResults.get('p')!.ok).toBe(true)
  })
})
```

- [ ] **Step 4: Runner implementation (sequential / pipeline / parallel-fanout)**

`packages/workflow-runtime/src/runner.ts`:
```ts
import { ulid } from '@glm/shared'
import type { Orchestrator, Scheduler, AgentRequest, AgentResponse } from '@glm/orchestrator'
import type { WorkflowDef, Phase } from './schema'
import { makeInitialState, applyPhase, type RunState, type PhaseResult } from './handoff'
import { evaluateAcceptance, type AcceptanceContext } from './acceptance/dsl'
import { WorkflowRunRepo } from './persistence/workflow-run-repo'
import type { EventSink, WorkflowEvent } from './events'

export interface RunnerOpts {
  cwd: string
  sessionId: string
  orchestrator: Orchestrator
  scheduler: Scheduler
  repo: WorkflowRunRepo
  emit: EventSink
  resolveWorkflow: (name: string) => Promise<WorkflowDef | undefined>
  runCommand: (cmd: string) => Promise<{ exitCode: number; stdout: string; stderr: string }>
  fileExists: (p: string) => Promise<boolean>
  getDiff: () => Promise<string>
  getLspErrorCount: () => Promise<number>
}

export class WorkflowRunner {
  constructor(private o: RunnerOpts) {}

  async run(def: WorkflowDef, argument: string, opts: { resumeRunId?: string } = {}): Promise<{ runId: string; passed: boolean }> {
    const runId = opts.resumeRunId ?? this.o.repo.start({ sessionId: this.o.sessionId, workflowName: def.name, workflowSource: def.source, argument }).id
    if (opts.resumeRunId) this.o.repo.markRunning(runId)
    this.o.emit({ type: 'WorkflowRunStarted', runId, workflow: def.name, argument })

    const state = makeInitialState(this.o.cwd, argument)

    // For resume, replay prior phases into state from DB
    if (opts.resumeRunId) {
      for (const ph of this.o.repo.listPhases(opts.resumeRunId)) {
        if (ph.status === 'ok') {
          applyPhase(state, {
            phaseId: ph.phaseId, ok: true,
            output: ph.outputBlob?.toString('utf8'),
            artifacts: ph.artifactsJson ? JSON.parse(ph.artifactsJson) : undefined,
          })
        }
      }
    }

    try {
      switch (def.handoffPolicy) {
        case 'sequential':
        case 'pipeline':
          await this.runSequential(def, state, runId)
          break
        case 'parallel-fanout':
          await this.runFanout(def, state, runId)
          break
        case 'persistence-loop':
          await this.runPersistenceLoop(def, state, runId)
          break
        case 'consensus':
          await this.runConsensus(def, state, runId)
          break
        case 'peer-team':
          await this.runPeerTeam(def, state, runId)
          break
        case 'tournament':
          await this.runTournament(def, state, runId)
          break
      }
    } catch (err) {
      this.o.repo.fail(runId, String(err))
      this.o.emit({ type: 'WorkflowRunFailed', runId, reason: String(err) })
      throw err
    }

    const acc = await this.evaluate(def, state, runId)
    this.o.emit({ type: 'AcceptanceEvaluated', runId, passed: acc.passed, breakdown: acc.breakdown })
    this.o.repo.complete(runId, acc)
    this.o.emit({ type: 'WorkflowRunCompleted', runId })
    return { runId, passed: acc.passed }
  }

  private async runSequential(def: WorkflowDef, state: RunState, runId: string) {
    for (let i = 0; i < def.phases.length; i++) {
      const ph = def.phases[i]!
      if (state.phaseResults.get(ph.id)?.ok) continue   // resume skip
      const r = await this.runPhase(def, ph, state, runId, 0)
      applyPhase(state, r)
      if (!r.ok && ph.onFail !== 'next') {
        if (ph.onFail === 'goto' && ph.gotoPhase) {
          const target = def.phases.findIndex(p => p.id === ph.gotoPhase)
          if (target >= 0) { i = target - 1; continue }
        }
        this.o.repo.pause(runId, ph.id)
        this.o.emit({ type: 'WorkflowRunPaused', runId, phaseId: ph.id, reason: 'phase-failed' })
        throw new Error(`phase ${ph.id} failed`)
      }
    }
  }

  private async runFanout(def: WorkflowDef, state: RunState, runId: string) {
    for (const ph of def.phases) {
      const width = ph.parallel ?? 1
      const tasks = Array.from({ length: width }, (_, k) => this.runPhase(def, ph, state, runId, 0, k))
      const results = await Promise.all(tasks)
      // merge: store the best (ok=true if any) and a synthesized output
      const ok = results.some(r => r.ok)
      applyPhase(state, {
        phaseId: ph.id, ok, output: results.map(r => r.output ?? '').join('\n---\n'),
        artifacts: { variants: results.map(r => r.artifacts ?? {}) },
        agentName: ph.agent, verdict: ok ? 'pass' : 'fail',
      })
    }
  }

  private async runPersistenceLoop(def: WorkflowDef, state: RunState, runId: string) {
    const maxIter = def.maxIter ?? 5
    for (let iter = 0; iter < maxIter; iter++) {
      for (const ph of def.phases) {
        const r = await this.runPhase(def, ph, state, runId, iter)
        applyPhase(state, r)
      }
      const acc = await this.evaluate(def, state, runId)
      if (acc.passed) return
      // else continue another iteration
    }
  }

  private async runConsensus(def: WorkflowDef, state: RunState, runId: string) {
    // RALPLAN-DR: iterate Planner+Architect+Critic up to maxIter; agreement when critic verdict='approve'
    const maxIter = def.maxIter ?? 5
    for (let iter = 0; iter < maxIter; iter++) {
      for (const ph of def.phases) {
        const r = await this.runPhase(def, ph, state, runId, iter)
        applyPhase(state, r)
      }
      const critic = state.agentVerdicts.get('critic')
      if (critic === 'approve' || critic === 'pass') return
    }
  }

  private async runPeerTeam(def: WorkflowDef, state: RunState, runId: string) {
    // All phases (= peers) run concurrently; they share state via scratchpad (shared-memory in real run)
    const tasks = def.phases.map(ph => this.runPhase(def, ph, state, runId, 0))
    const results = await Promise.all(tasks)
    for (const r of results) applyPhase(state, r)
  }

  private async runTournament(def: WorkflowDef, state: RunState, runId: string) {
    // Each phase = a variant; spawn parallel.width, pick highest agent-score
    for (const ph of def.phases) {
      const width = ph.parallel ?? 3
      const tasks = Array.from({ length: width }, (_, k) => this.runPhase(def, ph, state, runId, 0, k))
      const results = await Promise.all(tasks)
      // pick variant where agent-says verdict='best' first; else first ok
      const winner = results.find(r => r.verdict === 'best') ?? results.find(r => r.ok) ?? results[0]
      applyPhase(state, { ...winner, phaseId: ph.id })
    }
  }

  private async runPhase(def: WorkflowDef, ph: Phase, state: RunState, runId: string, iter: number, variantIndex?: number): Promise<PhaseResult> {
    const startedAt = new Date().toISOString()
    const workerId = `${ph.id}-${iter}-${variantIndex ?? 0}-${ulid().slice(-6)}`
    this.o.emit({ type: 'PhaseStarted', runId, phaseId: ph.id, iter, agent: ph.agent, workerId })

    let result: PhaseResult
    if (ph.workflow) {
      const sub = await this.o.resolveWorkflow(ph.workflow)
      if (!sub) throw new Error(`sub-workflow not found: ${ph.workflow}`)
      const sr = await this.run(sub, state.argument, {})
      result = { phaseId: ph.id, ok: sr.passed, output: `sub-workflow ${ph.workflow}=${sr.passed}` }
    } else {
      const req: AgentRequest = {
        agent: ph.agent!, model: ph.model, thinking: ph.thinking,
        argument: state.argument, cwd: state.cwd,
        priorPhases: Array.from(state.phaseResults.values()),
        prompt: ph.promptTemplate,
      }
      const slot = await this.o.scheduler.reserve({ model: ph.model ?? 'GLM-5.1', agent: ph.agent! })
      try {
        const resp: AgentResponse = await this.o.orchestrator.runAgent(req)
        result = {
          phaseId: ph.id, ok: resp.ok,
          workerId, output: resp.output, artifacts: resp.artifacts,
          agentName: ph.agent, verdict: resp.verdict,
        }
      } finally { this.o.scheduler.release(slot) }
    }

    this.o.repo.recordPhase(runId, {
      phaseId: ph.id, iter, status: result.ok ? 'ok' : 'failed',
      startedAt, endedAt: new Date().toISOString(), workerId,
      output: result.output, artifacts: result.artifacts,
    })
    this.o.emit({ type: 'PhaseCompleted', runId, phaseId: ph.id, iter, ok: result.ok, output: result.output })

    // per-phase acceptance gate
    if (ph.acceptance) {
      const acc = await this.evaluateNode(ph.acceptance, state)
      if (!acc.passed) result.ok = false
    }
    return result
  }

  private async evaluate(def: WorkflowDef, state: RunState, _runId: string) {
    return this.evaluateNode(def.acceptance, state)
  }
  private async evaluateNode(node: any, state: RunState) {
    const ctx: AcceptanceContext = {
      runId: '-', cwd: state.cwd,
      phaseResults: state.phaseResults,
      agentVerdicts: state.agentVerdicts,
      diffText: await this.o.getDiff(),
      lspErrors: await this.o.getLspErrorCount(),
      runCommand: this.o.runCommand,
      fileExists: this.o.fileExists,
    }
    return evaluateAcceptance(node, ctx)
  }
}
```

- [ ] **Step 5: Integration test — basic sequential run with mocked orchestrator/scheduler**

`packages/workflow-runtime/test/integration/runner-basic.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { Database } from 'better-sqlite3'
import { openDb, runMigrations } from '@glm/core/storage'
import { WorkflowRunRepo } from '../../src/persistence/workflow-run-repo'
import { WorkflowRunner } from '../../src/runner'
import type { WorkflowDef } from '../../src/schema'

let dir: string; let db: Database

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'glm-rn-'))
  db = openDb(path.join(dir, 's.db'))
  runMigrations(db)
  db.prepare(`INSERT INTO sessions (id,created_at,updated_at,cwd,worktree,active) VALUES ('s1','t','t','/x','/x',1)`).run()
})
afterEach(() => { db.close(); rmSync(dir, { recursive: true, force: true }) })

const def: WorkflowDef = {
  name: 'tiny', description: 't', level: 2, triggerKeywords: [],
  phases: [
    { id: 'plan', agent: 'planner' },
    { id: 'exec', agent: 'executor', inputsFromPhase: 'plan' },
  ],
  handoffPolicy: 'sequential',
  acceptance: { op: 'all', checks: [{ kind: 'phase-completed', phase: 'exec' }] },
  source: 'builtin',
}

describe('WorkflowRunner basic', () => {
  test('runs all phases sequentially and evaluates acceptance', async () => {
    const repo = new WorkflowRunRepo(db); repo.applyMigration()
    const orchestrator = { runAgent: vi.fn(async (req: any) => ({ ok: true, output: `out-${req.agent}`, verdict: 'pass' })) } as any
    const scheduler = { reserve: vi.fn(async () => ({})), release: vi.fn() } as any

    const runner = new WorkflowRunner({
      cwd: dir, sessionId: 's1',
      orchestrator, scheduler, repo,
      emit: () => {},
      resolveWorkflow: async () => undefined,
      runCommand: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
      fileExists: async () => true,
      getDiff: async () => '',
      getLspErrorCount: async () => 0,
    })

    const r = await runner.run(def, 'build X')
    expect(r.passed).toBe(true)
    expect(orchestrator.runAgent).toHaveBeenCalledTimes(2)
    expect(repo.listPhases(r.runId)).toHaveLength(2)
  })

  test('records failed phase + pauses run', async () => {
    const repo = new WorkflowRunRepo(db); repo.applyMigration()
    const orchestrator = { runAgent: vi.fn()
      .mockResolvedValueOnce({ ok: true, output: 'p', verdict: 'pass' })
      .mockResolvedValueOnce({ ok: false, output: 'crash', verdict: 'fail' })
    } as any
    const scheduler = { reserve: async () => ({}), release: () => {} } as any
    const runner = new WorkflowRunner({
      cwd: dir, sessionId: 's1', orchestrator, scheduler, repo,
      emit: () => {},
      resolveWorkflow: async () => undefined,
      runCommand: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
      fileExists: async () => true, getDiff: async () => '', getLspErrorCount: async () => 0,
    })
    await expect(runner.run(def, 'X')).rejects.toThrow(/phase exec failed/)
    const rs = repo.listResumable('s1')
    expect(rs).toHaveLength(1)
    expect(rs[0].currentPhase).toBe('exec')
  })
})
```

- [ ] **Step 6: Run unit + integration — PASS**

```bash
pnpm vitest run packages/workflow-runtime/test/
```

- [ ] **Step 7: Commit**

```bash
git add packages/workflow-runtime
git commit -m "feat(workflow-runtime): core runner with 6 handoff policies + pause/resume bookkeeping"
```

---

## Task 6.5: Wire WorkflowRunner to Orchestrator + Scheduler (P9-Fix-3)

**Files:**
- Create: `packages/workflow-runtime/src/binding.ts`
- Test: `packages/workflow-runtime/test/integration/runner-orchestrator-binding.test.ts`

The `WorkflowRunner` in Task 6 declares `Orchestrator` + `Scheduler` as injectable opts (`@glm/orchestrator` types). Task 6.5 supplies the **real** binding that constructs a runner from the concrete P8 `Orchestrator` + `ModelScheduler` instances (both exported from `@glm/agents`) and registers it as a daemon subsystem via LoaderHub (per §0.9). This is the single seam between the workflow lane and the model-routing/agent-execution lane delivered by P8.

- [ ] **Step 1: Binding factory**

`packages/workflow-runtime/src/binding.ts`:
```ts
import { LoaderHub } from '@glm/core/daemon/loader-hub'
import { Orchestrator, ModelScheduler } from '@glm/agents'
import { WorkflowRunner, type RunnerOpts } from './runner'
import type { WorkflowDef, Phase } from './schema'
import type { RunState, PhaseResult } from './handoff'
import type { WorkflowRunRepo } from './persistence/workflow-run-repo'
import type { EventSink } from './events'

export interface BindingOpts {
  cwd: string
  sessionId: string
  repo: WorkflowRunRepo
  emit: EventSink
  resolveWorkflow: (name: string) => Promise<WorkflowDef | undefined>
  runCommand: RunnerOpts['runCommand']
  fileExists: RunnerOpts['fileExists']
  getDiff: RunnerOpts['getDiff']
  getLspErrorCount: RunnerOpts['getLspErrorCount']
}

/**
 * Build a WorkflowRunner wired against the real P8 Orchestrator + ModelScheduler.
 * The runner.runPhase contract maps directly onto:
 *   - phase.agent      → scheduler.dispatch({ task, model: agent.model }) → orchestrator.runAgent(req)
 *   - phase.workflow   → recursive runner.run(sub-workflow)
 *   - phase.parallel   → Promise.all([...]) inside runFanout (already implemented in Task 6)
 */
export function makeBoundRunner(opts: BindingOpts & {
  orchestrator: Orchestrator
  scheduler: ModelScheduler
}): WorkflowRunner {
  return new WorkflowRunner({
    cwd: opts.cwd,
    sessionId: opts.sessionId,
    orchestrator: opts.orchestrator,
    scheduler: opts.scheduler,
    repo: opts.repo,
    emit: opts.emit,
    resolveWorkflow: opts.resolveWorkflow,
    runCommand: opts.runCommand,
    fileExists: opts.fileExists,
    getDiff: opts.getDiff,
    getLspErrorCount: opts.getLspErrorCount,
  })
}

/**
 * Register the workflow runtime as a daemon subsystem. P8 must have already
 * registered its 'orchestrator' subsystem so that daemon.orchestrator + daemon.scheduler
 * are populated by the time this init runs. LoaderHub.runAll guarantees ordering
 * per registration order; P9 imports this module after `@glm/agents`.
 */
export function registerWorkflowRunnerSubsystem(): void {
  LoaderHub.registerSubsystem('workflow-runner', async (daemon) => {
    // daemon.orchestrator + daemon.scheduler are populated by P8's 'orchestrator' subsystem
    if (!daemon.orchestrator || !daemon.scheduler) {
      throw new Error('workflow-runner: orchestrator/scheduler not initialised — P8 subsystem must load first')
    }
    daemon.workflowRunnerFactory = (sessionId: string, ctx: BindingOpts) =>
      makeBoundRunner({ ...ctx, orchestrator: daemon.orchestrator!, scheduler: daemon.scheduler! })
  })
}
```

- [ ] **Step 2: Integration test — runner reaches the real orchestrator surface**

`packages/workflow-runtime/test/integration/runner-orchestrator-binding.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { openDb, runMigrations } from '@glm/core/storage'
import { WorkflowRunRepo } from '../../src/persistence/workflow-run-repo'
import { makeBoundRunner } from '../../src/binding'
import type { WorkflowDef } from '../../src/schema'

let dir: string

beforeEach(() => { dir = mkdtempSync(path.join(os.tmpdir(), 'glm-bind-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

const def: WorkflowDef = {
  name: 'bind', description: 'b', level: 2, triggerKeywords: [],
  phases: [{ id: 'exec', agent: 'executor', model: 'GLM-5.1' }],
  handoffPolicy: 'sequential',
  acceptance: { op: 'all', checks: [{ kind: 'phase-completed', phase: 'exec' }] },
  source: 'builtin',
}

describe('runner ↔ orchestrator binding (P9-Fix-3)', () => {
  test('phase.agent dispatches through scheduler then orchestrator.runAgent', async () => {
    const db = openDb(path.join(dir, 's.db'))
    runMigrations(db)
    db.prepare(`INSERT INTO sessions (id,created_at,updated_at,cwd,worktree,active) VALUES ('s1','t','t','/x','/x',1)`).run()

    const repo = new WorkflowRunRepo(db); repo.applyMigration()
    const orchestrator = { runAgent: vi.fn(async (req: any) => ({ ok: true, output: `out-${req.agent}`, verdict: 'pass' })) } as any
    const scheduler = { reserve: vi.fn(async (s: any) => s), release: vi.fn(), dispatch: vi.fn() } as any

    const runner = makeBoundRunner({
      cwd: dir, sessionId: 's1', repo,
      emit: () => {},
      resolveWorkflow: async () => undefined,
      runCommand: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
      fileExists: async () => true,
      getDiff: async () => '',
      getLspErrorCount: async () => 0,
      orchestrator, scheduler,
    })
    const r = await runner.run(def, 'task X')
    expect(r.passed).toBe(true)
    expect(scheduler.reserve).toHaveBeenCalledWith(expect.objectContaining({ model: 'GLM-5.1', agent: 'executor' }))
    expect(orchestrator.runAgent).toHaveBeenCalledWith(expect.objectContaining({ agent: 'executor', model: 'GLM-5.1' }))
    expect(scheduler.release).toHaveBeenCalledTimes(1)
    db.close()
  })
})
```

- [ ] **Step 3: Run — PASS**

```bash
pnpm vitest run packages/workflow-runtime/test/integration/runner-orchestrator-binding.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add packages/workflow-runtime
git commit -m "feat(workflow-runtime): bind WorkflowRunner to P8 Orchestrator + ModelScheduler via LoaderHub"
```

---

## Task 7: Golden-replay test harness (mock orchestrator from JSONL fixtures)

**Files:**
- Create: `packages/workflow-runtime/src/llm-mock/golden-replay.ts`
- Test: `packages/workflow-runtime/test/unit/golden-replay.test.ts`

The harness lets each workflow declare a canned conversation in `__fixtures__/llm/<name>.jsonl` where each line is `{phaseId, agent, response}`. The mock orchestrator returns those responses in declared order — same flow real LLM would take but deterministic. Workflows can be regression-tested without GLM API access.

- [ ] **Step 1: Failing test**

`packages/workflow-runtime/test/unit/golden-replay.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { GoldenReplayOrchestrator } from '../../src/llm-mock/golden-replay'

describe('GoldenReplayOrchestrator', () => {
  test('returns responses by (phaseId, agent) keying', async () => {
    const o = new GoldenReplayOrchestrator([
      { phaseId: 'plan', agent: 'planner',  response: { ok: true, output: 'P', verdict: 'done' } },
      { phaseId: 'exec', agent: 'executor', response: { ok: true, output: 'E', verdict: 'pass' } },
    ])
    expect((await o.runAgent({ phaseId: 'plan', agent: 'planner' } as any)).output).toBe('P')
    expect((await o.runAgent({ phaseId: 'exec', agent: 'executor' } as any)).output).toBe('E')
  })

  test('falls back to agent-only match if phaseId not declared', async () => {
    const o = new GoldenReplayOrchestrator([
      { agent: 'verifier', response: { ok: true, output: 'V', verdict: 'pass' } },
    ])
    const r = await o.runAgent({ phaseId: 'whatever', agent: 'verifier' } as any)
    expect(r.output).toBe('V')
  })

  test('throws on unmatched call', async () => {
    const o = new GoldenReplayOrchestrator([])
    await expect(o.runAgent({ phaseId: 'p', agent: 'planner' } as any)).rejects.toThrow(/no golden fixture/)
  })
})
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement harness**

`packages/workflow-runtime/src/llm-mock/golden-replay.ts`:
```ts
import { readFile } from 'node:fs/promises'

export interface GoldenEntry {
  phaseId?: string
  agent?: string
  iter?: number
  response: {
    ok: boolean
    output: string
    verdict?: string
    artifacts?: Record<string, unknown>
  }
}

export class GoldenReplayOrchestrator {
  private callIdx = 0
  constructor(private entries: GoldenEntry[]) {}

  static async fromFile(p: string): Promise<GoldenReplayOrchestrator> {
    const raw = await readFile(p, 'utf8')
    const entries = raw.split('\n').filter(Boolean).map(l => JSON.parse(l) as GoldenEntry)
    return new GoldenReplayOrchestrator(entries)
  }

  async runAgent(req: { phaseId?: string; agent: string; [k: string]: any }) {
    // exact (phase+agent) → agent-only → first unconsumed
    let e = this.entries.find(x => x.phaseId === req.phaseId && x.agent === req.agent)
      ?? this.entries.find(x => !x.phaseId && x.agent === req.agent)
      ?? this.entries[this.callIdx++]
    if (!e) throw new Error(`no golden fixture for phase=${req.phaseId} agent=${req.agent}`)
    return e.response
  }
}

export class NoopScheduler {
  async reserve() { return {} }
  release() {}
}
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/workflow-runtime
git commit -m "test(workflow-runtime): golden-replay orchestrator for deterministic workflow integration tests"
```

---

## Task 8: CLI surface — `glm workflow <subcmd>` + per-workflow aliases

**Files:**
- Create: `packages/cli/src/commands/workflow.ts`
- Modify: `packages/cli/src/bin.ts` to register the new commands
- Test: `packages/cli/test/integration/workflow-cli.test.ts`

- [ ] **Step 1: Failing CLI test (uses daemon helper from P1)**

`packages/cli/test/integration/workflow-cli.test.ts`:
```ts
import { describe, expect, test, beforeAll, afterAll } from 'vitest'
import { spawnDaemonProcess } from '../../../core/test/integration/_helper'
import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
const pExec = promisify(execFile)
const bin = path.join(__dirname, '..', '..', 'dist', 'bin.js')

let d: Awaited<ReturnType<typeof spawnDaemonProcess>>
beforeAll(async () => { d = await spawnDaemonProcess({}) })
afterAll(async () => { await d.shutdown() })

describe('glm workflow CLI', () => {
  test('list prints 14 built-in workflows', async () => {
    const { stdout } = await pExec('node', [bin, 'workflow', 'list'], { env: { ...process.env, GLM_HOME: d.home } })
    for (const n of ['autopilot','ralph','ultrawork','team','plan','ralplan','deep-dive','trace','ultraqa','self-improve','debug','verify','critic','skillify']) {
      expect(stdout).toContain(n)
    }
  })

  test('info prints frontmatter + phases for autopilot', async () => {
    const { stdout } = await pExec('node', [bin, 'workflow', 'info', 'autopilot'], { env: { ...process.env, GLM_HOME: d.home } })
    expect(stdout).toMatch(/level: 4/)
    expect(stdout).toMatch(/analyst/)
    expect(stdout).toMatch(/handoff-policy: pipeline/)
  })

  test('glm autopilot is an alias for `workflow run autopilot`', async () => {
    // smoke: --dry-run just resolves + validates, no LLM call
    const { stdout } = await pExec('node', [bin, 'autopilot', '--dry-run', 'build me X'], { env: { ...process.env, GLM_HOME: d.home } })
    expect(stdout).toMatch(/would run autopilot with argument "build me X"/)
  })
})
```

- [ ] **Step 2: Implement `commands/workflow.ts`**

`packages/cli/src/commands/workflow.ts`:
```ts
import { Command } from 'commander'
import kleur from 'kleur'
import { resolvePaths } from '@glm/shared'
import { RpcClient } from '@glm/core/rpc'

export function workflowCommand(): Command {
  const cmd = new Command('workflow').description('Manage built-in + plugin + user workflows')
  cmd.command('list')
    .description('List all available workflows (cascade resolved)')
    .action(async () => {
      const c = await connect()
      const rows = await c.call('workflow.list', {}) as any[]
      for (const r of rows) {
        console.log(`${kleur.cyan(r.name.padEnd(14))} L${r.level}  ${kleur.dim(r.source.padEnd(7))}  ${r.description}`)
      }
      c.close()
    })

  cmd.command('info <name>')
    .description('Show frontmatter + phases + acceptance for a workflow')
    .action(async (name: string) => {
      const c = await connect()
      const w = await c.call('workflow.info', { name }) as any
      if (!w) { console.error(kleur.red(`not found: ${name}`)); process.exit(1) }
      console.log(`name: ${w.name}`)
      console.log(`description: ${w.description}`)
      console.log(`level: ${w.level}`)
      console.log(`handoff-policy: ${w.handoffPolicy}`)
      console.log(`source: ${w.source} (${w.sourcePath ?? ''})`)
      console.log('phases:')
      for (const p of w.phases) console.log(`  - ${p.id}: agent=${p.agent ?? '-'} workflow=${p.workflow ?? '-'} parallel=${p.parallel ?? 1}`)
      console.log('acceptance:')
      console.log(JSON.stringify(w.acceptance, null, 2).split('\n').map(l => '  '+l).join('\n'))
      c.close()
    })

  cmd.command('run <name> [args...]')
    .description('Run a workflow by name')
    .option('--dry-run', 'validate only, do not call LLM')
    .option('--max-iter <n>', 'override workflow.maxIter (ralph/ralplan/self-improve)', parseInt)
    .action(async (name: string, args: string[], opts: any) => {
      const c = await connect()
      const argument = args.join(' ')
      if (opts.dryRun) {
        console.log(`would run ${name} with argument "${argument}"`)
        c.close(); return
      }
      const res = await c.call('workflow.run', { name, argument, maxIter: opts.maxIter }) as any
      console.log(`run ${res.runId} → ${res.passed ? kleur.green('PASSED') : kleur.red('FAILED')}`)
      c.close()
    })

  cmd.command('resume <runId>')
    .description('Resume a paused or failed workflow run')
    .action(async (runId: string) => {
      const c = await connect()
      const res = await c.call('workflow.resume', { runId }) as any
      console.log(`resumed ${runId} → ${res.passed ? kleur.green('PASSED') : kleur.red('FAILED')}`)
      c.close()
    })

  return cmd
}

async function connect(): Promise<RpcClient> {
  const paths = resolvePaths()
  const c = new RpcClient(paths.socket)
  await c.connect()
  return c
}

/**
 * Generate per-workflow aliases (`glm autopilot ...`). Called from bin.ts.
 * Each is sugar for `glm workflow run <name>`.
 */
export function registerWorkflowAliases(program: Command) {
  const names = ['autopilot','ralph','ultrawork','team','plan','ralplan','deep-dive','trace','ultraqa','self-improve','debug','verify','critic','skillify']
  for (const n of names) {
    program.command(`${n} [args...]`)
      .description(`Alias: workflow run ${n}`)
      .option('--dry-run', 'validate only')
      .option('--max-iter <n>', 'iteration cap', parseInt)
      .action(async (args: string[], opts: any) => {
        // delegate to workflow.run
        const c = await connect()
        const argument = (args ?? []).join(' ')
        if (opts.dryRun) { console.log(`would run ${n} with argument "${argument}"`); c.close(); return }
        const res = await c.call('workflow.run', { name: n, argument, maxIter: opts.maxIter }) as any
        console.log(`run ${res.runId} → ${res.passed ? 'PASSED' : 'FAILED'}`)
        c.close()
      })
  }
}
```

- [ ] **Step 3: Wire into `bin.ts`**

In `packages/cli/src/bin.ts`:
```ts
import { workflowCommand, registerWorkflowAliases } from './commands/workflow'
// ...
program.addCommand(workflowCommand())
registerWorkflowAliases(program)
```

- [ ] **Step 4: Daemon-side RPC methods**

`packages/core/src/rpc/methods/workflow.ts` (new):
```ts
import type { Daemon } from '../../daemon/daemon'

export function registerWorkflowMethods(daemon: Daemon) {
  daemon.rpc.on('workflow.list', async () => {
    return (await daemon.workflowRegistry.list()).map(w => ({
      name: w.name, description: w.description, level: w.level,
      source: w.source, handoffPolicy: w.handoffPolicy,
    }))
  })
  daemon.rpc.on('workflow.info', async ({ name }: { name: string }) => {
    const w = await daemon.workflowRegistry.resolve(name)
    if (!w) return null
    return { ...w, body: undefined }
  })
  daemon.rpc.on('workflow.run', async ({ name, argument, maxIter }: any) => {
    const w = await daemon.workflowRegistry.resolve(name)
    if (!w) throw new Error(`unknown workflow: ${name}`)
    if (maxIter) w.maxIter = maxIter
    const session = daemon.sessionManager.getOrCreateForCwd(process.cwd())
    const r = await daemon.workflowRunnerFor(session.id).run(w, argument ?? '')
    return r
  })
  daemon.rpc.on('workflow.resume', async ({ runId }: { runId: string }) => {
    const row = daemon.workflowRunRepo.get(runId)
    if (!row) throw new Error(`unknown run: ${runId}`)
    const w = await daemon.workflowRegistry.resolve(row.workflowName)
    if (!w) throw new Error(`workflow gone: ${row.workflowName}`)
    return daemon.workflowRunnerFor(row.sessionId).run(w, row.argument ?? '', { resumeRunId: runId })
  })
}
```

- [ ] **Step 5: Run CLI integration test — PASS**

- [ ] **Step 6: Commit**

```bash
git add packages/cli packages/core
git commit -m "feat(cli): glm workflow {list,info,run,resume} + per-workflow aliases (1:1 with slash)"
```

---

## Task 9: TUI slash dispatcher + plugin cascade integration test

**Files:**
- Modify: `packages/tui/src/slash/dispatcher.ts` (from P2/P4)
- Create: `packages/workflow-runtime/test/integration/plugin-cascade.test.ts`

- [ ] **Step 1: Slash → workflow.run shim**

In `packages/tui/src/slash/dispatcher.ts`, add fallback path so any `/<name> args` that doesn't match a built-in slash command but matches a known workflow gets dispatched to `workflow.run`:

```ts
async function dispatchSlash(line: string, rpc: RpcClient): Promise<DispatchResult> {
  const m = line.match(/^\/(\S+)(?:\s+(.*))?$/)
  if (!m) return { handled: false }
  const [, head, rest = ''] = m
  // 1. built-in slash commands (compact, model, etc.) — handled above
  // 2. plugin-qualified workflow:  /<plugin>:<name>
  // 3. workflow by name (cascade lookup)
  const info = await rpc.call('workflow.info', { name: head }) as any
  if (!info) return { handled: false }
  // emit user-facing status frame
  emit(`▶ workflow ${head} ${rest}`)
  const res = await rpc.call('workflow.run', { name: head, argument: rest }) as any
  emit(res.passed ? `✓ ${head} PASSED (run ${res.runId})` : `✗ ${head} FAILED`)
  return { handled: true }
}
```

- [ ] **Step 2: Failing plugin-cascade test**

`packages/workflow-runtime/test/integration/plugin-cascade.test.ts`:
```ts
import { afterEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { WorkflowRegistry } from '../../src/registry'

let dir: string
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }) })

function stage(d: string, name: string, marker: string) {
  mkdirSync(d, { recursive: true })
  const wd = path.join(d, name); mkdirSync(wd, { recursive: true })
  writeFileSync(path.join(wd, 'WORKFLOW.md'), `---
name: ${name}
description: ${marker}
level: 2
handoff-policy: sequential
acceptance: { op: all, checks: [] }
---`)
  writeFileSync(path.join(wd, 'phases.json'), JSON.stringify([{ id: 'a', agent: 'executor' }]))
}

describe('plugin cascade', () => {
  test('built-in autopilot wins; oh-my-claudecode:autopilot resolves plugin', async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'glm-pc-'))
    const builtin = path.join(dir, 'builtin')
    const omc = path.join(dir, 'plugins', 'oh-my-claudecode')
    stage(builtin, 'autopilot', 'BUILTIN')
    stage(omc,    'autopilot', 'OMC')

    const reg = new WorkflowRegistry({
      builtinDirs: [builtin],
      pluginDirs: [{ name: 'oh-my-claudecode', dir: omc }],
      userDirs: [],
    })
    await reg.scan()
    expect((await reg.resolve('autopilot'))!.description).toBe('BUILTIN')
    expect((await reg.resolve('oh-my-claudecode:autopilot'))!.description).toBe('OMC')
  })
})
```

- [ ] **Step 3: Resume integration test**

`packages/workflow-runtime/test/integration/resume.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { Database } from 'better-sqlite3'
import { openDb, runMigrations } from '@glm/core/storage'
import { WorkflowRunRepo } from '../../src/persistence/workflow-run-repo'
import { WorkflowRunner } from '../../src/runner'
import type { WorkflowDef } from '../../src/schema'

let dir: string; let db: Database

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'glm-resume-'))
  db = openDb(path.join(dir, 's.db')); runMigrations(db)
  db.prepare(`INSERT INTO sessions (id,created_at,updated_at,cwd,worktree,active) VALUES ('s1','t','t','/x','/x',1)`).run()
})
afterEach(() => { db.close(); rmSync(dir, { recursive: true, force: true }) })

const def: WorkflowDef = {
  name: 'tiny', description: '', level: 2, triggerKeywords: [],
  phases: [
    { id: 'a', agent: 'planner' },
    { id: 'b', agent: 'executor' },
    { id: 'c', agent: 'verifier' },
  ],
  handoffPolicy: 'sequential',
  acceptance: { op: 'all', checks: [{ kind: 'phase-completed', phase: 'c' }] },
  source: 'builtin',
}

describe('resume', () => {
  test('failed run re-runs only failed + subsequent phases', async () => {
    const repo = new WorkflowRunRepo(db); repo.applyMigration()
    let call = 0
    const orchestrator = { runAgent: vi.fn(async (req: any) => {
      call++
      // first try: phase b fails
      if (req.agent === 'executor' && call === 2) return { ok: false, output: 'crash', verdict: 'fail' }
      return { ok: true, output: req.agent, verdict: 'pass' }
    }) } as any
    const scheduler = { reserve: async () => ({}), release: () => {} } as any

    const runner = new WorkflowRunner({
      cwd: dir, sessionId: 's1', orchestrator, scheduler, repo,
      emit: () => {},
      resolveWorkflow: async () => undefined,
      runCommand: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
      fileExists: async () => true, getDiff: async () => '', getLspErrorCount: async () => 0,
    })
    await expect(runner.run(def, 'X')).rejects.toThrow()
    const failed = repo.listResumable('s1')
    expect(failed).toHaveLength(1)
    const runId = failed[0].id

    // resume: planner (phase a) should be skipped, executor + verifier re-run
    const callsBefore = orchestrator.runAgent.mock.calls.length
    const r = await runner.run(def, 'X', { resumeRunId: runId })
    const callsAfter = orchestrator.runAgent.mock.calls.length
    expect(r.passed).toBe(true)
    expect(callsAfter - callsBefore).toBe(2)  // only b + c, NOT a
  })
})
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/workflow-runtime packages/tui
git commit -m "feat(tui): slash dispatcher resolves workflows via cascade + plugin-qualified syntax"
```

---

## Task 10: `/autopilot` — end-to-end pipeline

**Composition (spec §9.13):** analyst → planner → architect → executor × N parallel → test-engineer → verifier → critic.

**Files:**
- Create: `packages/workflows/autopilot/WORKFLOW.md`
- Create: `packages/workflows/autopilot/phases.json`
- Create: `packages/workflows/autopilot/acceptance.json`
- Create: `packages/workflows/autopilot/__fixtures__/llm/autopilot.jsonl`
- Test: `packages/workflows/autopilot/test/autopilot.golden.test.ts`

- [ ] **Step 1: WORKFLOW.md**

`packages/workflows/autopilot/WORKFLOW.md`:
```markdown
---
name: autopilot
description: End-to-end autonomous pipeline — analyst → planner → architect → executor×N → test-engineer → verifier → critic
level: 4
argument-hint: <idea>
trigger-keywords: [autopilot, build me, create a, end to end, all the way]
handoff-policy: pipeline
max-iter: 1
---

# `/autopilot <idea>`

Full unattended build. The orchestrator drives each phase, hands off via shared scratchpad, and gates on the **critic** at the end. Use this when you want to go from idea to working code without intervening.

## Phases

1. **analyst** (L4, GLM-5.1 thinking) — Requirements gap analysis. Output: gap list.
2. **planner** (L4, GLM-5.1 thinking) — Phase decomposition. Output: `.glm/plans/<slug>.md`.
3. **architect** (L3, GLM-5.1) — Tech design review (READ-ONLY).
4. **executor** (L2, GLM-5.1) × N — Parallel implementer. Width = phase count of the plan, capped at quota.
5. **test-engineer** (L3, GLM-5.1) — Adds + stabilizes tests.
6. **verifier** (L3, GLM-5.1) — Evidence collection.
7. **critic** (L3, GLM-5.1) — Final gate (must say `approve`).

## Acceptance

- All phases completed
- Tests pass (`pnpm test` or detected runner)
- LSP clean (0 errors)
- Diff free of `TODO`
- Critic verdict = `approve`

## Safety

- Yolo policy from §8 still applies; autopilot does NOT bypass hard-whitelist.
- Quota-aware: if GLM-5.1 pool exhausts, executor escalates to GLM-5-Turbo per §6.
- User interrupt (Esc, `/cancel`) always wins.
```

- [ ] **Step 2: phases.json**

```json
[
  { "id": "analyst",      "agent": "analyst",       "model": "GLM-5.1", "thinking": true },
  { "id": "planner",      "agent": "planner",       "model": "GLM-5.1", "thinking": true, "inputsFromPhase": "analyst" },
  { "id": "architect",    "agent": "architect",     "model": "GLM-5.1", "inputsFromPhase": "planner" },
  { "id": "executor",     "agent": "executor",      "model": "GLM-5.1", "parallel": 3,    "inputsFromPhase": "planner" },
  { "id": "test-engineer","agent": "test-engineer", "model": "GLM-5.1", "inputsFromPhase": "executor" },
  { "id": "verifier",     "agent": "verifier",      "model": "GLM-5.1", "inputsFromPhase": "test-engineer" },
  { "id": "critic",       "agent": "critic",        "model": "GLM-5.1", "inputsFromPhase": "verifier" }
]
```

- [ ] **Step 3: acceptance.json**

```json
{
  "op": "all",
  "checks": [
    { "kind": "phase-completed", "phase": "analyst" },
    { "kind": "phase-completed", "phase": "planner" },
    { "kind": "phase-completed", "phase": "architect" },
    { "kind": "phase-completed", "phase": "executor" },
    { "kind": "phase-completed", "phase": "test-engineer" },
    { "kind": "phase-completed", "phase": "verifier" },
    { "kind": "phase-completed", "phase": "critic" },
    { "kind": "tests-pass" },
    { "kind": "lsp-clean" },
    { "kind": "no-todo-in-diff" },
    { "kind": "agent-says", "agent": "critic", "verdict": "approve" }
  ]
}
```

- [ ] **Step 4: Golden LLM fixture**

`packages/workflows/autopilot/__fixtures__/llm/autopilot.jsonl`:
```
{"agent":"analyst","response":{"ok":true,"output":"## Gaps\n- need CLI scaffold\n- need tests","verdict":"done"}}
{"agent":"planner","response":{"ok":true,"output":"## Plan\n1. scaffold\n2. impl\n3. test","verdict":"done","artifacts":{"planPath":".glm/plans/x.md"}}}
{"agent":"architect","response":{"ok":true,"output":"Approach: standard pnpm workspace.","verdict":"reviewed"}}
{"agent":"executor","response":{"ok":true,"output":"Implemented X","verdict":"pass","artifacts":{"filesChanged":["src/x.ts"]}}}
{"agent":"test-engineer","response":{"ok":true,"output":"Added 3 vitest specs","verdict":"pass"}}
{"agent":"verifier","response":{"ok":true,"output":"All evidence collected","verdict":"pass"}}
{"agent":"critic","response":{"ok":true,"output":"No missing pieces. Approve.","verdict":"approve"}}
```

- [ ] **Step 5: Golden integration test**

`packages/workflows/autopilot/test/autopilot.golden.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { Database } from 'better-sqlite3'
import { openDb, runMigrations } from '@glm/core/storage'
import { WorkflowRunRepo } from '@glm/workflow-runtime/persistence/workflow-run-repo'
import { WorkflowRunner } from '@glm/workflow-runtime/runner'
import { loadWorkflowDir } from '@glm/workflow-runtime/loader'
import { GoldenReplayOrchestrator, NoopScheduler } from '@glm/workflow-runtime/llm-mock/golden-replay'

let dir: string; let db: Database

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'glm-ap-'))
  db = openDb(path.join(dir, 's.db')); runMigrations(db)
  db.prepare(`INSERT INTO sessions (id,created_at,updated_at,cwd,worktree,active) VALUES ('s1','t','t','/x','/x',1)`).run()
})
afterEach(() => { db.close(); rmSync(dir, { recursive: true, force: true }) })

describe('/autopilot golden', () => {
  test('all 7 phases run + acceptance passes', async () => {
    const def = await loadWorkflowDir(path.resolve(__dirname, '..'), 'builtin')
    const repo = new WorkflowRunRepo(db); repo.applyMigration()
    const orch = await GoldenReplayOrchestrator.fromFile(path.resolve(__dirname, '..', '__fixtures__', 'llm', 'autopilot.jsonl'))
    const runner = new WorkflowRunner({
      cwd: dir, sessionId: 's1', orchestrator: orch as any, scheduler: new NoopScheduler() as any,
      repo, emit: () => {},
      resolveWorkflow: async () => undefined,
      runCommand: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
      fileExists: async () => true, getDiff: async () => '', getLspErrorCount: async () => 0,
    })
    const r = await runner.run(def, 'build me X')
    expect(r.passed).toBe(true)
    const phases = repo.listPhases(r.runId).map(p => p.phaseId)
    expect(phases).toEqual(['analyst','planner','architect','executor','test-engineer','verifier','critic'])
  })
})
```

- [ ] **Step 6: Run — PASS**

```bash
pnpm vitest run packages/workflows/autopilot/test/
```

- [ ] **Step 7: Commit**

```bash
git add packages/workflows/autopilot
git commit -m "feat(workflows/autopilot): end-to-end pipeline (7 phases) + golden replay test"
```

---

## Task 11: `/ralph` — PRD-driven persistence loop

**Composition:** ultrawork-class executor loop, gated by verifier each iteration, halts when acceptance true OR max-iter hit. Optional deslop pass + completion-audit.

**Files:**
- Create: `packages/workflows/ralph/WORKFLOW.md`
- Create: `packages/workflows/ralph/phases.json`
- Create: `packages/workflows/ralph/acceptance.json`
- Create: `packages/workflows/ralph/__fixtures__/llm/ralph.jsonl`
- Test: `packages/workflows/ralph/test/ralph.golden.test.ts`

- [ ] **Step 1: WORKFLOW.md**

```markdown
---
name: ralph
description: PRD-driven persistence loop — re-run executor + verifier until acceptance met or max-iter hit
level: 4
argument-hint: <task>
trigger-keywords: [ralph, the boulder never stops, must complete, dont stop, don't stop, persist]
handoff-policy: persistence-loop
max-iter: 5
---

# `/ralph <task>`

The boulder never stops. Ralph re-runs executor + verifier in a loop until the acceptance criteria fire or `--max-iter` (default 5) trips. Pairs an optional deslop pass after each iter to keep the diff clean.

## Iteration phases

1. **executor** (L2, GLM-5.1, parallel 2) — Apply the change.
2. **code-simplifier** (L2, optional `--deslop`) — Trim AI-slop after each iter.
3. **verifier** (L3, GLM-5.1) — Evidence.
4. **completion-audit** (L3, critic role with prompt override) — Final pass per iter.

## Acceptance

- Tests pass
- LSP clean
- Verifier says `pass`
- Iter cap not exceeded (runner enforces)
```

- [ ] **Step 2: phases.json**

```json
[
  { "id": "executor",         "agent": "executor",        "model": "GLM-5.1", "parallel": 2 },
  { "id": "code-simplifier",  "agent": "code-simplifier", "model": "GLM-5-Turbo" },
  { "id": "verifier",         "agent": "verifier",        "model": "GLM-5.1" },
  { "id": "completion-audit", "agent": "critic",          "model": "GLM-5.1",
    "promptTemplate": "You are the completion auditor. Vote 'pass' only if the verifier evidence is sufficient." }
]
```

- [ ] **Step 3: acceptance.json**

```json
{
  "op": "all",
  "checks": [
    { "kind": "tests-pass" },
    { "kind": "lsp-clean" },
    { "kind": "agent-says", "agent": "verifier", "verdict": "pass" }
  ]
}
```

- [ ] **Step 4: Fixture (loop fixture — iteration 1 fails verifier, iter 2 passes)**

`__fixtures__/llm/ralph.jsonl`:
```
{"phaseId":"executor","iter":0,"response":{"ok":true,"output":"attempt-1","verdict":"pass"}}
{"phaseId":"code-simplifier","iter":0,"response":{"ok":true,"output":"trim","verdict":"clean"}}
{"phaseId":"verifier","iter":0,"response":{"ok":true,"output":"tests still missing edge","verdict":"fail"}}
{"phaseId":"completion-audit","iter":0,"response":{"ok":true,"output":"not yet","verdict":"block"}}
{"phaseId":"executor","iter":1,"response":{"ok":true,"output":"attempt-2","verdict":"pass"}}
{"phaseId":"code-simplifier","iter":1,"response":{"ok":true,"output":"trim","verdict":"clean"}}
{"phaseId":"verifier","iter":1,"response":{"ok":true,"output":"all good","verdict":"pass"}}
{"phaseId":"completion-audit","iter":1,"response":{"ok":true,"output":"ship","verdict":"approve"}}
```

Note: the golden-replay implementation needs an `iter` overload — extend it in this task:

```ts
// packages/workflow-runtime/src/llm-mock/golden-replay.ts (extend)
async runAgent(req: any) {
  let e = this.entries.find(x => x.phaseId === req.phaseId && x.iter === req.iter && x.agent === undefined)
       ?? this.entries.find(x => x.phaseId === req.phaseId && x.agent === req.agent)
       ?? this.entries.find(x => !x.phaseId && x.agent === req.agent)
       ?? this.entries[this.callIdx++]
  if (!e) throw new Error(`no golden fixture for phase=${req.phaseId} iter=${req.iter} agent=${req.agent}`)
  return e.response
}
```

And thread `iter` through `WorkflowRunner.runPhase` → `req.iter`.

- [ ] **Step 5: Golden test**

```ts
// packages/workflows/ralph/test/ralph.golden.test.ts (similar shape to autopilot)
// assert: 2 iterations recorded, final acceptance.passed === true
expect(repo.listPhases(r.runId).filter(p => p.iter === 0)).toHaveLength(4)
expect(repo.listPhases(r.runId).filter(p => p.iter === 1)).toHaveLength(4)
expect(r.passed).toBe(true)
```

- [ ] **Step 6: Run — PASS**
- [ ] **Step 7: Commit**

```bash
git add packages/workflows/ralph packages/workflow-runtime
git commit -m "feat(workflows/ralph): PRD-driven persistence loop + iter-aware golden replay"
```

---

## Task 12: `/ultrawork` — parallel execution engine (lighter ralph)

**Composition:** executor × N parallel, single pass, intent-grounding prompt, no persistence loop.

**Files:**
- Create: `packages/workflows/ultrawork/{WORKFLOW.md,phases.json,acceptance.json}`
- Create: `__fixtures__/llm/ultrawork.jsonl`
- Test: `test/ultrawork.golden.test.ts`

- [ ] **Step 1: WORKFLOW.md**

```markdown
---
name: ultrawork
description: Parallel execution engine — executor×N in one shot, no loop. Use for many independent tasks at once.
level: 4
argument-hint: <task> [--width N]
trigger-keywords: [ultrawork, ulw, parallel work, fan out tasks]
handoff-policy: parallel-fanout
---

# `/ultrawork <task>`

Sub-set of ralph without the persistence loop. Best when you have several independent units of work and want them done concurrently. Intent grounded via a leading 1-shot intent-grounding pass.

## Phases

1. **intent-grounding** (planner, single) — Decomposes into sub-tasks.
2. **executor** (executor, parallel=`--width` or 4) — Runs sub-tasks concurrently.
```

- [ ] **Step 2: phases.json**

```json
[
  { "id": "intent-grounding", "agent": "planner",  "model": "GLM-5.1" },
  { "id": "executor",         "agent": "executor", "model": "GLM-5.1", "parallel": 4, "inputsFromPhase": "intent-grounding" }
]
```

- [ ] **Step 3: acceptance.json**

```json
{ "op": "all", "checks": [
  { "kind": "phase-completed", "phase": "intent-grounding" },
  { "kind": "phase-completed", "phase": "executor" }
]}
```

- [ ] **Step 4: Fixture**

```
{"agent":"planner","response":{"ok":true,"output":"Split into 4 sub-tasks","verdict":"done"}}
{"agent":"executor","response":{"ok":true,"output":"shard","verdict":"pass"}}
```

(The fanout phase consumes one fixture per worker via call-index fallback.)

- [ ] **Step 5: Golden test** — assert `parallel-fanout` ran 4 workers, all ok.

- [ ] **Step 6: Run — PASS**
- [ ] **Step 7: Commit**

```bash
git add packages/workflows/ultrawork
git commit -m "feat(workflows/ultrawork): parallel fanout engine with intent-grounding"
```

---

## Task 13: `/team` — N peer agents on shared task list

**Composition:** N peers from `[--roles a,b,c]` argument, all run concurrently, share state via §7 shared-memory, exit when shared task-list empty.

**Files:**
- Create: `packages/workflows/team/{WORKFLOW.md,phases.json,acceptance.json}`
- Create: `__fixtures__/llm/team.jsonl`
- Test: `test/team.golden.test.ts`

- [ ] **Step 1: WORKFLOW.md**

```markdown
---
name: team
description: N peer agents on a shared task list — concurrent collaboration with inter-agent messaging
level: 4
argument-hint: [N:role[,role...]] <task>
trigger-keywords: [team, peer agents, collaborate]
handoff-policy: peer-team
---

# `/team [N:role] <task>`

N peers work in parallel, claiming tasks from a shared list backed by §7 shared-memory. Each peer can post messages addressed to other peers. Run ends when all tasks are claimed + reported complete by their owners.

Example:

```
/team 3:executor build the auth flow
/team 2:executor,1:verifier ship the rate-limit fix
```

## Acceptance

- All peers exit cleanly
- Shared task list reaches empty (`completed_count === total_count`)
```

- [ ] **Step 2: phases.json (template — runner instantiates N per `--roles` arg)**

```json
[
  { "id": "peer-1", "agent": "executor", "model": "GLM-5.1" },
  { "id": "peer-2", "agent": "executor", "model": "GLM-5.1" },
  { "id": "peer-3", "agent": "executor", "model": "GLM-5.1" }
]
```

Note: `WorkflowRunner.runPeerTeam` reads `argument` prefix `N:roles` and rewrites `def.phases` accordingly before dispatch. Encode this in `runner.ts`:

```ts
private parsePeerArg(argument: string): { peers: { role: string }[]; rest: string } {
  const m = argument.match(/^(\d+):([a-z,-]+)\s+(.*)$/)
  if (!m) return { peers: Array(2).fill({ role: 'executor' }), rest: argument }
  const n = parseInt(m[1]!, 10)
  const roles = m[2]!.split(',')
  const peers = Array.from({ length: n }, (_, i) => ({ role: roles[i % roles.length]! }))
  return { peers, rest: m[3]! }
}
```

- [ ] **Step 3: acceptance.json**

```json
{ "op": "all", "checks": [
  { "kind": "phase-completed", "phase": "peer-1" },
  { "kind": "phase-completed", "phase": "peer-2" }
]}
```

- [ ] **Step 4-7:** fixture, golden test (verify ≥ 2 peers ran concurrently — measure overlap with `startedAt` timestamps), commit.

---

## Task 14: `/plan` — strategic planning

**Composition:** Single planner call by default; `--mode interview` adds an analyst pre-phase; `--mode consensus` → alias to ralplan; saves to `.glm/plans/<slug>.md`.

**Files:**
- Create: `packages/workflows/plan/{WORKFLOW.md,phases.json,acceptance.json}`
- Create: `__fixtures__/llm/plan.jsonl`
- Test: `test/plan.golden.test.ts`

- [ ] **Step 1: WORKFLOW.md**

```markdown
---
name: plan
description: Strategic planning — interview (broad) or direct (detailed). Saves to .glm/plans/<slug>.md
level: 4
argument-hint: <task> [--mode interview|direct|consensus|review]
trigger-keywords: [plan, planning, lets plan, plan first]
handoff-policy: sequential
---

# `/plan <task>`

Strategic planner. Modes:
- `--mode direct` (default) — single planner call, immediate plan file.
- `--mode interview` — analyst asks clarifying questions first, then planner.
- `--mode consensus` — handoff to `/ralplan`.
- `--mode review` — architect + critic review an existing plan file.

## Output

`.glm/plans/<slug>.md` (slug = first 6 words of `<task>` kebabified).
```

- [ ] **Step 2: phases.json (direct mode default; interview phase has `onFail: skip` for direct mode)**

```json
[
  { "id": "interview", "agent": "analyst", "model": "GLM-5.1", "thinking": true, "onFail": "next" },
  { "id": "plan",      "agent": "planner", "model": "GLM-5.1", "thinking": true }
]
```

The CLI flag flips `phases[0].onFail` to `'stop'` when `--mode interview` so failure aborts; in direct mode, runner skips empty/failed analyst output naturally.

- [ ] **Step 3: acceptance.json**

```json
{ "op": "all", "checks": [
  { "kind": "phase-completed", "phase": "plan" },
  { "kind": "file-exists", "path": ".glm/plans" }
]}
```

- [ ] **Step 4-7:** fixture, test, commit.

---

## Task 15: `/ralplan` — consensus planning (Planner+Architect+Critic loop)

**Composition:** consensus handoff. Iterates Planner → Architect → Critic up to max-iter (default 5). RALPLAN-DR structured deliberation (each iter writes a Decision Record block to scratchpad). Halts when critic says `approve`.

**Files:**
- Create: `packages/workflows/ralplan/{WORKFLOW.md,phases.json,acceptance.json}`
- Create: `__fixtures__/llm/ralplan.jsonl`
- Test: `test/ralplan.golden.test.ts`

- [ ] **Step 1: WORKFLOW.md**

```markdown
---
name: ralplan
description: Consensus planning — Planner+Architect+Critic loop with structured Decision Record (max 5 iter)
level: 4
argument-hint: <task>
trigger-keywords: [ralplan, consensus, review the plan, plan consensus]
handoff-policy: consensus
max-iter: 5
---

# `/ralplan <task>`

`/plan --consensus`. The three roles deliberate in a Decision Record format:

```
## Iter 1
Planner proposed: ...
Architect raised: ...
Critic verdict: revise
## Iter 2
...
```

Halts when critic verdict = `approve`.

## Acceptance

- Critic says `approve`
- A plan file exists at `.glm/plans/<slug>.md`
```

- [ ] **Step 2: phases.json**

```json
[
  { "id": "planner",   "agent": "planner",   "model": "GLM-5.1", "thinking": true },
  { "id": "architect", "agent": "architect", "model": "GLM-5.1" },
  { "id": "critic",    "agent": "critic",    "model": "GLM-5.1",
    "promptTemplate": "Vote 'approve' only if the plan is fully covered and no risks remain. Otherwise vote 'revise' with concrete gaps." }
]
```

- [ ] **Step 3: acceptance.json**

```json
{ "op": "all", "checks": [
  { "kind": "agent-says", "agent": "critic", "verdict": "approve" }
]}
```

- [ ] **Step 4: Fixture (3-round deliberation: revise, revise, approve)**

```
{"phaseId":"planner","iter":0,"response":{"ok":true,"output":"Plan v1","verdict":"done"}}
{"phaseId":"architect","iter":0,"response":{"ok":true,"output":"missing rollback","verdict":"revise"}}
{"phaseId":"critic","iter":0,"response":{"ok":true,"output":"add rollback","verdict":"revise"}}
{"phaseId":"planner","iter":1,"response":{"ok":true,"output":"Plan v2 with rollback","verdict":"done"}}
{"phaseId":"architect","iter":1,"response":{"ok":true,"output":"ok","verdict":"approve"}}
{"phaseId":"critic","iter":1,"response":{"ok":true,"output":"approve","verdict":"approve"}}
```

- [ ] **Step 5-7:** golden test asserts 2 iterations, final critic verdict approve, commit.

---

## Task 16: `/deep-dive` — trace → deep-interview pipeline

**Composition:** sub-workflow composition — phase 1 calls `/trace`, phase 2 calls `/deep-interview` (the latter is part of P5's keyword skills but the workflow runtime can reference it).

**Files:**
- Create: `packages/workflows/deep-dive/{WORKFLOW.md,phases.json,acceptance.json}`
- Create: `__fixtures__/llm/deep-dive.jsonl`
- Test: `test/deep-dive.golden.test.ts`

- [ ] **Step 1: WORKFLOW.md**

```markdown
---
name: deep-dive
description: 2-stage pipeline — /trace (causal investigation) → /deep-interview (requirements crystallization)
level: 4
argument-hint: <observation>
trigger-keywords: [deep dive, deep-dive, deep analyze, deep-analyze]
handoff-policy: pipeline
---

# `/deep-dive <observation>`

Two stages back-to-back:
1. `/trace` — figure out *why* (causal chain + competing hypotheses).
2. `/deep-interview` — figure out *what to do* (requirements + ambiguity gating).

Output: a markdown brief stitching both reports.
```

- [ ] **Step 2: phases.json** (uses `workflow` instead of `agent`)

```json
[
  { "id": "trace",     "workflow": "trace" },
  { "id": "interview", "workflow": "deep-interview", "inputsFromPhase": "trace" }
]
```

- [ ] **Step 3: acceptance.json**

```json
{ "op": "all", "checks": [
  { "kind": "phase-completed", "phase": "trace" },
  { "kind": "phase-completed", "phase": "interview" }
]}
```

- [ ] **Step 4-7:** sub-workflow resolution test (verify `resolveWorkflow` was called twice), golden test, commit.

---

## Task 17: `/trace` — evidence-driven causal tracing

**Composition:** tracer × M (competing hypotheses, parallel-fanout), then ranker phase (architect) selects best hypothesis + recommends next probe.

**Files:**
- Create: `packages/workflows/trace/{WORKFLOW.md,phases.json,acceptance.json}`
- Create: `__fixtures__/llm/trace.jsonl`
- Test: `test/trace.golden.test.ts`

- [ ] **Step 1: WORKFLOW.md**

```markdown
---
name: trace
description: Evidence-driven causal tracing — M competing hypotheses, evidence ranking, next-probe recommendation
level: 4
argument-hint: <observation>
trigger-keywords: [trace, why is this, root cause, causal]
handoff-policy: pipeline
---

# `/trace <observation>`

Tracer agents propose competing hypotheses in parallel (default M=3). Architect ranks evidence for/against each and emits a **next-probe** recommendation.

Output schema (parsed by `acceptance`):
```
## Hypothesis 1 — <name>
Evidence for: ...
Evidence against: ...
Confidence: HIGH|MED|LOW
## Next probe
<concrete action>
```

## Acceptance

- All tracer workers ran
- Architect emitted `next-probe` block (verified by `regex-not-in-diff` inverted via `not`)
```

- [ ] **Step 2: phases.json**

```json
[
  { "id": "hypotheses", "agent": "tracer",    "model": "GLM-5.1", "parallel": 3 },
  { "id": "rank",       "agent": "architect", "model": "GLM-5.1", "inputsFromPhase": "hypotheses" }
]
```

- [ ] **Step 3: acceptance.json**

```json
{ "op": "all", "checks": [
  { "kind": "phase-completed", "phase": "hypotheses" },
  { "kind": "phase-completed", "phase": "rank" },
  { "kind": "agent-says", "agent": "architect", "verdict": "ranked" }
]}
```

- [ ] **Step 4-7:** fixture, test, commit.

---

## Task 18: `/ultraqa` — QA cycle until acceptance met

**Composition:** persistence-loop, test-engineer + executor + verifier, halts on tests-pass + verifier pass.

**Files:**
- Create: `packages/workflows/ultraqa/{WORKFLOW.md,phases.json,acceptance.json}`
- Create: `__fixtures__/llm/ultraqa.jsonl`
- Test: `test/ultraqa.golden.test.ts`

- [ ] **Step 1: WORKFLOW.md**

```markdown
---
name: ultraqa
description: QA cycle — test → verify → fix → repeat until acceptance met or iter cap
level: 4
argument-hint: <feature>
trigger-keywords: [ultraqa, qa cycle, fix tests, until green]
handoff-policy: persistence-loop
max-iter: 8
---

# `/ultraqa <feature>`

Re-runs the QA triad until tests are green, LSP is clean, and the verifier signs off.

## Phases (per iter)

1. **test-engineer** — Add/repair tests for the feature.
2. **executor** — Fix the implementation to match tests.
3. **debugger** — On failure, attribute the failure to a regression vs unimplemented behavior.
4. **verifier** — Final per-iter gate.
```

- [ ] **Step 2: phases.json**

```json
[
  { "id": "test-engineer", "agent": "test-engineer", "model": "GLM-5.1" },
  { "id": "executor",      "agent": "executor",      "model": "GLM-5.1" },
  { "id": "debugger",      "agent": "debugger",      "model": "GLM-5.1", "onFail": "next" },
  { "id": "verifier",      "agent": "verifier",      "model": "GLM-5.1" }
]
```

- [ ] **Step 3: acceptance.json**

```json
{ "op": "all", "checks": [
  { "kind": "tests-pass" },
  { "kind": "lsp-clean" },
  { "kind": "agent-says", "agent": "verifier", "verdict": "pass" }
]}
```

- [ ] **Step 4-7:** fixture (3-iter loop: red → red → green), test, commit.

---

## Task 19: `/self-improve` — evolutionary improvement (tournament selection)

**Composition:** tournament handoff. Each phase emits N variants in parallel; winner = highest-scored variant; next phase consumes winner.

**Files:**
- Create: `packages/workflows/self-improve/{WORKFLOW.md,phases.json,acceptance.json}`
- Create: `__fixtures__/llm/self-improve.jsonl`
- Test: `test/self-improve.golden.test.ts`

- [ ] **Step 1: WORKFLOW.md**

```markdown
---
name: self-improve
description: Autonomous evolutionary code improvement — tournament selection across variants
level: 4
argument-hint: <target>
trigger-keywords: [self improve, self-improve, evolve, improve code]
handoff-policy: tournament
max-iter: 3
---

# `/self-improve <target>`

For the given target (file, function, or module), produce N variants in parallel, score them via the critic, and let the highest-scored variant survive. Repeat for each phase.

## Phases

1. **generate** (executor, parallel=4) — Produce 4 candidate refactors.
2. **score** (critic, parallel=4) — Each critic instance scores the matching variant. Verdict = `best` for the top one.
3. **apply** (executor) — Apply the winning variant.
```

- [ ] **Step 2: phases.json**

```json
[
  { "id": "generate", "agent": "executor", "parallel": 4 },
  { "id": "score",    "agent": "critic",   "parallel": 4 },
  { "id": "apply",    "agent": "executor" }
]
```

- [ ] **Step 3: acceptance.json**

```json
{ "op": "all", "checks": [
  { "kind": "phase-completed", "phase": "apply" },
  { "kind": "tests-pass" },
  { "kind": "lsp-clean" }
]}
```

- [ ] **Step 4-7:** fixture (4 variants, only one has `verdict: "best"`), test asserts winner threaded into `apply`, commit.

---

## Task 20: `/debug` — diagnose current session/repo

**Composition:** debugger + tracer + verifier, sequential. Inspects logs (P1 daemon log), traces (P7 trace timeline), state (`.glm/state/`), suggests focused repro.

**Files:**
- Create: `packages/workflows/debug/{WORKFLOW.md,phases.json,acceptance.json}`
- Create: `__fixtures__/llm/debug.jsonl`
- Test: `test/debug.golden.test.ts`

- [ ] **Step 1: WORKFLOW.md**

```markdown
---
name: debug
description: Diagnose current session/repo state — logs, traces, state, focused repro
level: 3
argument-hint: [scope]
trigger-keywords: [debug, whats wrong, what's wrong, diagnose]
handoff-policy: sequential
---

# `/debug [scope]`

Reads `~/.glm/daemon.log` (last 200 lines), session state from `.glm/state/`, and the trace timeline. Produces a 5-bullet diagnosis + a *focused-repro* command suggestion.

## Phases

1. **collect** (debugger) — Pull logs, state, trace.
2. **hypothesize** (tracer) — Top-3 root-cause candidates.
3. **verify** (verifier) — Sanity-check the diagnosis.
```

- [ ] **Step 2: phases.json**

```json
[
  { "id": "collect",     "agent": "debugger" },
  { "id": "hypothesize", "agent": "tracer",   "inputsFromPhase": "collect" },
  { "id": "verify",      "agent": "verifier", "inputsFromPhase": "hypothesize" }
]
```

- [ ] **Step 3: acceptance.json**

```json
{ "op": "all", "checks": [
  { "kind": "phase-completed", "phase": "verify" },
  { "kind": "agent-says", "agent": "verifier", "verdict": "pass" }
]}
```

- [ ] **Step 4-7:** fixture, test, commit.

---

## Task 21: `/verify` — evidence collection

**Composition:** verifier + test-engineer + critic (light), gathers concrete proof a claim of "done" holds up.

**Files:**
- Create: `packages/workflows/verify/{WORKFLOW.md,phases.json,acceptance.json}`
- Create: `__fixtures__/llm/verify.jsonl`
- Test: `test/verify.golden.test.ts`

- [ ] **Step 1: WORKFLOW.md**

```markdown
---
name: verify
description: Evidence-collection workflow — runs targeted tests + gathers concrete proof of done
level: 3
argument-hint: <claim>
trigger-keywords: [verify, prove, evidence]
handoff-policy: sequential
---

# `/verify <claim>`

Pass when you have *concrete* evidence the claim holds:
- targeted test(s) green
- LSP clean for the touched files
- verifier signs off
- a one-paragraph summary in `.glm/state/verify-<runId>.md`
```

- [ ] **Step 2: phases.json**

```json
[
  { "id": "targeted-test", "agent": "test-engineer", "model": "GLM-5.1" },
  { "id": "verify",        "agent": "verifier",      "model": "GLM-5.1" },
  { "id": "summarize",     "agent": "writer",        "model": "GLM-5-Turbo" }
]
```

- [ ] **Step 3: acceptance.json**

```json
{ "op": "all", "checks": [
  { "kind": "tests-pass" },
  { "kind": "lsp-clean" },
  { "kind": "agent-says", "agent": "verifier", "verdict": "pass" },
  { "kind": "file-exists", "path": ".glm/state" }
]}
```

- [ ] **Step 4-7:** fixture, test, commit.

---

## Task 22: `/critic` — multi-perspective code/plan review

**Composition:** critic + code-reviewer + security-reviewer + (optional) architect in parallel-fanout. Each writes its perspective; merged report highlights "what is NOT there" alongside "what is".

**Files:**
- Create: `packages/workflows/critic/{WORKFLOW.md,phases.json,acceptance.json}`
- Create: `__fixtures__/llm/critic.jsonl`
- Test: `test/critic.golden.test.ts`

- [ ] **Step 1: WORKFLOW.md**

```markdown
---
name: critic
description: Multi-perspective review — code-reviewer + security-reviewer + critic + architect; finds gaps too
level: 3
argument-hint: <plan-or-code>
trigger-keywords: [critic, review, multi perspective]
handoff-policy: parallel-fanout
---

# `/critic <plan-or-code>`

Four critics run concurrently, each with a different lens:
- **critic** — Holistic, "what is missing?".
- **code-reviewer** — Spec adherence, SOLID, anti-patterns.
- **security-reviewer** — OWASP, secrets, sandbox.
- **architect** — System-level fit.

A merge step (writer agent) stitches into one markdown report.
```

- [ ] **Step 2: phases.json**

```json
[
  { "id": "critic-pass",   "agent": "critic",            "parallel": 1 },
  { "id": "code-review",   "agent": "code-reviewer",     "parallel": 1 },
  { "id": "sec-review",    "agent": "security-reviewer", "parallel": 1 },
  { "id": "arch-review",   "agent": "architect",         "parallel": 1 }
]
```

Note: `parallel-fanout` handoff treats each phase as a worker. Pin width=1 because each phase IS a unique critic role.

- [ ] **Step 3: acceptance.json**

```json
{ "op": "all", "checks": [
  { "kind": "phase-completed", "phase": "critic-pass" },
  { "kind": "phase-completed", "phase": "code-review" },
  { "kind": "phase-completed", "phase": "sec-review" },
  { "kind": "phase-completed", "phase": "arch-review" }
]}
```

- [ ] **Step 4-7:** fixture (one entry per role), test (all 4 ran concurrently), commit.

---

## Task 23: `/skillify` — extract reusable skill from session

**Composition:** explore (reads transcript) → writer (drafts SKILL.md) → critic (gate).

**Files:**
- Create: `packages/workflows/skillify/{WORKFLOW.md,phases.json,acceptance.json}`
- Create: `__fixtures__/llm/skillify.jsonl`
- Test: `test/skillify.golden.test.ts`

- [ ] **Step 1: WORKFLOW.md**

```markdown
---
name: skillify
description: Extract a reusable skill template from the current session's repeated pattern
level: 3
argument-hint: [pattern-hint]
trigger-keywords: [skillify, make this a skill, turn into skill]
handoff-policy: sequential
---

# `/skillify [pattern-hint]`

Detects a repeated pattern in the current session, drafts a SKILL.md template, writes it to `.glm/skills/<slug>/SKILL.md` for review.

## Phases

1. **explore** — Scan recent session transcript for repeated tool/agent patterns.
2. **draft**   — Writer agent emits SKILL.md.
3. **review**  — Critic gates: does the skill actually capture the pattern?
```

- [ ] **Step 2: phases.json**

```json
[
  { "id": "explore", "agent": "explore", "model": "GLM-4.5-Air" },
  { "id": "draft",   "agent": "writer",  "model": "GLM-5-Turbo", "inputsFromPhase": "explore" },
  { "id": "review",  "agent": "critic",  "model": "GLM-5.1",     "inputsFromPhase": "draft" }
]
```

- [ ] **Step 3: acceptance.json**

```json
{ "op": "all", "checks": [
  { "kind": "phase-completed", "phase": "draft" },
  { "kind": "phase-completed", "phase": "review" },
  { "kind": "file-exists", "path": ".glm/skills" },
  { "kind": "agent-says", "agent": "critic", "verdict": "approve" }
]}
```

- [ ] **Step 4-7:** fixture, test, commit.

---

## Task 24: Wire trigger-keywords into P5's keyword detector

**Files:**
- Modify: `packages/core/src/hooks/keywords/registry.ts` (P5-owned — P9 calls `keywordRegistry.registerSource('builtin-workflows', entries)` from its workflow subsystem init)
- Create: `packages/workflow-runtime/src/keyword-bridge.ts` (P9-owned glue that builds the entries from the registry + invokes LoaderHub)
- Test: `packages/workflow-runtime/test/integration/keyword-wire.test.ts`

The P5 keyword detector already implements the regex engine + UserPromptSubmit hook injection + named-source API (P5-Fix-2: `KeywordRegistry.registerSource(name, entries)`). P9 only contributes a *table* of `(keyword → workflow-name)` mappings drawn from each workflow's `triggerKeywords` frontmatter, and registers it as a subsystem via LoaderHub (P9-Fix-4 — replaces the prior direct `daemon.ts` edit per §0.9 of the manifest).

- [ ] **Step 1: Workflow subsystem registers via LoaderHub**

`packages/workflow-runtime/src/keyword-bridge.ts`:
```ts
import { LoaderHub } from '@glm/core/daemon/loader-hub'
import { keywordRegistry } from '@glm/core/hooks/keywords/registry'
import type { WorkflowRegistry } from './registry'

export function registerKeywordBridge(workflowRegistry: WorkflowRegistry): void {
  LoaderHub.registerSubsystem('workflow-keywords', async (_daemon) => {
    await workflowRegistry.scan()
    const wfKeywords = (await workflowRegistry.list()).flatMap(w =>
      w.triggerKeywords.map(kw => ({ keyword: kw, target: `/${w.name}` })))
    keywordRegistry.registerSource('builtin-workflows', wfKeywords)
  })
}
```

Note: `LoaderHub.runAll(daemon)` is invoked once by P1's `Daemon.start()` after `runMigrations(db)` (P1-Fix-5). No direct edit to `packages/core/src/daemon/daemon.ts` is needed — that file is owned by P1 and only ever gains subsystem hooks via LoaderHub.

- [ ] **Step 2: Confirm P5's `KeywordRegistry` exposes `registerSource`**

P5 already creates `packages/core/src/hooks/keywords/registry.ts` with (per P5-Fix-2):

```ts
class KeywordRegistry {
  registerSource(name: string, entries: { keyword: string; target: string }[]): void
  match(prompt: string): KeywordMatch[]
}
export const keywordRegistry: KeywordRegistry
```

Skip code-blocks / URLs (already part of P5's detector — §9.17). False-positive avoidance is P5's responsibility. P9 only calls `registerSource`.

- [ ] **Step 3: Integration test**

`packages/workflow-runtime/test/integration/keyword-wire.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { keywordRegistry } from '@glm/core/hooks/keywords/registry'
import { WorkflowRegistry } from '../../src/registry'
import path from 'node:path'

describe('workflow → keyword detector wire-up', () => {
  test('autopilot keyword fires /autopilot injection', async () => {
    const reg = new WorkflowRegistry({
      builtinDirs: [path.resolve(__dirname, '..', '..', '..', 'workflows')],
      pluginDirs: [], userDirs: [],
    })
    await reg.scan()
    const entries = (await reg.list()).flatMap(w => w.triggerKeywords.map(k => ({ keyword: k, target: `/${w.name}` })))
    keywordRegistry.registerSource('builtin-workflows', entries)

    const out = keywordRegistry.match('please autopilot build me a todo app')
    expect(out).toEqual([{ keyword: 'autopilot', target: '/autopilot' }])
  })

  test('ralph keyword + ulw alias', () => {
    // implicit: trigger-keywords include both "ralph" and "the boulder never stops"
    // and ultrawork includes "ulw"
    // see WORKFLOW.md files
  })

  test('keyword inside code-block is ignored (P5 detector contract)', () => {
    keywordRegistry.registerSource('test', [{ keyword: 'autopilot', target: '/autopilot' }])
    expect(keywordRegistry.match('```\nautopilot\n```')).toEqual([])
  })
})
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/core packages/workflow-runtime
git commit -m "feat(workflows): wire trigger-keywords into P5 KeywordRegistry via LoaderHub"
```

---

## Task 25: Full integration smoke + acceptance criteria check

**Files:**
- Create: `packages/workflow-runtime/test/integration/full-smoke.test.ts`

End-to-end smoke covering the P9 acceptance criteria. This is the canary test the implementer must run at the end before declaring P9 done.

- [ ] **Step 1: Write smoke test**

```ts
import { describe, expect, test, beforeAll, afterAll } from 'vitest'
import { spawnDaemonProcess } from '../../../core/test/integration/_helper'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
const pExec = promisify(execFile)
const bin = path.resolve(__dirname, '..', '..', '..', 'cli', 'dist', 'bin.js')
const WORKFLOWS = ['autopilot','ralph','ultrawork','team','plan','ralplan','deep-dive','trace','ultraqa','self-improve','debug','verify','critic','skillify']

let d: Awaited<ReturnType<typeof spawnDaemonProcess>>
beforeAll(async () => { d = await spawnDaemonProcess({}) })
afterAll(async () => { await d.shutdown() })

describe('P9 full smoke', () => {
  test('workflow list contains all 14 built-in workflows', async () => {
    const { stdout } = await pExec('node', [bin, 'workflow', 'list'], { env: { ...process.env, GLM_HOME: d.home } })
    for (const n of WORKFLOWS) expect(stdout).toContain(n)
  })

  test('every workflow has dry-run alias', async () => {
    for (const n of WORKFLOWS) {
      const { stdout } = await pExec('node', [bin, n, '--dry-run', 'task'], { env: { ...process.env, GLM_HOME: d.home } })
      expect(stdout).toMatch(new RegExp(`would run ${n} with argument "task"`))
    }
  })

  test('workflow info dumps phases for each workflow', async () => {
    for (const n of WORKFLOWS) {
      const { stdout } = await pExec('node', [bin, 'workflow', 'info', n], { env: { ...process.env, GLM_HOME: d.home } })
      expect(stdout).toMatch(/handoff-policy:/)
      expect(stdout).toMatch(/phases:/)
    }
  })
})
```

- [ ] **Step 2: Run full suite**

```bash
pnpm vitest run
```

Expected: ALL unit + integration tests in `packages/workflow-runtime/test/` + every `packages/workflows/<name>/test/<name>.golden.test.ts` + the smoke test green.

- [ ] **Step 3: Coverage**

```bash
pnpm vitest run --coverage
```

Expected: `workflow-runtime/src` > 80% line coverage on loader, registry, runner (core paths), acceptance DSL, run repo.

- [ ] **Step 4: Final commit**

```bash
git add packages/workflow-runtime
git commit -m "test(workflow-runtime): P9 full smoke covering all 14 workflows + acceptance criteria"
```

---

## P9 Completion — Verification Checklist

Before claiming P9 done, run all of these and confirm output:

- [ ] **Build clean:** `pnpm build` → no errors
- [ ] **All tests pass:** `pnpm vitest run` → green (~25 unit, ~6 infra integration, 14 golden, 1 full-smoke)
- [ ] **CLI smoke:**
  ```bash
  export GLM_HOME=/tmp/glm-p9-$$
  rm -rf $GLM_HOME
  node packages/cli/dist/bin.js daemon start
  node packages/cli/dist/bin.js workflow list                       # expect 14 builtin names
  node packages/cli/dist/bin.js workflow info autopilot             # frontmatter + 7 phases + acceptance
  node packages/cli/dist/bin.js autopilot --dry-run "build me X"    # echo: would run autopilot...
  node packages/cli/dist/bin.js daemon stop
  ```
- [ ] **TUI smoke (manual):** open TUI, type `/autopilot --dry-run build`. Expect runner to resolve workflow but not call LLM.
- [ ] **Plugin precedence:** drop a fake `~/.claude/plugins/foo/workflows/autopilot/` and confirm `workflow info autopilot` still shows source=builtin; `workflow info foo:autopilot` shows source=plugin.
- [ ] **Keyword auto-trigger:** type `"please autopilot build a todo app"` in the TUI — UserPromptSubmit hook rewrites the prompt to `/autopilot build a todo app`.
- [ ] **Resume:** run a workflow with a forced failure (set `GLM_WF_FAIL_PHASE=executor` env to make the stub fail), confirm `workflow list-runs` shows status=failed, then `workflow resume <id>` re-enters at the failed phase.
- [ ] **Acceptance DSL covers all 7 leaves + 3 ops:** `pnpm vitest run packages/workflow-runtime/test/unit/acceptance-dsl.test.ts` → all checks green.

If anything above fails, fix before declaring P9 done.

---

## What P9 does NOT include (deferred)

These are intentionally out of scope for P9:

- **`/replan` orchestrator control** — P9 owns the `/plan <task>` workflow (Task 14). The session-level `/replan` slash (force re-plan at next boundary, no args) is owned by **P8** per manifest §0.7. No collision: P8's prior `/plan` control is renamed to `/replan`.
- **`/ccg`** (Claude-Codex-Gemini 3-model orchestration) — deferred to v0.2; provider abstraction not ready.
- **`/external-context`** — leaves the user's actual web-search infra to P10/v0.2.
- **`/visual-verdict`** — depends on vision MCP bundle (P4 covers MCP host, not vision flows).
- **`/remember`** — uses memory trio but the prompt UX is a P7/P10 feature, not a workflow node.
- **`/ai-slop-cleaner`** — wires through `code-simplifier` (used in `/ralph`'s deslop phase) but not its own first-class workflow yet.
- **`/hud`, `/configure-notifications`** — infrastructure commands, not workflows.
- **Hyperplan adversarial planning** — v0.2 per §9.22.
- **Live LLM calls in tests** — every workflow test uses `GoldenReplayOrchestrator`. Live-API smoke tests come in P10.
- **Workflow editing UI** — users can drop files in `.glm/workflows/<name>/`, but no `glm workflow edit` UX yet.
- **Acceptance DSL extensions** (custom JS predicates, MCP-tool gates) — v0.2.

P9 is the **catalog** layer. Subsequent P-plans (P10 distribution + checkpointing + long-horizon UX) wire the catalog into the 8-hour autonomous loop and ship it on npm.
