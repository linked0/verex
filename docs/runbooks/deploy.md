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
