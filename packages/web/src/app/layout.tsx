import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { SiteNav } from "@/components/SiteNav";
import { WalletProvider } from "@/components/WalletProvider";

export const metadata: Metadata = {
  title: "Verex — Prediction Market",
  description: "Trade on real-world questions, settled on-chain.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WalletProvider>
          <Suspense>
            <SiteNav />
          </Suspense>
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
              powered by JayLabs
            </a>
          </footer>
        </WalletProvider>
      </body>
    </html>
  );
}
