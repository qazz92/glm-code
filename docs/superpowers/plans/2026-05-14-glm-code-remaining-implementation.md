# GLM Code — 출시 전 잔여 구현 계획서

**기준일**: 2026-05-14
**대상**: `repos/qwen-code/` 포크 위에 기획안 대비 미구현 항목 전수 구현
**목표**: 기획안 P4~P10 + P3추가 + 공통 = 100% 구현

---

## 원칙

1. **qwen-code 아키텍처 위에 구축** — qwen-code의 hooks, subagents, memory, permissions 시스템을 활용
2. **유저가 보는 것 우선** — CLI 출력, 슬래시 커맨드, 모델 선택, 에러 메시지
3. **실제 동작하는 코드** — 스텁/플레이스홀더 없이 프로덕션급
4. **점진적 통합** — 각 모듈이 독립적으로 빌드/테스트 가능

---

## Phase A: Hook & Event 확장 (P5)

> qwen-code에 이미 HookSystem/HookRegistry/HookRunner가 있음.
> 17개 이벤트 추가 + $GLM_* env aliasing만 구현.

### A1. HookEventName 확장
- **파일**: `packages/core/src/hooks/types.ts`
- **작업**: 기존 14개 enum에 17개 이벤트 추가
  - SessionIdle, TurnComplete, RunHeartbeat, RunBlocked
  - WorkerAssigned, WorkerStalled, WorkerRecovered
  - TestStarted, TestFinished, TestFailed
  - RetryNeeded, HandoffNeeded, NeedsInput
  - PreSkillRun, PostSkillRun
  - PermissionGranted, PermissionDenied
- **기존 코드 영향**: enum 확장이므로 기존 switch/if에 영향 없음
- **검증**: `tsc --noEmit` 통과

### A2. $GLM_* 환경변수 aliasing
- **파일**: `packages/core/src/hooks/envInterpolator.ts`
- **작업**: interpolateEnvVars()에 $GLM_*, $ZAI_* → 기존 $CLAUDE_* 값 매핑 추가
  - $GLM_HOME → config dir path
  - $GLM_MODEL → current model
  - $ZAI_API_KEY → API key
- **검증**: 단위 테스트에서 $GLM_* 변수가 올바르게 치환되는지 확인

### A3. LoopGuard — 훅 무한루프 방지
- **파일**: `packages/core/src/hooks/loop-guard.ts` (신규)
- **작업**:
  - beginTurn() / tryAcquire(event, hookName) / recentlyDisabled() 구현
  - 같은 턴에 같은 이벤트+훅 조합이 5회 초과 시 자동 비활성화
  - HookRunner의 실행 경로에 통합
- **검증**: 무한 훅 루프 시나리오에서 5회 후 자동 정지

### A4. 키워드 감지기 (UserPromptSubmit 훅)
- **파일**: `packages/core/src/hooks/keyword-detector.ts` (신규)
- **작업**:
  - UserPromptSubmit 이벤트에서 프롬프트 텍스트 스캔
  - 키워드 → 워크플로우 매핑 테이블:
    - "autopilot" → /autopilot
    - "ralph" → /ralph
    - "ulw"/"ultrawork" → /ultrawork
    - "debug" → /debug
    - "verify" → /verify
  - 감지 시 해당 슬래시 커맨드 액션 자동 트리거
- **검증**: 키워드 포함 프롬프트 입력 시 자동으로 워크플로우 활성화

### A5. 위임 강제기 (Delegation Enforcer)
- **파일**: `packages/core/src/hooks/delegation-enforcer.ts` (신규)
- **작업**:
  - PostToolUse 이벤트에서 특정 패턴 감지:
    - "다른 파일도 같이 수정해" → SubagentStart 트리거
    - "테스트도 작성해" → SubagentStart 트리거
    - "병렬로 처리해" → SubagentStart 트리거
  - 프롬프트에 system instruction 삽입하여 sub-agent 호출 유도
- **검증**: 위임 패턴 감지 시 sub-agent 자동 활성화

