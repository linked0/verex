# 2026-07-27 — verex history

Source docs: [docs/runbooks/contracts-testnet-deploy.md](../runbooks/contracts-testnet-deploy.md)
(named `testnet-deploy.md` until today's split),
[docs/runbooks/prod-deploy.md](../runbooks/prod-deploy.md) (created today),
[scripts/deploy.env.prod](../../scripts/deploy.env.prod) (the Task 5 prod-isolation
plan this implements).

### Runbook: add §7 production deploy (test/prod separation)

Appended §7 to `docs/runbooks/testnet-deploy.md` summarizing how to stand up the isolated
production server (`verex-web-prod`/`verex-api-prod`, `verex-db-prod`, `verex_prod`,
domain `verex.jaylabs.xyz`) while the existing test server keeps running unchanged.
jay executes the steps; nothing was deployed in this session.

### Decision: fresh operator key per environment

Recommended a NEW operator key for prod (not just fresh backbone + mnemonic, which
`deploy.env.prod` already mandated): both envs live on Sepolia, so two APIs signing with
one key would race on the account nonce and intermittently fail concurrent fills/mints.

### Gotcha: domain mapping + re-deploy footguns captured in §7

(a) `deploy.sh`'s closing `setup-dns.sh` hint fails in `asia-northeast3` — prod domain
must go through `SERVICE=verex-web-prod ./scripts/setup-domain-firebase.sh` (script
defaults to the test service). (b) After the first prod seed, re-deploys need
`SKIP_SEED=1` — re-seeding a prepared backbone reverts (`"condition already prepared"`).

### Runbook split: prod gets its own file + wrapper script (jay's request)

Split the morning's §7 out of `testnet-deploy.md` into
[docs/runbooks/prod-deploy.md](../runbooks/prod-deploy.md), and renamed the remainder to
[contracts-testnet-deploy.md](../runbooks/contracts-testnet-deploy.md) (it covers the
on-chain backbone both environments share, so "testnet-deploy" was ambiguous with server
deploys). Added `scripts/deploy-prod.sh`, a 1-command wrapper over `deploy.sh` +
`deploy.env.prod` — logic stays in one script to avoid drift; the wrapper only makes the
prod invocation short and gives future prod-only guardrails a home. Updated all active
references (README, deploy.sh, env examples, seed.ts, helper scripts, jul-22 task doc);
old dated history files keep the former name as historical record.
