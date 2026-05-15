# GLM Code — 출시 전 전체 누락 수정 계획안

**Date**: 2026-05-14
**Base commit**: `306997b` (HUD fix + rate limit + runtime gaps)
**Design spec**: `docs/superpowers/specs/2026-05-14-glm-code-design.md`
**Codebase**: `repos/qwen-code/`

## HUD / Dashboard 위치

**현재**: Pi-style HUD는 `Footer.tsx`에 렌더링됨 → Composer.tsx의 input box 바로 아래.
사용자가 타이핑할 때 항상 보이는 위치. `glm` 실행 → 하단에:
```
GLM > ⬢ GLM-5.1 · ◉ study > ⑂ main *3 ?2 > ◫ 44.9%/200K
```

---

## Phase 1: 오케스트레이터 실질 구현 (§7)

### 1.1 오케스트레이터 LLM 호출 (CRITICAL)
- **Spec**: §7.1 — "별도 LLM 호출. 항상 GLM-5.1"
- **현재**: `classifyTask()`는 regex 휴리스틱. LLM 호출 없음.
- **작업**:
  - `packages/core/src/orchestrator/orchestrator-llm.ts` 신규
  - `askOrchestrator(context: OrchestratorInput): Promise<OrchestratorDecision>`
  - 입력: task description, 최근 10 step 요약, context 통계, 활성 worker, 모델 quota
  - 출력: `{decision: "INLINE|DELEGATE|FAN_OUT|PIPELINE_PROMOTE|COMPACT|RECYCLE", next_action, reasoning, estimated_tokens}`
  - 시스템 프롬프트: JSON schema 강제, ~2K 토큰
  - 호출: GLM-5.1, temperature=0.3, thinking 활성
  - orchestrator.ts의 `orchestrate()`에서 classifyTask() 대신 askOrchestrator() 호출
  - 폴백: LLM 실패시 기존 regex classifyTask() 사용
- **참조파일**: `packages/core/src/orchestrator/orchestrator.ts`, `packages/core/src/core/client.ts`

### 1.2 Pipeline phase 진행 (CRITICAL)
- **Spec**: §7.3 — 6 phase 자동 전환, acceptance gate, 최대 3회 retry
- **현재**: pipeline 생성되지만 advancePipeline()이 호출 안 됨
- **작업**:
  - `packages/core/src/core/client.ts`에서 sendMessageStream 루프 끝에 pipeline 진행 체크 추가
  - 각 LLM 턴 완료 후 `orchestrator.advancePipeline()` 호출
  - Acceptance criteria 평가 → 통과시 `orchestrator.completePipelinePhase()`
  - 실패시 `orchestrator.failPipelinePhase()` (최대 3회)
  - pipeline 완료시 결과를 parent context에 요약으로 삽입
- **참조파일**: `packages/core/src/orchestrator/pipeline.ts`, `packages/core/src/core/client.ts`

### 1.3 Pipeline 모델 전환 (CRITICAL)
- **Spec**: §7.3 — phase별 모델 (plan→5.1, scaffold→Turbo, execute→5.1, verify→4.5-Air fan-out, test→5.1, review→5.1)
- **현재**: 모든 phase가 같은 세션 모델 사용
- **작업**:
  - `packages/core/src/orchestrator/pipeline.ts`에 `PHASE_MODEL_MAP` 추가
  - `packages/core/src/orchestrator/orchestrator.ts`에서 현재 phase에 따라 model override 반환
  - client.ts에서 orchestratorResult.isModelFallback 대신 orchestratorResult.modelOverride 사용
  - verify phase에서 fan-out 지시사항 생성 (GLM-4.5-Air 병렬로 lint+typecheck)

### 1.4 Context-aware delegation heuristics (§6.2)
- **Spec**: Read>1000줄 → delegate, Grep>50 matches → delegate, parent context >60% → delegate, exploration → MUST delegate
- **현재**: delegation-enforcer.ts가 regex만 검사
- **작업**:
  - `packages/core/src/orchestrator/delegation-heuristics.ts` 신규
  - `evaluateDelegationNeed(toolResult, contextPercent): DelegationSuggestion`
  - Read 결과 1000줄 초과 → delegate 지시
  - Grep 결과 50 match 초과 → delegate 지시
  - parent context >60% → auto-delegate
  - "find", "search", "explore" 키워드 + 탐색적 작업 → MUST delegate
  - client.ts에서 각 tool 결과 후 evaluateDelegationNeed() 호출

