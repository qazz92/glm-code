# Execution Orchestration — glm code v0.1

**Purpose:** Single entry point for executing the 10 implementation plans. Defines order, review checkpoints, acceptance gates, bootstrap strategy, failure recovery, and links to every plan + manifest.

**Audience:** The executor (human + subagent-driven-development session, or inline executing-plans session).

**Read this BEFORE starting any plan.**

---

## 0. Documents in this Project

| Document | Path | Purpose |
|----------|------|---------|
| **Spec** | [`docs/superpowers/specs/2026-05-14-glm-code-design.md`](../specs/2026-05-14-glm-code-design.md) | Ground truth for design decisions. 1,903 lines, 19 sections + 22 §9.X sub-sections. |
| **Fix Manifest** | [`FIX-MANIFEST.md`](FIX-MANIFEST.md) | Canonical decisions (RPC API, migrations, LoaderHub, etc.). Read §0 of manifest before any plan. |
| **P1** Daemon Core | [`2026-05-14-glm-code-p1-daemon-core.md`](2026-05-14-glm-code-p1-daemon-core.md) | Foundation: daemon + IPC + SQLite (2,263 lines, 12+ tasks) |
| **P2** Ink TUI | [`2026-05-14-glm-code-p2-tui.md`](2026-05-14-glm-code-p2-tui.md) | Chat REPL + Dashboard + slash dispatcher (2,965 lines, 13+ tasks) |
| **P3** Tool Layer | [`2026-05-14-glm-code-p3-tools.md`](2026-05-14-glm-code-p3-tools.md) | Read/Edit/Bash/Hashline/URL router (4,005 lines, 15+ tasks) |
| **P4** MCP/Skill/Plugin | [`2026-05-14-glm-code-p4-mcp-skill-plugin.md`](2026-05-14-glm-code-p4-mcp-skill-plugin.md) | Claude Code compat + bundled GLM MCPs (4,942 lines, 17 tasks) |
| **P5** Hooks & Events | [`2026-05-14-glm-code-p5-hooks-events.md`](2026-05-14-glm-code-p5-hooks-events.md) | 31-event lifecycle + keyword detector + delegation (3,225 lines, 14+ tasks) |
| **P6** LLM Router | [`2026-05-14-glm-code-p6-llm-router.md`](2026-05-14-glm-code-p6-llm-router.md) | Anthropic + OpenAI providers + quota + retry (4,211 lines, 16+ tasks) |
| **P7** Memory + LSP | [`2026-05-14-glm-code-p7-memory-context-lsp.md`](2026-05-14-glm-code-p7-memory-context-lsp.md) | AGENTS.md cascade + compaction + trio + LSP (6,534 lines, 28 tasks) |
| **P8** Orchestrator + Agents | [`2026-05-14-glm-code-p8-orchestrator-agents.md`](2026-05-14-glm-code-p8-orchestrator-agents.md) | Scheduler + sub-agent fan-out + 20 roles (4,131 lines, 20 tasks) |
| **P9** Workflows | [`2026-05-14-glm-code-p9-workflows.md`](2026-05-14-glm-code-p9-workflows.md) | 14 built-in workflows (autopilot/ralph/team/plan/...) (3,407 lines, 25+ tasks) |
| **P10** Polish | [`2026-05-14-glm-code-p10-polish-longhorizon-yolo.md`](2026-05-14-glm-code-p10-polish-longhorizon-yolo.md) | Long-horizon + yolo + resilience + export/gc/diff + release (6,581 lines, 24+ tasks) |

**Total**: ~42,000 lines, 184 tasks, 1,121 steps across 10 plans.

---

## 1. Dependency Graph & Execution Order

