"use client";

// Header USDCX chip (onboarding screen B): the Stripe-funded internal
// balance, next to the on-chain USDC one. USDCX is a test-ledger credit,
// not crypto — the tooltip and the /funding page both say so. Wallets that
// never onboarded show "Add funds" instead of a number.

import * as React from "react";
import Link from "next/link";
import { CreditCard } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";
import { useWallet } from "@/components/WalletProvider";
import { getFundingBalance, type FundingBalance } from "@/lib/api";

const POLL_MS = 15_000;

export function FundingChip() {
  const { accountIndex, isAdmin } = useWallet();
  const { t, intl } = useLocale();
  const [balance, setBalance] = React.useState<FundingBalance | null>(null);

  React.useEffect(() => {
    if (isAdmin) return;
    let alive = true;
    const load = async () => {
      const b = await getFundingBalance(accountIndex);
      if (alive) setBalance(b);
    };
    setBalance(null); // never show the previous wallet's number
    void load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [accountIndex, isAdmin]);

  if (isAdmin) return null;

  return (
    <Link
      href="/funding"
      title={t("funding.chipTitle")}
      className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border bg-card px-2.5 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
    >
      <CreditCard className="h-4 w-4 shrink-0 text-primary" />
      {balance?.funded ? (
        <span className="tabular-nums">
          ${balance.amount.toLocaleString(intl, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          <span className="ml-1 hidden text-xs text-muted-foreground lg:inline">USDCX</span>
        </span>
      ) : (
        <span className="hidden sm:inline">{t("funding.addFunds")}</span>
      )}
    </Link>
  );
}