### 1.5 Sub-agent contract system prompt (§6.3)
- **Spec**: 4K 토큰 출력 제한, Markdown 형식 (Summary/Key Findings/Artifacts/Open Questions), depth-2 제한
- **현재**: 일반 지시사항만, 출력 제한 없음
- **작업**:
  - `packages/core/src/orchestrator/subagent-contract.ts` 신규
  - `buildContractPrompt(task, depth, contextFiles, maxOutputTokens): string`
  - 구조화된 Markdown 출력 형식 강제
  - depth-2 초과시 spawn 금지 지시
  - fanout.ts에서 빈 subtask 대신 실제 task description 생성
  - subagent-manager.ts에 maxOutputTokens=4096 전달

### 1.6 Worker state machine (§7.6)
- **Spec**: QUEUED → SPAWNING → INITIALIZING → RUNNING → COMPLETING → COMPLETED, FAILED → RETRYING (≤3)
- **현재**: 없음
- **작업**:
  - `packages/core/src/orchestrator/worker-state.ts` 신규
  - `WorkerState` enum + `WorkerStateMachine` class
  - transition 검증, FAILED시 자동 retry (최대 3회)
  - orchestrator에 worker 레지스트리 추가
  - HUD에 활성 worker 수 표시

---

## Phase 2: Hashline Edit 도구 (§9.14)

### 2.1 Hashline edit 구현
- **Spec**: §9.18 — oh-my-pi 패턴의 LINE+HASH|TEXT anchor 기반 edit
- **현재**: old_string/new_string 치환만 있음
- **작업**:
  - `packages/core/src/tools/hashline-edit.ts` 신규
  - `parseAnchors(content): Map<number, {hash: string, text: string}>`
  - `applyAnchorEdit(filePath, anchorOps): EditResult`
  - xxHash32 또는 FNV-1a hash 계산 (빠른 구현)
  - Anchor 형식: `LINE+HASH|TEXT` (예: `42xa|const foo = bar`)
  - Edit 옵션: `replace(anchor, newText)`, `insertAfter(anchor, lines)`, `delete(anchorRange)`
  - 기존 edit.ts에 hashline 모드 추가: anchor 감지시 hashline-edit 사용
  - hash 불일치시 에러 (파일이 수정됨)
- **참조**: oh-my-pi edit 패턴, `packages/core/src/tools/edit.ts`

---

## Phase 3: Memory 시스템 (§9.16)

### 3.1 Memory.retain() 도구
- **작업**:
  - `packages/core/src/tools/memory-tools.ts` 신규
  - `MemoryRetainTool` — LLM 호출 가능 도구
  - `retain(text: string, type: "user"|"feedback"|"project"|"reference", scope: "session"|"project"|"global")`
  - 저장 위치: `~/.glm/memory/bank/<topic>.md` (topic 자동 추출)
  - 4KB per-file cap, 5MB total cap, LRU eviction
  - frontmatter: `type`, `scope`, `created`, `expires?`

### 3.2 Memory.recall() 도구
- **작업**:
  - `MemoryRecallTool` — semantic search over memory banks
  - `recall(query: string, limit?: number): MemoryEntry[]`
  - 검색: grep 기반 (SQLite FTS5는 v0.2 검토)
  - 점수: recency + keyword match + scope relevance

### 3.3 Memory.reflect() 도구
- **작업**:
  - `MemoryReflectTool` — 현재 turn 발견 자동 추출
  - `reflect(): ReflectResult` — 후보 목록 반환, LLM이 선택해서 retain
  - 발견 패턴: 에러 해결, 새 패턴 학습, 아키텍처 결정, API 사용법

### 3.4 Notepad / Project-Memory / Shared-Memory 레이어
- **작업**:
  - `packages/core/src/tools/notepad-tool.ts` — notepad 읽기/쓰기 도구
  - `packages/core/src/tools/project-memory-tool.ts` — 프로젝트 메모리 관리
  - `packages/core/src/tools/shared-memory-tool.ts` — 크로스 에이전트 메모리 공유
  - 각 도구를 tool registry에 등록

---

## Phase 4: Resilience Hooks (§9.20)

### 4.1 Preemptive compaction hook
- **작업**:
  - `packages/core/src/hooks/resilience/preemptive-compaction.ts`
  - PreCompact 훅에서 context >50%면 자동 compaction 트리거
  - compaction 후 Memories 섹션 보존

### 4.2 Todo preserver hook
- **작업**:
  - `packages/core/src/hooks/resilience/todo-preserver.ts`
  - PreCompact 훅에서 현재 todo 목록을 시스템 프롬프트에 보존
  - compaction 후 todo 복원

