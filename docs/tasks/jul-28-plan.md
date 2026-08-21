# Jul-28 Verex — Follow-up Features: Design & Implementation Plan

> **Archived 2026-08-03** — all 4 scope tasks (+ CLOB rev 2) are ✅ complete; see the
> status table below for per-item evidence. This file is frozen as the jul-28 record.
> The rolling plan continues in [current-plan.md](current-plan.md).


> Design doc for [`jul-28-verex.md`](jul-28-verex.md). Reference UI:
> [`docs/images/verex-ui/create-market.png`](../images/verex-ui/create-market.png). Written 2026-07-28 for jay's review —
> **no implementation until approved.** One branch for everything: `claude/jul-28-features`.

## Scope (4 tasks)

| # | Task | One-line design | Status |
|---|------|-----------------|--------|
| A | **Multi Outcomes** | N-outcome market = N binary CTF conditions + a DB `MarketGroup`, with **group-wide price renormalization** (Σ = 1) | ✅ **Done** — one sub-item open (A.4 `balanceOfBatch`, below) |
| B | **Create Market** | `/create` form → `POST /market-groups` returns `202 + jobId`; a background job runs the on-chain batch, funded by operator USDC | ✅ **Done** |
| C | **Faster Trading / Resolution / Redeem** | DB-backed `ChainJob` queue + in-process worker; API answers from the DB immediately, chain settles asynchronously | ✅ **Done** |
| D | **Top menu for usage** | "How to use" page (trade / resolve / portfolio / redeem / create) linked from `SiteNav`, with real screenshots | ✅ **Done** |
| — | **Execution model — CLOB** (rev 2) | `Order` table + price-time-priority matching engine + operator MM ladders | ✅ **Done** |

> **Status verified 2026-08-03** against the code on `main` @ `33252ff` (file-level check, not a
> functional re-test). Evidence:
>
> - **A** — `MarketGroup` model + migration `20260728044451_market_groups`; A.3 renormalization at
>   [`packages/api/src/mm.ts:110-122`](../../packages/api/src/mm.ts); `GroupCard` / `GroupChart` /
>   `GroupView` / `GroupResolvePanel`; route `app/group/[slug]`; `GET /market-groups/:slug`.
> - **B** — `app/create/{page,CreateClient}.tsx` (default 100 / cap 1,000 USDC per outcome, polls
>   `GET /jobs/:id`); `POST /market-groups` → `202 + jobId`; pre-flight solvency + MockUSDC
>   shortfall mint in [`packages/api/src/group-create.ts`](../../packages/api/src/group-create.ts);
>   `CREATE_GROUP` job type.
> - **C** — `ChainJob` model + migration `20260728044926_chain_jobs`;
>   [`packages/api/src/worker.ts`](../../packages/api/src/worker.ts) has the atomic
>   `updateMany` claim (`:96`), 5→25→125 s backoff (`:123`), and stuck-`RUNNING` recovery (`:83`);
>   `SettlementChip` + job polling wired into `TradePanel`, `ResolvePanel`, `PortfolioClient`.
> - **D** — `app/how-to/page.tsx`, linked from `SiteNav.tsx:57`, with 7 real screenshots in
>   `packages/web/public/how-to/`.
> - **CLOB (rev 2)** — `Order` model + migration `20260728045110_clob_orders`; `book.ts` matching
>   engine; `mm.ts` ladders + renormalizing re-quotes; `POST /orders` / `DELETE /orders/:id`;
>   read-only depth widget `BookPanel` (i.e. open question 1 landed on the *recommended* answer —
>   casual Buy/Sell panel + depth display, **no** user-facing limit-order form).
>
> **Not done — A.4 `walletSummary` batching.** The design called for replacing the sequential
> per-outcome `balanceOf` loop with one `balanceOfBatch` multicall; the loop is still there at
> [`packages/api/src/trade.ts:79`](../../packages/api/src/trade.ts). Functionally correct, but it
> gets slower as grouped markets multiply the outcome count — the exact case the design flagged.

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
2. **Execution model**: ~~verex keeps its existing maker/taker `fillOrder` flow~~
   Jay's Comment: I would like to chose CLOB because other platform use CLOB.
   → **Adopted (rev 2): verex becomes a CLOB** — see the new [Execution model — CLOB](#execution-model--clob-rev-2)
   section. Still clean-room different from nostra's CLOB: strict price-time-priority matching
   (nostra matches ad hoc), display price from the live book's best-bid/ask mid (nostra shows a
   lifetime VWAP that goes stale), group coherence via deterministic renormalizing MM re-quotes
   (nostra: a ±5% arb-bot band), and race-safe matching with row locks + atomic job claims.
