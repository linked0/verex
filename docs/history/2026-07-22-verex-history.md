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

### Design (not built): trade/resolution latency UX — Task 4

jay flagged a UX flaw: users wait too long for a trade to complete, and the admin waits
too long for a resolution to complete — invisible on anvil's auto-mine, real once trading
against Base/Ethereum Sepolia (2–15s per confirmation). Traced the actual cause instead of
guessing: `executeTrade` can chain up to 3 sequential confirmations (mint → approve →
fillOrder) in one blocking request, and neither `TradePanel` nor `ResolvePanel` gives any
staged feedback — just one static "Submitting on-chain…" label for the whole chain.
Wrote up a proposal, not implemented (jay asked for the design first): (1) pre-warm demo
wallets' mint+approve at seed time so the common-case BUY drops to a single confirmation —
a real latency fix, not just better loading UI; (2) optimistic UI updates on submit
(standard DEX/trading pattern) so the remaining single confirmation feels instant; (3) SSE
staged-progress explicitly deprioritized — only worth building if #1 turns out
insufficient in practice. Full writeup:
[details/jul-22-trade-resolution-latency-ux.md](../tasks/details/jul-22-trade-resolution-latency-ux.md),
linked from [jun-19-verex-design.md](../tasks/jun-19-verex-design.md) as Task 4.

### Task 4, part 1+2 implemented + verified: demo-wallet pre-warming + optimistic trade UI

jay approved the design and added a scope clarification: pre-funding via seed only makes
sense for demo wallets (intrinsically not real users) — a real deposit flow for actual
users is separate, future, out-of-scope work; no UI copy ("Demo" labels) needed to change
either. Built #1 (`seed.ts` now pre-approves each demo wallet #1-5 for the exchange/CT
contracts, same place it already tops up their USDC) and #2 (`TradePanel` shows a pending
preview — snapshotted at submit time so it can't drift if the input changes mid-flight —
immediately on click, before the confirmation returns). Skipped #3 (SSE staged progress)
per the original recommendation.

**Verified for real, not just type-checked** — spun up a fresh local anvil + Postgres
(dev-local.sh), ran the seed with explicit env overrides (careful not to touch jay's real
`packages/api/.env`, which is currently configured for real Ethereum Sepolia trading — an
early seed attempt using his actual `.env` correctly reverted at the `simulateContract`
step against Sepolia, confirmed no real transaction was ever broadcast, before switching to
an isolated anvil-only run). `cast call` against the deployed contracts confirmed wallet
#1's USDC allowance and CT approval were both already set post-seed; a live `POST /trade`
BUY as wallet #1 advanced the chain by exactly 1 block, vs. 3 blocks for wallet #6 (outside
the pre-warmed 1-5 range) — direct empirical proof, not inference. `tsc --noEmit` clean on
both files. The `TradePanel` pending box itself wasn't visually checked in an actual
browser — no browser/screenshot tool available in this environment — flagged in the design
doc as the one remaining manual check before calling this fully done. Local anvil +
Postgres left running (freshly seeded, pre-warmed) in case jay wants to pick up testing
directly in the browser.

### Task 4: documented next-phase plan, no code change

jay asked to make trading's remaining few-seconds wait vs. resolution's untouched
few-seconds wait explicit, then to write down what's next. Added a "Next phase" section to
[jul-22-trade-resolution-latency-ux.md](../tasks/details/jul-22-trade-resolution-latency-ux.md):
(1) optimistic UI in `ResolvePanel` — same pattern as `TradePanel`, small/self-contained,
next thing to build when jay says go; (2) SSE staged progress — still conditional on #1
proving insufficient; (3) a real-user deposit flow, flagged as a distinct, explicitly
out-of-scope future concern (belongs with the S7 account-abstraction track), so it isn't
lost even though it's not part of this design.

### First real run of `scripts/deploy.sh` — deployed today's work to the live test server

jay asked to deploy to `https://verex-web-496608424746.asia-northeast3.run.app/`. Checked
before touching anything, per jay's own request, and found `deploy.sh` had in fact never
been run end-to-end (its own header said so) — `scripts/deploy.env` was configured for
`-staging`-suffixed resources (`verex-web-staging`, `verex_staging`, etc.) that don't
exist; the real live services are plain `verex-web`/`verex-api` on database `verex`.
Running the script as configured would have silently created a second, parallel set of
billable resources instead of updating the live one.

**Fixes applied, in order:**
1. Corrected `scripts/deploy.env` to the real resource names + `VEREX_CHAIN_ID=11155111`.
2. Added a `SKIP_SEED` flag to `deploy.sh` — re-running `seed.ts`'s on-chain calls against
   an already-prepared backbone reverts (same non-idempotency documented in
   [jul-22-trade-resolution-latency-ux.md](../tasks/details/jul-22-trade-resolution-latency-ux.md)),
   so avoided a second real contract deployment entirely.
3. Created the 3 missing chain secrets (`verex-rpc-url-verex`, `verex-operator-key-verex`,
   `verex-demo-mnemonic-verex`) from the same values already in `packages/api/.env`.
