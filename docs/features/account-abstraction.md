# Account Abstraction (gasless, one-click)

**Goal:** button-press betting with no gas worries — the core UX goal (§6.2).

## Status
Not started (S7–S8). Owes ADR `docs/architecture/0002-aa-strategy.md`.

## Design
- **Strategy decision (B2):** ERC-4337 vs EIP-7702 vs hybrid → blocks everything below.
- **Modular account standard (B8, sub-decision of B2):** if 4337 (or hybrid), which module standard the smart account follows — ERC-6900 vs ERC-7579. Leaning **7579** (Nexus / Kernel v3): the winning standard for new projects, richest off-the-shelf module ecosystem (session-key validators, spend limits), and Verex only needs "swap validator + session keys", not 6900's permission graph. Bundler/paymaster infra (Alchemy Rundler + Gas Manager) is an independent layer and works with either — lock-in layer (account) follows the winning standard, swappable layer (bundler/paymaster) stays with the incumbent vendor. Input: `docs/analysis/erc-6900-vs-7579-research.md`.
- **One-click betting** — `approve` + `fillOrder` in one signature; session-key authority model.
- **Auto-claim delegate (B6)** — minimal delegate allowing ONLY `redeemPositions`; a scheduler auto-claims.
- **Paymaster gasless onboarding (B4/B7)** — sponsor a new wallet's first N=5 txns; spend tracker.

## Open questions
- **B2 — AA strategy (4337 / 7702 / hybrid)** — highest-priority decision; input in `docs/analysis/eip-7702-research.md`.
- **B8 — 7579 account pick (Nexus vs Kernel v3)** — only if B2 lands on 4337/hybrid; compare session-key validator maturity, audit status, tooling.
- Paymaster spend counter: off-chain DB vs on-chain mapping.

## Features
- [ ] **AA strategy (S7)**
  - [ ] (you) Decide 4337 / 7702 / hybrid → ADR 0002
  - [ ] Session-key authority model PoC
- [ ] **Modular account standard (S7, B8)**
  - [ ] (you) Confirm 7579 over 6900 → fold into ADR 0002
  - [ ] Pick 7579 account: Nexus vs Kernel v3 (session-key validator maturity, audits)
  - [ ] Session-key module PoC on the chosen account ("1h small-bet on this market, no per-tx signature")
  - [ ] Verify chosen account works with Alchemy Rundler + Gas Manager (independent layers — sanity check only)
- [ ] **One-click betting (S7)**
  - [ ] approve + fill in one signature
- [ ] **Auto-claim delegate (S7, B6, audit-grade)**
  - [ ] Delegate contract (only `redeemPositions`) + backend scheduler
- [ ] **Gasless onboarding (S8, B4/B7)**
  - [ ] Paymaster sponsors the first N txns; spend tracker; halt at N+1
