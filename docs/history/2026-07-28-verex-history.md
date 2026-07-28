# 2026-07-28 — verex history

> Source docs: [`docs/tasks/jul-28-verex.md`](../tasks/jul-28-verex.md) (task spec) →
> [`docs/tasks/jul-28-verex-design.md`](../tasks/jul-28-verex-design.md) (design written today).

### Jul-28 features implemented — CLOB, multi-outcome groups, async settlement, create-market, how-to guide

All four tasks landed on `claude/jul-28-features` (11 feature commits, per the approved rev-2
design). Technical summary:

- **CLOB** (`api/src/book.ts`, `Order` table): off-chain book, price-time-priority matching in
  one row-locked DB transaction (market-row lock + `FOR UPDATE` on crossable makers); resting
  limit orders are EIP-712-signed at placement (they become makers), IOC taker sub-orders are
  signed per fill at the maker's exact ratio (ceil buys / floor sells) so
  `CTFExchange.matchOrders`' crossing checks pass and chain state mirrors the DB to 1e-6 dust.
- **ChainJob queue** (`api/src/worker.ts`): single serial in-process lane (= operator nonce
  management), atomic PENDING→RUNNING claim, 5/25/125s backoff, stuck-RUNNING recovery,
  per-fill idempotent settlement, terminal-failure compensation (fills reversed, groups
  cancelled). FIFO order guarantees redeem never lands before its resolve.
- **Operator MM** (`api/src/mm.ts`): 5-level 1¢ ladders weighted 5:4:3:2:1 (≤2k tokens, asks
  bounded by minted inventory). After each user fill, the traded market's quote center follows
  the last price and the group's centers renormalize to Σ=1 — deterministic coherence, the
  clean-room replacement for nostra's ±5% arb-bot band.
- **Groups**: `MarketGroup` + N binary member markets (CTFExchange's registry is structurally
  binary). Seeded HR Derby (7), World Series (8), TIME PotY (6). Group endpoints, group resolve
  (N payouts in one job), multi-series chart, selectable outcome rows, depth widget.
- **Create market** (`api/src/group-create.ts`, `/create`): solvency pre-flight, CREATING→OPEN
  via CREATE_GROUP job (idempotent resume per member; failure deletes members + cancels the
  group), operator funds L USDC/outcome (cap 1,000), Yes/No⇒standalone binary. Found live: the
  seed's exact-amount CTF allowance is exhausted at runtime — the job now tops it up.
- **Web**: settlement chips (2s poll of `/jobs/:id`) on trade/resolve/redeem + activity badges;
  `/how-to` guide with 6 sections and real screenshots (headless Chrome capture), including
  faucet + checking results per jay's request.
- **Verified end-to-end on a fresh reset**: group trade fills and settles on-chain,
  renormalization holds Σ=1, group resolve = 7 payout txs, queued redeem pays exactly the
  expected amount, created 4-outcome group opens with quoted books at mid 1/N.
- Left pristine: final `./scripts/reset.sh` run — 10 binary markets + 3 groups, wallets #1–5
  at 1,000 USDC.

### Jul-28 features: design doc drafted, awaiting jay's approval

Explored verex + the nostra-server reference and wrote the full implementation plan into
`docs/tasks/jul-28-verex-design.md` (branch `claude/jul-28-features`). No code changes yet — the
task spec requires jay's sign-off first.

### Decision: multi-outcome = N grouped binary conditions, not one N-slot condition

`CTFExchange`'s registry (`Registry.sol:41-51`) stores exactly one complement per token and
enforces it on every fill — a single N-slot CTF condition is untradeable on our exchange. So
"who wins the World Cup" = N binary markets + a DB-only `MarketGroup`, same shape as Polymarket
grouped markets and the reference project.

### Decision: group prices renormalized deterministically (Σ = 1), diverging from the reference

