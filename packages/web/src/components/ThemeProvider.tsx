"use client";

// Light/dark theme, hand-rolled rather than pulling in next-themes: the whole
// contract is one class on <html> plus a localStorage key, and tailwind is
// already configured with darkMode: ["class"].
//
// The pre-paint half of this lives in layout.tsx as THEME_INIT_SCRIPT — it runs
// before React hydrates so the page never flashes light before switching. This
// provider only owns *changes* made after mount.
import * as React from "react";

export type Theme = "light" | "dark";

export const THEME_KEY = "verex-theme";

type ThemeCtx = { theme: Theme; setTheme: (t: Theme) => void; toggle: () => void };

const Ctx = React.createContext<ThemeCtx | null>(null);

/** Inline script for <head>: applies the stored (or system) theme pre-paint. */
export const THEME_INIT_SCRIPT = `(function(){try{
var s=localStorage.getItem(${JSON.stringify(THEME_KEY)});
var d=s==="dark"||(!s&&window.matchMedia("(prefers-color-scheme: dark)").matches);
document.documentElement.classList.toggle("dark",d);
}catch(e){}})();`;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Server and first client render must agree, so start at the SSR default and
  // adopt the real value in the effect below. The <html> class is already
  // correct by then (init script), so nothing visibly changes — only the toggle
  // icon settles.
  const [theme, setThemeState] = React.useState<Theme>("light");

  React.useEffect(() => {
    setThemeState(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  const setTheme = React.useCallback((t: Theme) => {
    setThemeState(t);
    document.documentElement.classList.toggle("dark", t === "dark");
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch {
      // Private-mode / storage-disabled: the theme still applies for this page.
    }
  }, []);

  const value = React.useMemo<ThemeCtx>(
    () => ({ theme, setTheme, toggle: () => setTheme(theme === "dark" ? "light" : "dark") }),
    [theme, setTheme],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
