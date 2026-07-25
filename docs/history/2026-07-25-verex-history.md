# 2026-07-25 — verex history

> Source docs: no separate task/design doc — direct request from jay's live chat
> ("deploy the verex app to verex.jaylabs.xyz"). Related prior art:
> [2026-07-22 history](2026-07-22-verex-history.md) (first real deploy.sh run) and
> rabbit's jun-30 design §11 (the same region limitation, discovered 2026-07-07).

### verex.jaylabs.xyz went live — via Firebase Hosting rewrite, not Cloud Run domain mapping

jay asked to put the (already verified) Cloud Run test site on `verex.jaylabs.xyz`.
Found the repo's `setup-dns.sh` was a dead end before running it: Cloud Run's built-in
domain mapping does **not** support `asia-northeast3` (re-verified against the official
region list on docs.cloud.google.com — same limitation rabbit hit on 2026-07-07), and the
`jaylabs.xyz` Cloud DNS zone lives in `doubletree-498007`, not `verex-499205`, which the
script also didn't account for. Chose the Firebase Hosting rewrite route (jay confirmed;
same as rabbit §11's recommendation): ~free, Google-managed TLS, keeps Seoul.

### What was done (all REST via gcloud token — no firebase CLI installed)

1. Enabled `firebase.googleapis.com` + `firebasehosting.googleapis.com` on `verex-499205`,
   added Firebase to the project (default Hosting site `verex-499205` auto-created).
2. Released a Hosting version whose only content is the rewrite `** → verex-web
   (asia-northeast3)` — zero static files; verified `https://verex-499205.web.app`
   serves the verex Next.js app (200) before touching DNS.
3. Registered custom domain `verex.jaylabs.xyz`, read back its required records, and
   created them in the `jaylabs-xyz` zone (project `doubletree-498007`):
   `verex.jaylabs.xyz CNAME verex-499205.web.app` + the ACME `TXT` for cert issuance.
4. Repo: new `scripts/setup-domain-firebase.sh` (idempotent, encodes the whole flow),
   `firebase.json` + `.firebaserc` (CLI-compatible mirror of the rewrite),
   `setup-dns.sh` marked ⛔ superseded with the reason, `deploy.env` DOMAIN →
   `verex.jaylabs.xyz`.

### verex.jaylabs.xyz LIVE ✅ + decision: current env = TEST, new PROD env to be built

Cert issued ~10 min after the DNS records; `https://verex.jaylabs.xyz` returns 200.
Then jay clarified the intent: **the current Cloud Run env is the test server** (checked
via the `*.run.app` URLs) and **verex.jaylabs.xyz is for a separate production env** —
so the domain currently serves the test env only as an interim state, until the prod env
exists and the Firebase rewrite is repointed. jay also chose a **separate Cloud SQL
instance** for prod (full isolation, ~$10+/mo) over a shared one. This puts Task 5
([per-environment contract isolation](../tasks/details/jul-22-per-environment-contract-isolation.md))
into motion for real.

**Prepared (cloud-side, no on-chain action taken):**
- `deploy.sh` now takes `DEPLOY_ENV=<file>` (default `scripts/deploy.env`) — one script,
  both environments.
- New `scripts/deploy.env.prod` (git-ignored, like deploy.env): `verex-web-prod` /
  `verex-api-prod` / instance `verex-db-prod` / DB `verex_prod` / chain 11155111, with
  the prereqs documented in-file.
- `scripts/deploy.env` re-annotated as the TEST env (no domain).
- Repointing the domain after the prod deploy = `SERVICE=verex-web-prod
  ./scripts/setup-domain-firebase.sh` (idempotent — just re-releases the rewrite).

**Deliberately left for jay (runbook's own rule — operator key + on-chain broadcasts are
his):** fresh backbone deploy (runbook §3), fresh mnemonic + wallet funding (§4), the 3
`-verex_prod` secrets (§6). Then the cloud deploy + domain repoint can run.

### Footer: "powered by JayLabs" → www.jaylabs.xyz

