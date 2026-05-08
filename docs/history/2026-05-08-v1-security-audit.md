# v1 Security Audit Notes (2026-05-08)

> Phase 1 W1 산출물(컨트랙트 + SDK + CLI)에 대한 **경량 셀프 리뷰**.
> 정식 3rd-party audit 아님 — v1은 testnet/anvil 데모 범위라 그럴 필요 없음.
> v2 (Phase 2 W6 — Polymarket CTF Exchange)로 갈 때 위 컨트랙트는 deprecate되므로,
> 본 문서의 발견은 "v1 운영 중 알아야 할 것" + "v2가 자동 해소하는 것" 두 가지로 분류.

**리뷰 대상**:
- [`packages/contracts/src/Market.sol`](../../packages/contracts/src/Market.sol)
- [`packages/contracts/src/MarketFactory.sol`](../../packages/contracts/src/MarketFactory.sol)
- [`packages/contracts/script/Deploy.s.sol`](../../packages/contracts/script/Deploy.s.sol)
- [`packages/cli/src/clients.ts`](../../packages/cli/src/clients.ts) (off-chain 키 처리)

**리뷰 대상 아님 (no on-chain attack surface)**:
- SDK 클라이언트 (viem 위 thin wrapper, 서명은 walletClient에 위임)
- CLI 명령 (off-chain UX, 보안 가정은 anvil 로컬 dev only)
- 테스트 스위트

## Severity 표기

| 레벨 | 의미 |
|------|------|
| `HIGH` | v1 demo에서도 즉시 fix 필요 |
| `MEDIUM` | v1 운영 중 인지 + 운영 절차로 mitigate |
| `LOW` | 알면 좋고 production 전 fix 필요 |
| `INFO` | 의도된 단순화 / linter 잡음 — 문서화만 |

---

## 1. forge lint 발견

### 1.1 `block.timestamp` 비교 [INFO × 4]

```
warning[block-timestamp]: usage of `block.timestamp` in a comparison may be manipulated by validators
```

**위치**

| 라인 | 코드 | 용도 |
|------|------|------|
| `Market.sol:28` | `require(_endTime > block.timestamp, "endTime must be future")` | 생성자 — 과거 시점 마켓 생성 차단 |
| `Market.sol:36` | `require(block.timestamp < endTime, "market closed")` | `buyYes()` 가드 |
| `Market.sol:44` | `require(block.timestamp < endTime, "market closed")` | `buyNo()` 가드 |
| `Market.sol:54` | `require(block.timestamp >= endTime, "market not ended")` | `resolve()` 가드 |

**의미**

EVM 체인의 validator/proposer가 자기 블록의 `block.timestamp`를 **±12초 (Ethereum 기준)** 정도 임의로 정할 수 있음. 정확히는 직전 블록 timestamp보다 크고, 미래 ~15초 이내라는 합의 룰 안에서 자유. 그래서 시간을 초 단위로 정밀하게 가정하면 안 된다는 일반 가이드.

**v1에서 무시 가능한 이유**

- 우리 `endTime`은 **시간/일/주 단위**로 설정됨 (예: 1시간 = 3600초). 12초 drift는 < 0.4%
- 어떤 공격 시나리오도 12초로 의미 있는 이득 못 냄:
  - 베터가 `endTime` 직후 12초 내에 베팅 끼워넣기? → 운영자 마켓 종료 직후 정보 갱신과 비교해 미미
  - 운영자가 `resolve` 호출을 12초 일찍/늦게? → 결과는 미리 정해진 outcome, 시간 의미 없음
- 모든 `endTime` 가드는 **"열림/닫힘"의 명백한 양분**이지 시계열 트레이딩이 아님

**언제 신경 써야 하나**

- TWAP oracle 직접 구현 (block 단위 가격 평균) — v1 해당 없음
- Same-block arbitrage 방지 — v1 해당 없음
- "이 분(분 단위) 정확히" 결제 — v1 해당 없음

**해소 시점**: v2의 UMA optimistic oracle은 timestamp 의존을 외부 attestation으로 대체 → 이 경고 자체가 사라짐.

**액션**: 없음. linter가 잡음 — 문서로만 인지.

---

## 2. 디자인 footgun / 잠재적 risk

### 2.1 단일 글로벌 owner = SPOF [MEDIUM, v1 한정]

**상황**

`MarketFactory(_owner)`가 spawn하는 모든 Market의 `owner`는 factory의 owner 단일. 즉 어떤 마켓도 그 키 하나로 resolve됨.

**위험**

- 키 유출 시 공격자가 모든 마켓을 자기 유리하게 resolve → 모든 escrow 탈취
- 운영자 키 분실 시 마켓 영원히 unresolved → 모든 자금 영구 동결

**v1 mitigation**

- testnet/anvil only — 실자금 X
- 운영자 키는 hardware wallet 또는 dedicated EOA로 (production demo 시점에 적용)
- factory 1개당 마켓 그룹 하나로 운영 — 키 분리 원할 시 factory 여러 개 deploy

**v2 해소**