```
                            ┌─────────────────┐
                            │   P1 daemon     │ Week 1-2
                            │   core+IPC+DB   │
                            └────────┬────────┘
                                     │
              ┌──────────────────────┼──────────────────────┐
              │                      │                      │
              ▼                      ▼                      ▼
       ┌───────────┐          ┌─────────────┐        ┌──────────────┐
       │ P2 TUI    │ Week 1-2 │ P3 tools    │ Week 2 │ P6 LLM router│ Week 4
       │ (parallel │ parallel │ (hashline   │        │ (real GLM    │ (parallel
       │  w/ P1)   │          │  + URLs)    │        │  API)        │  w/ P4-5)
       └───────────┘          └──────┬──────┘        └──────┬───────┘
                                     │                      │
                              ┌──────┴──────┐               │
                              ▼             ▼               │
                        ┌──────────┐  ┌──────────┐          │
                        │ P4 MCP/  │  │ P5 hooks │          │
                        │ Skill/   │→ │ + events │          │
                        │ Plugin   │  │ (depends │          │
                        │          │  │  on P4)  │          │
                        │ Week 3-5 │  │ Week 5   │          │
                        └──────────┘  └──────────┘          │
                                            │               │
                                            └──────┬────────┘
                                                   ▼
                                            ┌──────────────┐
                                            │ P7 memory +  │ Week 5-7
                                            │ context+LSP  │
                                            │ (needs P3+P5 │
                                            │  +P6)        │
                                            └──────┬───────┘
                                                   │
                                                   ▼
                                            ┌─────────────────┐
                                            │ P8 orchestrator │ Week 6-8
                                            │ + 20 agents     │
                                            │ (needs P5+P6+P7)│
                                            └──────┬──────────┘
                                                   │
                                                   ▼
                                            ┌─────────────────┐
                                            │ P9 14 workflows │ Week 9-10
                                            │ (needs P8)      │
                                            └──────┬──────────┘
                                                   │
                                                   ▼
                                            ┌─────────────────┐
                                            │ P10 polish/yolo │ Week 11-12
                                            │ longhorizon     │
                                            │ release polish  │
                                            └─────────────────┘
                                                   │
                                                   ▼
                                               v0.1 GA
```

### Recommended sequential order (single-thread executor)
1. **P1** — must finish first
2. **P3** — depends on P1
3. **P2** — depends on P1 (can run parallel to P3 if 2 sessions)
4. **P6** — depends on P1 (can run parallel to P4-P5 in a 2-session setup)
5. **P4** — depends on P1+P3
6. **P5** — depends on P1+P4
7. **P7** — depends on P1+P3+P5+P6
8. **P8** — depends on P1+P5+P6+P7
9. **P9** — depends on P8
10. **P10** — depends on All

### Parallel order (2-3 sessions)
- Wave A: **P1**
- Wave B: **P2 + P3 + P6** (parallel)
- Wave C: **P4 + P5** (sequential — P5 needs P4)
- Wave D: **P7**
- Wave E: **P8**
- Wave F: **P9**
- Wave G: **P10**

Total: ~12 weeks single-thread, ~9-10 weeks 2-3 parallel sessions.

---

## 2. Execution Method (per plan)

### 2.1 Recommended: Subagent-Driven Development

For each plan:
1. Invoke `superpowers:subagent-driven-development` skill.
2. Skill dispatches a fresh subagent per task in the plan.
3. Between tasks, the main session reviews diff + runs tests.
4. On failure, subagent retries with feedback.
5. When the last task passes, run the plan's "P_N Completion Verification Checklist".

Benefits: fresh context per task, fast iteration, no context bloat.

### 2.2 Alternative: Inline Execution

For each plan:
1. Invoke `superpowers:executing-plans` skill.
2. Skill batches tasks in the current session.
3. Manual checkpoint review between batches.

Use only if subagent-driven is unavailable. Risk: context accumulates.

### 2.3 Mid-plan halts

If a task fails and can't be resolved in 1-2 retries:
1. Mark the failed task in the plan with `❌ blocked: <reason>`.
2. Decide:
   - **Skip**: if non-critical and other tasks in this plan don't depend on it.
   - **Loop back**: if the task is foundational (most tasks).
   - **Punt to v0.2**: edit the plan's "What this does NOT include" section to add the punted item; tag in commit.

---

## 3. Pre-Plan Checklist (run BEFORE starting each plan)

Every plan starts with these 4 verifications. **Skip them and you risk drift.**

```bash
cd /Users/glen/twelvelabs_works/study/docs/superpowers/plans/

# 1. Pre-reqs done? (replace P_PREV with the previous plan number)
#    Each plan's "Completion Verification Checklist" must have ALL items checked.
grep -c "^- \[x\]" 2026-05-14-glm-code-p${P_PREV}-*.md   # all task checkboxes done?

# 2. Workspace clean?
cd /Users/glen/twelvelabs_works/study/
git status                                  # should be on a clean branch from prev plan's commits

# 3. Plans not drifted?
grep -cE "\.rpc\.(register|method)\(" 2026-05-14-glm-code-p*.md   # must be 0
grep -cE "packages/hooks/" 2026-05-14-glm-code-p*.md              # must be 0 in plans

# 4. Build green?
pnpm build && pnpm test    # only after P1 is done; trivially-pass before
```

