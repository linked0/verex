# Oracle (Resolution)

**Goal:** resolve markets and set payouts, via a 3-stage trust progression.

## Status
Stage 1 (manual) ✅ — `DemoMarket.s.sol` operator `reportPayouts`. Stages 2–3 planned (S6).

## Design (3 stages)
1. **Manual** (S2) — operator EOA calls `reportPayouts`. All markets, before adapters exist.
2. **Chainlink** (S6) — `ChainlinkOracleAdapter.sol` auto-resolves numeric markets ("ETH > $4000 by X").
3. **UMA** (S6) — `UMAOptimisticOracleAdapter.sol` for subjective/event markets ("Did Brazil win?").

## MEV-resistant settlement (design note)
slow-oracle 정산은 **"릴레이어가 언제·무엇을 제출하는가"가 곧 MEV 표면**이다. 설계 선택지:

- **(a) commit-reveal** — 정산 입력 제출을 commit-reveal로 받아 제출 시점의 선행거래(프런트런)를 차단.
- **(b) RANDAO (+필요 시 VDF)** — 정산 *시드/순서*를 사후 결정해 "어느 거래가 정산 직전인지"를 예측 불가능하게.
- **(c) 경로무관 멱등 claim** — 대량 claim은 `(market, slot, nullifier)`만 검증.

이 조합이 (어제 딥다이브의) **storage-proof 입력 검증**과 만나면, *"무엇을(storage proof) + 언제/어떤 순서로(randomness)"* 둘 다 **신뢰 최소화된 정산**이 된다.

## Open questions
- Operator role: single EOA vs multisig (Q-S2.3.4).
- `questionId` format alignment with UMA (see [markets.md](markets.md)).
- MEV-resistant settlement: at which stage to introduce commit-reveal + RANDAO/VDF ordering + idempotent claims (see the design note above).

## Features
- [ ] **Manual oracle (Stage 1)**
  - [x] operator `reportPayouts` (S2)
  - [ ] Broadcast-test `DemoMarket.s.sol` on anvil
- [ ] **Chainlink adapter (Stage 2, S6)**
  - [ ] `ChainlinkOracleAdapter.sol` reads the feed → `reportPayouts` after endTime
- [ ] **UMA adapter (Stage 3, S6)**
  - [ ] `UMAOptimisticOracleAdapter.sol` via `OptimisticOracleV2.requestPrice`
- [ ] **Operator role**
  - [ ] (you) EOA vs multisig before testnet
- [ ] **MEV-resistant settlement** (design)
  - [ ] (you) Decide commit-reveal vs RANDAO/VDF ordering + idempotent `(market, slot, nullifier)` claims, combined with storage-proof input verification
