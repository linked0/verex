# 2026-08-06 — verex

Source docs: [docs/tasks/current-plan.md](../tasks/current-plan.md) (wave 2 — UMA oracle
adapter). Continues the adapter deploy prep logged in
[2026-08-05](2026-08-05-verex-history.md).

### Fund operator with WETH for UMA bonds

**Cause:** the UMA readiness check found one real gap — the operator held 0.1765 ETH but
0 WETH, and UMA will not take MockUSDC as bond currency (`isOnWhitelist` → true only for
WETH on Sepolia). jay: "you can deposit now."
**Reasoning:** wrapping ETH via `WETH9.deposit()` is the direct path — no faucet, no
bridge, and the operator already held enough ETH. Verified preconditions before sending
rather than trusting the env: RPC chain id 11155111 matches `VEREX_CHAIN_ID`, and
`symbol()` on `0x7b79995e…E7f9` returns `WETH` (confirming the address is the real WETH9,
not a typo'd contract).
**Change:** sent `deposit()` with 0.05 ETH from the operator EOA
`0xABDB93C5642f3342D5195fcf8c1A735e32266d8B` on Sepolia. No code changed.
**Result:** operator WETH 0 → 0.05, ETH 0.2765 → 0.2264 (0.05 wrapped + ~0.000075 gas).
Both remaining UMA prerequisites (ETH for gas, WETH for bonds) are now satisfied; adapter
deploy is unblocked.

> Note: a malformed shell pipeline also fired a second, 0-value `deposit()` in the same
> step. Harmless — `deposit()` with zero value mints nothing — but it burned a little gas
> and suppressed the real tx hashes from the output, so the deposit had to be confirmed by
> reading `balanceOf` afterwards instead of from the receipt.

### Seed had no UMA market at all

**Cause:** jay asked whether a seed already existed for UMA resolution. It did not — the
seed recorded `umaAdapterAddr` into `ChainConfig` but every market it created was
operator-resolved, so a freshly seeded environment had no way to exercise the propose →
resolve path.
**Reasoning:** made it one market, not a flag on the existing ten. The UMA lifecycle needs
a bond, a proposal, and a liveness wait per market; converting the whole seed would turn
every environment reset into a multi-market UMA chore. It is also skipped silently when
the manifest has no `umaAdapter` rather than failing — the adapter must not become a hard
dependency of seeding, since most environments won't have one.
**Change:** `seedOneMarket` gained an optional `uma` argument threading through to
`createBinaryMarketOnChain`; added `UMA_SEED` (`uma-eth-above-6k-2026`) with deliberately
over-specified resolution criteria, plus `UMA_SEED_BOND`/`UMA_SEED_LIVENESS` mirroring
`group-create.ts`.
**Result:** verified on a Sepolia fork — `[4b] uma-eth-above-6k-2026 (UMA-resolved)`, with
`oracleType=UMA`, criteria stored (336 chars), `questionId == keccak256(ancillaryData)`,
the adapter holding the question at 0.01 WETH bond, and the other 31 markets untouched as
`OPERATOR`. Without an adapter the seed logs `[4b] no UMA adapter … skipping` and proceeds.

### One-command adapter deploy, and the UMA runbook split out

**Cause:** jay — "create a script to deploy the UMA adapter … show me step in deploy
markdown file and step to test in local mode." The forge script existed but the two steps
that must not be separated (deploy, then record) were still manual.
**Reasoning:** paired them in one wrapper because forge's `broadcast/run-latest.json` is
per chain id and staging/prod share Sepolia — a gap between the steps lets the next deploy
on that chain overwrite the artifact the recorder reads. Preflight refuses rather than
warns on an existing adapter (a new one cannot inherit the old one's markets) and warns
without blocking on zero WETH (deployable, but no answer can be proposed).
**Change:** `scripts/deploy-uma-adapter.sh` (`DRY_RUN`, `FORCE`, `RPC_URL` override for
forks); new `docs/runbooks/uma-adapter.md` carrying the whole procedure — prerequisites,
deploy, seed, per-market lifecycle, three local-test modes, troubleshooting table; and
`deploy.md` §2b reduced to a pointer so the procedure lives in exactly one place.
**Result:** the wrapper was exercised against a Sepolia fork end to end — preflight,
deploy, `save-uma-adapter`'s seven checks, then the seed picking the adapter up. Local
testing is documented as a Sepolia **fork** rather than plain anvil, because UMA has no
anvil deployment and a fork tests the real oracle instead of our understanding of it.
