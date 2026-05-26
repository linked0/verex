# S2 — CTF Exchange `fillOrder` end-to-end (2026-05-26)

> S2 keystone milestone. Foundry-level proof that the Polymarket CTFExchange
> orderbook works end-to-end on our anvil-shaped stack — sign EIP-712 order
> off-chain (here: via `vm.sign`), operator fills, USDC + CT move correctly.

---

## 1. 결과 요약

| 작업 | 상태 |
|------|------|
| `test/CTFFillOrder.t.sol` (6 tests) | ✅ 6/6 pass; 전체 suite 34/34 |
| EIP-712 maker order 서명 → operator fillOrder → asset 검증 | ✅ |
| Partial fill (한 order 두 번에 나눠 fill) | ✅ |
| Revert paths: bad signature / expired / non-operator | ✅ |
| `fillOrder` BUY full-fill gas snapshot | ✅ ~110k (사용된 gas, setup 제외) |
| `script/DemoMarket.s.sol` — anvil 데모 마켓 lifecycle (setup + resolve) | ✅ 컴파일 통과 (라이브 anvil 실행은 사용자 검증 대상) |
| Manual oracle (Stage 1) flow | ✅ `DemoMarket.resolve(yesPayout, noPayout)`로 캡슐화 |

S2 milestone 진행:
- ✅ CTF mint → split → merge → redeem cycle (S2.1, 이전)
- ✅ **CTF order fill end-to-end (Foundry-level)** (오늘)
- ⏳ MM v0 maintains two-sided quotes (S2.5 — 미착수)
- ⏳ Manual operator resolves market, winner redeems on live anvil (스크립트는 있으나 사용자가 anvil에서 직접 실행해서 닫을 항목)

---

## 2. `test/CTFFillOrder.t.sol` 상세

### 2.1 왜 별도 테스트 파일

`CTFCycle.t.sol`은 `pragma ^0.8.24`로 살고 (CTF는 raw bytecode로 deploy해서
0.8 호환 가능), Exchange는 `pragma 0.8.15` strict 픽. CTFExchange를 concretely
import하려면 한 컴파일 단위 안에 0.8.15로 들어와야 함. 그래서 신규 파일을
`pragma ^0.8.15`로. 기존 `CTFCycle.t.sol` 건드리지 않음 (surgical change).

### 2.2 6 테스트 구조

| # | 테스트 | 무엇을 증명 |
|---|--------|------------|
| 1 | `test_FillOrder_Buy_FullFill` | maker가 60 USDC 보내고 100 YES 받음; operator는 100 YES 차감 + 60 USDC 입금; operator NO 잔고 변동 없음 (BUY side만 움직임) |
| 2 | `test_FillOrder_Buy_PartialFill` | 같은 order를 30+30으로 두 번 fill; nonce 1개로 부분 체결 두 번 동작; 두 번째 fill 후 maker가 100 YES 완전 보유 |
| 3 | `test_FillOrder_RevertsOnBadSignature` | `order.signer ≠ ECDSA.recover(...)`이면 revert (`InvalidSignature`) |
| 4 | `test_FillOrder_RevertsOnExpired` | `expiration > 0 && expiration < block.timestamp`이면 revert (`OrderExpired`) |
| 5 | `test_FillOrder_RevertsForNonOperator` | `onlyOperator` modifier 동작 검증; operator role 부여 안 된 EOA가 호출 시 revert |
| 6 | `test_GasSnapshot_FillOrder_Buy` | cold full-fill = **~110k gas**. MM/SDK capacity planning baseline |

### 2.3 핵심 setUp 패턴 (재사용 가능)

1. `MockUSDC` + `ConditionalTokens` (raw bytecode) + `CTFExchange` (소스 컴파일) deploy
2. binary YES/NO `prepareCondition` + `getCollectionId` / `getPositionId`로 position IDs 유도 (CTHelpers EC arithmetic 직접 안 함 — S2.1에서 학습한 lesson)
3. **`exchange.registerToken(yesId, noId, conditionId)`** — Exchange의 token registry 등록 안 하면 `fillOrder`가 `InvalidTokenId`로 revert
4. **`exchange.addOperator(operator)`** — `onlyOperator` modifier 통과용
5. operator 인벤토리 prefund: 1000 USDC → split → 1000 YES + 1000 NO; operator가 `setApprovalForAll(exchange, true)` (ERC-1155은 raw call로 — `IConditionalTokens` 인터페이스가 ERC-1155 surface를 노출하지 않음)

