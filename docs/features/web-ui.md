# Web UI

**Goal:** a Polymarket-style frontend to browse markets and place bets.

## Status
`packages/web` is a v1 scaffold (Next.js 14, wagmi) — likely has stale v1-SDK imports. S3.

## Design
- `/markets` feed (real CTF data), `/markets/[addr]` order book + buy UI.
- Metamask: sign order → fill → show position.

## Open questions
- Migrate the scaffold to the new CTF SDK surface (orders / conditions / exchange).

## Features
- [ ] **Migrate to the CTF SDK**
  - [ ] Replace v1 SDK imports; verify `pnpm --filter @verex/web build`
- [ ] **Markets feed + detail (S3)**
  - [ ] `/markets` Polymarket-style feed
  - [ ] `/markets/[addr]` order book + buy UI
- [ ] **Wallet flow**
  - [ ] Metamask order sign → fill → position display
