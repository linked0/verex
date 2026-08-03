# Hybrid AMM + CLOB (Vertex-style liquidity)

**Goal:** combine a constant-product **AMM** with the existing **CLOB** so every market has
**always-on liquidity** — solving the cold-start / empty-order-book problem.

> Priority: **earlier than the default MM-agent slot** — jay wants this mechanism early.
> Modeled on **Vertex Protocol's** hybrid design (not the actual Vertex/Uniswap code).

## Why
New or low-volume markets on a pure order book suffer the **"empty order book"** problem: no
makers → huge bid-ask spread → traders can't fill without heavy slippage. An AMM curve
(`x·y=k`) mathematically covers prices from 0 to ∞, so there's **always a price** to trade.

## Design (Vertex model, adapted to Verex)
Two components, merged into one book:
- **CLOB** — the existing CTFExchange order book (EIP-712 signed limit orders, filled on-chain)
  plus the MM agent.
- **AMM** — native **constant-product pools** (`x·y=k`, Uniswap-V2-style math) holding
  YES/NO position-token + collateral liquidity. Own smart contracts (not the Uniswap protocol).

**Liquidity mapping** — read the on-chain pool balances (`x`, `y`); using `x·y=k`, compute the
execution price for any order size; **overlay** that curve onto the order book as *virtual
resting orders* (to a trader it looks like limit orders fill every price tick).

**Smart routing** — a market order is matched against **combined depth** (real limit orders +
AMM virtual orders) and **split** to whoever offers the best price (e.g. buy 10: 3 vs limit
orders, 7 vs the AMM) → lower slippage than either venue alone.

**Slo-mo fallback** — if the off-chain matcher/MM is down, traders bypass it and trade
**directly against the on-chain AMM**, keeping the exchange decentralized / censorship-resistant.

## Adaptation notes (Verex specifics)
- Verex trades **CTF YES/NO ERC-1155** position tokens, not generic ERC-20 — pools would be
  YES↔collateral / NO↔collateral (or a single YES↔NO pool).
- This **extends the MM Agent** (currently constant-probability quotes): the AMM is the
  on-chain, always-on complement to the off-chain maker.
- Verex has no Rust sequencer; the **liquidity-mapping + routing** could live in the MM agent
  or the API (off-chain), kept simpler than Vertex's sequencer.

## Extreme-probability slippage — CPMM limitation (added 2026-07-17)
*Source: jay's "extreme probabilities" note, pasted in session 2026-07-17 (no source file;
this section is the canonical copy).*

In a prediction market **price = probability** ($0.90 token ⇒ 90%). "Extreme probabilities"
means the tails — near $0.99 (near-certain) or $0.01 (near-impossible).

**The problem with pure `x·y=k` there:** the CPMM hyperbola is flat around $0.50 but bends
toward its asymptotes at the tails. At $0.95, even a small buy walks the curve so steeply
that the price jumps toward $0.99 — the user saw a **spot price** of $0.95 but gets an
**execution price** of $0.98–0.99. Massive price impact exactly where prediction markets
spend most of their life (markets converge to the tails as resolution nears).

**Structural mismatch:** `x·y=k` prices the range 0→∞, but binary outcome tokens are
**bounded to $0–$1**. The curve "covering every price" (the Why section above) is real, but
most of that coverage is wasted on prices that can never occur, while the usable tail region
gets the worst part of the curve.

**Mitigation options (decide before building the pools):**
1. **Hybrid/flattened curve** — a StableSwap-style invariant (Curve Finance's approach,
   adapted to the 0–1 bound) that stays flatter at the tails, cutting tail slippage.
2. **LMSR** — the classic prediction-market scoring rule, mathematically built for bounded
   probability assets; already noted as the MM-agent evolution path
   (design §2.2.11 / §8), so choosing it here would converge the two tracks.
3. **Pragmatic first cut** — keep `x·y=k` but have the router/UI enforce a max-price-impact
   guard at the tails, and lean on CLOB depth (MM agent quotes) there; revisit the curve
   after measuring real slippage.

**Dev items:**
- [x] **Slippage simulation** — script that, for each candidate curve (`x·y=k`, flattened,
  LMSR), plots execution price vs order size at spot $0.50 / $0.90 / $0.95 / $0.99 —
  quantify the tail penalty before committing
  → done 2026-08-03: [`packages/api/scripts/sim-amm-slippage.ts`](../../packages/api/scripts/sim-amm-slippage.ts),
  results + recommendation in [`docs/analysis/2026-08-03-amm-curve-slippage-sim.md`](../analysis/2026-08-03-amm-curve-slippage-sim.md)
  (CPMM quotes >$1.00 at the tails; StableSwap resists repricing and still crosses $1 at depth;
  **LMSR recommended**, tail guard kept regardless)
- [ ] **(you) Curve decision** — pick 1/2/3 above based on the simulation (this supersedes
  the bare "x·y=k vs LMSR" open question below)
- [ ] **Tail guard** — regardless of curve: max price-impact check in smart routing +
  slippage warning in the trade UI at extreme prices

## Open questions
- **AMM curve:** `x·y=k` (Uniswap V2, as requested) **vs LMSR** (classic prediction-market AMM,
  already noted as the MM-agent evolution path). Start with `x·y=k` per the request.
  **→ 2026-07-17: sharpened by the extreme-probability slippage section above** — pure
  `x·y=k` is a poor fit for 0–1-bounded tokens at the tails; run the slippage simulation
  before locking the curve in.
- Pool topology for binary outcomes: YES↔collateral + NO↔collateral, or one YES↔NO pool?
- Where does liquidity mapping + smart routing run — on-chain, MM agent, or API?
- Slo-mo fallback contract path + how the off-chain venue cedes to it.

## Features
- [ ] **Extreme-probability handling** — slippage simulation → curve decision → tail guard
  (see the CPMM-limitation section above; do this **before** building the pools)
- [ ] **Constant-product AMM pools** — native `x·y=k` pools for YES/NO positions + collateral
- [ ] **Liquidity mapping** — compute virtual orders from pool balances; overlay on the book
- [ ] **Smart routing** — split market orders across CLOB + AMM for best price
- [ ] **Slo-mo fallback** — direct on-chain AMM trading when the off-chain path is down
- [ ] (you) Decide `x·y=k` vs LMSR, pool topology, and where routing lives
