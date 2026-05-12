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
