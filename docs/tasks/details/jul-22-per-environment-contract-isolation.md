# Verex — Per-environment contract isolation (Jul 22 design)

- **Source:** jay's feedback 2026-07-22, immediately after today's cloud deploy: sharing
  one Sepolia backbone between local dev and the cloud test server worked, but only via a
  workaround — jay's read is that this isn't a good long-term approach, and asked for it
  to be written up before deciding what to do about it.
- **Status:** 🟡 proposed, not implemented. Nothing about today's deploy has been undone or
  redone — this documents the plan for next time, pending jay's decision on whether to redo
  today's deploy now or leave it as-is until production exists.

## What happened today, and why it's a workaround rather than a repeatable path

Today's cloud deploy reused the exact Sepolia backbone already deployed and seeded for
local testing, instead of deploying a fresh one for the test server. That only worked
because of a manual side-step, not because the normal flow supports it:

- `seed.ts`'s on-chain calls (`prepareCondition`, `addOperator`, `exchange.approve`, …)
  are **not idempotent** — re-running them against a backbone that's already been
  prepared reverts (`"condition already prepared"`, the same failure mode documented in
  [jul-22-trade-resolution-latency-ux.md](jul-22-trade-resolution-latency-ux.md)).
- So the cloud DB couldn't be populated by just running `seed.ts` normally against the
  shared backbone — it had to be populated by dumping the already-seeded rows out of the
  local DB and restoring them directly into Cloud SQL (`ChainConfig`/`Market`/`Outcome`/
  `PricePoint`), skipping `seed.ts`'s on-chain calls entirely via the new `SKIP_SEED` flag
  added to `deploy.sh` today.
- That's a one-off manual step, not something `deploy.sh` can repeat on its own. Every
  future redeploy of the test server would hit the same non-idempotency and need the same
  workaround again — or `SKIP_SEED` would need to become the permanent default, which
  defeats the purpose of `seed.ts` being able to seed a deploy on its own.

Beyond the mechanical inconvenience, sharing one backbone also mixes environments that
should stay separate: local test trades and cloud test-server trades currently settle
against the *same* contracts, the *same* operator, and the *same* liquidity — there's no
isolation between "I'm messing around locally" and "this is the shared server other people
might look at." That gets strictly worse once a real production environment exists —
production must never share contracts, an operator key, or liquidity with test/staging.

## Recommended direction

Each environment gets its **own** independently deployed CTF backbone (own
`USDC_ADDR`/`CTF_ADDR`/`EXCHANGE_ADDR`, own operator key, own demo mnemonic):

- **Local anvil** — already isolated by nature. `seed.ts` deploys a brand-new backbone on
  every `pnpm --filter @verex/api db:reset` (no `USDC_ADDR` etc. set locally), so this
  needs no change.
- **Cloud test server** — deploy its own dedicated backbone: `forge script
  DeployCTF.s.sol --broadcast` against the same Sepolia RPC/operator, update
  `packages/contracts/.env` with the new addresses, then run `deploy.sh`'s **normal**
  seed path (no `SKIP_SEED`, no dump/restore). This makes the test-server deploy
  self-contained and repeatable again — cost is the one-time deploy gas + the ~32-tx seed
  time (already budgeted for in the runbook).
- **Production** (whenever it's built) — its own separate backbone entirely, its own
  operator key and secrets, never shared with test/staging. Likely a different/more
  permanent network decision at that point too (mainnet vs. a testnet), out of scope for
  this doc.

## What this changes, concretely

- `SKIP_SEED` (added today in `deploy.sh`) becomes a **break-glass/recovery tool** — e.g.
  "the cloud DB got wiped, restore it from a backup without redeploying contracts" — not
  the normal deploy path once each environment has its own backbone.
- No code changes needed to support this — `ChainConfig` is already a DB row written at
  seed time, so the mechanism already supports one backbone per environment; today's
  sharing was a one-time manual choice, not a structural limitation.
- Demo wallets: the *mnemonic* (and therefore the 5 addresses) can still be reused across
  environments if convenient — an address isn't tied to one deployment — but each
  environment's copy of that address will hold **separate** balances/positions/approvals,
  since those live on that environment's own contracts. Local and cloud-test balances for
  "wallet #1" are unrelated once this is in place.

## Open question for jay

Should today's cloud deploy be **redone now** with a fresh, dedicated Sepolia backbone
for the test server (discarding the copied-over local data), or is the current shared
state fine to leave as-is until a real production environment is being built — at which
point production definitely needs its own backbone, and the test server should at minimum
stop sharing with *that*? Not decided — no action taken either way until jay says which.