### 4.3 Session recovery hook
- **작업**:
  - `packages/core/src/hooks/resilience/session-recovery.ts`
  - SessionStart 훅에서 latest checkpoint 확인 → 자동 resume 제안
  - 누락된 tool 결과 감지 → 재실행 제안

### 4.4 Continuation enforcement hook
- **작업**:
  - `packages/core/src/hooks/resilience/continuation-enforcement.ts`
  - Stop 훅에서 미완료 todo 확인 → "아직 N개 태스크 남음, 계속하시겠습니까?" 프롬프트

### 4.5 Trace timeline hook
- **작업**:
  - `packages/core/src/hooks/resilience/trace-timeline.ts`
  - 모든 훅 이벤트를 `~/.glm/sessions/{id}/trace.jsonl`에 기록
  - PostToolUse → tool name, duration, result summary
  - UserPromptSubmit → prompt hash, classification

### 4.6 Verification tier-selector hook
- **작업**:
  - `packages/core/src/hooks/resilience/verification-tier.ts`
  - PostToolUse (Edit/Write) 후 파일 크기/복잡도 평가
  - small → typecheck only, medium → typecheck + lint, large → full test suite
  - PostEditDiagnostics와 통합

---

## Phase 5: Commit + Recipe 도구 (§9.21)

### 5.1 Agentic Commit 도구
- **작업**:
  - `packages/core/src/tools/commit-tool.ts` 신규
  - `CommitTool` — LLM 호출 가능 도구
  - `commit(options: { message?: string, scope?: string, addAll?: boolean, splitByScope?: boolean })`
  - `git diff --stat` → 변경 파일 분석 → conventional commit 메시지 자동 생성
  - `splitByScope: true` → 파일 그룹별 개별 커밋
  - `git add -p` hunk 단위 staging
  - GLM Code attribution footer: `Co-authored-by: GLM Code <glm@z.ai>`

### 5.2 Recipe 도구
- **작업**:
  - `packages/core/src/tools/recipe-tool.ts` 신규
  - `RecipeTool` — 프로젝트 task runner 자동 감지
  - `detectRunner(): "npm"|"pnpm"|"yarn"|"cargo"|"make"|"just"|"go"|"bazel"|null`
  - 감지: package.json → npm/pnpm/yarn, Cargo.toml → cargo, Makefile → make, justfile → just
  - `run(target: string, args?: string[])` — 올바른 runner로 실행
  - `listTargets(): string[]` — 사용 가능한 타겟 나열

---

## Phase 6: Rate Limit / Quota 완성 (§10)

### 6.1 Quota tracker (§10.4)
- **작업**:
  - `packages/core/src/orchestrator/quota-tracker.ts` 신규
  - `~/.glm/quota.db` SQLite
  - 테이블: `quota_usage (timestamp, pool, model, tokens_in, tokens_out, request_count)`
  - 테이블: `quota_pools (pool, daily_limit, used, reset_at)`
  - 3 pools: Coding, Web, Vision
  - 임계값: 80% → 경고, 95% → fan-out 중단, 100% → 사용자 결정 프롬프트
  - 매 LLM 호출 후 usage 기록
  - `getQuotaStatus(pool): QuotaInfo` → HUD에 표시

### 6.2 429 타입 구분 (§10.2)
- **작업**:
  - `packages/core/src/orchestrator/rate-limiter.ts` 신규
  - 429 응답 헤더 분석: `retry-after`, `x-ratelimit-remaining`, `x-ratelimit-reset`
  - concurrent 429 → scheduler queue + 무한 retry
  - daily quota 429 → 즉시 중지 + 사용자 프롬프트 ("일일 quota 소진. 계속하시겠습니까?")
  - client.ts의 retry 로직과 통합

### 6.3 Retry policy table (§10.6)
- **작업**:
  - `packages/core/src/utils/retry-policy.ts` 신규
  - 에러 타입별 정책:
    - Network/5xx: 3회, exponential 1/2/4s
    - 429 concurrent: 무한, scheduler queue
    - 429 quota: 0회, 사용자 프롬프트
    - 400: 0회, 즉시 중지
    - 401/403: 0회, 인증 에러 알림
    - 408: 1회, partial response 보존
    - 503: 3회, exponential 5/15/45s
    - Safety refusal: 0회, 사용자 알림
  - 기존 retry.ts를 이 정책 테이블 기반으로 리팩터링

### 6.4 Streaming partial preservation (§10.7)
- **작업**:
  - `packages/core/src/core/streaming-preservation.ts` 신규
  - chunk boundary에서 cancel → 수신된 토큰 히스토리에 커밋
  - 408 타임아웃 → partial response를 assistant 메시지로 보존
  - V8 memory 압력 감지 → natural boundary에서 stream 종료

