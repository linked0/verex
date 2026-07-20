# 2026-07-20 — verex history

Source: jay's direct request in chat (finalize the local run steps in README, drop obsolete
ones). No task/design doc.

### README: single current run flow, v1 section removed

Rewrote "Run locally" as one numbered flow — anvil → `dev-local.sh` (Postgres + schema + env
+ on-chain seed) → api (:4000) → web (:3000) — with `db:reset` demoted to a "clean slate"
note. Deleted the "v1 — DB-only, no contracts" section: since the Jul-07 CTF work,
`seed.ts` deploys contracts via forge, so a no-contracts flow no longer exists. Also removed
the retired `Deploy.s.sol` / CLI-alternative comment block (CLI has its own section), added
Docker to prerequisites, and added `packages/cli` to the Packages table.

### seed: pre-fund demo wallets #1–5 with 1,000 USDC (verified live, re-runnable)

Per jay: fund the demo accounts during setup instead of relying on the trade-time
auto-faucet. Added a top-up step to seed.ts (step 2b): mint each of wallets #1–5 up to
`DEMO_WALLET_USDC` (1,000 USDC, matching `AUTO_FAUCET_USDC`). Top-up, not blind mint, so
re-running against a reused backbone can't inflate balances. Verified end-to-end: ran
`dev-local.sh` twice — balances exactly 1,000 after each run (cast against the new mint),
and the API serves the fresh state after a tsx-watch reload. Gotchas confirmed on the way:
(a) the API caches ChainConfig for the process lifetime — superseded the same day by the
chain.ts fix below (no restart needed anymore); (b) seeding against a *reused* backbone
(env addresses) would revert in `prepareCondition` (Polymarket CTF rejects duplicates) —
pre-existing limitation, fresh deploy is the supported re-run path.

### Root cause: fillOrder revert after re-seed = stale ChainConfig cache; fix in chain.ts

jay hit `fillOrder` reverts trading after a self-run re-seed. Root cause: `loadChain()`
cached the ChainCtx for the process lifetime, so the running API kept signing/filling
against the *previous* backbone's exchange, where the new market's token ids were never
registered → every fill reverts. Fixed by re-reading ChainConfig per call and rebuilding
the ctx when the addresses change — a re-seed is now picked up with no API restart.
Full analysis below.

#### Symptom

Clicking **Buy** in the web UI failed with:

> The contract function "fillOrder" reverted.

