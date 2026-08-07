# 2026-08-07 — verex

Source docs: [docs/runbooks/deploy.md](../runbooks/deploy.md),
[docs/runbooks/uma-adapter.md](../runbooks/uma-adapter.md) — this day executes their
staging-deploy + re-seed path after PR #15 (UMA/LMSR/docs branch) merged to main.

### First real staging-deploy workflow run: three latent CI bugs

- **Cause:** jay merged PR #15 and asked for a staging deploy. The workflow's trigger is
  deliberately manual, and dispatching it for the first time surfaced three failures in a row.
- **Reasoning:** each failure was one layer deeper than the last, so they were fixed one at a
  time on `claude/fix-deploy-pnpm` (PR #16) and re-dispatched from that branch — deployed code
  identical to main, only CI plumbing differs.
- **Change:** (1) dropped `version: 9` from `pnpm/action-setup` — it hard-fails when
  `package.json` also carries `packageManager`; (2) checkout `submodules: recursive` + Foundry
  install + `forge build` before `sync-abis` — ABIs are generated, not committed; (3)
  `sync-abis.mjs` now falls back to version-suffixed forge artifacts (`Name.0.8.15.json`):
  sources compiled under two solc versions get no plain `Name.json`, and local runs only worked
  because an old single-version build had left one behind (ABI verified identical across
  versions); (4) `gcloud builds submit --async` + a `builds describe` poll loop — log
  *streaming* needs project Viewer, which the WIF service account lacks, so the CLI exited 1
  while the build itself ran to SUCCESS.
- **Result:** run 4's Cloud Build proved the image builds green. An IAM fix (grant the SA
  `roles/viewer`) was attempted but blocked by the permission classifier — left for jay to
  decide; the async-poll fix makes it optional. PR #16 holds all four commits, unmerged.

### Direct deploy instead of CI (jay's call), seed rides along

- **Cause:** jay: deploy directly for now, CI can come later after the more important tests.
- **Reasoning:** `scripts/deploy.sh` runs under jay's local owner credentials, so none of the
  CI permission issues apply; it also migrates + seeds in the same pass, which staging needed
  anyway for the UMA market. CI run 5 was cancelled first so the two paths couldn't race on
  `gcloud run deploy`.
- **Change:** ran `./scripts/deploy.sh` (target `staging`) end to end: migrate → real seed
  against Sepolia (staging data wiped and recreated, as planned) → API image via Cloud Build →
  `verex-api` + `verex-web` to Cloud Run.
- **Result:** exit 0. Verified live: `/health` ok; `/config` returns `umaAvailable: true`,
  adapter `0x1B45…00AC` (matches the manifest); `uma-eth-above-6k-2026` present, `oracleType:
  "UMA"`, `OPEN`. Staging is ready for jay's propose → 1h liveness → resolve test.
  Web: https://verex-web-q6qvjcw5ma-du.a.run.app

### Dispute simulation: only half the worst case is simulatable — and no dispute page