### 2.4 `_sign` helper — 가장 깨끗한 EIP-712 패턴

```solidity
function _sign(Order memory order) internal {
    bytes32 digest = exchange.hashOrder(order);     // on-chain view
    (uint8 v, bytes32 r, bytes32 s) = vm.sign(makerPk, digest);
    order.signature = abi.encodePacked(r, s, v);
}
```

EIP-712 domain separator + struct hash를 off-contract에서 재구성하는 대신
`exchange.hashOrder(...)` public view를 호출. Polymarket이 향후 pragma /
struct definition 바꿔도 테스트는 깨지지 않음. **단, off-chain SDK (TS)에서는
같은 트릭이 안 통하므로** EIP-712 typed-data를 직접 만들어야 함 — 이게 S2.4
SDK 작업의 핵심 risk.

### 2.5 발견 사항

- **`_deriveAssetIds` 규칙**: BUY는 `(makerAssetId=0, takerAssetId=tokenId)` — 0이 collateral (USDC) ID. SELL은 반대. SDK가 `Side` enum + tokenId만 받아서 두 asset id를 자동 derive해야 사용자 실수 안 일어남.
- **`fillOrder` 정산 흐름**: `_fillOrder(order, fillAmount, to=msg.sender)`. msg.sender (operator) takerAsset을 maker에게 보내고, maker는 makerAsset을 to(operator)에게 보냄. **fee는 taker asset에서 차감** (BUY 시 maker가 받는 CT에서 차감 → maker가 명목 takerAmount보다 적게 받음).
- **`matchOrders` vs `fillOrder` 갈림**: `fillOrder`는 operator가 inventory를 holding하는 형태 (이번 테스트). `matchOrders`는 operator가 두 maker (또는 maker+taker)를 매칭하고 자기는 inventory 안 들고 fee만 챙김. MM Agent v0가 어느 쪽 model을 쓸지가 S2.5 핵심 결정 항목.

---

## 3. `script/DemoMarket.s.sol` 상세

### 3.1 두 entrypoint

```bash
# 1. 마켓 셋업 (한 번만)
forge script script/DemoMarket.s.sol --sig "setup()" \
  --rpc-url http://localhost:8545 \
  --private-key 0xac09... --broadcast

# 2. 마켓 해결 (YES 승)
forge script script/DemoMarket.s.sol \
  --sig "resolve(uint256,uint256)" 1 0 \
  --rpc-url http://localhost:8545 \
  --private-key 0xac09... --broadcast
```

필요 env: `USDC_ADDR`, `CTF_ADDR`, `EXCHANGE_ADDR` (DeployCTF 출력에서 가져옴).
`QUESTION_ID`는 optional — 기본값으로 fixed keccak 사용해서 setup/resolve가
같은 condition에 합의.

### 3.2 Manual oracle (Stage 1) 정의

Stage 1 oracle은 **operator EOA 자신**. 같은 키가 `prepareCondition(operator, ...)`
호출하고 나중에 `reportPayouts(...)` 호출. plan §2.2.7 / §4의 3-stage 진행:

- Stage 1 (지금, S2) — operator EOA = oracle. 신뢰 모델: 단일 운영자.
- Stage 2 (S6) — `ChainlinkOracleAdapter` 컨트랙트가 oracle 역할. 숫자 마켓 ("ETH > $4000")용.
- Stage 3 (S6) — `UMAOptimisticOracleAdapter`가 oracle. 주관적 이벤트 마켓용.

Stage 1 컨트랙트 코드는 별도 없음 — CTF의 `prepareCondition(oracle, ...)`이
oracle을 임의 EOA로 받기 때문에 운영자가 그냥 자기 키로 보내면 됨. 그래서
`DemoMarket.s.sol` script가 곧 "manual oracle 구현체".

### 3.3 라이브 anvil 미실행

스크립트는 컴파일 OK (forge build 통과). 실제 anvil 위 end-to-end 실행은
하지 않음 — 두 단계 dependency (anvil 띄우고 DeployCTF 먼저 broadcast)가
필요하고, 사용자가 직접 검증할 수 있게 남겨둠. 만약 anvil 위 실행에서
회귀가 나오면 후속 세션에서 픽스 1순위.

