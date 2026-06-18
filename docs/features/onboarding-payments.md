# Onboarding & Payments

**Goal:** get users in easily — fiat on-ramp and cross-chain participation.

## Status
Not started (S8–S9).

## Design
- **Stripe (S9):** Stripe checkout → backend → mock USDC minted to the user.
- **Cross-chain (S8):** CCIP or LayerZero so users on other chains can participate.
- (Gasless onboarding lives in [account-abstraction.md](account-abstraction.md).)

## Open questions
- CCIP vs LayerZero.
- Stripe test mode only, or real?

## Features
- [ ] **Stripe fiat → USDC (S9)**
  - [ ] Stripe checkout → backend → mock USDC mint
  - [ ] Deploy API + MM agent to Cloud Run; GitHub Actions CI/CD
- [ ] **Cross-chain (S8)**
  - [ ] (you) Choose CCIP vs LayerZero
  - [ ] Cross-chain participation path
