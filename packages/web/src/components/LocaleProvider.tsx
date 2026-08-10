"use client";

// Client half of i18n. The initial locale is handed down from the server layout
// (which read the cookie), so server and client render the same text on the
// first pass — no hydration mismatch, no English flash before Korean.
//
// Changing the locale writes the cookie and then calls router.refresh(): server
// components can't re-read a cookie on their own, so without the refresh the
// nav would switch language while the market list stayed behind.
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_STORAGE_KEY,
  intlLocale,
  isLocale,
  translator,
  type Locale,
  type Translate,
} from "@/lib/i18n";

type LocaleCtx = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: Translate;
  /** BCP-47 tag for Intl / toLocaleDateString. */
  intl: string;
};

const Ctx = React.createContext<LocaleCtx | null>(null);

// One year, site-wide, and readable by the server on every request.
function writeCookie(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
}

export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [locale, setLocaleState] = React.useState<Locale>(initialLocale);

  // If the cookie was lost (cleared, or a fresh browser that still has the old
  // localStorage value), restore the preference and tell the server about it.
  React.useEffect(() => {
    if (initialLocale !== DEFAULT_LOCALE) return;
    try {
      const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
      if (isLocale(saved) && saved !== DEFAULT_LOCALE) {
        writeCookie(saved);
        setLocaleState(saved);
        router.refresh();
      }
    } catch {
      // Storage disabled — the cookie alone is fine.
    }
  }, [initialLocale, router]);

  const setLocale = React.useCallback(
    (l: Locale) => {
      setLocaleState(l);
      writeCookie(l);
      try {
        localStorage.setItem(LOCALE_STORAGE_KEY, l);
      } catch {
        // Non-fatal: the cookie is the source of truth.
      }
      document.documentElement.lang = l;
      router.refresh();
    },
    [router],
  );

  const value = React.useMemo<LocaleCtx>(
    () => ({ locale, setLocale, t: translator(locale), intl: intlLocale(locale) }),
    [locale, setLocale],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLocale(): LocaleCtx {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useLocale must be used inside <LocaleProvider>");
  return ctx;
}
