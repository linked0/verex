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
