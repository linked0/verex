# 2026-08-03 — verex history

> Source docs: [`docs/runbooks/deploy.md`](../runbooks/deploy.md) (deploy procedure) and
> [`docs/tasks/current-plan.md`](../tasks/current-plan.md) (the scope table audited below).
> Both entries are direct chat requests from jay — no separate task file.

### deploy: staging brought up + redeployed to `main` @ 33252ff

jay asked to deploy the latest code to staging. Staging was **down** (`staging-down.sh` state:
`verex-db` STOPPED / activation-policy NEVER, `verex-api` scaled to zero), and `verex-web` was
still on the 2026-07-29 revision — missing the `/portfolio` static-cache fix, the home-page
visitor notification, and the 🔮 project prefix.

Ran `staging-up.sh` then `SKIP_SEED=1 ./scripts/deploy.sh` (runbook §10 day-2 path). `SKIP_SEED=1`
is mandatory here: the backbone is already seeded, and `seed.ts` is non-idempotent — it wipes DB
rows and its on-chain calls revert with `"condition already prepared"`. Result: `verex-api`
`00012-wh8`, `verex-web` `00007-568`, both verified (`/health` 200, `/`, `/how-to`, `/create`,
`/portfolio` all 200; `/markets` and `/market-groups` return real rows, so SKIP_SEED left the data
intact). Per jay's call, staging is **left up** (~$40-65/mo) rather than taken back down.

**Gotcha worth remembering:** `gcloud sql instances patch --activation-policy ALWAYS` took ~11
minutes and blew past gcloud's client-side wait, exiting non-zero with a "taking longer than
expected" error. That is **not** a failure — `gcloud beta sql operations wait <op-id>` confirmed
`DONE`. Because `staging-up.sh` runs under `set -e`, the timeout aborts the script *before* its
second step, so the API never gets its always-on flags. Anyone hitting this must finish the
`gcloud run services update --min-instances 1 --no-cpu-throttling` step by hand, or staging ends
up half-up — the exact state the runbook warns drains the MM books (2026-07-29 prod incident).
Verified after the deploy that `minScale=1` / `cpu-throttling=false` survived the redeploy, and
that the web service kept all three env entries (`API_URL` preserved alongside the two Telegram
ones — the single-`--set-env-vars` gotcha from 2026-08-02).

### docs(tasks): scope-table status audit in current-plan.md

jay asked to mark each task in [`current-plan.md`](../tasks/current-plan.md)'s scope table as
complete or not. Audited against the code on `main` rather than the commit log, and recorded the
evidence inline in the doc so the claim stays checkable.

All four tasks (A multi-outcome, B create-market, C ChainJob queue, D how-to page) are
implemented, as is the rev-2 CLOB execution model — which was added as its own table row, since it
was adopted after the original scope was written and had no row of its own.

**One real gap:** A.4 called for replacing `walletSummary`'s sequential per-outcome `balanceOf`
loop with a single `balanceOfBatch` multicall. The loop is still at `packages/api/src/trade.ts:79`.
Left Task A marked ✅ Done with the sub-item flagged — the task's actual deliverable works; this is
a performance follow-up, and it matters more now that groups turned "2 outcomes per market" into N.

**Also recorded:** open question 1 was never explicitly answered — the implementation settled it.
`BookPanel` is a read-only depth widget, so there is no user-facing limit-order form. That matches
the recommended option, but it was decided by building, not by a review comment, so the doc now
says so explicitly instead of leaving the question looking open.

### docs(features): README roadmap status refresh (S1–S10 audited)

jay confirmed planning the next phase from `docs/features/README.md`, but its status line still
read "S2 (current) · S3–S10 planned". Audited each step against the code and replaced it with a
dated status table: S2/S3/S4 done (S3 minus `packages/mcp-server` + ADR 0001), S9 partial (deploy
live, Stripe/CI-CD missing), S5/S6/S7/S8/S10 untouched. Also recorded the structural drift: MM is
in-process in `api/src/mm.ts` (no `packages/mm-agent`), and the roadmap ran out of order (S9
before S5/S6). The old §1.4 checkboxes are left as-is; the new table is marked authoritative.

