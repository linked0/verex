# 2026-07-27 — verex history

Source docs: [docs/runbooks/deploy.md](../runbooks/deploy.md) (end of day — one
parameterized runbook; earlier today the same content lived in `testnet-deploy.md` →
`contracts-testnet-deploy.md` + `prod-deploy.md`, both consolidated away, see the
entries below), [scripts/deploy.env.prod](../../scripts/deploy.env.prod) (the Task 5
prod-isolation plan this implements).

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

### Decision: committed deployments.json manifest replaces .env address copy-paste

Root problem (jay): three environments (local anvil, test Sepolia, prod Sepolia) but one
mutable `packages/contracts/.env` holding a single backbone's addresses — hand-copied
after each deploy, hand-swapped per environment, nothing preventing a prod seed from
picking up test addresses (chain id can't disambiguate: both are 11155111). Agreed
design (jay picked option A naming, added the `local` target):
- `packages/contracts/deployments.json` — committed manifest keyed `test`/`prod`
  (addresses are public; git history = audit trail). Prepopulated `test` from the live
  backbone (verified identical to `broadcast/.../run-latest.json` returns).
- `save-deployment <test|prod>` helper reads forge's broadcast `returns` — no more
  copy-paste; run immediately after deploy (run-latest is per chain id and shared).
- `seed.ts VEREX_DEPLOY_TARGET=local|test|prod` (default `local` = old anvil flow).
  For test/prod the manifest is authoritative (env addrs ignored with a warning) +
  preflight: chainId match and `getCode` non-empty at all 3 addresses, so a wrong-RPC/
  stale-manifest mixup dies in seconds, not mid-way through ~32 txs.
- `deploy.sh` requires `DEPLOY_TARGET` in the env file whenever `VEREX_CHAIN_ID` is set
  and threads it to the seed. Verified: tsc clean; helper idempotent on live entry;
  both seed error paths exercised; preflight replica confirmed code at all 3 Sepolia
  addresses.

### prod-deploy.md rewritten as a self-contained execution runbook

jay is about to run the production deploy for real, so the runbook was refined from
"sequencing over backbone-runbook sections" to inline commands end-to-end (§0 prereq
checklist → §9 day-2), incorporating today's manifest workflow (`save-deployment prod`,
`DEPLOY_TARGET=prod`, preflight). New prod chain config lives in
`packages/contracts/.env.prod` sourced into the shell (shell env shadows the test
`.env` foundry auto-loads). Gotcha fixed on the way: `.gitignore` only covered `.env` —
added `.env.prod` so the prod operator key can't be committed by accident.

### PRODUCTION DEPLOYED — verex-api-prod / verex-web-prod live, trade verified on-chain

Executed deploy.md §4–§8 for prod (jay authorized; §1–§3 were jay's on-chain work):
setup-chain-secrets.sh prod completed the 3 secrets; gas checked (0.0426 ETH @ 1.1
gwei); deploy-prod.sh created verex-db-prod + verex_prod DB, migrated, seeded 10
markets on-chain (manifest + preflight path worked in production — the seed IGNORED
stale env addresses in favor of the committed 'prod' entry, exactly the protection
built this morning), built the API image, deployed both services.
- API https://verex-api-prod-q6qvjcw5ma-du.a.run.app — /health {"status":"ok"}
- Web https://verex-web-prod-q6qvjcw5ma-du.a.run.app — markets render; §8 test BUY
  filled on-chain: 22.73 Yes for $10.00, tx 0x79004f0d…f6e842, balance $1,000 → $990.
Remaining, jay's call: §9 domain mapping (verex.jaylabs.xyz via Firebase, SERVICE
override) and committing today's pending batch.

### Root cause found: instant open-P&L on every BUY (+ round-trip money pump) — fix pending

