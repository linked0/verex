# Jul-28 Verex — Follow-up Features: Design & Implementation Plan

> Design doc for [`jul-28-verex.md`](jul-28-verex.md). Reference UI:
> [`images/create-market.png`](images/create-market.png). Written 2026-07-28 for jay's review —
> **no implementation until approved.** One branch for everything: `claude/jul-28-features`.

## Scope (4 tasks)

| # | Task | One-line design |
|---|------|-----------------|
| A | **Multi Outcomes** | N-outcome market = N binary CTF conditions + a DB `MarketGroup`, with **group-wide price renormalization** (Σ = 1) |
| B | **Create Market** | `/create` form → `POST /market-groups` returns `202 + jobId`; a background job runs the on-chain batch, funded by operator USDC |
| C | **Faster Trading / Resolution / Redeem** | DB-backed `ChainJob` queue + in-process worker; API answers from the DB immediately, chain settles asynchronously |
| D | **Top menu for usage** | "How to use" page (trade / resolve / portfolio / redeem / create) linked from `SiteNav`, with real screenshots |

**Proposed implementation order: A → C → B → D** (not the task-file order). Reason: the
Create-Market screenshot explicitly shows a *"batch processor will create the markets …
asynchronously"* — i.e. Task B rides on Task C's job infrastructure. Building C first avoids
building a throwaway mini-queue inside B. Each step is still serial with coherent commits.

### How this differs from nostra-server (clean-room differentiation, per the task's copyright note)

Concepts were reviewed from `/Users/jay/work/nostra-server`; **no code is copied**. Deliberate design changes:

1. **Pricing**: nostra keeps group outcomes on independent order books with *no* sum-to-1
   constraint (an arbitrage bot merely nudges the sum back inside [0.95, 1.05], and its display
   price is a lifetime VWAP that goes stale). Verex instead **renormalizes the whole group
   deterministically after every trade** so probabilities always sum to exactly 1 — simpler,
   always coherent, and a genuinely different algorithm.
2. **Execution model**: nostra is an off-chain CLOB with `matchOrders`; verex keeps its existing
   maker/taker `fillOrder` flow (user signs, operator fills from inventory) — no order book.
3. **Job queue**: nostra's worker has a known double-execution flaw (no job claiming). Verex's
   `ChainJob` worker claims jobs with an atomic `updateMany` guard and adds exponential backoff.
4. Schema, naming, file structure, and UI are all verex's own (existing shadcn identity).

---

## Task A — Multi-outcome markets

### A.1 On-chain model decision

**Option (a) — N grouped binary conditions ✅ recommended**

Each outcome ("Brazil wins WC") is its own binary CTF condition with its own Yes/No token pair,
registered on `CTFExchange` exactly like today. A DB-only `MarketGroup` stitches them together.

**Option (b) — one N-slot condition ❌ rejected.** `ConditionalTokens.prepareCondition` happily
takes `outcomeSlotCount = N`, but our exchange can't trade it:
`ctf-exchange/src/exchange/mixins/Registry.sol:41-51` stores exactly one *complement* per token
and `validateTokenId` (enforced on **every** fill, `Trading.sol:76`) requires it — the registry
is structurally binary. Polymarket itself solves this with grouped binaries + a NegRisk adapter.

Consequences we accept (same trade-off Polymarket/nostra accept):
- No on-chain Σ=1 enforcement (we enforce it in the DB price layer instead — see A.3).
- Operator inventory costs `L × N` USDC per group instead of `L`.
- Resolution = N `reportPayouts` txs (winner `[1,0]`, losers `[0,1]`) — handled by Task C's queue.
- A future NegRisk-style adapter (convert "No on A" → "Yes on everything else") stays possible;
  out of scope now (noted in `docs/features/negative-risk-markets.md`).

### A.2 Prisma schema changes

```prisma
model MarketGroup {
  id          String       @id @default(cuid())
  slug        String       @unique          // "world-series-champion-2026"
  title       String                        // "Who will win the 2026 World Series?"
  description String?
  category    String
  imageUrl    String?
  status      MarketStatus @default(OPEN)   // reuse existing enum
  closesAt    DateTime?
  resolvedMarketId String?                  // winning member market once RESOLVED
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
  markets     Market[]

  @@index([category, status])
}

model Market {
  // ... existing fields unchanged (slug, questionId, conditionId, yesTokenId, noTokenId, ...)
  groupId     String?                       // null = standalone binary market (today's markets)
  group       MarketGroup? @relation(fields: [groupId], references: [id])
  groupLabel  String?                       // outcome display name inside the group: "Brazil"
  sortOrder   Int          @default(0)      // ordering within the group
}
```

