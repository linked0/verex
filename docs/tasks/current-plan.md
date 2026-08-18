# Verex — Current Plan (rolling)

> Fresh start 2026-08-03. The previous plan — jul-28 follow-up features, tasks A–D plus the
> CLOB rev-2 execution model — is ✅ complete and archived with per-item evidence at
> [jul-28-plan.md](jul-28-plan.md). This file is the rolling plan: current roadmap status and
> the agreed next-work queue.
>
> **Carry-over from jul-28:** A.4 `walletSummary` `balanceOfBatch` batching — in progress in a
> separate session (started 2026-08-03).

## Roadmap status (2026-08-03, S6/S9 re-audited 2026-08-18)

> Moved here from `docs/features/README.md` (jay, 2026-08-03): dated status audits are planning
> content and belong in the rolling current-plan doc, not the long-lived feature index. Audited
> against the code on `main`, not the commit log. The roadmap has been executed **out of order**:
> S9's deploy is live while S5/S6 never started.

| Step | Status | Evidence / gap |
|------|--------|----------------|
| S2 CTF backbone | ✅ done | CTF Exchange + Gnosis CTF live on Sepolia (`deployments.json`); sub-steps S2.1–S2.6 tracked in the design doc §1.5 |
| S3 Web MVP | ✅* done, 2 gaps | Polymarket-style feed + market pages live; **no `packages/mcp-server`**, no ADR 0001 |
| S4 API + Postgres | ✅ done | Fastify `packages/api` + Cloud SQL Postgres (staging + prod) |
| S5 Indexer | ❌ not started | no chain→DB indexer; DB written only by the API itself |
| S6 Oracle adapters + MM v1 | ◐ partial (re-audited 2026-08-18) | default resolve is still Stage-1 manual, operator-only (`resolve.ts` rejects any `accountIndex !== 0`) so the A5 SPOF stands — but the UMA path is no longer absent: `resolve.ts` branches on `market.oracleType === "UMA"` and defers to the adapter that owns the condition, and `uma-demo.ts` walks propose/dispute/vote/finalize with a runbook. **Against the MOCK oracle** — a live Sepolia UMA adapter is not verified here |
| S7–S8 AA / cross-chain | ❌ not started | — |
| S9 Deploy | ◐ partial (re-audited 2026-08-18) | Cloud Run staging + prod live (2026-08-03); **CI/CD ✅ — `.github/workflows/deploy-staging.yml` exists** (last touched 2026-08-07, `ec3f853`), which supersedes the earlier "no `.github/workflows`" gap; **Stripe ❌** (no stripe references under `packages/*/src`) |
| S10 Final | ❌ not started | — |

