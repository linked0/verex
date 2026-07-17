# Markets as Tokens — Outcome Shares as Composable Assets

**Idea:** a prediction market's outcome shares are not platform-internal records but
**freely transferable standard tokens** — so the whole ecosystem's DeFi stack (AMMs, bots,
lending) composes with them automatically.

*Source: jay's "Markets as tokens" note (Kalshi × Solana SPL example), pasted in session
2026-07-17 (no URL — this doc is the canonical copy).*

## 1. The Kalshi × Solana example (from the note)
- **Traditional:** "Yes" is a row in Kalshi's DB — it cannot leave the platform.
- **Tokens:** the user's wallet holds e.g. `KALSHI-RATE-CUT-YES` as an SPL token — visible
  in Phantom, transferable to a friend, tradable even while Kalshi's servers are down.
- **Money legos:** because it follows the chain's token standard, services Kalshi never
  built integrate for free — DEX listing (Raydium/Orca), existing trading bots arbitraging
  venues (**tighter spreads**), lending against outcome tokens as collateral.
- **Why liquidity improves:** the market draws on the whole ecosystem's capital, not one
  platform's user base → tighter spreads + **pricing accuracy** (prices track true
  probabilities better).

## 2. Where Verex already stands — and the gap
- **Already true:** Verex outcome shares are **CTF ERC-1155 tokens** — real on-chain assets,
  transferable wallet-to-wallet. "Markets as tokens" is half-built into the backbone.
- **The gap: composability.** Ethereum DeFi composes with **ERC-20**, not ERC-1155 —
  external AMMs (Uniswap), lending markets, and most bots can't take 1155 positions
  directly. Polymarket hit the same wall (their ecosystem grew wrapped-1155 adapters).
- So the actionable version of this note for Verex is: **an ERC-20 wrapper for YES/NO
  positions** that unlocks the external money-lego layer.

## 3. Dev considerations
| # | Item | Notes |
|---|------|-------|
| 1 | **Wrapper research** (~0.5d) | Survey wrapped-1155 patterns (Polymarket ecosystem adapters, generic ERC-1155→20 wrappers); per-outcome wrapper (1 ERC-20 per YES/NO of a condition) is the standard shape |
| 2 | **`WrappedOutcome` contract PoC** | wrap/unwrap between CTF 1155 balance and an ERC-20; Foundry tests for the round trip + redeem-after-resolution path |
| 3 | **External-listing demo** | seed a testnet Uniswap pool with wrapped-YES ↔ USDC; show a swap executed by a party that knows nothing about Verex — composability proven |
| 4 | **(you) Scope decision** | Is external composability in scope before S6, or post-roadmap? It *competes for liquidity* with the internal hybrid AMM ([hybrid-amm-clob.md](hybrid-amm-clob.md)) — see trade-off below |

## 4. Trade-offs / open questions
- **Liquidity fragmentation:** an external Uniswap pool and the internal AMM/CLOB split the
  same liquidity. Counter-argument (from the note): external venues bring *new* capital and
  bots arbitrage the venues back into line — fragmentation vs expansion is an empirical
  question; the smart-routing layer could even include external pools as a third venue.
- **Extreme-probability caveat still applies:** a generic `x·y=k` Uniswap pool has the same
  tail-slippage problem documented in
  [hybrid-amm-clob.md](hybrid-amm-clob.md) (extreme-probability section) — external listing
  doesn't escape it.
- **Redemption stays home:** wrapped tokens must unwrap back to CTF to redeem after
  resolution — the wrapper is a trading surface, not a settlement path.
- **Regulatory note:** Kalshi is a regulated venue tokenizing carefully; free-floating
  outcome tokens change the compliance surface. Fine for Verex (testnet/demo), worth one
  line in any write-up.

## Status
Backlog / exploratory — post-S2; revisit when the hybrid AMM lands. Listed in the
[features README](README.md) Categories table.