jay flagged wrong positions value / open P&L. Diagnosis (reconciles to the penny):
trades fill at the PRE-impact price (trade.ts:97) but applyImpact then bumps the DB
price (LIQUIDITY_PARAM=2000 → $10 buy at 0.44 → 0.4428), and walletSummary marks
positions at the new price → every BUY instantly shows +your-own-impact as P&L
($10.06/+$0.06). Worse: SELLs also fill pre-impact, so buy→sell round trips pocket the
impact (money pump). Proposed fix: execute trades AT the post-impact price (impact
before pricing) — buy P&L becomes $0.00, round trip becomes a cost like a real spread.
Status: diagnosed and proposed; jay will review before any change to the trading path.

### GO-LIVE: verex.jaylabs.xyz → production (jay's instruction)

Ran §9: setup-domain-firebase.sh with SERVICE=verex-web-prod (Firebase Hosting rewrite
** → verex-web-prod; Cloud Run domain mapping unsupported in asia-northeast3). DNS
upserted into jaylabs-xyz zone (doubletree project); OWNERSHIP/HOST/CERT all ACTIVE on
first poll. firebase.json serviceId updated to verex-web-prod to mirror. Verified
end-to-end: https://verex.jaylabs.xyz → HTTP/2 200 with TLS, /backend/health ok,
renders prod data (Demo Wallet labels, $990 balance, vol includes the §8 trade).
The test/prod URL near-twin confusion is now moot — the public domain is unambiguous.

### Twin-not-shared clarification added to deploy.md §8 + deploy.sh summary

jay suspected test/prod share a DB (they don't — verified: two Cloud SQL instances,
per-env secrets/bindings; the illusion comes from both envs seeding identical markets).
Captured the lesson where the next person will look: deploy.md §8 gained a "telling the
two environments apart" block with the gcloud verification commands, and deploy.sh's
final summary now prints the environment's stack (instance/DB/secret suffix) with a
"data may LOOK identical" note.

### Runbook consolidation: one parameterized deploy.md (jay's request)

contracts-testnet-deploy.md + prod-deploy.md → single
[docs/runbooks/deploy.md](../runbooks/deploy.md), parameterized by `<target>` with a
test/prod substitution table (same anti-drift argument as the shared deploy.sh: the
environments differ in parameters, not procedure — two parallel docs would drift).
All unique content carried over (critical rule, chain table, seed destructiveness §5,
domain §9, day-2 §10); every cross-reference updated (deploy.sh, env examples/configs,
5 helper-script headers, README, jul-22 task doc). Old files deleted (`git rm -f`,
content preserved in deploy.md + git history).

### prod runbook §6: operator gas check added before the deploy

One-line pre-step: confirm the operator holds >~0.05 ETH before deploy-prod.sh — the
backbone deploy + wallet funding already spent gas, and the seed needs ~32 more txs.

### check-deployment: gate script before save-deployment (jay's request)

New `pnpm --filter @verex/api check-deployment <test|prod>` runs between the forge
deploy and `save-deployment`: verifies the broadcast's deployer == $VEREX_OPERATOR_KEY
(the critical rule), no cross-target address collision (run-latest is shared per chain
id — a stale file can masquerade as your deploy), freshness warning, and on-chain state
(code at all 3 addresses, exchange collateral/CTF getters match, deployer is
admin+operator). Wired into both runbooks before the save step. Proved itself live on
day one: correctly REFUSED target `test` against the prod broadcast jay had just made
in a parallel session (wrong deployer + prod collision + missing roles), and passed
target `prod` cleanly — jay's freshly deployed prod backbone + manifest entry are
verified consistent on-chain.

### gen-demo-mnemonic: print the balance-check command ready to paste (jay's request)

The generator now ends by printing the `VEREX_DEMO_MNEMONIC="…" pnpm … check-demo-balance`
command with the real mnemonic filled in (both exit paths). No new exposure — the
mnemonic is already in the same scrollback; the printed line starts with a space so
HIST_IGNORE_SPACE/ignorespace shells keep it out of history. Both runbooks note it.

