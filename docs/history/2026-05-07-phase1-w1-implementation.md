# Phase 1 — W1 Implementation (2026-05-07)

> 첫 컨트랙트, SDK, CLI까지 묶어 anvil 위에서 end-to-end loop이 도는 시점의 스냅샷.
> 후속 W2 (MCP server) 진입 전 reference로 두고, 이후 변경은 git 이력에 맡긴다.

---

## 1. 결과 (마일스톤 검증)

| 마일스톤 | 정의 | 상태 |
|---------|------|------|
| **M1 (Day 3)** | `forge test` 100% 통과 (plan 5개 시나리오 포함) | ✅ **17/17 pass** |
| **M2 (Day 7)** | SDK CLI로 anvil 위 create → bet → resolve → claim 시연 | ✅ **demo 완주** (alice +5 ETH 정확) |

**v1 백본 범위**: fixed-price 1:1 escrow (parimutuel), native ETH 콜래터럴, owner manual resolve, 단일 outcome (binary). v2 (Polymarket CTF Exchange)는 Phase 2 W6에 백본 교체 예정 — `docs/plan/README.md` §4.5 참고.

---

## 2. 변경된 파일 목록

| 파일 | 분류 | 줄 수 (대략) |
|------|------|------|
| [`packages/contracts/src/Market.sol`](../../packages/contracts/src/Market.sol) | 컨트랙트 (재작성) | 80 |
| [`packages/contracts/src/MarketFactory.sol`](../../packages/contracts/src/MarketFactory.sol) | 컨트랙트 (신규) | 36 |
| [`packages/contracts/test/Market.t.sol`](../../packages/contracts/test/Market.t.sol) | 테스트 (재작성) | 165 |
| [`packages/contracts/test/MarketFactory.t.sol`](../../packages/contracts/test/MarketFactory.t.sol) | 테스트 (신규) | 75 |
| [`packages/contracts/script/Deploy.s.sol`](../../packages/contracts/script/Deploy.s.sol) | 배포 스크립트 (신규) | 30 |
| [`packages/sdk/scripts/sync-abis.mjs`](../../packages/sdk/scripts/sync-abis.mjs) | 빌드 헬퍼 (신규) | 35 |
| [`packages/sdk/src/factory.ts`](../../packages/sdk/src/factory.ts) | SDK (신규) | 75 |
| [`packages/sdk/src/market.ts`](../../packages/sdk/src/market.ts) | SDK (신규) | 110 |
| [`packages/sdk/src/types.ts`](../../packages/sdk/src/types.ts) | SDK 타입 (재작성) | 28 |
| [`packages/sdk/src/index.ts`](../../packages/sdk/src/index.ts) | SDK barrel (재작성) | 4 |
| [`packages/sdk/src/abis/{Market,MarketFactory,index}.ts`](../../packages/sdk/src/abis/) | **자동 생성** (커밋 안 함 권장) | — |
| [`packages/sdk/package.json`](../../packages/sdk/package.json) | viem 2.21+, prebuild script | — |
| [`packages/sdk/tsconfig.json`](../../packages/sdk/tsconfig.json) | DOM lib + skipLibCheck + resolveJsonModule | — |
| [`packages/cli/`](../../packages/cli/) | **신규 패키지 전체** | — |
| `packages/contracts/lib/forge-std/` | dependency (`forge install`) | — |

**제거됨**:
- `packages/sdk/src/VerexClient.ts` (단일 컨트랙트 가정에 묶여있던 옛 client — factory + market 패턴으로 분리)

---

## 3. 컨트랙트 설계

### 3.1 Market.sol (per-market 컨트랙트)

