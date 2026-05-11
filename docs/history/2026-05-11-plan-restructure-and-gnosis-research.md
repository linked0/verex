# Plan Restructure (S2 = CTF) + Gnosis CTF Research Note (2026-05-11)

> 오늘 작업 두 갈래의 스냅샷. 내일 S2.1 milestone (Foundry CTF cycle 테스트) 진입 시 reference로 둠.
> 이번 commit 이전 대비 변경: `docs/plan/README.md` 재구성 + `docs/plan/gnosis-ctf-research.md` 신규.

---

## 1. 결정 + 그 이유 — 한눈에

| 결정 | 이전 plan | 새 plan | 트리거 |
|------|----------|---------|-------|
| **CTF 시점** | Phase 2 W6에 v2 백본으로 통합 | **S2부터 메인 백본** (W1 parimutuel은 1주짜리 scaffold로 격하) | 운영자 prior CTF Exchange 경험 — v1 단계의 학습 가치가 예상보다 작음 |
| **시간 단위** | "주" (Week, W1..W10) | **Step (S1..S10) + 예상 시간 컬럼 (1~5일/step)** | AI assistance 하에 W1이 1일 만에 끝남. "주" 단위가 misleading |
| **Plan README 종속 섹션** | v1/v2 분리 가정에 맞춰져 있음 | 모두 Step + CTF-from-S2 어조로 재작성 | 위 두 결정의 자연스러운 파급 |

운영자 prior 경험 → CTF 첫 적용 학습비용이 예상보다 낮음 → v1 (parimutuel)을 한 주짜리 scaffold pass로 두고 그 이후 전부 v2로 가는 게 plan 원칙 ("단순하게 시작 / 작게 만들기 / 빠르게 검증") 과 호환되면서 일정도 가속.

## 2. `docs/plan/README.md` — 섹션별 변경

