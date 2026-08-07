# 2026-08-07 — verex

Source docs: [docs/runbooks/deploy.md](../runbooks/deploy.md),
[docs/runbooks/uma-adapter.md](../runbooks/uma-adapter.md) — this day executes their
staging-deploy + re-seed path after PR #15 (UMA/LMSR/docs branch) merged to main.

### First real staging-deploy workflow run: three latent CI bugs

- **Cause:** jay merged PR #15 and asked for a staging deploy. The workflow's trigger is
  deliberately manual, and dispatching it for the first time surfaced three failures in a row.
- **Reasoning:** each failure was one layer deeper than the last, so they were fixed one at a
  time on `claude/fix-deploy-pnpm` (PR #16) and re-dispatched from that branch — deployed code
  identical to main, only CI plumbing differs.
- **Change:** (1) dropped `version: 9` from `pnpm/action-setup` — it hard-fails when
  `package.json` also carries `packageManager`; (2) checkout `submodules: recursive` + Foundry
  install + `forge build` before `sync-abis` — ABIs are generated, not committed; (3)
  `sync-abis.mjs` now falls back to version-suffixed forge artifacts (`Name.0.8.15.json`):
  sources compiled under two solc versions get no plain `Name.json`, and local runs only worked
  because an old single-version build had left one behind (ABI verified identical across
  versions); (4) `gcloud builds submit --async` + a `builds describe` poll loop — log
  *streaming* needs project Viewer, which the WIF service account lacks, so the CLI exited 1
  while the build itself ran to SUCCESS.
- **Result:** run 4's Cloud Build proved the image builds green. An IAM fix (grant the SA
  `roles/viewer`) was attempted but blocked by the permission classifier — left for jay to
  decide; the async-poll fix makes it optional. PR #16 holds all four commits, unmerged.

### Direct deploy instead of CI (jay's call), seed rides along

- **Cause:** jay: deploy directly for now, CI can come later after the more important tests.
- **Reasoning:** `scripts/deploy.sh` runs under jay's local owner credentials, so none of the
  CI permission issues apply; it also migrates + seeds in the same pass, which staging needed
  anyway for the UMA market. CI run 5 was cancelled first so the two paths couldn't race on
  `gcloud run deploy`.
- **Change:** ran `./scripts/deploy.sh` (target `staging`) end to end: migrate → real seed
  against Sepolia (staging data wiped and recreated, as planned) → API image via Cloud Build →
  `verex-api` + `verex-web` to Cloud Run.
- **Result:** exit 0. Verified live: `/health` ok; `/config` returns `umaAvailable: true`,
  adapter `0x1B45…00AC` (matches the manifest); `uma-eth-above-6k-2026` present, `oracleType:
  "UMA"`, `OPEN`. Staging is ready for jay's propose → 1h liveness → resolve test.
  Web: https://verex-web-q6qvjcw5ma-du.a.run.app
