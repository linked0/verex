# Account Abstraction (gasless, one-click)

**Goal:** button-press betting with no gas worries — the core UX goal (§6.2).

## Status
Not started (S7–S8). Owes ADR `docs/architecture/0002-aa-strategy.md`.

## Design
- **Strategy decision (B2):** ERC-4337 vs EIP-7702 vs hybrid → blocks everything below.
- **One-click betting** — `approve` + `fillOrder` in one signature; session-key authority model.
- **Auto-claim delegate (B6)** — minimal delegate allowing ONLY `redeemPositions`; a scheduler auto-claims.
- **Paymaster gasless onboarding (B4/B7)** — sponsor a new wallet's first N=5 txns; spend tracker.

## Open questions
- **B2 — AA strategy (4337 / 7702 / hybrid)** — highest-priority decision; input in `docs/analysis/eip-7702-research.md`.
- Paymaster spend counter: off-chain DB vs on-chain mapping.

## Features
- [ ] **AA strategy (S7)**
  - [ ] (you) Decide 4337 / 7702 / hybrid → ADR 0002
  - [ ] Session-key authority model PoC
- [ ] **One-click betting (S7)**
  - [ ] approve + fill in one signature
- [ ] **Auto-claim delegate (S7, B6, audit-grade)**
  - [ ] Delegate contract (only `redeemPositions`) + backend scheduler
- [ ] **Gasless onboarding (S8, B4/B7)**
  - [ ] Paymaster sponsors the first N txns; spend tracker; halt at N+1