4. Found the cloud DB wasn't empty but was stale — 10 old `Market`/`Outcome` rows with no
   `ChainConfig`/`Trade`/`PricePoint` tables at all (predates those models; no
   `_prisma_migrations` tracking, hence `migrate deploy`'s `P3005`). Confirmed with jay
   before touching it, then dropped the stale schema, ran `prisma migrate deploy` clean,
   and populated it via `pg_dump`/`psql` (through the `verex-pg` Docker container reaching
   the Cloud SQL proxy via `host.docker.internal`) from the already-seeded local DB —
   `ChainConfig`/`Market`/`Outcome`/`PricePoint` copied, `Trade` deliberately left empty
   (local test trades, not cloud data).
5. **Caught before running**: `deploy.sh`'s `SECRET_NAME` always appends `-${DB_NAME}`
   (`verex-database-url-verex`), which doesn't match the existing unsuffixed
   `verex-database-url` secret the live service actually uses. Running as-is would have
   taken the "create new" branch, called `gcloud sql users set-password` on the **live**
   DB user, and broken the running service on its next cold start. Fixed by pre-creating
   `verex-database-url-verex` as a copy of the existing secret's value — zero password
   rotation, the live service was never at risk.
6. Ran `SKIP_SEED=1 ./scripts/deploy.sh` — succeeded, updated `verex-api`/`verex-web` in
   place (new revisions serving 100% traffic).

**Verified live, not just "no errors”**: `/health` OK, 10 markets present, `GET
/wallet/1` shows the exact position from jay's own earlier test trade (bought, resolved,
`won: true`), and a fresh live `POST /trade` BUY completed in ~9.6s end-to-end with
`faucetMinted: false` — confirming the pre-warming fix (Task 4, part 1) is live and
working against the real chain, not just locally.

### Design (not built): per-environment contract isolation — Task 5

Right after seeing today's deploy work, jay flagged that reusing one Sepolia backbone
across local dev and the cloud test server isn't the right long-term approach — it only
worked via the `SKIP_SEED` + DB dump/restore workaround, since `seed.ts`'s on-chain calls
aren't idempotent against an already-seeded backbone. Wrote up the plan, not implemented:
each environment (local anvil, cloud test, eventual production) should get its own
independently deployed backbone, making `SKIP_SEED` a break-glass tool rather than the
normal deploy path. No changes made to today's live deploy — open question left for jay on
whether to redo it now with a dedicated backbone or leave it until production exists. Full
writeup:
[details/jul-22-per-environment-contract-isolation.md](../tasks/details/jul-22-per-environment-contract-isolation.md),
linked from [jun-19-verex-design.md](../tasks/jun-19-verex-design.md) as Task 5.

### Fixed: BUY broken on the live test server (`next.config.js` rewrites baked build-time URL)

jay hit `"Unexpected token 'I', "Internal S"... is not valid JSON"` clicking Buy on the
live test server. Traced it to `verex-web`'s own Cloud Run logs (not `verex-api`'s — the
request never reached the API at all): `Failed to proxy http://localhost:4000/trade
Error: connect ECONNREFUSED 127.0.0.1:4000`. Root cause: `next.config.js`'s `rewrites()`
is evaluated once at `next build` time, not per-request, but `API_URL` is only ever set
later via `gcloud run deploy --set-env-vars` (a Cloud Run *runtime* setting the Docker
build stage never sees) — so the rewrite destination permanently baked in its fallback,
`http://localhost:4000`, with no deploy-time env var able to override it afterward.
Invisible in local dev only because that exact fallback happens to be where the local API
actually runs — same bug, coincidentally correct value.

Fix: replaced the `rewrites()` proxy with a Route Handler
([backend/[...path]/route.ts](../../packages/web/src/app/backend/%5B...path%5D/route.ts))
that reads `process.env.API_URL` fresh on every request — true runtime evaluation, not
build-time. Added a try/catch around the proxy fetch so an unreachable API returns a clean
502 instead of an unhandled rejection. Verified rigorously before redeploying: built the
production standalone bundle locally, pointed it at a deliberately non-default port
(4321, not the coincidentally-correct 4000), confirmed the proxy succeeds when that target
is up and fails cleanly when it's killed — proving genuine per-request dynamic behavior,
not another coincidence. Redeployed `verex-web` only (API/DB untouched); confirmed live via
the actual `/backend/*` path: GET markets, GET wallet, and a live BUY all returned 200,
the exact request that was failing in jay's screenshot.

### Task map: marked actually-completed tasks as done

jay asked to reflect which tasks are actually done in
[jun-19-verex-design.md](../tasks/jun-19-verex-design.md)'s task map, not just "designed."
Updated: Task 2 (deploy) → done for Cloud Run/Cloud SQL/chain-live, domain mapping still
explicitly called out as not done; Task 3 (portfolio/resolution) → done, matching its
details doc's own status; Task 4 (latency UX) → marked partial (items 1-2 done, 3-4 not);
Task 5 (contract isolation) → left as designed-only, not implemented.
