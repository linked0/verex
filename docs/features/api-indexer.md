# API & Indexer

**Goal:** serve market/order/position data to the web + agents, backed by an event indexer.

## Status
`packages/api` exists but its **build is broken** (stale `VerexClient` import) — review item #1.
Indexer not started (S5).

## Design
- **API (Fastify, S4):** `/markets`, `/orders`, `/positions/:user`; Postgres
  (Markets / Orders / Fills / Positions); local docker-compose.
- **Indexer (S5):** stream `OrderFilled` / `PositionsMerged` / `PayoutRedemption` → Postgres;
  Pub/Sub local emulator; genesis backfill.

## Open questions
- Pub/Sub vs Kafka for events (plan suggests Pub/Sub first).

## Features
- [ ] **Fix the API build (blocker)**
  - [ ] Replace the v1 `VerexClient` import with the CTF client/stub
- [ ] **REST API (S4)**
  - [ ] `/markets`, `/orders`, `/positions/:user` (Fastify)
  - [ ] Postgres schema + docker-compose
- [ ] **Indexer (S5)**
  - [ ] Event stream → Postgres; Pub/Sub emulator; backfill