| 섹션 | 변경 내용 |
|------|----------|
| **§1.3 범위 제외** | "v1 escrow를 한 phase로" 다루던 표현 제거. W1 fixed-price scaffold를 `planning` history로만 보존, 메인 백본은 S2부터 [Polymarket CTF Exchange](https://github.com/Polymarket/ctf-exchange)로 명시. |
| **§1.4 단계별 일정 (10 steps)** | 전체 표 재작성. CTF가 S2; UMA + MM v1이 S6; MCP scaffolding이 S3 (Web MVP와 함께). 모든 bullet GFM `- [x]` / `- [ ]` checkbox로. W1→S1, W2→S2 등 Step 명명. **새 컬럼 "예상 시간 (AI 포함)"** 1~5일 range. 합산 ~25–35일 집중 작업 (캘린더 6–8주). 해석 가이드도 캘린더 시간 → 집중 작업 일수로 재정의. |
| **§2.2.1 Smart Contracts** | 기존 `MarketFactory/Market/Resolver/Vault` 단순 리스트 폐기. 실제 S2 스택으로: Polymarket CTF Exchange + Gnosis CTF (ERC-1155) + USDC + UMA. 핵심 함수 리스트가 CLOB primitive로 (`fillOrder`, `signOrder`, `splitPosition`, `mergePositions`, `redeemPositions`, `reportPayouts`). W1 parimutuel scaffold 노트 짧게. |
| **§2.2.6 Frontend** | "v1 단계엔 placeholder data" 표현 제거. 새 표현: "W3부터 실데이터" — S2의 CTF 백본이 이미 동작 중이라 호가창/시계열/다해상도 차트가 모두 실데이터로. 차용 범위 (layout/density/카드 구조만 영감, 브랜드 identity는 자체) 노트 유지. |
| **§4 Phase 1/2/3** | Phase 1 (S1~3) bullet 명시적 — S1 (scaffold) / S2 (CTF) / S3 (Web + MCP). Phase 2 — UMA at S6, MM v1 here. Phase 3 — MM v1 제거 (Phase 2로 이동). 모든 "Week" → "Step" 헤딩 변경. |
| **§4.5** | 비교 표 + 3개 설명 블록 → 단일 historical note로 축약. 2026-05-11 W6→S2 transition 결정 배경. **"무엇이 W1에서 S2로 carry over하나"** — SDK 패턴 (factory + market client), ABI sync 파이프라인, CLI 구조, Foundry 테스트 패턴. W1 코드 자체와 v1 audit는 별도 history doc에서 추적. |
| **§11.2** | sub-list 두 개 → 4줄 pointer로 축약. "now implementation track, not planning." 결정 사항들은 S2 작업으로 자연 해소. |
| **§11.3 audit 표** | A3 (resolve 전 양쪽 풀 > 0 운영 절차) / A4 (`getMarkets()` pagination) 둘 다 strikethrough + **OBSOLETE (v1 parimutuel-only)** 표시. A5 (단일 owner SPOF)는 W6 → S6 재타이밍 (실제론 같은 시점). 원칙 줄 재작성. |

§11.4 (EIP-7702)는 변경 없음 — 여전히 S7 트리거.

## 3. `docs/plan/gnosis-ctf-research.md` — 신규

S2.1 reading note. ~280줄, 9 섹션:

| § | 내용 |
|---|------|
| 1 | **Mental model** — CTF가 무엇을 / 무엇을 안 하는가, trust boundary |
| 2 | **5 핵심 함수** — `prepareCondition` / `splitPosition` / `mergePositions` / `reportPayouts` / `redeemPositions`. 시그니처, effect, event, gotcha |
| 3 | **Position ID 유도** — keccak256 chain (collateral → collectionId → positionId), "indexSet"이 비트맵인 이유, 헬퍼 함수 |
| 4 | **Events 표** — S5 indexer 준비용 |
| 5 | **Polymarket Exchange가 CTF를 어떻게 사용하는지** — `parentCollectionId = bytes32(0)`, `partition = [1, 2]`, USDC 컨벤션 |
| 6 | **CTF vs Polymarket Exchange 경계** — 누가 무엇을 소유 |
| 7 | **Open questions** — Foundry 테스트로 검증할 5가지 (loser redeem, post-resolve split, 재진입 표면, 가스, questionId 컨벤션) |
| 8 | **S2.2~S2.6 매핑** — 각 step이 CTF의 어느 부분을 건드리나 |
| 9 | **추천 reading order** — 첫 CTF implementer가 ~2–3시간에 따라갈 순서 |

**소스 cross-reference**:
- [Gnosis ConditionalTokens.sol (287줄)](https://github.com/gnosis/conditional-tokens-contracts/blob/master/contracts/ConditionalTokens.sol)
- [Gnosis CTHelpers.sol — position ID 수학](https://github.com/gnosis/conditional-tokens-contracts/blob/master/contracts/CTHelpers.sol)
- [Polymarket의 IConditionalTokens.sol — 92줄로 압축된 인터페이스](https://github.com/Polymarket/ctf-exchange/blob/main/src/exchange/interfaces/IConditionalTokens.sol)
- [Polymarket의 AssetOperations.sol — 실제 사용 패턴](https://github.com/Polymarket/ctf-exchange/blob/main/src/exchange/mixins/AssetOperations.sol)

## 4. Q&A 세션 — 부수적으로 다룬 개념들

오늘 사용자가 reading note 읽으면서 던진 명확화 질문들. 일부는 research note에 보충 예정, 일부는 별도 문서로 갈 가능성:

| 질문 | 답변 요지 |
|------|----------|
| `prepareCondition`의 "Idempotent? No" 의미 | Idempotent = "여러 번 호출해도 한 번 호출과 같은 효과". CTF의 prepareCondition은 두 번째 호출 시 revert. SDK가 이걸 catch하고 idempotent 인터페이스로 wrap해야 retry-안전. |
| Multi-outcome 마켓 (예: World Cup 우승자) 가능한가? | CTF는 native 지원 (outcomeSlotCount up to 256), 그러나 Polymarket Exchange는 binary로 hard-wired. Polymarket 방식: N개 binary 마켓 + UI 그룹화. 합 100% 안 되는 문제는 NegRisk Adapter (별도 layer 컨트랙트)가 arb cheap하게 만들어 시장이 self-correct. |
| Event에 대응하는 컨트랙트 객체? | **없음.** "event"는 UI/DB 메타데이터. 컨트랙트는 conditionId만 안다. S4 (API) / S5 (indexer) 작업 시 우리 DB에 events 테이블 추가 필요 (외래키로 markets 묶음). |
| `parentCollectionId`의 의미 | conditional positions 기능을 위해 존재 (예: "민주당 우승 시 침체"). 하지만 liquidity fragmentation + UX 복잡도로 production에선 모두 `bytes32(0)`로 hard-code. 우리도 채택 → 그 기능 사실상 사용 안 함. |
| `mergePositions` vs `redeemPositions`의 차이 | 둘 다 outcome 토큰 burn → collateral 회수. 차이: merge = resolution 전, 완전 세트 필요, 1:1 비율. redeem = resolution 후, 부분 redeem 가능, payout 비례. Polymarket Exchange가 거래 중 merge 자주 사용; 사용자는 redeem만 호출. |
| "position", "indexSet", "partition", "collection" 정확한 의미 | position = 보유 outcome 토큰. indexSet = outcome 슬롯 비트맵 (binary면 [1=YES, 2=NO]). partition = split할 때 indexSet 배열. collection = condition 안의 outcome 그룹 (binary면 YES collection, NO collection). |
| NegRisk Adapter를 발명하는 mental process는? | 6 move: ① 사용자 고통과 함께 머물기 ② 수학 invariant로 번역 ③ 막힌 arbitrage 인식 ④ 빠진 primitive (inverse / dual) 찾기 ⑤ layer 안 modify ⑥ market dynamics가 invariant 강제하도록 신뢰. 자세한 mindset/지식/프로세스 가이드는 별도 답변에. |
| 사고를 수학적으로 (논문처럼) 만들어야 하나? | 정밀이 의미 있는 순간에만 (보통 "항상", "never", "for all" 같은 표현 만났을 때). Default는 평이 언어 + 구체적 예시. 좋은 DeFi whitepaper도 직관 → 표기 → 예시 순서. |

위 Q&A 인사이트 중 일부 (특히 Q4 parentCollectionId, Q6 용어 정의, Q7 NegRisk mental process)는 다음 작업에서 research note에 반영하거나 별도 doc으로 분리 가능.

## 5. 브랜치 / 커밋 상태

- **현재 브랜치**: `ctf-exchange` (오늘 main에서 분기 생성)
- **이번 commit**: 위 변경 + 이 history 항목 + detail doc
- **이전 미커밋 항목**: `docs/plan/eip-7702-research.md` (어제부터 미커밋이었음, 이번 commit에 포함)
- **Push**: 안 함 (사용자 미요청)

## 6. 내일 (2026-05-12) 진입 예정

S2.1 milestone artifact를 닫는 일 — Foundry 테스트:

```solidity
// packages/contracts/test/CTFCycle.t.sol — 신규
contract CTFCycleTest is Test {
    function setUp() public {
        // deploy ConditionalTokens (vendor as submodule from gnosis repo)
        // deploy mock USDC
        // prepareCondition for "Will Brazil win?"
    }

    function test_FullCycle_YesWins() public {
        // 1. splitPosition(USDC, 100) → caller gets 100 YES + 100 NO
        // 2. (skip exchange — direct CTF only)
        // 3. reportPayouts([1, 0]) → YES wins
        // 4. redeemPositions([1])  → 100 USDC back
        // 5. redeemPositions([2])  → 0 USDC (loser, no revert)
        // 6. assert balances at each step
    }

    function test_MergeBeforeResolve() public {
        // verify merge gives back collateral 1:1
    }

    // ... open questions §7 verification
}
```

후속:
- S2.1 milestone 통과 → S2.2 (Polymarket CTF Exchange import) 진입
- 운영자 prior nostra-contracts 작업이 같은 패턴 한 번 한 경험이라 시간 단축 기대 — 단 nostra와의 차이 (수정점, 채택 안 한 컨벤션)는 별도로 정리 필요

## 7. 재현 / 검증 절차 (오늘 작업 한정)

```bash
# 브랜치 확인
git checkout ctf-exchange
git log --oneline -1   # → 이번 commit

# Plan 변경이 일관되는지 시각적 확인
grep -n 'W[0-9]' docs/plan/README.md   # → 결과 0건 (모두 S#로 변환됨)
grep -n '주차\|10주\|Week' docs/plan/README.md  # → 결과 0건

# Research note 확인
wc -l docs/plan/gnosis-ctf-research.md  # → ~280줄
```

코드 변경은 0줄 — 이번 commit은 plan + 문서만.
