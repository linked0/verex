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

Open http://localhost:3000/create.

**Expect: no UMA option.** Local anvil has no UMA deployment, so `ChainConfig.umaAdapterAddr`
is null, `GET /config` returns `umaAvailable: false`, and the create form must offer only
operator resolution.

```bash
curl -s localhost:4000/config | jq
# { "chainId": 31337, "tradingEnabled": true, "umaAvailable": false, "umaAdapter": null }
```

**If the UMA option appears anyway, that is a bug worth stopping for.** A market created
against an adapter that does not exist is unresolvable forever — the resolver's address is
hashed into the condition id, so it cannot be repaired, only replaced.

The positive case (the option present, a market created through it, resolved end to end)
needs a Sepolia fork: [uma-adapter.md §5](uma-adapter.md).

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
