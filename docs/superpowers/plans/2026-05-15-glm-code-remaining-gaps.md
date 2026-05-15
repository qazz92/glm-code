# GLM Code v0.0.1 → v0.1.0 Remaining Gap Plan

**Date**: 2026-05-15
**Status**: Planning
**Scope**: 15 gaps from spec audit, 3 priority tiers
**Base commit**: `5d2b95f`

---

## Summary

| Tier | Count | New Files | Modified Files |
|------|-------|-----------|----------------|
| P0   | 3     | 1         | 3              |
| P1   | 6     | 4         | 8              |
| P2   | 6     | 5         | 6              |
| **Total** | **15** | **10** | **17** |

---

## P0 — Must Have (Launch Blockers)

### GAP-01: Checkpoint Full State

**Spec**: §3.4
**Current**: `checkpoint.ts` saves `{ id, ts, step, phase }` only
**Target**: Save full orchestrator state for crash recovery

#### Files

| Action | Path |
|--------|------|
| Modify | `packages/core/src/orchestrator/checkpoint.ts` |

#### Changes

Expand `CheckpointData` interface:

```typescript
interface CheckpointData {
  // Existing
  id: string;
  timestamp: number;
  step: number;
  phase: string;

  // NEW
  orchestrator_state: {
    decision: OrchestratorDecisionType | null;
    pipeline_state: PipelineState | null;
    classification: TaskClassification | null;
    model_override: string | null;
  };
  active_workers: Array<{
    id: string;
    model: string;
    task: string;
    state: WorkerStateEnum;
    elapsed_ms: number;
  }>;
  context_state: {
    messages_head_id: string | null;
    compact_summary_id: string | null;
    memory_loaded: string[];
    tokens_used: number;
    tokens_budget: number;
    context_percent: number;
  };
  rate_limits: Record<string, { used: number; max: number }>;
  files_dirty: string[];
}
```

- `saveCheckpoint()` accepts full state, writes JSON to `~/.glm/sessions/{id}/checkpoints/{step}.json`
- `loadLatestCheckpoint()` returns full `CheckpointData`
- Wire: pass orchestrator state + workers + context from `client.ts` into `saveCheckpoint()`

#### Acceptance

- [ ] `saveCheckpoint()` includes all 6 new fields
- [ ] `loadLatestCheckpoint()` returns full state
- [ ] Session recovery can restore orchestrator + pipeline + workers

---

### GAP-02: DISABLE_GLM_HOOKS Kill Switch

**Spec**: §9.15
**Current**: No env var control for hook system
**Target**: `DISABLE_GLM_HOOKS=1` disables all hooks, `GLM_SKIP_HOOKS=name1,name2` skips specific hooks

#### Files

| Action | Path |
|--------|------|
| Modify | `packages/core/src/hooks/hookEventHandler.ts` |
| Modify | `packages/core/src/hooks/hookRegistry.ts` (or equivalent) |

#### Changes

In `hookEventHandler.ts`, at the top of the dispatch function:

```typescript
function shouldSkipHooks(): boolean {
  return process.env['DISABLE_GLM_HOOKS'] === '1';
}

function shouldSkipHook(hookName: string): boolean {
  const skipList = process.env['GLM_SKIP_HOOKS'];
  if (!skipList) return false;
  return skipList.split(',').map(s => s.trim()).includes(hookName);
}
```

- If `shouldSkipHooks()` → return immediately, no hook execution
- Before each hook invocation → check `shouldSkipHook(hook.name)`
- Log when hooks are skipped (debug level)

#### Acceptance

- [ ] `DISABLE_GLM_HOOKS=1` → no hooks fire
- [ ] `GLM_SKIP_HOOKS=LoopGuard,KeywordDetector` → those 2 skip, others run
- [ ] Both env vars documented in `glm --help` output

---

### GAP-03: Hindsight Memory Auto-Injection

**Spec**: §9.16
**Current**: Memory files exist but no auto-injection at first turn
**Target**: On first user turn, inject `<memories>` XML with relevant context

#### Files

| Action | Path |
|--------|------|
| Modify | `packages/core/src/memory/context-assembler.ts` |

#### Changes

In `assembleContext()`, detect first turn (turn count === 0 or first UserPromptSubmit):

