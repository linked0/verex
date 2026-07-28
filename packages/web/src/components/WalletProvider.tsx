"use client";

// Demo-wallet context: the active anvil account index (0..5; 0 = operator /
// admin), persisted in localStorage. Real wallet connection (wagmi + AA
// session keys) is the S7 track — this keeps the trading loop one-click on
// the local chain.

import * as React from "react";
import { getWallet, type WalletSummary } from "@/lib/api";

type WalletCtx = {
  accountIndex: number;
  setAccountIndex: (i: number) => void;
  summary: WalletSummary | null;
  refresh: () => Promise<void>;
  /// Operator #0 active — shows admin controls (resolve) instead of trading.
  isAdmin: boolean;
};

const Ctx = React.createContext<WalletCtx | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [accountIndex, setAccountIndexState] = React.useState(1);
  const [summary, setSummary] = React.useState<WalletSummary | null>(null);

  const refresh = React.useCallback(async () => {
    // The operator (#0) gets address + balance only from the API — its
    // token holdings are MM inventory, not a portfolio.
    setSummary(await getWallet(accountIndex));
  }, [accountIndex]);

  React.useEffect(() => {
    const saved = Number(localStorage.getItem("verex-account") ?? "1");
    if (saved >= 0 && saved <= 5) setAccountIndexState(saved);
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const setAccountIndex = (i: number) => {
    localStorage.setItem("verex-account", String(i));
    setAccountIndexState(i);
  };

  return (
    <Ctx.Provider
      value={{ accountIndex, setAccountIndex, summary, refresh, isAdmin: accountIndex === 0 }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useWallet(): WalletCtx {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useWallet must be used inside WalletProvider");
  return ctx;
}
