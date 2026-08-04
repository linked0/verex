# 2026-08-04 — verex

**Source docs this day implements:**
- [docs/tasks/current-plan.md](../tasks/current-plan.md) — rolling plan; §0 gates still open (G1/G2/G3 open, G5 failed)
- [docs/features/web-ui.md](../features/web-ui.md) — web surface this day's UI work extends
- No prior task file covers the Docs / i18n / theme work — it came directly from jay's request on 2026-08-04.

---

### Web chrome: dark mode + Korean/English switching

**Cause:** jay asked for two icon menus in the top nav — one to change language, one to
switch light/dark — alongside the Docs restructure.

**Reasoning:** Hand-rolled both rather than adding `next-themes` / `next-intl`: tailwind was
already on `darkMode: ["class"]`, and the whole theme contract is one class plus a
localStorage key. For locale the decisive constraint was that the home page, market pages and
the docs shell are **server components** — `localStorage` is invisible to them, so a
localStorage-only locale would translate the nav and leave the market list in English. The
locale therefore lives in a **cookie** (mirrored to localStorage as a backup), read server-side
via `cookies()` and passed into `LocaleProvider` so the first paint already matches — no
hydration mismatch and no English-before-Korean flash. Switching calls `router.refresh()`
because server components cannot re-read a cookie on their own.

**Change:** added `.dark` variable block + `color-scheme` to `globals.css` (Yes/No hues
lightened — emerald at 39% and magenta at 49% read muddy on a near-black card);
`ThemeProvider` with an inline pre-paint `THEME_INIT_SCRIPT` in `layout.tsx` to kill the light
flash; `lib/i18n.ts` (flat dictionary, `{var}` interpolation, English fallback) +
`lib/i18n-server.ts` (kept separate so `next/headers` never leaks into a client component);
`LocaleProvider`, `ThemeToggle`, `LocaleToggle`; translated the nav, welcome overlay, footer
and home page.

**Result:** `tsc --noEmit` clean. Both toggles live in the nav; theme persists across reloads
with no flash, and locale now switches server-rendered content too. Long-form doc bodies are
handled separately (next entry) — they carry their own per-locale text.

---

### Docs section: Guide → Docs, plus a technical-background whitepaper

**Cause:** jay asked to rename the top-menu **Guide** to **Docs** and add whitepaper-style
technical background (Hybrid AMM + CLOB, UMA), with a **right-hand panel listing the titles**
so a reader can pick a sub-document.

**Reasoning:** Docs are stored as **data blocks, not JSX**. Every document exists in English
and Korean; duplicating JSX trees would duplicate the markup as well as the prose, so a small
block model (`p` / `ul` / `ol` / `code` / `note` / `table` / `img`) keeps only the *text*
duplicated and leaves one renderer deciding how a paragraph looks. Inline markup is a
deliberately tiny regex for `**bold**` / `` `code` `` / `*em*` rather than a markdown
dependency — the text only ever comes from this repo, so a parser would add a dependency and a
sanitisation surface for no gain. Dropped `generateStaticParams` from the `[slug]` route: the
locale is a cookie, so the page is request-rendered and prerendered slugs would be discarded.

