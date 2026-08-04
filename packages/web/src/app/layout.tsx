import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { SiteNav } from "@/components/SiteNav";
import { LocaleProvider } from "@/components/LocaleProvider";
import { ThemeProvider, THEME_INIT_SCRIPT } from "@/components/ThemeProvider";
import { WalletProvider } from "@/components/WalletProvider";
import { WelcomeOverlay } from "@/components/WelcomeOverlay";
import { getLocale, getT } from "@/lib/i18n-server";

export const metadata: Metadata = {
  title: "Verex — Prediction Market",
  description: "Trade on real-world questions, settled on-chain.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = getLocale();
  const t = getT();

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* Runs before first paint so a dark-theme visitor never sees a white
            flash. Must stay inline — an external script would load too late. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <ThemeProvider>
          <LocaleProvider initialLocale={locale}>
            <WalletProvider>
              <Suspense>
                <SiteNav />
              </Suspense>
              <WelcomeOverlay />
              {children}
              <footer className="container flex items-center justify-center border-t py-6 text-xs text-muted-foreground">
                <a
                  href="https://www.jaylabs.xyz"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 underline-offset-2 hover:text-foreground hover:underline"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- tiny static badge, not worth next/image */}
                  <img
                    src="/jaylabs.png"
                    alt="JayLabs"
                    width={20}
                    height={20}
                    className="h-5 w-5 rounded-full"
                  />
                  {t("footer.poweredBy")}
                </a>
              </footer>
            </WalletProvider>
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
