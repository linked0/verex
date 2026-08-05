# Runbook: deploy a verex environment (staging or prod)

One procedure, two isolated environments. Every step below is written with a
`<target>` parameter — substitute from this table:

| | **staging** | **prod** |
|---|---|---|
| Deploy config | `scripts/deploy.env` | `scripts/deploy.env.prod` |
| Chain env file | `packages/contracts/.env` | `packages/contracts/.env.prod` |
| Deploy command | `./scripts/deploy.sh` | `./scripts/deploy-prod.sh` |
| Cloud Run services | `verex-web` / `verex-api` | `verex-web-prod` / `verex-api-prod` |
| Cloud SQL / DB | `verex-db` / `verex` | `verex-db-prod` / `verex_prod` |
| Secret suffix | `-verex` | `-verex_prod` |
| Manifest target | `staging` | `prod` |
| Domain | none — `*.run.app` only | `verex.jaylabs.xyz` (§9) |

> **Naming (2026-07-28)**: the pre-production environment is **staging** — both in prose
> and in the technical identifier (`VEREX_DEPLOY_TARGET=staging`, the `staging` entry in
> `deployments.json`, `<target> = staging` in every script; the old `test` value now
> fails fast with a rename hint). GCP resource names stay unsuffixed (`verex-web`,
> `verex-db`, `-verex` secrets) — those are live infrastructure and were never named
> "test".

Nothing is shared between environments except the GCP project (`verex-499205`), the
region, and the chain itself. You run every command yourself — nothing here broadcasts
a transaction on your behalf.

**Critical rule, applies throughout**: the key that broadcasts the contract deploy (§2)
becomes the CTF Exchange's *permanent* admin/operator, and the same key must be what
`VEREX_OPERATOR_KEY` holds at runtime. If they ever differ, every operator-signed call
(fillOrder, reportPayouts, registerToken, faucet mint) reverts forever — no fix short
of redeploying. **One fresh operator key per environment** — reusing a key across two
live environments on the same chain also makes the two APIs race on the account nonce.
`check-deployment` (§2) verifies all of this on-chain; don't skip it.

## 0. Prerequisites

- **Pick a chain** (both environments currently use Ethereum Sepolia):

  | Chain | `VEREX_CHAIN_ID` | RPC provider |
  |---|---|---|
  | Ethereum Sepolia | `11155111` | Alchemy or Infura Sepolia endpoint |
  | Base Sepolia | `84532` | Alchemy or Infura Base Sepolia endpoint |

  Supporting another chain is a one-line addition to `CHAINS` in
  `packages/sdk/src/chain.ts` — nothing else here changes.
- `gcloud auth login` **and** `gcloud auth application-default login` (the Cloud SQL
  proxy inside `deploy.sh` uses ADC).
- `foundry` (`forge`, `cast`) installed.
- An RPC URL for the chosen chain (the two environments may share one).
- A faucet to claim test ETH for a brand-new address (0.1–0.5 ETH is plenty).
- Billing awareness: each environment's first run creates its own Cloud SQL instance
  (db-f1-micro, **~$10+/mo**) plus Cloud Run/Build usage.

## 1. Chain env file + a NEW operator key

```bash
cd packages/contracts
cast wallet new        # prints a new address + private key — this environment's operator
cp .env.example <chain env file>
# edit it: VEREX_RPC_URL, VEREX_CHAIN_ID, VEREX_OPERATOR_KEY=<key printed above>.
# Delete everything below the operator-key section — the address block only
# serves local DemoMarket runs; the deploy flow reads deployments.json instead.
```