**Change:** new `/docs` index (cards grouped Guide / Technical background) and `/docs/[slug]`
reader, both with a sticky `DocsSidebar` on the right listing every document plus the current
document's section anchors. Five documents authored bilingually: `how-to` (ported from the old
page), `overview` (the three problems — price discovery, custody, truth), `hybrid-amm-clob`
(cold-start, quote-driven vs order-driven vs hybrid, why CPMM quotes above $1.00 at the tails,
LMSR's three properties, `b · ln 2` bounded loss), `resolution-uma` (optimistic flow, bonds and
the WETH whitelist constraint, malicious-voter risk classes), `settlement` (CTF split/merge,
conditionId derivation, the settlement queue's idempotency). Old `/how-to` became a
`permanentRedirect` so existing links do not 404.

**Result:** `next build` clean; all six routes verified 200 at runtime, `/docs/nope` → 404,
`/how-to` → 308 to `/docs/how-to`. Cookie-driven locale confirmed server-side: the same URL
renders "Liquidity: Hybrid AMM + CLOB" in English and "유동성: Hybrid AMM + CLOB" with
`<html lang="ko">` under `verex-locale=ko`.

---

### LMSR pricing module — wave 1 Phase A, math landed and verified (not yet wired)

**Cause:** jay said to go ahead with [current-plan.md](../tasks/current-plan.md). Re-checked the
§0 gates first: **G5 still fails** — the operator holds **0.0496 ETH**, unchanged from
2026-08-03, so wave 2's three contract deploys cannot start. G3 (WIF) is also still jay's. That
leaves **wave 1 (LMSR Phase A)** as the only unblocked piece, since it is off-chain and needs
no gas.

**Reasoning:** Two design points worth recording. First, seeding — raw LMSR with `q = 0` quotes
a uniform `1/n`, but markets open at a chosen probability (0.63, not 0.50). Rather than storing
a synthetic starting inventory, the opening probability is folded into the formula using the
softmax's shift-invariance: `price_i = p_i⁰·e^(q_i/b) / Σⱼ p_j⁰·e^(qⱼ/b)`, which returns exactly
`p⁰` before any trading and reduces to plain LMSR when every `p⁰` is `1/n`. Second, the softmax
is computed in log space shifted by the max logit — `exp()` of a few hundred overflows to
`Infinity` and NaNs the whole price vector, and the shift is exact because softmax is
shift-invariant. Clamping to [0.02, 0.98] breaks sum-to-1 at the tails, so a residual pass
redistributes the difference across outcomes that still have headroom.

**Change:** new `packages/api/src/lmsr.ts` (pure functions: `lmsrPrices`, `lmsrMaxLoss`) plus
`packages/api/scripts/sim-lmsr.ts`, a property harness in the same spirit as
`sim-amm-slippage.ts`. Nothing calls the module yet — `mm.ts` is untouched, so this commit
carries **zero behavioural risk**.

**Result:** all 8 property groups pass. The decisive one: over a 100k one-sided run the maximum
Yes quote is **0.98** — the CPMM failure mode that ruled out constant product (quoting above
$1.00 at the tails) is structurally impossible here. Also confirmed: no-trade returns `p⁰`
exactly, sums stay at 1.000000 for binary and for n = 3/5/12 groups, price is monotone in
quantity sold, larger `b` flattens the curve, `±1e6` inputs stay finite, and binary max loss is
exactly `b·ln2` (173.29 USDC at b = 250).

**Still open — needs jay before wiring into `mm.ts`:** the wiring requires a Prisma migration
(`Market.openingCenter` + `Market.lmsrB`, backfilled from `quoteCenter`) and changes how group
prices move — sibling candidates would be repriced by n-way softmax instead of today's
proportional rescaling in `requoteAfterFill`. That is a visible behaviour change on a live
staging book, so it is left for a focused pass rather than tacked onto this one.

---

### WIF setup script — gate G2 prepared (authoring only, not run)

**Cause:** jay asked for a script rather than a command list for the Workload Identity
Federation setup. Checked the project first: **no WIF pool, no deployer service account, and no
`.github/workflows/` directory at all** in `verex-499205` — G2 is genuinely greenfield.

**Reasoning:** WIF exists so no service-account JSON key is ever created or stored in repo
secrets — a leaked key is permanent, a leaked OIDC token expires in minutes. The security hinge
is the **attribute condition** (`assertion.repository == 'linked0/verex'`): without it *any*
GitHub repository could present a valid GitHub OIDC token and impersonate the service account,
which is exactly the misconfiguration that makes WIF setups dangerous rather than safe. Roles
are deliberately narrow — no owner/editor anywhere. Written idempotent so a partial run can
simply be re-run.

**Change:** `scripts/setup-wif.sh`, sourcing `scripts/deploy.env` so project/region cannot drift
from `deploy.sh`. Supports `DRY_RUN=1`. Prints the two values to add as GitHub Actions
*variables* (identifiers, not secrets) at the end.

**Result:** `bash -n` clean; `DRY_RUN=1` resolves the real project number (496608424746) and
prints the full plan. **Not executed** — running it is jay's call, per gate ownership.

---

### LMSR wired into the market maker — G3 closed, wave 1 Phase A complete

**Cause:** jay closed G3 with "full LMSR, group included", which is the decision the previous
entry was waiting on.

**Reasoning:** The important choice was **how to obtain `q`** (net quantity the operator has
sold). A running counter column would have been cheaper to read but drifts the moment anything
goes wrong — a crashed re-quote, a manual DB fix, a replayed settlement job. Instead `q` is
*derived* from settled book fills, so it is reconstructible and cannot silently diverge. Only
fills whose **maker was the operator** (`Order.makerIndex = 0`) count: a trade between two demo
wallets moves no operator inventory and must not move the operator's quote. `REDEEM` rows are
excluded explicitly — they are redemptions, not trades, and would otherwise be signed as sells.

The migration backfill needed care. `openingCenter` is LMSR's `p⁰` and must be the market's
*original* opening probability, **not** its current `quoteCenter`: since `q` sums the entire
trade history, seeding `p⁰` from an already-traded centre would count the same trading twice and
skew every live market. The backfill therefore reads each market's **earliest `PricePoint`**,
falling back to `quoteCenter` for markets that never charted one.

Group repricing changed shape rather than gaining a step: sibling centres now come from **one
n-way softmax**, so they sum to 1 *by construction* instead of being proportionally rescaled
afterwards. `requoteAfterFill`'s `lastPrice` argument is now deliberately unused — under LMSR
the centre tracks the operator's exposure, not the last print.

**Change:** `Market.openingCenter` + `Market.lmsrB` (migration `20260804043305_lmsr_quote_params`
with the PricePoint backfill); `mm.ts` gained `operatorNetSold()`, `binaryCenter()`,
`groupCenters()` and lost the proportional-rescale block; new read-only
`scripts/check-lmsr-centers.ts`.

**Result:** migration applied to the local DB; backfill verified distinct from `quoteCenter`
(e.g. `eth-above-10k-2026` → stored 0.440, opening 0.2226). `tsc --noEmit` clean. All three
group previews total exactly **1.000**. End-to-end behaviour proven with synthetic trades inside
a rolled-back transaction on `eth-above-10k-2026` (p⁰ = 0.2226):

| step | q(yes) | centre |
|---|---|---|
| baseline | 0 | 0.2226 (= p⁰) |
| user BUY 400 | 400 | 0.5865 (rises) |
| user SELL 150 | 250 | 0.4377 (falls back) |
| **user-to-user BUY 900** | **250** | **0.4377 (unchanged)** |

The last row is the new behaviour worth remembering: a fill that never touched the operator's
ladder leaves the quote alone, where the old last-price rule would have moved it.

**Caveat:** the local DB has **0 trades**, so the group previews above are all at `q = 0` — they
prove the softmax and the sum, not the inventory path. The inventory path is proven only by the
synthetic-trade table. Staging has real fills and should be re-checked with
`check-lmsr-centers.ts` after deploy; expect a **one-time price jump** on already-traded markets
as centres re-derive from inventory instead of last print.

---

### G1 closed — Phase B dropped, and G5 stopped being a blocker

**Cause:** jay decided "Phase A is enough" after asking what Phase B is actually for.

**Reasoning:** The framing that settled it — every benefit an on-chain pool provides (surviving
operator downtime, censorship resistance, letting anyone verify the quote) is a benefit of *not
having to trust the operator*. On Sepolia with test USDC there is no adversary to resist and
nobody who can lose money, so those guarantees buy nothing yet. Phase B is not wrong, it solves
a problem this deployment does not have.

**Change:** `current-plan.md` §0 rewritten — G1 closed as NO, G5 re-evaluated. Public docs
corrected so they do not claim something untrue: `liquidity.ts` now says Phase B is deferred and
why, and three claims it invalidated were fixed — the lead no longer says Verex "is moving" to
LMSR (it has), the ladder no longer "requotes around the last traded price" (it reprices from
inventory), and Verex is described as sitting *between* a pure CLOB and a full hybrid rather
than being the full hybrid already.

**Result:** the decision **unblocked G5 as a side effect**, which is the practically important
part. The ~0.5 ETH target existed because wave 2 was three deploys plus a fresh seed; without
Phase B it is one deploy plus the seed, so ~0.1 ETH is comfortable. The operator now holds
**0.1788 ETH** (up from 0.0496) — G5 passes and jay can stop faucet-farming. Remaining plan is
~3–4 days, down from 6–9, and **every gate is closed except G2**, which is one command.

---

### G2 closed — WIF applied to verex-499205

**Cause:** jay authorised running `scripts/setup-wif.sh` directly.

**Reasoning / what went wrong first:** the first run failed halfway through step 5 with
`Service account github-deployer@... does not exist` — immediately after step 4 had created it
successfully. **IAM is eventually consistent:** a service account can be created and still be
invisible to the policy API for several seconds. Fixed with a `retry` helper rather than a fixed
`sleep`, since the propagation delay is not a knowable constant: the script now polls
`describe` until the account is visible (12 × 5s) and retries each binding (6 ×). The partial
first run cost nothing because the script is idempotent — the re-run skipped the pool, provider
and account it had already created and resumed at the bindings.

**Change:** `scripts/setup-wif.sh` gained `retry()` and DRY_RUN branches for the two binding
steps. Applied to `verex-499205`.

**Result:** verified independently of the script's own output —

- provider `github-oidc` **ACTIVE**, issuer `https://token.actions.githubusercontent.com`,
  attribute condition `assertion.repository == 'linked0/verex'`
- 7 roles on `github-deployer`: run.admin, iam.serviceAccountUser, artifactregistry.writer,
  cloudbuild.builds.editor, storage.admin, cloudsql.client, secretmanager.secretAccessor —
  **no owner/editor anywhere**
- impersonation restricted to
  `principalSet://…/workloadIdentityPools/github/attribute.repository/linked0/verex`

**Values jay must add as GitHub Actions *variables*** (identifiers, not secrets):

```
WIF_PROVIDER        = projects/496608424746/locations/global/workloadIdentityPools/github/providers/github-oidc
WIF_SERVICE_ACCOUNT = github-deployer@verex-499205.iam.gserviceaccount.com
```

**Next:** the CD workflow itself is still unwritten — the pool exists but nothing uses it yet.

---

### GitHub repo variables registered — WIF wiring complete end to end

**Cause:** jay authorised setting the two GitHub values via `gh` rather than pasting the long
provider path by hand.

**Reasoning:** Registered as **repository** variables, not environment variables. GitHub's
"Environment" is a specific feature (deployment targets with protection rules, required
reviewers, branch restrictions), and none are defined for this repo — the empty
"Environment variables" box jay saw belongs to a feature that does not exist yet. The WIF values
are identical for every deploy because there is one GCP project, so repository scope is correct.
They are *variables*, not *secrets*: both are public identifiers, and neither grants access
without a GitHub OIDC token whose `repository` claim matches.

**Change:** `WIF_PROVIDER` and `WIF_SERVICE_ACCOUNT` set on `linked0/verex`.

**Result:** cross-checked against the live GCP resources rather than trusting the paste — both
values compared **byte-for-byte equal** to `gcloud ... providers describe --format=value(name)`
and `service-accounts describe --format=value(email)`. A typo here would not fail now; it would
fail much later as an opaque auth error inside a workflow run.

**Next:** the CD workflow is still unwritten. Every piece of the auth chain now exists — pool,
provider, service account, roles, impersonation binding, repo variables — and nothing consumes
it yet.