```
constructor(question, endTime, owner)
  - endTime > block.timestamp 강제
  - owner ≠ address(0) 강제

buyYes() payable / buyNo() payable
  - block.timestamp < endTime 가드
  - msg.value > 0 가드
  - {yes,no}Pool 누적, {yes,no}Shares[user] += msg.value
  - emit Bought(buyer, isYes, amount)

resolve(bool outcome)
  - msg.sender == owner
  - !resolved
  - block.timestamp >= endTime
  - resolved = true; outcome = _outcome
  - emit Resolved(outcome)

claim() returns (uint256 payout)
  - resolved 강제
  - userShares == 0 → return 0 (revert 아님 — 핵심 invariant)
  - payout = (userShares * totalPool) / winningPool  (pro-rata)
  - CEI: shares 먼저 0으로, then call{value: payout}
  - emit Claimed(user, payout)
```

**의도된 단순화**:
- USDC 미사용 — native ETH only (Phase 2 W6에 USDC 전환)
- multi-outcome 미지원 — binary YES/NO only
- 수수료 없음
- 취소 없음 (created → ended → resolved → claimed 단방향)
- emergency withdraw 없음 (잘못 만든 마켓은 그냥 endTime 지나길 기다리고 owner가 한쪽으로 resolve)

### 3.2 MarketFactory.sol

```
constructor(owner)
  - owner ≠ address(0) 강제
  - 이 owner가 모든 spawned Market의 resolver가 됨

createMarket(question, endTime) → market address
  - permissionless (누구나 마켓 생성 가능)
  - new Market(question, endTime, owner)  ← factory.owner를 inject
  - markets.push(address)
  - emit MarketCreated(market, creator, question, endTime)

getMarkets() → address[]
marketCount() → uint256
```

**핵심 디자인 결정**:
- factory.owner = **글로벌 resolver** (단일 사람이 모든 마켓 정산). plan은 owner manual resolve이므로 자연스러움
- createMarket은 **permissionless** — 누구나 질문을 등록할 수 있음. resolve 권한과 분리
- per-market 컨트랙트 — 각 마켓 상태가 격리. v2 CTF로 갈 때 마켓 단위 마이그레이션이 깔끔

### 3.3 이벤트 시그니처

| 이벤트 | 파라미터 | indexed |
|--------|----------|---------|
| `MarketCreated` | `address market, address creator, string question, uint256 endTime` | market, creator |
| `Bought` | `address buyer, bool isYes, uint256 amount` | buyer |
| `Resolved` | `bool outcome` | — |
| `Claimed` | `address user, uint256 amount` | user |

Phase 2 W4~5에서 indexer 짤 때 위 이벤트들을 listen.

---

## 4. 테스트 커버리지

### 4.1 Plan 요구 5개 시나리오 (모두 [`Market.t.sol`](../../packages/contracts/test/Market.t.sol))

1. `test_BothSidesBet_WinnerGetsAllPool` — 양쪽 베팅 후 resolve → winner만 분배
2. `test_RevertWhen_BuyAfterEndTime` — endTime 이후 베팅 실패
3. `test_RevertWhen_DoubleResolve` — 같은 market 중복 resolve 실패
4. `test_LoserClaimReturnsZeroNoRevert` — loser claim 시 0 반환 (revert 아님)
5. `test_Invariant_BalanceEqualsPoolsBeforeResolve` — 총 escrow == YES pool + NO pool (resolve 전)

### 4.2 추가 sanity tests

- `test_MultipleWinners_ProRataDistribution` — winner 여러 명일 때 비례 분배 정확
- `test_RevertWhen_NonOwnerResolves`
- `test_RevertWhen_ResolveBeforeEndTime`
- `test_RevertWhen_ClaimBeforeResolve`
- `test_RevertWhen_ZeroBet`
- `test_DoubleClaimReturnsZeroSecondTime` — 한 번 받은 winner가 다시 claim해도 0 (이중 지급 방지)

### 4.3 MarketFactory 테스트 ([`MarketFactory.t.sol`](../../packages/contracts/test/MarketFactory.t.sol))

