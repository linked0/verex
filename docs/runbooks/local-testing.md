# Local testing — what to click, and what to expect

Manual verification of the features that only show up in a running app. It lives in
`docs/runbooks/` because that is where the "how to actually do a thing, step by step" docs
already are ([deploy.md](deploy.md), [uma-adapter.md](uma-adapter.md)) — and because
`uma-adapter.md` §5 is already the same genre. That section stays where it is (it is
UMA-specific and needs a Sepolia fork); this file covers everything testable on plain anvil.

Each check below states **what to expect**, not just what to click. A step you can't fail is
not a test.

---

## 0. Before you start — the one thing that can go badly wrong

**Use a terminal that has never sourced `packages/contracts/.env`.**

`scripts/reset.sh` reads `RPC_URL="${VEREX_RPC_URL:-http://127.0.0.1:8545}"`. If your shell
still has `VEREX_RPC_URL` from a Sepolia session, the reset does not touch anvil at all — it
points a fresh-backbone deploy at **real Sepolia**, with the real operator key that is
exported alongside it. The anvil reachability check passes, because Alchemy answers
`eth_chainId` perfectly well.

```bash
env | grep VEREX      # must print nothing
```

That one line is the whole guard. Same reason applies to `USDC_ADDR` / `CTF_ADDR` /
`EXCHANGE_ADDR`: if all three are set, the seed silently reuses them as the local backbone
instead of deploying, and dies mid-way with `returned no data ("0x")`.

---

## 1. Reset

```bash
# terminal A — leave running
anvil                                  # plain, chain id 31337, port 8545

# terminal B — the clean one
./scripts/reset.sh

# terminals C and D
pnpm --filter @verex/api dev           # :4000
pnpm --filter @verex/web dev           # :3000
```

`reset.sh` wipes the DB, re-applies every migration, deploys a fresh USDC/CTF/Exchange
backbone, seeds 10 markets and 3 groups, and funds demo wallets #1–5 with 1,000 USDC each.

**Expect:** `✅ Reset complete`. No `.env` edits and no server restarts — the API re-reads
`ChainConfig` per call, so a running server picks up the new addresses. Refresh the browser.

---

## 2. Docs — the Read-the-Docs layout

Open http://localhost:3000/docs.

| Check | Expect |
|---|---|
| Sidebar position | dark rail on the **left**, ~300px, not a right-hand card panel |
| Sidebar while scrolling | stays put; scrolls internally if the list outgrows the viewport |
| Open a doc | its own headings **nest underneath its entry** in the sidebar — not in a separate box |
| Scroll the article | the nested highlight follows the heading you are reading |
| Type in the search box | the list filters live; a nonsense query shows "No matching document." |
| Bottom of an article | Previous / Next, matching the sidebar's order |
| Breadcrumb | `Docs › <title>` above a hairline, separate from the H1 |

**Also worth confirming:** `/how-to` still renders. Its content moved into
`content/docs/how-to.ts` during the docs build-out, and the page shrank by 215 lines — a
regression there would be a move that dropped something.

**Known and intentional:** the sidebar is dark in **both** light and dark theme. It is the
single most recognisable thing about the RTD look, and a light version reads as "some
sidebar" rather than as documentation. Only the content column follows the theme.

---

## 3. Language toggle

Switch EN ↔ KO in the nav.

**Expect:** the docs, home, and nav all switch. The locale is stored in a **cookie**
(`localStorage` is a backup for a cleared cookie), and switching triggers `router.refresh()`
because server components cannot re-read a cookie on their own.

**Expect gaps, and note which:** `/create`, `/portfolio`, `/market/[slug]`, and
`/group/[slug]` are still English-only. Falling back to English is the designed behaviour,
not a bug — the useful output of this check is an up-to-date list of what still needs
translating.

**One real failure mode to watch:** switch the language, then **reload**. If the page comes
back in the other language, the cookie is not being written or not being read server-side.

---

## 4. Theme toggle

**Expect:** light ↔ dark switches immediately; the choice **survives a reload**; and there
is **no flash of the wrong theme** on first paint. That last one is the only hard part —
if you see a white flash before dark mode applies, the pre-hydration inline script is not
running early enough.