Structural drift from the original plan (supersedes the design doc §7's target layout): the MM is
**in-process** (`packages/api/src/mm.ts` — CLOB ladder maker, rev 2 of this plan), not a separate
`packages/mm-agent` worker; `packages/mcp-server` does not exist yet.

## Next-work queue — 3 active tasks + 1 dropped (2026-08-03)

> Estimates are focused-work days (AI-assisted), §1.4 style; "done when" milestones are the §9.1
> verification gates. **Delivery mode: one coordinated batch** (jay, 2026-08-03 — superseding the
> earlier confirm-at-each-step order). The wave sequencing, conflict analysis, and gates for that
> batch are in [Batch implementation design](#batch-implementation-design-all-4-at-once) below;
> the per-task detail here is what each wave draws from.

### 1) Hybrid AMM + CLOB — always-on liquidity (feature doc: [hybrid-amm-clob.md](../features/hybrid-amm-clob.md))

**Why now:** `/create` markets start with only the operator's ladder — the cold-start problem the
feature doc opens with, now user-visible. Index flags this "early (priority)".

**Gate (open):** curve decision — **LMSR recommended** by the 2026-08-03 simulation (CPMM quotes
>$1.00 at the tails; StableSwap resists repricing and still crosses $1 at depth). Tail guard
ships regardless of curve.

**Does LMSR change the order book?** (jay, 2026-08-03) — **Phase A: no. Phase B: yes.** The
codebase already separates the two cleanly: `mm.ts` decides *what prices the operator posts*,
`book.ts` decides *how any two orders match*. LMSR replaces only the first. In phase A,
`placeOrder`'s price-time-priority matching, the IOC slippage guard, cancels, and third-party
resting orders are all untouched — it stays a genuine CLOB, with LMSR just making the operator a
smarter maker. What actually changes is **where the quote center comes from**: today
`requoteAfterFill` chases the last traded price (so one trade can shove it), whereas LMSR derives
it from the operator's *inventory*, which a single trade cannot distort. Phase B is the part that
does change matching — the pool becomes a second venue, so `placeOrder` gains routing across real
orders + virtual pool orders, and two settlement paths.
*Consequence for phase A's tuning:* today's ladder is 5 levels × 1¢ (`LADDER_LEVELS`,
`LADDER_STEP`) = ±5¢ of coverage, with fixed `[5,4,3,2,1]` weights. LMSR has a price at *every*
level, so level count/step and per-level sizes should follow the curve's local slope instead of a
fixed weight table — otherwise the discrete ladder only coarsely approximates the curve and the
tail-slippage benefit is muted. The approximation errs safe (posting less than the curve implies
= less exposure, not more), but the ladder should get deeper than ±5¢.

**Phase A — off-chain LMSR quoting (~1–2d).** No new contracts. Swap the MM's quoting strategy in
`packages/api/src/mm.ts`: ladder prices/sizes derived from the LMSR cost function (parameter `b`
per market, funded by the operator inventory L from create/seed) instead of the current
linear-impact centers. The matching engine already fills against these resting orders, so
"routing" needs no changes in phase A. Add the **tail guard**: max-price-impact check at
placement + slippage warning in `TradePanel` at extreme prices.
*Done when:* on a fresh `/create` market with zero third-party makers, a $50 BUY fills with
bounded impact; a $100 BUY at spot ≥$0.95 executes **below $1.00** (anvil + staging).

**Phase B — on-chain LMSR pool + fallback (~3–4d).** `LMSRMarketMaker`-pattern contract (Gnosis
prior art; fixed-point exp/ln — **check the license before importing vs re-implementing**)
holding CTF positions per market; operator funds it at create/seed. Liquidity mapping: overlay
the pool's curve as virtual book orders; smart routing splits fills between real orders and the
pool at best price; settlement via a new `ChainJob` type. **Slo-mo fallback:** trading directly
against the contract works with the API down.
*Open decisions:* pool per member market vs per group; virtual-order tick granularity; whether
phase B waits until after tasks 2–4 (phase A may be enough for the demo stage).
*Done when:* an anvil test trades against the contract with the API stopped; routed fills beat
single-venue execution in the sim's tail cases.

### 2) CI/CD — GitHub Actions (~1–2d)

**Why now:** no `.github/workflows` at all; today's staging deploy was fully manual and hit the
`staging-up.sh` client-timeout bug — a pipeline would have caught it. Protects tasks 3–4.

- **CI (`ci.yml`, PR + main):** pnpm install (corepack-pinned), turbo `tsc`/build for
  sdk/api/web, `forge test` in `packages/contracts` (foundry-toolchain action),
  `prisma validate`. Cache the pnpm store. No deploy credentials in CI.
- **CD (`deploy-staging.yml`, manual dispatch first):** auth via **Workload Identity
  Federation** (no service-account key JSON in GitHub), then the existing `deploy.sh` with
  `SKIP_SEED=1` hardwired. Preflight: fail fast with a clear message if `verex-db` is STOPPED
  (never auto-start — cost is jay's call). Prod stays manual.
- **Fold in:** fix `staging-up.sh` — wrap the Cloud SQL patch in `operations wait` so an 11-min
  start doesn't abort the script under `set -e` before the always-on step (today's incident).
- *Needs jay:* one-time WIF pool + service-account creation in `verex-499205`.
- *Done when:* a PR with a deliberate type error goes red; a clean PR goes green incl. forge
  tests; one manual dispatch deploys staging end-to-end.

### 3) ~~S5 indexer~~ — **DROPPED from the batch** (jay, 2026-08-03)

> **Why dropped.** The justification below ("a crash mid-settlement diverges the DB from the
> chain") **does not survive reading the code.** The `SETTLE_MATCH` handler is already idempotent
> across retries — [`book.ts:651-659`](../../packages/api/src/book.ts) skips fills whose trades are
> already `CONFIRMED` — and `onFailed` compensates by reversing DB fills. The stuck-`RUNNING`
> recovery in [`worker.ts:82-87`](../../packages/api/src/worker.ts) therefore re-runs safely.
>
> What survives is a **sub-second window**: the idempotency check reads the DB, not the chain, so
> a crash between `matchOrders` returning and `updateMany` writing `CONFIRMED` would leave the
> trade `PENDING` and let a retry send a second `matchOrders`. Whether the exchange rejects that
> replay is **unverified** — worth a test, not a subsystem. The other divergence sources are thin
> here: demo wallet keys live only in Secret Manager (so "external wallet trades directly" is
> near-hypothetical), manual operator `cast` calls are rare, and reorg exposure is untracked
> anyway.
>
> **Reframed:** an indexer is an *observability* tool for Verex, not a *correctness* one — it tells
> you when DB and chain disagree, which today nothing does. That value is real but cheaply had:
> a **read-only consistency checker** (walk recent trades, compare DB vs chain, report mismatches,
> write nothing) needs no schema change, no cursor, no poller. Build the full reconciler later
> *with evidence* about what actually breaks.
>
> **Revisit after wave 2** — the pool contract and UMA adapters add on-chain state the DB mirrors,
> including dispute flows that can change an answer days later. That genuinely needs
> reconciliation. The indexer isn't wrong, it's **early**.
>
> Original scope kept below for when it returns.

**Why it was proposed:** the DB is written only by the API. Any on-chain fact the API misses (crash
mid-settlement, external wallet redeeming directly, manual operator tx) silently diverges from the
DB — and the DB is the UX source of truth in the CLOB model.

**Scope re-derivation:** the original S5 assumed chain-first (indexer as primary writer). The
jul-28 rev made the architecture DB-first, so the indexer's role shifts to **reconciliation**:
verify and backfill, not originate. GCP Pub/Sub from the original plan is deferred —
over-engineering at this scale (§9.2); an in-process poller matches the worker precedent and
the always-on Cloud Run service is already paid for.

- Poller in `packages/api/src/indexer.ts` (viem `getLogs`, cursor persisted in a new
  `IndexerCursor` row, interval alongside the ChainJob worker).
- Events: `OrderFilled`, `ConditionResolution`, `PayoutRedemption`, ERC-1155
  `TransferSingle/Batch` scoped to registered tokenIds.
- Reconcile: stamp missing `txHash`/settlement states; flag DB-vs-chain mismatches; surface
  external transfers touching demo wallets. Alerts via the existing Telegram notify path.
- Backfill from the backbone's deploy block on first run.
- *Done when:* on anvil, killing the API mid-settlement then restarting backfills the missing
  settlement rows; an external redeem (cast, not API) shows up in the DB within one poll cycle.

### 4) S6 oracle adapters — Chainlink + UMA (~3–5d)

**Why now:** resolve is still Stage-1 manual (operator EOA) — the MEDIUM-severity SPOF tracked
as audit item A5. Biggest trust gain on the roadmap; last in the order because it wants the
indexer's chain⇄DB verification underneath it.

- **Stage 2 — `ChainlinkOracleAdapter.sol`:** reads a price feed (ETH/USD exists on Sepolia);
  after `endTime` anyone can trigger `reportPayouts` for numeric markets ("ETH > $10k by X").
- **Stage 3 — `UMAOptimisticOracleAdapter.sol`:** `OptimisticOracleV2.requestPrice` for
  event/news markets; dispute-window latency is inherent.
- Each adapter is a **new oracle address** — existing markets keep manual resolve
  (`prepareCondition` is immutable per market); only new markets opt in. Create-market and seed
  gain an oracle choice; the RESOLVE `ChainJob` branches per oracle type; UI shows an oracle
  badge per §2.2.7; `deployments.json` + runbook gain the adapter addresses.
**Can the operator choose manual-vs-UMA per market?** (jay, 2026-08-03) — **Yes, at creation
only.** The oracle is just the first argument to `prepareCondition`, so picking it per market is a
create-time form field, nothing more. It cannot change afterwards: the oracle is hashed into
`conditionId`, so "switching oracle" produces a different market (see the
[UMA explainer](../analysis/2026-08-03-uma-optimistic-oracle-explainer.md)). Three choices, and
they are not mutually exclusive:

| Oracle registered | Trust model | Recovery if the oracle misbehaves |
|---|---|---|
| Operator EOA (today) | Operator decides, instantly, unappealably | n/a — operator *is* the oracle |
| UMA adapter, pure | Operator proposes, anyone disputes | **None** — a captured or stuck UMA leaves the market unresolvable forever |
| UMA adapter **+ constrained admin override** ✅ recommended | UMA normally; operator can force a result only under stated conditions | Yes |

The third exists because CTF only ever sees *one* oracle address — the adapter — so any policy we
want can live *inside* the adapter. This is what Polymarket's `UmaCtfAdapter` does (it retains
emergency admin resolution), and the March-2025 governance attack is the reason why.

**Honest tradeoff:** option 3 does **not** fully close A5 — the operator retains a lever. What it
changes is that the lever becomes *exceptional, constrained, and visible on-chain* instead of
being the only path. Constraints worth building in: usable only after UMA settles `0.5e18`
(unresolvable) or after a timeout with no proposal, plus an event emission and ideally a timelock
so traders can exit first. Pure UMA (option 2) is the more principled choice and the right default
for a Sepolia demo; the override matters if mainnet is ever the goal.

*Seed/demo implication:* seed a **mix** — leave most markets on the operator oracle and put 2–3 on
the UMA adapter — so both paths are demonstrable side by side and the UI's oracle badge has
something to distinguish.

- *Open decisions:* dispute bond sizing; who pays adapter gas (operator vs caller); whether to
  build the constrained override now or leave a documented upgrade path.
- *Done when (per §1.4):* ≥1 market resolved end-to-end by each adapter, winner redeems; A5
  closed in the audit tracker.

---

# Batch implementation design (all 4 at once)

> jay, 2026-08-03: deliver all four tasks in one batch rather than one-at-a-time with a
> confirmation between each. This section is the **design + review** of how to do that safely.
> Nothing here is built yet — it needs the gates in §0 answered first.

## The core finding

"All at once" cannot mean "four parallel streams". The tasks touch the **Prisma schema** and add
**Solidity contracts + Sepolia deploys** — run concurrently, those collide in exactly the two
places that are painful to unwind (migration history, and a backbone whose seed is
non-idempotent). What works instead is **one batch with an internal order**: four *waves*, where
everything inside a wave is genuinely independent and each wave closes before the next opens.

> **Revised 2026-08-03 (twice, both narrowing scope):** Chainlink demoted to optional (it answers
> 1 of 13 seeded markets; UMA answers 13), and the **indexer dropped** (the worker is already
> idempotent — see task 3). The batch is now **three tasks**: CI/CD, LMSR (both phases), UMA.

Sequenced this way the batch is **~6–9 focused days** (was ~8–11 before the two cuts), versus
~7–10 run strictly serially. **Be honest about what the wave structure now buys:** with the
indexer gone, wave 1 has a single workstream, so this is less a parallelism play than a
*well-ordered serial plan with explicit gates*. The real win is a single coherent design pass and
one staging verification — which was always the larger benefit.

## Conflict map (why the waves are shaped this way)

| Shared surface | Tasks that touch it | Collision if run concurrently |
|---|---|---|
| `schema.prisma` + migrations | 1B (AMM `ChainJob` type), 4 (market oracle type/address) | Migration folders authored against different baselines → drift + merge pain. **Fix: one combined migration in wave 0.** ~~`IndexerCursor`~~ dropped with task 3, so this migration is now small. |
| Solidity + `deployments.json` + operator gas | 1B (`LMSRMarketMaker`), 4 (2 oracle adapters) | Two deploy sittings, two manifest edits, `forge broadcast/run-latest.json` is per-chain-id and gets overwritten (runbook §2). **Fix: one contract wave, one gate-check, one `save-deployment`.** |
| `seed.ts` + create-market flow | 1B (pool funding at create), 4 (oracle choice at create) | Same functions edited twice; and a materially changed seed means staging needs a **fresh seed** to demo the new paths — which the runbook treats as a first run (no `SKIP_SEED`). **Fix: land both edits in wave 2, re-seed once at the end.** |
| `ChainJob` worker dispatch | 1B (AMM settle), 4 (RESOLVE branches per oracle) | Both add cases to the same switch — trivial textual conflict, but only if authored in parallel. Wave 2 serializes it. |
| ~~`mm.ts` / `TradePanel` vs `indexer.ts`~~ | ~~1A vs 3~~ | Moot — task 3 dropped. This was the batch's only genuinely parallel pair, which is why the wave structure is now sequencing rather than parallelism. |

## Wave plan

**Wave 0 — foundation (~1d).** Task 2 (CI/CD) in full, *plus* one combined Prisma migration for
wave 2 (oracle fields on `Market`, new `ChainJobType` values — small now that `IndexerCursor` is
gone), *plus* the `staging-up.sh` `operations wait` fix. CI lands first on purpose: every later
wave's PR is then type-checked and `forge test`-ed automatically.
*Gate to wave 1:* green CI on a clean PR, red on a deliberately broken one; migration applied to
staging with `prisma migrate deploy` (additive only — no backfill needed).

**Wave 1 — off-chain (~1–2d).** Task 1 **Phase A** only: LMSR quote centers in `mm.ts` plus the
tail guard in placement and `TradePanel`. No contracts, no schema work, fully observable on anvil
without spending a single Sepolia tx. (This wave held two workstreams before the indexer was
dropped; it is now a single one.)
*Gate to wave 2:* the "done when" check passes on anvil — a $100 BUY at spot ≥$0.95 executes
below $1.00 on a market with no third-party makers.

**Wave 2 — on-chain, one deploy sitting (~3–5d).** Task 1 **Phase B** (`LMSRMarketMaker`-pattern
pool + liquidity mapping + smart routing + slo-mo fallback) and Task 4's **UMA adapter**
(`UMAOptimisticOracleAdapter` + WETH bond wiring, oracle choice threaded through create/seed,
RESOLVE branching, oracle badge). `ChainlinkOracleAdapter` only if we still want the per-adapter
milestone ticked. Write and `forge test` first; deploy in **one sitting**, then
`check-deployment` → `save-deployment` once, per runbook §2's warning that the broadcast artifact
is per-chain-id and the next deploy overwrites it.
*Preflight:* operator funded (G5 currently ❌) and WETH wrapped for bonds.
*Gate to wave 3:* forge tests green; contracts verified on-chain by `check-deployment`; anvil
proves trading against the pool with the API stopped.

**Wave 3 — integration + staging (~1d).** Fresh seed on staging (first-run semantics — **no**
`SKIP_SEED`, since the backbone gained pools and adapter-oracle markets), end-to-end verification
of all four features against `*.run.app`, then runbook + `deployments.json` + feature-doc
checkbox updates and the history entry.
*Done when:* one real trade through the LMSR book, one UMA-resolved market redeemed by a winner
(the "≥1 market per adapter" milestone), and the CD workflow having performed that staging deploy
itself.

## Review — risks, and what this design does about each

1. **One giant diff is unreviewable.** ~10 days of work in a single squashed branch defeats the
   review policy this repo runs on. → One branch, but **wave-tagged commits** (or four stacked
   PRs, one per wave) so each is reviewable alone and revertable alone.
2. **Wave 2 spends real money and real gas** — three contract deploys plus a fresh seed's ~32
   operator-signed txs. → Check the operator balance *before* wave 2 opens, not during it
   (runbook §7 wants >~0.05 ETH; three deploys plus a re-seed wants more headroom).
3. **UMA on Sepolia may not exist.** Task 4's Stage 3 assumes an `OptimisticOracleV2` deployment
   the chain may not have — and the fallback (moving those markets to Base Sepolia) is a
   *chain migration*, not a code tweak. → **Preflight before wave 2 is committed**: confirm the
   `OptimisticOracleV2` address on Sepolia. If absent, Stage 3 splits out of this batch rather
   than dragging a chain move into it. This is the single largest scope risk in the batch.
4. **The fresh seed wipes staging's trade history.** `seed.ts` deletes `Trade`/`PricePoint`/
   `Outcome`/`Market` before recreating (jul-28 plan §5). → Expected and acceptable for staging,
   but it must be a conscious call, and **prod is untouched by this batch** — prod stays on the
   current backbone until the batch is verified on staging.
5. **The LMSR gate is still open.** Wave 1 cannot start without it. → §0 below.
6. **Waves hide serial dependencies if rushed.** Wave 2's routing assumes wave 1's LMSR quote
   centers exist; wave 3's re-seed assumes wave 2's contracts are recorded. → The per-wave gates
   are the mechanism; a wave does not open until the prior wave's gate is green.

## §0 — Gates

> **Renumbered 2026-08-04 to jay's ordering** — the number is the order a gate must be
> *decided*, not the order the waves run.

| # | Gate | Status | Owner | Blocks |
|---|------|--------|-------|--------|
| G1 | **Phase B in scope now?** | ✅ **closed 2026-08-04 — NO.** jay: "Phase A is enough" | jay | — |
| G2 | **WIF pool + service account** (`verex-499205`) | ✅ **closed 2026-08-04** — applied & verified | claude (jay authorised) | wave 0's CD |
| G3 | **Confirm LMSR** as the curve | ✅ **closed 2026-08-04** — "full LMSR, groups included" | jay | wave 1 |
| G4 | **UMA `OptimisticOracleV2` on Sepolia** | ✅ passed | — | wave 2 |
| G5 | **Operator gas** | ✅ **passes under the reduced scope** — 0.1788 ETH vs a revised ~0.1 target | jay | wave 2 |

**All five gates are now closed, and the WIF chain is complete end to end** — pool, provider,
service account, roles, impersonation binding, and the `WIF_PROVIDER` / `WIF_SERVICE_ACCOUNT`
repo variables (cross-checked against the live GCP resources). Nothing consumes it yet: the CD
workflow itself is the next deliverable.

### G1 result — Phase B dropped (jay, 2026-08-04)

Phase A ships; the on-chain pool does not. The reasoning that decided it: every benefit Phase B
provides — surviving operator downtime, censorship resistance, letting anyone verify the quote —
is a benefit of *not having to trust the operator*. On Sepolia with test USDC there is no
adversary to resist and nobody who can lose money, so those guarantees buy nothing yet. They
become real on mainnet, and that is when to build it.

**Knock-on effect, and it is the useful part: G5 stopped being a blocker.** The ~0.5 ETH target
existed because wave 2 was three contract deploys plus a fresh seed. Without Phase B, wave 2 is
**the UMA adapter deploy plus the seed** — one deploy, not three. Against the runbook's ~0.05
for a re-seed alone, ~0.1 ETH is a comfortable target, and the operator now holds **0.1788 ETH**
(up from 0.0496). **jay can stop faucet-farming.**

The public docs were updated to match: `packages/web/src/content/docs/liquidity.ts` now states
that Phase B is deferred and why, and the stale claims it invalidated were corrected — the
ladder no longer "requotes around the last traded price", and Verex is described honestly as
sitting between a pure CLOB and a full hybrid rather than being the full hybrid already.

### Status 2026-08-04

**Wave 1 Phase A is done and is now the whole of Task 1.** LMSR is wired into `mm.ts`: quote
centres derive from the operator's net sold inventory, and a group's sibling centres come from
one n-way softmax so they sum to 1 by construction. Migration
`20260804043305_lmsr_quote_params`. Verified end-to-end with synthetic trades in a rolled-back
transaction — numbers in the [2026-08-04 history](../history/2026-08-04-verex-history.md).

**Revised remaining plan (~3–4 days, down from 6–9):**

1. **Wave 0** — ✅ **done.** WIF live + `.github/workflows/deploy-staging.yml` written
   (deploy-only, never seeds). **Cannot be triggered until it lands on `main`** —
   `workflow_dispatch` only appears for workflows on the default branch.
2. **Wave 2** — UMA adapter only. Now unblocked on gas.
3. **Wave 3** — fresh seed on staging + integration check.

**Two things to expect at deploy.** The local DB has no trades, so only the softmax is proven
against real rows, not the inventory path — re-run `scripts/check-lmsr-centers.ts` on staging.
And already-traded markets will show a **one-time price jump** as centres re-derive from
inventory rather than last print. Intended, not a bug.

### G4 result — UMA is available on Sepolia; Stage 3 stays in the batch (verified 2026-08-03)

Verified two independent ways: UMA's own `networks/11155111.json`, and live `cast` calls against
the address (`defaultLiveness() = 7200`, `finder()` matching the manifest's Finder).

| Contract | Sepolia address |
|---|---|
| `OptimisticOracleV2` | `0x9f1263B8f0355673619168b5B8c0248f1d03e88C` |
| `Finder` | `0xf4C48eDAd256326086AEfbd1A53e1896815F8f13` |
| `Store` (final-fee source) | `0x39e7FFA77A4ac4D34021C6BbE4C8778d47F684F2` |
| `AddressWhitelist` (bond currencies) | `0xE8DE4bcE27f6214dcE18D8a7629f233C66A97B84` |

`YES_OR_NO_QUERY` — the identifier event/news markets need — **is supported** on Sepolia.
No chain migration; risk 3 is closed.

**New constraint found while verifying — the bond currency cannot be Verex's own collateral.**
`OptimisticOracleV2.requestPrice` requires the bond currency to be on UMA's `AddressWhitelist`,
and Verex's staging MockUSDC (`0xF0AB…3edD`) returns `isOnWhitelist = false`. So
`UMAOptimisticOracleAdapter` must hold and post a **whitelisted** token, separate from the
collateral the markets themselves trade in. Usable options on Sepolia:

| Token | Address | Final fee |
|---|---|---|
| **USDC (UMA's)** ✅ recommended | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` | **0** |
| WETH | `0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9` | 0.001 |

UMA's own Sepolia USDC has a **zero final fee**, so the adapter's per-request cost is just the
proposer bond we choose (settable, and can be small on testnet). Design consequence: the adapter
gains a bond-currency address + a funded balance, and "who pays adapter gas" (already an open
decision) extends to "who funds the bond". This would have surfaced mid-wave-2 otherwise.

### Oracle scope revision — UMA first, Chainlink demoted to optional (jay, 2026-08-03)

jay's read: Chainlink is too limited on Sepolia for Verex's markets. **Confirmed by counting the
actual seed.** Chainlink Sepolia feeds are live (ETH/USD = $1,856.90, BTC/USD = $62,968.10 at
time of check), but a feed only helps if a market's resolution *is* that number:

| Seeded market | Chainlink-answerable on Sepolia? |
|---|---|
| Will ETH close above $10,000 in 2026? | ✅ ETH/USD feed |
| Will Bitcoin dominance drop below 40%? | ❌ no dominance feed (needs total mkt cap, not BTC/USD) |
| Will the Fed funds rate be below 3%? | ❌ no macro feed on Sepolia |
| Stablecoin law · KR referendum · World Cup · IMO gold · humanoid robots · hottest year · Coachella | ❌ all event/subjective |
| All 3 groups (HR Derby · World Series · TIME PotY) | ❌ all event/subjective |

**1 of 13 markets** suits Chainlink; **13 of 13** suit UMA's `YES_OR_NO_QUERY` (confirmed
supported on Sepolia). Chainlink is therefore a strict subset of what UMA already covers for this
market set.

**Decision:** Stage 3 (UMA) becomes the *primary* oracle work and ships in wave 2. Stage 2
(Chainlink) drops to **optional** — build it only to satisfy the §1.4 "≥1 market per adapter"
milestone using `eth-above-10k-2026`, or defer it entirely. This removes ~1–2d from wave 2.
A5 (operator-SPOF) closes on UMA alone.

### Bond currency — deposit spec for UMA on Sepolia

UMA charges two things per price request: a **final fee** (fixed, set by UMA per currency) and a
**proposer bond** (we choose). Both must be paid in a currency on UMA's `AddressWhitelist` —
which Verex's own MockUSDC is not on.

| Candidate | Final fee | Can we obtain it ourselves? |
|---|---|---|
| UMA's test USDC `0x1c7D4B19…9C7238` | **0** | ❌ operator balance 0; `mint`/`allocateTo` both revert — needs an external UMA faucet |
| **Sepolia WETH** `0x7b79995e…98E7f9` ✅ **chosen** | 0.001 WETH | ✅ **yes** — canonical WETH9, `deposit()` is callable, wraps Sepolia ETH 1:1 |

**WETH wins on self-service**, not on price: UMA's USDC is cheaper (zero final fee) but we cannot
mint it and would be blocked on an external faucet. WETH we create ourselves from the Sepolia ETH
jay is funding anyway, so it adds **no new token to acquire** — the adapter's bond currency
becomes a wrapping step, not a dependency.

**What jay deposits: Sepolia ETH only.** Suggested ~0.5 ETH to the staging operator
`0xABDB93C5642f3342D5195fcf8c1A735e32266d8B`, covering:

| Purpose | Rough need |
|---|---|
| 3 contract deploys (wave 2) + ~32-tx fresh seed (wave 3) | ~0.2 ETH |
| UMA final fees + bonds — wrapped to WETH by us, **recoverable** on undisputed settlement | ~0.15 ETH (13 markets × [0.001 fee + 0.01 bond]) |
| Headroom | remainder |

Bonds and final fees return to the proposer when a request settles undisputed, so the WETH
portion is a float, not a burn. Bond size is a demo-tuning knob — 0.01 WETH is arbitrary and can
go lower; it only needs to be non-trivial enough that disputing is meaningful.

### G5 result — operator needs funding before wave 2 (checked 2026-08-03)

Staging operator `0xABDB93C5642f3342D5195fcf8c1A735e32266d8B` holds **0.0496 ETH** — under the
runbook §7 comfort line (~0.05) *for a re-seed alone*, before three contract deploys. Wave 2
also needs the UMA bond token above. **Fund before wave 2 opens**; waves 0–1 are unaffected
(no Sepolia spend).
