# History

This file records each day's work in KST.

## 2026-04-28 (KST)

### Todo
- [x] Phase 1 시작점으로 Polymarket CTF Exchange를 채택할지 검토
- [x] CTF 통합 시점/조건을 plan 문서에 반영
- [x] 주간 일정 표 가독성 개선

### Achievement
- **CTF Exchange 통합 시점 결정**: Phase 1은 fixed-price 1:1 escrow(parimutuel)로 가고, Polymarket CTF Exchange (https://github.com/Polymarket/ctf-exchange) 통합은 **Phase 2 W6 go/no-go 결정 지점**으로 미룸. 근거: ① CLOB는 maker 없이는 UX가 0이라 MM Agent v0가 paper-trading에서 안정화된 후가 적기, ② Phase 1 가치는 "3주 안에 풀스택 한 바퀴 돌려 어디서 막히는지 보는 것"인데 CTF + maker + USDC + order signing UI 동시 도입은 그 신호를 죽임, ③ CTF는 ERC-20 콜래터럴 전제이므로 W6 USDC 전환과 한 묶음으로 가야 일관됨.
- **`docs/plan/README.md` 갱신**:
  - §1.3 "고급 트레이딩 기능 제외" → "Phase 1~2 초기 제외, Phase 2 W6 통합 결정 지점"으로 완화
  - §1.4 주간 일정에 W6 CTF 결정 마일스톤 추가
  - §4 Phase 2/3에 CTF 통합 흐름 한 줄씩 추가
  - **§11.2 신설** — CTF Exchange 통합 결정 (의도 / 왜 upstream Polymarket / 안 하는 이유 / Go-No-go 기준 / 미해결 질문 / 다음 액션)
  - §1.4 표에서 Week + Phase 컬럼 병합 ("Phase X — Name · Wn" 형식), 산출물/마일스톤 셀을 `<br>` + 불릿으로 쪼개 컬럼 폭 균형 조정
- **`docs/plan/01-phase-1-core.md` 갱신**: "AMM 욕심 금지" → "AMM/CLOB 욕심 금지" + W6 결정 지점 참조, SDK 인터페이스가 미래 CLOB 전환에 어색해지지 않게 두라는 주의 추가, 후속 Phase 요약에 CTF 결정 명시.

### Post Mortem
- **잘된 점**: 처음 "CTF로 시작이 맞나?" 질문에 plan 원칙(단순하게/작게/빠르게) 기준으로 명확히 No 답변 → 사용자가 prior art(nostra-contracts) 카드를 꺼냈고, 그것도 다시 분석해 "재사용은 좋지만 Phase 1 목표와 미스매치"로 정리. 마지막에 사용자의 진짜 목표("Web3 풀스택 한 바퀴")를 확인하고 그 방향으로 plan 정리. 결정 → 문서화 → 시점/조건 명문화 흐름이 깔끔했음.
- **개선점**: 처음 nostra-contracts 분석 때 리포 구조만 훑고 "CTF가 들어오면 MM 봇이 W1로 당겨와야 한다" 같은 결론을 빨리 냈는데, 실제로 nostra가 production-ready인지(최근 12/31 commit이 USDC precision fix였음)는 더 깊이 안 봄. CTF go-decision 시점에는 upstream Polymarket repo의 안정성/감사 여부도 같은 기준으로 확인 필요.

### Next Task
- Phase 1 W1 착수: `packages/contracts`에 `Market.sol` + `MarketFactory.sol` (fixed-price escrow, 수동 resolve) + Foundry 테스트. Day 3까지 `forge test` 통과가 M1.
- Phase 2 진입 전 준비 작업으로 §11.2 "다음 액션" 3개 (Polymarket CTF reading note, SDK 표면 design doc, MM v0 인터페이스에 CTF order signing 가능성 염두) 일정 잡기.

## 2026-05-07 (KST)

### Todo
- [x] Phase 1 W1 — `packages/contracts` 컨트랙트 + Foundry 테스트 (M1)
- [x] Phase 1 W1 — `packages/sdk` viem 래퍼 + ABI 자동 sync
- [x] Phase 1 W1 — `packages/cli` 신규 패키지 (commander 기반) + end-to-end demo (M2)
- [x] Plan 문서 v1/v2 백본 분리 정합성 — `§4.5` 신설 / `§11.2` 트림 / `§2.2.6` Polymarket-style UI 방향 명시 / `01-phase-1-core.md` 동기화
- [x] Polymarket UI mockup 보관 + plan에 embed (`packages/web/public/mockups/polymarket-reference.png`)

### Achievement
- **Phase 1 W1 완주 (M1 + M2 통과)** — anvil 위에서 deploy → createMarket → 양쪽 베팅 → resolve → claim end-to-end가 SDK CLI로 한 번에 도는 상태. 자세한 구현/테스트/구조는 [`2026-05-07-phase1-w1-implementation.md`](./2026-05-07-phase1-w1-implementation.md) 참고.
  - Foundry 테스트 17/17 통과 (plan 5개 시나리오 + factory + sanity)
  - SDK는 forge build 산출물에서 ABI 자동 sync (`scripts/sync-abis.mjs` → `src/abis/*.ts as const`) — 수동 복사 0줄
  - 신규 `packages/cli/` 패키지 — `verex create/list/info/buy/resolve/claim/position` + `demo.ts` (one-shot 시연)
- **plan 구조 정합성 정리** — 4월 28일에 §11.2를 "Phase 2 W6 결정 지점"으로 둔 것을 운영자(jay) prior CTF Exchange 경험을 반영해 **v1/v2 백본 분리 (확정 플랜)**으로 격상. v1=fixed-price escrow / v2=Polymarket CTF Exchange. UI는 v1부터 Polymarket-style로 가되 백엔드가 못 채우는 데이터는 placeholder.
  - `§4.5 백엔드 버전 분리 (v1/v2)` 신설 — 비교 표 7행 (Backend/Collateral/Pricing/Resolve/Maker/SDK 표면/UI 레이아웃)
  - `§2.2.6 Frontend` — Polymarket-style 방향 + 차용 범위 (layout/density만 영감, 브랜드 컬러/타이포는 자체) + mockup embed
  - `§11.2` 트림 — 비교 표·이유 등은 §4.5로 이동, 이제 "v2 통합 시 결정할 4개 항목 + 사전 액션 3개"만 남김
  - `01-phase-1-core.md` 동기화 — "AMM/CLOB 욕심 금지" 줄을 v1/v2 어조로 갱신, Web 컴포넌트 v1/v2 모드 분리 주의 추가

### Post Mortem
- **잘된 점**: scaffold가 plan과 안 맞는 걸 코딩 들어가기 전에 명시적으로 surface하고 (Factory + per-market vs 단일 컨트랙트) 사용자 결정을 받은 후 진행. 중간에 viem TS 컴파일 에러(DOM lib 누락, payable/non-payable value 타입 충돌, ES2020 → 2022 target)를 만났을 때도 우회보다 root-cause fix. 마일스톤 단위로 검증 (M1 = forge test pass, M2 = demo 완주) — 추측 아닌 실증.
- **개선점**: 첫 forge install 시 user는 "installed"라고 했는데 PATH에 안 잡혀 있었음. 도구 설치 상태는 사용자 말 믿고 넘기기보다 첫 명령 실행으로 직접 확인하는 게 빨랐을 것. 또 SDK build에서 viem .d.ts 컴파일 에러는 `skipLibCheck` 빠뜨려서 발생 — 새 TS 패키지 만들 때 default tsconfig 템플릿에 `skipLibCheck: true` 박아두는 게 좋겠음.

### Next Task
- **Phase 1 W2** 진입 — `packages/mcp-server` 스캐폴딩 + 4개 read tool 선언 (`list_markets`, `get_market`, `get_position`, `get_market_stats`) 중 2개 구현 (`list_markets`, `get_market`). M2.5 (Day 11): Claude Desktop에서 anvil markets 조회.
- W2 병렬 트랙: Web MVP 페이지 골격 (`/markets`, `/markets/[addr]`) — Polymarket-style layout (placeholder data로). v1 단계에 backend가 못 채우는 호가창/시계열은 단순화된 표현.
- ADR 작성: `docs/history/0001-mcp-server-as-canonical-agent-interface.md` (W2 plan 요구 사항).

## 2026-05-08 (KST)

### Todo
- [x] v1 self security audit + dated audit document under `docs/history/`
- [x] Plan README §11.3 — audit action items as trackable items
- [x] Detail doc fixes — clarify CLI invocation patterns (the `verex: command not found` confusion)
- [x] Root `package.json`에 `verex` 스크립트 추가 (`pnpm verex <subcommand>`)
- [x] MarketFactory를 anvil에 첫 배포

### Achievement
- **v1 보안 셀프 감사 완료** — [`2026-05-08-v1-security-audit.md`](./2026-05-08-v1-security-audit.md). 7개 섹션, severity HIGH 0 / MEDIUM 1 / LOW 2 / INFO 6.
  - INFO ×4: forge lint의 `block.timestamp` 비교 경고 — v1엔 시간 단위가 시간/일이라 12초 drift 무관, 수용
  - MEDIUM 1: 단일 글로벌 owner = SPOF — v2 (UMA optimistic oracle) 도입으로 자동 해소
  - LOW 2: 한쪽 풀 0인 상태에서 winner 쪽 선택 시 자금 영구 동결 / `getMarkets()` unbounded 배열 (마켓 수 폭증 시 가스 한도 hit)
  - INFO 2: CLI에 anvil 키 하드코딩, Deploy script `PRIVATE_KEY` env fallback
  - 검증된 안전 사항 11개 (reentrancy CEI, overflow, ETH `.call`, double-claim 등) 별도 정리
  - **70% 의 발견은 v2 도입 자체로 자동 해소** → v1 hardening보다 Phase 2 W6 일정 우선
- **Plan README §11.3** 신설 — audit 발견을 5개 액션 항목 표로 트래킹 (`PRIVATE_KEY` fallback 제거, CLI chainId 가드, 운영 절차, pagination, owner SPOF). 각 항목에 severity / 트리거 시점 / 코드 위치 명시. audit 문서가 owner이고 plan §11.3은 추적용 — 두 곳이 중복되지 않게 분리.
- **Detail doc 수정** ([`2026-05-07-phase1-w1-implementation.md`](./2026-05-07-phase1-w1-implementation.md) §6.1, §7.2) — `verex` 명령이 `command not found`로 실패하는 원인 (workspace 패키지 bin shim 미생성)과 4가지 우회법 (node 직접 호출, `pnpm exec`, alias, `pnpm link --global`) 정리.
- **Root `package.json`에 `verex` 스크립트 추가** — `node packages/cli/dist/index.js`로 위임. 이제 `pnpm verex <subcommand> [options]` 로 호출 가능. `-f` 같은 플래그가 pnpm 자체와 충돌하지 않게 위치(서브커맨드 뒤)만 지키면 됨.
- **MarketFactory 첫 배포 (anvil)** — `0xcf7ed3acca5a467e9e704c703e8d87f634fb0fc9`, owner `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` (anvil account[0]). `pnpm verex list -f ...`로 빈 상태 확인.

### Post Mortem
- **잘된 점**: forge lint warning 한 줄(`block.timestamp`)에서 시작해 audit 전체로 자연스럽게 확장. 발견을 단순히 "고친다/안 고친다"가 아니라 v2 도입과의 시간축에 매핑(70% 자동 해소)함으로써, v1 hardening 우선순위를 plan과 일관되게 낮춤. CLI invocation 혼란도 alias/link/script 4가지 옵션을 비교한 뒤 가장 portable한 root script 채택 — 결정 근거를 detail 문서에 남김.
- **개선점**: detail 문서에 처음부터 `verex create ...` 라고 적어 사용자가 `command not found`를 만났음. 새 CLI 패키지를 만들 땐 처음부터 호출 패턴을 검증/문서화해야 — 코드 작동 = "사람이 호출 가능"은 아님. 또 audit를 W1 직후가 아니라 시간차로 한 게 좋은 점도 있음(코드 익숙해진 뒤): "audit는 implementation 직후가 항상 최선은 아니다" 패턴.

### Next Task
- 동일 (W2 진입). Audit 액션 항목 중 A1 (`PRIVATE_KEY` fallback 제거) / A2 (CLI chainId 가드)는 W2 작업 중 함께 처리 가능 — quick wins.

## 2026-05-11 (KST)

### Todo
- [x] Plan 재구성: v2 (CTF) 백본을 W6 → S2로 당김 (운영자 prior CTF 경험 반영)
- [x] §1.4 단위 전환: Week → Step (W1..W10 → S1..S10), AI 작업 시간 budget 컬럼 추가, GFM checkbox 적용
- [x] Plan 본문 정합성 (§1.3, §2.2.1, §2.2.6, §4, §4.5, §11.2, §11.3) 재작성
- [x] `ctf-exchange` 브랜치 생성 (main에서 분기, 미커밋 작업 carry over)
- [x] S2.1 — `docs/plan/gnosis-ctf-research.md` 작성 (~280줄, 9 섹션)
- [x] S2 deep-dive Q&A: position/collection/indexSet 정밀 정의, multi-outcome event 처리 (NegRisk 패턴), parentCollectionId 무용성, idempotent 개념, NegRisk 발명 mental process

### Achievement
- **plan 구조 큰 전환**: 운영자 prior CTF Exchange 경험을 plan 시간축에 반영해 v1 (W1 parimutuel)을 1주짜리 scaffold로 격하하고 v2 (Polymarket CTF Exchange + Gnosis CTF + USDC + MM Agent v0)를 S2 메인 백본으로. v1/v2 비교 표와 trade-off 설명은 §4.5 historical note로 보존, §11.2는 4줄 pointer로 trim. §11.3 audit 액션 항목 중 A3/A4는 v1 parimutuel 전용이라 OBSOLETE 표시.
- **단위 전환 Week → Step**: AI assistance 하에 W1이 실제로 1일에 끝났던 경험에서 출발. 캘린더 7일 단위가 misleading하다는 인식 → 새 컬럼 "예상 시간 (AI 포함)" 1~5일 range로 추가. 합산: ~25–35일 집중 작업 (캘린더로는 회복일 + 외부 대기 포함 6–8주). 모든 산출물 / 마일스톤 GFM `- [ ]` / `- [x]` 체크박스 적용. S1은 이미 완료라 `[x]` + ✅ 표시.
- **§1.4 S2 row에 "Gnosis CTF 분석 (~2일)"을 첫 deliverable로 박음**: 모든 다른 S2 작업의 prerequisite. 산출물 명시: `docs/plan/gnosis-ctf-research.md`. 마일스톤: CTF mint→split→merge→redeem 한 사이클이 Foundry 테스트로 통과.
- **`gnosis-ctf-research.md` 작성** (9 섹션): mental model, 5 핵심 함수 (`prepareCondition` / `splitPosition` / `mergePositions` / `reportPayouts` / `redeemPositions`), position ID 유도 (collateral → collectionId → positionId 키체인), event table (S5 indexer 준비), Polymarket Exchange의 CTF 사용 패턴 (`AssetOperations.sol`에서 본 hard-code `parentCollectionId = bytes32(0)` + `partition = [1, 2]`), CTF vs Exchange 경계, open questions 5개, S2.2~S2.6 매핑, 추천 reading order. 자세한 내용은 [`2026-05-11-plan-restructure-and-gnosis-research.md`](./2026-05-11-plan-restructure-and-gnosis-research.md) 참고.
- **`ctf-exchange` 브랜치 생성** — main에서 분기. 오늘의 모든 작업은 이 브랜치에 commit (push는 안 함, 사용자 미요청).
- **Q&A 세션** (research note에 부분 반영, 일부는 이번 commit에 포함 안 됨): position/collection/indexSet의 정밀 의미, "event"는 컨트랙트 레이어에 없고 UI/DB 메타데이터라는 인사이트, parentCollectionId가 conditional positions를 위해 존재하지만 실용성 없어 모두가 hard-code, idempotent의 의미와 SDK가 비-idempotent primitive를 idempotent 인터페이스로 래핑해야 한다는 패턴, NegRisk Adapter를 발명하는 mental process 6 move (사용자 고통 → invariant → 막힌 arbitrage → 빠진 primitive → layer 안 modify → market dynamics 신뢰).

### Post Mortem
- **잘된 점**: 큰 plan 변경을 단계적으로 진행 — 먼저 CTF 시점을 W6에서 S2로 결정, 다음 단위 변경 (Week → Step)을 별도 결정으로 분리. 한 번에 묶어 처리하지 않고 각 결정의 합리성을 따로 확인. plan 변경 후 §1.4 외 모든 종속 섹션도 일관되게 갱신 (§1.3, §2.2.1, §2.2.6, §4, §4.5, §11.2, §11.3). Gnosis CTF research를 스스로 fetch하면서 ConditionalTokens.sol + CTHelpers.sol + Polymarket의 AssetOperations.sol을 cross-reference해서 단순한 함수 시그니처 나열이 아닌 "실제 사용 패턴"까지 담은 reading note 산출. Q&A 세션에서 사용자가 한 마디 던질 때마다 ("idempotent?", "multi-outcome?", "parentCollectionId 쓸모?") 그것이 research note의 어느 섹션과 연결되는지 명시 — 후속 reader도 같은 길로 가도록.
- **개선점**: research note가 길어서 (~280줄) 사용자가 중간에 멈출 때 작은 chunk (예: 5 핵심 함수만 먼저, position ID는 별도) 단위로 잘라 incremental review하면 더 빨랐을 것. 다음 reference doc 작성 시 chunk-by-chunk 검토 가능한 구조 검토. 또 일부 Q&A 응답이 길었음 — 영어 학습 목적의 부수 효과는 있지만 "본 질문 + 답변"에 가까운 simple 모드를 더 자주 활용해도 좋음.

### Next Task
- **S2.1 milestone 마무리**: CTF mint → split → merge → redeem Foundry 테스트 작성 → 통과 확인. 동시에 research note §7의 open questions 5개 (loser redeem 동작, post-resolve split 가능성, 재진입 표면, 가스 비용, questionId 컨벤션)에 명시적 assertion으로 답변.
- **S2.1 review 후 S2.2 진입**: Polymarket CTF Exchange import (또는 vendor as submodule) + Gnosis CTF 배포 + 컨트랙트들이 anvil에서 함께 동작하는지 검증.
- 운영자 prior CTF Exchange 작업물 (nostra-contracts)을 reference로 활용 가능 — 같은 패턴 한 번 한 경험이 있어 학습/구현 시간 단축 기대.

## 2026-05-12 (KST)

### Todo
- [x] §1.4 S7 row에 Auto-claim delegate + scheduler 추가, 기존 batch tx PoC를 "One-click betting (production)"으로 reframe
- [x] §1.4 S8 row의 Paymaster를 "Gasless onboarding (production)"으로 reframe + spend tracker deliverable 추가
- [x] §2.2.8에 "EIP-7702-enabled features (S7~S8)" sub-section 추가, 3 feature 명시
- [x] §11.4에 B6 (Auto-claim delegate, HIGH, S7 mid-week) + B7 (Paymaster spend tracker, MEDIUM, S8 시작) 추가
- [ ] (내일로 이월) S2.1b — Foundry CTF cycle 테스트 작성 + research note §7의 open questions 5개에 답변

### Achievement
- **EIP-7702 사용자 대면 feature 3개를 plan에 격상** — research/PoC 항목으로만 트래킹되던 EIP-7702가 이제 §1.4 / §2.2.8 / §11.4 세 곳에 명시적으로 등장:
  - **One-click betting** (S7) — `approve(USDC)` + `fillOrder` 1 서명. 기존 "배치 tx PoC"를 production track으로 reframe.
  - **Auto-claim** (S7, 신규) — backend scheduler가 resolved 마켓의 `redeemPositions`를 자동 호출. 사용자 EOA에 ONLY `redeemPositions` 허용하는 audit-grade 최소 delegate 사용.
  - **Gasless onboarding** (S8) — Paymaster가 신규 지갑의 첫 N=5 거래 후원. Spend tracker로 N+1번째부터 후원 중단.
- 8개 후보 feature 중 3개를 product story 일관성과 implementation 비용 기준으로 선별 (one-click + auto-claim + gasless가 같은 EIP-7702 delegation primitive 공유; (4) 시간 한정 세션 / (6) stop-loss / (7) social recovery / (8) 구독 LP는 의도적 제외 — 각각 audit 표면 확장 + UI 작업 추가로 v2 scope 초과).

### Post Mortem
- **잘된 점**: feature 추가 결정을 "8개 survey → 3개 추천 → 사용자 승인 → 적용" 단계로 분리. 한 번에 모든 feature 던지지 않고 사용자가 trade-off (audit 표면 vs feature 수)를 명시적으로 의사결정. 추가된 항목들이 §1.4 (when), §2.2.8 (what), §11.4 (how to track) 세 섹션에 cross-reference로 묶여 plan 일관성 유지. "체크리스트에 한 줄 묻히는" 패턴을 피함.
- **개선점**: §11.x 액션 항목과 §1.4 주간 deliverable의 자동 동기화 패턴이 아직 없음. 다음 plan 변경 (예: B6/B7 추가)에서도 §1.4 cross-reference를 수동으로 챙겨야 함. 향후 `make plan-check` 같은 lint 스크립트로 §11.x 항목이 §1.4 어딘가에서 referenced되는지 자동 검증하면 좋겠음 (지금은 우선순위 낮음).

### Next Task
- **내일 (2026-05-13) — S2.1b 본격 진입**:
  1. **Foundry 테스트 작성** — `packages/contracts/test/CTFCycle.t.sol`. Gnosis CTF (`gnosis/conditional-tokens-contracts`)를 git submodule로 vendor. 배포 → split → (시뮬레이트 거래) → merge → reportPayouts → redeem 한 사이클을 anvil에서 통과.
  2. **Research note §7의 open questions 5개에 명시적 assertion으로 답변**:
     - Q1: Loser `redeemPositions` 동작 — revert 없이 0 반환 검증
     - Q2: Post-resolve `splitPosition` 가능성 — resolve 후 split 시도, revert 여부 확인
     - Q3: 재진입 surface — `splitPosition`/`mergePositions`의 ERC-1155 hook (`onERC1155Received`) 분석 + 보호 수단 검토
     - Q4: 가스 비용 — `splitPosition` vs 직접 `safeTransferFrom` 비교 (`forge snapshot`으로)
     - Q5: `questionId` 컨벤션 — `keccak256(질문 텍스트)` vs UMA 호환 형식. S6 oracle 전환 시 마이그레이션 비용 고려해서 결정 + research note에 적용
  3. 발견 사항을 research note에 in-line 답변으로 추가 (§7 각 question 아래 "검증 결과:" 줄 추가)
- **S2.1b 완료 후**: S2.2 (Polymarket CTF Exchange import + Gnosis CTF 배포 + 컨트랙트 통합 검증) 진입
- 참고: 운영자 prior `nostra-contracts` 작업이 같은 패턴 한 번 한 경험이라 §7 답변 + 테스트 작성 가속 가능

## 2026-05-13 (KST)

### Todo
- [x] §7 unified list (Q1-Q11 한 리스트로) + Q1-Q4에 provisional 답변 추가 (커밋 `d0add3a`)
- [x] S2.1 milestone — CTFCycle Foundry 테스트 작성 (11 tests, 28/28 전체 통과) + Polymarket ctf-exchange submodule 통합 (커밋 `6d8d920`)
- [x] S2.2 setup — `DeployCTF.s.sol`로 anvil에 USDC + ConditionalTokens + CTFExchange 한 번에 배포 성공 (같은 커밋 `6d8d920`)
- [x] §7 provisional → confirmed 전환 (Q1-Q4 + Q6 + Q8 + Q9 모두 측정값으로 확인; Q7만 S7로 deferred)
- [x] Oracle 진행 계획 명시화: 단일 "Chainlink + UMA" 항목을 3-stage progression (manual → Chainlink → UMA)으로 분해 (커밋 `fdeece7`)
- [x] (메타) English 학습 형식 (bilingual + English check + 간단 eval + Today's phrases)을 영구 메모리화 — `~/.claude/projects/-Users-jay-work/memory/feedback_english_learning_format.md` + `~/.claude/CLAUDE.md` 글로벌
- [ ] (내일로 이월) S2.4 — SDK 표면 전환 (`buyYes/buyNo` → `fillOrder/fillOrders` + `signOrder` EIP-712). 디자인 결정 항목 다수 — 사용자 입력 필요

### Achievement
- **S2.1 milestone (Gnosis CTF research validated by Foundry test)**:
  - Polymarket의 `ctf-exchange` 저장소를 submodule로 vendor → 그들의 pre-built ConditionalTokens 바이트코드 (Solidity 0.5.x 컴파일된 artifact) + IConditionalTokens 인터페이스 + CTFExchange 소스 한꺼번에 사용 가능
  - 신규 `test/CTFCycle.t.sol` (11 tests) 가 mint→split→merge→redeem 전체 사이클 + open question에 대한 표적 테스트 실행. 전체 Foundry suite **28/28 통과** (S1: 17 + S2.1: 11)
  - §7 "provisional answer" 5개를 측정값/테스트로 검증된 "confirmed answer"로 전환:
    - Q1 ✅ loser redeem returns 0, no revert (UX 친화적)
    - Q2 ✅ split-after-resolve 허용되지만 의미 없음
    - Q3 ✅ ERC-1155 receiver hook은 caller 쪽에서 fire; CTF 자체는 CEI-safe
    - Q4 ✅ 가스 측정: split ~151k (EOA) / ~496k (contract + hook), merge ~191k, redeem ~230-240k. **함의**: MM Agent에서 split-on-demand 대신 complete set pre-mint하면 fill당 ~100k gas 절약
    - Q6 ✅ 정확한 revert 문자열 캡처: `"condition already prepared"` (SDK 래퍼에서 try/catch로 idempotent 인터페이스 만들기 가능)
    - Q8 ✅ 컨트랙트 caller는 반드시 `onERC1155BatchReceived` 구현 (안 하면 spec대로 revert)
    - Q9 ✅ `redeem([1,2])` 통합 호출이 분리 호출 두 개 합보다 **33% 저렴** (54k vs 82k)
  - 두 provisional 답변이 틀렸음 — 둘 다 테스트 실패로 발견:
    - Position ID 유도를 직접 keccak으로 했더니 CTHelpers의 EC arithmetic과 안 맞음 → CTF의 `getCollectionId` / `getPositionId` helper 사용으로 수정
    - CTF (ERC-1155)에 ERC-20 view (`IERC20.balanceOf(address)`) 호출하는 stray 라인 → 제거
- **S2.2 setup**: `script/DeployCTF.s.sol` 가 anvil에 v2 backbone 한 번에 배포 — MockUSDC (`0x5FbDB23156...`) + ConditionalTokens (`0xe7f1725E77...`, Polymarket의 pre-built 아티팩트에서 raw bytecode로 deploy) + CTFExchange (`0x9fE4673667...`, 소스 컴파일). pragma 협상: CTFExchange가 `=0.8.15` 픽 → MockUSDC와 DeployCTF script도 `^0.8.15`로 (한 컴파일 단위 공유). 다른 컨트랙트들 (`Market.sol`, `MarketFactory.sol` from S1)은 `^0.8.24` 유지. `foundry.toml`에서 solc 핀 제거 → multi-version 자동 선택.
- **Oracle 3-stage progression 명시화** — 이전 plan은 "Chainlink + UMA" 단일 S6 항목으로 lump했음. 사용자 명시 요청에 따라 **manual (S2~) → Chainlink adapter (S6 first) → UMA adapter (S6 second)** 로 분해. §1.4 S2/S6 row 갱신, §2.2.7 Oracle 섹션을 3-stage 표 + 사용 케이스 + 한계로 재작성, §4 Phase 2 요약 줄도 업데이트. 같은 conditionId는 stage 사이에서 마이그레이션 불가 (oracle 주소가 다르면 conditionId 다름) — 새 마켓이 stage 선택. 신뢰 가정의 점진적 분산 (manual = 단일 운영자 신뢰, Chainlink = 분산 oracle but 숫자만, UMA = 임의 명제 + 분쟁 가능).
- **English 학습 형식을 영구 메모리화**: 이번 세션에서 확립한 답변 형식 (English check → English answer → divider → Korean answer → Today's phrases + brief eval)을 두 곳에 저장 — `~/.claude/projects/-Users-jay-work/memory/feedback_english_learning_format.md` (프로젝트 범위, 80줄 spec) + `~/.claude/CLAUDE.md` (글로벌, 50줄 leaner). 미래 모든 Claude Code 세션에서 자동 적용. 자세한 결정/구현은 [`2026-05-13-s2-implementation-and-oracle-progression.md`](./2026-05-13-s2-implementation-and-oracle-progression.md) 참고.

### Post Mortem
- **잘된 점**: Provisional answer + 테스트 패턴이 작동함을 입증 — provisional 답변 두 개가 틀렸고 둘 다 테스트가 잡음. 만약 답변을 "confirmed"로만 적었다면 (테스트 없이) 잘못된 mental model이 SDK 디자인까지 전파됐을 것. "provisional vs confirmed" 라벨 시스템의 실용 가치 입증. 또 사용자가 "researching하는 동안 implement해" 라고 위임했을 때 "stopping rule" 명시 — S2.4 (SDK 디자인은 주관적 결정 다수)는 멈추고, S2.1 milestone + S2.2 mechanical setup만 진행. 자율적 작업의 적절한 경계.
- **개선점**: pragma 충돌 (Polymarket =0.8.15 vs 우리 ^0.8.24)을 처음에 미처 예측 못함. CTFExchange.sol을 import하기 전에 pragma 확인했어야. 그래도 발견 후 fix는 깔끔 (MockUSDC + DeployCTF만 ^0.8.15로, 나머지 contracts는 ^0.8.24 유지). 다음에 다른 third-party 라이브러리 통합 시 pragma 호환성을 첫 검토 항목으로.

### Next Task
- **(선행) 오늘 작성한 CTF 관련 코드 직접 분석** — S2.4 진입 전 검토:
  - `packages/contracts/src/MockUSDC.sol` (80줄) — 6 decimal mock ERC-20, mint open. 왜 OZ ERC20 안 쓰고 자체? (의도: 미니멀, dependency 없음)
  - `packages/contracts/script/DeployCTF.s.sol` (~70줄) — pragma 협상 (`^0.8.15` vs CTFExchange `=0.8.15`), `vm.parseJsonBytes`로 raw bytecode deploy 패턴, `address(0)` factories 의미
  - `packages/contracts/test/CTFCycle.t.sol` (~260줄) — 11 테스트 구조, `_deployCTF` helper, `_balance1155` staticcall 패턴, ContractWithReceiver / ContractWithoutReceiver 헬퍼 contracts. 각 테스트가 §7의 어느 question에 대응하는지 확인. 두 wrong provisional 답변이 어떻게 잡혔는지 코드로 트레이스.
  - `foundry.toml` — `solc` 핀 제거 + `fs_permissions` 추가의 의미.
  - `remappings.txt` — Polymarket의 lib 구조와 우리 매핑 관계.
  - 산출물: 본인 머리 속 mental model (별도 doc 안 만들어도 됨; S2.4 진입 시 자신감으로 드러남).
- **다음 (2026-05-14) — S2.4 시작**: SDK 표면 전환 (`buyYes/buyNo` escrow → `fillOrder/fillOrders` + `signOrder` EIP-712). 결정 사항 다수 — 답변 후 진행:
  1. SDK 함수 명명 (`signOrder` vs `createOrder`+`signOrder`?)
  2. EIP-712 domain 처리 (chain별 cache vs runtime 계산?)
  3. Order struct 직렬화 (Polymarket 타입 그대로 import vs 우리 타입 정의 후 변환?)
  4. 에러 패턴 (custom Error 타입 vs Result<T,E>?)
- **그 후 S2.5**: MM Agent v0 (paper-trading minimum maker). §11.4와 연관 — 봇이 maker로서 양방향 quote 유지하는 최소 strategy.
- **그 후 S2.6**: CLI을 order-based flow로 갱신 (`verex order sign`, `verex order fill`, `verex split`, `verex merge`, `verex redeem` 같은 명령).
- **S2.4-S2.6 완료 후 S2 milestone 통과**: anvil에서 두 사용자 + MM v0가 양방향 호가, 매수자가 fill, 운영자 manual resolve, winner redeem까지 한 사이클 동작.
- **(마무리) `ctf-exchange` 브랜치를 `main`으로 머지** — 선행 조건: ① 위 코드 분석 완료, ② `forge test` 28/28 여전히 pass (regression 없음). PR 또는 직접 fast-forward 머지. 머지 후 브랜치 삭제 또는 보존은 별도 결정 (보존 추천 — S2 작업 단위로 history 추적 가능).

## 2026-05-26 (KST)

### Todo
- [x] `docs/analysis/` 폴더 신설 + `gnosis-ctf-research.md`, `eip-7702-research.md`, `2026-05-08-v1-security-audit.md` 이동 + `docs/plan/README.md` live 링크 갱신
- [x] S2 keystone — CTFExchange `fillOrder` end-to-end Foundry 테스트 (`test/CTFFillOrder.t.sol`, 6 tests, 34/34 전체 통과)
- [x] S2 manual oracle (Stage 1) — `script/DemoMarket.s.sol` (setup + resolve 두 entrypoint)
- [x] history doc §4 "검증 방법 (How to verify)" — Foundry test 경로 + anvil 라이브 7-step (DeployCTF → DemoMarket setup → 5 `cast` sanity check → resolve → 3 payout 확인 + 옵션 redeem)
- [x] plan §1.5 신설 — `S2.x` sub-step 라벨 컨벤션 명문화 (라벨 정의가 history doc에만 흩어져 있던 문제 해결; `grep "S2.5" docs/plan/README.md`으로 찾을 수 있게)
- [ ] (deferred) S2.4 — SDK 표면 전환 (`signOrder` EIP-712 TS 구현 + `fillOrder` helper)
- [ ] (deferred) S2.5 — MM Agent v0 (paper-trading)
- [ ] (deferred) S2.6 — CLI을 order-based flow로 갱신

### Achievement
- **S2 keystone milestone 달성 (CTF order fill end-to-end, Foundry-level)** — `test/CTFFillOrder.t.sol` (6 tests, ~270줄) 가 Polymarket CTFExchange의 `fillOrder` 전체 경로를 검증: EIP-712 maker order 서명 (`exchange.hashOrder()` + `vm.sign`) → operator가 `fillOrder` 호출 → USDC + CT (ERC-1155) 정산 검증. 전체 suite **34/34 pass** (이전 28 + 신규 6). 자세한 내용은 [`2026-05-26-s2-fillorder-e2e.md`](./2026-05-26-s2-fillorder-e2e.md) 참고.
  - happy path: BUY 100 YES @ 0.60 = 60 USDC, full-fill
  - partial fill: 같은 order 두 번에 나눠 fill (30+30)
  - revert paths: bad signature / expired / non-operator
  - gas snapshot: `fillOrder` BUY full-fill = **~110k gas** — MM/SDK capacity planning baseline
- **`script/DemoMarket.s.sol` 추가** — anvil 위 데모 마켓 lifecycle 자동화. `setup()` (prepareCondition + registerToken + addOperator + 인벤토리 prefund) + `resolve(yesPayout, noPayout)` (operator=oracle이 reportPayouts) 두 entrypoint를 `--sig`로 분리 호출. **manual oracle (Stage 1)** 구현 = operator EOA 자신이 oracle 역할 (plan §2.2.7의 3-stage 진행 첫 단계). 컨트랙트 코드 추가 없음 — CTF의 `prepareCondition(oracle, ...)`이 oracle을 임의 EOA로 받기 때문에 script가 곧 구현체.
- **pragma 0.8.15 패턴 검증** — `CTFCycle.t.sol` (^0.8.24, raw bytecode로 CTF deploy)과 별도로 신규 `CTFFillOrder.t.sol`을 ^0.8.15 컴파일 단위로 분리해서 `CTFExchange`를 concretely import. surgical change — 기존 테스트 안 건드림.
- **EIP-712 서명 패턴 발견** — `exchange.hashOrder(order)` public view를 호출해서 digest 받고 `vm.sign`하면 Polymarket pragma/struct가 바뀌어도 테스트 안 깨짐. **단, off-chain SDK (TS)에서는 같은 shortcut 못 씀** — S2.4의 핵심 risk로 history doc 명시.
- **docs 재구성**: `docs/plan/`과 `docs/history/`에 흩어진 분석 문서를 `docs/analysis/` 하나로. `gnosis-ctf-research.md`, `eip-7702-research.md`, `2026-05-08-v1-security-audit.md` 세 개. live 참조 (`docs/plan/README.md` 6곳, `test/CTFCycle.t.sol` 1곳)는 모두 새 경로로 업데이트. `docs/history/history.md`의 stale 링크 1개 (`2026-05-08-v1-security-audit.md` 참조)는 의도적으로 그대로 — 역사 기록은 작성 시점의 상태를 보존.
- **history doc §4 "검증 방법 (How to verify)" 추가** — 사용자가 직접 검증할 수 있는 2-경로 가이드. (A) `forge test` 30초 smoke check, (B) anvil 7-step 라이브 데모 (anvil 띄움 → DeployCTF broadcast → env export → DemoMarket `setup()` → 5개 `cast` sanity check → `resolve(1,0)` → 3개 payout `cast` 확인 + 옵션 step 7 `cast send redeemPositions`로 1000 USDC 회수 검증). §4.3에 **검증 안 되는 것** 명시 (off-chain TS 서명, CLI, MM agent, `matchOrders` 경로) — partial confidence 정직하게 표시.
- **plan §1.5 — Sub-step 라벨 (S2.x 컨벤션) 신설** — 사용자가 "S2.5 어디 정의됨?" 질문 → 라벨이 history doc에만 흩어져 있고 plan에 first-class entity 아니라는 것 발견 → plan에 한 곳에 모음. S2.1~S2.6 매핑 표 + 운영 규칙 (첫 사용 시 정의 / 번호 재사용 금지 / 다른 step도 같은 컨벤션 자유 도입). 이제 `grep "S2.5" docs/plan/README.md`로 찾을 수 있음.

### Post Mortem
- **잘된 점**: 사용자가 "S2 전체를 한 번에 해" 요청에 대해 "S2는 4-6일 작업"이라는 실측에 근거해서 keystone slice (CTFExchange `fillOrder` e2e + manual oracle script) 하나만 surgical하게 닫고 나머지 (SDK / CLI / MM)는 explicit deferral로 history doc에 enumerate. 한 세션에서 거대한 unreviewable diff 생산하지 않음 — coding-principles의 "If you write 200 lines and it could be 50, rewrite it" + "Push back when warranted" 적용. EIP-712 서명을 `exchange.hashOrder()` shortcut으로 풀어서 테스트 견고하게 — Polymarket이 향후 pragma 바꿔도 안 깨짐. `_sign` helper 한 줄짜리 패턴이 6 테스트 모두에 재사용됨.
- **개선점**: `DemoMarket.s.sol`를 컴파일 통과만 확인하고 실제 anvil broadcast 검증은 하지 않음 — 두 단계 dependency (anvil + DeployCTF) 셋업 비용이 컸음. 회귀가 있다면 다음 세션 1순위로 픽스 필요. 또 `matchOrders` 경로는 이 슬라이스에서 다루지 않음 — MM Agent v0가 `fillOrder` model이냐 `matchOrders` model이냐가 S2.5 첫 결정인데, `fillOrder` 한쪽만 테스트 커버리지 있어서 결정 시 reference 부족할 수 있음. S2.5 진입 전에 `matchOrders` 테스트 추가가 prudent.

### Next Task
- **다음 세션 1순위 — S2.4 시작 (SDK 표면 전환)**: TS에서 EIP-712 typed-data 직렬화 + `signOrder` + `fillOrder` helper. 진입 전 결정 항목 4개 (이전 2026-05-13 Next Task에 enumerated): SDK 함수 명명 / EIP-712 domain 처리 / Order struct 직렬화 / 에러 패턴. **추가**: 오늘 history doc §5의 Q-S2.3.1 (hybrid `hashOrder` RPC vs 순수 off-chain EIP-712) — 순수 off-chain 추천.
- **그 후 — `matchOrders` 테스트 추가**: MM Agent v0 (S2.5) 결정 입력으로 필요. MINT (두 BUY 매칭) / MERGE (두 SELL 매칭) / COMPLEMENTARY (BUY vs SELL) 세 분기 모두 커버.
- **S2.5 — MM Agent v0**: 새 패키지 (`packages/mm-agent`?). `fillOrder` (inventory model) vs `matchOrders` (matcher model) 선택. Q-S2.3.2 추천: `matchOrders`.
- **S2.6 — CLI 재작성**: SDK 안정화 후 mechanical wrapper. `verex order sign/fill`, `verex split/merge/redeem`.
- **(검증 항목) `DemoMarket.s.sol` 라이브 anvil 실행** — 이번 세션 deferred. 사용자가 직접 anvil + DeployCTF + DemoMarket setup + resolve 사이클 한 번 돌려보고 회귀 확인.

## 2026-05-27 (KST)

### Todo
- [x] S2.4 — `@verex/sdk` v1(`Market`/`MarketFactory`) 제거 + CTF surface 신규 (`orders` / `conditions` / `ct` / `exchange` / `usdc` / `clients`)
- [x] `sync-abis.mjs` — `CTFExchange` / `IConditionalTokens` / `MockUSDC` 동기화 (`Market` / `MarketFactory` 드롭)
- [x] EIP-712 `hashOrder` parity 검증 — forge로 emit한 golden digest + vitest (3/3 pass)
- [x] `@verex/cli` 재작성 — 10개 CTF 커맨드 (`setup` / `resolve` / `split` / `merge` / `redeem` / `mint` / `order sign|fill` / `balance` / `condition`) + `demo.ts` E2E 재작성
- [x] anvil 위 E2E 데모 통과 (deploy → setup → BUY 서명/체결 → resolve → redeem; alice +40 USDC 수익)
- [x] `forge test` 회귀 확인 (34/34 통과, `EmitOrderHash.s.sol` 추가에도 영향 없음)
- [x] `docs/plan/watch-list.md` 신설 — 외부 트리거 기반 결정 인박스. 항목 1 (Glamsterdam BAL 친화 설계) + 항목 2 (Phase 2 컨트랙트 인터페이스의 Native AA 가정) 등록
- [x] `docs/history/2026-05-27-s2.4-sdk-cli-migration.md` 작성 + 본 README 갱신
- [x] `c97f540` commit + push (origin/ctf-exchange)
- [ ] (내일로 이월) **`ctf-exchange` → `main` 머지**
- [ ] (내일로 이월) S2.5 — MM Agent v0 (paper-trading)
- [ ] (내일로 이월) `@verex/api`의 broken `VerexClient` import 정리
- [ ] (내일로 이월) Q-S2.3.3 (`feeRateBps` 런칭 정책) 결정

### Achievement
- **S2.4 milestone 통과 (SDK + CLI CTF migration)** — v1 escrow API를 SDK·CLI에서 완전 제거하고 Polymarket CTF stack(`MockUSDC` + `ConditionalTokens` + `CTFExchange`) 기반의 새 surface로 교체. 자세한 내용은 [`2026-05-27-s2.4-sdk-cli-migration.md`](./2026-05-27-s2.4-sdk-cli-migration.md) 참고.
  - 신규 SDK 모듈 6개: `orders.ts` (signOrder + hashOrder, 순수 off-chain EIP-712), `conditions.ts` (getConditionId), `ct.ts` (split/merge/redeem/prepareCondition/reportPayouts/balance), `exchange.ts` (fillOrder/registerToken/addOperator/cancelOrder), `usdc.ts` (mint/approve), `clients.ts` (createCTClient/createExchangeClient/createUsdcClient)
  - vitest 도입 + parity test 3/3 통과 — SDK의 `hashOrder(order, domain)`가 forge로 생성한 golden digest `0x68d8d9bd...`와 byte-for-byte 일치
  - CLI 재작성 — `verex setup`/`resolve`/`split`/`merge`/`redeem`/`mint`/`order sign|fill`/`balance`/`condition`. 환경변수 (`USDC_ADDR`/`CTF_ADDR`/`EXCHANGE_ADDR`)를 기본, `--usdc`/`--ctf`/`--exchange` 플래그로 override — `DemoMarket.s.sol` convention과 호환
  - E2E 데모 anvil 검증: alice 100 USDC → BUY @ $0.60 with 60 USDC → 100 YES 보유 → YES resolution → redeem → 최종 140 USDC (+40 수익). on-chain `exchange.hashOrder(order)` cross-check도 통과
- **`docs/plan/watch-list.md` 신설** — "외부 이벤트에 따라 결정할 항목"의 single inbox. 두 항목 등록:
  - #1 **Glamsterdam — BAL 친화 설계**: EIP-7928 (Block-level Access Lists)가 Glamsterdam에 포함되면 CTF hot path(`fillOrder` / `splitPosition` / `mergePositions` / `redeemPositions`) storage 접근 패턴을 BAL-friendly로 재검토. 트리거: Glamsterdam EIP scope 확정 발표
  - #2 **Phase 2 컨트랙트 인터페이스 — Native AA 가정**: 현재 SDK·CLI·MM이 `Order.signatureType = EOA`만 가정. EIP-7702 메인넷 활성 시 additive 진입(EOA path 유지) vs migration(교체) 결정 + Polymarket upstream `SignatureType` enum 확장과의 정합. S7 product story (one-click / auto-claim / gasless onboarding)와 묶여있어 prerequisite로 봐야 함
- **`@verex/api`의 broken `VerexClient` import 발견** — 이번 S2.4와 무관한 stale 코드지만 monorepo 전체 빌드 green 유지를 위해 별도 슬라이스로 픽스 필요 (내일 작업 항목)

### Post Mortem
- **잘된 점**: S2.4의 핵심 risk였던 "off-chain EIP-712 reconstruction이 on-chain `exchange.hashOrder()`와 일치하는지"를 가장 먼저 닫음. forge script(`EmitOrderHash.s.sol`)로 결정적 Order 하나의 digest를 emit → vitest에 golden value로 박음 → SDK의 `hashOrder` 결과와 byte-for-byte 비교. 이 한 줄 테스트가 도메인 reconstruction (name/version/chainId/verifyingContract) + Order 타입 인코딩 (12개 필드 순서 + uint8 enum 처리) 모두를 한 번에 검증. 데모 실행 전에 risk를 닫고 들어갔기 때문에 anvil 데모가 한 번에 통과. 또 사용자 결정 항목(v1 cleanup outright vs deprecated, API shape, 테스트 깊이)을 implementation 시작 전에 AskUserQuestion으로 한꺼번에 surface — 중간 rework 없음.
- **개선점**: 처음에 v1 cleanup 후 `@verex/api`/`@verex/cli` 영향을 *S2.4 진행 중에* 발견 — 사전에 grep으로 확인했어야. 결과적으로 cli 재작성을 S2.4 scope에 inline으로 끌어왔는데, 이건 사용자가 직접 결정한 거라 OK이지만 사전 확인을 했으면 옵션 제시가 더 빨랐을 것. 또 `dist/` 폴더의 v1 잔여 파일(예: `dist/factory.d.ts`)을 한 번 청소 안 하고 넘어갔는데 `pnpm sync-abis`가 자동 재생성하니 다음 빌드에서 깔끔해질 것 — 손으로 청소는 불필요했음을 사후 확인.

### Next Task
- **내일 (2026-05-28) — 첫 작업: `ctf-exchange` → `main` 머지**
  - 선행: ① SDK 빌드 + vitest 통과 (이미 검증, 본인 환경에서 한 번 더), ② `forge test` 34/34 회귀 없음 (이미 검증), ③ E2E 데모가 본인 anvil에서도 통과 (이번 세션 시연 외에 본인 reproduce 권장)
  - 머지 방식: PR (`linked0/verex`) 또는 직접 fast-forward — 어느 쪽이든 머지 후 `ctf-exchange` 브랜치는 history 추적 위해 보존 (삭제 안 함, 2026-05-13 entry의 보존 결정 유지)
  - 머지 후 즉시 `git pull origin main` + S2.5 진입을 같은 브랜치(또는 새 `s2.5-mm-agent` 브랜치)에서 시작
- **그 후 — S2.5 (MM Agent v0)**: 새 패키지 `packages/mm-agent`. 첫 결정은 `fillOrder` (inventory model) vs `matchOrders` (matcher model). [Q-S2.3.2 추천](./2026-05-26-s2-fillorder-e2e.md): `matchOrders` — 운영자 capital lock 없음, audit precedent 더 많음. Paper-trading minimum maker로 시작 (실제 fund 안 묶음).
- **`@verex/api` broken `VerexClient` import 정리** — quick win. 한 줄짜리 placeholder로 교체하거나 SDK의 `createExchangeClient`로 마이그레이션 (둘 중 우선순위는 api가 W2~W5 작업의 다음 입력인지 여부에 달림).
- **Q-S2.3.3 (`feeRateBps` 런칭 정책) 결정** — S2.5 진입 전 1줄 결정. `0`이면 운영자 수익 모델 미정 / `nonzero`면 SDK에 slippage guard 추가 필요. plan에 명시 없음 — 사용자 판단 필요.
- **`docs/plan/watch-list.md` 운영** — 트리거 발생 시(Glamsterdam EIP scope 확정 / Pectra mainnet 활성 등) 본 README의 Next Task로 끌어와서 활성화. 발생 전에는 watch-list에서 잠자게 둠.
- **Verex Phase 1 컨트랙트에 BundlerProvider 인터페이스 분리 미니 PR 검토** — 어제 Deep Dive 후속과 연결. 별도 슬라이스로 분리해서 작은 PR로 처리 (큰 리팩토링과 같이 묶지 않기). 검토 항목은 분리 시점에 본 README 또는 별도 doc에서 enumerate.
