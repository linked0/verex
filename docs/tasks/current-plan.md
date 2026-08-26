# Verex — Current Plan (rolling)

> **Reset 2026-08-21 (jay).** The 2026-08-03 batch plan — CI/CD · LMSR · UMA — is archived at
> [aug-03-plan.md](aug-03-plan.md), the same way [jul-28-plan.md](jul-28-plan.md) was before it.
> **Waves 0–2 shipped and all five gates closed.** What did not happen is wave 3's verification
> tail and the CI half of task 2; those, plus everything the batch deliberately deferred (LMSR
> phase B, the indexer, Chainlink), moved to
> [../features/README.md → Backlog](../features/README.md#backlog) as **V1–V5**.
>
> **P0 answered the same day — the active track is cross-repo.** jay picked **J2, "the mandated
> trader"**: an agent running in rabbit that forms its own view of a verex market, trades on it
> under an on-chain funding bound, and self-redeems after resolution. The **scenario, the seam and
> the build order live in rabbit's plan** (`rabbit/docs/tasks/current-plan.md`); this file owns the
> verex half — **W1** (promoted out of the candidate list) and the new **W6** and **W7**. One fact,
> one home: read the seam there, read what verex builds here.
>
> **Why verex should want W6 regardless of rabbit.** Every order today is signed by a server-held
> demo wallet (`accountIndex 1..9`, keys in Secret Manager). W6 is the point where verex stops
> being a custodian and can accept a counterparty it does not hold keys for — a product claim on
> its own, and the first genuinely S7-adjacent work in the repo.

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

**Next step (revised 2026-08-25):** [W6](#w6) — J2's phase 1, and it is **not** gated on W1. The
re-seed rule says W1 before the first *staging* run, not before W6 is built; local work runs on
`anvil` against the mock. W1 moved to J2 phase 6. Worth running W1's **smoke probe** early though —
one `initialize` on the staging adapter with Sepolia WETH — because W1 is the only item here that
has never worked.

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

## Next-work queue — 3 active (J2) · 4 candidates <a id="queue"></a>
<sub>[↑ TOC](#toc)</sub>

> **Why now / Gate / Done when** per item, as in the archived plan. "Done when" is a verification
> gate — a task is not done because code exists, it is done when the stated check passes.
> Estimates are focused-work days (AI-assisted), §1.4 style. **W1, W6 and W7 are committed** —
> they are verex's share of the J2 track. W2–W5 remain a menu.

### 0) `(you)` P0 — pick the next task ✅ **closed 2026-08-21** <a id="p0"></a>

jay picked the cross-repo **J2** track. Verex's share of it, in order: **W1 → W6 → W7**. The
recommendation on the table had been W1 alone; J2 keeps W1 first for a **different and stronger
reason** than the one originally given — see the sequencing note in W1 below.

### 1) W1 — finish wave 3: prove UMA on live Sepolia · **J2 phase 6** · ~1–2d <a id="w1"></a>

**Why now:** the adapter is deployed against the real oracle and has never answered anything. Until
one market resolves through it, S6 is partial and **A5** — the MEDIUM-severity operator-SPOF, the
roadmap's biggest trust gain — stays open on a technicality that is one afternoon wide.

**Why it must come before the first *staging* run — revised 2026-08-25.** The 08-21 reading was
"W1 before W6". The constraint is narrower than that: the **fresh seed** deletes staging's
`Trade`/`PricePoint`/`Outcome`/`Market` rows, so re-seeding *after* an external agent has traded
**on staging** leaves its journal citing rows that no longer exist. That says nothing about local
work. W6 and all of J2's rabbit-side phases run on `anvil` against `MockOptimisticOracleV2`, which
resolves instantly and can be wiped by `./scripts/reset.sh` at will — so **W6 is built first and
W1 lands immediately before staging is used for real** (J2 phase 6). Testnet testing gets redone at
the end regardless; doing it early would be doing it twice.

**Pulled forward instead — the smoke probe (minutes).** W1 is the only item here that has never
worked, and what it depends on belongs to a contract verex did not write. One `initialize` on the
staging adapter with Sepolia WETH answers the only question that can genuinely surprise: *does the
live oracle accept a request from this adapter at all?* Run it early, in parallel with anything.

**One addition to W1's scope, owed to J2 rather than to W1 itself:** the fresh seed should include
**at least one short-dated UMA market** — something that can plausibly resolve inside a demo
session rather than in 2026. Without it, J2 phase 4 has nothing to watch.
**Gate:** operator gas (last checked **0.1788 ETH**, comfortable under the reduced scope) and WETH
wrapped for the bond (`0x7b79995e…98E7f9`, 0.001 final fee + a ~0.01 proposer bond, both
recoverable on undisputed settlement).
**Watch for:** the fresh seed **deletes staging's `Trade`/`PricePoint`/`Outcome`/`Market` rows** —
expected for staging, but it must be a conscious call. Prod is untouched. Also expect a **one-time
price jump** on already-traded markets as LMSR centres re-derive from inventory rather than last
print — intended, not a bug.
**The steps, in order** (moved here from rabbit's plan 2026-08-25 — W1 is verex's item, so its
execution detail lives here and the cross-repo plan links to it):

| # | Step | Watch for |
|---|---|---|
| 1 | **Fund the reward token.** `deposit()` on Sepolia WETH `0x7b79995e…98E7f9`; make sure the adapter holds it / has approval for the reward | **MockUSDC will not work** — it is not on UMA's `AddressWhitelist`, and `UmaCtfAdapter`'s own `@param rewardToken` docblock says so. Whether `reward: 0` sidesteps the whitelist entirely is **unverified** — check it during the smoke probe |
| 2 | **Fresh staging seed** including **≥1 short-dated UMA market** — pass a small `liveness` to `initialize` (`0` keeps UMA's 7200s default) | This is the step that deletes `Trade`/`PricePoint`/`Outcome`/`Market`. Nothing an external agent has done on staging survives it — hence "before the first staging run". Expect the one-time LMSR price jump noted above |
| 3 | **Propose** an answer, posting the bond | Real UMA charges a **final fee** per currency on top of the bond (0.001 WETH here); the mock's is zero, so a bond that works on anvil can be short here |
| 4 | **Wait out liveness** — real wall-clock time, no `evm_increaseTime` | The reason J2's R-G polls instead of awaiting inline |
| 5 | **Settle** — the adapter's `resolve` calls `settleAndGetPrice` and copies the price onto the CTF condition | The adapter has no discretion. If the result is wrong, the oracle said so |
| 6 | **Winner redeems** — CTF `redeemPositions`, signed by the **holder** | Needs a little Sepolia ETH on the holder. Trading costs an external maker nothing; only this leg does |
| 7 | **Close A5** in the audit tracker, and let the CD workflow perform the staging deploy rather than doing it by hand ([V1](../features/README.md#v1)) | — |

**Four ways the mock is more permissive than the live oracle** — every one of them passes on anvil
and can fail here:

| | `MockOptimisticOracleV2` | UMA on Sepolia |
|---|---|---|
| **Collateral** | `requestPrice` just does a `transferFrom` — no check | Reward token must be on UMA's `AddressWhitelist`. **MockUSDC is not**; Sepolia WETH `0x7b79995e…98E7f9` is. `UmaCtfAdapter`'s own docblock says so. Whether `reward: 0` sidesteps it is **unverified** |
| **Final fee** | zero — the only stake is the bond | charged per currency on top of the bond, so locally-correct bond amounts can be wrong |
| **Liveness** | `DEFAULT_LIVENESS` 7200s, skippable with `evm_increaseTime` | real wall-clock time. Any code that awaits settlement inline passes locally and hangs here |
| **Disputes** | an on-chain jury: `vote` / `finalizeVote`, settles immediately | escalates to the DVM — a ~2-day staked commit/reveal round testnet does not reliably provide |

**Take the undisputed path.** Following from the last row: the dispute branch is **not walkable on
Sepolia**, which is exactly why the mock's jury exists. Propose → let liveness expire → settle. Do
not design the demo around a dispute being resolved.

**Done when:** one market resolved end-to-end by the live adapter with a winner redeeming, A5
closed in the audit tracker, and the staging deploy performed by the CD workflow itself rather
than by hand ([V1](../features/README.md#v1)).

### 2) W6 — accept a counterparty verex does not custody · **ACTIVE, J2 phase 1** · ~2–3d <a id="w6"></a>

> **Status 2026-08-26: W6.1–W6.4 are built** on branch `claude/j2-phase-1-2` (uncommitted).
> The consumer side landed too — rabbit's agent signs CTF orders with `@verex/sdk` and reads its
> own wallet by address. W6.5 below is still open. Walkthrough: rabbit's
> `docs/tasks/current-plan.md`, section *Built so far*.

**Why now:** J2's agent holds its own key, by design — that was the whole point of jay's call that
the agent key must not live on verex's server. So the exchange has to accept an order it did not
sign. **The codebase is closer to this than it looks:** `model Order` already carries `maker` (a
real address), `signedOrder` (Json) and a unique `orderHash`; `buildSignedOrder` then signs *on the
client's behalf* with `account(index)`. Accepting an external order is mostly **removing that
step**.

> **That last sentence was wrong, and building it proved so (2026-08-25).** There are *two* signing
> moments, not one. Resting limit orders are indeed just a deletion. But the **taker leg at
> settlement** was signed *per fill*, for amounts that only exist after matching — a client cannot
> pre-sign those. The fix was already in the contract: `matchOrders` takes `takerFillAmount`
> **separately** from the order, so one client signature for the full size settles each fill
> partially. Per-fill signing was possible only because the server held the key; the exchange never
> required it.

| | Item | Detail |
|---|---|---|
| **W6.1** | External signed orders | `POST /orders` and `POST /trade` accept a client-supplied `SignedOrder` with an arbitrary `maker`. Verify EIP-712 server-side and fail fast; the Exchange re-verifies at match. Migration: `Order.makerIndex` nullable |
| **W6.2** | Funding stops being the API's job | `ensureFunds` faucets and approves *on behalf of* the maker — impossible for a key we do not hold. For external makers it **reads and rejects**: insufficient balance or allowance is a 400, not something the server silently fixes. Add an address-scoped faucet for testnet convenience. **Note (2026-08-26):** that faucet turned out to have a second consumer — rabbit funds the *owner's smart account* with it before the agent draws its mandate, so the address it funds is often not a trader at all |
| **W6.3** | Address-scoped reads | `/wallet/:address` — balance, positions, open orders, redeems, history. Today all `/wallet/:index` |
| **W6.4** | External redeem | Verex holds no key for the holder, so it **cannot send** `redeemPositions` — the endpoint records instead of executing. The holder redeems for itself and reports the tx; verex verifies the receipt's `PayoutRedemption` (redeemer + conditionId) before writing the REDEEM row. `/config` gained `ctf` + `usdc` so the holder can build the call. Note the asymmetry: **trading costs an external maker no gas** (`book.ts:694` — the operator sends `matchOrders`), but **redeeming does** |

**W6.5 — the gap W6 creates, still open (2026-08-25).** Funds are checked **at placement**.
A demo wallet cannot betray that check because verex holds its key; an external maker can — place
a resting limit order, withdraw the USDC, and leave a book entry that looks live and can never
settle. Two sizes of fix: **re-check funds at match time** (cheap, inside the existing
transaction), or let [W5](#w5) catch it after the fact. Not fixed yet — recorded so it is a
decision rather than a surprise. Also the reason [V3.2](../features/README.md#v3)'s drop rationale
no longer holds: *"the DB is written only by the API"* stops being true here.

**Gate:** none technically. Worth deciding **O6** in the seam plan
(`rabbit/docs/tasks/current-plan.md`) — whether the agent trades against staging or a dedicated
environment — before external rows start landing in staging's DB.
**Done when:** a wallet verex has never heard of funds itself, signs an order, fills against the
operator's LMSR ladder, and reads its own position back — with **no `accountIndex` required in the
external-maker path**. Not "none anywhere": index 0 **is** the operator's LMSR maker, the
counterparty an external order fills against, and `Order.makerIndex` becomes *nullable* rather than
removed — the demo wallets keep trading unchanged. W6 is additive.

### 3) W7 — `packages/mcp-server` · **queued, J2 phase 5** · ~1–2d <a id="w7"></a>

**Why now:** it closes the S3 gap that has been open since the roadmap was written
([V4](../features/README.md#v4)), and after W6 it is genuinely **thin** — the MCP tools
(`list_markets`, `get_book`, `place_order`, `get_position`, `redeem`) wrap the same REST endpoints
the agent already uses. A second front door, not a second implementation.
**Gate:** W6. Building MCP over the index-based API would bake custody into the tool surface.
**Done when:** rabbit's agent runs unchanged against the MCP transport, and a generic MCP client
places one order without reading verex's source.

### 4) W2 — `ci.yml`, the missing half of CI/CD · ~0.5–1d

**Why now:** every PR is unchecked today; the CD half already exists and proved the WIF plumbing,
so this is the cheap remainder of a task that is 80% done.
**Gate:** none — no deploy credentials belong in CI, so nothing needs provisioning.
**Done when:** a PR with a deliberate type error goes red and a clean PR goes green, including
`forge test` and `prisma validate` ([V2](../features/README.md#v2)).

### 5) W3 — market group types + probability-sum invariants · ~2–3d

**Why now:** designed 2026-08-21 in [market-groups.md](../features/market-groups.md) and the
schema cannot express it — `MarketGroup` has no `groupType`, so exclusive, directional/nested and
independent groups are indistinguishable and the normalization rules have nothing to key off.
Seeded groups (World Series, HR Derby, TIME PotY) are live and currently mis-modelled.
**Gate:** none, but it is a migration plus a normalization pass in `mm.ts` — the LMSR softmax
already sums siblings to 1, which is only correct for *exclusive* groups.
**Done when:** each group type round-trips through create → quote → trade with its own invariant
enforced, and a non-exclusive group's YES prices are allowed **not** to sum to 100%.

### 6) W4 — observability: OTel on the ChainJob worker · ~1–2d

**Why now:** [observability.md](../features/observability.md) (2026-08-17) picked the sequencing
already — the worker first, because metrics structurally cannot answer "which step is slow", and
the worker is where multi-step chain work actually stalls.
**Gate:** export target. The doc's position is OTel-first with a swappable backend (Cloud Trace
now, Datadog later), so this is a config choice, not a rewrite.
**Done when:** one settled trade produces a single trace spanning API → ChainJob → chain, and the
metric-cardinality rule in the doc is respected.

### 7) W5 — read-only DB⇄chain consistency checker · ~1d <a id="w5"></a>

**Why now:** the reframing that killed the indexer ([V3.2](../features/README.md#v3)) said the
real value is *observability*, cheaply had: walk recent trades, compare DB against chain, report
mismatches, **write nothing**. No schema change, no cursor, no poller. It also closes the one
genuine hole the drop analysis left — the sub-second window where a crash between `matchOrders`
returning and `updateMany` writing `CONFIRMED` could let a retry send a second `matchOrders`.
**Gate:** none.
**Done when:** the checker flags a deliberately-introduced mismatch and is silent on a clean
staging DB; the replay window has a test saying what the exchange actually does.

### 8) ~~S7–S8 AA / cross-chain, Stripe onboarding, `packages/mcp-server`~~ — **not queued**

> Real roadmap steps with no code ([V4](../features/README.md#v4)), listed so a cold session does
> not mistake their absence for an oversight. **`packages/mcp-server` left this list on 2026-08-21**
> — it is now [W7](#w7). They are further from the demo's claim than anything
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
