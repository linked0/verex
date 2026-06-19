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

## Open questions
- **AMM curve:** `x·y=k` (Uniswap V2, as requested) **vs LMSR** (classic prediction-market AMM,
  already noted as the MM-agent evolution path). Start with `x·y=k` per the request.
- Pool topology for binary outcomes: YES↔collateral + NO↔collateral, or one YES↔NO pool?
- Where does liquidity mapping + smart routing run — on-chain, MM agent, or API?
- Slo-mo fallback contract path + how the off-chain venue cedes to it.

## Features
- [ ] **Constant-product AMM pools** — native `x·y=k` pools for YES/NO positions + collateral
- [ ] **Liquidity mapping** — compute virtual orders from pool balances; overlay on the book
- [ ] **Smart routing** — split market orders across CLOB + AMM for best price
- [ ] **Slo-mo fallback** — direct on-chain AMM trading when the off-chain path is down
- [ ] (you) Decide `x·y=k` vs LMSR, pool topology, and where routing lives