---

## Phase B: 워크플로우 엔진 (P9)

> workflowCommands.ts의 프롬프트 인젝션 방식을 확장.
> declarative runtime 대신 실용적인 state machine 방식.

### B1. 워크플로우 스테이트 매니저
- **파일**: `packages/core/src/workflows/state-manager.ts` (신규)
- **작업**:
  - WorkflowState 타입: idle/running/paused/completed/failed
  - 상태 전이: start(name) → tick() → pause() → resume() → complete()
  - 상태를 ~/.glm/workflows/<session-id>.json 에 저장
  - 세션 재개 시 이전 워크플로우 상태 복원
- **검증**: 워크플로우 시작 → 중단 → 재개 → 완료 사이클

### B2. Acceptance DSL 평가기
- **파일**: `packages/core/src/workflows/acceptance.ts` (신규)
- **작업**:
  - 체크 함수 구현:
    - `tests-pass`: 마지막 테스트 실행 결과 확인
    - `lsp-clean`: `tsc --noEmit` 에러 0개
    - `no-todo-in-diff`: 변경 diff에 TODO 없음
    - `file-exists(path)`: 파일 존재 확인
  - 논리 연산자: all(), any(), not()
  - 워크플로우 커맨드에서 `verify` 단계에 통합
- **검증**: 테스트 실패 시 acceptance 평가가 실패 반환

### B3. CLI 서브커맨드 바인딩
- **파일**: `packages/cli/src/commands/` (신규 파일들)
- **작업**:
  - `glm autopilot`: /autopilot 슬래시 커맨드와 동일 동작 in headless mode
  - `glm ralph`: /ralph 동일
  - `glm plan`: /plan 동일
  - 각 커맨드는 `-p "프롬프트"` 플래그로 프롬프트 전달
  - 기존 `glm -p "..."` headless 모드 위에 워크플로우 프롬프트 래핑
- **검증**: `glm autopilot -p "refactor auth module"` 실행 시 자율 모드 동작

### B4. 워크플로우 카탈로그 완성
- **파일**: `packages/cli/src/ui/commands/workflowCommands.ts` (수정)
- **작업**:
  - 누락 4개 커맨드 추가: /ralplan, /self-improve, /critic, /skillify
  - 각 워크플로우에 Acceptance DSL 게이트 통합
  - 상태 표시: TUI 헤더에 현재 워크플로우/단계/반복 표시
- **검증**: 16개 워크플로우 전부 /<이름>으로 실행 가능

---

## Phase C: 오케스트레이터 & 에이전트 (P8)

> qwen-code의 AgentHeadless + SubagentManager 위에 구축.
> 20 에이전트 역할은 builtin-agents.ts 확장.

### C1. 에이전트 역할 카탈로그 (20개)
- **파일**: `packages/core/src/subagents/builtin-agents.ts` (수정)
- **작업**: 기존 3개(general-purpose, Explore, statusline-setup)에 17개 추가:
  - planner, architect, executor, verifier, critic
  - code-reviewer, code-simplifier, security-reviewer
  - test-engineer, qa-tester, debugger, tracer
  - analyst, scientist, designer, document-specialist, writer
  - 각 역할에 특화된 systemPrompt 작성
- **검증**: SubagentManager.getAvailableAgents()가 20개 반환

### C2. 태스크 분류기 (Task Classifier)
- **파일**: `packages/core/src/orchestrator/task-classifier.ts` (신규)
- **작업**:
  - 입력: 프롬프트 텍스트 + 파일 컨텍스트 크기
  - 출력: SMALL(1파일) / MEDIUM(2-5파일) / LARGE(6-20파일) / LONG_HORIZON(20+)
  - 분류 기준:
    - SMALL: "fix typo", "rename variable"
    - MEDIUM: "add error handling to X", "refactor Y"
    - LARGE: "implement feature X", "migrate from A to B"
    - LONG_HORIZON: "build X from scratch", "migrate entire codebase"
  - 분류 결과에 따라 자동으로 에이전트 팬아웃 수 결정
