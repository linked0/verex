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
          <footer className="container border-t py-6 text-center text-xs text-muted-foreground">
            Verex · markets settle on-chain (local anvil · CTF Exchange backbone)
          </footer>
        </WalletProvider>
      </body>
    </html>
  );
}