### setup-chain-secrets.sh replaces the 3 manual printf|gcloud commands (jay's request)

`./scripts/setup-chain-secrets.sh test|prod` reads PROJECT_ID/DB_NAME from the matching
deploy env file (names can't drift from what deploy.sh reads), takes RPC/operator-key
from the sourced shell, prompts for the mnemonic with HIDDEN input (a security upgrade
over the manual flow — never in history/scrollback), create-or-adds-version
idempotently (:latest), and round-trip-verifies all three without printing secrets.
Runbooks (prod §4, backbone §6) + deploy.env.prod comment updated. Follow-ups the same
day: empty-Enter at the mnemonic prompt keeps the existing Secret Manager version
(fixed a `set -e` short-circuit pitfall on that path), and gen-demo-mnemonic gained
`--store test|prod` — the mnemonic goes straight into Secret Manager via gcloud stdin
BEFORE funding, eliminating the scrollback→paste bridge entirely (decision: direct
store beats saving it to .env.prod, which would create a permanent second on-disk copy
just to bridge a 10-second gap).

### Env-file cleanup: dead variables removed / re-documented (jay's request)

`scripts/deploy.env.example` rewritten — it still described the never-real "staging"
naming (verex-web-staging, verex_staging, shared Cloud SQL instance) predating the
test/prod split; now mirrors the real test env + points at deploy.env.prod and
setup-chain-secrets.sh. `packages/contracts/.env.example`: the USDC/CTF/EXCHANGE_ADDR
block re-commented as DemoMarket-local-only (deploy flow reads deployments.json) and
safe to delete. prod runbook §1 now says to delete that block from .env.prod. jay's
live `.env.prod` cleanup left to jay (file holds the operator key — permission
classifier rightly blocked automated edits): delete lines 35-50 (the two bottom
sections). Follow-up (jay): prod runbook §4 retitled "Set up …" — after §3's --store,
it creates only the remaining two secrets and verifies all three; and
packages/api/.env.example gained the missing VEREX_DEPLOY_TARGET documentation
(api env files themselves audited: only .env/.env.example exist, every variable still
in use — nothing removable).

### api/.env: local chain values are dead weight now (jay was right)

Correction to the audit above — the variable NAMES stay (they're the runtime delivery
pipe from Secret Manager), but the VALUES saved in jay's local packages/api/.env
(test-env Sepolia RPC / chain id / operator key / mnemonic from Jul 21) are no longer
needed by anything — cloud reads Secret Manager, local checks use the sourced shell —
and are actively risky (a saved VEREX_CHAIN_ID=11155111 makes casual local runs target
Sepolia instead of anvil). jay deletes the 4 lines himself (file holds keys); lines
must be DELETED, not blanked — `VAR=` is an empty string, not unset, and breaks the
anvil fallbacks. .env.example chain section now documents the leave-unset policy —
then fully rewritten (jay's request) as a mirror-able template: chain vars now
COMMENTED OUT (a fresh copy is anvil-clean by construction), with delivery notes
(Secret Manager via deploy.sh) and the check-deployment/--store cross-references.

### Web UI: "Demo #{n}" → "Demo Wallet {n}" (jay picked option 1 of the naming discussion)

Renamed in all three sites (SiteNav dropdown, portfolio balance card, TradePanel fine
print); dropped the "#" since "Wallet" now carries the meaning. "Demo" kept deliberately
— it signals shared server-signed play-money wallets ("Wallet" alone implies personal
funds; "Test Wallet" would collide with the test-server environment naming). Verified
live via HMR on jay's running dev server: dropdown, portfolio, and trade panel all
render "Demo Wallet 1", no console errors. Follow-up (jay): "Operator #0 (admin)" →
"Operator Wallet 0 · admin", then (jay) the admin suffix and the "0" dropped too →
final label "Operator Wallet" (the index means nothing to users; the option value
stays 0 internally); verified live in the dropdown.
