# Markets

**Goal:** create and represent prediction markets on the CTF backbone.

## Status
S2 (current). Backbone deploys on anvil; CTF condition + binary YES/NO tokens work in tests.

## Design
- A market = a Gnosis **condition** (`prepareCondition`) with binary YES/NO outcomes,
  collateralized by **MockUSDC**, traded as ERC-1155 position tokens.
- The operator creates the condition and registers the YES/NO pair on the CTFExchange.

## Open questions
- `questionId` convention (keccak of text vs UMA format) — affects the S6 oracle migration.
- Singleton settlement vs factory-per-market (watch-list #1/#4, BAL).

## Features
- [ ] **Market creation**
  - [ ] `prepareCondition(oracle, questionId, 2)` via SDK/CLI
  - [ ] Register the YES/NO token pair on the exchange
  - [ ] (you) Decide the `questionId` convention
- [ ] **Collateral**
  - [x] MockUSDC mint/approve/split flow on anvil (S2)
