# glm code — Design Specification

| | |
|---|---|
| **Date** | 2026-05-14 |
| **Status** | Draft (pending user review) |
| **Target audience** | GLM Coding Plan ($18/mo) 사용자 — Lite / Pro / Max |
| **License (planned)** | MIT |
| **Distribution (planned)** | npm `@glm/code` (CLI binary: `glm`) |

---

## 0. 한 문장 요약

> **GLM-5.1 의 8시간 자율 실행을 현실로 만드는, GLM Coding Plan 전용의 daemon-first 코딩 에이전트 CLI.** Claude Code / opencode / qwen-code / oh-my-pi 의 핵심 장점만 합성하고, 200K 컨텍스트의 한계를 **공격적인 sub-agent 위임 + AGENTS.md cascade + opencode-style 컴팩션 + GLM prompt caching** 으로 우회한다. Claude Code 의 MCP / Skill / Plugin / Hook / Slash command 자산을 100% 호환 read 한다.

---

## 1. Goals & Non-Goals

### Goals
1. **GLM Coding Plan 정액제의 가치 극대화** — Daily-driver 코딩 도구.
2. **GLM-5.1 의 "8시간 자율 실행" 마케팅 약속을 진짜로 실현** — checkpoint / resume / journal.
3. **차별화된 신제품**: Claude Code 의 fork 가 아닌 우리 코드, 단 CC 의 자산 (skill/MCP 등) 은 호환 read.
4. **오픈소스로 공개**: GLM 진영의 첫 1급 시민 에이전트.
5. **토큰 = 돈 원칙**: 진행 중 LLM 호출은 절대 중단 안 함, idempotency cache, 부분 응답 보존.
6. **200K 컨텍스트의 약점을 강점으로 전환**: sub-agent fan-out 으로 사실상 1M+ 컨텍스트 효과.
7. **"하나의 제품" — OMC 류 고수준 워크플로 (autopilot/ralph/ultrawork/team/plan/trace/...) + 20여개 specialized agent role 을 별도 플러그인이 아니라 빌트인으로 제공**. 사용자는 깔자마자 모든 기능 사용 가능.

### Non-Goals (v0.1)
- 다른 LLM 진영 (Claude/GPT/Gemini) 의 1급 지원 — provider abstraction 만 준비, 구현은 v0.2+
- IDE 확장 (VS Code 등) — v0.2+
- Web UI — v0.2 검토
- Mobile app — v0.3+

---

## 2. 핵심 결정 사항 (사용자 승인 이력)

| # | 결정 | 출처 |
|---|------|------|
| 1 | 언어/런타임: **TypeScript / Node 22+** | 사용자 Q2 답변 |
| 2 | 타겟 모델: GLM-5.1 / GLM-5-Turbo / GLM-4.5-Air (Coding Plan 전체 5+1) | 사용자 Q3 답변 |
| 3 | 단순 fork 금지, **from-scratch** + CC 호환 read | 사용자 Q5 답변 |
| 4 | Killer feature: **Long-Horizon Orchestration (B)**, sub-agent + team 중점 | 사용자 Q5 답변 |
| 5 | Aggressive memory + AGENTS.md cascade + auto-compaction | 사용자 Q6 답변 |
| 6 | **AGENTS.md 로 통일** (GLM.md 금지) | 사용자 피드백 |
| 7 | MCP/Skill/Plugin/Hook: **L3 풀호환**, Claude Code 문법 그대로 | 사용자 Q7 답변 |
| 8 | Process: **Daemon-first** + 자동 승격 (v0.1 부터 daemon 코어) | 사용자 Q8 답변 |
| 9 | Rate limit 엄수 (모델별 동시 한도) | 사용자 추가 제약 |
| 10 | TUI 인터랙티브 + 메인 오케스트레이터 패널 + tmux-style dashboard | 사용자 피드백 |
| 11 | Chat view 는 Claude Code / opencode / qwen-code 와 완전 동일 (streaming, tool cards) | 사용자 피드백 |
| 12 | OOM kill 금지 — backpressure 만 | 사용자 피드백 ("토큰은 돈") |
| 13 | Sub-agent = 메모리/컨텍스트 청소 메커니즘 (step 잘게 쪼개 위임) | 사용자 피드백 |
| 14 | Orchestrator 토큰 널널, 모델 매트릭스는 Coding Plan 한정 | 사용자 피드백 |
| 15 | Memory line cap (Claude Code 패턴) — 200줄/25KB | 사용자 피드백 |
| 16 | TUI 안에서 슬래시 명령으로 모든 관리 작업 가능 | 사용자 피드백 |
| 17 | Built-in LSP (opencode 패턴, cclsp 휴리스틱) | 사용자 피드백 |
| 18 | Hashline edit (oh-my-pi 패턴) | 사용자 피드백 |
| 19 | Bundled GLM MCP (vision/search/reader/zread) 자동 부트스트랩 | 사용자 피드백 |
| 20 | Yolo mode (3-tier, hard whitelist, audit log) | 사용자 피드백 |

---

## 3. System Architecture (Top-Level)

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENT (thin, multi-instance)             │
│  ┌──────────────────┐  ┌────────────────┐  ┌──────────────┐ │
│  │  Ink TUI (REPL)  │  │  CLI one-shot  │  │  IDE/Editor  │ │
│  │  attach/detach   │  │  glm "do X"    │  │  ext (v0.2)  │ │
│  └────────┬─────────┘  └────────┬───────┘  └──────┬───────┘ │
└───────────┼─────────────────────┼─────────────────┼─────────┘
            │  Unix socket / JSON-RPC (local-only, 0600)      │
