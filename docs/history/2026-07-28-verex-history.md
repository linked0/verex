# 2026-07-28 — verex history

> Source docs: [`docs/tasks/jul-28-verex.md`](../tasks/jul-28-verex.md) (task spec) →
> [`docs/tasks/jul-28-verex-design.md`](../tasks/jul-28-verex-design.md) (design written today).

### Jul-28 features: design doc drafted, awaiting jay's approval

Explored verex + the nostra-server reference and wrote the full implementation plan into
`docs/tasks/jul-28-verex-design.md` (branch `claude/jul-28-features`). No code changes yet — the
task spec requires jay's sign-off first.

### Decision: multi-outcome = N grouped binary conditions, not one N-slot condition

`CTFExchange`'s registry (`Registry.sol:41-51`) stores exactly one complement per token and
enforces it on every fill — a single N-slot CTF condition is untradeable on our exchange. So
"who wins the World Cup" = N binary markets + a DB-only `MarketGroup`, same shape as Polymarket
grouped markets and the reference project.

### Decision: group prices renormalized deterministically (Σ = 1), diverging from the reference

nostra-server leaves group outcomes unnormalized (an arb bot merely keeps the sum inside
±5%) and its display price is a lifetime VWAP. Verex instead proportionally rescales the other
outcomes after each trade so probabilities always sum to exactly 1 — simpler, always coherent,
and a clean-room-different algorithm (also serves the copyright-differentiation requirement).

### Decision: async settlement via a DB `ChainJob` queue; DB is the UX source of truth

Trade/resolve/redeem answer instantly from the DB and the chain settles behind a status chip;
serial worker (concurrency 1) doubles as operator-wallet nonce management; atomic job claim
fixes the double-execution flaw observed in the reference's queue. Supersedes the jul-22 doc's
"job system would be over-engineering" stance — jay explicitly asked for server-side async.
Caveat for jay: the Cloud Run worker needs `--no-cpu-throttling` + `min-instances 1` (cost).

### Root cause: local seed failed with `returned no data ("0x")` — Sepolia addresses leaked into the local backbone

`seed.ts:51` loads `packages/contracts/.env` as a fallback, which still held
`USDC_ADDR`/`CTF_ADDR`/`EXCHANGE_ADDR` from the jul-22 Sepolia deploy (identical to the `test`
manifest in `deployments.json`). With all three set, the local seed took the "reusing backbone
from env" branch and called Sepolia contracts on a fresh anvil (no code → empty return data).
Fix: commented the three lines out (with a warning comment) — the seed now falls through to a
fresh forge deploy; verified `./scripts/reset.sh` end-to-end (10 markets, app renders).
Note: the seed's code-exists preflight only guards the test/prod manifest path — adding it to
the local env branch is a candidate hardening for the jul-28 branch.
(Source: jay's failing `./scripts/reset.sh` run, no task file.)

### README: "Run locally" made concrete for the anvil lifecycle

Split into first-time setup vs. daily start (anvil is in-memory ⇒ every restart requires
`./scripts/reset.sh` before using the app) and documented the stale-env-address gotcha above
with its exact error message and fix. (Source: jay's request in conversation, no task file.)

### jun-19 task map closed out (all 5 tasks ✅)

Per jay: marked tasks 4 and 5 complete — task 4's leftovers (#3 ResolvePanel optimism, #4 SSE)
are superseded by the jul-28 async-settlement design (Task C); task 5 is satisfied by the
committed `deployments.json` manifest + `VEREX_DEPLOY_TARGET` preflight; task 2's domain gap
closed via Firebase Hosting (`5278191`, `9921e23`).
(Source: [jun-19-verex-design.md](../tasks/jun-19-verex-design.md).)

### Footer branding: profile avatar swapped in as jaylabs.png

Replaced the footer "powered by" image with jay's profile avatar (from the rabbit repo):
old logo kept as `jaylabs-old.png`, avatar now `jaylabs.png`, `layout.tsx` unchanged in the end.
Verified in the browser. (Source: jay's request in conversation, no task file.)

### Noted: pre-existing uncommitted MarketCard.tsx polish left untouched

The working tree already had cosmetic hover/probability-bar changes to
`packages/web/src/components/MarketCard.tsx` from an earlier session; carried on the new branch
unmodified, kept separate from jul-28 work.