```typescript
async function buildHindsightBlock(projectDir: string): Promise<string> {
  const memories: string[] = [];

  // 1. Load memory bank files
  const bankDir = path.join(Storage.getGLMDir(), 'memory', 'bank');
  const bankFiles = await glob('*.md', { cwd: bankDir });
  for (const f of bankFiles.slice(0, 5)) {
    const content = await fs.readFile(path.join(bankDir, f), 'utf-8');
    memories.push(content.slice(0, 2000)); // cap each at 2K chars
  }

  // 2. Load project memory
  const projectMemPath = path.join(projectDir, '.glm', 'memory.json');
  if (existsSync(projectMemPath)) {
    memories.push(await fs.readFile(projectMemPath, 'utf-8'));
  }

  if (memories.length === 0) return '';

  return `<memories>\n${memories.join('\n---\n')}\n</memories>`;
}
```

- Inject as part of the `history` context block on first turn
- After first turn, do not re-inject (check turn count)
- Total hindsight block capped at 8K chars

#### Acceptance

- [ ] First turn includes `<memories>` XML with memory bank + project memory
- [ ] Subsequent turns do not include hindsight block
- [ ] Block capped at 8K chars

---

## P1 — Should Have (Quality & UX)

### GAP-04: Auto-Promotion Triggers

**Spec**: §3.6
**Current**: LONG_HORIZON classification exists but no automatic promotion
**Target**: Auto-promote to LONG_HORIZON based on step/time thresholds

#### Files

| Action | Path |
|--------|------|
| Modify | `packages/core/src/orchestrator/orchestrator.ts` |

#### Changes

```typescript
function shouldAutoPromote(state: {
  stepCount: number;
  sessionDurationMs: number;
  filesTouched: number;
  currentSize: TaskSize;
}): boolean {
  if (state.currentSize === 'LONG_HORIZON') return false;
  return (
    state.stepCount >= 20 ||
    state.sessionDurationMs >= 3_600_000 || // 1 hour
    (state.stepCount >= 30) ||
    (state.filesTouched > 3 && state.stepCount >= 10)
  );
}
```

- Call in orchestrator decision loop after each turn
- On promotion: log `🚀 Auto-promoted to LONG_HORIZON (step=${n}, files=${m})`
- Set pipeline state to 'plan' phase
- Pass to `advancePipeline()`

#### Acceptance

- [ ] Step ≥ 20 triggers auto-promotion
- [ ] Session duration ≥ 1h triggers auto-promotion
- [ ] Promotion creates pipeline with plan phase
- [ ] One-time promotion (does not re-trigger)

---

### GAP-05: GLM MCP Bundled Auto-Registration

**Spec**: §9.12
**Current**: MCP client exists but no GLM-specific server auto-registration
**Target**: Auto-register glm-vision, glm-web-search, glm-web-reader, glm-zread on first run

#### Files

| Action | Path |
|--------|------|
| Create | `packages/core/src/tools/glm-mcp-bundle.ts` |
| Modify | `packages/cli/src/config/settings.ts` or config init |

#### Changes

```typescript
const GLM_BUNDLED_MCP_SERVERS = {
  'glm-vision': {
    command: 'npx',
    args: ['-y', '@glm-code/mcp-vision'],
    description: 'Image analysis and vision capabilities',
  },
  'glm-web-search': {
    command: 'npx',
    args: ['-y', '@glm-code/mcp-web-search'],
    description: 'Web search via z.ai',
  },
  'glm-web-reader': {
    command: 'npx',
    args: ['-y', '@glm-code/mcp-web-reader'],
    description: 'Web page content extraction',
  },
  'glm-zread': {
    command: 'npx',
    args: ['-y', '@glm-code/mcp-zread'],
    description: 'Document reading (PDF, DOCX, etc.)',
  },
};
```

