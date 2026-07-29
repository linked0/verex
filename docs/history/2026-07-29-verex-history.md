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

### Gotcha: `next build` while `next dev` is running corrupts `.next`

Running a production `next build` in `packages/web` while jay's dev server was up broke the
dev server ("Cannot find module './vendor-chunks/tailwind-merge…'") — both write to the same
`.next` directory. Fix: kill the dev server, `rm -rf .next`, restart. Avoid verifying web
changes with `pnpm build` when a dev server is already running on the machine.