jay asked where on the Verex homepage to put a "powered by JayLabs" link. Answer: the
**global footer** in `packages/web/src/app/layout.tsx` — the conventional home for
"powered by" attribution, and it renders on every page (homepage included) rather than
just one. Added the link (`target="_blank"`, subtle hover underline) after the existing
footer text; verified live via the running dev server (HMR) — footer renders, link
present. jay then asked to liven it up with his avatar: copied rabbit's `app/icon.png`
into `packages/web/public/jaylabs.png` (20px rounded, inline with the link text). Then
jay cut the old tech line ("markets settle on-chain (local anvil · CTF Exchange
backbone)") as unnecessary/verbose — it was also stale (says "local anvil"; the cloud
envs trade on Sepolia). Footer is now a single centered line: avatar + "powered by
JayLabs". Re-verified in the browser each step. **⚠️ Open:** `www.jaylabs.xyz` has **no DNS record yet** (zone has only the
verex records + NS/SOA) — the link is dead until www is wired to rabbit (per rabbit's
jun-19 Phase-2 plan; would need the same Firebase-Hosting-rewrite flow as today's
verex.jaylabs.xyz, since rabbit is also in asia-northeast3). Flagged to jay for a
decision.

### Unpublished verex.jaylabs.xyz (jay: not yet — wait for the real production env)

jay asked to take `verex.jaylabs.xyz` offline for now (it had been serving the TEST env as
an interim state). Done by deleting the two DNS records (`CNAME` + ACME `TXT`) from the
`jaylabs-xyz` zone and soft-deleting the Firebase custom-domain registration (purges
2026-08-24; restorable before then). Verified: authoritative NS + public 8.8.8.8 both
return empty; cached resolvers may serve the old CNAME up to 5 min (TTL 300). The
`*.run.app` test URLs are untouched and still up (200) — that's jay's private access.
**Re-enable** when production is ready: rerun `./scripts/setup-domain-firebase.sh`
(idempotent — re-registers the domain and re-creates the records; with
`SERVICE=verex-web-prod` it points at production directly).

### Deployed current app to the test env; domain stays on it temporarily (jay)

jay asked to deploy the current verex app to Cloud Run, then to production after checking.
Ran `SKIP_SEED=1 ./scripts/deploy.sh` (seed skip mandatory — non-idempotent against the
live backbone, per the Jul-22 gotcha): migrations applied, API image built (2m43s), new
revisions `verex-api-00003` / `verex-web-00004` serving 100%. Verified end-to-end:
`/health` ok, markets render, and the new footer (avatar + "powered by JayLabs", old tech
line gone) is live — including via `https://verex.jaylabs.xyz`.

**Production still can't deploy** — zero `-verex_prod` secrets / services / instance; the
missing prereqs are jay's on-chain runbook steps (§3 backbone, §4 mnemonic+funding, §6
secrets). jay's interim decision: **point verex.jaylabs.xyz at the current Cloud Run
server temporarily** — which turned out to already be the live state: the parallel
session's incident recovery had restored the DNS records (fresh ACME token) after the
morning unpublish; HTTPS 200 confirmed, custom-domain registration no longer
soft-deleted. So the unpublish entry above is superseded by jay's newer decision.

### Gotchas worth remembering

- **ADC quota-project 403** on Firebase REST calls — fixed by sending
  `x-goog-user-project: verex-499205` alongside the bearer token.
- **Cross-project DNS**: hosting lives in `verex-499205`, the DNS zone in
  `doubletree-498007` — fine, records just go in the zone's project; the new script
  takes `DNS_PROJECT`/`DNS_ZONE` env overrides for this.
- Firebase's new customDomains API asks for a **CNAME** (subdomain case) — no A/AAAA
  records needed, and ownership is proven by the CNAME itself plus the ACME TXT.

### Outage: verex.jaylabs.xyz DNS records deleted by rabbit's apex registration (~13 min)

Not caused by anything in this repo, but recorded here because this is the site that went down.

While setting up `www.jaylabs.xyz` for rabbit, the **apex** `jaylabs.xyz` was also registered as
a custom domain on rabbit's Firebase Hosting site in `doubletree-498007` — the same project that
owns the `jaylabs-xyz` Cloud DNS zone. That gave Firebase write access to the zone and authority
over the domain, and ~6 minutes later it deleted `verex.jaylabs.xyz CNAME verex-499205.web.app`
and its `_acme-challenge` TXT, treating a subdomain pointed at a *different* Hosting site as a
conflict. Site returned NXDOMAIN until the records were restored (ACME token had rotated in the
meantime). This Hosting site was never modified — `OWNERSHIP_ACTIVE / HOST_ACTIVE / CERT_ACTIVE`
throughout; only DNS was missing.

**Correction to the entry above:** cross-project DNS (hosting in `verex-499205`, zone in
`doubletree-498007`) was listed as a mere gotcha. It is actually what kept this domain safe —
Firebase could not write the zone from `verex-499205`. Same-project hosting + zone is the
hazardous arrangement.

**Resolved** by dropping rabbit's apex registration entirely (www only). Full incident writeup:
[rabbit's 2026-07-25 history](../../../rabbit/docs/history/2026-07-25-rabbit-history.md).