---

## 4. 검증 방법 (How to verify)

이번 라운드 산출물을 직접 검증하는 두 경로. (A)는 30초, (B)는 anvil 띄우는
시간 포함 ~2분.

### 4.1 (A) Foundry 테스트 — 가장 빠른 신뢰 확보

작업 디렉터리: `packages/contracts/`

```bash
cd /Users/jay/work/verex/packages/contracts

# 신규 테스트만 (-vv로 gas snapshot log 보기)
forge test --match-contract CTFFillOrderTest -vv

# 전체 회귀 확인
forge test
```

**기대 출력**:

- `CTFFillOrderTest`: 6 passed, 0 failed
  - `test_FillOrder_Buy_FullFill`
  - `test_FillOrder_Buy_PartialFill`
  - `test_FillOrder_RevertsOnBadSignature`
  - `test_FillOrder_RevertsOnExpired`
  - `test_FillOrder_RevertsForNonOperator`
  - `test_GasSnapshot_FillOrder_Buy` — log line `fillOrder BUY full-fill gas: ~110000` (±수천 정도 normal)
- 전체 suite: **34 passed, 0 failed, 0 skipped** (S1 17 + CTFCycle 11 + CTFFillOrder 6)

회귀가 나오면: 첫째로 `forge clean && forge build`로 stale artifact 의심 제거.
그래도 실패하면 fail한 테스트 이름 + revert 메시지로 issue 좁히기.

---

### 4.2 (B) anvil 위 라이브 데모 — `DemoMarket.s.sol` 검증

전체 flow: anvil 띄움 → `DeployCTF`로 backbone 배포 → `DemoMarket setup()`로
마켓 셋업 → `cast`로 상태 sanity check → `DemoMarket resolve(1,0)`로 YES 승
해결 → 다시 `cast`로 payout 확인.

#### Step 1 — 새 터미널에서 anvil 띄우기

```bash
anvil
```

기본 RPC `http://127.0.0.1:8545`, 10개 prefunded 계정. 첫 계정 키
(`0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`)가
deployer + operator + oracle 역할 통합 (Stage 1).

#### Step 2 — backbone 배포

```bash
cd /Users/jay/work/verex/packages/contracts

forge script script/DeployCTF.s.sol \
  --rpc-url http://localhost:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  --broadcast
```

**기대 출력 (마지막 부분)**:

```
=== v2 (CTF) backbone deployed ===
Deployer:          0xf39Fd6...
MockUSDC:          0x5FbDB23156...
ConditionalTokens: 0xe7f1725E77...
CTFExchange:       0x9fE4673667...
```

세 주소를 캡처해서 env로 export (다음 step의 script가 읽음):

```bash
export USDC_ADDR=0x5FbDB23156...
export CTF_ADDR=0xe7f1725E77...
export EXCHANGE_ADDR=0x9fE4673667...
export RPC=http://localhost:8545
export KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
export DEPLOYER=$(cast wallet address $KEY)
```

> 주의: anvil은 결정론적이라 같은 deployer 키로 같은 nonce 순서이면 매번
> **같은 주소들**이 나옴. 한 번 export하면 anvil 재시작 후에도 그대로 재사용
> 가능 (deployer가 처음부터 다시 0번 nonce로 시작하는 한).

#### Step 3 — 데모 마켓 셋업

```bash
forge script script/DemoMarket.s.sol --sig "setup()" \
  --rpc-url $RPC --private-key $KEY --broadcast
```

**기대 출력 (마지막 부분)**:

```
=== Demo market ready ===
Operator/Oracle:  0xf39Fd6...
questionId:       0x... (32 bytes)
conditionId:      0x... (32 bytes)
YES position id:  <large uint>
NO position id:   <large uint>
```

`questionId` / `conditionId` / position id들을 캡처:

```bash
export QID=0x...           # questionId 출력값
export CID=0x...           # conditionId 출력값
export YES_ID=...          # YES position id
export NO_ID=...           # NO position id
```

#### Step 4 — `cast`로 sanity check

setup이 제대로 됐는지 5개 sanity check:

