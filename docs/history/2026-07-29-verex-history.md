# 2026-07-29 — verex history

> Source docs: [`docs/tasks/jul-28-verex.md`](../tasks/jul-28-verex.md) →
> [`docs/tasks/jul-28-verex-design.md`](../tasks/jul-28-verex-design.md) (implemented on
> `claude/jul-28-features`); staging deploy per [`docs/runbooks/deploy.md`](../runbooks/deploy.md).

### Staging deploy: jul-28 branch live on Cloud Run + Sepolia

Deployed `claude/jul-28-features` to staging per the runbook — no contract redeploy (the
existing Sepolia backbone from `deployments.json` `staging` was reused; only off-chain code
changed) and the existing demo mnemonic was kept. The seed ran idempotently against the live
backbone: the 10 existing markets skipped prepare/register and topped up inventory, the 21
new group members were created fresh (~15 min of Sepolia txs, ~0.011 ETH at ~1.1 gwei), MM
books posted. 5 new DB migrations applied through the Cloud SQL proxy.

New this deploy: `gcloud run services update verex-api --no-cpu-throttling --min-instances 1`
(revision `verex-api-00007-c6m`) — required so the in-process ChainJob worker keeps CPU
between requests; settings persist across future revisions.

Verified live on staging: health OK, 3 groups OPEN with quoted books, one real trade
(11.11 Yes @ 45¢) filled instantly in the DB and settled on Sepolia via matchOrders
(`0xba1e5165…e1157`), position visible in the portfolio.

- API: https://verex-api-q6qvjcw5ma-du.a.run.app
- Web: https://verex-web-q6qvjcw5ma-du.a.run.app

### Market detail logo + edit page (image URL / rules / category)

No task/design doc — implemented directly from jay's chat request (with a Polymarket
screenshot as the visual reference), on branch `claude/jul-29-market-edit`.

The market detail page now shows the market logo (56px, vs 36px on the grid cards) next to
the title, preferring `market.imageUrl` over the seeded picsum fallback — `MarketCard` got
the same `imageUrl ?? marketThumbnail` fallback that `GroupCard` already had. The Create
page doubles as an edit page via `/create?edit=<slug>` (linked from a pencil icon on the
detail page): image URL, rules, and category are editable through a new
`PATCH /markets/:slug`. Permission split per jay's spec: the operator (#0) may only change
the image URL — rules and category are the creator's copy — enforced in both the UI
(disabled fields + banner) and the API (403).

### Follow-up: market editing flipped to operator-only

jay clarified the intent ("Only Operator can edit"): the first cut let any wallet edit all
fields while restricting the operator to the image URL — inverted. Now `PATCH /markets/:slug`
rejects every accountIndex except 0, the edit form disables all fields (with a banner) for
non-operator wallets, and the detail page's Edit link renders only for the operator (new
`EditMarketLink` client component, since the page itself is a server component).

### Fix: homepage Featured card ignored the edited image URL

jay's edited logo didn't show on the main page — the market he edited was the
highest-volume one, which renders as the homepage's **Featured** card, and that card still
called `marketThumbnail(slug)` directly. The imageUrl-fallback sweep had covered
`MarketCard`/`GroupCard`/detail but missed this fourth call site. All four now use
`imageUrl ?? marketThumbnail(slug)`.

### Fix: group detail page had no logo at all

Follow-up from jay: the group detail page (`/group/[slug]`) never rendered a logo — unlike
the market detail page it simply had no `<img>`. Added the same 56px
`imageUrl ?? marketThumbnail` treatment next to the group title; verified with the Oscars
group (custom URL) and the World Series group (picsum fallback).

### Fix: group cards get the signature probability bar

jay flagged (with a screenshot) that grid cards were inconsistent: `MarketCard` has the
top gradient bar driven by the Yes price, `GroupCard` had none. Group cards now render the
same bar with width = the leading outcome's probability (`members[0].quoteCenter`).

### Group cards: stacked per-outcome bar; groups get the edit feature

Two more follow-ups from jay. (1) The group card's top bar now stacks one segment per
member's Yes probability using the group chart's palette — moved to `GROUP_COLORS` in
`lib/utils.ts` so chart and bar can't drift; the grey track shows through as the "+N more"
remainder. (2) Groups are now editable like markets: `PATCH /market-groups/:slug`
(operator-only; category cascades to member markets, mirroring creation), the edit page
takes `?editGroup=<slug>`, and the group detail header gets the operator-only Edit link.

### Prod deploy: jul-29 branch live on verex.jaylabs.xyz

Deployed `claude/jul-28-features` (through `4cdb36c`) to prod per the runbook day-2 path:
`SKIP_SEED=1 ./scripts/deploy-prod.sh` — migrate ran, seed skipped, API image built
(3m17s), both services redeployed. Also applied the staging CPU fix to prod:
`gcloud run services update verex-api-prod --no-cpu-throttling --min-instances 1`
(revision `verex-api-prod-00003-t5s`) — prod's rev 00001 predated that discovery.
Verified live: health OK, both PATCH routes respond 403 to non-operators, market pages
render the 56px logo, domain serves the new revision.

**Data gap found**: prod has the 10 original binary markets and **zero groups** — its
one-time seed predates the group feature (staging got its 21 group members via the
jul-29 idempotent re-seed). Group features are live in code but have nothing to render.
Fix requires re-running the real seed against the prod backbone — **destructive** (wipes
prod Trade/PricePoint/Outcome/Market rows, ~15 min of Sepolia txs from the prod
operator) — parked for jay's decision.

### Seed script: bake in the prod-curated market logos

jay hand-picked logo URLs for all 10 binary markets on the live prod site (via the new
edit feature); those exact URLs are now in `seed.ts` (`SeedMarket.imageUrl`, threaded
through both the DB-only and on-chain create paths) so any future seed — including a
prod group re-seed — reproduces them instead of losing them to the picsum fallback.
Verified by diffing seed.ts against the prod API per slug: all 10 match.

### Prod: featured market switched to the Coachella K-pop market (volume bump)

jay wanted `kpop-headliner-coachella-2027` featured on prod. Featured is derived (highest
volume), so per jay's call we set that market's volume to 6,000,000 directly in the prod
DB (Cloud SQL proxy + Prisma; ETH was at 5,620,010) instead of adding a FEATURED_SLUG
env override (drafted, then reverted — jay preferred the data route). Side effect,
accepted: the market now displays $6M Vol and tops the Hot list. No code change.

### Prod re-seed: groups created, empty books refilled — liquidity error resolved

jay hit "no liquidity at this price" on prod and prod had no groups, so we ran the real
seed against the live prod backbone (jay-approved; DB wipe accepted). Result: 10 binaries
re-created (existing conditions skipped, inventory topped up) + 3 groups / 21 members
created fresh on Sepolia + MM ladders posted for all 31 books; curated logos survived via
the seed change. Verified: books show 5×5 depth, and the previously-failing case
(kr-world-cup Yes BUY) filled at 32¢ and settled on-chain (`0x441b1a94…6317`) — the
settlement also exercises the new no-cpu-throttling worker. Root cause of the drained
books: pre-fix CPU throttling froze the in-process re-quote worker between requests.
The kpop featured volume bump was wiped by the reset; re-apply pending (permission gate).

### Gotcha: `next build` while `next dev` is running corrupts `.next`

Running a production `next build` in `packages/web` while jay's dev server was up broke the
dev server ("Cannot find module './vendor-chunks/tailwind-merge…'") — both write to the same
`.next` directory. Fix: kill the dev server, `rm -rf .next`, restart. Avoid verifying web
changes with `pnpm build` when a dev server is already running on the machine.