CTF Exchange + UMA oracle: `resolve` 권한이 owner → optimistic oracle (분쟁 가능). owner key 분실/유출 영향 거의 없음.

### 2.2 한쪽 풀에 0 베팅 + 그쪽이 winner = 자금 영구 동결 [LOW]

**상황**

```
yesPool = 0
noPool  = 5 ETH
owner.resolve(true) // YES wins
```

`claim()`에서 `userShares = yesShares[user] = 0` 이므로 모두 0 반환. 5 ETH가 컨트랙트에 영구 동결.

**왜 일어나는가**

운영자가 잘못된 결과로 resolve해도 막을 가드 없음 (의도적 — owner는 trusted).

**v1 mitigation**

- 운영자가 양쪽 풀이 모두 > 0인지 확인 후 resolve (수동 절차)
- 한쪽 풀이 0이면 그 outcome으로 resolve하지 말 것 (다른 outcome으로 resolve하면 베터들 모두 winner)
- 정 구현으로 막고 싶으면: `require(winningPool > 0, "no winners")` 추가 — 단 이 경우 양쪽 모두 잘못 베팅한 시나리오에서 resolve 자체 불가 (자금 다른 식으로 동결)

**v2 해소**

CTF Exchange는 conditional token 모델이라 outcome shares가 한쪽으로 다 쏠려도 문제 없음 — 양쪽 token 1:1 collateral 모델이라 같은 시나리오가 발생 안 함.

**액션**: v1 운영 절차에 "resolve 전 양쪽 풀 > 0 확인" 추가 권장. 코드 변경은 안 함 (v1 단순함 우선).

### 2.3 `getMarkets()` 비제한 배열 반환 [LOW]

**상황**

`MarketFactory.getMarkets()`가 `markets` 배열 전체를 반환. 마켓 수가 많아지면 `eth_call` 가스 한도(~50M @ public RPC) 초과 → 호출 실패 (DoS).

**위험**

- 직접 위험 X (조회만 안 됨, 자금 안전)
- UI/SDK가 마켓 리스트 못 가져와서 사용 불능

**v1 mitigation**

- 데모 범위에선 마켓 수 < 100 — 문제 없음
- pagination 함수 추가 가능 (`getMarkets(uint256 offset, uint256 limit)`) — 추후 검토

**v2 해소**

Phase 2 W4~5에 indexer + Postgres 들어옴 → 마켓 리스트는 DB에서 조회. 컨트랙트 직접 호출은 backup만.

### 2.4 CLI에 anvil 기본 키 하드코딩 [INFO]

**위치**: [`packages/cli/src/clients.ts:5-16`](../../packages/cli/src/clients.ts)

10개 anvil 기본 private key가 소스에 박혀있음. 이 키들은 **공개된 anvil 기본값**이라 secret 아님 — anvil 사용자라면 누구나 같은 키 사용. **하지만**:

- 해당 키로 mainnet/testnet에 자금이 있으면 즉시 도난 (이미 알려진 키)
- mainnet RPC URL 실수로 설정 + 키 사용 → 서명한 트랜잭션 broadcast 가능

**v1 mitigation**

CLI 시작 시 chainId 검증 추가 권장:

```typescript
if (chainId !== 31337) throw new Error("CLI는 anvil(chainId 31337)에서만 사용");
```

또는 anvil 키를 env-only로 바꾸고 코드엔 두지 않음.

**액션**: W2/W3 시점에 chainId 가드 추가 (지금은 anvil 전용 demo CLI라 우선순위 낮음).

### 2.5 `Deploy.s.sol`의 `PRIVATE_KEY` env fallback [INFO]