- `test_CreateMarket_DeploysAndRegisters` — 배포 후 markets 배열에 등록 + Market.owner == factory.owner
- `test_CreateMarket_PermissionlessCreation` — 누구나 createMarket 호출 가능
- `test_GetMarkets_ReturnsAll`
- `test_RevertWhen_PastEndTime`
- `test_RevertWhen_OwnerZeroOnConstruction`
- `test_MarketCreatedEvent` — `vm.recordLogs` + 토픽 hash 검증

총 **17 tests, 17 pass**.

---

## 5. SDK 구조

### 5.1 ABI sync 파이프라인 (수동 복사 금지 원칙 충족)

```
packages/contracts/out/{Market,MarketFactory}.sol/*.json
                     ↓
        scripts/sync-abis.mjs (forge build 산출물 → TS const)
                     ↓
        packages/sdk/src/abis/{Market,MarketFactory,index}.ts
                     ↓
        packages/sdk/src/{factory,market}.ts (import { MarketAbi } from "./abis")
```

- `pnpm --filter @verex/sdk build` → `prebuild`가 자동으로 `sync-abis` 실행
- 생성된 파일은 `as const` ABI라 viem의 타입 추론에 그대로 들어감
- gitignore 추천: `packages/sdk/src/abis/` (재생성 가능, 커밋하지 않음)

### 5.2 클라이언트 API

```typescript
import {
  createFactoryClient,
  createMarketClient,
  type Address,
  type MarketInfo,
  type PositionInfo,
} from "@verex/sdk";

// 팩토리
const factory = createFactoryClient({
  address: "0x...",
  publicClient,
  walletClient, // optional, write 함수에 필요
});
await factory.getMarkets();           // → Address[]
await factory.getMarketCount();        // → bigint
await factory.createMarket("Q", end);  // → Address (newly deployed)

// 마켓
const market = createMarketClient({ address, publicClient, walletClient });
await market.getInfo();                // → MarketInfo
await market.getPosition(userAddr);    // → PositionInfo
await market.buyYes(parseEther("1"));  // → tx hash
await market.buyNo(parseEther("0.5"));
await market.resolve(true);
await market.claim();
```

**의도**: factory와 market을 별도 클라이언트로 분리 — 호출자가 어느 컨트랙트 단위로 작업하는지 명확.

### 5.3 v1 → v2 호환 의도

SDK 인터페이스를 다음 원칙으로 설계해 v2 (CTF Exchange) 전환 시 변경 표면 최소화:

- `createFactoryClient` / `createMarketClient` 패턴은 유지 (v2엔 `createCtfExchangeClient` 추가)
- `MarketInfo` / `PositionInfo` 타입은 유지하되 v2에 필드 추가 (orderbook depth, mid-price 등)
- `buyYes/buyNo` 의 자리는 v2엔 `fillOrder/fillOrders`로 대체 — **함수 이름이 바뀜** (이건 plan에 명시된 계산된 변경)

---

## 6. CLI 패키지 (신규: `packages/cli/`)

```
packages/cli/
├── package.json              # bin: { "verex": "dist/index.js" }, dep: @verex/sdk + commander
├── tsconfig.json             # ES2022, DOM lib, skipLibCheck
└── src/
    ├── clients.ts            # anvil 10개 default account의 publicClient/walletClient 헬퍼
    ├── index.ts              # commander 기반 CLI 정의 (verex create/list/info/buy/resolve/claim/position)
    └── demo.ts               # end-to-end 자동 시연 (forge script로 deploy → 모든 단계 → balance 검증)
```

### 6.1 CLI 명령

| 명령 | 인자 | 역할 |
|------|------|------|
| `verex create -f <factory> -q <Q> -e <unix-sec> [-a 0]` | factory + question + endTime | 새 마켓 배포 |
| `verex list -f <factory>` | factory | 모든 마켓 + open/resolved 상태 + pool 크기 |
| `verex info -m <market>` | market | full info JSON (bigint → string) |
| `verex buy -m <market> -s yes\|no -v <eth> [-a 1]` | market + side + ETH | 베팅 |
| `verex resolve -m <market> -o yes\|no [-a 0]` | market + outcome | 정산 (owner only) |
| `verex claim -m <market> [-a 1]` | market | 청구 (loser면 no-op) |
| `verex position -m <market> [-a 1]` | market | yesShares / noShares 잔액 |