---

## 5. The oracle option on `/create` — a real test, not a look

This is the one check here that can catch an expensive bug, so it is worth understanding
what it is actually testing rather than just glancing at the form.

### 5.1 What you should see

Open http://localhost:3000/create and scroll to **Resolution source**. There are two cards:

| Card | Local anvil | Why |
|---|---|---|
| **Operator** | selected, enabled | the default; the platform reports the result |
| **UMA oracle** | **visible but greyed out**, not clickable | no adapter exists on this chain |

The UMA card must read:

> *Not available in this environment — no adapter deployed.*

**Disabled, not hidden — that is deliberate.** A hidden control teaches the reader nothing
and is indistinguishable from a component that failed to render. A disabled one with its
reason printed on it says both *this feature exists* and *here is what is missing*.

So the failure to watch for is not "the card is there". It is **the card being clickable**,
or the reason text being absent or wrong.

### 5.2 Why it is disabled — the chain of state behind that one card

Nothing about the form is hard-coded. The greyed-out state is the end of a chain that starts
on-chain:

```
no UmaCtfAdapter deployed on anvil
  → seed writes ChainConfig.umaAdapterAddr = null      (prisma/seed.ts)
  → loadChain() exposes umaAdapterAddr = null          (src/chain.ts)
  → GET /config returns umaAvailable: false            (src/index.ts)
  → CreateClient fetches it on mount and disables the card
```

Verify the middle of that chain directly:

```bash
curl -s localhost:4000/config | jq
# { "chainId": 31337, "tradingEnabled": true, "umaAvailable": false, "umaAdapter": null }
```

If `/config` says `false` but the card is enabled, the bug is in the client. If `/config`
says `true` on plain anvil, the bug is further back — something wrote an adapter address
into `ChainConfig` that does not exist on this chain (a leftover from a fork session is the
usual cause).

### 5.3 The second condition: binary markets only

The same card is disabled for a *different* reason when UMA **is** available. Add a third
outcome, and even on an environment with an adapter the card greys out with:

> *Binary markets only — set outcomes to exactly Yes and No.*

You can exercise this branch locally by reading the code path
([`CreateClient.tsx`](../../packages/web/src/app/create/CreateClient.tsx), `disabled={!umaAvailable || !isBinary}`),
but not visually — locally the first condition already fails, so you cannot tell the two
apart on anvil. That is a limitation of this check, not something to work around.

### 5.4 The real test: the UI is only a hint

A disabled button is a courtesy, not a defence. Anyone can post to the API directly, so the
check that matters is that **the server refuses too**:

```bash
curl -s -X POST localhost:4000/market-groups \
  -H 'content-type: application/json' \
  -d '{
        "title": "Will this request be rejected?",
        "category": "Crypto",
        "outcomes": [{"label":"Yes"},{"label":"No"}],
        "closesAt": "2027-01-01T00:00:00Z",
        "creatorIndex": 0,
        "liquidityPerOutcome": 5,
        "oracleType": "UMA",
        "resolutionCriteria": "Resolves YES if the request is rejected as it should be."
      }' | jq
```

**Expect `400`**, with an error naming the missing adapter:

```
UMA resolution isn't available in this environment — no UmaCtfAdapter is deployed
```

A `200` here is the serious failure. It means the UI was the only thing standing between a
user and an unresolvable market.

Two more server-side rejections worth firing while you are here — change `oracleType` to
`UMA` and:

| Change | Expected 400 |
|---|---|
| three outcomes | `…supports binary (Yes/No) markets only…` |
| `"resolutionCriteria": "yes if high"` | `resolution criteria are required … at least 20 characters` |

(On anvil the missing-adapter check fires first, so these two only surface once an adapter
exists — the fork run in [uma-adapter.md §5](uma-adapter.md) covers them, and
`scripts/uma-e2e-fork.ts` asserts both.)

### 5.5 Why this is the check worth stopping for

Every other item in this runbook fails *visibly and recoverably*. This one does not.

A market's on-chain identity is derived by hashing its resolver into it:

```
conditionId = keccak256(abi.encodePacked(oracle, questionId, outcomeSlotCount))
```