**위치**: [`Deploy.s.sol:18`](../../packages/contracts/script/Deploy.s.sol#L18)

```solidity
uint256 deployerKey = vm.envOr("PRIVATE_KEY", uint256(0xac0974...ff80));
```

`PRIVATE_KEY` env 미설정 시 anvil account[0] 키를 default로 사용. 위 2.4와 같은 위험.

**v1 mitigation**

production deploy 절차에 "PRIVATE_KEY env 반드시 설정" 명시. 또는 fallback 제거하고 env 필수화:

```solidity
uint256 deployerKey = vm.envUint("PRIVATE_KEY");
```

**액션**: testnet 첫 deploy 직전에 fallback 제거.

---

## 3. 검증된 안전 사항 (no findings)

| 항목 | 검증 방식 |
|------|----------|
| **Reentrancy in `claim()`** | CEI 패턴 — shares를 `0`으로 먼저, then `call{value:}`. 재진입해도 `userShares == 0`이라 second iteration에서 즉시 0 반환 |
| **Integer overflow/underflow** | Solidity 0.8.24 default checked arithmetic. unchecked 블록 사용 없음 |
| **ETH 전송 방식** | `.call{value: x}("")` + `require(ok)` — Gnosis Safe 등 contract 수령자도 호환. `.transfer`/`.send` 안 씀 (gas stipend 2300 문제 회피) |
| **Double-claim** | 같은 winner가 두 번 claim해도 두 번째는 0 반환. `test_DoubleClaimReturnsZeroSecondTime`로 검증 |
| **Zero-value 베팅** | `require(msg.value > 0, "zero amount")` |
| **endTime 이전 resolve** | `require(block.timestamp >= endTime, "market not ended")` |
| **Non-owner resolve** | `require(msg.sender == owner, "not owner")` |
| **중복 resolve** | `require(!resolved, "already resolved")` |
| **factory의 `new Market(...)` 재진입** | constructor만 실행, 콜백 surface 없음 |
| **owner zero address** | constructor에서 `require(_owner != address(0))` |
| **endTime past** | constructor에서 `require(_endTime > block.timestamp)` |

위 모두 [`Market.t.sol`](../../packages/contracts/test/Market.t.sol) / [`MarketFactory.t.sol`](../../packages/contracts/test/MarketFactory.t.sol)에 대응 테스트 있음 (총 17/17 pass).

---

## 4. Pro-rata 산술 정밀도 [INFO]

```solidity
payout = (userShares * totalPool) / winningPool;
```

**최대값 분석**

- userShares ≤ winningPool ≤ 2^128 wei (2.7×10^20 ETH — 비현실적 상한)
- totalPool ≤ 2^128 wei
- 곱 = 2^256 — uint256 한계와 정확히 일치

실제로 베팅 규모가 millions of ETH 수준이 아니면 overflow 불가능. v1 demo 범위에선 무관.

**Truncation**

정수 나눗셈이라 마지막 claimer가 wei 단위로 1~N wei 적게 받을 수 있음. 컨트랙트에 wei 잔액 쌓임 (영구 동결 — 회수 함수 없음). v1 demo에선 무시 가능 수준.

**v2 해소**: CTF + ERC-1155 token 회계는 다른 방식이라 truncation 양상 다름.

---

## 5. v2 handoff 매핑

| v1 사항 | v2 (CTF Exchange + UMA + USDC)에서 |
|---------|-------------------------------------|
| 1.1 `block.timestamp` 4 warning | 사라짐 — UMA가 외부 attestation으로 시간 의존 대체 |
| 2.1 단일 owner SPOF | 사라짐 — UMA optimistic oracle, 분쟁 가능 |
| 2.2 한쪽 0 풀 lock | 사라짐 — CTF의 conditional token 모델은 collateral split 1:1, 같은 corner case 없음 |
| 2.3 `getMarkets()` DoS | 완화 — indexer + DB가 1차 데이터 소스 |
| 2.4 CLI 하드코딩 키 | 그대로 — testnet 도구라 v2와 무관 |
| 2.5 `PRIVATE_KEY` fallback | testnet 전 fallback 제거 (v1/v2 공통) |
| §4 Pro-rata truncation | 사라짐 — CTF 회계 모델 다름 |

즉 **v1 footgun의 70%는 v2 도입 자체가 자동 해소**. 따라서 v1 컨트랙트를 더 hardening할 가치는 낮음 — Phase 2 W6 일정에 집중하는 게 ROI 높음.

---

## 6. Out of scope (이번 리뷰 미포함)

- **MEV / front-running**: parimutuel 구조엔 매수 우선순위 의미 없음 (정해진 가격). v2에선 CLOB이라 별도 분석 필요.
- **gas optimization**: storage layout, event optimization 등 — v1 데모 범위 무관.
- **formal verification**: Certora/SMTChecker 등 — v1 범위 초과.
- **frontend security**: web wallet 통합 / phishing 표면 / signature replay — Phase 1 W3 진입 시 별도 audit.
- **third-party dependencies**: forge-std, viem 자체의 보안성 — 둘 다 광범위하게 검증된 라이브러리, 신뢰.

---

## 7. 결론

| 항목 | 상태 |
|------|------|
| **HIGH 발견** | 0 |
| **MEDIUM 발견** | 1 (단일 owner SPOF — v2가 자동 해소) |
| **LOW 발견** | 2 (한쪽 0 풀 lock, getMarkets DoS) |
| **INFO** | 4 + 2 (block.timestamp ×4, 키 하드코딩, env fallback) |
| **권장 즉시 조치** | 없음 (v1 demo 범위 내) |
| **production 전 조치** | `PRIVATE_KEY` fallback 제거, CLI chainId 가드 추가, 운영 절차에 "양쪽 풀 > 0 확인" 추가 |

v1은 "풀스택 한 바퀴 검증" 목적의 demo 백본이라 위 정도 risk는 명시적으로 수용. v2 (Phase 2 W6) 통합 시 본 발견의 대부분이 자동 해소되므로, v1 자체 hardening보다 v2 일정 진행이 우선.

---

## 부록: 다시 검증하는 방법

```bash
export PATH="$HOME/.foundry/bin:$PATH"
cd packages/contracts

# 빌드 + lint warnings 보기
forge clean && forge build 2>&1 | grep -B1 -A4 'warning\['

# 모든 테스트
forge test -vv

# 특정 보안 관점 테스트
forge test --match-test 'test_Revert|test_DoubleClaim|test_LoserClaim' -vv
```
