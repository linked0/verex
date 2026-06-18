# Settlement & Redeem

**Goal:** the position lifecycle — split collateral into YES/NO, merge back, redeem winnings after resolution.

## Status
S2.1 ✅ CTF cycle (split / merge / redeem) tested; redeem after a manual resolve works in the demo.

## Design
- `splitPosition` (USDC → YES+NO), `mergePositions` (YES+NO → USDC), `redeemPositions`
  (winning tokens → USDC after `reportPayouts`).

## Open questions
- Auto-claim vs manual redeem (ties into the auto-claim delegate, S7).

## Features
- [ ] **Position ops**
  - [x] split / merge / redeem tested (S2.1)
- [ ] **Claim UX**
  - [x] Manual redeem via SDK/CLI
  - [ ] (you) Auto-claim delegate (S7) — see [account-abstraction.md](account-abstraction.md)