The trade panel looked healthy: *"Demo wallet #1 · $1,000 USDC"*, markets rendered
normally. Reproducible every time via `POST /trade` — the API returned
`{"error":"The contract function \"fillOrder\" reverted."}` with no reason string
(the route handler returns viem's `shortMessage` only).

#### Timeline (all same day, three backbones)

| Step | Actor | Effect |
|---|---|---|
| Seed run 1 (`dev-local.sh`) | Claude | Backbone **A** deployed, wallets #1–5 pre-funded (new `[2b]` step) |
| Seed run 2 (re-run test) | Claude | Backbone **B** deployed; API restarted around this time and cached **B** |
| Seed run 3 (`dev-local.sh`) | jay | Backbone **C** deployed — DB `ChainConfig` now points at **C** |
| Buy in web UI | jay | **Revert** — the running API still held **B** |

#### Root cause in detail

`packages/api/src/chain.ts` — `loadChain()` built the chain context (USDC/CTF/Exchange
addresses + bound viem clients) **once and cached it for the process lifetime**. The old
comment even documented it: *"re-seed requires an API restart (fine for local dev)"*.

After jay's re-seed, requests flowed like this:

```
web UI ──POST /trade──▶ API (ChainCtx = backbone B, cached)
  market row from DB  = backbone C   (token ids registered on C's exchange)
  fill executed on    = backbone B's exchange
  → B's exchange has never seen C's token ids → fillOrder REVERTS
```

The revert is the exchange rejecting an **unregistered token id** — not a balance,
allowance, or funding problem. The UI's "$1,000 USDC" was equally misleading: the wallet
endpoint read balances on **B**'s USDC token while trades were built from **C**'s DB rows.
Two views, two different chains-of-record, one process.

#### Red herrings eliminated on the way

- **"The new pre-funding skipped the faucet's approval"** — wrong: the allowance check in
  `trade.ts` runs unconditionally, independent of the faucet branch.
- **"The seed run failed partway"** — wrong: both seed runs completed (`✓ seeded 10`),
  balances confirmed at exactly 1,000 via `cast balanceOf`.
- **"tsx watch reloaded the fix"** — wrong, twice: `touch` (no content change) did not
  reliably restart it, and even a real edit to an imported file (`chain.ts`) was missed.
  Only editing the entry file (`src/index.ts`) triggered a restart. This unreliability is
  why "just restart the API after re-seeding" was never a dependable workflow.

The decisive experiment: running `executeTrade()` directly via `tsx` (fresh process →
fresh ChainConfig read) **succeeded** while the same request through the long-running API
**reverted** — proving the process state, not the chain state, was broken. The fresh
process's trade also left a fingerprint (990 USDC + a YES position on C) that the API
couldn't see, confirming it was reading a different backbone.

#### Fix

`loadChain()` now re-reads the `ChainConfig` row on every call and rebuilds the context
whenever the stored addresses differ from the cached ones (cheap: one indexed PK lookup
on local Postgres per request). A re-seed is picked up by the running API automatically —
no restart, no tsx-watch dependency.

#### Verification (same API process throughout)

1. `POST /trade` → filled (tx `0x149eaf75…`)
2. Re-seed via `dev-local.sh` (backbone **D**)
3. `POST /trade` again, **no restart** → filled (tx `0x3ee75af6…`), `faucetMinted: false`

#### Lessons

- **Process-lifetime caches of deployment addresses are a re-seed landmine.** Any cache
  keyed on "loaded once at boot" must either be invalidated by the thing that rewrites the
  source of truth, or re-validated per use.
- **Two data sources (DB rows vs bound clients) must come from the same snapshot.** The
  bug was invisible in each endpoint alone; it only showed at the seam.
- **Don't trust the watcher.** `tsx watch` restarts are best-effort; a fix that removes
  the need for a restart beats a procedure that requires one.
- **Error surfacing:** the API returns only `shortMessage`, which drops the revert reason.
  Worth a follow-up: include `e?.cause?.reason`/`metaMessages` in dev-mode error responses
  so the next revert self-describes.

### API: surface revert reasons in /trade errors

Follow-up from the fillOrder analysis (Lessons §"Error surfacing"): the /trade catch
returned only viem's `shortMessage`, hiding the revert reason. Added `revertDetail()` —
walks the error's cause chain for `reason`/`errorName`, falls back to `metaMessages` —
and a `detail` field in the error response. Verified live: an oversized BUY now returns
`detail: "SafeMath: subtraction overflow"`; normal trades unchanged. (Side effect of the
test: wallet #9 holds ~51k faucet USDC until the next re-seed — not visible in the UI.)

### Design: portfolio page + market resolution

Per jay's request, wrote [tasks/details/jul-20-portfolio-resolution-design.md](../tasks/details/jul-20-portfolio-resolution-design.md)
(moved into the new `details/` folder per jay; linked as Task 3 in the jun-19 design's task map):
(1) Portfolio page for demo wallets (positions + redeem), (2) resolution as inline admin
controls on the market page when operator #0 is the active wallet — recommended over a
separate admin page since "admin" is only account-#0-by-convention. Key finding: SDK
already has `reportPayouts`/`redeem` (proven in the CLI demo) and the DB already carries
`Market.status`/`resolvedOutcomeId` — the work is API routes + UI wiring, plus a missing
trade guard for resolved markets. Design only; implementation awaiting jay's go.

### Built: portfolio page + market resolution (+P&L per jay's addendum)

Implemented [tasks/details/jul-20-portfolio-resolution-design.md](../tasks/details/jul-20-portfolio-resolution-design.md).
API: `resolve.ts` (`POST /markets/:slug/resolve` operator-only via `reportPayouts`,
`POST /redeem` clearing both index sets), walletSummary extended with costBasis/pnl
(Σ BUY − Σ SELL from Trade) + marketStatus/won; trade-guard for non-OPEN markets already
existed. Web: wallet picker gains "Operator #0 (admin)", `MarketSidePanel` switches
TradePanel ↔ ResolvePanel ↔ resolved-note, RESOLVED badge on the market header, new
`/portfolio` page (balance, positions value, open P&L cards; per-position cost/value/P&L,
WON/LOST badges, one-click Redeem). Verified end-to-end in the browser: resolved
fed-rate-below-3-dec-2026 YES as #0 → wallet #1 showed WON +$17.78 (cost $10, value
$27.78) → Redeem → balance $1,009.02 → $1,036.80. eth-above-10k-2026 was also resolved
YES during API testing — two markets are now RESOLVED until the next re-seed.

### Portfolio: activity history + realized P&L

Per jay: the portfolio should also show trade history (buys/sells) and winning/losing
results. Added `REDEEM` to the `TradeSide` enum (db push, additive) and redeemPosition
now snapshots per-outcome holdings and writes REDEEM trade rows (price = payout 1/0), so
redemptions leave a record. New `GET /wallet/:index/history` returns the full feed with
`realizedPnl` on REDEEM rows (redeem proceeds − outcome net cost). Portfolio page gains a
4th stat card (Realized P&L) and an Activity card (BUY/SELL/REDEEM chips, won/lost
amounts, timestamps); the market activity feed labels REDEEM rows "Redeemed". Verified
live on the losing path: bought YES $20 on btc-dominance, resolved NO, redeemed $0 →
history row `realizedPnl: -20`, card shows −$20.00 red. Note: redemptions made before
this change (eth, fed-rate) predate the recording and aren't in the feed — gone at next
re-seed anyway. walletSummary cost basis now explicitly excludes REDEEM rows.

### scripts/reset.sh: one-command full reset

Per jay: a dedicated script that wipes all data and deploys fresh contracts. Thin wrapper:
checks anvil reachability (eth_chainId probe) and the verex-pg container, then runs
`db:reset` (migrate reset + seed → new backbone, 10 OPEN markets, wallets pre-funded).
Explicitly fresh-deploy — reusing the old backbone is unsupported (prepareCondition
reverts on duplicate conditions; DB/chain snapshot mismatch — see today's analysis).
Verified live twice: 10/10 OPEN, wallet #1 = 1,000/0 positions/empty history, and a trade
filled through the SAME running API process (no restart, thanks to the chain.ts reload).
README's clean-slate note now points at the script.

### Bug: REDEEM enum lost by reset.sh — db push vs migrate drift

jay's redeem 500'd with `invalid input value for enum "TradeSide": "REDEEM"`. Root cause:
REDEEM was added via `prisma db push` (no migration file), and reset.sh runs
`migrate reset`, which rebuilds from migrations — wiping the enum value. Three fixes:
(1) real migration `add_redeem_trade_side` so resets keep it; (2) the history write in
redeemPosition is now try/catch best-effort — the on-chain redeem is final by then, so a
DB failure must not 500 a successful redemption (that's exactly what bit jay: the burn
succeeded, +$227.27 arrived, but the API reported an error); (3) backfilled jay's missing
REDEEM row with the real PayoutRedemption tx hash from anvil logs — history shows
realized +$127.27. Verified with a fresh cycle on wallet #2 (buy $8 → resolve → redeem →
REDEEM row, realizedPnl +7.38). Lesson: never `db push` a schema change in a repo whose
reset path replays migrations — always write the migration.

### Test record: everything verified live today (summary)

All on the running local stack (anvil + verex-pg + api + web), via curl, cast, and the
browser — none of it left as "should work":

1. **Seed pre-fund** — ran `dev-local.sh` twice; wallets #1–5 exactly 1,000 USDC after
   each run (`cast balanceOf`), proving top-up idempotency.
2. **ChainConfig auto-reload** — trade OK → re-seed → trade OK through the *same* API
   process, zero restarts (tx `0x149e…`, `0x3ee7…`).
3. **Error surfacing** — forced an oversized fill; `/trade` returned
   `detail: "SafeMath: subtraction overflow"`; normal trade unaffected.
4. **Resolution guards** — non-operator resolve → 403; double resolve → 400; redeem
   before resolve → 400; trade on resolved market → 400.
5. **Win path (browser)** — #1 bought YES → #0 resolved YES in the UI → portfolio showed
   WON / cost $10 / value $27.78 / P&L +$17.78 → Redeem → balance $1,009.02 → $1,036.80.
6. **Lose path** — #1 bought $20 YES → resolved NO → redeem $0 → history row
   `realizedPnl: −20`, red −$20.00 card in the UI.
7. **reset.sh** — ran twice; 10/10 OPEN markets, wallet #1 = 1,000 / 0 positions / empty
   history each time; trade filled through the running API immediately after.
8. **REDEEM enum regression** — after the migration fix + backfill: fresh cycle on #2
   (buy $8 → resolve → redeem) wrote the REDEEM row with `realizedPnl: +7.38`; jay's
   backfilled eth redemption shows realized +$127.27 with the real on-chain tx hash.

### dev-local.sh: fix stale "DB-only" header

The script header still described the v1 DB-only flow; updated it to state that the seed
deploys the CTF backbone and needs anvil running first — matching what the script actually
runs today. Not executed end-to-end this session (doc change only); flow derived from
seed.ts / package.json / script contents.
