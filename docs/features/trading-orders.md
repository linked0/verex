# Trading & Orders

**Goal:** users buy/sell YES/NO via signed limit orders on the CTFExchange (CLOB model).

## Status
S2.3 ✅ `fillOrder` e2e tested (6 tests); S2.4 ✅ SDK `signOrder`/`hashOrder` (EIP-712, golden-digest parity).

## Design
- Orders are **EIP-712 signed off-chain** (`signOrder`), then filled on-chain via
  `CTFExchange.fillOrder`. The operator (or MM agent) fills user orders.
- BUY/SELL sides; partial fills supported.

## Open questions
- **Q-S2.3.2 — `matchOrders` vs `fillOrder` model** (HIGH; MM capital + audit surface).
- **Q-S2.3.3 — fee policy** (`feeRateBps` 0 vs nonzero).

## Features
- [ ] **Order signing (off-chain)**
  - [x] EIP-712 `signOrder` + `hashOrder` parity (S2.4)
- [ ] **Order fill (on-chain)**
  - [x] `fillOrder` full + partial tested (S2.3)
  - [ ] (you) Decide `matchOrders` vs `fillOrder` before the MM agent
  - [ ] Add `matchOrders` Foundry coverage (MINT / MERGE / COMPLEMENTARY)
- [ ] **Fees**
  - [ ] (you) Decide the fee policy; enforce a slippage guard in the SDK
