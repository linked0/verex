# S2 Implementation (S2.1 + S2.2) + Oracle Progression Refinement (2026-05-13)

> 오늘 작업의 reference 스냅샷. 내일 S2.4 (SDK 전환) 진입 시 어떤 상태에서 출발하는지 파악하기 위함.

---

## 1. 결과 요약

| 작업 | 상태 |
|------|------|
| S2.1 milestone (Foundry CTF cycle 테스트) | ✅ 통과 (11/11, 전체 28/28) |
| S2.1 — §7 open questions Q1-Q4 + Q6 + Q8 + Q9 답변 확인 | ✅ 측정/테스트로 confirmed |
| S2.1 — Q7 (Auto-claim delegate scope) | ⏳ S7로 deferred |
| S2.2 setup — DeployCTF.s.sol 동작 | ✅ anvil 배포 검증 완료 |
| Plan §1.4 / §2.2.7 / §4 — Oracle 3-stage progression 명시 | ✅ 갱신 |
| English 학습 형식을 영구 메모리화 | ✅ 글로벌 + 프로젝트 두 곳에 저장 |

---

## 2. S2.1 — Foundry CTF cycle 테스트 상세

### 2.1 통합 전략

원래 plan은 Gnosis CTF를 직접 vendor하려 했으나, **Polymarket의 `ctf-exchange` 저장소 자체가 동일 문제를 이미 우아하게 해결**했음을 발견:

- Gnosis CTF 소스는 Solidity 0.5.x — 우리 0.8 환경과 컴파일러 충돌
- Polymarket의 해법: CTF 소스는 0.5.x로 별도 컴파일 → 결과 바이트코드를 `artifacts/ConditionalTokens.json`에 저장 → 0.8 테스트에서 raw bytecode를 `CREATE`로 배포
- 우리는 그 패턴을 그대로 차용 — `forge install Polymarket/ctf-exchange`로 submodule 추가, `vm.parseJsonBytes(...)`로 바이트코드 읽어 deploy

**결과**: 0.5/0.8 컴파일러 호환성 이슈 zero. CTFExchange 통합도 같은 submodule에서 옴 (소스로 컴파일).

### 2.2 테스트 구조

`packages/contracts/test/CTFCycle.t.sol` (260+ 줄, 11 tests):

| 테스트 | 답변하는 §7 question | 결과 |
|--------|--------------------|------|
| `test_FullCycle_YesWinsAndPaysFullCollateral` | (sanity) | ✅ |
| `test_LoserRedeemReturnsZero` | Q1 | ✅ revert 없이 0 반환 확인 |
| `test_SplitAfterResolveAllowed` | Q2 | ✅ resolve 후 split 가능 (의미 없지만 허용) |
| `test_SplitFromContractWithReceiver_Succeeds` | Q3 | ✅ 컨트랙트 caller의 receiver hook 발화 |
| `test_SplitFromContractWithoutReceiver_Reverts` | Q8 | ✅ receiver 미구현 시 revert (ERC-1155 spec) |
| `test_GasSnapshot_Split` | Q4 | ✅ 151k gas (EOA) |
| `test_GasSnapshot_Merge` | Q4 | ✅ 191k gas |
| `test_GasSnapshot_Redeem_BothIndexSets` | Q4 + Q9 | ✅ 240k gas |
| `test_GasSnapshot_Redeem_OnlyWinner` | Q4 + Q9 | ✅ 230k gas |
| `test_PrepareCondition_DoubleCallReverts` | Q6 | ✅ revert string `"condition already prepared"` 캡처 |
| `test_RedeemCombinedVsSeparate_Gas` | Q9 | ✅ combined 54k vs separate sum 82k (33% 차이) |

### 2.3 Provisional 답변 두 개가 틀렸음 (테스트 발견)

이게 "provisional answer + 테스트" 패턴의 진짜 가치를 입증한 모멘트:

**Wrong 1**: Position ID를 직접 keccak으로 계산
```solidity
// WRONG — naive keccak
bytes32 collId = keccak256(abi.encodePacked(parentCollectionId, conditionId, indexSet));
uint256 posId = uint256(keccak256(abi.encodePacked(collateral, collId)));
```
실제로 CTHelpers는 EC arithmetic을 씀 (nested condition 위해). 결과: 내가 계산한 positionId와 CTF가 mint하는 token ID가 일치하지 않아 `_balance1155`가 0 반환. 테스트 실패.

**수정**: CTF의 자체 helper 사용
```solidity
bytes32 collId = ctf.getCollectionId(parentCollectionId, conditionId, indexSet);
uint256 posId = ctf.getPositionId(IERC20(address(usdc)), collId);
```

**Wrong 2**: Stray `IERC20.balanceOf(address)` 호출
```solidity
// WRONG — CTF는 ERC-1155, ERC-20 single-arg balanceOf 없음
assertEq(IERC20(address(ctf)).balanceOf(alice), 0, ...);
```
이전 작성 시 잘못 남긴 라인. CTF에 해당 메서드 없어서 EVM revert. 테스트 실패.