Next-work decision (jay): work through the queue **with confirmation at each step** — README
refresh first (this entry), then the features in a confirmed order starting from the
hybrid AMM+CLOB curve decision.

### analysis: AMM curve slippage simulation → LMSR recommended

First step of the hybrid AMM+CLOB track (the feature doc requires this before any pool code).
Built `packages/api/scripts/sim-amm-slippage.ts` — exact math for CPMM (`x·y=k`), StableSwap
(Curve n=2, A=10, value-normalized), and LMSR (b=500, depth-matched to CPMM at $0.50) — and ran
buys of $10–$250 at spots $0.50/$0.90/$0.95/$0.99. Results + memo:
`docs/analysis/2026-08-03-amm-curve-slippage-sim.md`.

**Findings:** CPMM quotes guaranteed-loss trades at the tails (a $50 buy at spot $0.99 executes
above $1.00); StableSwap delays but still crosses the $1 bound at depth AND resists repricing
(a $250 buy at $0.50 moves execution only to $0.5063 — amplification fights price discovery);
LMSR respects the 0–1 bound by construction, still reprices, and has bounded operator loss
(b·ln2 ≈ $347 vs $2,000 locked in a pool). **Recommendation to jay: LMSR + curve-independent
tail guard.** Decision is jay's (dev item "(you) Curve decision") — awaiting his call.

### docs: roadmap status table moved README → current-plan.md

jay's call: the dated status-refresh table is planning content, so it belongs in
`docs/tasks/current-plan.md` rather than the long-lived feature index. Moved it there as a
"Roadmap status (2026-08-03)" section (plus the agreed next-work order); `features/README.md`
keeps only the corrected one-line status keying + a pointer marking the moved table as
authoritative. Treating `current-plan.md` as the *rolling* current-plan doc from here on.

### docs(tasks): next-work queue detailed + current-plan fresh start

jay asked for the 4 queued tasks in detail and approved a fresh start for the plan file. Added a
"Next-work queue — detailed breakdown" (scope, key decisions, estimates, done-when gates per
task: AMM+CLOB in two phases with LMSR pending jay's gate; CI/CD with WIF auth + the
staging-up.sh timeout fix folded in; S5 indexer re-scoped chain-first→**reconciler** since the
jul-28 rev made the DB the source of truth, Pub/Sub deferred as over-engineering; S6
Chainlink+UMA adapters closing audit A5). Then split the file: the completed jul-28 plan is
frozen at `docs/tasks/jul-28-plan.md` (scope table + evidence kept with it), and
`docs/tasks/current-plan.md` restarted as the rolling plan (roadmap status + queue + A.4
carry-over note, which jay is running in a separate session).

### docs(tasks): batch design for all 4 tasks + UMA/gas preflight

jay switched delivery mode to **one batch** (all 4 tasks at once) and asked for a design+review
first, plus a tidy of `current-plan.md`. Key finding: "all at once" can't mean four parallel
streams — 3 of 4 touch `schema.prisma` and 2 of 4 add contracts, which collide in migration
history and in a backbone whose seed is non-idempotent. Designed it as **4 waves**
(0 CI+one combined migration → 1 off-chain LMSR/indexer pair → 2 contracts in one deploy sitting
→ 3 staging re-seed + verify), ~8–11d vs ~9–13d serial; the real win is one design pass and one
staging verification, not parallelism. Added a conflict map, 6 reviewed risks, and a 5-gate §0.

**Preflight results (closed 2 gates myself):**
- **G4 UMA on Sepolia ✅** — `OptimisticOracleV2` at `0x9f1263B8…dD3e88C`, verified via UMA's
  `networks/11155111.json` *and* live `cast` calls (`defaultLiveness()=7200`, matching `finder()`).
  `YES_OR_NO_QUERY` supported. No chain migration needed — the batch's biggest scope risk is dead.