If any check fails, fix the breakage before starting the new plan.

---

## 4. Per-Plan Acceptance Gates

Each plan must pass its own gate before the next plan starts. These gates are defined inside each plan's "Completion Verification Checklist" section.

| Plan | Gate (high-level summary; see plan for full list) | Bootstrap milestone |
|------|--------------------------------------------------|---------------------|
| P1 | `glm daemon start/stop/status/restart` works; `glm "echo X"` echoes; sessions persist in SQLite; crash recovery handles stale PID; coverage ≥ 80% core | none yet |
| P2 | Ink TUI launches; `Tab` toggles Chat/Dashboard; built-in slash commands + catch-all dispatcher work; theme env honored | none yet |
| P3 | All built-in tools functional; hashline edit success rate ≥ 90% on smoke tests; internal URL router dispatches all schemes (stubs for later phases) | none yet |
| P4 | Claude Code MCP/Skill/Plugin/Slash configs load 100%; bundled GLM MCPs auto-bootstrap on first daemon start; OAuth flow works | none yet |
| P5 | All 31 hook events fire; keyword detector activates workflows from natural language; delegation enforcer maps categories → model/temperature | none yet |
| P6 | Real GLM API calls work via Anthropic + OpenAI endpoints; quota tracked across 3 pools; idempotency cache hits; retry policy enforced; `message.send` no longer echoes — real LLM. | **🚀 v0.0.6 Bootstrap milestone**: glm can self-edit small files |
| P7 | AGENTS.md cascade resolves; compaction triggers at ~88% and produces structured Markdown; memory trio persists; LSP auto-spawns for typescript/python; PostEdit diagnostics appear | **🚀 v0.0.7 Self-multi-file** |
| P8 | Sub-agent fan-out spawns child processes; rate-limit scheduler queues correctly (GLM-5-Turbo: 1 slot); pipeline phases auto-promote; 20 agent roles loadable with boundaries | **🚀 v0.0.8 Self-orchestrate** |
| P9 | All 14 workflows runnable with golden-replay tests; trigger keywords auto-activate; acceptance DSL evaluates; runner binds to P8 orchestrator | **🚀 v0.0.9 Self-workflowed** |
| P10 | 8h mock long-horizon nightly passes; yolo 3-tier policy enforced; notifications dispatch (notify-only); session export/import; `glm gc` cleans up; `glm doctor` all green; CI weekly real-LLM regression ≤ $5 | **🚀 v0.1 GA** — full self-driven |

The "Bootstrap milestone" column tracks when glm itself becomes useful for developing glm. See §6 for the bootstrap transition strategy.

---

## 5. Review Protocol

### 5.1 Task-level review (within a plan)

After every task:
1. **Diff scan** — read the actual changes vs the plan's expected `Files: Create/Modify` list. Verify nothing extra was created.
2. **Test run** — execute the `Run:` commands from the task's last step. Expect PASS.
3. **No-regression check** — run `pnpm test` for the package(s) the task touched. Other test suites stay green.
4. **Spec coherence check** — the task's outputs match the spec section it claims to implement.

If all 4 pass → mark task checkbox `[x]` in the plan file. Move on.

If any fail → see §2.3 mid-plan halts.

### 5.2 Plan-level review (between plans)

After all tasks in a plan are checked:
1. Run the **Completion Verification Checklist** section at the end of the plan. Every bullet must pass.
2. **Cross-plan smoke test**: ensure no earlier plan's tests now fail. Run `pnpm test` from repo root.
3. **Doctor check**: after the daemon is functional (P1+), run `glm doctor` and verify HEALTHY (or only acceptable warnings).
4. **Spec coverage check**: compare what this plan implemented vs spec sections it claims to cover. Run:
   ```bash
   grep -nE "spec §|spec section" <plan>.md
   ```
   For each section reference, eyeball the spec section and confirm coverage.
5. **Manifest invariant check**:
   ```bash
   cd docs/superpowers/plans
   grep -cE "\.rpc\.(register|method)\(" *.md             # must be 0
   grep -cE "packages/hooks/" 2026-05-14-glm-code-p*.md   # must be 0
   grep -cE "createUrlRouter|UrlHandlerResult" *.md       # must be 0 in code blocks
   grep -cE "Modify: .*core/src/daemon/daemon\.ts" *.md   # must be ≤ 1 (only P1 Task 12)
   ```

