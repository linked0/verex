# Thirdweb — platform option for wallets/AA, backend tx, and contract deploy

**Goal:** reference survey — where the Thirdweb bundle could replace hand-rolled parts of
Verex, and what to verify before adopting any of it.

*Source: daily service note 38/113 (pasted 2026-07-29 KST). Links: https://thirdweb.com ·
https://portal.thirdweb.com. Companion item exists in the Rabbit repo:
`rabbit/docs/features/thirdweb.md`.*

## 1. One-liner

Contracts (audited prebuilts + custom deploy) · SDK (TS/React/Unity/.NET) · wallets
(embedded + ERC-4337 smart accounts) · backend (Engine) · data (Insight) — a full-stack
bundle that wins on breadth and time-to-ship, not per-part depth.

## 2. Verex touchpoints

| Verex track | Thirdweb piece | Note |
|---|---|---|
| [account-abstraction.md](account-abstraction.md) (S7–S8) | Connect: embedded wallets + smart accounts | Could collapse the social-login + AA wallet work into one SDK |
| [onboarding-payments.md](onboarding-payments.md) (S8–S9) | Embedded email/social wallets | Same bundle as above — evaluate together |
| ChainJob worker (api) | Engine: server wallets · nonce mgmt · gas retries · webhooks | Build-vs-buy reference — Engine solves what the worker does by hand |
| Contract deploy flow | `npx thirdweb deploy` browser-signing | Keeps operator keys out of CLI/env — compare with current forge + env-key flow |

## Features
- [ ] **Thirdweb evaluation (exploratory)**
  - [ ] `(you)` **확인사항: Rabbit의 Thirdweb feature 항목도 확인할 것** — `rabbit/docs/features/thirdweb.md` (agentic-AA/AP2/Unity 접점 정리) — 두 저장소의 평가를 합쳐서 한 번에 결정
  - [ ] Compare Engine vs the ChainJob worker on nonce/retry semantics before S4 API work
  - [ ] Check whether Connect smart accounts fit the S7–S8 AA plan or lock us into their bundler/paymaster