---

## Phase 7: Context 최적화 (§8)

### 7.1 Lazy tool schema (§8.1 Tactic 3)
- **작업**:
  - `packages/core/src/tools/tool-search.ts` 신규
  - `ToolSearchTool` — LLM이 tool 검색/조회 가능
  - 시스템 프롬프트에 ~10개 코어 도구만 등록 (Read, Edit, Write, Bash, Glob, Grep, Task, WebSearch, Skill, Memory)
  - 나머지 도구는 이름+요약만 노출, 호출시 lazy 로드
  - 목표: 시스템 프롬프트 ~5K 토큰

### 7.2 Periodic distillation (§8.1 Tactic 6)
- **작업**:
  - `packages/core/src/memory/distillation.ts` 신규
  - 60분마다 자동 트리거 (setInterval in session loop)
  - 최근 turn의 발견을 AGENTS.md `## Memories`에 자동 추가
  - LLM 호출: "지금까지 무엇을 배웠나요? 핵심 발견 3-5개를 요약하세요"
  - 결과를 memory bank에 append (200줄/25KB cap 준수)

### 7.3 Prompt caching 6-layer (§8.1 Tactic 1)
- **작업**:
  - `packages/core/src/memory/context-assembler.ts` 수정
  - 6-block 구조: system → skill catalog → AGENTS.md → compacted summary → history → user turn
  - 각 block에 `cache_control: { type: "ephemeral" }` 개별 적용
  - cache hit rate 측정 로직 추가 (헤더에서 cache read/write token 카운트)

### 7.4 AGENTS.md cascade 통합 resolver (§8.1 Tactic 4)
- **작업**:
  - `packages/core/src/memory/instructions-resolver.ts` 신규
  - `resolveInstructions(projectDir, filePath?): string[]`
  - 글로벌: `~/.glm/AGENTS.md` → `~/.claude/CLAUDE.md` (first-match)
  - 프로젝트: `findUp` from filePath → `.glm/AGENTS.md` → `.claude/CLAUDE.md` (first-match)
  - 기존 rulesDiscovery.ts와 통합

---

## Phase 8: Slash Commands 보완 (§5)

### 8.1 누락 명령어 추가
- **작업**:
  - `/budget tokens <N>` — 컨텍스트 예산 설정
  - `/route <model>` — 수동 모델 라우팅
  - `/pause` — 세션 일시정지 (checkpoint 저장)
  - `/resume` — 세션 재개 (checkpoint에서 복원)
  - `/auto` — LONG_HORIZON 수동 승격
  - `/mcp reload` — MCP 서버 핫 리로드
  - `/plugin install/uninstall/update/enable/disable` — 플러그인 관리
  - `/visual-verdict` — 스크린샷 비교 검증
  - `/ai-slop-cleaner` — AI 슬롭 정리
  - `/external-context` — 외부 문서 검색
  - `/ccg` — Claude-Codex-Gemini 삼중 모델 오케스트레이션
- **참조파일**: `packages/cli/src/ui/commands/workflowCommands.ts`, `packages/cli/src/services/BuiltinCommandLoader.ts`

### 8.2 /mcp reload + settings watch
- **작업**:
  - `packages/cli/src/ui/commands/mcpReloadCommand.ts` 신규
  - 설정 파일 watch: `chokidar.watch(~/.glm/settings.json)` → MCP 서버 재시작
  - `/mcp reload` 실행시 즉시 재연결

### 8.3 Plugin CLI alias
- **작업**:
  - `glm plugin` → `glm extensions` alias 추가
  - Commander에 alias 등록
  - `glm plugin install = glm extensions install`

---

## Phase 9: Internal URL Schemes (§9.18)

### 9.1 URL resolver 시스템
- **작업**:
  - `packages/core/src/utils/internal-urls.ts` 신규
  - `resolveInternalUrl(url: string): { type: string, path: string, content?: string }`
  - 프로토콜 핸들러:
    - `local://name.md` → `~/.glm/plans/name.md`
    - `agent://id` → 에이전트 출력 아티팩트
    - `artifact://id` → 아티팩트 콘텐츠
    - `memory://root` → 프로젝트 메모리 요약
    - `mcp://uri` → MCP 리소스
    - `issue://N` → GitHub 이슈
    - `pr://N` → GitHub PR
    - `skill://name` → 스킬 명령어
    - `rule://name` → 규칙 세부 정보
    - `conflict://` → 머지 충돌
  - Read 도구에 URL 감지 → resolveInternalUrl() 호출 추가

