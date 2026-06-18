# MM Agent (Market Maker)

**Goal:** an automated maker that keeps two-sided quotes so liquidity is never the blocker (§6.2).

## Status
Not started (S2.5). Blocked on the order-model decision + `matchOrders` test coverage.

## Design
- A worker (poll → quote → submit) using `@verex/sdk` only (no direct contract calls).
- **v0:** paper-trading minimum maker, constant-probability quotes. **v1 (S6):** real capital +
  risk limits + circuit breaker. Modules: runner / strategy / inventory / risk / config.

## Open questions
- **Q-S2.3.2 — `matchOrders` vs `fillOrder`** (paper recommends `matchOrders`).

## Features
- [ ] **MM v0 (paper, S2.5)**
  - [ ] (you) Decide the order model (`matchOrders` vs `fillOrder`)
  - [ ] Two-sided constant-probability quotes; no real capital locked
- [ ] **MM v1 (live, S6)**
  - [ ] Real capital, risk limits, circuit breaker
  - [ ] paper → live cutover checklist