- **New constraint found:** UMA requires bonds in a **whitelisted** currency and Verex's MockUSDC
  is not on the list (`isOnWhitelist=false`). The adapter must post a separate whitelisted token;
  UMA's own Sepolia USDC (`0x1c7D4B19…9C7238`) has a **zero final fee**, so it's the cheap choice.
  Would have surfaced mid-wave-2 otherwise.
- **G5 operator gas ❌** — staging operator holds **0.0496 ETH**, under the runbook's ~0.05 line
  for a re-seed alone, before three contract deploys. Must be funded before wave 2 (waves 0–1
  spend nothing on Sepolia).

### decision: UMA-first oracle, WETH as bond currency

jay's read that Chainlink is too limited on Sepolia — **confirmed by counting the seed**: only
`eth-above-10k-2026` is feed-answerable (ETH/USD live at $1,856.90); the other 12 markets are
event/subjective (or need feeds Sepolia lacks, e.g. BTC *dominance* ≠ BTC/USD). UMA's
`YES_OR_NO_QUERY` covers all 13, so Chainlink is a strict subset for this market set.
**Stage 3 (UMA) becomes primary and ships in wave 2; Stage 2 (Chainlink) drops to optional**
(build only to satisfy the §1.4 per-adapter milestone, or defer) — saves ~1–2d, and A5 closes on
UMA alone.

**Bond currency chosen: Sepolia WETH**, not UMA's test USDC. USDC is cheaper (zero final fee vs
0.001 WETH) but the operator holds 0 and `mint`/`allocateTo` both revert — it needs an external
faucet. WETH is canonical WETH9 with a callable `deposit()`, so we wrap it ourselves from the
Sepolia ETH being funded anyway: **no new token to acquire**. Deposit spec written into the plan
— jay funds ~0.5 ETH to `0xABDB93C5…266d8B`; the WETH portion is a recoverable float since bonds
and fees return on undisputed settlement.

### docs(analysis): UMA optimistic-oracle explainer

jay asked to understand how UMA actually runs before we build the adapter. Wrote
`docs/analysis/2026-08-03-uma-optimistic-oracle-explainer.md`: the "assume honesty, punish lies"
concept, the full request→propose→liveness→settle/dispute flow as a diagram, who plays each role
for Verex, the `YES_OR_NO_QUERY` value encoding (1e18/0/0.5e18 → CTF `reportPayouts` [1,0]/[0,1]/[1,1]),
and why the question text in `ancillaryData` is the load-bearing part.

**Framing worth keeping:** UMA doesn't make Verex "trust UMA" — it changes the assumption from
"the operator is always honest" to "if the operator lies, at least one watcher with money at stake
notices within the 2h liveness window." That weaker assumption is what closes audit item A5.
All parameters in the doc were read live from Sepolia (liveness 7200s, ancillary limit 8192 bytes)
rather than copied from UMA's docs. Also recorded 4 open design decisions (custom liveness,
who proposes, event-based requests, and a `DISPUTED` UI state — a disputed market sits for days
and must not render as "resolving…").

### decision: indexer dropped from the batch — the worker was already idempotent

jay asked why the indexer is needed; checking the code showed **my own justification didn't hold**.
The "crash mid-settlement diverges DB from chain" argument fails because `SETTLE_MATCH` is already
idempotent across retries (`book.ts:651-659` skips fills whose trades are `CONFIRMED`) and
`onFailed` compensates by reversing DB fills — so `worker.ts`'s stuck-RUNNING recovery re-runs
safely. What survives is a sub-second window (the idempotency check reads the DB, not the chain),
whose blast radius is **unverified** — a test, not a subsystem. Other divergence sources are thin:
demo keys live only in Secret Manager, manual `cast` calls are rare, reorgs untracked anyway.

**Reframe that drove the call:** an indexer is *observability*, not *correctness*, for Verex today
— and that value is cheaply had via a read-only consistency checker (no schema, no cursor, no
poller). Dropped from the batch; **revisit after wave 2**, when the pool contract and UMA dispute
flows (which can change an answer days later) create state that genuinely needs reconciliation.
Not wrong, just early.