The resolver's address is therefore **part of the market's identity**, not a setting on it.
If a market is created pointing at an adapter that does not exist on that chain:

- nothing reverts at creation time — the CTF happily prepares a condition for any address;
- the market looks completely normal, and people can trade it;
- at resolution there is no contract to call, and no way to point it at a real one, because
  a different resolver computes a **different `conditionId`** — a different market holding
  none of these tokens;
- so the position tokens can never be redeemed. Not repairable, only replaceable.

That is the whole reason validation lives in `createMarketGroup` — before any transaction is
sent — rather than in the job that executes it. By the time a job runs, the mistake has
already cost money and cannot be undone.

### 5.6 The positive case

Everything above tests the *refusal*. Testing that UMA actually works — the option enabled, a
market created through it, an answer proposed, liveness elapsed, the market resolved and
redeemed — needs a real oracle, and therefore a Sepolia fork:
[uma-adapter.md §5](uma-adapter.md).

---

## 6. Hybrid AMM, Phase A (LMSR quotes)

**There is no new UI for this, and that is the design.** Phase A is off-chain quoting
([`packages/api/src/lmsr.ts`](../../packages/api/src/lmsr.ts),
[`mm.ts`](../../packages/api/src/mm.ts)) — it changes *where the operator's ladder sits*,
not what the page looks like. Nothing is labelled "AMM" anywhere, and no component was
added. So this section is about **observing behaviour**, not finding a control.

### 6.1 Always-on liquidity

Open any freshly seeded market. **Expect** a populated book on both sides with no trades
having happened — 5 bid levels and 5 ask levels, 1¢ apart, weighted toward the mid. That is
the cold-start problem being solved: a pure order book would be empty here.

```bash
curl -s localhost:4000/markets/<slug>/book | jq '{bids: .bids|length, asks: .asks|length}'
```

### 6.2 The quote tracks exposure, not the last print

Buy some YES. **Expect** the center to move up and the whole ladder to re-post around it.

Now the part that distinguishes LMSR-on-exposure from the old "center follows last traded
price": a fill **between two users** that never touched the operator's ladder must leave the
quote where it was. The operator's exposure did not change, so its quote should not either.

### 6.3 Group prices sum to 1 by construction

Open a multi-outcome group and read the outcome prices.

```bash
# prices are Prisma Decimals, so they arrive as strings — tonumber before adding
curl -s localhost:4000/market-groups/<slug> \
  | jq '[.markets[].outcomes[] | select(.label=="Yes") | .price | tonumber] | add'
# ≈ 1
```

**Expect ≈ 1.0**, before and after trading. Then buy one member and re-read: every *other*
member's price should have drifted **down**. Prices are one n-way softmax, so probability
drains out of the losers automatically — there is no separate renormalisation pass that
could be skipped or double-applied.

**Expect prices to stay inside (0, 1)** even at the extremes. This is why LMSR replaced the
constant-product curve the feature doc originally proposed: near the tails a CPMM quotes a
Yes token *above* $1.00, which no rational buyer pays, since $1 is the most it can ever pay
out. That is a shape problem, not a tuning problem —
[hybrid-amm-clob.md](../features/hybrid-amm-clob.md) has the full argument.

### 6.4 What Phase A is not

There is **no on-chain AMM pool**, no smart routing, and no split fills between a pool and
the book. `packages/contracts/src/` has no AMM contract. If you are looking for a UI
difference because you expected a pool, that is why there isn't one.

---

## 7. Trading, end to end

With demo wallets #1–5 at 1,000 USDC: buy, sell, check `/portfolio`, resolve a market as
the operator, redeem.

**Expect** the resolved market to pay $1.00 per winning share and $0 per losing one, and
`/portfolio` to reflect it after the redeem.

---

## 8. Not testable on plain anvil

| Feature | Why | Where |
|---|---|---|
| UMA market creation + resolution | UMA has no anvil deployment | [uma-adapter.md §5](uma-adapter.md) — Sepolia fork |
| Cloud Run / Cloud SQL behaviour | env-specific by definition | [deploy.md](deploy.md) |
