# 2026-08-11 — verex history

Source: jay's request (portfolio-readiness for prospective employers) + live investigation of
residual balances on prod. Related: [2026-08-10 history](2026-08-10-verex-history.md) — the
question-key nonce fix (PR #23) whose absence in old data explains today's finding.

### Prod ghost balances: root cause is pre-nonce markets on a persistent chain, not the DB

- **Cause:** jay noticed re-seeded/removed markets leaving "remaining data" and suspected reused
  market ids.
- **Reasoning:** every DB id is `@default(cuid())` (random per row), so DB ids can never survive a
  re-seed — the DB is clean. What survives is Sepolia (prod chainId 11155111, persistent). Prod's
  10 markets predate PR #23's question-key nonce, so their questionId → conditionId → tokenIds are
  pure functions of the slug: identical across every seed generation ever run against the prod
  backbone. Old sessions' ERC-1155 balances therefore reattach to today's markets.
- **Change:** none yet — diagnosis only. Verified live: prod wallet 1 holds 4,217 USDC and
  positions like 270.3 tokens against a $100 cost basis; wallet 3 holds exactly 2,000 USDC (two
  seed-era 1,000 mints — the seed's top-up guard normalizes up, never down). Local (fresh
  nonce-era seed) shows all wallets clean at 1,000/0.
- **Result:** fix plan proposed to jay: (1) seed dates relative to run time, (2) seed normalizes
  USDC down to the 1,000 target, (3) full prod re-seed (drop SKIP_SEED) so nonce-era question
  keys mint fresh token ids and evict the ghosts. jay deferred all of it ("never mind the
  previous things except the one") — parked alongside the other open decisions; the diagnosis
  above stands whenever it's picked back up.

### Docs site: new "Architecture: web, API & Sepolia" page (/docs/chain)

- **Cause:** jay wants to show Verex to prospective employers and asked for a docs **web page**
  (not a markdown file) explaining how the product talks to Sepolia and the contracts —
  specifically naming the contracts and how the API and web relate to them.
- **Reasoning:** the docs system stores documents as en/ko data blocks rendered by DocBody, so
  the page is a new content file, not new markup. Two supporting changes were needed: (a) DocBody
  had no link syntax, and Etherscan-verifiable addresses are the point of the page — added a tiny
  `[text](url)` inline form; (b) the web Docker build (`--source packages/web`) can't see
  `packages/contracts/deployments.json`, so the addresses are mirrored as data with a
  source-of-truth comment instead of imported.
- **Change:** `content/docs/chain.ts` (5 sections × en/ko: four-layer architecture, the five
  contracts with origin/role, Sepolia address tables with Etherscan links for staging+prod,
  server-held-keys custody model, which-layer-calls-what flows), registered in `lib/docs.ts`
  after settlement; link support in `DocBody.tsx`. Also `next.config.js` now honors
  `NEXT_DIST_DIR` so a verification build can run beside a live server on `.next` — yesterday's
  build-corrupts-dev-server gotcha, fixed structurally (`.next-verify/` gitignored).
- **Result:** verified via an isolated `NEXT_DIST_DIR=.next-verify` build served on :3187 — all
  5 sections render in both locales, 8 unique Etherscan links present, sidebar/pager pick the doc
  up. (jay's local :3000 `next start` still serves yesterday's corrupted `.next` — every docs
  page 500s there, unrelated to this change; a rebuild/restart on his side clears it.)
