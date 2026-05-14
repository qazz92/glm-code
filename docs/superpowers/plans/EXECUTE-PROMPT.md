# Execute Prompt — Copy/Paste 용

다른 세션에서 이 프로젝트 실행 시작할 때 그대로 복사해서 입력하세요.

---

## 🟢 시작용 프롬프트 (P1 부터 시작)

```
나는 glm code 라는 GLM Coding Plan 전용 coding agent CLI 를 만들고 있어. 모든 설계와
구현 plan 이 /Users/glen/twelvelabs_works/study/docs/superpowers/ 아래 준비되어 있어.

지금부터 P1 (Daemon Core + IPC + SQLite Storage) 부터 실행해줘.

**필독 문서** (시작 전 순서대로 읽어):
1. /Users/glen/twelvelabs_works/study/docs/superpowers/plans/EXECUTION-ORCHESTRATION.md
   — 전체 실행 순서, 리뷰 프로토콜, bootstrap 전략, 모든 plan 의 entry point
2. /Users/glen/twelvelabs_works/study/docs/superpowers/plans/FIX-MANIFEST.md
   — Canonical decisions (§0): RPC API 는 rpc.on(method, handler), migration 번호 lock,
     LoaderHub 패턴, 7 actions (no vision in actions), shared types per-domain 파일 등
   — §11 (Action × Model × Thinking 2-layer) + §12 (이미지 첨부) 의 design intent
3. /Users/glen/twelvelabs_works/study/docs/superpowers/specs/2026-05-14-glm-code-design.md
   — 전체 spec. 의문 생기면 ground truth.
4. /Users/glen/twelvelabs_works/study/docs/superpowers/plans/2026-05-14-glm-code-p1-daemon-core.md
   — P1 실행 plan (12 tasks, 78 steps, ~2300줄)

**실행 방식**: superpowers:subagent-driven-development 스킬 사용.
- 매 task 마다 fresh subagent dispatch
- Task 사이에 review (diff + 테스트 + manifest invariant 체크)
- 실패 시 §7 Failure Recovery 따름

**Pre-Plan checklist 필수 실행** (EXECUTION-ORCHESTRATION.md §3):
```bash
cd /Users/glen/twelvelabs_works/study/
test -d .git || git init                  # 1. git repo 초기화
git status                                  # 2. 작업 디렉토리 깨끗한지
cd docs/superpowers/plans/
grep -cE "\.rpc\.(register|method)\(" 2026-05-14-glm-code-p*.md   # 3. must be 0
grep -cE "packages/hooks/" 2026-05-14-glm-code-p*.md              # must be 0
```

위 4개 체크 통과시 P1 Task 1 부터 시작.

**Acceptance gate 통과 기준** (EXECUTION-ORCHESTRATION.md §4 의 P1 행 참조):
- glm daemon start/stop/status/restart 작동
- glm "echo X" → "echo X" 에코 응답
- glm sessions 리스트
- glm doctor HEALTHY
- 크래시 후 stale PID 자동 정리
- SQLite WAL + migrations 작동
- 단위 테스트 80%+ coverage on core 모듈

**다음 단계**: P1 완료 + acceptance gate 통과 → EXECUTION-ORCHESTRATION.md §1 의
의존 그래프 따라 P2 (TUI) / P3 (tools) / P6 (LLM router) 시작. P1 의 자식 plan 들이라
병렬 가능 (다중 세션 있으면).

**중요 제약**:
- 토큰 = 돈 원칙: 진행 중 LLM 호출 절대 중단 X (FIX-MANIFEST §0 + spec §5)
- glm code 는 GLM Coding Plan 전용. Ollama/vLLM/OpenRouter 절대 추가 X.
- rpc.on() 이 유일한 RPC 등록 API (rpc.register / rpc.method 금지)
- Migration 번호 §0.2 lock-in 따름
- 7 actions (no vision in action list) — vision 은 glm-vision MCP 별도

지금부터 시작해줘.
```

---

## 🟢 후속 plan 시작용 (P2~P10 각각)

P1 끝나고 P2 (혹은 다른) 시작할 때:

