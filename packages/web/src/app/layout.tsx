import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Verex",
  description: "Decentralized Prediction Market",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