nostra-server leaves group outcomes unnormalized (an arb bot merely keeps the sum inside
±5%) and its display price is a lifetime VWAP. Verex instead proportionally rescales the other
outcomes after each trade so probabilities always sum to exactly 1 — simpler, always coherent,
and a clean-room-different algorithm (also serves the copyright-differentiation requirement).

### Decision: async settlement via a DB `ChainJob` queue; DB is the UX source of truth

Trade/resolve/redeem answer instantly from the DB and the chain settles behind a status chip;
serial worker (concurrency 1) doubles as operator-wallet nonce management; atomic job claim
fixes the double-execution flaw observed in the reference's queue. Supersedes the jul-22 doc's
"job system would be over-engineering" stance — jay explicitly asked for server-side async.
Caveat for jay: the Cloud Run worker needs `--no-cpu-throttling` + `min-instances 1` (cost).

### jul-28 design rev 2: CLOB adopted per jay's review; 4 other decisions recorded

jay reviewed the design doc inline. Big change: execution model switches from the existing
`fillOrder` maker/taker flow to a **CLOB** (order book) — "other platforms use CLOB". Doc revised:
new `Order` table + price-time-priority matching engine (fills instant in the DB), on-chain
settlement via `CTFExchange.matchOrders` through the ChainJob queue, operator becomes a
ladder-posting market maker, and group Σ=1 now holds at the MM's renormalized quote centers.
Also recorded: option (a) grouped binaries ✅, Cloud Run `--no-cpu-throttling`+`min-instances 1` ✅,
anyone can create markets ✅, fee policy deferred to jay ✅.
(Source: [jul-28-verex-design.md](../tasks/jul-28-verex-design.md), jay's inline comments.)

### Root cause: local seed failed with `returned no data ("0x")` — Sepolia addresses leaked into the local backbone

`seed.ts:51` loads `packages/contracts/.env` as a fallback, which still held
`USDC_ADDR`/`CTF_ADDR`/`EXCHANGE_ADDR` from the jul-22 Sepolia deploy (identical to the `test`
manifest in `deployments.json`). With all three set, the local seed took the "reusing backbone
from env" branch and called Sepolia contracts on a fresh anvil (no code → empty return data).
Fix: commented the three lines out (with a warning comment) — the seed now falls through to a
fresh forge deploy; verified `./scripts/reset.sh` end-to-end (10 markets, app renders).
Note: the seed's code-exists preflight only guards the test/prod manifest path — adding it to
the local env branch is a candidate hardening for the jul-28 branch.
(Source: jay's failing `./scripts/reset.sh` run, no task file.)

### README: "Run locally" made concrete for the anvil lifecycle

Split into first-time setup vs. daily start (anvil is in-memory ⇒ every restart requires
`./scripts/reset.sh` before using the app) and documented the stale-env-address gotcha above
with its exact error message and fix. (Source: jay's request in conversation, no task file.)

### jun-19 task map closed out (all 5 tasks ✅)

Per jay: marked tasks 4 and 5 complete — task 4's leftovers (#3 ResolvePanel optimism, #4 SSE)
are superseded by the jul-28 async-settlement design (Task C); task 5 is satisfied by the
committed `deployments.json` manifest + `VEREX_DEPLOY_TARGET` preflight; task 2's domain gap
closed via Firebase Hosting (`5278191`, `9921e23`).
(Source: [jun-19-verex-design.md](../tasks/jun-19-verex-design.md).)

### Footer branding: profile avatar swapped in as jaylabs.png

Replaced the footer "powered by" image with jay's profile avatar (from the rabbit repo):
old logo kept as `jaylabs-old.png`, avatar now `jaylabs.png`, `layout.tsx` unchanged in the end.
Verified in the browser. (Source: jay's request in conversation, no task file.)

### Noted: pre-existing uncommitted MarketCard.tsx polish left untouched

The working tree already had cosmetic hover/probability-bar changes to
`packages/web/src/components/MarketCard.tsx` from an earlier session; carried on the new branch
unmodified, kept separate from jul-28 work.
