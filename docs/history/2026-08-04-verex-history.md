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