Load it into your shell (shell env wins over the `.env` foundry auto-loads, so other
environments' values are shadowed for this session), verify, and fund from a faucet:

```bash
set -a; source <chain env file>; set +a
cast wallet address $VEREX_OPERATOR_KEY     # must print the address cast just generated
cast balance $(cast wallet address $VEREX_OPERATOR_KEY) --rpc-url $VEREX_RPC_URL
```

Re-run the balance check until nonzero. **Every later step assumes this same shell**;
if you open a new terminal, re-run the `source` line.

## 2. Deploy the backbone, gate-check it, record it in the manifest

```bash
cd packages/contracts
forge script script/DeployCTF.s.sol --rpc-url $VEREX_RPC_URL --broadcast
```

Then — **immediately, in the same sitting** (forge's `broadcast/.../run-latest.json` is
per chain id and both environments share it; the next deploy overwrites it) — gate-check
the pending broadcast:

```bash
pnpm --filter @verex/api check-deployment <target>
```

It verifies on-chain: deployer == `$VEREX_OPERATOR_KEY` (the critical rule), the
addresses aren't the *other* environment's backbone, code exists at all three, the
exchange's collateral/CTF wiring is consistent, and the operator holds admin+operator.
Only when it prints `✓ all checks passed`:

```bash
pnpm --filter @verex/api save-deployment <target>
```

This writes the environment's entry in `packages/contracts/deployments.json` straight
from the broadcast artifact (no copy-paste). **Review the diff and commit it** — the
committed manifest, not any `.env` file, is what the seed uses (addresses are public
on-chain data; git history doubles as the audit trail).

## 2b. Optional: the UMA oracle adapter

Skip this entirely if the environment resolves markets from the operator key. It is
only needed for markets whose result should come from UMA's Optimistic Oracle instead
of from you.

**Deploy it before creating any market that uses it, and understand that the choice is
permanent per market.** A CTF condition's id is `keccak256(oracle, questionId, 2)`, so
the resolver's address is part of the market's identity. A market cannot be repointed
at a different oracle later — doing so computes a different `conditionId`, i.e. a
different market holding none of the original positions.

```bash
cd packages/contracts
# CTF_ADDR is this target's `ctf` from deployments.json (§2)
CTF_ADDR=$(node -p "require('./deployments.json').<target>.ctf") \
  forge script script/DeployUmaAdapter.s.sol --rpc-url $VEREX_RPC_URL --broadcast
```

The script refuses to deploy against a bad configuration rather than wasting the gas:
it requires code at `CTF_ADDR`, requires the oracle to answer `defaultLiveness()` (so a
wrong address can't pass as an oracle), and requires `UMA_OO_ADDR` to be set explicitly
on any chain other than Sepolia, whose address it defaults to. Deploy costs ~0.003 ETH
at 2 gwei.

| Env var | | |
|---|---|---|
| `VEREX_OPERATOR_KEY` | required | deployer, and the adapter's default admin |
| `CTF_ADDR` | required | this target's ConditionalTokens |
| `UMA_OO_ADDR` | optional | defaults to Sepolia's `0x9f1263B8f0355673619168b5B8c0248f1d03e88C` |
| `UMA_ADAPTER_ADMIN` | optional | defaults to the deployer |

Then — **immediately, same sitting**, for the same reason as §2 — record it:

```bash
pnpm --filter @verex/api save-uma-adapter <target>
```

That one command both checks and writes (there is no separate `check-uma-adapter`): it
verifies the broadcast's deployer is `$VEREX_OPERATOR_KEY`, that the address isn't
already recorded under the *other* target, that `adapter.ctf()` matches this target's
recorded CTF, and that the operator is `admin()` — only admin can initialize questions,
so an adapter admin'd by a key you don't hold is unusable. It refuses to replace an
existing `umaAdapter` without `--force`, because the new address cannot inherit the old
one's markets. On success it adds `umaAdapter` and `umaOracle` to the target's entry;
review the diff and commit it.

> Redeploying the backbone (§2) invalidates the adapter — it is bound to one CTF by its
> constructor. `save-deployment` detects this: it keeps `umaAdapter` when the CTF is
> unchanged and drops it with a warning when it isn't. If it drops, redeploy the adapter.

### Per-market lifecycle

Deploying the adapter creates no market. Each question is a separate `initialize` call,
and it is admin-only because it spends the reward budget:

1. **Write the ancillary data.** This is the entire text a UMA voter reads, so it must
   carry its own resolution criteria — a bare question with no rules is how a market
   ends up settled "unresolvable" (`0.5e18`), which pays both sides half.
2. **Choose the reward token.** It must be on UMA's `AddressWhitelist`
   (`0xE8DE4bcE27f6214dcE18D8a7629f233C66A97B84`). **Verex's MockUSDC is not.** Sepolia
   WETH (`0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9`) is, and is self-service via
   `deposit()`.
3. **Fund the adapter, not yourself, if `reward > 0`** — `requestPrice` pulls the reward
   from the caller, and the caller is the adapter. Skipping this is the most likely way
   for `initialize` to revert. `reward = 0` is fine on a testnet, but then nobody is
   paid to propose an answer, so you must propose it yourself.
4. **Call `initialize(ancillaryData, rewardToken, reward, bond, liveness)`.** `bond` is
   the security parameter — it must exceed what a liar could earn from the market.
   `liveness = 0` keeps UMA's 7200s default; shorten it only for demos.
5. **Propose the answer** on the OO (`proposePrice`), posting `finalFee + bond` in the
   reward token. `1e18` = YES, `0` = NO, `0.5e18` = unresolvable.
6. **Wait out liveness**, then call `resolve(questionId)` on the adapter. This is
   **permissionless** by design — anyone can call it, because it has no discretion, it
   only copies what UMA settled. If it required the operator, an absent operator could
   strand every payout, which is the failure mode UMA is here to remove. It reverts
   until liveness expires; that revert comes from `settleAndGetPrice`, not the adapter.
   Check readiness first with `isSettled(questionId)`.
7. Winners redeem through the CTF as usual — nothing about redemption changes.

`resolve` reverts with `UnsupportedPrice` on anything other than those three values.
That is deliberate: coercing an unexpected number would resolve a market on a value
nobody voted for.

## 3. Demo mnemonic: generate, store, fund

Each environment gets a **fresh** mnemonic (shared mnemonic = shared demo wallets =
cross-env balance bleed; never anvil's public default):

```bash
cd packages/api
pnpm exec tsx scripts/gen-demo-mnemonic.ts --store <target>
```

`--store <target>` sends the mnemonic **straight into Secret Manager**
(`verex-demo-mnemonic-<DB_NAME>`, via gcloud stdin — never argv, never disk) *before*
funding, so a funding failure can't lose it. It then funds each of the 5 derived
demo-wallet addresses with 0.01 ETH from the operator, waiting for each confirmation.
Whenever you need the words again:

```bash
gcloud secrets versions access latest --secret=verex-demo-mnemonic-<DB_NAME>
```

Spot-check the balances — the generator's last line is this exact command ready to
paste, real mnemonic filled in (leading space keeps it out of shell history where
`HIST_IGNORE_SPACE`/`ignorespace` is enabled). Each address should print `0.01 ETH`:

```bash
VEREX_DEMO_MNEMONIC="<printed by the generator>" pnpm --filter @verex/api exec tsx scripts/check-demo-balance.ts
```

## 4. Chain secrets in Secret Manager

```bash
cd "$(git rev-parse --show-toplevel)"
./scripts/setup-chain-secrets.sh <target>
```

Reads `PROJECT_ID`/`DB_NAME` from the deploy config (so the secret names can't drift
from what `deploy.sh` later reads), takes `VEREX_RPC_URL`/`VEREX_OPERATOR_KEY` from
your sourced shell, prints the operator address for you to eyeball-confirm, and prompts
for the mnemonic — **press Enter alone to keep the version §3 stored**. Creates missing
secrets / adds versions to existing ones (`deploy.sh` reads `:latest`; re-running is
always safe) and round-trip-verifies all three without printing anything sensitive.
Expect: `✓ all three '<target>' secrets are set and verified`. `deploy.sh` only ever
*reads* these — this script is the single writer.

## 5. Optional: local verification before the cloud

To try the app against the real chain from your machine first: fill `packages/api/.env`
with `DATABASE_URL` (local Postgres) and source the chain env file, then run the seed
locally with `VEREX_DEPLOY_TARGET=<target>` and start the API normally — confirm
`GET /wallet/1` returns a balance and one BUY completes in the browser (first trade is
slow: real chained confirmations, ~2–15s each).

**Know what the seed does — it is destructive and one-time per backbone:**
- **DB**: every run first wipes `Trade`, `PricePoint`, `Outcome`, `Market`,
  `ChainConfig`, then recreates the 10 built-in markets — never appends.
- **On-chain**: each market's `questionId` is a deterministic hash of its slug, so
  re-seeding an **already-seeded backbone** reverts with `"condition already prepared"`.
  One real seed per deployed backbone — after that, always `SKIP_SEED=1` (§7).
- Exception: demo-wallet USDC balances are **topped up**, not reset.

## 6. Sanity-check the deploy config

Open the deploy config (table above) and confirm the environment's service/DB names,
`VEREX_CHAIN_ID`, and — load-bearing — `DEPLOY_TARGET=<target>`: `deploy.sh` refuses a
chain deploy without it, and passes it to the seed as `VEREX_DEPLOY_TARGET` so the seed
reads the right manifest entry, after preflighting that the chain id matches and all
three addresses hold contract code on the RPC.

## 7. Run the deploy

Confirm the operator still holds gas for the ~32 seed transactions (>~0.05 ETH is
comfortable):

```bash
cast balance $(cast wallet address $VEREX_OPERATOR_KEY) --rpc-url $VEREX_RPC_URL
```

Then run the environment's deploy command (table above). First run, in order: enables
APIs → creates the Cloud SQL instance + DB + `DATABASE_URL` secret → migrates → seeds
(**one-time, ~32 on-chain txs, several minutes**) → builds the API image (repo-root
workspace build) → deploys the API service, then the web service wired to it.

There is **no separate seed command by design**: the seed
(`packages/api/prisma/seed.ts`) runs *inside* `deploy.sh` — it tunnels to the new DB
via the Cloud SQL Auth Proxy, migrates, then executes the seed with
`VEREX_DEPLOY_TARGET` and the chain secrets threaded in. Do **not** set `SKIP_SEED` on
a first run; on every **later** run of an already-seeded environment, `SKIP_SEED=1` is
**mandatory** (§5).

## 8. Verify on the raw `*.run.app` URLs

The script prints both URLs at the end:

```bash
curl <api-url>/health
```

Then open the web URL and complete one BUY with a demo wallet (first trade is slower
than local — chained real confirmations).

**Telling the two environments apart:** both run the identical `seed.ts`, so they show
the same 10 markets with similar volumes/prices — the data is **twin, not shared**.
Isolation is per-environment all the way down (own Cloud SQL instance, own database,
own secrets, own backbone, own operator key). To verify from GCP at any time:

```bash
gcloud sql instances list --project verex-499205
gcloud run services describe <api service> --region asia-northeast3 \
  --format="value(spec.template.spec.containers[0].env)"
```

The service's `DATABASE_URL` secret name and its attached Cloud SQL instance must both
carry the environment's suffix (`-verex` / `-verex_prod`, `verex-db` / `verex-db-prod`)
— if they ever don't, stop and investigate before deploying anything.

## 9. Domain — prod only, via Firebase Hosting

The staging environment stays on `*.run.app`. For prod, ignore `deploy.sh`'s closing
`setup-dns.sh` hint — Cloud Run domain mapping is unsupported in `asia-northeast3`
(see the header of `scripts/setup-domain-firebase.sh`). Use the Firebase route,
overriding its default service (which is the **staging** service, `verex-web`):

```bash
SERVICE=verex-web-prod ./scripts/setup-domain-firebase.sh verex.jaylabs.xyz
```

Then update `firebase.json`'s rewrite `serviceId` to `verex-web-prod` and commit — the
REST release is what takes effect, but the checked-in file should mirror it.

## 10. Day-2

- Redeploy: the environment's deploy command with `SKIP_SEED=1` (mandatory after the
  first successful seed — §5).
- New markets / backbone changes: that's a **new backbone** — repeat from §2 with a
  fresh `save-deployment`, and treat the next deploy as a first run (real seed, no
  `SKIP_SEED`).
- Staging idle? `./scripts/staging-down.sh` stops the DB and scales the API to zero
  (~$40-65/mo → ~$1-2/mo; storage/images/secrets kept). `./scripts/staging-up.sh`
  reverses it (~2 min). Never half-down it — a throttled API with a live DB drains
  the MM books (2026-07-29 prod incident).