**Batch is now 3 tasks** (CI/CD, LMSR, UMA), ~6–9d down from ~8–11d after this cut plus the
earlier Chainlink demotion. Noted honestly in the plan that with the indexer gone wave 1 has a
single workstream — the wave structure is now sequencing-with-gates, not parallelism.

### insight: the UMA↔Verex connection is one argument in prepareCondition

jay asked how UMA actually cooperates with Verex on Sepolia. Traced it: the two systems never
talk — the adapter is a translator, and it plugs in at exactly one place. `prepareCondition`'s
first argument is the **only** address CTF will accept `reportPayouts` from
(`market-create.ts:34-37`, operator today → adapter address instead). That's the whole integration
surface on the CTF side.

**Why existing markets can't migrate is arithmetic, not policy:** `conditions.ts:17-22` shows
`conditionId = keccak256(oracle, questionId, outcomeSlotCount)` — the oracle is hashed into the
condition's *identity*, so changing it yields a different conditionId, different token IDs, and a
market with none of the old one's liquidity. Added an end-to-end table (create → trade → close →
request → propose → liveness → settle → reportPayouts → redeem) to the explainer doc.

**Implementation consequence:** the liveness window separates the request from the payout report,
so today's single RESOLVE job becomes **two jobs with a delay**. `ChainJob.runAfter` — built for
retry backoff — already does exactly this, so no new infrastructure. Two properties fall out:
resolution becomes permissionless (the adapter holds no discretion, so anyone can trigger the
settle step), and the operator can propose but no longer decide unilaterally — which is the
concrete mechanism closing audit A5.

### finding: no node needed for UMA — but Sepolia's DVM is real, which shapes the demo

jay assumed UMA needs "some node to set the initial decision and others to challenge and vote."
Corrected: **there is no node.** Proposer and disputer are just EOAs calling contract functions;
voters are UMA's own token holders on their DVM, which we never touch. The only long-running
process is Verex's existing ChainJob worker.

**Checked what a dispute actually escalates to on Sepolia** — the Finder resolves `Oracle` to the
real `VotingV2` (`0xd6Fc66…02F76`), *not* the MockOracle, and that contract has **7.1M test UMA
staked** with prior request history. So disputes genuinely resolve — but by strangers, on a ~48h
round cadence, about a Verex question they have no context for (plausible outcome: "unresolvable"
0.5e18).

**Demo posture decided:** happy path is the demo (propose → liveness → settle → redeem), with
`setCustomLiveness` shortened to ~120s so it completes in minutes rather than 2 hours. Dispute
becomes a documented capability proven by a fork/unit test — not a live demo whose timing and
outcome we don't control. Prep list for jay is just ETH + WETH, plus a second funded wallet only
if we want to stage a dispute ourselves.

### design: oracle choice is per-market at creation — plus the override question

jay asked whether the operator can pick manual-vs-UMA resolution. **Yes, but only at creation** —
the oracle is `prepareCondition`'s first argument, so it's a create-form field; it can't change
later because the oracle is hashed into `conditionId`.

The more interesting third option: since CTF only ever sees *one* oracle address (the adapter),
any policy can live **inside** the adapter — UMA normally, with a constrained operator override.
That's what Polymarket's `UmaCtfAdapter` does, and the March-2025 governance attack (a whale used
~25% of UMA voting power to force a $7M market to resolve against the facts) is why.

**Recorded honestly:** the override does *not* fully close A5 — it keeps a lever for the operator.
What changes is that the lever becomes exceptional, constrained, and on-chain-visible rather than
the only path. Suggested constraints: usable only after UMA settles `0.5e18` or times out with no
proposal, plus event emission and a timelock. Pure UMA stays the right default for the Sepolia
demo; the override matters only if mainnet becomes a goal. Also decided to seed a **mix** of
operator-oracle and UMA-oracle markets so both paths are demonstrable and the oracle badge has
something to show.
