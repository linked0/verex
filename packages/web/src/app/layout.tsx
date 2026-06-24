import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Verex — Prediction Market",
  description: "Decentralized Prediction Market",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="header">
          <Link href="/" className="logo">
            ◆ Verex
          </Link>
          <span className="tagline">Prediction Market</span>
        </header>
        {children}
        <footer className="footer">Verex · demo data (no smart contracts yet)</footer>
      </body>
    </html>
  );
}