---

## Phase 10: 토큰 경제 + 자연어 활성화 보완 (§6.6, §9.17)

### 10.1 Token economics 추적 (§6.6)
- **작업**:
  - `packages/core/src/orchestrator/token-economics.ts` 신규
  - 모델별 누적 토큰 사용 추적
  - cache hit rate 모니터링
  - sub-agent 호출 비용 추적
  - 부모 context 유지율 계산
  - `/stats` 명령어에 토큰 경제 정보 표시

### 10.2 자연어 활성화 보완 (§9.17)
- **작업**:
  - keyword-detector.ts에 코드블록/URL 제외 로직 추가
  - 슬래시 명령어 입력시 키워드 감지 skip
  - 매치시 채팅에 알림: "🔮 'ralph' 감지 → /ralph 활성화"
  - Delegation categories: 키워드 → temperature + thinking + model 매핑
    | Category | Temp | Thinking | Model |
    |---------|------|---------|-------|
    | visual-engineering | 0.7 | medium | GLM-5.1 (designer) |
    | ultrabrain | 0.3 | high | GLM-5.1 (thinking) |
    | artistry | 0.9 | low | GLM-5.1 |
    | quick | 0.4 | off | GLM-4.5-Air |
    | writing | 0.5 | low | GLM-5-Turbo (writer) |
    | precision | 0.0 | high | GLM-5.1 (executor) |
  - settings.json에 `keywords.disabled: true` 설정 지원

---

## Phase 11: MCP 재연결 + Idempotency 보완

### 11.1 MCP 자동 재연결 (§9.9)
- **작업**:
  - `packages/core/src/tools/mcp-reconnect.ts` 신규
  - MCP 서버 연결 끊김 감지
  - exponential backoff 재연결 (1s, 2s, 4s, 최대 3회)
  - 3회 실패 → 비활성화 + 사용자 알림
  - `/mcp reload`로 수동 재연결 가능

### 11.2 Idempotency SQLite 전환 (§7.8)
- **작업**:
  - `packages/core/src/tools/llm-cache.ts` 신규
  - `~/.glm/cache/llm-cache.db` SQLite
  - 테이블: `llm_cache (key TEXT PRIMARY KEY, response TEXT, usage JSON, timestamp INTEGER)`
  - 키: `sha256(role + model + endpoint + system_hash + messages_hash + tools_hash + seed + temperature)`
  - TTL: 세션 지속 시간
  - Resume시 cache hit → LLM 호출 스킵
  - 기존 JSONL idempotency-cache.ts는 tool-call 전용으로 유지

---

## 실행 순서

```
Phase 1 (오케스트레이터) ─── 1.1 → 1.2 → 1.3 → 1.4 → 1.5 → 1.6
Phase 2 (Hashline edit) ─────── 2.1
Phase 3 (Memory tools) ──────── 3.1 → 3.2 → 3.3 → 3.4
Phase 4 (Resilience hooks) ──── 4.1 → 4.2 → 4.3 → 4.4 → 4.5 → 4.6
Phase 5 (Commit + Recipe) ───── 5.1 → 5.2
Phase 6 (Rate limit) ────────── 6.1 → 6.2 → 6.3 → 6.4
Phase 7 (Context 최적화) ────── 7.1 → 7.2 → 7.3 → 7.4
Phase 8 (Slash commands) ────── 8.1 → 8.2 → 8.3
Phase 9 (Internal URLs) ─────── 9.1
Phase 10 (토큰/자연어) ──────── 10.1 → 10.2
Phase 11 (MCP + Cache) ─────── 11.1 → 11.2
```

## 총 태스크 수

| Phase | 태스크 | 신규 파일 |
|-------|--------|----------|
| 1 | 6 | 3 |
| 2 | 1 | 1 |
| 3 | 4 | 2 |
| 4 | 6 | 6 |
| 5 | 2 | 2 |
| 6 | 4 | 2 |
| 7 | 4 | 2 |
| 8 | 3 | 2 |
| 9 | 1 | 1 |
| 10 | 2 | 1 |
| 11 | 2 | 2 |
| **총계** | **35** | **24** |

## 병렬 가능 그룹

- Group A: Phase 1 + Phase 2 (독립)
- Group B: Phase 3 + Phase 4 + Phase 5 (독립)
- Group C: Phase 6 + Phase 7 (독립)
- Group D: Phase 8 + Phase 9 + Phase 10 + Phase 11 (독립)

Group A → B → C → D 순차, 그룹 내는 병렬.