3. **Job queue**: nostra's worker has a known double-execution flaw (no job claiming). Verex's
   `ChainJob` worker claims jobs with an atomic `updateMany` guard and adds exponential backoff.
4. Schema, naming, file structure, and UI are all verex's own (existing shadcn identity).

---

## Execution model — CLOB (rev 2)

> Adopted from jay's review comment; replaces the "keep `fillOrder` maker/taker" plan everywhere
> below. Binary and grouped markets both trade through the book.

- **`Order` table (Prisma)**: `marketId`, `outcomeId`, `maker` (wallet address), `side BUY|SELL`,
  `price Decimal(10,6)` (USDC per share, 0.01–0.99), `size`, `sizeFilled`,
  `status OPEN|PARTIALLY_FILLED|FILLED|CANCELLED|EXPIRED`, `expiresAt`, `signedOrder Json`
  (EIP-712 — signed server-side with the demo wallet key, exactly like today's flow), unique
  order hash.
- **Placement — `POST /orders`**: validate funds (BUY: `price × size` USDC; SELL: token balance),
  insert, and run the matching engine inside the same DB transaction. Cancel via
  `DELETE /orders/:id` (also cancels on-chain-invalid orders lazily).
- **Matching engine** (in-process, price-time priority): a new order crosses the best opposite
  levels while prices overlap; partial fills split. Every match writes a `Trade`
  (`settlement: PENDING`) and enqueues a `ChainJob` that settles via `CTFExchange.matchOrders`
  (multicall-batched when several pairs settle together). `SELECT … FOR UPDATE` row locks make
  concurrent placements race-free.
- **Casual trade UX unchanged**: the market page's Buy/Sell panel submits a *marketable limit
  order* (priced at the best opposite level ± a slippage cap), so casual users never have to see
  the book. The detail page gains a small order-book depth widget (bids/asks around the mid).
- **Operator as market maker** (replaces "operator fills from inventory"): at seed / market
  creation, the operator posts a ladder of bids and asks per outcome around the initial price,
  with ask sizes fractioned so the posted SELL total never exceeds the minted inventory. After
  each settlement, a re-quote step re-centers the operator's ladder.
- **Group coherence — the "advanced algorithm", revised**: after any fill in a group, the
  operator's re-quote step renormalizes its ladder *centers* across all members so the implied
  mids sum to exactly 1 (the A.3 formula, applied to quote centers). Third-party resting orders
  are never mutated — coherence is enforced economically through the MM's quotes, but
  deterministically, unlike nostra's ±5% arb band.
- **Price display**: mid of best bid/ask (fallback: last trade price), appended to `PricePoint`
  on every trade and re-quote — charts and cards keep working unchanged.

Impact on the rest of this doc: A.3's formula now drives MM quote centers (not direct DB price
writes); Task C's job types gain `SETTLE_MATCH` + a re-quote step; Task B's "provision liquidity"
becomes "mint inventory + post the initial ladders".

---

## Task A — Multi-outcome markets

### A.1 On-chain model decision

**Option (a) — N grouped binary conditions ✅ recommended**

Each outcome ("Brazil wins WC") is its own binary CTF condition with its own Yes/No token pair,
registered on `CTFExchange` exactly like today. A DB-only `MarketGroup` stitches them together.

Jay's Comment: I'd like to choose this option.

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

> Rev 2 (CLOB): this formula no longer writes outcome prices directly — it computes the
> operator MM's new **quote centers** after a fill (the book then produces the displayed mid).
> The math is unchanged.

Standalone markets keep a single-market version (linear impact `k = usdc/2000` shifts the
quote center; No = 1 − Yes).

For a market inside a group, after computing the traded member's new center `p'ᵢ`:

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

**New model — the DB (order book) is the UX source of truth; the chain settles behind it:**

1. `POST /orders` validates, runs the matching engine, writes any matched `Trade` rows with
   `settlement: PENDING` (no `txHash` yet), enqueues a `SETTLE_MATCH` job, and **returns in
   ~100 ms** — with the order's resting/filled state.
2. A worker inside the Fastify process (interval ~1 s + immediate wake on enqueue) settles the
   matched pairs on-chain (`CTFExchange.matchOrders`, multicalled), then stamps
   `txHash` + `settlement: CONFIRMED` and triggers the operator MM re-quote step.
3. On terminal failure (after retries): `settlement: FAILED` **+ compensation** — the fill is
   reversed (order sizes un-filled, `Trade` voided, book restored) and the UI surfaces a
   "trade reverted" notice. (Failures are rare: wallets are pre-warmed and orders are validated
   at placement; compensation is the safety net, not the common path.)

Same pattern for `resolve` (N `reportPayouts` for a group = one job; market flips to RESOLVED in
the DB immediately) and `redeem` (job computes redeemable from chain, executes, then writes the
REDEEM trade rows on confirmation — redeem alone stays *pessimistic* about balances since payout
math must come from the chain).

### C.2 Schema + worker

```prisma
enum ChainJobType   { SETTLE_MATCH  RESOLVE  REDEEM  CREATE_GROUP }
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

