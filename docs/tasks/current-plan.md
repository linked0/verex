# Verex — Current Plan (rolling)

> **Reset 2026-08-21 (jay).** The 2026-08-03 batch plan — CI/CD · LMSR · UMA — is archived at
> [aug-03-plan.md](aug-03-plan.md), the same way [jul-28-plan.md](jul-28-plan.md) was before it.
> **Waves 0–2 shipped and all five gates closed.** What did not happen is wave 3's verification
> tail and the CI half of task 2; those, plus everything the batch deliberately deferred (LMSR
> phase B, the indexer, Chainlink), moved to
> [../features/README.md → Backlog](../features/README.md#backlog) as **V1–V5**.
>
> **This file currently has no active task.** Deliberate, not an oversight — jay picks the next
> one ([P0](#p0)). Until then the queue below is a menu, not a commitment. Same shape as rabbit's
> rolling plan (`rabbit/docs/tasks/current-plan.md`, reset the same day), so a cold session reads
> both repos the same way.

## Table of contents <a id="toc"></a>
- [§0 — Summary (start here on a cold session)](#s0)
- [Roadmap status](#roadmap)
- [Next-work queue](#queue)
- [How this file relates to the other docs](#relations)

## 0. Summary — start here on a cold session <a id="s0"></a>
<sub>[↑ TOC](#toc)</sub>

**Where the work stands.** Verex is a working CLOB prediction market on Sepolia: CTF backbone,
Fastify API on Cloud SQL Postgres, a Polymarket-style web app, an LMSR-quoting operator maker,
and staging + prod both live on Cloud Run. The UMA oracle path is **built and deployed** — the
staging adapter points at UMA's real Sepolia `OptimisticOracleV2` — but **nothing has been
resolved through it on live Sepolia**, so audit item **A5** (operator-SPOF) is still open. That
gap is the single most valuable thing left on the board.

**What is not built,** one line each: no `ci.yml` so nothing type-checks a PR
([V2](../features/README.md#v2)); no indexer, no AA/cross-chain, no Stripe onboarding, no
`packages/mcp-server` ([V4](../features/README.md#v4)); market **group types** and
**observability** are designed but unbuilt ([V5](../features/README.md#v5)).

**History.** This doc stays short on purpose. For the blow-by-blow, follow
`docs/history/YYYY-MM-DD-verex-history.md` — latest
[2026-08-21](../history/2026-08-21-verex-history.md) (this reset, plus market-group semantics),
with the last full roadmap audit at [2026-08-18](../history/2026-08-18-verex-history.md) and the
wave 2 UMA work at [2026-08-05](../history/2026-08-05-verex-history.md) /
[2026-08-06](../history/2026-08-06-verex-history.md).

**Next step:** answer [P0](#p0) — pick one candidate. Then this file gets rewritten around it with
its own wave/gate structure, the way the archived batch plan was.

## Roadmap status <a id="roadmap"></a>
<sub>[↑ TOC](#toc)</sub>

> Carried forward from [aug-03-plan.md](aug-03-plan.md) (audited 2026-08-03, **all 10 steps
> re-audited 2026-08-18**), **spot-checked again on the 2026-08-21 reset** against `packages/*/src`,
> `packages/contracts/src`, `.github/workflows/`, `deployments.json` and `schema.prisma`. Audited
> against the code on `main`, not the commit log. The roadmap has been executed **out of order** —
> S9's deploy is live while S5 never started.

| Step | Status | Evidence / gap |
|------|--------|----------------|
| S1 Foundations | ✅ done | — |
| S2 CTF backbone | ✅ done | CTF Exchange + Gnosis CTF live on Sepolia (`packages/contracts/deployments.json`); sub-steps S2.1–S2.6 in the design doc §1.5 |
| S3 Web MVP | ✅* done, 2 gaps | Polymarket-style feed + market pages live; **no `packages/mcp-server`**, no ADR 0001 ([V4](../features/README.md#v4)) |
| S4 API + Postgres | ✅ done | Fastify `packages/api` + Cloud SQL Postgres (staging + prod) |
| S5 Indexer | ❌ not started | no `packages/api/src/indexer.ts`; the DB is written only by the API. **Dropped on purpose**, not overlooked — [V3.2](../features/README.md#v3) |
| S6 Oracle adapters + MM v1 | ◐ partial | **Refined 2026-08-21.** The 08-18 audit read as "mock only"; the manifest says otherwise — staging's `umaAdapter 0x1B45F820…` is registered against UMA's **live** Sepolia `OptimisticOracleV2 0x9f1263B8…`, and `oracleType` is a real `Market` field wired through `/create`, the market badge and `resolve.ts`. What is still true is the part that matters: **no market has been resolved end-to-end through it on live Sepolia** — the propose→dispute→vote→finalize walk in `uma-demo.ts` is proven against `MockOptimisticOracleV2`. Default resolve remains Stage-1 manual, operator-only, so **A5 stands** ([V1.2](../features/README.md#v1)) |
| S7–S8 AA / cross-chain | ❌ not started | no 4337 / 7702 / session-key / CCIP / LayerZero references under `packages/*/src` |
| S9 Deploy | ◐ partial | Cloud Run staging + prod live; **CD ✅** — `.github/workflows/deploy-staging.yml` is on `main` and `workflow_dispatch`-able (no confirmed run yet, [V1.3](../features/README.md#v1)); **CI ❌** — no `ci.yml` ([V2](../features/README.md#v2)); **Stripe ❌** |
| S10 Final | ❌ not started | — |

Structural drift from the original design (supersedes design doc §7's target layout): the MM is
**in-process** (`packages/api/src/mm.ts` — LMSR-quoting CLOB ladder), not a separate
`packages/mm-agent` worker; `packages/mcp-server` does not exist.

**Legend:** ✅ done · ◐ partial · ❌ / ⬜ not started · ⛔ blocking.

## Next-work queue — 0 active · 1 gate · 5 candidates <a id="queue"></a>
<sub>[↑ TOC](#toc)</sub>

> **Why now / Gate / Done when** per item, as in the archived plan. "Done when" is a verification
> gate — a task is not done because code exists, it is done when the stated check passes.
> Estimates are focused-work days (AI-assisted), §1.4 style. **Nothing below is committed to.**

### 0) `(you)` P0 — pick the next task ⛔ **BLOCKING** <a id="p0"></a>

**Why now:** the batch closed with no successor chosen, so every candidate is gated on one
sentence from jay.
**Done when:** jay names a candidate, this file is rewritten around it with its own gates, and the
chosen item's feature doc becomes the design source.
**Recommendation, if you want one:** **W1 — finish wave 3.** It is the only candidate that
converts work already paid for into a provable claim, it closes the roadmap's oldest open audit
item, and everything needed is already deployed. Building anything new before it means adding a
second unverified thing on top of a first.

### 1) W1 — finish wave 3: prove UMA on live Sepolia ⭐ · ~1–2d <a id="w1"></a>

**Why now:** the adapter is deployed against the real oracle and has never answered anything. Until
one market resolves through it, S6 is partial and **A5** — the MEDIUM-severity operator-SPOF, the
roadmap's biggest trust gain — stays open on a technicality that is one afternoon wide.
**Gate:** operator gas (last checked **0.1788 ETH**, comfortable under the reduced scope) and WETH
wrapped for the bond (`0x7b79995e…98E7f9`, 0.001 final fee + a ~0.01 proposer bond, both
recoverable on undisputed settlement).
**Watch for:** the fresh seed **deletes staging's `Trade`/`PricePoint`/`Outcome`/`Market` rows** —
expected for staging, but it must be a conscious call. Prod is untouched. Also expect a **one-time
price jump** on already-traded markets as LMSR centres re-derive from inventory rather than last
print — intended, not a bug.
**Done when:** one market resolved end-to-end by the live adapter with a winner redeeming, A5
closed in the audit tracker, and the staging deploy performed by the CD workflow itself rather
than by hand ([V1](../features/README.md#v1)).

### 2) W2 — `ci.yml`, the missing half of CI/CD · ~0.5–1d

**Why now:** every PR is unchecked today; the CD half already exists and proved the WIF plumbing,
so this is the cheap remainder of a task that is 80% done.
**Gate:** none — no deploy credentials belong in CI, so nothing needs provisioning.
**Done when:** a PR with a deliberate type error goes red and a clean PR goes green, including
`forge test` and `prisma validate` ([V2](../features/README.md#v2)).

### 3) W3 — market group types + probability-sum invariants · ~2–3d

**Why now:** designed 2026-08-21 in [market-groups.md](../features/market-groups.md) and the
schema cannot express it — `MarketGroup` has no `groupType`, so exclusive, directional/nested and
independent groups are indistinguishable and the normalization rules have nothing to key off.
Seeded groups (World Series, HR Derby, TIME PotY) are live and currently mis-modelled.
**Gate:** none, but it is a migration plus a normalization pass in `mm.ts` — the LMSR softmax
already sums siblings to 1, which is only correct for *exclusive* groups.
**Done when:** each group type round-trips through create → quote → trade with its own invariant
enforced, and a non-exclusive group's YES prices are allowed **not** to sum to 100%.

### 4) W4 — observability: OTel on the ChainJob worker · ~1–2d

**Why now:** [observability.md](../features/observability.md) (2026-08-17) picked the sequencing
already — the worker first, because metrics structurally cannot answer "which step is slow", and
the worker is where multi-step chain work actually stalls.
**Gate:** export target. The doc's position is OTel-first with a swappable backend (Cloud Trace
now, Datadog later), so this is a config choice, not a rewrite.
**Done when:** one settled trade produces a single trace spanning API → ChainJob → chain, and the
metric-cardinality rule in the doc is respected.

### 5) W5 — read-only DB⇄chain consistency checker · ~1d

**Why now:** the reframing that killed the indexer ([V3.2](../features/README.md#v3)) said the
real value is *observability*, cheaply had: walk recent trades, compare DB against chain, report
mismatches, **write nothing**. No schema change, no cursor, no poller. It also closes the one
genuine hole the drop analysis left — the sub-second window where a crash between `matchOrders`
returning and `updateMany` writing `CONFIRMED` could let a retry send a second `matchOrders`.
**Gate:** none.
**Done when:** the checker flags a deliberately-introduced mismatch and is silent on a clean
staging DB; the replay window has a test saying what the exchange actually does.

### 6) ~~S7–S8 AA / cross-chain, Stripe onboarding, `packages/mcp-server`~~ — **not queued**

> Real roadmap steps with no code ([V4](../features/README.md#v4)), listed so a cold session does
> not mistake their absence for an oversight. They are further from the demo's claim than anything
> above, and none of them is blocked on a decision — only on being chosen.

## How this file relates to the other docs <a id="relations"></a>
<sub>[↑ TOC](#toc)</sub>

| Doc | What it is | When to write to it |
|---|---|---|
| **this file** | the *current, living* state — what is active, what is next | when the active task or the queue changes |
| [../features/README.md](../features/README.md) | per-feature design index + the [Backlog](../features/README.md#backlog) of unfinished and deferred work; the design document & roadmap are appended below it | when a feature's status changes |
| `../history/YYYY-MM-DD-verex-history.md` | append-only audit trail — what happened and why | as work happens, not at session end |
| [aug-03-plan.md](aug-03-plan.md) · [jul-28-plan.md](jul-28-plan.md) | superseded plans, kept verbatim | when a plan is retired — never edited afterwards |
| [../runbooks/](../runbooks/) | how to actually run a thing (deploy, UMA adapter, local testing) | when a procedure changes |

Rule of thumb: if it is *dated*, it belongs in history. If it is *per-feature*, it belongs in the
features index. If it is *what to do next*, it belongs here. If it is *a procedure you will repeat*,
it belongs in a runbook.