- **검증**: 다양한 프롬프트에 대해 올바른 분류 반환

### C3. 팬아웃 오케스트레이터
- **파일**: `packages/core/src/orchestrator/fanout.ts` (신규)
- **작업**:
  - LARGE/LONG_HORIZON 태스크를 서브태스크로 분할
  - 각 서브태스크에 전문 에이전트 역할 배정
  - SubagentManager를 통해 병렬 실행
  - 결과 집계 + 충돌 해결
  - 기존 AgentHeadless.run() 위에 래핑
- **검증**: 다중 파일 변경이 필요한 태스크에서 병렬 에이전트 실행

### C4. 파이프라인 라우터
- **파일**: `packages/core/src/orchestrator/pipeline.ts` (신규)
- **작업**:
  - 6단계 파이프라인: plan → scaffold → execute → verify → test → review
  - 각 단계:
    - plan: planner 에이전트가 설계
    - scaffold: architect 에이전트가 구조 생성
    - execute: executor 에이전트가 구현
    - verify: verifier 에이전트가 검증
    - test: test-engineer 에이전트가 테스트
    - review: code-reviewer 에이전트가 리뷰
  - 단계 간 핸드오프: 이전 단계 결과를 다음 단계 컨텍스트에 주입
  - 재시도 예산: 각 단계 최대 3회 재시도
- **검증**: 파이프라인 실행 시 6단계 순차 진행, 실패 시 재시도

### C5. Rate-limit 스케줄러
- **파일**: `packages/core/src/orchestrator/rate-scheduler.ts` (신규)
- **작업**:
  - 모델별 동시 요청 슬롯 관리:
    - GLM-5.1: 10 슬롯
    - GLM-5-Turbo: 10 슬롯
    - GLM-4.5-Air: 20 슬롯
  - 429 응답 시 자동 백오프 + 모델 폴백
  - 팬아웃 에이전트 간 슬롯 공유
- **검증**: 429 응답 시 폴백 모델로 전환

---

## Phase D: 메모리 & 컨텍스트 (P7)

> qwen-code의 memory manager (~1300 LOC) 위에 기획안 기능 추가.

### D1. 컨텍스트 어셈블러
- **파일**: `packages/core/src/memory/context-assembler.ts` (신규)
- **작업**:
  - 6블록 구조 조립:
    1. System prompt (고정)
    2. AGENTS.md cascade (GLM.md + AGENTS.md)
    3. Memories section (관련 메모리 top-K)
    4. Conversation history
    5. Tool results
    6. Budget indicator
  - 각 블록에 토큰 수 추적
  - 총 컨텍스트가 윈도우 80% 초과 시 자동 압축 트리거
- **검증**: 긴 대화에서 자동 압축 동작

### D2. 멀티홉 AGENTS.md 파일 상대 발견
- **파일**: `packages/core/src/memory/file-relative.ts` (신규)
- **작업**:
  - Read 도구가 깊은 경로의 파일을 읽을 때
  - 해당 파일에서 시작해 상위 디렉토리로 올라가며 AGENTS.md 탐색
  - 발견 시 컨텍스트에 자동 첨부 (턴당 1회)
- **검증**: 서브디렉토리의 파일 읽기 시 가까운 AGENTS.md 자동 첨부

### D3. 메모리 캡 & 제거
- **파일**: `packages/core/src/memory/caps.ts` (신규)
- **작업**:
  - 용량 제한:
    - 메모리당 200줄 / 25KB
    - 총 200개 파일 / 5MB
  - 초과 시 점수 기반 제거:
    - age_decay + type_weight + access_recency - pin_bonus
  - 기존 memory/manager.ts에 통합
- **검증**: 용량 초과 시 오래된 메모리 자동 제거