Why this shape: every existing binary market keeps working untouched (`groupId = null`); a group
member is a full market (own condition, own trade panel, own PricePoint history — so the
multi-series group chart falls out for free from existing per-market `PricePoint` rows). The
on-chain question stays the full legal sentence ("Will Brazil win the 2026 World Cup?"), the DB
`groupLabel` is the short chip text — same split nostra uses, which read well in its UI.

No change to `Outcome`, `Trade`, `PricePoint`. (`PricePoint` already hangs off the member market,
which *is* the per-outcome series.)

### A.3 Pricing — group renormalization (the "more advanced algorithm")

Current rule stays for standalone markets (`trade.ts:63-69`: linear impact `k = usdc/2000`, No = 1 − Yes).

For a market inside a group, after computing the traded member's new Yes price `p'ᵢ`:

```
scale = (1 − p'ᵢ) / Σⱼ≠ᵢ pⱼ          // proportionally rescale the others
p'ⱼ = clamp(pⱼ × scale)   for j ≠ i
each member's No price = 1 − member's Yes price   (unchanged invariant)
```

- Buying "Brazil Yes" automatically drips probability out of Argentina/France/… — economically
  correct for mutually exclusive outcomes, and the group header % always sums to 100.
- One Prisma `$transaction` updates all member outcomes + the traded market's volume + one
  `PricePoint` per *moved* member (so the group chart shows the cross-impact).
- Floor: members are clamped to `PRICE_MIN = 0.02` before rescaling the remainder, so a 20-outcome
  group can't push anyone negative.
- Resolution: winner → 1.0, all other members → 0.0 (extends `resolve.ts:52-61`).

### A.4 API & UI changes

API (`packages/api`):
- `GET /markets` grows a grouped shape: groups are returned as one item with member summaries
  (label, yesPrice) — new `GET /market-groups/:slug` for the detail page.
- `POST /trade` unchanged externally (still targets a member market slug + Yes/No) — only the
  price-update internals branch on `groupId`.
- `resolveMarket` gains a group path: resolving via the group page reports payouts for **all N**
  members (Task C makes this one queued job).
- `walletSummary` (`trade.ts:241-294`) — replace the sequential per-outcome `balanceOf` loop with
  one `balanceOfBatch` multicall; with N-outcome groups the current loop gets too slow anyway.

Web (`packages/web`) — the known Yes/No-hardcoded surfaces (from the audit):
- `MarketCard` → new `GroupCard`: title + top-3 outcomes with % + a "N outcomes" badge
  (Polymarket-style rows), standalone markets keep the current card.
- `app/market/[slug]/page.tsx` → group detail page `app/group/[slug]/page.tsx`: outcome rows
  (label, Yes price, Buy Yes/No buttons), multi-series `ProbChart` (one line per member, top 5),
  trade panel targets the row you click.
- `TradePanel`: gets `outcomeLabel` context but keeps its Yes/No pair semantics (you always trade
  the *binary* member) — smallest possible change.
- `ResolvePanel` (group variant): pick the winning outcome from a list instead of two buttons.
- `ProbChart`: accept N series + a small legend; per-outcome line colors from a fixed palette
  added in `globals.css` (extends the `--yes`/`--no` vars).
- Portfolio: rows show "Group title — Outcome label"; redeem logic unchanged (member markets
  redeem individually, Task C batches them).

### A.5 Seed data (new grouped markets)

Add ~3 groups alongside the existing 10 binary markets (refreshed vs. Polymarket's current style):
1. **"Who will win the 2026 MLB Home Run Derby?"** — 6 sluggers (Sports)
2. **"Who will win the 2026 World Series?"** — 8 teams (Sports)
3. **"Who will be TIME Person of the Year 2026?"** — 5–6 candidates (Culture)

Seed refactor: extract the per-market on-chain block (`seed.ts:422-461`) into a shared
`createBinaryMarketOnChain()` in `packages/api/src/market-create.ts` so the seed, and later Task
B's runtime endpoint, call the same function (prepare → register → split). Group seeding = loop
over outcomes + one `MarketGroup` row; initial prices normalized to sum 1.

---

## Task C — Faster trading / resolution / redeem (async chain settlement)

> Presented before B because B depends on it.

### C.1 Design decision: DB-first optimistic execution + `ChainJob` queue

Today every endpoint blocks on 1–3 `waitForTransactionReceipt` calls (Sepolia ≈ 12s blocks — the
pain jay describes). The jul-22 doc stopped at optimistic *UI*; the jul-28 task explicitly asks
for server-side async ("timer or thread"), which supersedes that doc's "job system would be
over-engineering" stance.

**New model — the DB is the UX source of truth; the chain settles behind it:**

1. `POST /trade` validates, applies the price update + writes the `Trade` row with
   `settlement: PENDING` (no `txHash` yet), enqueues a `ChainJob`, and **returns in ~100 ms**.
2. A worker inside the Fastify process (interval ~1 s + immediate wake on enqueue) executes the
   chain calls exactly as today (`signOrder` → `fillOrder` → receipt), then stamps
   `txHash` + `settlement: CONFIRMED`.
3. On terminal failure (after retries): `settlement: FAILED` **+ compensation** — the trade's
   price impact and volume are reversed in one transaction and the UI surfaces a "trade reverted"
   notice. (Failures are rare here: the operator controls both sides and wallets are pre-warmed;
   compensation is the safety net, not the common path.)

Same pattern for `resolve` (N `reportPayouts` for a group = one job; market flips to RESOLVED in
the DB immediately) and `redeem` (job computes redeemable from chain, executes, then writes the
REDEEM trade rows on confirmation — redeem alone stays *pessimistic* about balances since payout
math must come from the chain).

### C.2 Schema + worker

```prisma
enum ChainJobType   { TRADE  RESOLVE  REDEEM  CREATE_GROUP }
enum ChainJobStatus { PENDING  RUNNING  CONFIRMED  FAILED }

model ChainJob {
  id         String         @id @default(cuid())
  type       ChainJobType
  status     ChainJobStatus @default(PENDING)
  payload    Json                       // e.g. {marketId, outcomeId, side, usdcAmount, wallet}
  result     Json?                      // {txHashes[]} / error detail
  tradeId    String?                    // backlink for settlement stamping
  attempts   Int            @default(0)
  maxAttempts Int           @default(3)
  runAfter   DateTime       @default(now())   // backoff scheduling
  claimedAt  DateTime?
  createdAt  DateTime       @default(now())
  updatedAt  DateTime       @updatedAt

  @@index([status, runAfter])
}
```

Also: `Trade.settlement SettlementStatus @default(CONFIRMED)` (new enum PENDING/CONFIRMED/FAILED —
default CONFIRMED keeps all historical rows valid).

Worker rules:
- **Atomic claim** (fixes nostra's flaw): `updateMany({where: {id, status: PENDING}, data: {status: RUNNING, claimedAt: now}})`
  and only proceed if `count === 1`. Safe even if a second instance ever appears.
- **Strict serial execution** (concurrency 1). This is deliberate: every tx is sent by the
  operator wallet, so serial execution doubles as **nonce management** — no nonce races, no gap
  stalls. Throughput is bounded by the chain anyway.
- Retry with exponential backoff via `runAfter` (5s → 25s → 125s), error text into `result`.
- Startup recovery: any `RUNNING` job older than 2 min is reset to `PENDING` (crash mid-tx).

### C.3 Client feedback

- `POST /trade` response now includes `jobId` + `settlement: "PENDING"`; TradePanel keeps its
  existing optimistic snapshot but the *server* is now also instant, so the snapshot shows real
  post-trade DB prices immediately.
- Lightweight `GET /jobs/:id` for polling; TradePanel/ResolvePanel poll every 2 s only while a
  job of theirs is pending, showing a small "settling on-chain… ⧗ / ✓ txHash / ✗ reverted" chip.
  (SSE/WebSocket is unnecessary complexity at this scale — polling one row is fine. This also
  resolves jul-22 leftover #3, ResolvePanel optimism, and makes leftover #4/SSE moot.)
- Portfolio + market pages render `settlement` status on activity rows.

### C.4 ⚠️ Cloud Run caveat (needs jay's decision)

The current `verex-api` Cloud Run service only gets CPU during requests — a background worker
starves between requests. Options:
1. **Set `--no-cpu-throttling` (+ `min-instances 1`) on `verex-api`** ✅ recommended — one gcloud
   flag, keeps one process; adds always-on cost (roughly the cost of one small always-on instance).
2. Piggyback execution on request lifetime (`setImmediate` after reply) — free but jobs die if
   the instance is reclaimed mid-tx; retries would cover it, ugly.
3. Cloud Tasks / separate worker service — over-engineered for a demo.

Local dev (anvil) is unaffected — worker just runs in-process.

---

## Task B — Create Market (operator-funded)

### B.1 Flow (mirrors the screenshot: form → "Start Batch Creation" → progress)

New page `packages/web/src/app/create/page.tsx` with the screenshot's fields:
question, category (existing category list), image URL *(text field — file upload needs storage
we don't have; can add later)*, **initial liquidity per outcome** (default 100 USDC), outcomes
(min 2 rows; exactly 2 labeled "Yes/No" → creates a standalone binary market; otherwise a group),
resolution date+time → `closesAt`.

```
POST /market-groups
  body: {title, category, imageUrl?, outcomes: [{label, description?}], liquidityPerOutcome, closesAt, creatorWallet}
  → validation + pre-flight solvency check → 202 {jobId}
```

- **Pre-flight solvency check** (kept from the reference design — it's a good idea): read
  operator USDC balance; if `< L × N`, on local/test **mint the shortfall** (MockUSDC), on prod
  reject with `{required, available}`.
- The handler only writes a `ChainJob {type: CREATE_GROUP}` + a `MarketGroup` row with a new
  status `CREATING` (markets appear on the homepage only once OPEN). Everything on-chain happens
  in the worker: per outcome `prepareCondition(2)` → `registerToken` → `splitPosition(L)`, then
  member `Market` + `Outcome` rows, initial prices `1/N`, flip group to OPEN.
- Job progress: the `CREATE_GROUP` job's `result` carries `{done, total, stage}`; the create page
  polls `GET /jobs/:id` and renders the progress bar (like the screenshot's batch note).
- Failure mid-batch: retries resume from the last finished outcome (each outcome's on-chain
  steps are idempotent-checkable: `getCondition` → already prepared? registered? split?). If
  terminally failed, group flips to `CANCELLED` with the error visible.

### B.2 Decisions folded in

- **Who can create:** any demo wallet (there's no real auth — same trust level as trading).
  `Market/MarketGroup.creator` stores the wallet address for display ("Created by wallet #3").
  No moderation queue (the reference had none either); can be added when real auth lands (S7).
- **Operator liquidity source:** operator's existing USDC balance (topped up by seed / MockUSDC
  mint on test). Per-outcome `L` capped at **1,000 USDC** to stop a demo user draining the operator.
- **No fees** for now (creation fee / redemption fee are a separate product decision — the
  reference charged 2% of redemption profit; flagging as a future option, not building it).
- `Market.liquidity` note: the split gives the operator `L` Yes + `L` No inventory per member —
  that's what `fillOrder` sells from, so low-L markets simply have thinner operator inventory.

---

## Task D — "How to use" top menu

- New route `packages/web/src/app/how-to/page.tsx`, linked from `SiteNav` (left of Portfolio):
  **How to use**. Server component, static content — sections:
  1. **Trade** — pick a demo wallet (#1–5) in the nav, use the faucet, Buy/Sell on a market;
     what "settling on-chain" means (Task C chip).
  2. **Resolve** — switch to the Operator wallet, open a market/group, report the outcome.
  3. **Portfolio** — positions, cost basis, P&L breakdown popup.
  4. **Redeem** — after resolution, redeem winning tokens from the Portfolio page.
  5. **Create a market** — the Task B form, operator funding explained.
- **Screenshots:** captured from the running app (real UI, taken after A–C land so they show the
  final state), stored in `packages/web/public/how-to/*.png`, rendered with `next/image`.
- Keep it one scrollable page with an in-page TOC — no docs framework needed.

---

## Commit plan (serial, one branch `claude/jul-28-features`)

1. `docs: jul-28 design doc` (this file; also fix the broken `./create-market.png` link in the task file)
2. `feat(db): MarketGroup schema + migration` (A.2)
3. `feat(api): group pricing w/ renormalization + grouped market endpoints + batch balance reads` (A.3–A.4)
4. `feat(api): seed grouped markets via shared createBinaryMarketOnChain` (A.5)
5. `feat(web): group card, group detail page, multi-series chart, group resolve` (A.4)
6. `feat(api): ChainJob queue + async trade/resolve/redeem settlement` (C)
7. `feat(web): settlement status chips + polling` (C.3)
8. `feat: create-market page + POST /market-groups batch creation` (B)
9. `feat(web): how-to guide page + nav link, with screenshots` (D)
10. `docs(history): 2026-07-28 technical summary` (per the task's "After the implementation")

Each lands only after local verification (anvil run-through: seed → trade group member → check
renormalization → resolve group → redeem → create market end-to-end).

## Open questions for jay (answer + "go")

1. **Pricing:** OK with deterministic group renormalization (Σ = 1 always)? *(Alternative:
   nostra-style independent prices — I recommend against it.)*
2. **Trade UX:** OK that a trade is "done" instantly at DB price and the chain settles behind a
   status chip — including the rare auto-revert on chain failure?
3. **Cloud Run:** approve `--no-cpu-throttling` + `min-instances 1` on `verex-api` (adds always-on
   cost) so the worker runs in the cloud? Or keep async local-only for now?
4. **Create-market caps:** default 100 / max 1,000 USDC per outcome OK? Image as URL text field OK?
5. **Seed groups:** the 3 proposed groups (HR Derby, World Series, TIME PotY) OK, or different ones?
6. **Task order:** confirm A → C → B → D.
