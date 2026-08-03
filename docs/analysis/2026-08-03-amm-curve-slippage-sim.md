# AMM curve slippage simulation — decision support (2026-08-03)

> Source feature doc: [`docs/features/hybrid-amm-clob.md`](../features/hybrid-amm-clob.md)
> ("Extreme-probability handling" — its first dev item asks for exactly this simulation before
> the curve is locked in). Script: [`packages/api/scripts/sim-amm-slippage.ts`](../../packages/api/scripts/sim-amm-slippage.ts)
> — rerun with `pnpm --filter @verex/api exec tsx scripts/sim-amm-slippage.ts`.

## Setup (comparable by construction)

- **CPMM** (`x·y=k`) and **StableSwap** (Curve n=2, A=10, value-normalized so the flat region
  sits at the current spot): pools hold **$2,000** of total value at each tested spot.
- **LMSR**: `b = 500`, chosen so marginal depth at $0.50 matches the CPMM's (`p(1−p)/b = 2p/y`).
  Capital asymmetry worth noting: LMSR's worst-case operator loss is **`b·ln 2 ≈ $347`**, while
  the pools lock the full $2,000.
- Buys of $10–$250 USDC of YES at spots $0.50 / $0.90 / $0.95 / $0.99 — the tails are where
  prediction markets spend most of their life as resolution nears.

## Results

| Spot | Order (USDC) | CPMM exec | StableSwap exec | LMSR exec | LMSR new spot |
|------|-------------|-----------|-----------------|-----------|---------------|
| $0.50 | $10 | $0.5050 | $0.5002 | $0.5050 | $0.5099 |
| $0.50 | $50 | $0.5250 | $0.5012 | $0.5238 | $0.5476 |
| $0.50 | $100 | $0.5500 | $0.5024 | $0.5456 | $0.5906 |
| $0.50 | $250 | $0.6250 | $0.5063 | $0.6011 | $0.6967 |
| $0.90 | $10 | $0.9090 | $0.9004 | $0.9010 | $0.9020 |
| $0.90 | $50 | $0.9450 | $0.9021 | $0.9048 | $0.9095 |
| $0.90 | $100 | $0.9900 | $0.9043 | $0.9093 | $0.9181 |
| $0.90 | $250 | $1.1250 ⚠️>$1 | $0.9113 | $0.9212 | $0.9393 |
| $0.95 | $10 | $0.9595 | $0.9505 | $0.9505 | $0.9510 |
| $0.95 | $50 | $0.9975 | $0.9523 | $0.9524 | $0.9548 |
| $0.95 | $100 | $1.0450 ⚠️>$1 | $0.9546 | $0.9547 | $0.9591 |
| $0.95 | $250 | $1.1875 ⚠️>$1 | $0.9620 | $0.9606 | $0.9697 |
| $0.99 | $10 | $0.9999 | $0.9905 | $0.9901 | $0.9902 |
| $0.99 | $50 | $1.0395 ⚠️>$1 | $0.9924 | $0.9905 | $0.9910 |
| $0.99 | $100 | $1.0890 ⚠️>$1 | $0.9948 | $0.9909 | $0.9918 |
| $0.99 | $250 | $1.2375 ⚠️>$1 | $1.0025 ⚠️>$1 | $0.9921 | $0.9939 |

## What the numbers say

1. **CPMM fails at the tails, hard.** At spot $0.99 a **$50** buy already executes above $1.00 —
   a token that can never pay more than $1.00. Every ⚠️ cell is a guaranteed-loss trade the
   curve happily quotes. This confirms the feature doc's structural-mismatch argument
   (`x·y=k` prices 0→∞; outcome tokens are bounded 0–1) with concrete sizes.
2. **StableSwap has flat slippage but two disqualifying traits.** (a) It still crosses $1
   ($0.99/$250 → $1.0025) — flatness delays the bound violation, it doesn't remove it. (b) The
   flatness *is* the second problem: at spot $0.50 a $250 buy moves execution only to $0.5063 —
   the curve **resists repricing**. StableSwap is built to defend a peg; a prediction market's
   price is supposed to move with information. Amplification fights price discovery exactly when
   traders bring news.
3. **LMSR respects the bound by construction and still reprices.** Execution never reaches $1
   (mathematically cannot), tail slippage is small ($0.99/$250 → $0.9921), and the "new spot"
   column shows real price movement at $0.50 (250 → 0.6967) — information moves the price,
   size doesn't break the bound. It is also the classic prediction-market scoring rule, already
   named as the MM-agent evolution path in the design doc (§2.2.11 / §8), so choosing it
   converges two tracks instead of adding a second curve model.

## Recommendation (for jay's decision — dev item "(you) Curve decision")

**Option 2 — LMSR**, with option 3's **tail guard kept anyway** (max price-impact check in
routing + slippage warning in the trade UI; cheap and curve-independent).

- Bounded 0–1 by construction; bounded operator loss (`b·ln 2`) instead of $2,000 locked per pool.
- Converges with the MM-agent evolution path instead of introducing a competing curve.
- On-chain prior art exists: Gnosis `LMSRMarketMaker` (audited, fixed-point exp/ln) — we
  integrate the pattern rather than inventing tail math. (Same clean-room stance as the CLOB:
  pattern, not code, unless the license allows import — check at implementation time.)
- Rejected: pure CPMM (quotes guaranteed-loss trades at the tails), StableSwap adaptation
  (still violates the bound at depth; amplification suppresses the price discovery a prediction
  market exists to provide).

Caveats: single-parameter sim (pool value $2,000, b=500, A=10); relative behavior is robust to
these choices but absolute slippage numbers scale with liquidity. The LMSR/pool capital
comparison is depth-matched at $0.50, which slightly flatters LMSR at the tails (its depth grows
as `p(1−p)` shrinks it… i.e. thins there — yet it *still* beats CPMM in every tail cell).
