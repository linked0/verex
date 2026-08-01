# 2026-08-01 — verex history

> Source docs: none — direct chat request from jay (no task/design file).

### feat: Telegram notifications on trade/faucet/resolve

jay wanted a Telegram message whenever something happens on verex — trading, faucet claims,
market resolution — to gauge actual usage. Considered a batched hourly-digest design first
(events table + cron job) but jay clarified he wants it immediate, per-event, not hourly — much
simpler, so went with that instead.

Added `packages/api/src/telegram-notify.ts`: fire-and-forget POST to Telegram's `sendMessage`
API, gated on `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` both being set (missing = feature
silently off), errors logged but never thrown — a Telegram outage must never affect a real
trade/faucet/resolve request. Wired into all four event points in `index.ts`: `/trade`,
`/faucet`, `/markets/:slug/resolve`, `/market-groups/:slug/resolve`.

Verified for real before committing: sent a live test message through the actual bot token +
guessed chat id (from the existing Telegram allowlist) — it worked, and the response confirmed
the chat belongs to jay ("Hyunjae Lee"), confirming the whole pipeline end-to-end rather than
just wiring it blind.

### deploy: wire the Telegram bot token through Secret Manager

Extended `scripts/deploy.sh` to pass `TELEGRAM_BOT_TOKEN` to Cloud Run the same way
`DATABASE_URL` and the chain secrets already work — script only *reads* a pre-existing secret,
never creates or prints it (same non-creating pattern as the RPC/operator/mnemonic secrets).
Created `verex-telegram-bot-token-verex` and `-verex_prod` directly in Secret Manager using the
token jay provided. Added `TELEGRAM_CHAT_ID` (not sensitive, just a Telegram user id) to both
git-ignored `scripts/deploy.env(.prod)` files.

Had to refactor the API env-vars wiring slightly: `gcloud run deploy` only honors the *last*
`--set-env-vars` flag if passed twice, so `VEREX_CHAIN_ID` and the new `TELEGRAM_CHAT_ID` now
merge into one combined flag instead of risking a silent override.

**Did not run `./scripts/deploy.sh` or `./scripts/deploy-prod.sh`.** The script's own header
warns "not yet run end-to-end... best run WITH jay," and both `verex-api`/`verex-api-prod` are
already-live services — a full re-run would hit the seed step's non-idempotent on-chain calls
against an already-seeded backbone (documented in the script as reverting, not safe to repeat).
Flagged this to jay and proposed a scoped `gcloud run deploy`/`services update` (image +
secret/env update only, skipping migrate/seed) as the safer way to actually ship this to the
live services — pending his decision.
