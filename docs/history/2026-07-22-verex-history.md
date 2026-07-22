# 2026-07-22 — verex history

Source: continuing from [2026-07-21-verex-history.md](2026-07-21-verex-history.md) (Base
Sepolia / testnet-deploy runbook work) — no separate task/design doc, direct follow-up
from jay's live chat requests, same as most of yesterday's entries.

### testnet-deploy.md: single-address balance check instead of a 5-address loop

jay: the step-4 balance-check command should check just one address, not loop over all
5 — a spot-check is enough, especially since the funding script already waits for each
transfer's receipt before printing its hash (a silent partial failure isn't actually
possible). Replaced the `for addr in <addr1>...<addr5>; do cast balance ...; done` loop
with a single `cast balance <addr> --rpc-url $VEREX_RPC_URL --ether`, pick any one of the
5 printed addresses.

(Note: jay also sent an unrelated request mid-turn about a cloud/local top-menu
visibility config + new branch — explicitly retracted right after: "never mind ... was
for other project." Not actioned, not logged further here.)

### check-demo-balance.ts: script to spot-check demo-wallet ETH balances

jay asked for a script to check the balance of the wallet(s) `gen-demo-mnemonic.ts`
generates. Added `packages/api/scripts/check-demo-balance.ts`, same `.env`-loading +
`VEREX_RPC_URL`/`VEREX_CHAIN_ID` convention as the generator script. Mnemonic is read
only from `VEREX_DEMO_MNEMONIC` — never a CLI arg, same reasoning as `VEREX_OPERATOR_KEY`
elsewhere (argv ends up in shell history and is visible to other processes via `ps`).
Wired into `testnet-deploy.md` step 4 as the spot-check, replacing the old single-`cast
balance` command.

### seed.ts: auto-load USDC_ADDR/CTF_ADDR/EXCHANGE_ADDR from packages/contracts/.env

jay found re-`source`-ing `packages/contracts/.env` into whatever shell happens to run
the seed command error-prone (env vars don't cross terminal tabs/windows — a real gotcha
he hit firsthand: sourced in one pane, ran the seed in another, got an empty var).
`seed.ts` now loads `packages/contracts/.env` as a second `dotenv` source after
`packages/api/.env` — `dotenv`'s default `override: false` (confirmed in its own source)
means anything already set, in `packages/api/.env` or the shell, still wins — so addresses
saved there after a deploy are picked up automatically, no copy-paste or re-sourcing
needed. Runbook steps 3 and 5 updated to match.

### testnet-deploy.md: documented what running the seed command does to existing data

jay asked what happens to existing DB/chain data when the seed command runs — traced the
actual code rather than guessing. It wipes `Trade`/`PricePoint`/`Outcome`/`Market`/
`ChainConfig` every run (never additive), and on a real chain, re-running against an
already-seeded backbone reverts with `"condition already prepared"` (each market's
`questionId` is a deterministic hash of its slug) — confirmed against the vendored
`ConditionalTokens` contract's own test assertion (`CTFCycle.t.sol`), not just inference.
Documented both, plus the one exception (demo-wallet USDC balances are topped up, not
reset), directly under the seed command in the runbook.