```
P1 완료 확인됨 (acceptance gate 통과). 이제 P{N} 실행해줘.

**Pre-Plan checklist** (EXECUTION-ORCHESTRATION.md §3):
1. 이전 plan 의 task 모두 `- [x]` 인지
2. git status 깨끗 + main 브랜치
3. Manifest invariants 모두 통과 (grep 체크 4종)
4. pnpm build && pnpm test 그린

위 4개 통과시 P{N} (/Users/glen/twelvelabs_works/study/docs/superpowers/plans/
2026-05-14-glm-code-p{N}-{slug}.md) 의 Task 1 부터 시작.

EXECUTION-ORCHESTRATION.md §4 의 P{N} 행에 명시된 acceptance gate 가 통과해야 종료.

subagent-driven-development 스킬 사용. 매 task review.

**Bootstrap milestone** (P6 끝부터):
- P6 끝: glm 으로 자기 자신 작은 self-edit 가능 (typo / 1-file fix). 5% 비중.
- P7 끝: multi-file refactor 가능. 25%.
- P8 끝: orchestrated multi-step. 60%.
- P9 끝: /plan, /ralph 적극 사용. 85%.
- P10 끝 (v0.1 GA): /autopilot, /yolo daily-driver. 95%+.

EXECUTION-ORCHESTRATION.md §6 참조.

시작해줘.
```

---

## 🟢 디버그 / 트러블슈팅 시작용

문제 생긴 세션에서 사용:

```
glm code 프로젝트 실행 중 문제가 발생했어. 어떻게 해야 할지 알려줘.

**상황**: [여기에 무슨 일이 있었는지 1-3줄로]

**현재 plan**: P{N} (어느 task 인지 / 어느 step 인지)

**증상**: [에러 메시지, 실패 출력, 막힌 상태 등]

**참조 문서**:
- /Users/glen/twelvelabs_works/study/docs/superpowers/plans/EXECUTION-ORCHESTRATION.md
  §7 Failure Recovery
- /Users/glen/twelvelabs_works/study/docs/superpowers/plans/FIX-MANIFEST.md
- /Users/glen/twelvelabs_works/study/docs/superpowers/plans/2026-05-14-glm-code-p{N}-*.md

§7 의 가이드라인 따라 진단 + 복구해줘. 토큰=돈 원칙 유지 (절대 진행 중 LLM 호출 중단 X).
```

---

## 📋 빠른 참조 — 어디에 무엇이 있는지

```
/Users/glen/twelvelabs_works/study/docs/superpowers/
├── specs/
│   └── 2026-05-14-glm-code-design.md          # ground truth (~2000 줄)
└── plans/
    ├── EXECUTION-ORCHESTRATION.md             # ⭐ 실행자 entry point
    ├── EXECUTE-PROMPT.md                       # 이 파일
    ├── FIX-MANIFEST.md                         # canonical decisions + §11/§12 patches
    ├── 2026-05-14-glm-code-p1-daemon-core.md          # 주 1-2
    ├── 2026-05-14-glm-code-p2-tui.md                  # 주 1-2 (P1과 병렬)
    ├── 2026-05-14-glm-code-p3-tools.md                # 주 2 (P1 의존)
    ├── 2026-05-14-glm-code-p4-mcp-skill-plugin.md     # 주 3-5
    ├── 2026-05-14-glm-code-p5-hooks-events.md         # 주 5
    ├── 2026-05-14-glm-code-p6-llm-router.md           # 주 4 (parallel)
    ├── 2026-05-14-glm-code-p7-memory-context-lsp.md   # 주 5-7
    ├── 2026-05-14-glm-code-p8-orchestrator-agents.md  # 주 6-8
    ├── 2026-05-14-glm-code-p9-workflows.md            # 주 9-10
    └── 2026-05-14-glm-code-p10-polish-longhorizon-yolo.md  # 주 11-12 (v0.1 GA)

Working dir: /Users/glen/twelvelabs_works/study/
처음 git init 필요 (이 디렉토리는 아직 git repo 가 아님).
```

---

## 📋 한 줄 요약

- 시작점: `EXECUTION-ORCHESTRATION.md` 읽고 → P1 plan 의 Task 1 부터
- 도구: `superpowers:subagent-driven-development` 스킬
- 절대 위반 금지: rpc.on() 만, no Ollama, 진행 중 LLM 중단 0, migration 번호 §0.2 lock
- 종착점: P10 완료 + §9 acceptance criteria 모두 통과 = v0.1 GA
