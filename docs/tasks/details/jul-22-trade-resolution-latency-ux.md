# Verex — Trade/resolution latency UX (Jul 22 design)

- **Source:** jay's request 2026-07-22 (chat, voice): a "critical flaw" — users wait too
  long for a trade to complete, and the operator/admin waits too long for a resolution to
  complete. Asked for the best UX approach to make both feel instant. Design only, not yet
  built — jay explicitly asked for a written proposal first.
- **Status:** ✅ **#1 and #2 implemented + verified 2026-07-22** (jay approved the
  direction, with one scope clarification: pre-funding-via-seed only applies to demo
  wallets — real users still need an actual deposit flow, out of scope here). §3 (SSE
  staged progress) stays deferred per the original recommendation.
- **Why now:** invisible on anvil (auto-mine, no perceptible delay) but real on any chain
  from [testnet-deploy.md](../../runbooks/testnet-deploy.md) — Base/Ethereum Sepolia block
  times are ~2–15s per confirmation, and a single BUY can chain up to three sequential
  confirmations.

## Where the wait actually comes from

Traced both flows in the current code rather than guessing:

- **Trade (`executeTrade`, [trade.ts:71-216](../../../packages/api/src/trade.ts#L71-L216))**
  is one HTTP request that can chain up to **three sequential on-chain confirmations**
  before it returns: conditional `usdc.mint` (if the demo wallet is under-funded) →
  conditional `usdc.approve` (first trade only) → `exchange.fillOrder` (always). Each
  `await`s a real receipt — nothing is parallelized or decoupled.
- **Resolve (`ResolvePanel` → `POST /resolve` → `ct.reportPayouts`)** is a single
  confirmation — smaller problem, same UX pattern.
- **The UI already has zero staged feedback for either.** `TradePanel.tsx` and
  `ResolvePanel.tsx` both do the same thing: `setBusy(true)`, swap the button label to a
  static string (`"Submitting on-chain…"` / `"Reporting…"`), `await` the whole chain, then
  `router.refresh()`. One opaque spinner-equivalent state for what can be three real
  transactions — the button gives no indication anything is progressing, or how much
  longer it'll be.

## Recommended fix — three changes, in priority order

### 1. Pre-warm demo wallets — attack the root cause, not just the loading state (do this first)

Mint + approve don't need to happen inside the trade request at all. Demo wallet indices
are known in advance and both operations are idempotent (already conditionally skipped
once satisfied — see `trade.ts:124-132`). Extend the seed flow to also pre-approve each
demo wallet for the exchange (USDC) and the CT contract (`setApprovalForAll`), the same
place `seed.ts` already tops up their USDC balance
([seed.ts:320-328](../../../packages/api/prisma/seed.ts#L320-L328)).

- **Effect:** the common-case BUY drops from *up to 3* sequential confirmations to **1**
  (`fillOrder` only) for every demo wallet, every time. This is a real latency fix, not a
  UI trick — it removes work, it doesn't just hide the wait better.
- **Trade-off:** a wallet that somehow drops below the funding/approval threshold again
  (shouldn't happen in the demo's closed flow, but the conditional checks already in
  `trade.ts` stay as a correctness safety net either way — no removal needed there, this
  is purely additive pre-provisioning).

### 2. Optimistic UI update on submit — perceived-instant feedback for the wait that's left

Even a single real confirmation is 2–15s on testnet — worth hiding via the standard
trading-UX pattern (this is how Polymarket/every DEX front-end handles it): the moment the
user clicks Buy/Sell/Resolve, update the UI to the *expected* end-state immediately,
before the request resolves, then reconcile against the real response:

- **Trade:** `TradePanel` already computes `tokensOut`/`usdcOut`/the new implied price
  client-side before submit (used for the "Est. tokens" preview). On click: immediately
  show the position/price change as **pending** (e.g. a dimmed/pulsing row or a "Pending"
  chip next to the price), disable inputs, keep the existing error path to roll back and
  show the error if the request ultimately fails. On success, the existing
  `refresh()` + `router.refresh()` reconciles it to the real values — no visible change if
  the optimistic estimate matches, which it always will except for slippage from a
  concurrent trade (rare on a demo app with no other real traders).
- **Resolve:** lower priority (operator-only, once per market, already a single
  confirmation) — same pattern if done at all: show the "RESOLVED — YES/NO" badge
  optimistically on submit rather than waiting for `router.refresh()`.
- **Trade-off:** adds a rollback path that must actually be exercised/tested (optimistic
  state showing something that then reverts on failure) — the existing `error` state in
  both panels already exists and just needs to also clear the optimistic view, not net-new
  infrastructure.

### 3. Staged progress instead of one static label — only for the cases that still chain multiple steps

After #1, the *first* trade a fresh demo wallet ever makes can still chain mint+approve+
fillOrder (pre-warming only covers wallets that went through the seed flow — fine for this
app's closed demo-wallet set, but worth having a fallback for). For that path specifically,
replace the single `"Submitting on-chain…"` label with a 1–3 step inline list ("Funding →
Approving → Filling") that lights up as each `await` in `trade.ts` completes, instead of
one opaque state for the whole chain.

- **Implementation note:** the current API is a single blocking Fastify handler with one
  JSON response — there's no streaming/progress channel today. Two ways to get step
  updates to the client, in order of how much they cost to build:
  - **(a) Cheap, no new infra:** since #1 makes this path rare (only hit if a wallet
    somehow wasn't pre-warmed), it's reasonable to just leave it as the existing single
    "Submitting on-chain…" state — a rare multi-step wait on an already-rare path may not
    justify new infrastructure. **Recommended: skip this step initially, revisit only if
    it turns out to matter in practice.**
  - (b) If it does turn out to matter: Server-Sent Events (SSE) from the trade endpoint,
    emitting a small event per step (`{step: "funding"|"approving"|"filling", done: bool}`)
    — no new dependency (SSE is plain HTTP + `EventSource`), but does require restructuring
    `executeTrade` to accept a progress callback and the Fastify route to stream instead of
    returning one JSON body.

## Order of work + verification

| # | Item | Verify |
|---|---|---|
| 1 | Pre-warm demo wallets (mint + approve) in `seed.ts` | ✅ **verified 2026-07-22** — ran the seed against a fresh local anvil, then `cast call` directly against the deployed contracts: wallet #1's USDC `allowance` to the exchange and `isApprovedForAll` were both already set before any trade. `POST /trade` (BUY) as wallet #1 advanced the chain by **exactly 1 block** (`fillOrder` only, `faucetMinted: false`) — vs. **3 blocks** (mint + approve + fillOrder) for wallet #6, which the seed loop doesn't cover (only 1-5, matching the UI's wallet picker) — a direct, empirical before/after comparison, not just code-reading. |
| 2 | Optimistic trade UI in `TradePanel` | `tsc --noEmit` clean; logic traced by hand (the `pending` snapshot is cleared before `setResult`/`setError` so the pending and confirmed/error boxes never render simultaneously). **Not visually verified in a browser** — no browser/screenshot tool available in this environment; jay should click through a BUY once to confirm the pending box renders as expected before considering this fully done. |
| 3 | Optimistic resolve UI in `ResolvePanel` (optional/lower priority) | not built — deferred, jay didn't ask for this one specifically and it was flagged lower-priority in the original proposal |
| 4 | Staged progress for the fallback (unwarmed wallet) path — **only if #1 turns out insufficient in practice** | not built — per the original recommendation, only worth doing if this turns out to matter |

## Next phase

Current status, precisely (jay confirmed this understanding 2026-07-22): trading's
remaining few-seconds wait is the **intended** state — real confirmation time for the one
now-unavoidable `fillOrder`, made to feel instant by the optimistic preview, not actually
eliminated (can't be, without claiming a trade succeeded before it's confirmed).
Resolution's few-seconds wait is **not** improved — it's the original, untouched behavior,
since §3 below was explicitly deferred rather than built. Next actionable items, in order:

1. **Optimistic resolve UI in `ResolvePanel`** (was §3/item 3 above, "optional/lower
   priority" — jay asked 2026-07-22 whether to do this now that the gap is visible on a
   real chain). Same pattern as `TradePanel`: on clicking "Confirm Yes/No", show the
   "RESOLVED — YES/NO" badge immediately (snapshotted, same drift-avoidance as the trade
   preview), reconcile via the existing `router.refresh()` on success, roll back to the
   confirm buttons on error. Small, self-contained — touches only `ResolvePanel.tsx`, no
   API change. **Not yet built — this is the next thing to do when jay says go.**
2. **Staged progress for the fallback (unwarmed-wallet) path** (§3b / item 4) — still
   explicitly conditional on #1 (pre-warming) turning out insufficient in practice. No
   action unless that happens.
3. **Real-user deposit flow** — raised by jay 2026-07-22 as a related but distinct,
   explicitly out-of-scope concern: pre-funding via `seed.ts` only works because demo
   wallets are server-held keys with known indices. A real user (external wallet, no
   server-held key) needs an actual deposit UX — bridge/on-ramp or a direct testnet-ETH +
   USDC transfer flow into their own address, plus the equivalent approve step happening
   client-side (MetaMask, not server-signed). Not designed yet — belongs with the S7
   account-abstraction/session-key track mentioned in
   [jun-19-verex-design.md](../jun-19-verex-design.md), not this doc. Flagged here only so
   it isn't lost.

## Out of scope

- Any change to the actual on-chain settlement model (still real `fillOrder`/
  `reportPayouts` calls, nothing simulated) — this is purely about perceived latency and
  reducing unnecessary chained confirmations, not changing what gets confirmed.
- WebSocket/job-queue infrastructure — SSE (§3b) is the ceiling considered here; a full
  async job system would be over-engineering for a demo app with a handful of concurrent
  users.
- Anvil-specific handling — anvil's auto-mine already makes this a non-issue locally; all
  of the above only matters once trading against a real chain (testnet or beyond).
- Real-user deposit flow — see "Next phase" §3 above; a different track entirely (real
  wallets, not server-held demo keys), not part of this design.
