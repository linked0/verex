# 2026-07-17 — verex history

**Source docs:** [docs/features/hybrid-amm-clob.md](../features/hybrid-amm-clob.md)
(updated; the new section is the canonical copy of jay's "extreme probabilities" note pasted
in-session — no prior source file).

### hybrid-amm-clob: add extreme-probability slippage section + dev items
From jay's note on CPMM behavior at extreme probabilities: added a section to
[docs/features/hybrid-amm-clob.md](../features/hybrid-amm-clob.md) explaining why pure
`x·y=k` misfits 0–1-bounded prediction tokens (steep hyperbola tails → spot $0.95 but
execution $0.98–0.99), with three mitigation options (StableSwap-style flattened curve /
LMSR / keep CPMM + tail guard) and three dev items (slippage simulation across candidate
curves, curve decision gated on the simulation, max-price-impact tail guard in routing+UI).
Sharpened the existing "x·y=k vs LMSR" open question to require the simulation before
locking the curve — sequenced **before** pool implementation.

### features: add "Markets as tokens" composability item
From jay's Kalshi×Solana "markets as tokens" note (pasted in-session): new
[docs/features/markets-as-tokens.md](../features/markets-as-tokens.md). Key framing: Verex
outcome shares are already on-chain tokens (CTF ERC-1155) — the gap is **ERC-20
composability**, so the actionable item is a `WrappedOutcome` ERC-20 wrapper (research →
PoC + round-trip/redeem tests → testnet Uniswap listing demo). Recorded the trade-offs:
liquidity fragmentation vs new-capital inflow (external pools could become a third venue
for smart routing), the extreme-probability tail-slippage caveat carrying over, and
wrapper-as-trading-surface (redemption still unwraps to CTF). Registered in the features
README Categories table as post-S2 exploratory.

### features: add Zod runtime-validation item
From jay's Zod note (pasted in-session): new
[docs/features/zod-validation.md](../features/zod-validation.md) — boundary validation
(env/RPC JSON/request bodies) + `z.infer` types from one schema. Adoption map per package
(shared schemas in `@verex/sdk`, CLI env now, api at S4 via fastify-type-provider-zod,
mm-agent config at S2.5, web NEXT_PUBLIC). Noted the CLI env schema folds in security-audit
item A2 (chainId guard). Zod is not yet a dependency anywhere (verified). Registered in the
features README Categories table as "Runtime validation (Zod)".

### features README: surface extreme-probability handling in the category index
Per jay, the new feature is now visible in the
[features README](../features/README.md) Categories table — appended to the existing
**Hybrid AMM + CLOB** row (the feature lives inside that category per the
Category → Feature → to-do hierarchy) rather than as a new category.
