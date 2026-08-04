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