- `ensureBundledServers()`: reads `~/.glm/settings.json` → if `mcpServers` missing any bundled server → adds it
- Call during config initialization (first `glm` run or when `settings.json` doesn't exist)
- User can override/disable by setting `disabled: true`

#### Acceptance

- [ ] First run auto-registers 4 GLM MCP servers in settings
- [ ] Subsequent runs don't duplicate
- [ ] User can disable individual servers

---

### GAP-06: 7-Action System

**Spec**: §9.23
**Current**: No action concept, just model switching
**Target**: 7 named actions with model + thinking + temperature presets

#### Files

| Action | Path |
|--------|------|
| Create | `packages/core/src/models/action-registry.ts` |
| Modify | `packages/core/src/models/modelConfigResolver.ts` |
| Modify | `packages/cli/src/ui/components/InputPrompt.tsx` (action display) |

#### Changes

```typescript
type GLMAction = 'default' | 'smol' | 'slow' | 'plan' | 'designer' | 'commit' | 'task';

interface ActionConfig {
  model: string;
  thinking: ThinkingLevel;
  temperature: number;
  description: string;
}

const ACTION_MAP: Record<GLMAction, ActionConfig> = {
  default:   { model: 'GLM-5.1',       thinking: 'inherit', temperature: 0.7, description: 'Balanced coding' },
  smol:      { model: 'GLM-4.5-Air',   thinking: 'off',     temperature: 0.3, description: 'Quick tasks' },
  slow:      { model: 'GLM-5.1',       thinking: 'high',    temperature: 0.3, description: 'Deep reasoning' },
  plan:      { model: 'GLM-5.1',       thinking: 'high',    temperature: 0.2, description: 'Planning & architecture' },
  designer:  { model: 'GLM-5.1',       thinking: 'medium',  temperature: 0.9, description: 'Creative/visual' },
  commit:    { model: 'GLM-4.5-Air',   thinking: 'off',     temperature: 0.0, description: 'Commit messages' },
  task:      { model: 'GLM-5-Turbo',   thinking: 'low',     temperature: 0.5, description: 'Delegated tasks' },
};
```

- `/action <name>` command switches active action
- HUD shows current action name + model
- `resolveModelForAction(action)` → returns model config
- Default: `default`

#### Acceptance

- [ ] 7 actions defined with correct model/thinking/temp
- [ ] `/action` command switches action
- [ ] HUD displays current action
- [ ] Model selection uses action config

---

### GAP-07: Agent Role Frontmatter

**Spec**: §9.14, §9.23
**Current**: Agents have name, description, systemPrompt, tools
**Target**: Add model, thinking, level, action frontmatter fields

#### Files

| Action | Path |
|--------|------|
| Modify | `packages/core/src/subagents/builtin-agents.ts` |

#### Changes

Extend agent definition interface:

```typescript
interface AgentDefinition {
  name: string;
  description: string;
  systemPrompt: string;
  tools?: string[];
  // NEW
  model?: string;          // Override model for this agent
  thinking?: ThinkingLevel; // Thinking effort
  level?: number;          // 1-3 depth limit
  action?: GLMAction;      // Associated action slot
  maxOutputTokens?: number; // Output limit (default 4096)
}
```

- Add frontmatter to all 20 agent definitions
- `resolveAgentModel(agent)` → returns agent.model ?? action.model ?? default model
- Sub-agent spawn uses resolved model

#### Acceptance

- [ ] All 20 agents have model/thinking/level fields
- [ ] Sub-agent spawn uses per-agent model

---

### GAP-08: Diff Display Optimization

**Spec**: §8.12
**Current**: After edit, full file content returned to LLM
**Target**: Only diff hunks shown after edit operations

#### Files

| Action | Path |
|--------|------|
| Create | `packages/core/src/tools/diff-renderer.ts` |
| Modify | `packages/core/src/tools/edit.ts` |
| Modify | `packages/core/src/tools/write-file.ts` |

#### Changes

```typescript
function renderEditDiff(
  filePath: string,
  originalContent: string,
  newContent: string,
  maxContextLines: number = 3
): string {
  const hunks = diffLines(originalContent, newContent);
  if (hunks.length === 0) return `No changes in ${filePath}`;

  const parts: string[] = [`Edit: ${filePath}`];
  let lineNum = 1;

  for (const hunk of hunks) {
    if (hunk.type === 'unchanged') {
      lineNum += hunk.value.split('\n').length - 1;
      continue;
    }
    // Context before
    const contextLines = hunk.value.split('\n');
    parts.push(`@@ Line ${lineNum}`);
    for (const line of contextLines) {
      const prefix = hunk.type === 'added' ? '+' : '-';
      parts.push(`${prefix} ${line}`);
      lineNum++;
    }
  }
  return parts.join('\n');
}
```

- After edit/write: compute diff between old and new content
- Return diff instead of full file when change is < 20% of file
- If change > 20%: return full file (diff would be larger)
- Include file path + line numbers in output

#### Acceptance

- [ ] Small edits return diff hunks only
- [ ] Large changes (>20%) return full file
- [ ] Line numbers included in diff output

---

### GAP-09: Yolo 3-Tier Enforcement

**Spec**: §12.7
**Current**: Yolo mode exists but no tier classification
**Target**: Tools classified into 3 tiers with different auto-approval

#### Files

| Action | Path |
|--------|------|
| Modify | `packages/core/src/permissions/permission-manager.ts` |
| Create | `packages/core/src/permissions/tool-tiers.ts` |

#### Changes

```typescript
type PermissionTier = 'A' | 'B' | 'C';

const TOOL_TIERS: Record<string, PermissionTier> = {
  // TIER A — Always auto-approve (read-only, no side effects)
  Read: 'A', Glob: 'A', Grep: 'A', LSP: 'A', WebSearch: 'A',
  Memory_recall: 'A', ToolSearch: 'A',

  // TIER B — Auto-approve in workspace (edits, writes, bash in project)
  Edit: 'B', Write: 'B', Bash: 'B', Task: 'B',
  Memory_retain: 'B', Commit: 'B',

  // TIER C — Hard whitelist (destructive, external)
  Shell: 'C', WebFetch: 'C', MCP: 'C',
};

function shouldAutoApprove(
  toolName: string,
  yoloMode: 'off' | 'tier-a' | 'tier-b' | 'full',
  isWorkspaceFile: boolean
): boolean {
  if (yoloMode === 'full') return true;
  if (yoloMode === 'off') return false;

  const tier = TOOL_TIERS[toolName] ?? 'C';
  if (tier === 'A') return true;
  if (tier === 'B' && yoloMode === 'tier-b' && isWorkspaceFile) return true;
  return false;
}
```

- `glm --yolo` → tier-b (safe default)
- `glm --yolo=full` → all auto
- `glm --yolo=safe` → tier-a only
- Permission manager uses `shouldAutoApprove()` before prompting user

#### Acceptance

- [ ] 3-tier tool classification complete
- [ ] Yolo modes map to tiers correctly
- [ ] Tier-C tools always require confirmation

---

## P2 — Nice to Have (Polish)

### GAP-10: Thinking Effort 7-Level

**Spec**: §9.23
**Current**: No thinking effort control
**Target**: 7 levels with budget mapping

#### Files

| Action | Path |
|--------|------|
| Create | `packages/core/src/models/thinking-config.ts` |
| Modify | `packages/core/src/core/client.ts` |

#### Changes

```typescript
type ThinkingLevel = 'inherit' | 'off' | 'min' | 'low' | 'medium' | 'high' | 'xhigh';

const THINKING_BUDGETS: Record<ThinkingLevel, number | null> = {
  inherit: null,    // Use model default
  off: 0,
  min: 1024,
  low: 4096,
  medium: 16384,
  high: 65536,
  xhigh: 131072,
};
```

- `/thinking <level>` command
- Stored in session state
- Applied to LLM call `thinkingConfig.budgetTokens`

#### Acceptance

- [ ] 7 levels with token budgets
- [ ] `/thinking` command works
- [ ] Budget applied to LLM calls

---

### GAP-11: Hook Plugin SDK

**Spec**: §9.15
**Current**: Function hooks exist but no formal SDK
**Target**: `defineHook()` API with full context

#### Files

| Action | Path |
|--------|------|
| Create | `packages/core/src/hooks/plugin-sdk.ts` |

#### Changes

```typescript
interface HookContext {
  tmux: TmuxAPI;
  log: (msg: string) => void;
  state: StateAPI;
  session: SessionAPI;
  hud: (text: string) => void;
  notify: (msg: string) => void;
  glm: (prompt: string) => Promise<string>;
}

interface HookDefinition {
  name: string;
  event: HookEventName;
  handler: (ctx: HookContext, payload: unknown) => Promise<HookResult | void>;
}

function defineHook(definition: HookDefinition): HookDefinition {
  return definition;
}
```

- Export from `@glm-code/core`
- Users can create `.glm/hooks/my-hook.ts` using `defineHook()`
- Hook system auto-loads user hooks from `~/.glm/hooks/`

#### Acceptance

- [ ] `defineHook()` API exported
- [ ] User hooks auto-loaded from `~/.glm/hooks/`
- [ ] Context API with tmux/log/state/session/hud/notify/glm

---

### GAP-12: Bidirectional Notification

**Spec**: §9.19
**Current**: One-way webhooks (Telegram/Discord/Slack)
**Target**: Reply daemon that receives replies and feeds back to session

#### Files

| Action | Path |
|--------|------|
| Create | `packages/core/src/notifications/reply-daemon.ts` |

#### Changes

- Telegram: long-poll `getUpdates` for replies to bot messages
- Discord: WebSocket gateway for message events
- Map reply → session ID → inject as user message
- `/notify reply on/off` toggle

#### Acceptance

- [ ] Telegram reply daemon receives messages
- [ ] Replies injected into active session
- [ ] Toggle command works

---

### GAP-13: Process Recycling

**Spec**: §4.2
**Current**: No process recycling
**Target**: Recycle at natural boundaries (between turns, not during LLM call)

#### Files

| Action | Path |
|--------|------|
| Create | `packages/core/src/core/process-recycler.ts` |
| Modify | `packages/core/src/core/client.ts` |

#### Changes

- Track memory usage per turn via `process.memoryUsage()`
- If heap > 512MB after turn completion → schedule recycle
- Recycle = graceful shutdown + respawn (IPC preserve)
- Never recycle during in-flight LLM call

#### Acceptance

- [ ] Memory monitoring per turn
- [ ] Graceful recycle at turn boundary
- [ ] No recycle during LLM call

---

### GAP-14: Content-Addressable Snapshot

**Spec**: §11.4
**Current**: No snapshot system
**Target**: Before/after SHA per edit step, dedup storage

#### Files

| Action | Path |
|--------|------|
| Create | `packages/core/src/tools/snapshot-store.ts` |

#### Changes

```typescript
class SnapshotStore {
  // Store content blob, return SHA-256 hash
  async put(content: string): Promise<string>;

  // Get content by hash
  async get(hash: string): Promise<string | null>;

  // Record edit snapshot
  async recordEdit(
    sessionId: string,
    step: number,
    filePath: string,
    beforeHash: string,
    afterHash: string
  ): Promise<void>;

  // Get diff between two snapshots
  async getDiff(beforeHash: string, afterHash: string): Promise<string>;
}
```

- Storage: `~/.glm/snapshots/XX/XXXX...` (first 2 chars as dir)
- Auto-record on every edit/write
- `/snapshots` command to browse history

#### Acceptance

- [ ] Every edit recorded with before/after SHA
- [ ] Content dedup via hash
- [ ] Diff retrieval works

---

### GAP-15: /model Picker TUI

**Spec**: §9.23
**Current**: `/model` text-based
**Target**: Interactive picker with tab cycling

#### Files

| Action | Path |
|--------|------|
| Create | `packages/cli/src/ui/components/ModelPicker.tsx` |
| Modify | `packages/cli/src/ui/components/InputPrompt.tsx` |

#### Changes

- Tab key cycles through modes: ALL → CANONICAL → ZAI → back
- Shows model list with current selection highlighted
- Enter confirms selection
- Shows thinking effort alongside model name
- Up/Down arrows navigate within mode

#### Acceptance

- [ ] Tab cycles through 3 mode groups
- [ ] Arrow keys navigate models
- [ ] Enter selects model
- [ ] Thinking effort shown

---

## Execution Order

```
Phase 1 (P0): GAP-01, GAP-02, GAP-03          — sequential, 30 min
Phase 2 (P1): GAP-04, GAP-05, GAP-06            — parallel
              GAP-07, GAP-08, GAP-09             — parallel
Phase 3 (P2): GAP-10, GAP-11, GAP-12            — parallel
              GAP-13, GAP-14, GAP-15             — parallel
Final: Build + Test + Commit
```

## Verification

After all gaps closed:

1. `npx tsc --noEmit` — 0 errors in core + cli (non-test)
2. `npm run bundle` — clean
3. `glm --version` → `0.1.0`
4. `glm --help` — all commands present
5. `glm doctor` — diagnostics pass
6. No `qwen` references in source
7. No deprecation warnings