- `POST /orders` response includes the fill result + `jobId` + `settlement: "PENDING"`;
  TradePanel keeps its optimistic snapshot but the *server* is now also instant, so the snapshot
  shows the real fill price from the book immediately.
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
  Jay's Comment: I would choose this.
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
  operator USDC balance; if `< L × N`, on local/staging **mint the shortfall** (MockUSDC), on prod
  reject with `{required, available}`.
- The handler only writes a `ChainJob {type: CREATE_GROUP}` + a `MarketGroup` row with a new
  status `CREATING` (markets appear on the homepage only once OPEN). Everything on-chain happens
  in the worker: per outcome `prepareCondition(2)` → `registerToken` → `splitPosition(L)`, then
  member `Market` + `Outcome` rows, initial quote centers `1/N`, **post the operator's initial
  bid/ask ladders** (rev 2 — this is the "provision liquidity automatically" from the screenshot),
  flip group to OPEN.
- Job progress: the `CREATE_GROUP` job's `result` carries `{done, total, stage}`; the create page
  polls `GET /jobs/:id` and renders the progress bar (like the screenshot's batch note).
- Failure mid-batch: retries resume from the last finished outcome (each outcome's on-chain
  steps are idempotent-checkable: `getCondition` → already prepared? registered? split?). If
  terminally failed, group flips to `CANCELLED` with the error visible.

### B.2 Decisions folded in

- **Who can create:** any demo wallet (there's no real auth — same trust level as trading).
  `Market/MarketGroup.creator` stores the wallet address for display ("Created by wallet #3").
  No moderation queue (the reference had none either); can be added when real auth lands (S7).
  Jay comment: Anyone can create markets.

- **Operator liquidity source:** operator's existing USDC balance (topped up by seed / MockUSDC
  mint on test). Per-outcome `L` capped at **1,000 USDC** to stop a demo user draining the operator.
- **No fees** for now (creation fee / redemption fee are a separate product decision — the
  reference charged 2% of redemption profit; flagging as a future option, not building it).
  Jay comment: I will set the fee policy later.
  
- `Market.liquidity` note: the split gives the operator `L` Yes + `L` No inventory per member —
  that's what backs the MM's ask ladders (rev 2), so low-L markets simply have thinner books.

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
3. `feat(db+api): Order table + CLOB matching engine + POST /orders` (rev 2)
4. `feat(api): operator MM ladders + renormalizing re-quotes (group Σ=1)` (A.3, rev 2)
5. `feat(api): seed grouped markets + initial books via shared createBinaryMarketOnChain` (A.5)
6. `feat(web): group card, group detail page, multi-series chart, group resolve, depth widget` (A.4)
7. `feat(api): ChainJob queue + async settle/resolve/redeem via matchOrders` (C)
8. `feat(web): settlement status chips + polling` (C.3)
9. `feat: create-market page + POST /market-groups batch creation` (B)
10. `feat(web): how-to guide page + nav link, with screenshots` (D)
11. `docs(history): 2026-07-28 technical summary` (per the task's "After the implementation")

Each lands only after local verification (anvil run-through: seed → place orders against the MM
book → check group renormalized re-quotes → resolve group → redeem → create market end-to-end).

## Decisions recorded from jay's review (rev 2)

| Topic | jay's call |
|-------|-----------|
| Execution model | **CLOB** ("other platforms use CLOB") — design revised throughout |
| Multi-outcome on-chain model | Option (a), N grouped binary conditions ✅ |
| Cloud Run worker | Option 1: `--no-cpu-throttling` + `min-instances 1` ✅ |
| Market creation access | Anyone can create ✅ |
| Fees | jay sets fee policy later — none built now ✅ |

## Remaining open questions (answer + "go")

1. **Order book UI depth:** casual Buy/Sell panel + a small depth widget on the detail page
   (recommended), or also expose full limit-order placement (price/size form) to users?
2. **Group coherence via MM re-quotes** (rev 2 shape): OK that Σ=1 holds at the MM's quote
   centers (third-party resting orders can briefly skew displayed mids until re-quote)?
3. **Trade UX:** OK that fills are instant in the DB book and the chain settles behind a status
   chip — including the rare auto-revert on settlement failure?
4. **Create-market caps:** default 100 / max 1,000 USDC per outcome OK? Image as URL text field OK?
5. **Seed groups:** the 3 proposed groups (HR Derby, World Series, TIME PotY) OK, or different ones?
6. **Task order:** confirm A → C(+CLOB) → B → D.
