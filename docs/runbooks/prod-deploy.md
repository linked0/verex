# Runbook: deploy the verex PRODUCTION server

Goal: keep the current test server (`verex-web` / `verex-api` at `*.run.app`) running
as-is, and stand up a **separate** production server behind `verex.jaylabs.xyz`. All the
plumbing already exists — `scripts/deploy.env.prod` defines the prod names
(`verex-web-prod` / `verex-api-prod`, Cloud SQL instance `verex-db-prod`, database
`verex_prod`, chain `11155111`), and `scripts/deploy-prod.sh` is a thin wrapper that runs
`deploy.sh` against that env file. Nothing is shared with test except the GCP project and
the chain itself.

Section references like "§1–§3" below point at the backbone runbook,
[contracts-testnet-deploy.md](contracts-testnet-deploy.md), which has the full commands —
this runbook is the production-specific sequencing over it. You run every command
yourself; nothing here broadcasts a transaction on your behalf.

## 1. New operator key + fresh contract backbone (backbone runbook §1–§3)

Repeat §1–§3 with a **new** operator key, then fund it (§2) and deploy (§3). Two reasons
this can't be skipped:

- Reusing the test **backbone** is impossible anyway — `seed.ts`'s `questionId`s are
  deterministic per slug, so seeding a second environment against the already-seeded test
  backbone reverts with `"condition already prepared"` (§5).
- Reusing the test **operator key** is a trap even though it would deploy fine: both
  environments run on Sepolia, so two live APIs signing with the same key race on the
  account nonce — concurrent fills/mints in test and prod would intermittently fail.
  One fresh key per environment avoids this class of bug entirely.

Append the three printed addresses (`USDC_ADDR`/`CTF_ADDR`/`EXCHANGE_ADDR`) to
`packages/contracts/.env` as in §3 — but since that file still holds the **test**
backbone's values, either overwrite them for the duration of this deploy or keep a
`.env.prod` copy you swap in; `seed.ts` reads whatever is there at seed time.

## 2. New demo mnemonic, fund the 5 wallets (backbone runbook §4)

Generate a fresh one — never reuse the test env's (isolation is the whole point; a
shared mnemonic means shared demo wallets and cross-env balance bleed).

## 3. Create the three prod chain secrets (backbone runbook §6, `<DB_NAME>` = `verex_prod`)

Exact names the deploy will look for: `verex-rpc-url-verex_prod`,
`verex-operator-key-verex_prod`, `verex-demo-mnemonic-verex_prod`. The RPC secret can
hold the same Alchemy/Infura URL as test (or a second app on the same account if you
want separate rate limits / metrics).

## 4. Run the production deploy

```bash
./scripts/deploy-prod.sh
```

(This is exactly `DEPLOY_ENV=scripts/deploy.env.prod ./scripts/deploy.sh` — the wrapper
exists so the prod invocation is short, unmistakable, and has a home for prod-only
guardrails.)

First run creates (billable): `verex-db-prod` Cloud SQL instance (~$10+/mo), the
`verex_prod` DB + its `DATABASE_URL` secret, then migrates + seeds (**one-time, ~32
on-chain txs, several minutes** — backbone runbook §5's warnings apply), builds the API
image tagged `:verex_prod`, and deploys `verex-api-prod` / `verex-web-prod`. Do **not**
set `SKIP_SEED` on the first run — that's only for restoring a pre-seeded DB; a fresh
backbone needs the real seed exactly once.

## 5. Verify on the raw `*.run.app` URLs before touching the domain

`curl <api-url>/health`, then open the web URL and complete one BUY with a demo wallet
(first trade is slow — chained real confirmations, backbone runbook §5).

## 6. Map `verex.jaylabs.xyz` — via Firebase Hosting, NOT the script's closing hint

`deploy.sh` ends by suggesting `setup-dns.sh`, but Cloud Run domain mapping is
unsupported in `asia-northeast3` — that path fails (see the header of
`scripts/setup-domain-firebase.sh`). Use the Firebase route, overriding its default
service (which is the **test** service `verex-web`):

```bash
SERVICE=verex-web-prod ./scripts/setup-domain-firebase.sh verex.jaylabs.xyz
```

Then update `firebase.json`'s rewrite `serviceId` to `verex-web-prod` so the checked-in
file mirrors what Hosting actually serves (it's documentation for any later CLI use —
the REST release above is what takes effect).

## 7. Day-2: the two environments coexist

Plain `./scripts/deploy.sh` keeps redeploying **test** (no domain, `*.run.app` only),
and `./scripts/deploy-prod.sh` redeploys **production**. Remember backbone runbook §5:
after the first successful seed, subsequent prod deploys must set `SKIP_SEED=1`
(`SKIP_SEED=1 ./scripts/deploy-prod.sh`), because re-seeding against the now-prepared
prod backbone reverts.