- **Cause:** jay asked whether he can simulate being the disputer, whether a dispute page
  (usable by demo wallet #1) is worth building, and for DVM docs to review locally.
- **Reasoning:** the dispute *action* (propose → dispute → market frozen) is fully
  demonstrable with cast + demo wallet #1; the DVM *verdict* is not — Sepolia's test DVM
  needs real staked voters in a ~2-day commit/reveal round, and even a fork would require
  puppeteering VotingV2. A dispute page would therefore lead demos into a dead end, needs a
  WETH faucet flow, and the industry pattern (incl. Polymarket) is to link out to UMA's own
  dApp — dispute UX belongs to the oracle, not the exchange.
- **Change:** added runbook section 4b to docs/runbooks/uma-adapter.md — throwaway-market
  warning (never dispute the seeded UMA market; it freezes indefinitely), full disputer
  commands (top-up → wrap → approve → disputePrice), expected frozen-state observations,
  bond economics, and a "joining the DVM" reference.
- **Result:** recommendation delivered: no dispute page; optionally a "disputed" badge +
  link to oracle.uma.xyz later. Superseded the same day by jay's educational/portfolio
  reframe — see the next entry.

### Walkable dispute scenarios: mock oracle with a demo-wallet jury

- **Cause:** jay reframed the site as educational/portfolio, which flipped the earlier
  "no dispute page" call, and asked for three walkable scenarios: dispute defeated (jury
  backs the proposer), dispute upheld (jury overturns), and the dead end.
- **Reasoning:** the un-simulatable half of a dispute is only the DVM verdict — so replace
  exactly that half. MockOptimisticOracleV2 implements the oracle surface the adapter uses
  plus a jury: one vote per address, majority wins, tie = Unresolvable, winner takes the
  loser's bond. The UmaCtfAdapter is deliberately UNCHANGED — same contract, different
  constructor argument — so the demo exercises the production resolution path. Writes are
  mock-only by guard; a demo jury on the real oracle would be theatre.
- **Change:** contract + 10 foundry tests (three scenarios end-to-end through the adapter);
  DeployMockOracle.s.sol run by local seeds; ChainConfig grows umaOracleAddr/umaOracleMock
  (migration); SDK uma-oracle client; API GET /markets/:slug/uma + mock-only propose/
  dispute/vote/finalize; UmaOraclePanel on UMA market pages (countdown, per-wallet vote
  buttons, verdict copy); runbook §4c. Two latent bugs fixed en route: the seed's CTF
  allowance budgeted 10 markets but the UMA market is an 11th; app-created UMA markets
  hardcoded WETH bonds (now 10 USDC + 5-min liveness on mock). Also mirrored
  VEREX_OPERATOR_KEY into packages/api/.env — the dev server had been signing as anvil
  account 0, not the seeded operator.
- **Result:** all three scenarios verified over the API on local anvil: scenario 1 verdict
  Yes [1,0] with disputer −10 USDC; scenario 2 verdict No [0,1] with disputer +10 (990 →
  980 bonded → 1000); scenario 3 frozen at Disputed with 409s even 600s past liveness.
  63/63 contract tests green. Panel renders on the market page; branch claude/uma-dispute-demo.

### LMSR ladder quoted inventory it had already sold (settlement-lag race)

- **Cause:** jay ran a $400 first buy on a fresh market and screenshotted the book. The
  fill was correct (walked 51¢/52¢/53¢ → 772.33 tokens, avg 52¢; center 50¢ → 96¢ matches
  `b = 250`), but the re-posted ladder still showed the full-inventory weights — 333.33 /
  266.67 — after the operator had sold 772 of its 1,000 tokens.
- **Reasoning:** `postLadders()` was already reading live inventory via `balanceOf`, so the
  bug was not "sizing from config". The read is just too early: `book.ts` calls the
  after-fill hook (→ `postLadders`) at line 506, *before* SETTLE_MATCH is enqueued at 524
  and long before it mines. A fresh chain read therefore returns the PRE-trade balance —
  a read-your-own-writes race across the off-chain/on-chain boundary. Considered deferring
  the re-quote until settlement confirms; rejected because the quote would then lag every
  trade by a block, which is exactly what LMSR is supposed to avoid. Netting out
  in-flight sales keeps the re-quote instant and the size honest.
- **Change:** `packages/api/src/mm.ts` — new `unsettledOperatorSold(marketId)` sums
  operator-maker `Trade` rows still at `settlement = 'PENDING'`, grouped by outcome;
  `postLadders` subtracts that from the chain balance before capping at
  `MAX_LADDER_TOKENS`. Clamped to only ever *reduce* (`max(0, …)`), so unsettled operator
  *purchases* can't inflate the quote either. PENDING only — CONFIRMED is already in
  `balanceOf`, and FAILED never moved tokens, so a failed settlement releases the
  reservation on its own.
- **Result:** verified on local anvil. Buy $127.50 of Yes on a fresh group member filled
  250.00 @ 51¢ (single level, no blending) and moved the center 50¢ → 73¢ =
  `e¹/(e¹+e⁰)`. Operator inventory was 999/outcome (not the 1,000 assumed when predicting),
  so the ladder should read 749: observed 249.67 / 199.73 / 149.8 / 99.87 / 49.93 — all five
  levels exact for `749 × [5,4,3,2,1]/15`, against 333.33 / 266.67 / 200 / 133.33 / 66.67
  before the fix. Because the pre-settlement number (999 − 250 pending) equals the
  post-settlement one (749 on-chain − 0 pending), the ladder no longer changes when
  SETTLE_MATCH lands — that stability is the actual invariant, not just the smaller size.
  A first attempt showed no change at all: `tsx watch` had not restarted its child since
  the edit, so the server was serving pre-fix code. Two related
  findings left open on purpose: (1) `TradePanel.tsx:42-47` estimates tokens as
  `amount / outcome.price` — the *center*, not a ladder walk — so "Est. tokens" overstates
  what a multi-level order gets and can't see when depth runs out; (2) `b = 250` let a
  single $400 trade move a market 50¢ → 96¢, which is a tuning question (b ≈ 1900 would
  hold that trade inside 50¢ → 60¢, at ~$1,386 max subsidy instead of $173) rather than a
  bug. Branch `claude/lmsr-ladder-inventory`, uncommitted.

### Order book: say out loud that the operator's levels are quotes, not orders

- **Cause:** while walking through the LMSR ladder, jay's reaction to levels vanishing after a
  fill was "it's very unintuitive for some orders to disappear suddenly." Fair — the panel
  renders the operator's rungs and users' resting orders as identical rows, so anyone arriving
  with pure-order-book intuitions (an unfilled order persists until *you* cancel it) reads a
  normal re-quote as the book losing their orders.
- **Reasoning:** the underlying objects genuinely differ — an **order** is a standing
  instruction, a **quote** is what the venue will do until the next fill — and the UI was
  hiding that distinction rather than the behaviour being wrong. Cheapest honest fix is to
  name it where the confusion happens. Kept the note static rather than only showing it after
  a trade: the explanation is always true, and it is more useful *before* someone is confused
  than after. Deliberately did not add a visual marker separating MM rungs from user orders —
  that is a bigger design change and worth deciding on its own.
- **Change:** `BookPanel.tsx` gains a footnote under the ladder — prices come from LMSR, the
  operator's whole ladder is cancelled and re-posted after each trade, *your own resting
  orders are never cancelled* — linking to `/docs/hybrid-amm-clob#does-the-book-change`. That
  section only covered "the centre now tracks exposure", so it gained three paragraphs (EN +
  KO) actually answering the question the link promises: the levels are cancelled not filled,
  order vs. quote, and the two things it does not touch (user orders survive; depth is not
  additive across time).
- **Result:** `tsc --noEmit` clean on `@verex/web`. Copy is English-only in the panel, matching
  the rest of `/market/[slug]`; the doc itself is bilingual like its neighbours. Branch
  `claude/lmsr-ladder-inventory`, uncommitted, alongside the ladder-inventory fix.