### D4. PostEdit 진단
- **파일**: `packages/core/src/tools/post-edit-diagnostics.ts` (신규)
- **작업**:
  - Edit/MultiEdit 도구 실행 후 자동 진단:
    - `tsc --noEmit` (TypeScript 프로젝트)
    - `eslint --fix` (설정된 경우)
  - 오류 발견 시 LLM에 자동 피드백
  - 설정으로 활성/비활성 제어
- **검증**: 편집 후 타입 에러가 있으면 자동으로 수정 제안

---

## Phase D2: MCP/스킬 (P4 잔여)

### D2-1. 스킬 핫 리로드
- **파일**: `packages/core/src/skills/skill-manager.ts` (수정)
- **작업**:
  - 이미 chokidar watch 있음 — 이벤트 핸들러 보강
  - 스킬 파일 변경 시 즉시 리로드 (기존 리로드 로직 확인)
  - 변경 시 UI에 알림 표시
- **검증**: 스킬 파일 수정 시 자동 감지

### D2-2. .claude/ 호환성 레이어
- **파일**: `packages/cli/src/config/settings.ts` (수정)
- **작업**:
  - loadSettings()에서 .claude/settings.json도 읽기 (폴백)
  - .claude/CLAUDE.md를 GLM.md 대안으로 인식
  - 기존 qwen-code 사용자의 설정 자동 마이그레이션
- **검증**: .claude/ 디렉토리가 있는 프로젝트에서 설정 로드

---

## Phase E: 출시 폴리시 (P10)

### E1. Yolo 3티어 정책 (이미 부분 구현됨)
- **파일**: `packages/cli/src/ui/commands/workflowCommands.ts` (수정)
- **작업**:
  - conservative: 읽기 + safe 도구만 자동 승인
  - moderate: 읽기 + 쓰기 자동 승인, 셸은 확인
  - full: 모든 도구 자동 승인
  - 각 티어별 감사 로그: ~/.glm/yolo-audit.jsonl
  - 현재 구현 검증 + 누락 시 보완
- **검증**: 각 티어에서 올바른 권한 동작

### E2. 알림 시스템
- **파일**: `packages/core/src/notifications/` (신규 디렉토리)
- **작업**:
  - `notifier.ts`: 공통 인터페이스
  - `telegram.ts`: Bot API로 메시지 전송
  - `discord.ts`: Webhook으로 메시지 전송
  - `slack.ts`: Webhook으로 메시지 전송
  - 설정: ~/.glm/settings.json의 notifications 섹션
    ```json
    {
      "notifications": {
        "telegram": { "botToken": "...", "chatId": "..." },
        "discord": { "webhookUrl": "..." },
        "slack": { "webhookUrl": "..." }
      }
    }
    ```
  - 트리거: 워크플로우 완료, 에러, 사용자 입력 필요 시
- **검증**: 설정된 채널로 알림 전송

### E3. 롱호라이온 체크포인트
- **파일**: `packages/core/src/orchestrator/checkpoint.ts` (신규)
- **작업**:
  - 자동 프로모션 5 트리거:
    1. `--auto` CLI 플래그
    2. `/auto` 슬래시 커맨드
    3. 계획 ≥ 20 스텝
    4. 현재 스텝 ≥ 30
    5. 클라이언트 분리 감지
  - 체크포인트: 매 10회 LLM 턴마다 상태 스냅샷 저장
  - 복구: 세션 재개 시 마지막 체크포인트에서 재시작
- **검증**: 긴 실행 세션에서 체크포인트 저장 + 복구

### E4. 세션 익스포트
- **파일**: `packages/cli/src/commands/export.ts` (신규)
- **작업**:
  - `glm export <session-id> --format markdown|json`
  - 대화 내역을 마크다운 또는 JSON으로 내보내기
  - 도구 호출/결과 포함
  - ~/.glm/exports/ 에 저장
- **검증**: 세션 익스포트 후 파일 내용 확인

### E5. 가비지 컬렉션
- **파일**: `packages/cli/src/commands/gc.ts` (신규)
- **작업**:
  - `glm gc` 명령:
    - 30일 이상 된 세션 정리
    - 미사용 임시 파일 제거
    - 오래된 체크포인트 정리
  - 시작 시 자동 실행 옵션
