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
  /// True while a fetch is in flight. `summary` is null whenever it would
  /// otherwise belong to a different wallet, so consumers can render a
  /// loading state instead of someone else's balance.
  loading: boolean;
  /// Operator #0 active — shows admin controls (resolve) instead of trading.
  isAdmin: boolean;
};

const Ctx = React.createContext<WalletCtx | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [accountIndex, setAccountIndexState] = React.useState(1);
  // The summary is stored WITH the wallet it describes. Switching wallets used
  // to leave the previous wallet's balance and positions on screen for as long
  // as the fetch took — not merely stale, but attributed to the wrong account.
  const [fetched, setFetched] = React.useState<{
    index: number;
    summary: WalletSummary | null;
  } | null>(null);
  const [loading, setLoading] = React.useState(true);
  // Rising id: a slow response for a wallet you already switched away from
  // must not overwrite a newer one.
  const requestId = React.useRef(0);

  const refresh = React.useCallback(async () => {
    const id = ++requestId.current;
    const forIndex = accountIndex;
    setLoading(true);
    try {
      // The operator (#0) gets address + balance only from the API — its
      // token holdings are MM inventory, not a portfolio.
      const summary = await getWallet(forIndex);
      if (id !== requestId.current) return;
      setFetched({ index: forIndex, summary });
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [accountIndex]);

  // `stale` is "we have no answer for THIS wallet yet" — distinct from "the
  // answer was null", which is a failed fetch and must stop the skeletons
  // rather than spin forever.
  const stale = !fetched || fetched.index !== accountIndex;
  const summary = stale ? null : fetched.summary;

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
      value={{
        accountIndex,
        setAccountIndex,
        summary,
        refresh,
        loading: loading || stale,
        isAdmin: accountIndex === 0,
      }}
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
