# Runbook: deploy verex's contracts to a public testnet

Companion to the code change in `packages/api/src/chain.ts` and `scripts/deploy.sh` (see
`docs/history/2026-07-21-verex-history.md` for why). Chain-agnostic — works for any
chain listed in `CHAINS` (`packages/sdk/src/chain.ts`), currently **Ethereum Sepolia**
(chain id `11155111`) and **Base Sepolia** (chain id `84532`). You run every command in
this runbook yourself — nothing here broadcasts a transaction on your behalf.

**Critical rule, applies to every step below**: the key you use to broadcast the contract
deploy becomes the CTF Exchange's *permanent* admin/operator. That same key is what
`VEREX_OPERATOR_KEY` must hold at runtime — one name, used the same way by the
Solidity deploy script and the Node API. If they ever differ, every operator-signed call
(fillOrder, reportPayouts, registerToken, faucet mint) reverts forever — no fix short of
redeploying. Every step that touches this key includes a verification command; don't
skip it.

## 0. Prerequisites

- **Pick a target chain** — whichever one you actually hold funds on:

  | Chain | `VEREX_CHAIN_ID` | RPC provider |
  |---|---|---|
  | Ethereum Sepolia | `11155111` | Alchemy or Infura Sepolia endpoint |
  | Base Sepolia | `84532` | Alchemy or Infura Base Sepolia endpoint |

  Support for another chain is a one-line addition to `CHAINS` in
  `packages/sdk/src/chain.ts` (import the chain from `viem/chains`, add it to the map) —
  nothing else in this runbook or in `chain.ts`/`deploy.sh` needs to change.
- An Alchemy or Infura account with an app/endpoint created for that chain — copy its
  RPC URL.
- A dedicated testnet private key for the operator role (don't reuse a key that holds
  anything real, even by convention).
- `foundry` (`forge`, `cast`) installed locally, same as local dev.

## 1. Fill in `.env`, load it into your shell, verify the operator key

Real values go in `.env` files (git-ignored), same convention as everywhere else in this
repo — not typed as one-off `export` commands:

```bash
cd packages/contracts
cp .env.example .env
# edit .env: VEREX_RPC_URL (your Alchemy/Infura URL), VEREX_CHAIN_ID (11155111 for
# Ethereum Sepolia or 84532 for Base Sepolia — whichever you picked in step 0), and
# VEREX_OPERATOR_KEY (your operator's real testnet key)
```

`VEREX_OPERATOR_KEY` is read directly by the Solidity deploy script (`vm.envUint`) once
`.env` exists in this directory — Foundry auto-loads it. `VEREX_RPC_URL`/`VEREX_CHAIN_ID`
aren't things forge reads internally (`--rpc-url` is always a plain CLI flag, and no
script here uses chain id at all — the RPC endpoint alone determines the chain), so load
them into your shell once instead of exporting by hand:

```bash
set -a; source .env; set +a   # everything below in this shell now has $VEREX_RPC_URL etc.

cast wallet address $VEREX_OPERATOR_KEY
```

Confirm the printed address is the one you expect. `DeployCTF.s.sol` requires
`VEREX_OPERATOR_KEY` explicitly (`vm.envUint`, no fallback) — leaving it unset
fails the deploy outright rather than silently broadcasting with anvil's public key. This
check is still worth running anyway: forge failing loudly if it's unset doesn't
guarantee it's set to the *right* key.

## 2. Fund the operator with testnet ETH

Use any faucet for your chosen chain (one claim; typical dispense of 0.1–0.5 ETH is
plenty). The operator pays gas for every trade fill, auto-faucet mint, and resolve — it
needs a real balance, not a token amount. Demo wallets (step 4) only pay gas for
occasional approvals/redeems.

```bash
cast balance $(cast wallet address $VEREX_OPERATOR_KEY) --rpc-url $VEREX_RPC_URL
```

Re-run this until it shows a nonzero balance before continuing.

## 3. Deploy the contracts

Same command as local dev, just pointed at the real RPC — no `.sol` edits needed (RPC URL
is CLI-flag-only, the key is env-var-only, both already worked this way; the contracts
themselves have no chain-specific logic, so this works identically on either testnet):

```bash
cd packages/contracts
forge script script/DeployCTF.s.sol --rpc-url $VEREX_RPC_URL --broadcast
```

The script prints `USDC_ADDR` / `CTF_ADDR` / `EXCHANGE_ADDR` — append these three to
`packages/contracts/.env` (same file you already edited in step 1):

```bash
# in packages/contracts/.env:
USDC_ADDR=<printed above>
CTF_ADDR=<printed above>
EXCHANGE_ADDR=<printed above>
```

`seed.ts` (step 5) reads them from there automatically — no need to copy-paste them onto
a command line or re-`source` them into whatever shell you happen to run the seed command
from.

## 4. Generate a demo-wallet mnemonic and fund the 5 demo addresses

Demo wallets (dropdown indices 1–5) stay server-signed, same UX as local dev — but must
derive from a **fresh, private** mnemonic on a real chain, never anvil's public default
(`"test test test ... junk"`), since anyone on earth could otherwise derive the same keys
and interact with those addresses directly.

```bash
cd packages/api
pnpm exec tsx scripts/gen-demo-mnemonic.ts
```

