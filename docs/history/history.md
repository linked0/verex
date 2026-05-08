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
