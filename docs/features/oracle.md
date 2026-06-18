# Oracle (Resolution)

**Goal:** resolve markets and set payouts, via a 3-stage trust progression.

## Status
Stage 1 (manual) ✅ — `DemoMarket.s.sol` operator `reportPayouts`. Stages 2–3 planned (S6).

## Design (3 stages)
1. **Manual** (S2) — operator EOA calls `reportPayouts`. All markets, before adapters exist.
2. **Chainlink** (S6) — `ChainlinkOracleAdapter.sol` auto-resolves numeric markets ("ETH > $4000 by X").
3. **UMA** (S6) — `UMAOptimisticOracleAdapter.sol` for subjective/event markets ("Did Brazil win?").

## Open questions
- Operator role: single EOA vs multisig (Q-S2.3.4).
- `questionId` format alignment with UMA (see [markets.md](markets.md)).

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
