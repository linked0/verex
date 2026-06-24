# Jun-19 Verex — Design & Task Breakdown

> Design doc derived from [`jun-19-verex.md`](jun-19-verex.md). Reference UI:
> [`images/homepage.png`](images/homepage.png) (Polymarket-style). _(2026-06-23)_

## Task map
| # | Area | Status |
|---|------|--------|
| 1 | **Basic Web UI** — Polymarket-style, **categorical** markets, **DB-only** (no contracts yet) | ready to build |
| 2 | **Deploy to GCP** + Cloud SQL DB + domain `verex.jaylabs.xyz` | ready to build |

## Decisions (proposed — confirm)
| Topic | Proposed | Note |
|-------|----------|------|
| Web app | `packages/web` (Next.js 14, App Router) | existing scaffold (`layout.tsx`, `page.tsx`) |
| Data layer | **DB-only**, no smart-contract calls yet | per spec: "all data in database" |
| DB | **Cloud SQL for PostgreSQL** + **Prisma** | consistent with rabbit; verex has no DB yet |
| API | **Next.js route handlers + Prisma** in `web` | simplest for DB-only; alt = existing `packages/api` (Fastify) — **open Q** |
| Market type | **Categorical** (N outcomes; binary = N=2) | per spec |
| Domain | **`verex.jaylabs.xyz`** (subdomain) → Cloud Run | spec names this exact host |
| Deploy pattern | mirror rabbit `scripts/deploy.sh` (secrets → Secret Manager) | reuse known-good flow |

> 💸 Cost: Cloud SQL bills monthly even when idle (~$8–10+ smallest tier).

---

## Task 1 — Basic Web UI (prediction market)

Build a Polymarket-style UI driven entirely by the database (no contract integration yet).

### Screens (from `images/homepage.png`)
- **Top nav:** logo, search, "How it works", Login/Sign-up (reuse Auth.js Google login).
- **Category tabs:** Trending, Politics, Sports, Crypto, … (from `Market.category`).
- **Featured market** (large card): title, **categorical outcomes with % (implied probability)**, a probability-over-time chart, volume, close date.
- **"All markets" grid:** market cards — title, image/icon, top outcomes with %, volume.
- **Sidebar:** "Hot topics" list (by volume). *(Nice-to-have; can defer.)*
- **Market detail page** (`/market/[slug]`): all outcomes + prices, chart, description, and a
  **(mock) trade panel** — buys recorded in the DB, no on-chain calls.

### Data model (Prisma) — draft (review & adjust)
```prisma
// prisma/schema.prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

enum MarketStatus { OPEN  RESOLVED  CANCELLED }

model Market {
  id          String       @id @default(cuid())
  slug        String       @unique
  title       String
  description String?
  category    String?                              // "Politics","Sports","Crypto"…
  imageUrl    String?
  status      MarketStatus @default(OPEN)
  volume      Decimal      @default(0) @db.Decimal(20, 2)
  closesAt    DateTime?
  resolvedOutcomeId String?                         // winning outcome once RESOLVED
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
  outcomes    Outcome[]

  @@index([category, status])
}

model Outcome {
  id        String  @id @default(cuid())
  marketId  String
  market    Market  @relation(fields: [marketId], references: [id], onDelete: Cascade)
  label     String                                  // "Yes"/"No" or "Candidate A"…
  price     Decimal @db.Decimal(10, 6)               // implied probability 0..1
  sortOrder Int     @default(0)

  @@index([marketId])
}
```
Optional later: `PricePoint` (chart history), `Position`/`Trade` (mock trading per user).
Open: include mock trading in v1, or read-only display first?

### To-do (who does what)
| You (jay) | Me (Claude) |
|---|---|
| Confirm API choice (Next.js routes vs `packages/api`) | Add Prisma + schema + migration |
| Confirm v1 scope: read-only vs mock trading | Build homepage (tabs, featured, grid) + market detail |
| Approve seed markets (how many / which categories) | Seed sample **categorical** markets to match the screenshot |
| | Wire list/detail API routes (DB-backed) |

---

## Task 2 — Deploy to GCP + DB + domain (`verex.jaylabs.xyz`)

### Plan
- **Cloud SQL Postgres** instance + DB + user; `DATABASE_URL` → Secret Manager.
- **Cloud Run** deploy of `packages/web`; connect to Cloud SQL.
- **Domain mapping** `verex.jaylabs.xyz` → the Cloud Run service.
- Reuse rabbit's `deploy.sh` shape (push secrets to Secret Manager, `--set-secrets`).

### To-do (who does what)
| You (jay) | Me (Claude) |
|---|---|
| Confirm **billing enabled** on the GCP project | Create Cloud SQL instance + DB + user |
| Be ready to **edit DNS** at the `jaylabs.xyz` registrar | Write `verex/scripts/deploy.sh` (mirror rabbit) |
| Add the **DNS record** GCP provides; verify if prompted | Run `gcloud run domain-mappings create` for `verex.jaylabs.xyz` |
| Update OAuth redirect URI if login is used | Set `AUTH_URL`, push secrets, deploy |

> Which **GCP project** for verex? Rabbit uses `doubletree-498007`; reuse it or a separate project?

---

## Delivery process (from the task's "After the implementation")
1. **Summarize** what was done in `docs/history/` (per verex convention).
2. **Commit + push** on a new branch `claude/<topic>`.
3. **Create a PR**, then **merge it** — the task explicitly authorizes merging (this overrides the
   repo's usual "leave the PR for jay" default, but I'll still pause for your review first).

---

## Open questions for jay
1. **API layer:** Next.js route handlers (simplest) or the existing Fastify `packages/api`?
2. **v1 scope:** read-only market display, or include **mock trading** (DB-recorded buys)?
3. **Auth:** homepage public, login only for trading? (Auth.js Google login already scaffolded.)
4. **Seed data:** how many sample categorical markets, and which categories?
5. **Chart:** static seeded prices, or simulate price movement for the probability chart?
6. **GCP project:** reuse `doubletree-498007` or a separate project for verex?
7. **Cloud SQL tier:** smallest (shared-core) OK?

## When ready
Say **"go"** and I'll build everything on a **single branch** — `claude/jun-19-verex`
(Tasks 1 + 2 together) — pausing for review before any commit. Per the task's
"after the implementation": summarize in `docs/history/`, push, open a PR, then merge.
