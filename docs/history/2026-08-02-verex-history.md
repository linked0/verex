# 2026-08-02 — verex history

> Source docs: none — direct chat request from jay (no task/design file).

### feat(web): Telegram notification on home page visits

jay wanted one more notification alongside the existing trade/faucet/resolve ones: a ping when
someone lands on the Verex home page.

Added `packages/web/src/lib/visitor-notify.ts`, mirroring the API's
`telegram-notify.ts` — fire-and-forget POST to Telegram, gated on `TELEGRAM_BOT_TOKEN` +
`TELEGRAM_CHAT_ID` (unset = silently off), errors logged but never thrown so a Telegram outage
can't affect a page render. 5-minute per-IP debounce so refreshes don't spam, plus a size cap on
the debounce map so a long-lived instance can't grow it unbounded.

Wired into `src/app/page.tsx`. **Deliberately verified the build still reports `ƒ /` (dynamic)
rather than `○` (static)** — a static home page renders once at build time, so the notification
would never fire on real visits and would fail silently. That's exactly the bug fixed on
`/portfolio` the day before, so it was worth checking rather than assuming.

Deploy wiring: the Telegram secret previously went only to the API service. `scripts/deploy.sh`
now passes `TELEGRAM_BOT_TOKEN` (same Secret Manager entry) and `TELEGRAM_CHAT_ID` to the **web**
service too, folded into a single `--set-env-vars` flag alongside `API_URL` — gcloud only honours
the last such flag if passed twice, which would silently have dropped `API_URL` and broken the
site.

Deployed web-only (`gcloud run deploy --source packages/web`) rather than the full script, since
`deploy-prod.sh` would re-run the non-idempotent seed against an already-seeded backbone.
Verified after deploy: the service really has all three env entries (`API_URL` preserved), the
live home page returns 200, and no `visitor-notify` errors appear in Cloud Run logs.

### feat(notify): project emoji prefix on Telegram messages

jay couldn't tell rabbit and verex notifications apart in Telegram — both used 👀 for a page
visit. Every message now leads with a project marker and the project name: 🔮 for verex (the
prediction market), 🐰 for the rabbit portfolio site, with the event emoji kept second
(👀 visit · 💱 trade · 🚰 faucet · 🏁 resolve). The project name is spelled out in text too,
since emoji render small in a phone's notification preview.

Previewed all six formats by sending them straight to Telegram before deploying, so jay could
judge the look first rather than shipping and iterating.

Deployed all three services and verified each with a real trigger, not just a config check:
verex-web-prod (-00006-2mf, live home visit), verex-api-prod (-00005-ln4, real faucet call on
prod — 3,882.73 USDC minted), and rabbit (-00036-lsd, live home visit). API deploy stayed scoped
(image + secret/env update) to avoid the non-idempotent seed step.