┌───────────▼─────────────────────▼─────────────────▼─────────┐
│                      DAEMON (always-on)                      │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Session Manager   ─── orchestrates many sessions       │ │
│  │   ├─ Sub-agent fan-out (Task tool)                     │ │
│  │   ├─ Pipeline router (plan→exec→verify auto-promotion) │ │
│  │   └─ Long-horizon scheduler (8h checkpoint loop)       │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Memory & Context Engine                                │ │
│  │   ├─ AGENTS.md cascade resolver (opencode-style)       │ │
│  │   ├─ Overflow detection + compaction (opencode-style)  │ │
│  │   ├─ Prompt cache manager (GLM cache_control)          │ │
│  │   └─ Auto-memory writer (## Memories section + eviction)│ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Tool & Capability Layer                                │ │
│  │   ├─ Built-in tools (Read/Edit/Bash/Grep/Glob/Task...) │ │
│  │   ├─ Hashline edit (oh-my-pi pattern)                  │ │
│  │   ├─ Built-in LSP (opencode pattern, auto-spawn)       │ │
│  │   ├─ MCP host (full SDK, OAuth, sse/stdio/http)        │ │
│  │   ├─ Skill loader (SKILL.md + references + scripts)    │ │
│  │   ├─ Plugin loader (~/.claude/plugins/ compat)         │ │
│  │   └─ Hook executor (settings.json hooks)               │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ LLM Router                                             │ │
│  │   ├─ Model selector (5.1 / 5-turbo / 4.5-air auto)     │ │
│  │   ├─ Endpoint switch (Anthropic mode / OpenAI mode)    │ │
│  │   ├─ Quota tracker (3 풀: Coding/Web/Vision)           │ │
│  │   ├─ Idempotency cache (LLM call dedup)                │ │
│  │   └─ Multi-profile credentials (default/personal/...)   │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Storage (SQLite WAL + filesystem snapshots)            │ │
│  │   ~/.glm/sessions/<id>/{session.db,checkpoints/,...}   │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### 핵심 흐름
1. 사용자 `glm "build X"` → CLI 가 daemon 에 RPC (없으면 자동 spawn)
2. Session Manager 가 task 크기 추정 → SMALL/MEDIUM/LARGE/LONG-HORIZON 분류
3. Orchestrator (GLM-5.1) 가 매 step 결정: INLINE / DELEGATE / FAN_OUT / PIPELINE_PROMOTE / COMPACT
4. Memory Engine 이 매 LLM 호출 전 컨텍스트 조립 (system + cascade + cached + tail)
5. Overflow 감지 시 백그라운드 컴팩션 → tail 보존 + Markdown 템플릿 요약
6. Client 닫혀도 daemon 은 계속 → `glm attach` 로 복귀
7. 8시간 자율: 매 step checkpoint 디스크 commit → 크래시/재부팅 후 resume

---

## 4. Process & State Model

### 4.1 프로세스 트리

```
glm-daemon  (PID 1, detached, log → ~/.glm/daemon.log)
├─ session-worker-<sid-A>   (각 활성 세션 = 별도 child process, fork)
│   ├─ sub-agent-<wid-1>    (Task spawn worker, 또 fork)
│   ├─ sub-agent-<wid-2>
│   └─ ...
└─ session-worker-<sid-B>
```

**Daemon 라이프사이클**:
- `glm` 자동 spawn (없으면). socket 파일 (`~/.glm/daemon.sock`) 으로 살아있는지 체크.
- `glm daemon start/stop/status/restart/upgrade` 명시 명령.
- Graceful 재시작 = 모든 활성 세션 checkpoint commit → restart → 자동 resume.

**왜 세션 당 child process?**
- 한 세션 크래시가 daemon / 다른 세션 안 죽임.
- 메모리 격리 (V8 heap 분리) → 8h long-horizon 누수 영향 최소.
- worker 도 fork → 진짜 컨텍스트 격리.

### 4.2 IPC 프로토콜

- 전송: Unix domain socket `~/.glm/daemon.sock` (0600, local-only)
- 인코딩: JSON-RPC 2.0 over newline-delimited JSON
- 메서드: `session.create / .attach / .list / .detach / .kill`, `message.send / .stream`, `tool.permission.respond`, `dashboard.subscribe`

### 4.3 세션 저장 구조

```
~/.glm/sessions/<session-id>/
├── meta.json
├── session.db                # SQLite — 메시지/툴콜/이벤트/캐시
├── checkpoints/
│   ├── 0001.json
│   └── latest -> 0042.json
├── snapshots/<sha>           # 파일 스냅샷 (git-style blob)
├── workers/<worker-id>.log
├── compact.log
└── journal.md                # 사람-가독 long-horizon 일지
```

### 4.4 Checkpoint 포맷

```jsonc
{
  "id": "0042",
  "ts": "2026-05-14T03:21:55Z",
  "step": 42,
  "phase": "execute",
  "orchestrator_state": { "task_tree": [...], "decisions": [...] },
  "active_workers": [{"id":"w-3","model":"GLM-4.5-A","status":"running",...}],
  "context_state": {
    "messages_head_id": "msg_0193",
    "compact_summary_id": "cmp_007",
    "memory_loaded": ["AGENTS.md@sha1...","skills/X@sha1..."],
    "tokens_used": 87432
  },
  "rate_limits": { "GLM-5.1": 3, "GLM-5-Turbo": 0, "GLM-4.5-Air": 1 },
  "files_dirty": ["src/auth/oauth.ts"]
}
```

Resume 시: latest checkpoint 로드 → worker 재spawn (idempotency key 로 retry/cache hit) → 사용자 확인 → 진행.

### 4.5 Attach / Detach

- `Ctrl-D` / `glm detach`: 클라이언트만 종료, daemon 의 세션은 계속.
- `glm attach <id>` / `glm`: 가장 최근 세션 자동 attach.
- 멀티-attach: 같은 세션에 여러 클라이언트 read 가능, write 는 daemon 의 그 세션 child 만.

### 4.6 Long-Horizon 자동 승격 조건

1. 명시: `--auto` / `/auto` / `glm auto "..."`.
2. Plan 추정 step ≥ 20 또는 시간 ≥ 1h → 자동 승격 (1회 확인).
3. 진행 중 step 30 도달 → 자동 승격.
4. 사용자 detach 상태 → 자동 승격.

Long-horizon 추가 행동: 매 step checkpoint, 30분마다 자동 compact 시도, 60분마다 distillation, journal 업데이트, push 알림.

### 4.7 크래시 복구 매트릭스

| 컴포넌트 | 자동 복구 |
|---------|---------|
| TUI 클라이언트 | 다음 `glm` 호출시 자동 attach |
| Sub-agent worker | 1회 자동 retry, 부분 결과 보존 |
| 세션 child | latest checkpoint 부터 새 child 로 resume |
| Daemon | 다음 실행 시 spawn → 모든 active 세션 resume 후보 |
| SQLite 손상 | WAL rollback 또는 latest backup restore |
| LSP server hang | 60s 무응답 → kill + auto-restart |
| MCP server crash | exp backoff (max 3), 실패시 disable |
| Network 끊김 | 부분 응답 보존, 30s 재시도 후 pause |

---

## 5. Memory Hygiene (§2.5)

### 5.1 핵심 원칙

> **진행 중인 LLM 호출은 자연 종료까지 절대 중단되지 않는다.** 모든 리소스 관리는 "다음 호출 전" 또는 "호출 완료 후" 경계에서만.

### 5.2 Process Recycling (자연 경계에서만)

Recycle 자격 (전부 만족):
1. 마지막 step 완료 (in-flight LLM 호출 없음)
2. 모든 sub-agent worker 완료
3. Checkpoint commit 완료
4. (선택) 사용자 응답 대기 / idle

만족시: graceful exit → 다음 step 시작 전 새 worker fork.

### 5.3 한도는 관찰만, 강제는 안 함

- V8 하드캡 `--max-old-space-size=512` 유지, 닿으면 **버그**로 취급
- OOM 으로 죽으면 자동 재spawn 안 함 — 사용자 결정
- Dashboard 메모리 게이지는 정보 표시만, 자동 액션 0

### 5.4 토큰 보호 추가 원칙

1. **부분 응답 보존**: 스트림 중단시 받은 chunk 그대로 SQLite commit
2. **Idempotency key**: sha256(role + model + system + prompt + tool_results)
3. **Sub-agent 결과 캐싱**: 같은 task hash → 캐시 hit
4. **Compaction 보수성**: 트리거 전 "진짜 필요?" 한 번 더 체크
5. **Retry 정책**: 자동 3회, 4회+ 사용자 결정
6. **Quota 사전 차단**: 5% 임계 이하면 새 fan-out 차단

### 5.5 Buffer 정책

- Tool stdout/stderr → stream → SQLite BLOB chunk append, 메모리엔 마지막 8KB 만
- LLM 응답 chunk → 즉시 commit, 누적 X
- 파일 read 기본 max 2000 라인
- 메시지 history in-memory: 마지막 N 개만 (=컨텍스트에 들어가는 부분)

---

## 6. Sub-agent as Memory Cleanup Strategy (§2.7)

### 6.1 핵심 통찰

> Sub-agent 는 fan-out 의 수단이기 전에, **context 와 메모리를 자연스럽게 청소하는 메커니즘**이다.

각 sub-agent:
- 자기 200K 가 부모와 격리됨 → 부모 context 절약
- 작업 끝나면 process exit → V8 heap 자동 회수
- 결과는 **요약 텍스트만** 부모에 회신

→ 부모 200K + 자식 N × 200K = 사실상 확장된 컨텍스트.

### 6.2 Delegation 휴리스틱

| 신호 | 위임 이유 | 사용 모델 |
|------|-----------|----------|
| Read tool >1000 라인 | 부모 context 절약 | GLM-4.5-Air |
| Grep >50 matches | 매치 텍스트 부풀음 방지 | GLM-4.5-Air |
| 여러 파일 동일 작업 | 병렬 + 격리 | GLM-4.5-Air ×N |
| 탐색적 작업 | 탐색 능력 필요 | GLM-5.1 |
| Pipeline gate | 객관적 평가 | GLM-5.1 |
| 부모 context >60% | 컴팩션 대신 위임 | GLM-4.5-Air / 5.1 |

### 6.3 Sub-agent 강제 계약 (시스템 프롬프트)

```
You are a sub-agent. Return ONLY a concise summary suitable for your parent.
Hard limits:
  - Output ≤ 4K tokens
  - Format: Markdown
    ## Summary    (1-3 sentences)
    ## Key Findings  (bullets, terse)
    ## Artifacts   (files, identifiers, line refs)
    ## Open Questions  (for parent to decide)
You cannot spawn further sub-agents unless "depth=2" instruction is present.
```

### 6.4 Lifecycle

```
1. Orchestrator: "delegate to worker w-N"
2. Daemon: fork → 자식 Node 프로세스 spawn
3. 자식: 자기 컨텍스트로 task 실행 (자기 200K)
4. 자식: 결과 요약 텍스트 → parent socket emit
5. 자식: SQLite 에 결과/툴콜 로그 commit
6. 자식: process.exit(0) — V8 heap 즉시 해제
7. Daemon: 자식 reap, workers 테이블에서 제거
8. Parent context 에는 요약만 들어감 (Task 카드)
```

### 6.5 Step 잘게 쪼개기

Long-horizon plan rules:
- 각 step ≤ 30 LLM turns
- 각 step touches > 3 files → split 또는 delegate
- 각 step "exploration" → MUST delegate
- 각 step 종료 = checkpoint commit + 컨텍스트 audit

작은 step = 작은 컨텍스트 = 컴팩션 빈도 ↓ = 토큰 ↓ + 안정성 ↑.

### 6.6 토큰 경제 효과

- **부모 캐시 hit ↑**: 부모 history 안 자라니까 prompt cache 90%+ hit
- **자식 호출은 1-shot**
- **컴팩션 빈도 격감**: 부모 안 자라니 거의 안 일어남

---

## 7. Orchestration (§3)

### 7.1 Orchestrator 역할

별도 LLM 호출. **항상 GLM-5.1** (Pro/Max 면 GLM-5 옵션). 매 step / 매 sub-task 완료시 호출.

**입력**:
- 현재 task description, phase, step #
- 최근 10 step (요약 + 결과 + 토큰)
- 부모 컨텍스트 통계
- 활성 worker (id, model, task, elapsed)
- 모델별 in-flight / queue / quota 잔량
- AGENTS.md 의 `## Orchestration Hints` 섹션

종합 ~10-20K 토큰. 대부분 cacheable.

**출력** (JSON):
```jsonc
{
  "decision": "INLINE | DELEGATE | FAN_OUT | PIPELINE_PROMOTE | COMPACT | RECYCLE",
  "next_action": {
    "type": "delegate",
    "task": "find all callers of X",
    "model": "GLM-5.1",
    "depth": 1,
    "max_output_tokens": 4000,
    "context_to_pass": ["AGENTS.md", "src/auth/oauth.ts"]
  },
  "reasoning": "...",
  "estimated_tokens": 800
}
```

**토큰 정책**: 널널하게. Skip 휴리스틱 없음. Thinking 항상 활성. 시스템 프롬프트 캐싱 강제.

### 7.2 Task 분류 (매 turn 평가)

```
SMALL  : ≤3 steps, ≤2 files, no exploration  → inline (no fan-out, no pipeline)
MEDIUM : 4-20 steps, 3-10 files               → selective sub-agent fan-out
LARGE  : >20 steps, >10 files, multi-phase    → pipeline auto-promote
LONG-HORIZON: >1h estimated                   → pipeline + checkpoints + distillation
```

매 step 후 재평가.

### 7.3 Pipeline 단계

| Phase | 모델 | 역할 |
|-------|-----|------|
| plan | GLM-5.1 | 분해 + 의존성 그래프 + 위험 식별 |
| scaffold | GLM-5-Turbo or 5.1 | 새 파일/구조 생성 (변경 없음) |
| execute | GLM-5.1 | 핵심 구현, step 단위 직렬 |
| verify | GLM-4.5-Air fan-out | lint / type check 병렬 |
| test | GLM-5.1 | 실행 + 실패 분석 |
| review | GLM-5.1 (fresh) | 객관적 리뷰 |

자동 transition gate: acceptance criteria met → 진행, fail → 이전 phase 로 복귀 (최대 3회).

### 7.4 모델 매트릭스 (Coding Plan 한정)

**Lite/Pro/Max 공통**:

| Preferred | Concurrency | Alt 1 | Alt 2 |
|-----------|------------|-------|-------|
| GLM-5.1 | 10 | GLM-4.7 (2) | GLM-4.6 (3) |
| GLM-5-Turbo | **1** | GLM-5.1 (10) | GLM-4.5-Air (5) |
| GLM-4.7 | 2 | GLM-5.1 | GLM-4.6 |
| GLM-4.6 | 3 | GLM-4.7 | GLM-5.1 |
| GLM-4.5-Air | 5 | GLM-4.6 | GLM-4.5 |

**Pro/Max 추가**: GLM-5 (slot 2) — orchestrator/리뷰에 옵션.

**총 동시 슬롯 (Lite)**: 21.

### 7.5 Rate-limit-aware Scheduler

```ts
class ModelScheduler {
  async dispatch(task: PendingTask): Promise<WorkerResult> {
    const preferred = task.preferredModel
    const fallbackChain = ALTERNATIVES[preferred] ?? []
    const candidates = [preferred, ...fallbackChain]
      .filter(m => this.slots.has(m))
    for (const m of candidates) {
      const s = this.slots.get(m)!
      if (s.inflight.size < s.limit && this.quotaOk(s)) return this.run(task, m)
    }
    const target = minBy(candidates, m => this.slots.get(m)!.queue.length)
    return this.enqueue(task, target)
  }
}
```

### 7.6 Worker State Machine

```
QUEUED → SPAWNING → INITIALIZING → RUNNING → COMPLETING → COMPLETED
                                       ↓
                                   FAILED → RETRYING (≤3) → FAILED_FINAL
                                       ↓
                                   CANCELLED
```

### 7.7 사용자 제어

| 명령 | 효과 |
|------|------|
| `/auto` | 즉시 LONG-HORIZON 승격 |
| `/plan` | 다음 task plan phase 강제 |
| `/skip <phase>` | 현재 pipeline phase 건너뜀 |
| `/route <model>` | 다음 호출 모델 지정 |
| `/cancel worker <id>` | 특정 worker 취소 |
| `/cancel` | 모든 활성 worker 취소 |
| `/pause` | 다음 호출 직전 멈춤 |
| `/resume` | pause 해제 |
| `/budget tokens <N>` | turn 토큰 상한 |

### 7.8 Idempotency Cache

```ts
key = sha256({
  role, model, endpoint, system_hash, messages_hash, tools_hash, seed, temperature
})
```

SQLite `llm_cache` 테이블. TTL = 세션 동안. Resume 시 같은 호출 재실행 안 함 → 토큰 0.

---

## 8. Memory & Context Engine (§4)

### 8.1 Instruction Cascade

```
resolveInstructions(cwd, worktree):
  paths = []
  # 글로벌 (한 번만, 첫 매치 승)
  for name in ["~/.glm/AGENTS.md", "~/.claude/CLAUDE.md"]:
    if exists(name): paths.push(name); break
  # 프로젝트 (worktree → cwd walk-down, 조상 stack 없음)
  for filename in ["AGENTS.md", "CLAUDE.md"]:
    matches = findUp(filename, cwd, worktree)
    if matches.length > 0: paths.push(...matches); break
  # 사용자 정의 추가
  paths.push(...resolveGlobs(config.instructions))
  # @filepath import 펼치기 (qwen 패턴, depth 3)
  for path in paths:
    yield (path, expandImports(read(path), depth=3))
```

**재귀적 file-relative discovery** (opencode):
```
on Read(filepath):
  for dir in walkUpFrom(filepath, until=workspace_root):
    if (agents = findInstruction(dir)) && !alreadyLoaded(agents):
      attach(agents, oneShot=true)
```

### 8.2 ## Memories 섹션 + 인덱스/본문 분리 (Claude Code 패턴)

```markdown
## Memories
<!-- Auto-managed by glm. Bodies in .glm/memory/. -->

- [user-role](.glm/memory/user_role.md) — Data scientist exploring logging infra
- [feedback-tdd](.glm/memory/feedback_tdd.md) — Tests hit real DB (incident-driven)
- ...
```

**본문 파일** (.glm/memory/<slug>.md):
```markdown
---
name: feedback-tdd
description: Tests must hit real DB, not mocks
metadata:
  type: feedback                # user | feedback | project | reference
  created: 2026-05-14
  last_accessed: 2026-05-14
  pin: false
  archived: false
---
Tests must hit a real database, not mocks.
**Why:** ...
**How to apply:** ...
Related: [[project-db]]
```

### 8.3 메모리 하드 캡

| 영역 | 캡 | 초과시 |
|------|------|--------|
| AGENTS.md `## Memories` | **200줄 / 25KB** | score 낮은 순 evict (본문은 archive) |
| `.glm/memory/` 디렉토리 | 200 파일 / 5MB | 가장 오래된 archived 부터 진짜 삭제 |
| 개별 메모리 본문 | 4KB | LLM 압축 (사용자 알림) |
| `~/.glm/memory/` 글로벌 | 50 파일 | 동일 정책, 더 보수적 |

### 8.4 Eviction 점수

```
score = 0.5 × age_decay + 0.3 × type_weight + 0.2 × access_recency − pin_bonus
age_decay      = 1 - min(days_since_created / 180, 1)
type_weight    = { user: 1.0, feedback: 0.9, project: 0.5, reference: 0.7 }
access_recency = 1 - min(days_since_last_access / 30, 1)
pin_bonus      = pin ? ∞ : 0
```

### 8.5 Context Assembly (cacheable → volatile)

```
1. System prompt (모델별 prompt 파일)        ◀ cache_control: ephemeral
   - role/contract
   - core tool schemas (lazy ~10)
2. Skill catalogue (verbose 설명만, body X)  ◀ ephemeral
3. AGENTS.md cascade + ## Memories           ◀ ephemeral
4. Compacted summary (있으면)                ◀ 변경시 무효
5. Conversation history (tail preserve)      ◀ 매 turn 변경
6. Latest user turn / tool results            ◀ volatile
```

### 8.6 Compaction

**트리거 계산** (GLM 보정):
```ts
function usable(model, cfg): number {
  const reservedOutput = Math.min(cfg.reservedOutput ?? 16_000, model.maxOutput)
  const buffer = cfg.buffer ?? 8_000
  return ctx - reservedOutput - buffer
}
```
GLM-5.1 (200K, maxOut 128K) → usable ≈ 176K → 약 88% 도달시 트리거.

**템플릿** (opencode 그대로):
```
## Goal / ## Constraints & Preferences / ## Progress (Done/InProgress/Blocked)
## Key Decisions / ## Next Steps / ## Critical Context / ## Relevant Files
```

**Tail preserve**: 마지막 N=2 턴 / max 8K 토큰 무조건 보존.
**Tool output prune**: > 2000 chars trim + metadata. `["skill","memory","Task"]` protected.
**스냅샷+diff**: 컴팩션 시점 파일 상태 기록.

### 8.7 Prompt Cache 활용

GLM 의 `cache_control: {"type": "ephemeral"}` 적극:
```jsonc
"system": [
  { "type": "text", "text": "...role...", "cache_control": {"type":"ephemeral"} },
  { "type": "text", "text": "...skill catalog...", "cache_control": {"type":"ephemeral"} },
  { "type": "text", "text": "...AGENTS.md cascade...", "cache_control": {"type":"ephemeral"} }
]
```
→ 세션 내내 80%+ 캐시 hit. OpenAI mode 모델은 캐싱 미지원 (제외).

### 8.8 Lazy Loading

- **Skill**: 시스템 프롬프트엔 이름+description+when_to_use 만 (~50 토큰/skill). 본문은 `Skill` tool 로 lazy fetch.
- **Tool schema**: 기본 ~10개 (Read/Edit/Bash/Grep/Glob/Task/Skill/SlashCommand/TodoWrite/Memory). 나머지는 `ToolSearch` 로 deferred.

### 8.9 Periodic Distillation (long-horizon)

매 60분 자동:
1. Orchestrator 가 "지금까지 학습한 것" 회고 (~5K 토큰)
2. 결과를 AGENTS.md `## Memories` 섹션에 append (dedupe + cap)
3. 다음 호출부터 cacheable 영역에 들어감
4. 동시에 history 에서 해당 사실 압축 대상으로 mark

### 8.10 Differential File Display

Edit 후 컨텍스트에 다시 박힐 때 diff 만:
```
● Edit src/auth/oauth.ts (+42 / -8)
  L34-L45  [diff hunk]
  L102-L108 [diff hunk]
```

### 8.11 Context Budget HUD

Chat status 라인 + Dashboard:
```
Context Sys 9K│Skills 4K│Tools 11K│AGENTS 6K│Mem 4K│Hist 38K│Free 128K
              ▰▰▰░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  36% used
```

`/context` 슬래시로 풀 분해.

### 8.12 200K 극대화 — 7가지 전술

| 전술 | 효과 |
|------|------|
| 1. Aggressive prompt caching | 매 호출 80%+ 캐시 hit |
| 2. Sub-agent 위임 | 200K 분산, 부모는 요약만 |
| 3. Lazy skill / tool schema | 시스템 prompt 5K 토큰대 |
| 4. AGENTS.md cascade first-match | 조상 stack 없이 가장 가까운 룰 |
| 5. Recursive file-relative discovery | 깊은 파일 만질 때만 그 영역 룰 |
| 6. Periodic distillation | 학습이 cacheable 영역으로 이동 |
| 7. Differential file display | 같은 파일 두번 안 들어감 |

→ 명목 200K, 체감 1-2M.

---

## 9. MCP / Skill / Plugin / Hook / Slash Command (§5)

### 9.1 호환 약속

> 사용자가 기존 `~/.claude/` 디렉토리 / `~/.claude.json` / 프로젝트의 `.claude/` 와 `.mcp.json` / `~/.claude/plugins/` 를 손대지 않고 `glm` 을 깔아도 **모든 MCP / Skill / Plugin / Hook / Slash command 가 그대로 동작**한다.

### 9.2 Config 우선순위

```
[높음] CLI args
       .glm/settings.local.json  → .glm/settings.json
       .claude/settings.local.json → .claude/settings.json (호환 read)
       .mcp.json (호환 read)
       ~/.glm/settings.json
       ~/.claude.json (호환 read)
       ~/.claude/settings.json (호환 read)
[낮음] 시스템 기본값
```

깊은 머지 (mcpServers/hooks/permissions 키 머지).

### 9.3 MCP Host (L3)

- SDK: `@modelcontextprotocol/sdk`
- Transport: stdio / sse / http
- OAuth: 브라우저 callback, `~/.glm/credentials/`
- Hot reload: settings watch + `/mcp reload`
- CLI 호환: `glm mcp add/list/remove/auth/call`

### 9.4 Skill Loader (L3)

- 구조: `.claude/skills/<name>/SKILL.md + references/ + scripts/ + templates/`
- Frontmatter: `name`, `description`, `trigger_keywords`, `plugin`, `permissions`, `model_hint`
- Lazy: 시스템 프롬프트엔 카탈로그만, `Skill` tool 로 본문 fetch
- Scripts 실행 가능 (Bash cwd 검색 경로 추가)
- Sub-skill depth=2 제한

### 9.5 Plugin System (L3)

- 구조: `~/.claude/plugins/cache/<name>/<version>/` 100% 호환
- Manifest: `plugin.json` 의 skills/commands/hooks/mcpServers
- 네임스페이스 prefix: `<plugin>:<item>`
- CLI: `glm plugin install/uninstall/update/enable/disable`

### 9.6 Hooks (L3)

이벤트: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PreCompact`, `PostCompact`, `Stop`, `Notification`.

Config (Claude Code 형식 그대로):
```jsonc
"hooks": {
  "PostToolUse": [{
    "matcher": "Edit",
    "hooks": [{ "type": "command", "command": "pnpm prettier --write $CLAUDE_FILE" }]
  }]
}
```

Env vars: `$CLAUDE_*` (호환 alias) + `$GLM_*` (네이티브) + `$GLM_WORKER_ID / _MODEL / _PHASE`.

무한 루프 방지: 30s timeout, 1턴 5회 이상이면 비활성.

### 9.7 Slash Commands

소스 cascade (모두 합쳐서 카탈로그):
1. 빌트인
2. `~/.glm/commands/`
3. `~/.claude/commands/` (호환)
4. 플러그인 commands
5. 프로젝트 `.glm/commands/` 와 `.claude/commands/`

파일 형식 Claude Code 동일 (frontmatter + body, `$ARGUMENTS` 치환).

### 9.8 호환 검증 매트릭스

| 자산 | 그대로 작동 |
|------|-----------|
| `~/.claude.json` MCP | ✅ 100% |
| `~/.claude/CLAUDE.md` | ✅ 100% |
| `~/.claude/skills/*` | ✅ 100% |
| `~/.claude/plugins/*` | ✅ 100% |
| `~/.claude/commands/*` | ✅ 100% |
| `.claude/settings.json` hooks | ✅ 100% |
| `.claude/settings.json` permissions | ✅ 100% |
| OAuth tokens (`~/.claude/credentials/`) | ✅ 같은 위치 공유 |
| `ANTHROPIC_API_KEY` | ⚠ Anthropic mode 만, GLM key 별도 필요 |

### 9.9 TUI 슬래시 명령 (CLI ↔ 슬래시 1:1)

CLI 의 모든 관리 명령은 TUI 안에서 슬래시로 동일하게 사용 가능. 인자 없이 호출 시 form-mode (인터랙티브 UI). 자동완성: `/`, `@`, `\<subcmd>`. Claude Code / opencode / qwen-code 와 동일 UX.

| CLI | TUI |
|-----|-----|
| `glm mcp add` | `/mcp add` (form 모드 가능) |
| `glm skill list` | `/skill list` |
| `glm plugin install` | `/plugin install` |
| `glm memory list` | `/memory list` |
| `glm sessions` | `/sessions` |
| (없음) | `/auto`, `/plan`, `/route`, `/cancel`, `/pause`, `/context`, `/compact` |

### 9.10 Built-in LSP (opencode 패턴 + cclsp 휴리스틱)

3,400+ LOC (opencode 의 lsp 모듈 패턴 차용).

**언어 매핑** (확장 가능):
- TypeScript/JavaScript: typescript-language-server
- Python: pyright (fallback pylsp)
- Go: gopls / Rust: rust-analyzer / Java: jdtls / C/C++: clangd / Ruby: ruby-lsp / Lua: lua-language-server / Zig: zls / C#: omnisharp / Markdown: markdown-oxide / YAML: yaml-language-server

**자동 lifecycle**: 확장자 감지 → root markers walkup → spawn → didOpen → 30분 idle 자동 shutdown.

**Position resolution** (cclsp 휴리스틱):
```
findSymbolAt(file, name, hintLine?):
  candidates += symbolsInRange(file, hint ± 5)
  candidates += documentSymbols(file).filter(matches name)
  candidates += workspaceSymbols(name)
  return rank(candidates, by hint distance + exact match)[0]
```

**제공 도구**: `lsp_diagnostics`, `lsp_diagnostics_directory`, `lsp_goto_definition`, `lsp_find_references`, `lsp_hover`, `lsp_rename`, `lsp_document_symbols`, `lsp_workspace_symbols`, `lsp_code_actions`, `lsp_code_action_resolve`, `lsp_prepare_rename`, `lsp_servers` (OMC tool 명 일치).

**PostEdit auto-diagnostics**: Edit/Write 직후 자동 호출, 그 turn 의 tool result 에 inline 첨부.

**workspace_symbols 가 grep 의 좋은 대체** — orchestrator 가 의미 검색은 LSP, free-text 는 grep 으로 자동 라우팅.

**시스템 무단 install 금지** — `glm lsp install <lang>` 안내만.

### 9.11 Hashline Edit Tool (oh-my-pi 패턴)

**문제**: LLM edit 실패 (모호 매치 / 공백 / line shift / stale snapshot).

**해법**: 모든 라인 = `LINE+HASH|TEXT`. 예: `42sr|function foo() {`
- LINE: 1-indexed
- HASH: xxHash32(content) mod 647 BPE 단일토큰 bigram (2글자, +1 토큰)
- `|`: body separator

**Edit 입력**:
```jsonc
edit({
  path: "src/auth/oauth.ts",
  ops: [
    { anchor: "5sr", action: "replace", text: "~  async authenticate(token: string, opts?: AuthOpts) {" },
    { anchor: "6vk", action: "insert_after", text: "~    if (!token) throw new InvalidToken();" }
  ]
})
```

Actions: `replace`, `delete`, `insert_before`, `insert_after`, `replace_range` (anchor: "5sr-9hd").
Payload separator: `~` (oh-my-pi 벤치마크 winner).

**Verify**:
1. 현재 파일 read (cache 가능)
2. 각 anchor 의 line 에서 hash 재계산 → 일치 확인
3. 불일치시 recovery:
   - ±5 라인 hash 매치 → 시프트 보정
   - 같은 hash + 유사 인접 컨텍스트 → 위치 복원
   - 못 찾으면 atomic abort + 새 hashlines 으로 read 결과 첨부

**LLM echo prefix 자동 strip** (`prefixes.ts` 패턴) — 안전.

**기대 성공률**: edit ✓ ≥ 90% (벤치 결과 94.9%), patch fail ≤ 8%.

**MultiEdit**: atomic, order-independent.
**Ast-edit** (v0.2): 구조 기반 rewrite.

### 9.12 Bundled GLM MCP Servers

Daemon 첫 시작 시 자동 등록 (사용자 disable 안 한 한):

```jsonc
"mcpServers": {
  "glm-vision": {
    "type": "stdio",
    "command": "npx", "args": ["-y", "@z_ai/mcp-server"],
    "env": { "Z_AI_API_KEY": "${GLM_API_KEY}", "Z_AI_MODE": "ZAI" },
    "builtin": true
  },
  "glm-web-search": {
    "type": "http",
    "url": "https://api.z.ai/api/mcp/web_search_prime/mcp",
    "headers": { "Authorization": "Bearer ${GLM_API_KEY}" },
    "builtin": true
  },
  "glm-web-reader": {
    "type": "http",
    "url": "https://api.z.ai/api/mcp/web_reader/mcp",
    "headers": { "Authorization": "Bearer ${GLM_API_KEY}" },
    "builtin": true
  },
  "glm-zread": {
    "type": "http",
    "url": "https://api.z.ai/api/mcp/zread/mcp",
    "headers": { "Authorization": "Bearer ${GLM_API_KEY}" },
    "builtin": true
  }
}
```

**자동 라우팅** (LLM 표준 이름 → 실제 MCP):

| LLM 호출 | 위임 |
|---------|------|
| 이미지 input 감지 | `glm-vision/image_analysis` |
| `Vision.ocr(path)` | `extract_text_from_screenshot` |
| `Vision.uiToCode` | `ui_to_artifact` |
| `Vision.diagnoseError` | `diagnose_error_screenshot` |
| `WebSearch(q)` | `glm-web-search/webSearchPrime` |
| `WebFetch(url)` | `glm-web-reader/webReader` |
| `Zread.search(repo, q)` | `glm-zread/search_doc` |
| `Zread.structure / readFile` | 동일 |

**Quota 풀**:
| 풀 | Lite | Pro | Max |
|-----|------|-----|-----|
| Vision | 5h | 5h | 5h |
| Web (search+reader+zread 공유) | 100/월 | 1,000/월 | 4,000/월 |

**Web 자동 캐싱**: 작은 풀 보호. URL → `~/.glm/cache/web/<sha>.json`. TTL: webReader 1h, webSearch 10m.

#### 이미지 첨부 — TUI ↔ Daemon ↔ Vision MCP 자연스러운 통합

qwen-code / opencode 의 패턴 차용 + GLM coding plan 의 vision-MCP 라우팅 결합.

**전체 흐름**:
```
┌─────────────────── TUI (Ink) ─────────────────────────┐
│ 1) 사용자가 input 박스에:                              │
│    - Drag & drop 이미지 파일                           │
│    - Ctrl+V (클립보드 이미지 paste)                    │
│    - 또는 `@/path/to/img.png` 명시                     │
│ 2) Bracketed-paste / drop event 감지                   │
│ 3) ~/.glm/sessions/<sid>/attachments/img_<n>.<ext> 저장│
│    (PNG/JPG/WebP/GIF/HEIC 지원, opencode autoResize)   │
│ 4) Input box 위에 attachment chip:                     │
│    ┌───────────────────────────────┐                   │
│    │ [1] screenshot.png (234KB) [x]│                   │
│    └───────────────────────────────┘                   │
│    Input 본문엔 `[image 1]` placeholder                │
│ 5) 사용자 Enter:                                       │
│    RPC: message.send({                                 │
│      text: "[image 1] 이거 봐줘",                       │
│      attachments: [{path,mime,size,sha256}]            │
│    })                                                  │
└────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────── Daemon ────────────────────────────┐
│ 6) main LLM 의 capabilities.visionInput=false 확인     │
│    (GLM-5.1/5-T/4.7/4.6/4.5-A 전부 텍스트만)            │
│ 7) Vision result cache 체크 (sha256 키)                │
│    Hit  → cached description 재사용 (vision quota 0)   │
│    Miss → glm-vision/image_analysis(path) 호출         │
│           (병렬 fan-out, vision pool 한도 내)            │
│ 8) 메시지 재조립 (LLM 에 inject):                      │
│    <attachments>                                       │
│    [1] screenshot.png (234KB):                         │
│    <description from glm-vision>                       │
│    </attachments>                                      │
│    [image 1] 이거 봐줘                                 │
│ 9) 메인 LLM 호출 — 텍스트만 봄, 응답 스트리밍 시작     │
└────────────────────────────────────────────────────────┘
```

**복수 이미지** + **명시 vision tool 선택**:
- 한 메시지에 N 개 이미지 첨부 → vision pool 안에서 병렬 호출
- 사용자가 명시 안 하면 `image_analysis` 기본
- 명시 명령: `/vision ocr [image 1]` → `extract_text_from_screenshot`
- `/vision ui-to-code [image 1] --framework react` → `ui_to_artifact`

**`/raw` modifier** — vision 분석 건너뛰고 경로만 LLM 에 전달 (코드 처리용):
```
사용자: [image 1]/raw 이 PNG 파일 디코드 코드 짜줘
→ daemon 이 vision MCP 안 부름. path 만 텍스트로 메시지에 inject.
→ LLM 이 path 받고 코드 작성. 이미지 내용은 모름.
```

**Settings**:
```jsonc
{
  "attachments": {
    "image": {
      "autoResize": true,
      "maxWidth": 2000,                      // opencode 차용
      "maxHeight": 2000,
      "maxBytes": 4_718_592,                 // 4.5MB
      "supportedTypes": ["png","jpg","jpeg","webp","gif","heic","bmp","tiff"],
      "defaultTool": "image_analysis",       // glm-vision MCP tool 이름
      "cacheVisionResults": true,            // sha256 → description 캐시
      "preserveAfterSend": true,             // false 면 turn 후 즉시 삭제
      "cleanupAge": "7d"                     // 7일 후 자동 정리
    }
  }
}
```

**Vision result 캐시** — 핵심 quota 절약:
- `~/.glm/cache/vision/<sha256>.json` — image_analysis 결과 영구 캐시
- 같은 스크린샷 재첨부 → vision quota 차감 0
- `/cache vision clear` 로 수동 정리

**오류 처리**:
- 큰 이미지 → autoResize=true 면 자동 축소 후 호출
- 지원 안 되는 포맷 (SVG/PDF) → 사용자 알림 + `/raw` 자동 제안
- Vision MCP timeout → 사용자 확인: "텍스트 부분만 진행할까요?"
- Vision pool 소진 → 캐시되어 있는 이미지는 OK, 새 이미지는 사용자 prompt

**UI 인터랙션**:
- chip 클릭 → OS 기본 이미지 viewer 열림 (`open img_x.png`)
- chip `[x]` → 첨부 취소 (input 의 `[image N]` placeholder 도 제거)
- 첨부 후 input 비우면 chip 도 유지 (drop 후 텍스트 작성 자연스러움)

**Dashboard 표시 갱신**:
```
Quota   Coding 78% │ Web 42/100 │ Vision 4h 51m (last: image_analysis 12s ago)
                                              cache hits: 14 today
```

### 9.13 Built-in Workflow Catalog ("하나의 제품" 원칙)

OMC (oh-my-claudecode) 류 플러그인의 고수준 워크플로를 **별도 플러그인이 아니라 glm 의 빌트인**으로 흡수. 사용자가 `glm` 설치 직후 다음 슬래시 명령이 즉시 동작.

**원칙**:
1. **빌트인**: `glm plugin install ...` 불필요. 첫 실행부터 가능.
2. **CI 보호**: 모든 워크플로가 자체 통합 테스트로 회귀 방지.
3. **빌트인 인프라 활용**: 자체적으로 §6 (sub-agent cleanup), §7 (orchestrator + scheduler), §8 (memory cascade), §9.11 (hashline edit), §9.10 (LSP) 사용. 외부 의존 0.
4. **사용자 정의는 여전히 가능** (§9.4 의 skill 시스템) — 빌트인 카탈로그는 **opinionated curated set**, 무한 확장 X.
5. **OMC 플러그인도 여전히 호환 read 됨** (§9.5) — 빌트인과 OMC 의 같은 이름 충돌시 빌트인 우선 (사용자가 `/<plugin>:<command>` 로 OMC 버전 명시 호출 가능).

#### Tier-4 워크플로 (level=4) — 핵심 빌트인

| 명령 | 설명 | 사용 시기 |
|------|------|----------|
| `/autopilot <idea>` | end-to-end 자율: 요구분석 → 디자인 → plan → 병렬 implement → QA → 다관점 verify | "build me X", "create a Y", 끝까지 알아서 |
| `/ralph <task>` | PRD-driven persistence loop, 모든 스토리 verified 될 때까지 retry | "must complete", "don't stop", 보장된 완료 |
| `/ultrawork <task>` | 병렬 실행 엔진 (ralph 의 코어, persistence 없는 가벼운 버전) | 다중 독립 작업 동시 실행, 사용자 직접 완료 관리 |
| `/team [N:role] <task>` | N peer agents on shared task list + 에이전트 간 메시징 | 동시 협업이 필요한 작업 (분업) |
| `/plan <task>` | 전략 plan, 자동 인터뷰 (broad) / 직접 plan (detailed) / consensus / review 모드 | 코드 전 scoping 필요할 때 |
| `/ralplan <task>` | `/plan --consensus` 의 shorthand — Planner+Architect+Critic 합의 루프 | 위험 큰 작업 사전 합의 |
| `/deep-dive <observation>` | trace → deep-interview 2-stage 파이프라인 | 깊은 인과 + 요구 명확화 둘 다 필요 |
| `/trace <observation>` | 증거-기반 인과 추적, 경쟁 가설 + 증거 ranking + next-probe 추천 | "왜?" 질문, fix 보다 이해가 먼저 |
| `/ultraqa <feature>` | QA 사이클: test → verify → fix → 목표 달성까지 반복 | 회귀 없이 fix 보장 |
| `/self-improve <target>` | 자율 진화적 개선 엔진 (tournament selection) | 기존 코드 점진적 향상 |

#### Tier-3 빌트인 스킬 (level=3) — 보조

| 명령 | 설명 |
|------|------|
| `/debug` | 현재 세션/repo 진단 — logs, traces, state, focused repro |
| `/verify` | 완료 주장에 대한 증거 수집 + 테스트 적정성 |
| `/critic <plan-or-code>` | 다관점 리뷰 — 무엇이 있고 무엇이 없는지 |
| `/skillify` | 현재 세션의 반복 패턴을 재사용 가능한 skill 초안으로 추출 |
| `/remember` | 프로젝트 메모리에 영구화할 지식 review + 결정 |
| `/visual-verdict <a> <b>` | UI 스크린샷 회귀 판정 (vision MCP 활용) |
| `/ai-slop-cleaner` | AI 가 만든 슬롭 코드 청소 (regression-safe deletion-first) |
| `/external-context` | document-specialist agent fan-out 으로 외부 문서/레퍼런스 조사 |
| `/ccg <task>` | Claude-Codex-Gemini 3-모델 비교 호출 후 합성 (v0.2, 다른 provider 대비) |

#### 워크플로 ↔ 슬래시 / CLI 양면

§5.9 의 1:1 룰 동일 적용:
```
TUI: /autopilot "build a todo list app"
CLI: glm autopilot "build a todo list app"
TUI: /ralph "fix all failing tests"
CLI: glm ralph "fix all failing tests" --max-iter 5
```

#### 워크플로 컴포지션 예시

```
autopilot composes:
  1. analyst (L4)        — 요구 gap 분석
  2. planner (L4)        — phase 분해
  3. architect (L3)      — 기술 설계 review
  4. ultrawork (L2 × N)  — 병렬 implementer
  5. test-engineer (L3)  — test 전략
  6. verifier (L3)       — 증거 수집
  7. critic (L3)         — 최종 게이트

ralph composes:
  ultrawork (병렬 exec) + verifier (반복마다) + persistence loop + PRD-driven 재시도

team composes:
  N peer agents (역할 자유) + 공유 task list + 에이전트 간 message bus

trace composes:
  tracer (L3) × M 경쟁 가설 + 증거 ranking + next-probe
```

#### 안전장치

- **빌트인 워크플로는 항상 §8 의 yolo 정책 따름**. autopilot/ralph 가 hard-whitelist 우회 X.
- **모든 워크플로가 quota / rate-limit 통계 인지**. 5.1 풀 부족하면 4.7 으로 escalate.
- **사용자 인터럽트 즉시 반영** — Esc/Ctrl-C / `/cancel` / `/pause` 항상 우선.
- **PRD-driven 인 ralph 는 명시 종료 조건 강제** — 무한 루프 차단, 최대 iteration 사용자 설정.

### 9.14 Built-in Agent Role Catalog

20개 specialized sub-agent 역할. 각 역할은 **명시적 책임 / 비책임 boundary** (OMC 패턴 차용) 와 **default GLM 모델** 부여. 워크플로가 이 역할들을 조합.

#### 역할 표 (L = level, 모델은 default — 사용자 override 가능)

| 역할 | L | 모델 | 책임 | 비책임 |
|------|---|------|------|--------|
| **planner** | 4 | GLM-5.1 (thinking on) | 작업 분해, 인터뷰, 의존성 그래프, plan 작성 (`.glm/plans/*.md`) | 구현, 코드 분석, 리뷰 |
| **architect** | 3 | GLM-5.1 | 코드 분석, 아키텍처 결정, 디버깅 root cause, READ-ONLY | plan 작성, 구현 |
| **executor** | 2 | GLM-5.1 | 정확 구현, multi-file 변경 e2e | 아키텍처 결정, planning, 리뷰 |
| **verifier** | 3 | GLM-5.1 | 완료 증거 수집, 회귀 위험, acceptance criteria 검증 | 구현, 요구 수집, 스타일 리뷰 |
| **critic** | 3 | GLM-5.1 | **최종 QA gate**, 누락 식별, multi-perspective | 친절한 피드백 |
| **code-reviewer** | 3 | GLM-5.1 | spec 준수, 보안, SOLID, 안티패턴, severity-rated | 구현, 아키텍처 |
| **code-simplifier** | 2 | GLM-5-Turbo | 명확성/일관성/유지보수성 정제 (기능 보존) | 새 기능 추가 |
| **security-reviewer** | 3 | GLM-5.1 | OWASP Top10, 시크릿 감지, 안전 패턴 | 일반 리뷰 |
| **test-engineer** | 3 | GLM-5.1 | 테스트 전략, integration/e2e coverage, flaky 안정화, TDD | 구현, 리뷰 |
| **qa-tester** | 2 | GLM-5-Turbo | 인터랙티브 CLI 테스트 (tmux 세션 관리) | 자동 단위 테스트 |
| **debugger** | 2 | GLM-5.1 | root cause 분석, 회귀 격리, 스택 트레이스, 빌드 에러 해결 | feature 구현 |
| **tracer** | 3 | GLM-5.1 | 인과 추적, 경쟁 가설, 증거 for/against, 불확실성 추적, next-probe | 구현, 일반 리뷰, 자신감 부풀리기 |
| **explore** | 3 | GLM-4.5-Air | 파일 위치, 패턴, 관계 찾기 (read excerpts) | 코드 수정, 깊은 분석, 디자인 doc 감사 |
| **analyst** | 4 | GLM-5.1 (thinking) | pre-planning, 요구 분석, gap 식별 | 구현, plan 작성 |
| **scientist** | 3 | GLM-5.1 | 데이터 분석, 연구 실행, 가설 검증 | 구현 |
| **designer** | 3 | GLM-5.1 | UI/UX, 컴포넌트, 디자인 시스템 | 백엔드 |
| **document-specialist** | 3 | GLM-4.5-Air | 외부 문서/레퍼런스 검색, doc 캐시, Context Hub | 코드 |
| **writer** | 2 | GLM-5-Turbo | 기술 문서, README, API doc, 주석 | 코드 변경 |
| **git-master** | 3 | GLM-5-Turbo | atomic commit, rebasing, history 관리, 스타일 감지 | 코드 변경 |
| **orchestrator** (메타) | 4 | GLM-5.1 (thinking, 또는 GLM-5 on Pro/Max) | task 토폴로지, fan-out 결정, pipeline gate, 모델 라우팅 (§7) | 직접 코드 작성 |

#### Level 시스템

| Level | 의미 | 매핑 모델 (default) |
|-------|------|-------------------|
| 1 | 가장 가벼운 lookup / 단순 호출 | GLM-4.5-Air |
| 2 | 표준 작업 (sonnet-class) | GLM-5-Turbo (직렬만, slot 1) 또는 GLM-5.1 |
| 3 | 분석 / 리뷰 / 깊은 작업 (sonnet+ class) | GLM-5.1 |
| 4 | 전략 / 의사결정 / 인터뷰 (opus class) | GLM-5.1 + thinking on (Pro/Max: GLM-5) |

사용자는 `~/.glm/settings.json` 에서 역할별 모델 override 가능:
```jsonc
{
  "agents": {
    "executor": { "model": "GLM-5-Turbo" },   // 빠르게
    "critic":   { "model": "GLM-5" }           // Pro/Max 면 최고 정확도
  }
}
```

#### 역할의 시스템 프롬프트 형식 (OMC 패턴 차용)

각 역할은 자체 시스템 프롬프트 파일 (`agents/<role>.md`):
```markdown
---
name: planner
description: Strategic planning consultant with interview workflow
model: GLM-5.1
level: 4
thinking: true
disallowedTools: []           # (필요시) e.g., architect 는 Write/Edit 차단
---

<Agent_Prompt>
  <Role>
    You are Planner. Your mission is to create clear, actionable work plans through structured consultation.
    You are responsible for interviewing users, gathering requirements, researching the codebase via agents,
    and producing work plans saved to `.glm/plans/*.md`.
    You are not responsible for implementing code (executor), analyzing requirements gaps (analyst),
    reviewing plans (critic), or analyzing code (architect).
    When a user says "do X" or "build X", interpret it as "create a work plan for X." You never implement. You plan.
  </Role>
  ...
</Agent_Prompt>
```

명시적 "you ARE / you ARE NOT responsible for" boundary 가 매 역할마다 강제 — 역할 침범 방지, 결과 예측 가능성 ↑.

#### Worker Preamble Protocol

OMC 차용: orchestrator 가 sub-agent spawn 시 `wrapWithPreamble()` 같은 헬퍼로 시스템 프롬프트 위에 추가 메타정보 주입:
- 부모로부터 받은 task scope (정확한 boundary)
- "do not spawn further sub-agents" (재귀 차단)
- 출력 형식 강제 (§6.3 의 4K 토큰 markdown)
- timeout / quota 정보

→ 같은 agent 역할이 단독 호출 vs 자식 호출 둘 다 일관되게 동작.

#### MCP / Skill / Plugin 과의 관계 정리

| 구분 | 위치 | 관리 | 사용 |
|------|------|------|------|
| **Built-in workflow** (§9.13) | `packages/workflows/` (코드) | glm maintainer | `/autopilot` 등 즉시 |
| **Built-in agent role** (§9.14) | `packages/agents/` (역할별 .md) | glm maintainer | 워크플로가 호출 |
| **User custom skill** (§9.4) | `.glm/skills/` , `~/.glm/skills/` | 사용자 | `/<skill-name>` |
| **Plugin skill** (§9.5) | `~/.claude/plugins/.../skills/` | 플러그인 작성자 | `/<plugin>:<skill>` |
| **CC 호환 skill** (§9.4) | `~/.claude/skills/` | 사용자 (CC 자산) | `/<skill-name>` (cascade) |

빌트인 워크플로는 `/autopilot`, OMC 플러그인 별도 설치하면 `/oh-my-claudecode:autopilot` 둘 다 호출 가능. **빌트인 우선**, 사용자가 명시하면 OMC 버전.

### 9.15 Hook & Event System (확장)

§9.6 의 기본 hook 시스템을 OMC 의 11-event + OMX 의 20+ event 로 확장. 모든 워크플로 / 메모리 / 상태 관리가 이 위에 올라타는 **백본**.

**이벤트 카탈로그 (v0.1 모두 지원)**:

| 카테고리 | 이벤트 | 트리거 |
|---------|-------|-------|
| Session | `SessionStart`, `SessionEnd`, `SessionIdle` | 세션 시작/종료/유휴 (옵션 timeout) |
| Prompt | `UserPromptSubmit` | 사용자 입력 직전 (변형/keyword detect 등) |
| Tool | `PreToolUse`, `PostToolUse`, `PostToolUseFailure` | 도구 호출 전/후/실패 |
| Subagent | `SubagentStart`, `SubagentStop` | sub-agent spawn / exit |
| Compaction | `PreCompact`, `PostCompact` | 컴팩션 전/후 |
| Loop | `Stop`, `TurnComplete` | turn 종료 / 응답 완료 |
| Run | `RunHeartbeat`, `RunBlocked` (사용자 응답 대기) | long-horizon 진행 상태 |
| Worker | `WorkerAssigned`, `WorkerStalled`, `WorkerRecovered` | rate-limit queue / fan-out lifecycle |
| Test | `TestStarted`, `TestFinished`, `TestFailed` | (test-engineer agent / ultraqa 워크플로) |
| Quality | `RetryNeeded`, `HandoffNeeded`, `NeedsInput` | orchestrator 시그널 |
| External | `PRCreated`, `Notification` | git-master / 알림 |

**Hook Plugin SDK** (OMX 차용):
```ts
// 사용자 / 플러그인 / 빌트인 모두 동일 API 사용
import { defineHook } from "@glm/code/sdk"

export default defineHook({
  event: "PostToolUse",
  matcher: "Edit|Write|MultiEdit",
  async run(ctx) {
    // ctx 에 다음 노출:
    //   - ctx.tmux.sendKeys (안전 send-keys, 옵션)
    //   - ctx.log.{info,warn,error}
    //   - ctx.state.{read,write,delete,all}
    //   - ctx.session, ctx.hud, ctx.notify
    //   - ctx.glm.{model, sessionId, workerId, phase}
    //   - ctx.tool, ctx.message, ctx.diff
    await ctx.notify("Edit done: " + ctx.tool.path)
  }
})
```

**Config 형식** — Claude Code 호환 + 확장:
```jsonc
"hooks": {
  "PostToolUse": [
    { "matcher": "Edit", "hooks": [{ "type": "command", "command": "prettier --write $GLM_FILE" }] }
  ],
  "WorkerStalled": [
    { "hooks": [{ "type": "plugin", "package": "@glm/code/builtin/notify-stall" }] }
  ]
}
```

**Kill switch**: `DISABLE_GLM_HOOKS=1`, `GLM_SKIP_HOOKS=<name1>,<name2>`.

**무한 루프 방지**: 30s timeout, 1 turn 5회 이상 호출시 비활성 + 사용자 알림 (§9.6 정책 유지).

### 9.16 Memory Layer System (Trio + Hindsight)

§8 의 AGENTS.md / `## Memories` 위에, OMC 의 트리오 + oh-my-pi 의 hindsight 패턴을 더한 **다층 메모리**:

| 레이어 | 위치 | 수명 | 용도 |
|--------|------|------|------|
| **Notepad** | `.glm/notepad.md` | **컴팩션 생존** | 진행 중 발견사항 / TODO / 작업 노트. priority/working/manual 3-tier write |
| **Project Memory** | `.glm/project-memory.json` | 영구 | "notes" (관찰) vs "directives" (룰) 분리 |
| **Shared Memory** | `.glm/shared/<key>.json` | 세션 단위 | sub-agent / team peer 간 KV (file-locked) |
| **Hindsight** | `.glm/hindsight/{bank,mental-models,seeds}/` | 영구 + 글로벌 cascade | **첫 턴 `<memories>` 자동 inject**, `retain` / `recall` / `reflect` API |
| **AGENTS.md** | (§8 그대로) | 영구 | 사용자-가시 1차 인스트럭션 + ## Memories 인덱스 |
| **Session Wiki** | `.glm/wiki/` (v0.2) | 영구 | 사람-가독 markdown KB (Karpathy 모델) |

**Hindsight `<memories>` 인젝션 (oh-my-pi 차용)**:
첫 user turn 시점에 자동으로:
```xml
<memories>
  <mental_models>
    [from .glm/hindsight/mental-models/ — curated thinking patterns]
  </mental_models>
  <project_facts>
    [from .glm/hindsight/bank/ — auto-saved learnings, relevant subset by RAG]
  </project_facts>
  <recent_retains>
    [last N agent-initiated retain() calls]
  </recent_retains>
</memories>
```
LLM 이 system prompt cached 영역 다음에 자연스럽게 봄. 사용자 anytime `/memory hindsight` 로 확인.

**Tool API** (LLM 가 호출):
- `Memory.retain(text, type, scope)` — 사용자 명시 / agent 자율 저장
- `Memory.recall(query)` — semantic search over banks (fallback: grep)
- `Memory.reflect()` — 현재 turn 의 발견을 자동으로 retain 후보 추출

**Hindsight 캡** (§8 의 200줄 룰 + 추가):
- bank/<topic>.md 개별 캡: 4KB
- bank/ 총합: 5MB (LRU)
- mental-models/ 사용자가 수동 큐레이션 (자동 evict 안 함)

### 9.17 Natural Language Activation

OMC + OmO 차용. 사용자가 `/autopilot` 같은 명시 슬래시 안 써도 자연 언어 → 자동 워크플로 매칭.

**키워드 감지 → 워크플로 활성** (UserPromptSubmit hook):

| 키워드 (사용자 입력에 포함) | 활성화 워크플로 |
|---------------------------|---------------|
| "autopilot", "auto pilot", "build me", "create me", "handle it all" | `/autopilot` |
| "ralph", "don't stop", "must complete", "finish this", "keep going until done" | `/ralph` |
| "ultrawork", "ulw", "in parallel" | `/ultrawork` |
| "team", "swarm", "지원군" | `/team` |
| "plan this", "let's plan", "design first" | `/plan` |
| "ralplan", "consensus", "review the plan" | `/ralplan` |
| "trace", "왜?", "why does", "investigate" | `/trace` |
| "verify", "확인", "evidence" | `/verify` |
| "deslop", "anti-slop", "AI 슬롭" | `/ai-slop-cleaner` |
| "ultrathink", "thinking on", "deep think" | thinking mode 활성 (skill 안 부름) |
| "tdd" | TDD workflow 활성 |

**우선순위 + 안전장치**:
- 첫 매치 승 (다중 매치시 우선순위 표)
- **코드 블록 / URL 내부의 키워드는 무시** (false positive 방지, OMC `keyword-detector` 차용)
- 사용자가 명시적으로 슬래시 명령 사용시 키워드 감지 skip
- `/no-keyword` 로 한 turn 키워드 감지 끔
- `~/.glm/settings.json` 의 `keywords.disabled: true` 로 영구 끔
- 매 매치는 chat 에 1줄 알림 ("🔮 detected 'ralph' → activating /ralph")

**Delegation Categories** (OMC `delegation-categories` 차용):
사용자 / orchestrator 가 task 의 "category" 선택 → 자동으로 temperature + thinking-budget + model 매핑:

| Category | Temperature | Thinking | 모델 |
|---------|------------|---------|------|
| `visual-engineering` | 0.7 | medium | GLM-5.1 (designer agent) |
| `ultrabrain` | 0.3 | high | GLM-5.1 (thinking on) |
| `artistry` | 0.9 | low | GLM-5.1 |
| `quick` | 0.4 | off | GLM-5-Turbo (또는 GLM-4.5-Air) |
| `writing` | 0.5 | low | GLM-5-Turbo (writer agent) |
| `precision` | 0.0 | high | GLM-5.1 (executor agent) |

orchestrator 가 task 분류시 자동 적용. 사용자 override 가능 (`/category quick`).

### 9.18 Internal URL Schemes (oh-my-pi 차용)

**원칙**: 8+ 도구를 1개의 `Read(url)` 로 합치는 게 oh-my-pi 의 가장 우아한 아키텍처 결정. **glm 도 동일 채택**.

**스킴 카탈로그 (v0.1)**:

| URL | 무엇 | 예 |
|-----|-----|-----|
| `local://path/to/file` | 로컬 파일 (기본 — 명시 prefix 옵션) | `local://src/auth/oauth.ts` |
| `local://path:50-100` | 라인 범위 | `local://README.md:1-30` |
| `local://path:50+20` | 시작+카운트 | (20 라인) |
| `agent://<id>` | 진행 중/완료 sub-agent 결과 | `agent://w-7` |
| `artifact://<sha>` | 컴팩션-spillover 또는 blob-store 자료 | `artifact://abc123` |
| `memory://<scope>/<key>` | 메모리 (notepad/project/shared/hindsight) | `memory://project/coding-style` |
| `mcp://<server>/<resource>` | MCP server 의 resource | `mcp://linear/issue/INGEST-42` |
| `issue://<repo>#<number>` | GitHub issue (read-only, gh CLI 위임) | `issue://owner/repo#42` |
| `pr://<repo>#<number>` | GitHub PR (diff/comments/checks) | `pr://owner/repo#1234` |
| `skill://<name>` | skill 본문 (lazy fetch) | `skill://hyperplan` |
| `rule://<scope>/<name>` | rule 시트 (templates/rules/ 와 cascade) | `rule://coding-style` |
| `conflict://path` | git merge conflict (token-based 해결) | `conflict://src/main.ts` |
| `tab://<id>` | 브라우저 탭 (v0.2) | — |

**효과**:
- LLM 의 도구 카탈로그 ~50개 → ~20개 (Read 가 다 흡수)
- 같은 시멘틱 (read + range + selector) 가 모든 자원에 일관 적용
- Permission 정책도 URL 패턴 기반으로 단순화 (`allow: ["issue://*", "pr://owner/repo#*"]`)

**구현**: `packages/core/internal-urls/router.ts` (oh-my-pi 패턴) — protocol 별 handler dispatcher.

### 9.19 Bidirectional Notification & Control Bridges

**Notify-Only** (§8.12 yolo 의 알림 채널과 통합):
- macOS notification, Discord webhook, Slack webhook, Email, Telegram

**Bidirectional (OmO OpenClaw 차용)** — **glm 의 unique 차별점**:
> Discord / Telegram 에서 사용자가 답장 → glm 세션에 inbound 메시지로 inject. 외출 중 yolo 모드 8시간 실행 중에도 봇으로 원격 제어.

```jsonc
"notifications": {
  "channels": {
    "telegram": {
      "botToken": "...",
      "chatId": "...",
      "bidirectional": true,         // 답장도 받음
      "replyTimeout": "10m"
    },
    "discord": {
      "webhook": "...",
      "bidirectional": true,
      "botToken": "..."              // bidirectional 면 bot 필요
    }
  },
  "events": {
    "yolo.tier-c-blocked": ["telegram"],
    "quota.warning":        ["telegram", "macos"],
    "session.idle":         ["telegram"],
    "session.complete":     ["telegram", "discord"]
  }
}
```

**Reply Daemon** 동작:
1. Telegram bot 이 새 메시지 polling (또는 webhook)
2. 사용자가 "approve" / "deny" / 자유 텍스트 응답
3. Daemon 이 reply → 적절한 active session 의 in-flight permission prompt 또는 user_turn 으로 inject
4. Audit log 에 기록

**`/notify test <channel>`** 으로 양방향 동작 검증.

**구조화된 질문** (OMX `omx question` 차용):
사용자에게 묻는 질문을 단순 텍스트가 아닌 structured payload 로:
```jsonc
{
  "type": "single",                    // single | multi | freetext
  "question": "다음 phase 진행?",
  "options": [
    { "id": "approve", "label": "approve and continue" },
    { "id": "deny", "label": "abort" },
    { "id": "modify", "label": "modify plan first" }
  ]
}
```
→ Telegram / Discord 에 button UI 로 렌더 가능, 응답 검증 가능, AskUserQuestion 과 매핑.

### 9.20 Resilience & Quality Hooks

OMC + OmO 의 retry/recovery 패턴 통합:

| 컴포넌트 | 출처 | 역할 |
|---------|------|------|
| **Preemptive Compaction** | OmO | §4.4 의 threshold 도달 전에 미리 압축 시작 (백그라운드) — 사용자 다음 turn 에 압축 지연 안 봄 |
| **Compaction Todo Preserver** | OmO | 압축 시 진행 중 TODO 와 critical context 무조건 보존 (template 의 ## Progress 섹션 강제 채움) |
| **Session Recovery** | OmO | 다음 시나리오 자동 복구: missing tool result / thinking block mismatch / 빈 메시지 / JSON parse 실패 / context-limit 단발성 응답 |
| **Continuation Enforcement** | OmO + OMC | agent 가 todo 남기고 멈추면 자동 "continue" inject (단, 사용자가 명시 stop 안 한 경우만) |
| **Stop Continuation Guard** | OmO | persistent-mode / long-horizon 일 때만 활성, 일반 chat 은 OFF |
| **Trace Timeline + Summary** | OMC | 매 hook / keyword / skill / agent / tool 발화를 별도 SQLite 테이블에 기록 — `glm trace timeline <session>` / `/trace` 디버그 |
| **Verification Tier-Selector** | OMC | "이 verify 가 얼마나 critical?" → 자동으로 haiku/sonnet/opus 등급 선택. glm 매핑: GLM-4.5-Air / GLM-5-Turbo / GLM-5.1 |
| **TTSR (v0.2)** | oh-my-pi | Time-Traveling Streamed Rules — 컨텍스트 0의 regex 룰. stream 중 매치되면 abort 후 컨텍스트 inject. 매우 효율적 guard rail |

매 컴포넌트 ON/OFF 사용자 설정 가능 (`recovery.<name>.enabled`).

### 9.21 Workspace-Aware Built-in Tools

오픈소스 코딩 에이전트가 흔히 가진 패턴 통합:

#### Commit Tool (oh-my-pi 차용)
- `glm commit` / `/commit` — **agentic** 모드 (sub-agent 가 git-overview / git-file-diff / git-hunk 호출)
- Conventional commit 자동 생성, validator (filler word / meta phrase 차단)
- Hunk-level staging — 변경이 여러 concerns 에 걸쳐있으면 자동으로 split commits + dep ordering
- Changelog 제안 + `CHANGELOG.md` 자동 entry
- Push, PR 자동 생성 옵션 (`--push --pr`)
- Pre-commit hook 통합 (실패시 자동 분석 + 재시도)

#### Recipe Tool (oh-my-pi 차용)
프로젝트의 task runner 자동 감지 (npm/cargo/just/make/task) → 통합 인터페이스:
```
glm recipe                       # 사용 가능한 recipe 목록
glm recipe test                  # 자동으로 npm test / cargo test / just test 매핑
glm recipe build --release
```
ad-hoc bash 호출 대신 권장. LLM 도 `Recipe.list()` / `Recipe.run(name)` 로 호출.

#### Eval Tool (oh-my-pi 차용, **v0.2**)
- Cell-header 형식: `*** Cell <lang>:"<title>" [t:<dur>] [rst]`
- Python (subprocess, NDJSON RPC) + JS (Worker)
- `tool.<name>()` cell 안에서 다른 도구 호출 가능
- Magics: `%pip`, `%cd`, `%env`, `%time`, `%%bash`, `%%capture`, `%%writefile`, `!shell`
- `display()` markdown/image/table 인라인 렌더 (iTerm2/Kitty)
- Scientist / analyst agent 의 핵심 도구
- **v0.1 에는 미포함 (Python 사이드카 인프라 무거움). v0.2 yield**

#### Universal Config Discovery (oh-my-pi 차용)
첫 실행 시 다음 도구의 config 자동 감지 → import 옵션 제공:
- `~/.claude.json`, `~/.claude/` (이미 §9 호환)
- `~/.cursor/`, `~/.windsurf/`, `~/.codeium/`
- `~/.gemini/`, `~/.codex/`, `~/.cline/`, `~/.copilot/`
- VS Code `settings.json` (관련 부분만)

`glm import-config <source>` 로 사용자 선택. 그대로 import / 미리보기 / cherry-pick.

### 9.22 v0.2 Deferred Features (이 §9 의 확장)

위 §9.13-9.21 의 일부는 v0.1 부담이 커서 v0.2 로 미룸. 인터페이스만 v0.1 에 준비:

| 기능 | 출처 | v0.2 yield 이유 |
|------|------|----------------|
| **Eval Tool** (Python+JS REPL) | oh-my-pi | Python 사이드카 인프라 무거움 (gyoshu_bridge 같은 socket RPC). v0.1 은 Bash로 충분. |
| **Hyperplan adversarial planning** | OmO | 5 hostile members × team mode 종속. team mode v0.2. |
| **TTSR (Streamed Rules)** | oh-my-pi | LLM stream 인터셉트 인프라 필요 (token-level state machine). 가치 큰데 복잡. |
| **ACP + RPC modes** | oh-my-pi | 외부 IDE/editor 와 통합 표준. VS Code 확장 (v0.2) 와 함께 옴. |
| **OpenClaw bot reply daemon** (full bidirectional) | OmO | Notification 채널은 v0.1 (notify-only), 양방향 (bot polling + reply inject) 은 v0.2. |
| **Hindsight `<memories>` 자동 inject** | oh-my-pi | bank/mental-models 데이터 형식만 v0.1, 자동 inject + reflect tool 은 v0.2. |
| **Wiki (LLM KB)** | OMC | 사용자가 큐레이션할 markdown KB. 메모리 trio 가 v0.1 이라 wiki 는 v0.2. |
| **TUI 의 Visual subagent panes (tmux 통합)** | OmO | tmux 종속. glm 의 Ink TUI dashboard 와 통합 패턴 결정 필요. |
| **Universal Config Import wizard** | oh-my-pi | v0.1 은 CC 만, v0.2 에 Cursor/Windsurf/Cline 등 추가. |
| **Native Rust acceleration** | OMX, oh-my-pi | Bun + Rust N-API 대신 v0.1 은 pure TS + better-sqlite3 만. v0.3+ perf 평가 후 결정. |

각 항목은 v0.1 부터 **자리(slot)** 만 잡아둠 (인터페이스 정의 + TODO 마커), 실 구현은 v0.2+.

### 9.23 Action × Model × Thinking-Effort — User-Facing Configuration Layer

oh-my-pi 의 `/model` picker UX 를 차용 + 우리의 20-role 시스템 위에 얹은 **2-layer 모델 라우팅**. 사용자는 8개 action 만 만지고, 내부 20 role 이 그 매핑을 상속.

#### 왜 2-layer?

- 우리의 20 agent roles (§9.14) 는 *worker identity* — "planner 는 planning 책임, executor 는 구현 책임" 등 OMC boundary 강제.
- oh-my-pi 의 actions 는 *capability buckets* — "빠르게 / 깊게 / 시각 / 계획 / 디자인 / 커밋 / 서브" 등 작업의 성격.
- 단일 레이어로는 **사용자가 8개만 만지고 싶음** vs **20개 role 의 boundary 보존** 두 요구가 충돌.
- 해법: **A 레이어 (사용자 노출) ← B 레이어 (내부 role) 상속**.

#### Layer A: User-Facing 7 Actions

`~/.glm/settings.json` 의 `actions` 섹션 (canonical default 값):

```jsonc
{
  "actions": {
    "default":   { "model": "GLM-5.1",      "thinking": "medium" },
    "smol":      { "model": "GLM-5-Turbo",  "thinking": "off"    },
    "slow":      { "model": "GLM-5.1",      "thinking": "xhigh"  },
    "plan":      { "model": "GLM-5.1",      "thinking": "high"   },
    "designer":  { "model": "GLM-5.1",      "thinking": "medium" },
    "commit":    { "model": "GLM-5-Turbo",  "thinking": "off"    },
    "task":      { "model": "GLM-5.1",      "thinking": "low"    }
  }
}
```

**왜 vision 이 actions 에 없는가?**
GLM Coding Plan 은 vision-capable LLM 모델을 포함하지 않음 (5.1/5-Turbo/4.7/4.6/4.5-Air 전부 텍스트 전용). Vision 작업은 항상 **bundled `glm-vision` MCP 서버** (§9.12) 로 위임됨. 사용자가 vision routing 을 바꾸려면 `glm mcp` 로 vision MCP 서버 자체를 교체. 별도 "vision action" 슬롯 없음 — orthogonal capability.

**Action 카탈로그** (고정 7개, 확장 불가):

| Action | 의미 | 기본 모델 | 기본 thinking | 어떤 role/도구가 사용? |
|--------|------|---------|------|---------------------|
| `default` | 일반 — 정의 안 된 작업의 fallback | GLM-5.1 | medium | orchestrator (default), executor, message.send |
| `smol` | Fast — 가벼운 lookup, 단순 변환 | GLM-5-Turbo | off | explore, code-simplifier, document-specialist, writer |
| `slow` | Thinking — 깊은 추론 필요 | GLM-5.1 | xhigh | critic, tracer, analyst, scientist, security-reviewer, code-reviewer (deep mode) |
| `plan` | Architect — 계획 / 설계 | GLM-5.1 | high | planner, architect, plan workflow, ralplan workflow |
| `designer` | UI/UX 디자인 | GLM-5.1 | medium | designer role, frontend skill |
| `commit` | Git commit, 메시지 작성 | GLM-5-Turbo | off | git-master role, commit tool |
| `task` | Subtask — sub-agent default | GLM-5.1 | low | Task tool spawned sub-agents (executor의 자식) |

**Vision capability** (별도 layer, §9.12 참조):
- 모든 vision 작업 (image_analysis, ui_to_artifact, OCR, video_analysis 등) → `glm-vision` MCP 자동 위임
- 사용자가 이미지 첨부 시 daemon 이 자동 감지 → `glm-vision/image_analysis` 호출 → 결과 텍스트로 메인 LLM 에 inject
- `/model` picker 에는 vision slot 없음. 대신 picker 하단에 정보 표시:
  ```
  Vision routing: glm-vision MCP (Vision pool: 4h 51m left)
  → /mcp manage glm-vision to override
  ```

#### Layer B: Internal Role → Action 매핑

각 role 의 frontmatter 에 `action:` 필드 추가 (스펙 §9.14 의 frontmatter 확장):

```markdown
---
name: planner
description: Strategic planning consultant with interview workflow
action: plan                    # NEW — settings.actions.plan 매핑 참조
level: 4
# model / thinking 필드는 더 이상 frontmatter 에 직접 명시 안 함
---
```

20 role × action 매핑 (확정):

| Role | Action | Role | Action |
|------|--------|------|--------|
| orchestrator | `slow` (thinking heavy) | code-reviewer | `slow` |
| planner | `plan` | code-simplifier | `smol` |
| architect | `plan` | security-reviewer | `slow` |
| executor | `default` | test-engineer | `default` |
| verifier | `default` | qa-tester | `smol` |
| critic | `slow` | debugger | `default` |
| tracer | `slow` | designer | `designer` |
| explore | `smol` | document-specialist | `smol` |
| analyst | `slow` | writer | `smol` |
| scientist | `slow` | git-master | `commit` |

#### Layer C: Thinking-Effort 6-Level

`inherit / off / min / low / medium / high / xhigh` (7개, `inherit` 포함).

Token budget 매핑 (LLM API 호출 시 `thinking.budget_tokens` 변환):

```ts
const THINKING_BUDGETS: Record<ThinkingLevel, number> = {
  inherit: -1,        // 부모/default 상속 (resolver 에서 풀림)
  off:     0,
  min:     512,
  low:     2_048,
  medium:  8_192,
  high:    32_768,
  xhigh:   65_536
}
```

OpenAI-mode 모델 (GLM-4.5-Air 등) 에선 `thinking` 미지원 → 자동으로 `off` 로 강등 (사용자 알림).

#### Resolution 우선순위 (정확한 순서)

LLM 호출 직전 모델/thinking 결정:

```
1) 호출 시 명시적 인자 (e.g., `/route GLM-4.7`, sub-agent spawn 의 model=)
2) settings.agents.<role>.model / .thinking            ← 사용자 advanced override
3) settings.actions.<action>.model / .thinking         ← 사용자 일반 설정 (Layer A)
4) role frontmatter 의 action 매핑 (Layer B)            ← 빌트인 기본
5) hardcoded default (위 표의 기본값)
```

higher 가 lower 를 덮어씀. 사용자 advanced 사용자만 2번 layer 까지 내려감.

#### `/model` Picker (TUI — oh-my-pi UX 차용)

```
┌─ Models ─ ALL ─ CANONICAL ─ ZAI ───── (Tab to cycle) ─┐
│                                                       │
│ > zai/glm-5.1     [DEFAULT] [SLOW] (inherit)          │
│   zai/glm-4.5-air [SMOL]            (inherit)         │
│   zai/glm-5-turbo [COMMIT]          (inherit)         │
│   zai/glm-5                                           │
│   zai/glm-4.7                                         │
│   zai/glm-4.6                                         │
│                                                       │
│ Model Name: GLM-5.1                                   │
│                                                       │
│ Action for: glm-5.1                                   │
│ > Set as DEFAULT (Default)                            │
│   Set as SMOL (Fast)                                  │
│   Set as SLOW (Thinking)                              │
│   Set as PLAN (Architect)                             │
│   Set as DESIGNER (Designer)                          │
│   Set as COMMIT (Commit)                              │
│   Set as TASK (Subtask)                               │
│                                                       │
│ Vision routing: glm-vision MCP  (managed separately)  │
│                                                       │
│ Enter: continue   Esc: cancel                         │
└──────────────────────────────────────────────────────┘
```

action 선택 후 → thinking effort 선택 화면:
```
Thinking for: Default (glm-5.1)
> inherit
  off
  min
  low
  medium
  high
  xhigh
```

라벨/구조 모두 oh-my-pi 와 동일 (사용자 친숙도).

#### CLI

```bash
glm models                              # 현재 action 매핑 표시 (위 picker 의 정적 출력)
glm model set <action> <model-name>     # 매핑 설정 (e.g., `glm model set slow glm-5`)
glm model set <action> --thinking <lvl> # thinking 효율 설정
glm model reset                         # 모든 매핑 default 로 복원
glm model reset <action>                # 특정 action 만 복원
glm model show <action>                 # 현재 매핑 + thinking 출력
```

CLI ↔ slash 1:1 (§5.9):
- `/model` TUI picker (인터랙티브)
- `/model <action> <model-name>` 직접 설정
- `/model reset [<action>]`
- `/model show [<action>]`

#### Thinking Effort 시멘틱 (모델별 다름)

- **GLM-5.1** (Anthropic mode): `thinking.budget_tokens` 직접 적용. xhigh = 65K (max 출력 128K 의 절반)
- **GLM-5-Turbo / GLM-4.7 / GLM-4.6** (Anthropic mode): 동일 적용
- **GLM-4.5-Air / 4.5-AirX** (OpenAI mode): hybrid thinking — `reasoning_effort` 매핑 가능하면 그것, 아니면 off

대시보드에서 thinking 활성 시 시각화 (`▸ thinking (3.2s) ...` collapsed 박스).

#### 첫 실행 UX

```
$ glm                              # daemon 첫 시작
[glm] Welcome! Setting up default action mappings…
      ✓ default  → GLM-5.1     medium thinking
      ✓ smol     → GLM-5-Turbo off thinking
      ✓ slow     → GLM-5.1     xhigh thinking
      ✓ plan     → GLM-5.1     high thinking
      ✓ commit   → GLM-5-Turbo off thinking
      ✓ task     → GLM-5.1     low thinking
      ✓ designer → GLM-5.1     medium thinking
      ⓘ vision routing: glm-vision MCP (auto-managed; see /mcp)

      Use /model to customize. Use /model reset to restore defaults.

You> _
```

#### Settings 파일 호환

기존 `~/.glm/settings.json` 의 advanced override (`agents.<role>.model`) 와 새 `actions` 섹션 공존. role override 가 우선. 사용자가 어떤 layer 에서 만지든 일관:

```jsonc
{
  "actions": {
    "default": { "model": "GLM-5.1", "thinking": "medium" }
  },
  "agents": {
    "critic": { "model": "GLM-5", "thinking": "xhigh" }    // GLM-5 (Pro/Max) 로 critic 만 별도
  }
}
```

위 설정에서 critic 호출시: action=slow → settings.actions.slow → ... 이지만 `settings.agents.critic` 가 명시되어 있어서 그것이 우선 → `GLM-5 + xhigh`.

---

§9.23 핵심: **7 action × 7 thinking level × 20 role 의 2-layer (+ override) 시스템**. Vision 은 §9.12 의 glm-vision MCP orthogonal capability — actions 에 포함 안 됨. 사용자 UX 는 oh-my-pi 단순함 (`/model` picker 7개 슬롯) 그대로, 내부는 우리 20-role boundary 유지. 후속 plan: P2 (TUI picker), P6 (settings + thinking resolver), P8 (role frontmatter `action:` 필드 + resolver).

---

## 10. LLM Router (§6)

### 10.1 두 엔드포인트 동시 지원

| 엔드포인트 | URL | 모델 | 특징 |
|---------|------|------|------|
| Anthropic 호환 | `api.z.ai/api/anthropic` | GLM-5.1, 5-Turbo, 5, 4.7, 4.6 | prompt caching 지원 |
| OpenAI 호환 | `api.z.ai/api/coding` | GLM-4.5-Air, 4.5-AirX, 4.5 | 일부 캐싱 미지원 |

자동 선택, 사용자 override 가능.

### 10.2 메시지 변환 레이어

내부 IR (Anthropic-style 기준) → OpenAI mode 변환:
- system blocks → `messages[0]` role:system
- tool_use → `tool_calls[]`
- tool_result → role:tool
- thinking → drop 또는 reasoning_content
- cache_control → drop

### 10.3 인증

**우선순위**:
1. `GLM_API_KEY` / `ZAI_API_KEY` env
2. `ANTHROPIC_API_KEY` (base URL = GLM 인 경우, CC 호환)
3. `~/.glm/credentials.json` (0600)
4. macOS Keychain (옵션)

**Multi-account**: `glm config use <profile>` 또는 `--profile <name>`. 여러 GLM 계정 / Lite vs Pro 분리 운영 등에 사용. `baseUrl` 은 z.ai 표준 엔드포인트로 고정 (다른 provider 미지원).

### 10.4 Quota Tracker (3 풀)

`~/.glm/quota.db` SQLite:
- `quota_usage` (시계열): pool, model, tool, requests, tokens, vision_seconds
- `quota_pools`: pool, tier, limits, refresh_at

**Dashboard**:
```
Quota   3,420 / 15,000 daily req   78% left (refresh 4h 12m)
```

**임계 액션**:
- 80% → 노란 경고, fan-out depth 1 제한
- 95% → 빨강, 새 fan-out 차단
- 100% (429) → 일시정지, 사용자 결정 (fallback profile / 대기 / local v0.2)

### 10.5 Idempotency Cache

`llm_cache` 테이블 (key, response, usage, ts). Hit 시 LLM 호출 0. Resume / retry 무비용.

### 10.6 Retry 정책

| 에러 | Retry | Backoff |
|------|-------|--------|
| Network / 5xx | 3회 | exp 1/2/4s |
| 429 동시한도 | 무한 (scheduler 큐잉) | — |
| 429 일일 quota | 0 | 사용자 결정 |
| 400 | 0 | 버그 가능성 |
| 401/403 | 0 | credential |
| 408 stream | 1회 | 부분 응답 보존 |
| 503 overloaded | 3회 | exp 5/15/45s |
| 안전 거부 | 0 | 사용자 알림 |

4회 이상 항상 사용자 prompt.

### 10.7 스트리밍

일관 IR 이벤트: `message_start`, `thinking_delta`, `text_delta`, `tool_use_start/_input_delta/_stop`, `message_stop`, `usage`.

**Cancel**: 다음 chunk boundary 에서 stop, 받은 토큰 commit.

### 10.8 (제거됨)

> glm code 는 **GLM Coding Plan 전용**. Local LLM (Ollama/vLLM) / OpenRouter / 다른 provider 는 명시적 non-goal. Quota 소진 시 대안은 다른 GLM profile 이나 wait-for-refresh 만.

### 10.9 Provider 추상화

```ts
interface LLMProvider {
  capabilities: { streaming, promptCaching, thinking, toolUse, visionInput }
  call(req: LLMRequest, opts: CallOpts): AsyncIterable<LLMEvent>
  countTokens(req: LLMRequest): Promise<TokenCount>
}
```

v0.1 (전체): GLMAnthropicProvider (`api.z.ai/api/anthropic`), GLMOpenAIProvider (`api.z.ai/api/coding`). 추가 provider 계획 없음.

---

## 11. Storage (§7)

### 11.1 디렉토리 레이아웃

```
~/.glm/                              # 글로벌
├── config.json / settings.json / settings.local.json
├── credentials.json                 # 0600, multi-profile
├── AGENTS.md / memory.md
├── memory/ skills/ plugins/ commands/ credentials/
├── daemon.sock / daemon.log / daemon.pid
├── quota.db
├── cache/web/ cache/llm/ cache/skills/
└── sessions/<session-id>/
    ├── meta.json
    ├── session.db
    ├── checkpoints/<NNNN>.json
    ├── snapshots/<sha>
    ├── workers/<wid>.log
    ├── compact.log
    └── journal.md

# 프로젝트
.glm/
├── settings.json / settings.local.json
├── memory/ skills/ commands/ plugins/
└── notepad.md
AGENTS.md
```

### 11.2 SQLite 스키마 — session.db

핵심 테이블: `session`, `messages` (트리), `message_parts`, `tool_calls`, `workers`, `llm_cache`, `compactions`, `checkpoints`, `snapshots`, `file_versions`, `events`, `meta`.

WAL 모드, foreign keys 활성, `better-sqlite3` (sync, native, prebuilt).

(전체 DDL 은 별도 implementation plan 에서 정의)

### 11.3 글로벌 quota.db

테이블: `quota_usage` (시계열), `quota_pools` (tier별 한도).

### 11.4 Snapshot 시스템

opencode-style content-addressable:
- 매 step 시작 직전 file_versions.before_sha
- Edit/Write 직후 after_sha + blob 저장
- 같은 sha dedupe
- `glm diff` / `/diff` / `/revert <step>` 지원
- GC: `ref_count = 0` blob 청소

### 11.5 Journal

`journal.md` — long-horizon 사람 가독:
- 매 phase 전환, distillation, 큰 결정 append
- 매 시간 진행 보고
- 사용자가 8h 후 와서 슬슬 읽으면 무슨 일 있었는지 파악

### 11.6 Import / Export

- `glm export <id> --format json|md|html`
- `glm import <file.json>` → 새 session-id
- `glm share <id> --redact` (v0.2)

### 11.7 마이그레이션

`~/.glm/migrations/NNN_*.sql` idempotent + fail-safe + 자동 백업 (`db_pre_migration_v<N>.bak`).

### 11.8 크기 관리

- session.db > 100MB → VACUUM 권장
- > 500MB → archive 권장
- 6개월 idle → 자동 archive (tar.zst)
- web/llm cache LRU 50MB / 200MB
- `glm gc` 수동

### 11.9 보안

- credentials 0600, daemon.sock 0600
- session.db 평문 키 저장 금지 (참조만)
- export 자동 redaction (API key / JWT / 옵션 email)

---

## 12. Error Handling & Resilience (§8)

### 12.1 5-카테고리

| 카테고리 | 예시 | 정책 |
|---------|------|------|
| TRANSIENT | 네트워크, 5xx, 동시한도 | 자동 retry (§10.6), 토큰 보호 |
| EXHAUSTED | quota, disk, heap | 사용자 prompt + 대안 |
| INVALID | 401/403, schema, 안전 거부 | 즉시 에러 표시 |
| INFRASTRUCTURE | SQLite 손상, MCP 죽음 | 자가복구 → 실패시 escalate |
| LOGIC | 우리 코드 버그 | 안전 stop + crash report |

### 12.2 사용자 prompt 정책

자동 vs 묻기 매트릭스 — 핵심:
- Transient 1-3회 자동, 4회+ 묻기
- 위험 동작 (rm/force-push/drop) 항상 명시 확인
- Quota 임계 사용자 결정

### 12.3 Doctor

`glm doctor` 종합 헬스체크:
Runtime / Install / API / Bundled MCP / External MCP / LSP / Compat (CC 자산) / Active sessions / Warnings.

`glm doctor --fix` auto-repair 시도.

### 12.4 Safe Mode

`glm --safe`: 모든 plugin/external MCP/hook 비활성, default settings 만, ephemeral 모드. 격리 진단 용도.

### 12.5 Bug Reporting

치명 에러 시 `~/.glm/crash-reports/<ts>.tar.zst` 자동 생성. `glm bug report` 인터랙티브 redact + 미리보기 + 옵션 upload.

자동 제외: API keys, OAuth, file content, memory body.

### 12.6 텔레메트리

기본 OFF. opt-in only (`glm config telemetry enable`). 보내는 것: anonymous user-id, version, error types, models used, daemon uptime. 절대 안 보내는 것: credentials, file/chat/memory content, repo names.

### 12.7 Yolo Mode

**3-Tier 권한**:

```
TIER A — 항상 자동 (yolo 없어도)
  Read, Glob, Grep, TodoWrite, Skill, LSP, MCP read-only

TIER B — settings.allow 매치 시 자동, 아니면 prompt
  yolo OFF: prompt
  yolo ON:  workspace 내 자동, 외부 prompt
  Edit/Write/MultiEdit, Bash (workspace cwd), MCP write tools

TIER C — 절대 yolo 불가 (Hard whitelist 필요)
  git push --force, push to main/master, rm -rf, drop database,
  npm publish, workspace 밖 write, settings hard whitelist,
  새 MCP/plugin install, API key 변경, daemon restart
```

**활성화**:
- `glm "..." --yolo` 일회성
- `/yolo` 세션 단위
- `/auto` → 사용자 동의 1회로 yolo ON
- `--detach` → 사용자 동의 1회로 yolo ON

**한도**:
- maxDurationMinutes: 480 (8시간)
- maxSteps: 500
- maxTokensSession: 2,000,000
- maxQuotaPercent: 0.5
- stopOnQuotaWarning: true

**시각**: 모든 패널 빨강 테두리, "🟥 YOLO MODE" 깜빡임 표시.
**스냅샷**: 매 step 자동 git stash, revert 가능.
**Audit**: `~/.glm/sessions/<id>/yolo-audit.log`.
**알림**: macOS / Telegram / Slack / Discord / Email (push).
**`glm yolo doctor`**: 환경 적합성 체크 (sandbox / clean tree / 알림 채널 설정).

---

## 13. Testing & Quality (§9)

### 13.1 피라미드

- Unit ~70% (vitest)
- Integration ~25% (daemon RPC, LSP, MCP, real-ish)
- E2E ~5% (golden replay, nightly only)

### 13.2 Quality Gates (PR 차단)

- Lint / TSC: ANY error
- Unit coverage 회귀 -3% 이상
- Integration / Compat: 1 fail
- Perf: heap/RSS/FD 임계 초과
- Snapshot: 미경유 변경

### 13.3 Nightly (~30분)

- 8h mock long-horizon (시간 가속)
- 10000 mock LLM turn 후 heap delta < 50MB
- FD count 안정
- Perf p99 +20% 이상 회귀 fail

### 13.4 Weekly (진짜 LLM)

- ~$5/주 budget, 100-200 fixture tasks
- LLM behavior 회귀 detection

### 13.5 Hashline 벤치 (oh-my-pi 패턴)

- 12 reference tasks × 3 모델 × 5 separator × 24 runs
- 목표: edit ✓ ≥ 90%, patch fail ≤ 8%, 토큰 ±10%

### 13.6 호환성 회귀

`test/compat/fixtures/.claude/*` — CC 자산이 그대로 로드되는지 매 PR 검증.

### 13.7 Dogfooding

- 알파부터 maintainer 가 매일 8시간 daily-driver
- 발견 버그 → 즉시 fixture / 테스트로 박제
- "내가 쓰기 싫은 도구는 출시 못 함"

### 13.8 GA 게이트 (0.1.0)

- 250+ unit / 80+ integration / 10+ e2e
- 8h long-horizon nightly 7일 연속 무사고
- hashline edit ✓ ≥ 90% on GLM-5.1
- Daemon crash rate < 0.01/h
- 문서 완비

---

## 14. Roadmap / Distribution / Naming / License (§10)

### 14.1 v0.1 MVP (~12주, 빌트인 워크플로 + OMC 생태 features 포함)

§9.13-9.21 까지 모든 v0.1 범위. 1 maintainer 풀타임 가정. 12주 마일스톤 (기존 8주에서 OMC ecosystem features 흡수로 +4주):

| 주 | 마일스톤 |
|----|--------|
| 1 | Daemon + socket + Ink TUI 골격 + 첫 chat 응답 |
| 2 | Tool 시스템 (Read/Edit/Bash/Grep/Glob/Task) + hashline edit |
| 3 | **§9.18 Internal URL schemes** (`local://`, `memory://`, `mcp://`, `issue://`, `pr://`, `skill://`, `rule://`, `agent://`, `artifact://`, `conflict://`) + dispatcher |
| 4 | MCP host + Bundled GLM MCPs + Skill/Plugin/Hook 로더 |
| 5 | **§9.15 Hook & Event System** (11+20 events, plugin SDK) + Claude Code 호환 |
| 6 | Orchestrator + Scheduler + Sub-agent fan-out + Rate-limit queue |
| 7 | Memory engine + LSP + **§9.16 Memory trio** (notepad / project-memory / shared-memory) |
| 8 | **20 Agent role 시스템 + preamble protocol + §9.17 Keyword detector + Delegation categories** |
| 9 | **빌트인 워크플로 8개**: plan, ralplan, trace, debug, verify, critic, autopilot, team |
| 10 | **빌트인 워크플로 6개**: ralph, ultrawork, ultraqa, deep-dive, self-improve, skillify |
| 11 | **§9.19 Notification (notify-only)** + **§9.20 Resilience hooks** (preemptive compaction / todo preserver / session recovery / continuation enforcement / trace timeline / verification tier-selector) + **§9.21 Commit + Recipe tools** |
| 12 | Long-horizon + checkpoint/resume + Yolo + Doctor + 호환성 회귀 + Polish + 0.1 release |

**v0.1 빌트인 완성 목표**:
- 14개 워크플로 (Tier-4: 10 + Tier-3: 4)
- 20개 agent role (boundary + preamble)
- 11+20 hook events
- 4 메모리 레이어 (notepad / project-mem / shared-mem / AGENTS.md ## Memories)
- 10+ internal URL schemes
- Built-in tools: hashline edit, LSP, commit, recipe
- Notification (단방향), all resilience hooks
- CC 자산 100% 호환 + OMC/OmO/OMX 플러그인 호환 read

**v0.2 yield** (§9.22 명시): Eval (Python+JS REPL), TTSR, ACP/RPC modes, Hyperplan, OpenClaw 양방향, Hindsight 자동 inject, Wiki, Visual subagent panes, Universal config wizard, Native Rust 가속.

### 14.2 v0.2 (~+8주)

- Multi-account profile
- Ast-edit
- Persistent memory MCP 통합
- VS Code 확장
- ACP 호환
- Web UI (선택)
- Plugin marketplace
- Team mode
- RAG/embedding 검색

### 14.3 v0.3+

- Multi-machine 협업
- Sandboxed Bash
- Agent SDK
- Voice input
- Native vision/video input
- 다른 LLM (Claude/GPT/Gemini) 1급 지원 (선택)
- Mobile companion

### 14.4 Distribution

- **Primary**: npm `@glm/code` (fallback `glm-code`)
- **보조**: Homebrew, AUR, GitHub Releases binaries, Docker, devcontainer 템플릿
- 의존성 최소화: Node 22+, Bun 옵션
- 크기 목표: 압축 < 15MB

### 14.5 Naming

| 항목 | 이름 |
|------|------|
| 프로젝트 | **glm code** |
| CLI binary | **`glm`** |
| npm | **`@glm/code`** |
| Config dir | **`~/.glm/`** |
| Workspace dir | **`.glm/`** |
| Instructions | **`AGENTS.md`** |
| Memory section | `## Memories` |
| Plugin prefix | `glm:` |
| MCP prefix | `glm-` |
| API key env | `GLM_API_KEY` (+ `ANTHROPIC_AUTH_TOKEN` 호환) |

### 14.6 License

**MIT** (계획).

3rd-party 출처 NOTICE:
- opencode (컴팩션 템플릿, instruction cascade, LSP host 구조)
- qwen-code (`@filepath` import, memory section header)
- **oh-my-pi** — hashline edit 알고리즘 + recovery 휴리스틱 / **Internal URL Schemes (§9.18)** / Commit tool 패턴 (§9.21) / Recipe tool / Eval tool 설계 / Hindsight memory 패턴 (§9.16) / Universal config discovery / Extension/Hook/Plugin 통합 API 패턴
- cclsp (position resolution 컨셉)
- **oh-my-claudecode (OMC)** — 빌트인 워크플로 카탈로그 (§9.13), agent role 시스템 (§9.14), **11-event Hook lifecycle (§9.15)**, **Memory trio: notepad/project-memory/shared-memory (§9.16)**, **Keyword detector + skill injector (§9.17)**, Delegation enforcer + categories, Trace timeline + summary, Verification tier-selector, Persistent-mode "boulder never stops". 20개 agent role boundary 패턴 + 14개 워크플로 정의 영감
- **oh-my-codex (OMX)** — **20+ event hook plugin SDK (§9.15)**, Deep-interview 가중치 ambiguity scoring + threshold gating, Ralplan-DR (Decision Record + pre-mortem), `omx state` CLI-first JSON state surface, **structured `omx question` (§9.19)**, Pipeline stages 모델, Sparkshell/Explore Rust 패턴 (v0.3+ 참고)
- **oh-my-openagent (OmO)** — **OpenClaw bidirectional bridge (§9.19)** (Discord/Telegram inbound reply daemon, glm 의 unique 차별점), **Hyperplan adversarial planning (v0.2)**, IntentGate keyword detector, Todo-continuation-enforcer (§9.20), Per-session MCP keying, 5-tier hook composition, **Preemptive compaction + todo preserver (§9.20)**, Session recovery hooks (§9.20)
- Claude Code (설정 파일 형식 호환 — 코드 0)

### 14.7 v0.1 성공 정의

3가지 동시 성립:
1. Maintainer 본인이 매일 8시간 메인 도구로 사용
2. GLM Coding Plan 사용자 50명+ 자발적 GitHub star + 활동
3. 외부 기여자 첫 5개 PR 머지

릴리즈 후 6주 안에 도달하면 v0.2 본격 시작.

---

## 15. 경쟁 도구 비교 (마케팅)

| 기능 | glm code | Claude Code | opencode | qwen-code |
|------|---------|-------------|----------|----------|
| GLM Coding Plan 직접 지원 | ✅ native | ⚠ base URL | ⚠ base URL | ❌ Qwen |
| 항상-켜진 daemon | ✅ | ❌ | ⚠ session | ❌ |
| 8h 자율 + checkpoint | ✅ | ❌ | ⚠ 기록만 | ❌ |
| Sub-agent fan-out | ✅ rate-limit-aware | ✅ Task | ⚠ | ⚠ |
| Pipeline orchestration | ✅ 자동 승격 | ❌ | ❌ | ❌ |
| **빌트인 워크플로 (autopilot/ralph/team/plan/trace ...)** | ✅ **14 built-in v0.1** | ❌ (OMC 플러그인 필요) | ⚠ 일부 | ⚠ 일부 |
| **빌트인 agent role 카탈로그 (20개)** | ✅ **빌트인 + boundary 강제** | ❌ (OMC 플러그인) | ⚠ ad-hoc | ⚠ ad-hoc |
| **Hook lifecycle (11+20 events)** | ✅ plugin SDK | ⚠ 일부 (CC hooks) | ⚠ | ⚠ |
| **Memory trio (notepad/project/shared) + AGENTS.md cascade** | ✅ | ❌ (auto-memory 만) | ⚠ session | ⚠ QWEN.md |
| **Internal URL schemes (`local://`, `memory://`, `mcp://`, `issue://`, ...)** | ✅ | ❌ | ❌ | ❌ |
| **자연어 keyword auto-activation** | ✅ | ❌ | ❌ | ❌ |
| **Bidirectional notify (Telegram/Discord reply)** | 🔜 v0.2 | ❌ | ⚠ OmO 플러그인 | ❌ |
| **Preemptive compaction + todo preserver** | ✅ | ⚠ | ⚠ | ⚠ |
| **Session recovery (json/context/missing-tool)** | ✅ | ⚠ | ⚠ | ⚠ |
| **Trace timeline (debug agent behavior)** | ✅ | ❌ | ❌ | ❌ |
| **Commit tool (agentic, hunk staging)** | ✅ | ❌ (gh CLI 별도) | ❌ | ❌ |
| **Recipe tool (npm/cargo/just/make 자동)** | ✅ | ❌ | ❌ | ❌ |
| Hashline edit | ✅ oh-my-pi | ❌ exact | ❌ | ❌ |
| Built-in LSP | ✅ | ❌ | ✅ | ⚠ |
| Bundled GLM MCPs | ✅ 자동 | ❌ | ❌ | ❌ |
| Claude Code 호환 read | ✅ 100% | — | ⚠ 일부 | ❌ |
| OMC 플러그인 호환 read | ✅ (충돌시 빌트인 우선) | ✅ (요 설치) | ⚠ | ❌ |
| Yolo 3-tier 안전 | ✅ | ⚠ skip-perms | ⚠ | ⚠ |
| Quota tracker | ✅ 3 풀 | ❌ | ❌ | ❌ |
| Long-horizon journal | ✅ | ❌ | ⚠ | ❌ |

---

## 16. 열린 질문 (v0.1 후)

- 단일 vs 멀티-바이너리 분리
- Web UI 우선순위
- 공유 세션 페이지 호스팅
- Plugin marketplace 모델
- Enterprise SSO / 감사 / 정책

---

## 17. Repository Layout (계획)

```
glm-code/
├── packages/
│   ├── core/               # daemon, scheduler, memory, storage
│   ├── tui/                # Ink components, chat REPL, dashboard
│   ├── cli/                # entry binary `glm`
│   ├── lsp/                # built-in LSP host
│   ├── mcp/                # MCP host
│   ├── tools/              # built-in tools (Read/Edit/Bash/...)
│   │   └── hashline/       # hashline edit
│   ├── memory/             # AGENTS.md cascade, compaction
│   │   ├── notepad/        # §9.16 — .glm/notepad.md (compaction-survivor)
│   │   ├── project/        # .glm/project-memory.json (notes/directives)
│   │   ├── shared/         # .glm/shared/<key>.json (cross-agent KV)
│   │   └── hindsight/      # v0.2 자동 inject
│   ├── hooks/              # §9.15 — 11+20 event lifecycle
│   │   ├── events/         # 이벤트 타입 정의 + dispatcher
│   │   ├── plugin-sdk/     # defineHook() API
│   │   ├── keyword-detector/   # §9.17 자연어 활성
│   │   ├── delegation-enforcer/  # §9.17 categories → temp/thinking
│   │   ├── preemptive-compactor/  # §9.20
│   │   ├── session-recovery/  # §9.20
│   │   ├── continuation-enforcer/ # §9.20
│   │   ├── todo-preserver/    # §9.20 compaction-safe TODO
│   │   ├── trace-timeline/    # §9.20
│   │   └── verification-tier-selector/  # §9.20
│   ├── internal-urls/      # §9.18 — `local://` / `memory://` / `mcp://` / `issue://` / ...
│   │   ├── router.ts       # protocol dispatcher
│   │   └── handlers/       # 각 protocol 별 handler
│   ├── notifications/      # §9.19 — notify-only v0.1, bidirectional v0.2
│   │   ├── channels/       # macos / discord / slack / telegram / email
│   │   └── reply-daemon/   # v0.2 inbound reply
│   ├── tools/builtin/      # commit, recipe, eval(v0.2) — §9.21
│   ├── provider/           # LLM Router (Anthropic/OpenAI)
│   ├── workflows/          # 빌트인 워크플로 (§9.13)
│   │   ├── autopilot/      # end-to-end 자율
│   │   ├── ralph/          # persistence loop
│   │   ├── ultrawork/      # 병렬 실행 엔진
│   │   ├── team/           # peer agents 협업
│   │   ├── plan/           # 전략 plan + interview/consensus/review
│   │   ├── ralplan/        # plan --consensus alias
│   │   ├── deep-dive/      # trace + deep-interview
│   │   ├── trace/          # 증거-기반 인과 추적
│   │   ├── ultraqa/        # QA 사이클 (test → verify → fix)
│   │   ├── self-improve/   # tournament 진화 개선
│   │   ├── debug/ verify/ critic/ skillify/ remember/ visual-verdict/ ai-slop-cleaner/
│   │   └── external-context/  # tier-3 보조 빌트인
│   ├── agents/             # 빌트인 agent role 카탈로그 (§9.14)
│   │   ├── orchestrator.md
│   │   ├── planner.md  architect.md  executor.md  verifier.md  critic.md
│   │   ├── code-reviewer.md  code-simplifier.md  security-reviewer.md
│   │   ├── test-engineer.md  qa-tester.md  debugger.md  tracer.md
│   │   ├── explore.md  analyst.md  scientist.md  designer.md
│   │   ├── document-specialist.md  writer.md  git-master.md
│   │   └── _preamble.ts    # wrapWithPreamble() (OMC 패턴 차용)
│   └── shared/             # 공통 타입, 유틸
├── plugins/                # 내장 보너스 플러그인 (선택, 빌트인 X)
├── docs/
│   ├── specs/              # 이 디자인 문서들
│   ├── reference/          # 사용자 reference
│   └── guides/             # 튜토리얼
├── test/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   ├── compat/             # CC + OMC 호환 fixture
│   └── perf/
├── scripts/
└── package.json
```

---

## 18. Sources & References

### 소스 코드 참조 (로컬 clone)

**Coding agent cores**:
- `repos/opencode/packages/opencode/src/session/{overflow,summary,system,instruction,compaction}.ts`
- `repos/opencode/packages/opencode/src/lsp/{client,server,language,launch,lsp,diagnostic}.ts`
- `repos/qwen-code/packages/core/src/{tools/memory-config,utils/memoryDiscovery,core/geminiChat}.ts`
- `repos/oh-my-pi/packages/coding-agent/src/hashline/{hash,apply,parser,prefixes,recovery}.ts`
- `repos/oh-my-pi/packages/coding-agent/src/internal-urls/router.ts` — §9.18 패턴
- `repos/oh-my-pi/packages/coding-agent/src/{commit,recipe,eval,hindsight}/`
- `repos/oh-my-pi/packages/coding-agent/src/extensibility/extensions/types.ts`
- `repos/oh-my-pi/scripts/bench-edit-hashline-sep.ts`

**Plugin ecosystem (§9.13-9.21)**:
- `repos/oh-my-claudecode/hooks/hooks.json` + `scripts/*.mjs` — §9.15 11-event lifecycle
- `repos/oh-my-claudecode/src/tools/{notepad,memory,state,shared-memory,trace,wiki,lsp,ast,python-repl,session-history}-tools.ts` — §9.16 memory trio + §9.20 trace
- `repos/oh-my-claudecode/src/features/{magic-keywords,delegation-{enforcer,categories},model-routing,boulder-state,context-injector,task-decomposer,rate-limit-wait,verification}/` — §9.17 keywords + §9.20 resilience
- `repos/oh-my-claudecode/skills/*` (38 skills) — §9.13 워크플로 카탈로그
- `repos/oh-my-claudecode/agents/*.md` (19 roles) — §9.14
- `repos/oh-my-codex/src/hooks/extensibility/types.ts` — §9.15 hook plugin SDK + 20-event 표면
- `repos/oh-my-codex/skills/{deep-interview,ralplan}/SKILL.md` — §9.17 ambiguity scoring
- `repos/oh-my-codex/src/state/{mode-state-context,operations,paths}.ts` — resume-safe state pattern
- `repos/oh-my-codex/crates/{omx-runtime-core,omx-sparkshell,omx-explore,omx-mux}` — v0.3+ Rust 가속 참고
- `repos/oh-my-openagent/src/openclaw/` (18 files) — §9.19 OpenClaw bidirectional bridge
- `repos/oh-my-openagent/.opencode/skills/hyperplan/SKILL.md` — §9.22 v0.2 adversarial planning
- `repos/oh-my-openagent/src/hooks/{keyword-detector,preemptive-compaction*,session-recovery,todo-continuation-enforcer,stop-continuation-guard}/` — §9.17 + §9.20
- `repos/oh-my-openagent/src/features/{team-mode,tmux-subagent,skill-mcp-manager,builtin-commands}/`

### 외부 문서
- [GLM-5.1 — Z.AI Developer Docs](https://docs.z.ai/guides/llm/glm-5.1)
- [GLM Coding Plan](https://z.ai/subscribe)
- [Vision MCP Server](https://docs.z.ai/devpack/mcp/vision-mcp-server)
- [Web Search MCP](https://docs.z.ai/devpack/mcp/search-mcp-server)
- [Web Reader MCP](https://docs.z.ai/devpack/mcp/reader-mcp-server)
- [Zread MCP](https://docs.z.ai/devpack/mcp/zread-mcp-server)
- [Claude Code Compaction Strategy — ClaudeLog](https://claudelog.com/faqs/what-is-claude-code-auto-compact/)
- [opencode Context Management — DeepWiki](https://deepwiki.com/sst/opencode/2.4-context-management-and-compaction)
- [cclsp on GitHub](https://github.com/ktnyt/cclsp)
- [Model Context Protocol (Anthropic)](https://modelcontextprotocol.io)

---

*End of design specification.*