```bash
# (a) Exchange가 deployer를 admin으로 인식?
cast call $EXCHANGE_ADDR "isAdmin(address)(bool)" $DEPLOYER --rpc-url $RPC
# 기대: true

# (b) operator role 부여됐는지?
cast call $EXCHANGE_ADDR "isOperator(address)(bool)" $DEPLOYER --rpc-url $RPC
# 기대: true

# (c) YES 토큰이 registry에 등록됐는지? (등록됐으면 conditionId 반환)
cast call $EXCHANGE_ADDR "getConditionId(uint256)(bytes32)" $YES_ID --rpc-url $RPC
# 기대: $CID 와 동일

# (d) operator가 CT 인벤토리 가지고 있는지? (1000e6 = 1_000_000_000)
cast call $CTF_ADDR "balanceOf(address,uint256)(uint256)" $DEPLOYER $YES_ID --rpc-url $RPC
# 기대: 1000000000  (== 1000 YES, 6 decimal)

# (e) operator가 exchange에 ERC-1155 approval했는지?
cast call $CTF_ADDR "isApprovedForAll(address,address)(bool)" $DEPLOYER $EXCHANGE_ADDR --rpc-url $RPC
# 기대: true
```

5개 모두 통과해야 setup OK.

#### Step 5 — 마켓 resolve (YES 승)

```bash
forge script script/DemoMarket.s.sol \
  --sig "resolve(uint256,uint256)" 1 0 \
  --rpc-url $RPC --private-key $KEY --broadcast
```

**기대 출력**: `Reported payouts: YES= 1 NO= 0`

#### Step 6 — resolve 확인

```bash
# (a) payout numerator: YES (인덱스 0)
cast call $CTF_ADDR "payoutNumerators(bytes32,uint256)(uint256)" $CID 0 --rpc-url $RPC
# 기대: 1

# (b) payout numerator: NO (인덱스 1)
cast call $CTF_ADDR "payoutNumerators(bytes32,uint256)(uint256)" $CID 1 --rpc-url $RPC
# 기대: 0

# (c) payout denominator (resolve 끝났으면 nonzero)
cast call $CTF_ADDR "payoutDenominator(bytes32)(uint256)" $CID --rpc-url $RPC
# 기대: 1
```

세 값이 (1, 0, 1)이면 manual oracle (Stage 1) 정상 동작.

#### Step 7 — (옵션) winner redeem 확인

operator는 1000 YES + 1000 NO를 들고 있음. YES가 winner이므로
redeem하면 1000 USDC 회수 가능:

```bash
# 현재 USDC 잔고 (split하면서 0이 되어 있을 것)
cast call $USDC_ADDR "balanceOf(address)(uint256)" $DEPLOYER --rpc-url $RPC
# 기대: 0

# redeemPositions 호출 — winner indexSet=1 (YES), 합쳐서 [1,2] 둘 다 보내도 무방 (loser는 0 반환)
cast send $CTF_ADDR "redeemPositions(address,bytes32,bytes32,uint256[])" \
  $USDC_ADDR 0x0000000000000000000000000000000000000000000000000000000000000000 $CID "[1,2]" \
  --rpc-url $RPC --private-key $KEY

# USDC 잔고 다시 확인
cast call $USDC_ADDR "balanceOf(address)(uint256)" $DEPLOYER --rpc-url $RPC
# 기대: 1000000000  (1000 USDC 회수)
```

회수 잔고가 1000000000 (= 1000 USDC, 6 decimal)이면 **manual oracle Stage 1
전체 사이클 통과** — `prepareCondition → split (인벤토리) → reportPayouts →
redeemPositions`가 anvil에서 end-to-end 동작 확인.

---

### 4.3 무엇이 검증 안 됨

이 두 경로로 검증되는 것:
- ✅ EIP-712 서명 + Exchange 정산 (A)
- ✅ Exchange registry / operator 역할 (A + B)
- ✅ manual oracle (Stage 1) prepareCondition / reportPayouts (B)
- ✅ winner redeem (B step 7)

검증 안 되는 것 (이 슬라이스의 deferred 항목들 — §5 참고):
- ❌ off-chain TS SDK가 같은 EIP-712 서명을 만들 수 있는지 — S2.4에서
- ❌ CLI이 `verex order fill` 같은 명령으로 fill 트리거할 수 있는지 — S2.6에서
- ❌ MM Agent가 양방향 quote을 유지하는지 — S2.5에서
- ❌ `matchOrders` (MINT / MERGE / COMPLEMENTARY) 경로 — `matchOrders` 테스트 추가가 prerequisite (S2.5 진입 전)