This prints a new mnemonic and the 5 addresses it derives (same derivation `chain.ts`
uses internally, so what you see is what the app will actually use), then — since
`VEREX_OPERATOR_KEY`/`VEREX_RPC_URL` are already in your shell from step 1 — automatically
sends each of the 5 addresses 0.01 ETH from the operator, waiting for each transfer to
confirm before printing its tx hash. Save the mnemonic — you need it in steps 5 and 6.

(If you run this script without those two env vars set, it still prints the mnemonic and
addresses, just skips funding — fund manually in that case.)

The script already waits for each transfer's receipt before moving on (so it wouldn't
have printed a tx hash for one that failed) — but to spot-check independently, use
`scripts/check-demo-balance.ts`, which re-derives the same 5 addresses from the mnemonic
and prints each one's ETH balance (same `packages/api/.env`-loading + `VEREX_RPC_URL`/
`VEREX_CHAIN_ID` convention as the generator script above). Pass the mnemonic via
`VEREX_DEMO_MNEMONIC` — never as a CLI arg, same reasoning as `VEREX_OPERATOR_KEY`
elsewhere in this runbook (argv ends up in shell history and is visible to other
processes via `ps`; an env var isn't):

```bash
cd packages/api
VEREX_DEMO_MNEMONIC="<mnemonic from above>" pnpm exec tsx scripts/check-demo-balance.ts
```

Each of the 5 addresses should print `0.01 ETH`.

## 5. Seed the database against the real chain

`packages/api/prisma/seed.ts` loads `packages/api/.env` itself (via `dotenv`, same as
running the API normally) — no shell exports/sourcing needed for the values that
actually belong there:

```bash
cd packages/api
cp .env.example .env
# edit .env: DATABASE_URL (same as local dev), VEREX_RPC_URL, VEREX_CHAIN_ID,
# VEREX_OPERATOR_KEY (same values as step 1), VEREX_DEMO_MNEMONIC (from step 4)
```

`USDC_ADDR`/`CTF_ADDR`/`EXCHANGE_ADDR` are different — one-time deploy outputs, not
persistent API config (the API reads deployed addresses from the DB afterwards, not from
env), so they don't belong in `packages/api/.env`. They also don't need retyping here:
`seed.ts` loads `packages/contracts/.env` as a second source (any key already set — in
`packages/api/.env` or your shell — still wins), so as long as you appended them there in
step 3, this picks them up on its own:

```bash
pnpm --filter @verex/api exec tsx prisma/seed.ts
```

This reuses the already-deployed addresses (skips its own forge invocation) and writes the
real `ChainConfig` row. **Budget several minutes, not seconds** — the non-DB-only seed path
is ~32 sequential operator-signed transactions, each waiting for a real confirmation
(~2–15s, chain-dependent) instead of anvil's instant auto-mine.

**What this does to existing data — not additive, and not always safely re-runnable:**
- **DB**: every run wipes `Trade`, `PricePoint`, `Outcome`, `Market`, and `ChainConfig`
  first ([seed.ts:332-336](../../packages/api/prisma/seed.ts#L332-L336)), then recreates
  all 10 built-in markets from scratch. It never appends alongside old rows — re-running
  always leaves you with exactly one fresh copy of the seed data, not two.
- **On-chain, testnet only**: each market's `questionId` is a deterministic hash of its
  slug (`keccak256("verex:<slug>")`), so re-running against the **same already-seeded
  backbone** calls `ConditionalTokens.prepareCondition` with the same condition a second
  time — which reverts with `"condition already prepared"` (confirmed against the vendored
  contract's own test:
  [CTFCycle.t.sol:189-190](../../packages/contracts/test/CTFCycle.t.sol#L189-L190)).
  In other words: on a real chain, treat this as a **one-time** command per deployed
  backbone, not something you re-run to refresh data. (Local anvil dev doesn't hit this —
  `db:reset` always deploys a brand-new backbone first, so there's never a prior condition
  to collide with.)
- Demo wallet USDC balances are an exception — they're **topped up**, not reset
  ([seed.ts:324-328](../../packages/api/prisma/seed.ts#L324-L328)): a wallet already above
  1,000 USDC from real trading keeps its balance rather than being reset back down.

Verify locally before touching the cloud: with the same `packages/api/.env` in place,
start the API normally and confirm `GET /wallet/1` returns a nonzero balance and a BUY
completes in the browser (expect a first trade to take noticeably longer than local —
mint → approve → fillOrder chained confirmations — vs. instant on anvil).

## 6. Wire it into the cloud deploy (when you're ready to go live there)

Create the three secrets `scripts/deploy.sh` expects — replace `<DB_NAME>` with whatever
`scripts/deploy.env` has (`verex_staging` or `verex`):

```bash
printf '%s' "$VEREX_RPC_URL"              | gcloud secrets create verex-rpc-url-<DB_NAME> --replication-policy=automatic --data-file=-
printf '%s' "$VEREX_OPERATOR_KEY"         | gcloud secrets create verex-operator-key-<DB_NAME> --replication-policy=automatic --data-file=-
printf '%s' "<mnemonic from step 4>"      | gcloud secrets create verex-demo-mnemonic-<DB_NAME> --replication-policy=automatic --data-file=-
```

Then in `scripts/deploy.env`, set `VEREX_CHAIN_ID` to whichever chain id you used above
(`11155111` or `84532`) and run `scripts/deploy.sh` as usual — it reads these three
secrets (never creates or prints them) and threads them into both the seed step and the
API Cloud Run service.