`-a` 는 anvil default 10 accounts 인덱스 (0=deployer/owner, 1=alice, 2=bob, ...).

### 6.2 demo.ts — one-shot 시연

```
[1] deploying factory via forge script...
    factory=0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
[2] creating market...
    market=0x75537828f2ce51be7289709686A69CbFDbB714F1
[3] alice (account 1) bets 2 ETH on YES...
    bob (account 2) bets 3 ETH on NO...
    pools: yes=2 no=3
[4] advancing anvil time past endTime...
[5] owner (account 0) resolves YES...
    resolved=true outcome=YES
[6] alice claims (winner)... bob claims (loser)...
[7] balance changes (incl. gas):
    alice: +4.99...  ETH (expect ~+5)
    bob:   -0.000033 ETH (expect ~0)
✓ end-to-end demo complete
```

`evm_increaseTime` + `evm_mine` JSON-RPC로 anvil 시간을 endTime 너머로 이동시킨 후 resolve.

---

## 7. 어떻게 테스트하나 (재현 절차)

### 7.1 Foundry 단위 테스트만

```bash
# 도구 (한 번만)
curl -L https://foundry.paradigm.xyz | bash && foundryup
export PATH="$HOME/.foundry/bin:$PATH"
cd packages/contracts && forge install foundry-rs/forge-std

# 매번
cd packages/contracts && forge test
# expect: 17 tests passed
```

### 7.2 End-to-end demo (anvil + SDK + CLI)

```bash
# 의존성 설치 (한 번만)
corepack enable pnpm
pnpm install

# 컨트랙트 빌드 (forge out/*.json 생성 — SDK가 ABI sync에 사용)
cd packages/contracts && forge build

# SDK + CLI 빌드
cd ../.. && pnpm --filter @verex/sdk build
pnpm --filter @verex/cli build

# anvil 띄우고 데모
anvil &
pnpm --filter @verex/cli demo

# 또는 수동 단계별
verex create -f 0xFACTORY -q "Will X happen?" -e 1800000000 -a 0
verex buy -m 0xMARKET -s yes -v 1 -a 1
verex resolve -m 0xMARKET -o yes -a 0
verex claim -m 0xMARKET -a 1

# 정리
pkill anvil
```

### 7.3 환경 변수

| 변수 | 기본값 | 용도 |
|------|--------|------|
| `VEREX_RPC_URL` | `http://127.0.0.1:8545` | CLI가 사용할 anvil RPC |
| `PRIVATE_KEY` | anvil account[0] | `forge script Deploy` 의 broadcaster |
| `FACTORY` | (미설정) | demo.ts 가 deploy 단계 skip하고 재사용할 factory 주소 |

---

## 8. 알려진 한계 (의도된 v1 단순화)

- **Frontend 미연결** — Web MVP는 W3 작업. 현재 UI 통한 시연은 불가, CLI/SDK만.
- **MCP server 없음** — W2 작업.
- **API/indexer/DB 없음** — Phase 2.
- **Markets 페이지네이션 없음** — `getMarkets()`가 전체 배열 반환. 마켓 수가 늘면 indexer 도입까지 비효율적이지만 v1 데모 범위에선 OK.
- **Resolve 후 새 베팅 가드 없음** — `endTime` 가드만 있음. resolve 후엔 어차피 endTime 지난 상태라 `buyYes/buyNo` 가 `block.timestamp < endTime`에서 거부됨. 별도 `resolved` 가드 불필요.
- **`forge build` 안 한 상태에서 SDK build 시 에러** — `sync-abis.mjs`가 `forge out/` 없으면 친절한 에러 메시지 출력. 사용자가 `forge build` 먼저 돌리면 됨. turbo task dep으로 자동화 가능 (W2에서 검토).