- **검증**: gc 실행 후 디스크 사용량 감소

### E6. `glm doctor` 진단
- **파일**: `packages/cli/src/commands/doctor.ts` (신규)
- **작업**:
  - 환경 진단:
    - Node.js 버전 (22+ 필요)
    - z.ai API 연결성
    - ~/.glm 디렉토리 권한
    - MCP 서버 상태 (4개 GLM 내장)
    - 설정 파일 유효성
    - LSP 서버 사용 가능 여부
  - 문제 발견 시 해결 방법 제안
- **검증**: doctor 실행 시 모든 항목 체크

---

## Phase F: P3 추가 기능

### F1. 멱등성 캐시
- **파일**: `packages/core/src/tools/idempotency-cache.ts` (신규)
- **작업**:
  - 키: sha256(role + model + system_prompt + tool_name + tool_args)
  - 캐시: ~/.glm/cache/tool-calls.jsonl (append-only log)
  - TTL: 5분 (기본값)
  - 동일한 도구 호출이 5분 이내에 반복되면 캐시된 결과 반환
  - 설정으로 활성/비활성
- **검증**: 동일 도구 호출 시 캐시 hit

### F2. 비전 파이프라인 보강
- **파일**: `packages/cli/src/ui/commands/visionCommand.ts` (수정)
- **작업**:
  - 이미지 자동 리사이즈: 2048px 초과 시 축소
  - 결과 캐싱: sha256(이미지) 키로 ~/.glm/cache/vision/
  - /vision --raw: 원본 해상도로 전송
  - 첨부 칩 UI: [x]로 제거 가능한 이미지 미리보기
- **검증**: 대용량 이미지 자동 축소 후 비전 처리

---

## 구현 순서

```
Phase A (Hooks)     → B (Workflows)의 전제조건
Phase B (Workflows) → C (Orchestrator)의 사용자 인터페이스
Phase C (Orchestrator) → D/E/F (나머지는 독립)
Phase D, E, F      → 병렬 가능
```

### 순차:
1. **A1~A5** (Hook 확장) — 2일
2. **B1~B4** (워크플로우 엔진) — 3일
3. **C1~C5** (오케스트레이터) — 5일

### 병렬 (C 이후):
4. **D1~D4** (메모리/컨텍스트) — 2일
5. **E1~E6** (출시 폴리시) — 3일
6. **F1~F2** (P3 추가) — 1일

### 최종:
7. 전체 통합 테스트 + `npm run build && npm run bundle` + E2E 검증

---

## 파일 생성 요약

| 신규 파일 | 수 | 수정 파일 | 수 |
|---|---|---|---|
| packages/core/src/hooks/ | 3 | packages/core/src/hooks/types.ts | 1 |
| packages/core/src/orchestrator/ | 5 | packages/core/src/subagents/builtin-agents.ts | 1 |
| packages/core/src/workflows/ | 2 | packages/core/src/memory/manager.ts | 1 |
| packages/core/src/notifications/ | 4 | packages/cli/src/ui/commands/workflowCommands.ts | 1 |
| packages/core/src/tools/ | 2 | packages/cli/src/config/settings.ts | 1 |
| packages/cli/src/commands/ | 3 | packages/core/src/skills/skill-manager.ts | 1 |
| **총 신규** | **19** | **총 수정** | **6** |

---

## 리스크 & 완화

| 리스크 | 완화 |
|---|---|
| qwen-code hooks 시스템과 GLM hooks 충돌 | 기존 enum 확장만, 교체 없음 |
| 팬아웃 에이전트 API rate limit | Rate 스케줄러로 슬롯 관리 |
| 20 에이전트 systemPrompt 품질 | 기존 qwen-code 3개 + oh-my-claudecode 참고 |
| 알림 webhook 보안 | 설정 파일에서만 읽기, env interpolation 지원 |
| 긴 세션 메모리 누수 | 체크포인트 + GC로 관리 |