**수정**: 그 줄 제거. ERC-1155 balance는 별도 헬퍼 `_balance1155(holder, tokenId)`로 staticcall.

### 2.4 가스 측정 함의 (중요)

| 작업 | EOA caller | Contract caller (with hook) | 비교 |
|------|-----------|---------------------------|------|
| `splitPosition` | 151k gas | 496k gas | hook 시 +345k |
| `mergePositions` | 191k gas | (측정 안 함, hook fire 안 함) | — |
| `redeemPositions([1,2])` | 240k gas | — | 양쪽 다 burn |
| `redeemPositions([1])` only winner | 230k gas | — | 한쪽만 burn |

**MM Agent 디자인 시사점**:
1. 컨트랙트 계열 (MM Agent v1, AA wallet) 이 split을 호출하면 비용 ~3.3배 — pre-mint 후 transfer가 훨씬 저렴
2. SDK `claim()` 래퍼는 사용자가 양쪽 다 가지고 있으면 combined `redeem([1,2])`를 default로 (separate보다 33% 저렴)

---

## 3. S2.2 — DeployCTF.s.sol 상세

### 3.1 무엇을 배포

- **MockUSDC** (`packages/contracts/src/MockUSDC.sol`) — 6 decimals, open mint, 80줄 minimal ERC-20
- **ConditionalTokens** — Polymarket의 pre-built artifact에서 raw bytecode로 deploy (`vm.parseJsonBytes`)
- **CTFExchange** — Polymarket 소스에서 컴파일 (`new CTFExchange(usdc, ctf, address(0), address(0))`). proxy/safe factories는 0으로 (계정 추상화 path 비활성화 — S7에 다시 활성화)

### 3.2 Anvil 검증 결과

```
=== v2 (CTF) backbone deployed ===
Deployer:          0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
MockUSDC:          0x5FbDB2315678afecb367f032d93F642f64180aa3
ConditionalTokens: 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
CTFExchange:       0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
ONCHAIN EXECUTION COMPLETE & SUCCESSFUL.
```

(Anvil 기본 deterministic 주소 — 같은 anvil 인스턴스에서 redeploy 시 동일 주소.)

### 3.3 Pragma 협상

문제: CTFExchange.sol은 `pragma solidity 0.8.15` (정확 버전 핀). 우리 컨트랙트는 `^0.8.24`. 한 컴파일 단위에서 둘 다 충족할 단일 solc 버전 없음.

해법:
- `MockUSDC.sol`과 `script/DeployCTF.s.sol`을 `^0.8.15`로 (CTFExchange와 같은 컴파일 단위 공유)
- `Market.sol`, `MarketFactory.sol` (S1 scaffold)는 `^0.8.24` 유지 — DeployCTF에서 import 안 하므로 별도 컴파일 단위
- `foundry.toml`에서 `solc = "0.8.24"` 핀 제거 → foundry가 파일별로 자동 선택
- `fs_permissions`에 `lib/ctf-exchange/artifacts` read 추가 (artifact JSON 읽기용)

---

## 4. Oracle 3-stage progression

### 4.1 변경 동기

이전 §1.4 S6 row는 Chainlink와 UMA를 단일 항목 *"Chainlink price feed 자동 resolve + UMA optimistic oracle 통합"* 으로 lump했음. 사용자 명시 요청: **manual → Chainlink → UMA** 순서로 분명히 하라.

### 4.2 변경된 섹션

| 섹션 | 변경 |
|------|------|
| **§1.4 S2 row** | "Manual oracle (Stage 1 of 3)" 명시적 deliverable + milestone 추가. operator EOA가 `prepareCondition` + `reportPayouts` 직접 호출 |
| **§1.4 S6 row** | 단일 "Chainlink + UMA" deliverable → 두 개로 분리: "Chainlink adapter (Stage 2)" + "UMA adapter (Stage 3)". Milestone 둘로 분리 (각 stage로 resolve된 마켓 한 개 이상) |
| **§2.2.7 Oracle** | 한 줄 "Chainlink Price Feed" → 3-stage 표 (Manual / Chainlink / UMA) + 각 stage의 사용 케이스 + 한계 + 채택 순서 이유 |
| **§4 Phase 2 요약** | "Oracle — Chainlink + UMA" → "Oracle — 3-stage progression (manual S2 → Chainlink S6 → UMA S6 후반)" |

### 4.3 핵심 디자인 결정: stage 사이 마이그레이션 불가

`conditionId = keccak256(oracleAddress, questionId, outcomeSlotCount)` — **oracle 주소가 다르면 conditionId가 다름**. 즉 stage 1에 manual oracle로 만든 마켓을 stage 2의 Chainlink adapter로 옮길 수 없음 (다른 conditionId, 다른 ERC-1155 토큰 ID).

**해석**: 이건 결함이 아니라 디자인 의도. 마켓은 짧은 수명 (며칠~몇 주), stage 도입 시 이미 있던 마켓은 자기 stage로 끝까지 운영하고, 새 마켓이 새 stage 사용. 마이그레이션 비용 zero.

### 4.4 채택 순서가 manual → Chainlink → UMA인 이유

