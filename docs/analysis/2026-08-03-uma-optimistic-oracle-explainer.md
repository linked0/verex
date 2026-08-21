# How UMA's Optimistic Oracle works — and how Verex will use it

> Written 2026-08-03 for jay, ahead of building `UMAOptimisticOracleAdapter.sol` (wave 2 of the
> [batch plan](../tasks/aug-03-plan.md)). Parameters below were read live from Sepolia, not
> copied from docs — see "Verified values" at the end.
>
> Companion to [`docs/features/oracle.md`](../features/oracle.md) (the 3-stage oracle plan) and
> the [curve simulation memo](2026-08-03-amm-curve-slippage-sim.md).

## The core idea: "optimistic" means *assume honesty, punish lies*

A traditional oracle asks: **"how do we get the truth on-chain?"** Chainlink answers it by paying
a decentralized network to continuously publish a number. That works beautifully for *"what is
ETH/USD right now?"* and not at all for *"did South Korea reach the World Cup quarterfinals?"* —
there is no feed for that, and there never will be, because the answer is a fact about the world,
not a market price.

UMA answers a different question: **"how do we make lying more expensive than telling the
truth?"** Nobody publishes anything continuously. Instead:

1. Someone **asserts** an answer and puts money behind it (a *bond*).
2. A timer runs. If nobody objects before it expires, **the assertion simply becomes the truth**.
3. If someone *does* object, they also put money down, and a vote decides who was right. The
   loser's bond goes to the winner.

The word **optimistic** is the whole design: the system optimistically assumes the proposed
answer is correct and only does expensive work (a vote) in the rare case someone disputes.
In the happy path — which is nearly all of the time — resolution costs one transaction and a
waiting period, with **no vote at all**.

This is the same trick as an optimistic rollup: act first, allow challenges, verify only on
challenge.

## The flow, step by step

```
  Verex adapter                    UMA OptimisticOracleV2                Anyone
       │                                    │                               │
       │  1. requestPrice(                  │                               │
       │       YES_OR_NO_QUERY,             │                               │
       │       timestamp,                   │                               │
       │       "Did South Korea reach       │                               │
       │        the 2026 WC quarterfinals?  │                               │
       │        YES=1, NO=0",   ← ancillaryData (≤ 8192 bytes)              │
       │       WETH, reward)                │                               │
       ├───────────────────────────────────►│                               │
       │                                    │                               │
       │  2. setBond(...) / setCustomLiveness(...)   ← optional tuning      │
       ├───────────────────────────────────►│                               │
       │                                    │                               │
       │                                    │  3. proposePrice(answer=1)    │
       │                                    │◄──────────────────────────────┤
       │                                    │     posts finalFee + bond     │
       │                                    │                               │
       │                          ┌─────────┴─────────┐                     │
       │                          │  LIVENESS WINDOW  │  default 7200s (2h) │
       │                          │  "any objections?"│                     │
       │                          └─────────┬─────────┘                     │
       │                                    │                               │
       │         ┌──────────────────────────┴───────────────────────┐       │
       │         │ nobody disputed                 someone disputed │       │
       │         ▼                                                  ▼       │
       │  4a. settle() → answer = 1              4b. escalate to UMA's DVM  │
       │      proposer gets back                     (UMA token holders     │
       │      bond + finalFee + reward                vote, ~2–4 days)      │
       │                                              loser's bond is split │
       │◄───────────────────────────────────┤         winner / UMA Store    │
       │  5. adapter reads the settled answer, calls CTF reportPayouts      │
       │     → market resolves, winners redeem (existing Verex flow)        │
```

### Who plays each role for Verex