If anything fails → fix before starting the next plan. Drift compounds; catching at plan boundary is cheap.

### 5.3 Dogfooding review (from P6+)

After P6 lands the bootstrap milestone:
1. Use the new glm for SMALL real-world edits in its own codebase. Track:
   - hashline edit success rate
   - LLM token cost per turn (idempotency cache hit %)
   - daemon stability (crashes per hour)
2. Every glm-found bug → add as a regression test fixture in the relevant plan's test directory.
3. Daily dogfooding session: ≥ 1 hour using glm to develop glm.
4. Failures discovered via dogfooding can update the plan being executed (e.g., during P7 dev, a P3 hashline bug surfaces → fix in current branch, add note to P3 "completed verification" appendix).

---

## 6. Bootstrap Strategy (when glm builds glm)

| Phase | Time | glm role | Claude Code role | Transition trigger |
|-------|------|---------|------------------|-------------------|
| Pre-P6 | Week 1-7 | none | 100% (or your usual IDE) | until P6 completes |
| **P6 done** | Week 8 | **5%** — typo / 1-file fix / test add | 95% | hashline ✓ ≥ 90% in P3 bench |
| P7 done | Week 9 | 25% — single-feature dev | 75% | LSP diagnostics work + memory eviction stable |
| P8 done | Week 10 | 60% — orchestrated multi-file | 40% | sub-agent 4K contract enforced + cache hit ≥ 70% |
| P9 done | Week 11 | 85% — `/plan` `/ralph` everyday | 15% | all 14 workflows golden-replay pass |
| P10 done (v0.1 GA) | Week 12 | **95%+** daily-driver, `/autopilot` `/yolo` | 5% — Claude Code as kill switch | 8h nightly 7-day no-incident |

**First self-task** (P6 milestone — earliest moment glm can edit itself):
```bash
glm "fix typos in packages/core/src/*.ts comments"
glm "add a test for SessionRepo.markInactive in packages/core/test/unit/session-repo.test.ts"
glm "rename internal variable fooBar to fooBarHandler in packages/core/src/rpc/methods/ping.ts"
```

**First self-orchestrated task** (P8 milestone):
```bash
glm /plan "implement workflow phase 1 for skillify — extract recurring patterns"
# orchestrator decomposes, sub-agents work in parallel, you review
```

**First self-yolo run** (P10 milestone, overnight):
```bash
glm /ralph "complete all v0.1 yolo audit-log polish tasks" --yolo --max-duration 8h
# wake up to a series of small commits to review
```

---

## 7. Failure Recovery

### 7.1 If a subagent goes off-track mid-plan

1. **Pause**: `Ctrl+C` the subagent loop, or send abort signal to active task.
2. **Save state**: commit current uncommitted-but-valuable work to a `wip/...` branch.
3. **Diagnose**: re-read the task's `**Files:**` list and the actual diff. What deviated?
4. **Choose**:
   - **Re-dispatch task**: with explicit constraint about what NOT to do.
   - **Manual edit**: apply the task's intended diff yourself, mark complete.
   - **Skip + open issue**: rare; only if the task is truly non-essential.
5. **Re-baseline**: `git diff --stat` to confirm only intended files changed.
6. **Continue**: pick up at next task.

### 7.2 If a plan's verification checklist fails

1. The plan is NOT done. Do not start the next plan.
2. Identify which checklist item failed.
3. Trace back to the responsible task in the plan.
4. Re-execute that task (or its broken step).
5. Re-run the full plan verification.
6. Only mark plan complete when 100% green.

### 7.3 If glm itself breaks during dogfooding (P6+)