---

## 9. 디자인 결정 메모

### 9.1 왜 factory.owner가 모든 market의 owner?

대안: 각 market의 owner = creator (createMarket 호출자).

선택한 이유:
- Phase 1은 단일 운영자 모델 (plan §1.3 "owner manual" resolve)
- 외부 사람이 마켓을 만들어도 정산 권한은 운영자한테 있어야 사기성 마켓 방지
- v2 (CTF + UMA oracle) 전환 시 자연스럽게 owner 모델이 oracle로 대체됨 — 한 곳만 바꾸면 됨

단점: 운영자 키가 단일 실패점. v2 (Phase 2 W6) 에 oracle로 분산.

### 9.2 왜 claim이 revert 안 하고 0 반환?

대안: `require(userShares > 0, "no winnings")`.

선택한 이유:
- UI/SDK가 "내가 winner인지" 미리 판단 안 하고 그냥 호출 가능 → 클라이언트 단순화
- MCP/CLI에서 `verex claim` 을 blind 호출해도 안전
- v2 CTF 의 `redeemPositions` 도 비슷한 비-revert 동작 — v2 전환 시 호출 패턴 동일

단점: 명백한 호출 실수가 silent하게 통과 — 하지만 0 반환은 멱등성 측면에서 더 안전.

### 9.3 왜 별도 SDK 클라이언트 (factory + market)를 분리?

대안: 단일 `VerexClient` 가 factory address 하나로 모든 일.

선택한 이유:
- factory와 market은 다른 컨트랙트 (다른 주소, 다른 ABI). 한 클라이언트로 묶으면 시그니처가 두 단위를 섞게 됨
- factory는 옵셔널 (사용자가 알고 있는 market 주소만 가지고 직접 조회 가능)
- v2 에 `createCtfExchangeClient` 같은 새 클라이언트가 자연스럽게 추가될 자리

### 9.4 왜 CLI 패키지를 새로 만들었나?

대안: SDK 안에 CLI command 포함.

선택한 이유:
- SDK는 라이브러리 — Web/MCP/MM Agent 등 여러 consumer가 import할 표면. CLI 의존성(commander 등)이 SDK에 새는 건 부적절
- CLI는 SDK의 첫 consumer — SDK 표면이 실제로 쓰기에 자연스러운지 immediate feedback
- W2 MCP server도 SDK consumer이 될 것 — 같은 구조

---

## 10. 참고 (plan 정합성 체크)

| Plan 명세 | 실제 구현 | 상태 |
|----------|----------|------|
| `Market.sol`: `buyYes() payable`, `buyNo() payable`, `resolve(bool)` onlyOwner, `claim()` pro-rata | 동일 | ✅ |
| `MarketFactory.sol`: `createMarket(question, endTime)` → Market 배포, `markets()` 조회 | `createMarket`, `getMarkets()`, `marketCount()`, `markets(uint256)` (배열 직접 access) | ✅ |
| 이벤트: `MarketCreated`, `Bought`, `Resolved`, `Claimed` | 동일 (시그니처 §3.3) | ✅ |
| Foundry 5개 테스트 시나리오 | 5개 + sanity 6 + factory 6 | ✅ |
| `script/Deploy.s.sol`: anvil에 factory 배포 | 동일, `PRIVATE_KEY` env 옵션 | ✅ |
| SDK: `createFactoryClient`, `getMarkets`, `getMarket`, `buyYes/buyNo/resolve/claim` | 동일 (factory + market 분리) | ✅ |
| **ABI는 forge build 산출물에서 import (수동 복사 금지)** | `sync-abis.mjs` → `as const` TS 모듈 | ✅ |
| M1 (Day 3): forge test 통과 | 17/17 pass | ✅ |
| M2 (Day 7): SDK CLI로 anvil end-to-end | demo 완주 | ✅ |