---

## 5. 명시적으로 deferred한 것 (다음 슬라이스)

이번 세션에서 **하지 않은** S2 항목 — 다음 세션 1순위:

1. **SDK 표면 전환** (S2.4) — TS에서 EIP-712 typed-data 직렬화 + `signOrder` + `fillOrder` helper + 기존 `buyYes/buyNo` 제거. 결정 항목 다수 (이전 2026-05-13 Next Task에 4개 enumerated). off-contract EIP-712 구현이 이 슬라이스의 핵심 risk — 테스트가 `exchange.hashOrder()` shortcut을 썼는데 SDK는 그 shortcut 못 씀.
2. **MM Agent v0** (S2.5) — 새 패키지 (`packages/mm-agent`?). paper-trading minimum maker. `matchOrders` vs `fillOrder` model 선택부터.
3. **CLI 재작성** (S2.6) — `verex order sign`, `verex order fill`, `verex split`, `verex merge`, `verex redeem`. SDK가 안정화된 후 mechanical wrapper.
4. **추가 테스트 커버리지** — `matchOrders` flow (MINT / MERGE 분기), fee != 0 정산, SELL order 정산 path, 동일 nonce 재사용 방지.

---

## 6. Open Questions (SDK/MM 설계 결정 입력)

이번 작업 중 표면화된 질문들 — S2.4/S2.5 진입 전 답변 필요:

- **Q-S2.3.1**: SDK가 `exchange.hashOrder()` 호출해서 digest를 얻고 그걸로 서명하는 hybrid 패턴 vs 순수 off-chain EIP-712 재구성. Hybrid는 RPC 한 번 더 들고 cache 무효화 복잡. 순수는 domain separator 한 번만 받아오면 되지만 구현 risk 큼. **추천: 순수 off-chain** — Polymarket의 ClientSDK가 이미 같은 패턴 검증함, 참조 가능.
- **Q-S2.3.2**: MM Agent를 `fillOrder` (inventory model) vs `matchOrders` (matcher model)로? `matchOrders`는 운영자 capital lock 없이 양쪽 maker만 모으면 됨. `fillOrder`는 단순하나 운영자가 inventory risk 짊어짐. **추천: `matchOrders`** — Polymarket 자체 운영 모델, audit precedent 더 많음.
- **Q-S2.3.3**: `feeRateBps`를 v2 출시 시 0으로 갈지 nonzero로 갈지. 0이면 운영자 수익 모델 없음 (다른 곳 — listing fee, premium tier — 으로 봐야). nonzero면 SDK가 사용자에게 fee 명시 + 슬리피지 가드 필요. plan에 명시 없음 — 별도 결정 필요.
- **Q-S2.3.4**: operator role 운영 — 단일 EOA (지금) vs multisig? S7 AA 이전까지는 단일 EOA로도 OK이나, 운영자 키 유출 시 모든 마켓 trading halt 위험. plan에 멘션 없음 — S6 (production-grade infra)에서 다뤄야.

---

## 7. 다음 세션 시작 시 권장 reading order

1. 이 doc (5분) — 무엇을 했고 무엇이 남았는지
2. `test/CTFFillOrder.t.sol` (10분) — 6 테스트 + setUp + `_sign` 패턴
3. `script/DemoMarket.s.sol` (5분) — 라이브 데모 실행 명령 + manual oracle 구현
4. plan §1.4 S2 row + §11.x — 다음 슬라이스 (S2.4 SDK)의 결정 항목 컨텍스트
5. (옵션) Polymarket ClientSDK 저장소 — EIP-712 typed-data 재구성 reference

---

## 8. 변경 파일

- `packages/contracts/test/CTFFillOrder.t.sol` (신규, ~270줄)
- `packages/contracts/script/DemoMarket.s.sol` (신규, ~140줄)

이전 docs 정리도 같은 세션에서 진행:
- `docs/analysis/` 신규 폴더 — `gnosis-ctf-research.md`, `eip-7702-research.md`, `2026-05-08-v1-security-audit.md` 이동 (live 참조는 `docs/plan/README.md` + `test/CTFCycle.t.sol`에서 업데이트; `docs/history/history.md`의 stale 링크는 의도적으로 그대로 — 역사 기록 보존)