신뢰 가정의 점진적 분산:
- **Manual** = 운영자 단일 신뢰. 가장 빠른 출시. 운영자가 SPOF (§11.3 A5).
- **Chainlink** = 분산 oracle 네트워크지만 데이터 종류 제한 (가격, 외부 인덱스). 주관적 질문 불가.
- **UMA** = 임의 명제 + 분쟁 가능 + 사람 attestation. 가장 강한 보증, 가장 큰 시스템 복잡도 (분쟁 윈도우, escalation 비용).

순서를 뒤집으면 (UMA부터 도입) 시스템이 너무 무거워서 S2의 핵심 가치 (빠른 통합 + 풀스택 한 바퀴 검증)를 놓침.

---

## 5. (메타) English 학습 형식 영구 메모리화

이번 세션의 답변 형식 (English check + bilingual + Today's phrases + brief eval)을 두 곳에 저장:

| 파일 | 범위 | 내용 |
|------|------|------|
| `~/.claude/projects/-Users-jay-work/memory/feedback_english_learning_format.md` | Project — `/Users/jay/work` 전체 | ~80줄 spec (구조 템플릿, 규칙, 예외, 사용자 반복 패턴) |
| `~/.claude/CLAUDE.md` | Global — 머신 모든 Claude Code 세션 | ~50줄 leaner 버전, project memory 가리킴 |

미래 모든 Claude Code 세션에서 자동 로드. "evaluate my English" 다시 요청할 필요 없음. 두 파일 sync 유지 책임 명시 (한쪽 갱신 시 다른 쪽 mirror).

캡처된 사용자 반복 패턴 (eval에서 자주 짚는 것들):
1. **고유명사 대문자** (English, Chainlink, TypeScript, UMA, Polymarket)
2. **리스트 연결** — `X and Y and the Z` 대신 `X, Y, and Z`
3. (이번 turn에 추가됨) ***"also"* 어순** — 짧은 문장에서 끝이 아닌 주어/조동사 바로 뒤

---

## 6. 브랜치 상태 (verex)

```
ctf-exchange branch (origin과 비교):
  fdeece7 plan: oracle progression — manual (S2) → Chainlink (S6) → UMA (S6 후반)
  6d8d920 S2.1 milestone: CTFCycle Foundry test (28/28 pass) + S2.2 deploy script
  d0add3a plan/gnosis-ctf-research §7: provisional answers Q1-Q5, unify into one list
─────── (이번 commit) ───────
  + 2026-05-13 history.md entry
  + 2026-05-13-s2-implementation-and-oracle-progression.md (이 파일)
```

**Not pushed yet** — 사용자가 push 명령 시 `git push origin ctf-exchange`.

---

## 7. 내일 (2026-05-14) — S2.4 진입

### 7.1 작업 범위

S2.4 = SDK 표면 전환. 기존 `@verex/sdk`의 escrow API (`buyYes` / `buyNo` / `resolve` / `claim`)를 CLOB API (`fillOrder` / `fillOrders` + `signOrder` EIP-712)로 전환.

### 7.2 결정 사항 (사용자 입력 필요)

S2.4는 mechanical 작업이 아니라 디자인 작업이라 시작 전 사용자 입력 필요:

1. **함수 명명 패턴**: `signOrder` 단독 vs `createOrder` + `signOrder` 분리?
2. **EIP-712 domain 처리**: chain별 cache (한 번 계산 후 메모이즈) vs runtime 계산?
3. **Order struct 직렬화**: Polymarket의 타입 그대로 import vs 우리 타입 정의 후 변환?
4. **에러 패턴**: custom Error 타입 (TypeScript class) vs Result<T,E> 패턴?

각 결정이 SDK 사용자 코드 모양에 영향을 줌.

### 7.3 S2.4 산출물

- `packages/sdk/src/order.ts` — order struct 타입 + signing 헬퍼
- `packages/sdk/src/exchange.ts` — `createExchangeClient(...)` 가 `fillOrder`, `fillOrders`, `getOrderbook` 등 wrap
- `packages/sdk/scripts/sync-abis.mjs` 갱신 — Polymarket의 CTFExchange ABI도 sync
- 기존 `@verex/sdk`의 `factory.ts` / `market.ts` (S1 의 v1 escrow API)는 deprecated mark + history note에서 유지

### 7.4 S2.5 / S2.6 (S2.4 이후)

- **S2.5**: MM Agent v0 (paper-trading minimum maker). 봇이 어느 알고리즘으로 양방향 quote를 유지하는지 — strategy 결정 필요 (constant probability? mid + 스프레드? Bayesian update?)
- **S2.6**: CLI을 order-based flow로 갱신 — `verex order sign`, `verex order fill`, `verex split`, `verex merge`, `verex redeem` 같은 명령 디자인

### 7.5 S2 완료 기준

S2.4 + S2.5 + S2.6 완료 시:
- anvil에 두 사용자 + MM v0가 양방향 호가 유지
- 매수자가 fillOrder로 실제 체결
- 운영자가 manual oracle로 resolve
- Winner가 redeem해서 USDC 회수

이게 S3 (Web MVP) 진입 조건.
