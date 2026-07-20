# Verex — Portfolio page + Market resolution (Jul 20 design)

- **Source:** jay's request 2026-07-20 (chat): (1) a Portfolio menu for general accounts,
  (2) resolution for admin — either an admin page, or inline in the market page when the
  operator (account #0) is active, whichever is more efficient.
- **Status:** ✅ **implemented + verified 2026-07-20** (API via curl, UI via browser:
  buy → resolve as #0 → WON badge/P&L → redeem → balance +$27.78). Addendum per jay:
  the portfolio also shows **cost basis and P&L per position** (from the Trade table:
  Σ BUY − Σ SELL) and the **current balance** — both included in the build.
- **Addendum 2 (same day):** activity **history** on the portfolio — full BUY/SELL/REDEEM
  feed with **realized P&L** per redemption. Implemented via a `REDEEM` TradeSide enum
  value + redeem-time trade rows + `GET /wallet/:index/history`; verified on the losing
  path (buy $20 YES → resolve NO → history shows `lost −$20.00`).
- **Building blocks that already exist:** SDK `reportPayouts` / `redeem` (proven in
  `cli/src/demo.ts` steps 5–6), DB `Market.status` + `resolvedOutcomeId` (currently always
  `OPEN` / null), `/wallet/:index` already returns positions.

## Decision: inline admin controls, no separate admin page (recommended)

There is no real auth — "admin" is just anvil account #0 by convention. A separate admin
page would add a route + nav for what amounts to two buttons per market. Instead:

- The demo-wallet picker gains an **"Operator #0 (admin)"** entry.
- When wallet #0 is active, the market page shows a **Resolve** panel; the trade panel is
  hidden for #0 (the operator fills orders; it shouldn't also be a customer).

Fallback if this feels cluttered later: the same Resolve panel can be lifted into an
`/admin` page listing OPEN markets — the API work is identical either way.

## Feature 2 first — Resolution (it gates portfolio's redeem UX)

### API

1. `POST /markets/:slug/resolve` — body `{outcome: "Yes" | "No", accountIndex: number}`.
   - Guards: market exists and `status === "OPEN"`; `accountIndex === 0` (403 otherwise —
     convention-auth, same trust model as the rest of the demo API).
   - On-chain: `ct.reportPayouts(questionId, outcome === "Yes" ? [1n, 0n] : [0n, 1n])`
     as operator (wallet 0). CTF rejects a second report (payout already set) — natural
     idempotency guard.
   - DB: `status = "RESOLVED"`, `resolvedOutcomeId = <winning outcome id>`, winning
     outcome price → 1.00, losing → 0.00, plus a final PricePoint so the chart ends at
     the resolution.
2. **Trade guard** (missing today): `executeTrade` rejects non-OPEN markets with 400 —
   currently nothing stops trading a resolved market against stale operator inventory.
3. `POST /redeem` — body `{accountIndex, slug}`.
   - Guards: market `RESOLVED`; index 1–9.
   - On-chain: as the user, `ct.redeem(usdc, conditionId, [1n, 2n])` (both index sets —
     losing tokens redeem for 0, so one call clears the position).
   - Returns USDC received (balance delta), for a toast in the UI.

### Web (market page)

- `status !== "OPEN"` → "RESOLVED — YES/NO" badge on the market header; TradePanel
  replaced by a note.
- Wallet #0 active + market OPEN → ResolvePanel: two buttons ("Resolve YES" / "Resolve
  NO") with a confirm step, calling `/resolve`, then router refresh.

## Feature 1 — Portfolio page

- New route `packages/web/src/app/portfolio/page.tsx` + **Portfolio** link in SiteNav.
- Client page using the existing `useWallet()` context + `GET /wallet/:index`:
  - Header: demo wallet #, address, USDC balance.
  - Positions table: market title (link), outcome, tokens, current price, value.
  - Resolved markets: value column shows the payout (winner: tokens × $1, loser: $0) and
    a **Redeem** button → `POST /redeem` → refresh balances.
  - Wallet #0: portfolio shows a short "operator inventory" note instead (its positions
    are market-making inventory across all markets — noise, not a portfolio).
- No new API needed beyond `/redeem`; `/wallet/:index` already carries the data (add
  `status`/`resolvedOutcomeId` passthrough to its positions so the page can label rows).

## Order of work + verification

| # | Item | Verify |
|---|---|---|
| 1 | `/resolve` route + DB update + trade guard | curl: resolve → 200; second resolve → 4xx; trade on resolved → 400 |
| 2 | `/redeem` route | curl: winner redeems → USDC up by token count; loser → 0 |
| 3 | Wallet picker: add operator #0 | UI shows admin entry; #0 hides TradePanel |
| 4 | Market page: ResolvePanel + RESOLVED badge | resolve via UI; badge + chart end-state |
| 5 | Portfolio page + nav + Redeem buttons | buy on #1 → portfolio shows position; resolve → redeem → balance check |

End-to-end demo script (the acceptance test): wallet #1 buys YES on a market → operator
#0 resolves YES on the market page → wallet #1's portfolio shows the win → Redeem →
USDC balance increases by the token count. All on the running local stack.

## Out of scope

- Real auth/roles (operator-by-convention only), partial redeems, resolution sourced from
  an external oracle (UMA-style), market creation UI. The `invalid` outcome (payouts
  [1,1]) is also skipped — binary YES/NO only.
