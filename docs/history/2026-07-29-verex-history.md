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