This is **valuable** signal — exactly what dogfooding is for.
1. Capture: `glm bug report` (after P10) or manually copy daemon.log + session transcript.
2. Reproduce: minimal test case → add to the relevant plan's test suite as a regression fixture.
3. Fix: in current branch (whatever plan you're on).
4. Backport: if the bug is in a finished plan's code, fix it in that plan's package — the active plan's branch is fine for the fix commit.
5. Continue.

### 7.4 If the daemon corrupts SQLite or loses session state

1. Daemon should auto-recover via P1's stale-PID handling + WAL rollback.
2. If not: `glm daemon stop --force` then `glm daemon start`.
3. If session lost: check `~/.glm/sessions/<id>/checkpoints/` for latest snapshot — manually restore.
4. After P1's pre-migration backup (P1-Fix-3) lands, you have `.glm/registry.db.pre_migration_v<N>.bak` as fallback.

---

## 8. Test Strategy Summary (already in each plan, recap)

| Layer | Run frequency | Owner | Plan tests count target |
|-------|--------------|-------|-------------------------|
| Unit | every save | dev | 250+ at GA |
| Integration | every PR | CI | 80+ at GA |
| Compat (CC asset load) | every PR | CI | 10+ |
| E2E (golden replay) | every PR | CI | 10+ |
| Nightly long-horizon (8h mock) | nightly | CI | 1 — 7-day streak required |
| Weekly real-LLM regression | weekly | CI ($5 budget) | ~100 fixtures |
| Hashline benchmark (P3-Fix-7) | weekly real-LLM | CI | edit ✓ ≥ 90% gate |
| Leak/RSS regression | nightly | CI | heap delta < 50MB over 10k turns |

---

## 9. v0.1 GA Acceptance Criteria (final gate)

Cannot ship v0.1 unless ALL pass:

- [ ] All 10 plans' Completion Verification Checklists are 100% checked.
- [ ] `pnpm test` passes from repo root (250+ unit + 80+ integration + 10+ e2e).
- [ ] Hashline edit success rate ≥ 90% on GLM-5.1 (P3-Fix-7 weekly real-LLM bench).
- [ ] 8h mock long-horizon nightly green for 7 consecutive days.
- [ ] Daemon crash rate < 0.01/h (measured via telemetry over 7-day window).
- [ ] `glm doctor` HEALTHY on a clean machine (no warnings on basic install).
- [ ] CC asset compat: `~/.claude/` directory mounted → glm loads and runs zero-edit.
- [ ] Memory regression: heapUsed delta < 50MB over 10k mock turns.
- [ ] Distribution: `npm install -g @glm/code` works on macOS + Linux + Windows.
- [ ] Documentation: README + quickstart + reference complete.
- [ ] License: MIT, with full 3rd-party NOTICE per spec §14.6.
- [ ] Maintainer dogfood: 7 consecutive days using glm as primary coding tool (no fallback to CC except as kill switch).

---

## 10. Index of Bootstrap Self-Tests (collected from §6)

After P6 / P7 / P8 / P9 / P10, run these to confirm bootstrap milestones:

```bash
# After P6
glm "fix typos in packages/core/src/*.ts comments"
git diff --stat            # ≤ 10 files, small changes
glm doctor                  # HEALTHY

# After P7
glm "rename SessionRepo.markInactive to SessionRepo.deactivate across the codebase"
# expected: 1 LSP rename + ~5 file edits + tests still pass
pnpm test

# After P8
glm /plan "implement /external-context workflow phase 1"
# orchestrator decomposes, you review the plan
glm /auto --confirm        # let orchestrator execute
git log --oneline -10      # ≥ 5 sub-agent commits, structured

# After P9
glm /ralph "complete /external-context workflow remaining phases" --max-iter 5
# self-completion loop, with verification gates

# After P10
glm /autopilot "add a small Recipe tool unit test for Cargo detection" --yolo --max-duration 30m
# fully autonomous, your audit log shows every decision
glm yolo audit <session-id>
```

---

## 11. Quick Reference Card

```
ENTRY POINT:     This file (EXECUTION-ORCHESTRATION.md)
SPEC:            ../specs/2026-05-14-glm-code-design.md
MANIFEST:        FIX-MANIFEST.md (read §0 before any plan)
START PLAN:      2026-05-14-glm-code-p1-daemon-core.md

EXECUTION SKILL: superpowers:subagent-driven-development  (preferred)
       OR:       superpowers:executing-plans              (inline)

PROGRESS TRACKING: each plan's `- [ ]` checkboxes
PLAN GATE:        run the plan's "Completion Verification Checklist"
GLOBAL CHECK:     §3 Pre-Plan Checklist (manifest invariants)

DOGFOODING START: after P6 completes (Week 8 in 12-week schedule)
v0.1 GA:          §9 Acceptance Criteria 100% pass
```

---

*End of orchestration document. Start with P1 and follow this guide top-to-bottom.*
