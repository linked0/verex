"use client";

// Add-funds screen (onboarding screen A) + the mini ledger (screen B's
// drill-down). Pay-with-card redirects to Stripe Checkout in TEST mode; the
// balance is credited by the API's webhook, never by this page — the
// ?funded=success return only refreshes what the webhook already wrote.
// USDCX is an internal test-ledger credit, not redeemable crypto, and the
// page says so in so many words (the design doc's custody caveat).

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDownToLine, CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocale } from "@/components/LocaleProvider";
import { useWallet } from "@/components/WalletProvider";
import {
  getFundingBalance,
  getFundingLedger,
  postFundingCheckout,
  type FundingBalance,
  type LedgerRow,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const PRESETS = [10, 20, 50];

const KIND_KEY = {
  DEPOSIT: "funding.kindDeposit",
  TRADE: "funding.kindTrade",
  REDEEM: "funding.kindRedeem",
} as const;

export default function FundingClient() {
  const { accountIndex, isAdmin } = useWallet();
  const { t, intl } = useLocale();
  const router = useRouter();
  const params = useSearchParams();

  const [amount, setAmount] = React.useState<number>(20);
  const [custom, setCustom] = React.useState("");
  const [paying, setPaying] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [balance, setBalance] = React.useState<FundingBalance | null>(null);
  const [ledger, setLedger] = React.useState<LedgerRow[] | null>(null);

  // Checkout return state, captured once then cleared from the URL so a
  // reload doesn't re-announce it.
  const [returned, setReturned] = React.useState<"success" | "cancel" | null>(null);
  React.useEffect(() => {
    const funded = params.get("funded");
    if (funded === "success" || funded === "cancel") {
      setReturned(funded);
      router.replace("/funding");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read the param once on mount
  }, []);

  const load = React.useCallback(async () => {
    if (isAdmin) return;
    const [b, l] = await Promise.all([
      getFundingBalance(accountIndex),
      getFundingLedger(accountIndex),
    ]);
    setBalance(b);
    setLedger(l);
  }, [accountIndex, isAdmin]);

  React.useEffect(() => {
    setBalance(null);
    setLedger(null);
    void load();
  }, [load]);

  // After a successful return the webhook may land a beat after the redirect
  // — poll briefly instead of showing a stale zero.
  React.useEffect(() => {
    if (returned !== "success") return;
    const timer = setInterval(() => void load(), 2_000);
    const stop = setTimeout(() => clearInterval(timer), 20_000);
    return () => {
      clearInterval(timer);
      clearTimeout(stop);
    };
  }, [returned, load]);

  const effectiveAmount = custom !== "" ? Number(custom) : amount;
  const validAmount = Number.isFinite(effectiveAmount) && effectiveAmount >= 1 && effectiveAmount <= 1000;

  const pay = async () => {
    if (!validAmount || paying) return;
    setPaying(true);
    setError(null);
    try {
      const { url } = await postFundingCheckout({ accountIndex, amount: effectiveAmount });
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "checkout failed");
      setPaying(false);
    }
  };

  const money = (v: number) =>
    `$${v.toLocaleString(intl, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (isAdmin) {
    return (
      <main className="container max-w-2xl space-y-6 py-6">
        <h1 className="text-2xl font-bold">{t("funding.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("funding.operatorNote")}</p>
      </main>
    );
  }

  return (
    <main className="container max-w-2xl space-y-6 py-6">
      <div>
        <h1 className="text-2xl font-bold">{t("funding.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("funding.subtitle")}</p>
      </div>

      {returned === "success" && (
        <div className="rounded-md border border-yes/40 bg-yes/10 px-3 py-2 text-sm text-yes">
          {t("funding.success")}
        </div>
      )}
      {returned === "cancel" && (
        <div className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
          {t("funding.cancelled")}
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("funding.balanceTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {balance === null ? (
            <Skeleton className="h-8 w-32" />
          ) : (
            <div className="text-3xl font-bold tabular-nums">
              {money(balance.amount)}{" "}
              <span className="text-base font-medium text-muted-foreground">USDCX</span>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {t("funding.balanceFor", { wallet: `#${accountIndex}` })}
            {balance !== null && !balance.funded && ` — ${t("funding.notFunded")}`}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("funding.addFunds")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("funding.amountLabel")}</label>
            <div className="flex flex-wrap items-center gap-2">
              {PRESETS.map((p) => (
                <Button
                  key={p}
                  type="button"
                  variant={custom === "" && amount === p ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setAmount(p);
                    setCustom("");
                  }}
                >
                  ${p}
                </Button>
              ))}
              <Input
                type="number"
                min={1}
                max={1000}
                step={1}
                placeholder="$"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                className="w-24"
              />
            </div>
          </div>

          {/* One line of honesty — the custody caveat, verbatim intent. */}
          <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            {t("funding.custody")}
          </p>

          <Button
            type="button"
            className="w-full"
            disabled={!validAmount || paying}
            onClick={() => void pay()}
          >
            {paying ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("funding.paying")}
              </>
            ) : (
              <>
                <CreditCard className="mr-2 h-4 w-4" />
                {t("funding.pay")}
                {validAmount ? ` — $${effectiveAmount}` : ""}
              </>
            )}
          </Button>
          {error && <p className="text-sm text-no">{error}</p>}
          <p className="text-xs text-muted-foreground">{t("funding.testCardHint")}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-1.5 text-base">
            <ArrowDownToLine className="h-4 w-4" />
            {t("funding.ledgerTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ledger === null ? (
            <Skeleton className="h-16 w-full" />
          ) : ledger.length === 0 ? (
            <p className="py-2 text-center text-sm text-muted-foreground">
              {t("funding.ledgerEmpty")}
            </p>
          ) : (
            <div className="space-y-1">
              {ledger.map((row, i) => (
                <React.Fragment key={row.id}>
                  {i > 0 && <Separator />}
                  <div className="flex items-center justify-between gap-2 py-1 text-sm">
                    <span className="w-16 shrink-0 font-medium">{t(KIND_KEY[row.kind])}</span>
                    <span
                      className={cn(
                        "tabular-nums",
                        row.delta >= 0 ? "text-yes" : "text-no",
                      )}
                    >
                      {row.delta >= 0 ? "+" : "−"}
                      {money(Math.abs(row.delta))}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-right font-mono text-xs text-muted-foreground">
                      {row.ref ?? ""}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {new Date(row.createdAt).toLocaleString(intl, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </React.Fragment>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