| Role | Who | Why |
|---|---|---|
| **Requester** | `UMAOptimisticOracleAdapter` (called by the RESOLVE `ChainJob` when a market's `closesAt` passes) | Automates what the operator does manually today |
| **Proposer** | The operator, initially — later anyone | On testnet there is no organic proposer community, so the operator seeds the answer |
| **Disputer** | Anyone | This is the security. Even one honest watcher makes lying unprofitable |
| **Final arbiter** | UMA's DVM (token-holder vote) | Only invoked on dispute |

**The key thing to internalize:** Verex is not "trusting UMA" the way it currently trusts the
operator. It's trusting that *if the operator proposes a wrong answer, at least one person with
money at stake will notice within 2 hours.* That's a much weaker assumption than "the operator is
always honest" — which is exactly why this closes audit item **A5** (operator SPOF).

## What the answer actually looks like

UMA doesn't have a "boolean" type. Binary questions use the `YES_OR_NO_QUERY` identifier
(**confirmed supported on Sepolia**) and encode the answer as a fixed-point number:

| Proposed value | Means |
|---|---|
| `1e18` | YES |
| `0` | NO |
| `0.5e18` | Unresolvable / ambiguous — split 50-50 |

That maps cleanly onto CTF's `reportPayouts`: YES → `[1,0]`, NO → `[0,1]`, ambiguous → `[1,1]`
(each side redeems half). The 50-50 case matters more than it looks — it's the escape hatch for a
badly-worded question, and Verex should surface it in the UI rather than treating it as an error.

**`ancillaryData` is where the question text lives** (≤ 8192 bytes on Sepolia). This is the part
that deserves real care: it is the *only* thing a disputer reads when deciding whether the answer
is right. A vague question produces a disputed or 50-50 resolution. Verex's markets already carry
a full legal-sentence `title` (the jul-28 design deliberately kept the on-chain question separate
from the short `groupLabel` chip) — that title becomes the ancillary data, plus explicit
resolution criteria and a source.

## Why this fits Verex specifically

Of the 13 seeded markets, **1** can be answered by a Chainlink feed and **13** by UMA — see the
[oracle scope revision](../tasks/aug-03-plan.md) for the per-market count. Prediction markets are
mostly questions about the world, and UMA is built for exactly that shape of question. Chainlink
and UMA aren't competitors here; they answer different kinds of question, and Verex's question mix
happens to be almost entirely UMA-shaped.

## What "≥1 market per adapter" means

From the roadmap §1.4, step S6. Read aloud: **"at least one market per adapter."**

It is the *milestone* — the completion test — for the oracle step. S6 counts as done when **each
oracle adapter has resolved at least one real market end-to-end**: request → propose → liveness →
settle → `reportPayouts` → a winner actually redeems USDC. Not "the contract compiles", not "the
unit tests pass" — a real market, really resolved, really paid out.

It's deliberately a *floor*, not a coverage target. It doesn't mean "migrate every market to
adapters"; it means "prove the path works at least once, for real." One market is enough evidence
that the wiring is correct; the rest is repetition.

Since Chainlink is being demoted to optional, this milestone effectively becomes **≥1 market for
the UMA adapter**, with the Chainlink half satisfied only if we build it.

## Verified values (read from Sepolia, 2026-08-03)

| Thing | Value |
|---|---|
| `OptimisticOracleV2` | `0x9f1263B8f0355673619168b5B8c0248f1d03e88C` |
| `defaultLiveness` | `7200` seconds (2 hours) |
| `ancillaryBytesLimit` | `8192` bytes |
| `YES_OR_NO_QUERY` supported | ✅ true |
| Bond currency (chosen) | Sepolia WETH `0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9`, final fee `0.001` |
| Verex MockUSDC whitelisted? | ❌ `false` — cannot be used for bonds |

## How UMA and Verex actually connect (the wiring)

UMA and Verex **never talk to each other**. UMA has no idea what CTF is; CTF has no idea what UMA
is. The `UMAOptimisticOracleAdapter` is a **translator** that sits between them — and it plugs in
at exactly one parameter.

### The connection point: one argument in `prepareCondition`

Today, [`market-create.ts:34-37`](../../packages/api/src/market-create.ts) registers the operator
as the market's oracle:

```ts
const conditionId = getConditionId(args.operator, questionId, 2n);
await args.ct.prepareCondition(args.operator, questionId, 2n);
//                             ^^^^^^^^^^^^^ the oracle
```

That first argument is **the only address CTF will ever accept `reportPayouts` from** for this
condition. Swap it for the adapter's address and the adapter becomes the market's oracle:

```ts
await args.ct.prepareCondition(UMA_ADAPTER_ADDR, questionId, 2n);
```

That single change is the entire integration surface on the CTF side.

### Why existing markets can *not* be migrated — the math, not a policy

[`conditions.ts:17-22`](../../packages/sdk/src/conditions.ts) shows the oracle is hashed **into the
condition's identity**:

```
conditionId = keccak256(abi.encodePacked(oracle, questionId, outcomeSlotCount))
```

So changing the oracle doesn't reconfigure a market — it **produces a different conditionId**,
therefore different position token IDs, therefore a different market with none of the old one's
liquidity or positions. "Only new markets opt in" isn't a cautious policy choice; it's arithmetic.

### End-to-end, with a real Verex market

Take `kr-world-cup-quarterfinals-2026` — *"Will South Korea reach the 2026 World Cup
quarterfinals?"* Purely subjective; no price feed can ever answer it.

| # | Where | What happens |
|---|---|---|
| 1 | **Verex create** | `prepareCondition(adapter, questionId, 2)`. The adapter is now the only address that can report this market's payouts. |
| 2 | **Verex trading** | Completely unchanged — CLOB, LMSR ladders, `splitPosition`, `matchOrders`. **UMA is not involved at all** while the market is open. |
| 3 | **`closesAt` passes** | Verex's RESOLVE `ChainJob` fires and calls `adapter.requestResolution(questionId)`. |
| 4 | **Adapter → UMA** | Adapter calls `OptimisticOracleV2.requestPrice(YES_OR_NO_QUERY, timestamp, ancillaryData, WETH, reward)`, where `ancillaryData` carries the question text + resolution criteria. |
| 5 | **Propose** | Operator (or anyone) calls `proposePrice` with `1e18` (YES) or `0` (NO), posting `finalFee + bond` in WETH. |
| 6 | **Liveness** | 2 hours. Anyone may dispute. Verex shows a "resolving" state. |
| 7 | **Settle** | `settle()` — UMA now holds a final answer. |
| 8 | **Adapter → CTF** | A second Verex job calls `adapter.resolveMarket(questionId)`; the adapter reads UMA's settled price and calls `ct.reportPayouts(questionId, [1,0] or [0,1])`. **This is the only step where the adapter's oracle role is used.** |
| 9 | **Verex redeem** | Unchanged — winners call `redeemPositions`. |

### The implementation consequence worth planning for

Steps 3 and 8 are **separated by the liveness window**, so today's single RESOLVE job must become
**two jobs with a delay between them**. Verex already has the mechanism: `ChainJob.runAfter`
(added for retry backoff) schedules future work, so `UMA_REQUEST` simply enqueues `UMA_SETTLE`
with `runAfter = now + liveness + buffer`. No new infrastructure — the queue built for backoff
happens to be exactly what a dispute window needs.

Two nice properties fall out:

- **Resolution becomes permissionless.** Anyone can trigger step 8, because the adapter just reads
  UMA's settled answer — it holds no discretion. Contrast today, where only the operator's key can
  resolve anything.
- **The operator can no longer lie unilaterally.** It can *propose* a wrong answer, but the
  2-hour window lets anyone dispute it and take its bond. That is the concrete mechanism that
  closes audit item **A5**.

## What jay needs to prepare — and what he does *not*

**There is no node to run.** A common assumption is that proposing/disputing/voting needs
infrastructure. It does not:

| Role | What it actually is | Who provides it |
|---|---|---|
| Proposer | An EOA calling `proposePrice(...)` | **us** — the operator wallet, one tx |
| Disputer | An EOA calling `disputePrice(...)` | anyone; nobody on a testnet unless we do it |
| Voter | UMA token holders staking on UMA's own DVM | **UMA, not us** — we never touch this |

The only long-running process involved is Verex's existing `ChainJob` worker, which already runs.
No keeper, no node, no daemon.

### The checklist

1. **Sepolia ETH** — ~0.5 to the operator (gas for deploys, seed, and UMA txs). Currently 0.0496.
2. **WETH** — wrapped from that ETH by us, for final fees (0.001/request) + bonds. Recoverable.
3. **A second funded wallet — only if we want to *demonstrate* a dispute.** On a testnet there is
   no organic disputer, so the security story ("anyone can challenge the operator") is real in
   mechanism but dormant in practice. Showing it working means disputing our own proposal from a
   different address, which needs its own ETH + WETH.
4. **Nothing else.**

### Reality check on disputes at demo time (verified 2026-08-03)

Sepolia's DVM is **not** a stub — the Finder resolves `Oracle` to the real `VotingV2`
(`0xd6Fc66…02F76`), which has **7.1M test UMA staked** and prior request history. So a dispute
*can* resolve. But it would be voted on by whoever those stakers are, on a 48-hour-ish round
cadence, about an obscure Verex question they have no context for — plausibly landing on
"unresolvable" (`0.5e18`).

**Recommended demo posture:** make the **happy path** the demo — propose, wait out liveness,
settle, redeem. Use `setCustomLiveness` to shorten the window (e.g. 120s) so the whole flow
completes in minutes instead of two hours. Treat dispute as a *documented capability* with a
unit/fork test proving the adapter handles an overturned answer, rather than a live demo whose
timing and outcome we don't control.

## Open design decisions this raises

1. **Liveness per market.** 2 hours is UMA's default. For a demo, shorter is nicer to show live;
   for a real market closing on a contested question, longer is safer. `setCustomLiveness` makes
   this per-request — worth exposing as a create-market field.
2. **Who proposes, and when.** Simplest: the RESOLVE job requests *and* proposes in one operator
   transaction. Cleanest long-term: request only, and let anyone propose. Start with the former.
3. **Event-based vs timestamp requests.** OOv2 supports `setEventBased`, which skips the
   timestamp semantics and suits "did X happen by date Y" better than a price-at-time reading.
4. **Dispute handling in the UI.** A disputed market sits in limbo for days. The DB needs a
   `DISPUTED` state and the market page needs to say so honestly, rather than showing "resolving…"
   for four days.
5. **⚠️ A failure mode today's code has no concept of: the proposal gets *overturned*.**
   `RESOLVE`'s `onFailed` ([`resolve.ts`](../../packages/api/src/resolve.ts)) handles exactly one
   bad outcome — *"the chain never learned the result"* — and compensates by re-opening the market.
   UMA introduces a second one: the chain learns the **opposite** of what the operator proposed.
   That is not a re-open; the market must resolve to the other side, and any UI that already
   showed a winner has to walk it back. This needs an explicit design decision in wave 2 — the
   safest shape is to never show a winner until UMA settles, which is why item 4's state is
   load-bearing rather than cosmetic.
