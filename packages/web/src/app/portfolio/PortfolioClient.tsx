"use client";

// Portfolio: the active demo wallet's USDC balance and on-chain positions
// with cost basis / P&L, plus one-click redemption for resolved markets.
// All numbers come from /wallet/:index (chain reads + Trade-table cost basis).

import * as React from "react";
import Link from "next/link";
import { BriefcaseBusiness, Check, Copy, Wallet, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useLocale } from "@/components/LocaleProvider";
import { useWallet } from "@/components/WalletProvider";
import { SettlementChip } from "@/components/SettlementChip";
import {
  getPendingRedeems,
  postRedeem,
  getWalletHistory,
  cents,
  type Position,
  type HistoryRow,
} from "@/lib/api";
import { cn } from "@/lib/utils";

// Grouping/decimal separators follow the active locale, so Korean and English
// render the same amount with their own conventions.
const fmtMoney = (v: number, intl: string) =>
  `$${v.toLocaleString(intl, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// The API's `side` enum is a wire value, not a label — map it to a message key
// so Korean can say 매수/매도 instead of leaking BUY/SELL into the UI.
const SIDE_KEY = {
  BUY: "portfolio.sideBuy",
  SELL: "portfolio.sideSell",
  REDEEM: "portfolio.sideRedeem",
} as const;

export default function PortfolioClient() {
  const { accountIndex, summary, refresh, isAdmin } = useWallet();
  const { t, intl } = useLocale();
  const money = React.useCallback((v: number) => fmtMoney(v, intl), [intl]);
  const signedMoney = React.useCallback(
    (v: number) => `${v >= 0 ? "+" : "−"}${fmtMoney(Math.abs(v), intl)}`,
    [intl],
  );
  const [redeeming, setRedeeming] = React.useState<string | null>(null);
  /// slug → jobId of in-flight redemptions. Seeded from the server on every
  /// visit (a redeem takes real time on Sepolia — leaving the page must not
  /// lose its status), extended locally when a new redeem starts.
  const [redeemJobs, setRedeemJobs] = React.useState<Record<string, string>>({});
  /// Held as structured data, not a rendered sentence: the "redeeming →
  /// redeemed" transition used to be a string .replace(), which only works in
  /// English. The message is composed from `t()` at render time instead.
  const [toast, setToast] = React.useState<{ slug: string; usdc: number; done: boolean } | null>(
    null,
  );
  const [error, setError] = React.useState<string | null>(null);
  const [history, setHistory] = React.useState<HistoryRow[]>([]);
  const [pnlDetails, setPnlDetails] = React.useState<HistoryRow | null>(null);
  const [copied, setCopied] = React.useState(false);

  const copyAddress = async () => {
    if (!summary?.address) return;
    await navigator.clipboard.writeText(summary.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1_500);
  };

  const loadHistory = React.useCallback(async () => {
    setHistory(isAdmin ? [] : await getWalletHistory(accountIndex));
  }, [accountIndex, isAdmin]);

  React.useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  // Restore in-flight redemption chips on mount / wallet switch.
  React.useEffect(() => {
    if (isAdmin) {
      setRedeemJobs({});
      return;
    }
    let alive = true;
    void getPendingRedeems(accountIndex).then((rows) => {
      if (alive) setRedeemJobs(Object.fromEntries(rows.map((r) => [r.slug, r.jobId])));
    });
    return () => {
      alive = false;
    };
  }, [accountIndex, isAdmin]);

  React.useEffect(() => {
    if (!pnlDetails) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPnlDetails(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pnlDetails]);

  const onRedeem = async (p: Position) => {
    setRedeeming(p.slug);
    setError(null);
    setToast(null);
    try {
      const r = await postRedeem({ slug: p.slug, accountIndex });
      setToast({ slug: p.slug, usdc: r.expectedUsdc, done: false });
      setRedeemJobs((m) => ({ ...m, [p.slug]: r.jobId })); // row chip polls; balances refresh on settle
    } catch (e: any) {
      setError(e?.message ?? t("portfolio.redeemError"));
    } finally {
      setRedeeming(null);
    }
  };

  const onRedeemSettled = React.useCallback(
    (slug: string) => async (status: "CONFIRMED" | "FAILED") => {
      if (status === "CONFIRMED") {
        setToast((prev) => (prev && prev.slug === slug ? { ...prev, done: true } : prev));
      } else {
        setError(t("portfolio.redeemFailedOnChain", { slug }));
      }
      setRedeemJobs((m) => {
        const { [slug]: _, ...rest } = m;
        return rest;
      });
      await refresh();
      await loadHistory();
    },
    [refresh, loadHistory, t],
  );

  if (isAdmin) {
    return (
      <main className="container max-w-3xl space-y-4 py-8">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <BriefcaseBusiness className="h-6 w-6" /> {t("portfolio.title")}
          </h1>
          {summary?.address && (
            <button
              type="button"
              onClick={copyAddress}
              title={t("portfolio.copyOperatorAddress")}
              className="mt-1.5 inline-flex items-center gap-1.5 break-all text-left font-mono text-xs text-muted-foreground hover:text-foreground"
            >
              {t("portfolio.operator")} · {summary.address}
              {copied ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-yes" />
              ) : (
                <Copy className="h-3.5 w-3.5 shrink-0" />
              )}
            </button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {t("portfolio.operatorNote", {
            treasury: summary
              ? t("portfolio.operatorTreasury", { amount: money(summary.usdc) })
              : "",
          })}
        </p>
      </main>
    );
  }

  const positions = summary?.positions ?? [];
  const totalValue = positions.reduce((s, p) => s + p.value, 0);
  const totalPnl = positions.reduce((s, p) => s + p.pnl, 0);
  const realizedPnl = history.reduce((s, h) => s + (h.realizedPnl ?? 0), 0);

  return (
    <main className="container max-w-4xl space-y-6 py-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <BriefcaseBusiness className="h-6 w-6" /> {t("portfolio.title")}
        </h1>
        {summary?.address && (
          <button
            type="button"
            onClick={copyAddress}
            title={t("portfolio.copyAddress")}
            className="mt-1.5 inline-flex items-center gap-1.5 break-all text-left font-mono text-xs text-muted-foreground hover:text-foreground"
          >
            {summary.address}
            {copied ? (
              <Check className="h-3.5 w-3.5 shrink-0 text-yes" />
            ) : (
              <Copy className="h-3.5 w-3.5 shrink-0" />
            )}
          </button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              <Wallet className="h-4 w-4" /> {t("portfolio.walletBalance", { n: accountIndex })}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold tabular-nums">
            {summary ? money(summary.usdc) : "…"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("portfolio.positionsValue")}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold tabular-nums">{money(totalValue)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("portfolio.openPnl")}
            </CardTitle>
          </CardHeader>
          <CardContent
            className={cn(
              "text-2xl font-bold tabular-nums",
              totalPnl >= 0 ? "text-yes" : "text-no",
            )}
          >
            {signedMoney(totalPnl)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("portfolio.realizedPnl")}
            </CardTitle>
          </CardHeader>
          <CardContent
            className={cn(
              "text-2xl font-bold tabular-nums",
              realizedPnl >= 0 ? "text-yes" : "text-no",
            )}
          >
            {signedMoney(realizedPnl)}
          </CardContent>
        </Card>
      </div>

      {toast && (
        <p className="rounded-md bg-yes/10 px-3 py-2 text-sm text-yes">
          {t(toast.done ? "portfolio.toastRedeemed" : "portfolio.toastRedeeming", {
            slug: toast.slug,
            amount: money(toast.usdc),
          })}
        </p>
      )}
      {error && <p className="rounded-md bg-no/10 px-3 py-2 text-sm text-no">{error}</p>}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("portfolio.positions")}</CardTitle>
        </CardHeader>
        <CardContent>
          {positions.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("portfolio.noPositionsPre")}
              <Link href="/" className="underline hover:text-foreground">
                {t("portfolio.noPositionsLink")}
              </Link>
              {t("portfolio.noPositionsPost")}
            </p>
          ) : (
            <div className="space-y-2">
              {positions.map((p) => (
                <div
                  key={`${p.slug}-${p.outcome}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/market/${p.slug}`}
                      className="block truncate text-sm font-medium hover:underline"
                    >
                      {p.title}
                    </Link>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className={p.outcome === "Yes" ? "font-semibold text-yes" : "font-semibold text-no"}>
                        {p.outcome}
                      </span>
                      <span>
                        {t("portfolio.tokensAt", {
                          n: p.tokens.toFixed(1),
                          price: cents(p.price),
                        })}
                      </span>
                      {p.marketStatus === "RESOLVED" && (
                        <Badge
                          variant="outline"
                          className={p.won ? "border-yes text-yes" : "border-no text-no"}
                        >
                          {t(p.won ? "portfolio.won" : "portfolio.lost")}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="text-right tabular-nums">
                    <div className="text-sm font-semibold">{money(p.value)}</div>
                    <div className="text-xs text-muted-foreground">
                      {t("portfolio.cost", { amount: money(p.costBasis) })}
                    </div>
                  </div>
                  <div
                    className={cn(
                      "w-20 text-right text-sm font-semibold tabular-nums",
                      p.pnl >= 0 ? "text-yes" : "text-no",
                    )}
                  >
                    {signedMoney(p.pnl)}
                  </div>
                  {p.marketStatus === "RESOLVED" &&
                    (redeemJobs[p.slug] ? (
                      <SettlementChip
                        jobId={redeemJobs[p.slug]!}
                        onSettled={onRedeemSettled(p.slug)}
                      />
                    ) : (
                      <Button
                        size="sm"
                        disabled={redeeming === p.slug}
                        onClick={() => onRedeem(p)}
                      >
                        {t(redeeming === p.slug ? "portfolio.redeeming" : "portfolio.redeem")}
                      </Button>
                    ))}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("portfolio.activity")}</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("portfolio.noActivity")}
            </p>
          ) : (
            <div className="space-y-2">
              {history.map((h) => (
                <div
                  key={h.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b pb-2 text-sm last:border-b-0 last:pb-0"
                >
                  {h.side === "REDEEM" && h.realizedPnl !== undefined ? (
                    <button
                      type="button"
                      onClick={() => setPnlDetails(h)}
                      className="w-16 shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-center text-xs font-semibold text-primary underline-offset-2 hover:underline"
                    >
                      {t(SIDE_KEY[h.side])}
                    </button>
                  ) : (
                    <span
                      className={cn(
                        "w-16 shrink-0 rounded px-1.5 py-0.5 text-center text-xs font-semibold",
                        h.side === "BUY" && "bg-yes/10 text-yes",
                        h.side === "SELL" && "bg-no/10 text-no",
                      )}
                    >
                      {t(SIDE_KEY[h.side])}
                    </span>
                  )}
                  <Link
                    href={`/market/${h.marketSlug}`}
                    className="min-w-0 flex-1 truncate font-medium hover:underline"
                  >
                    {h.marketTitle}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {t("portfolio.historyAmount", {
                      n: h.tokenAmount.toFixed(1),
                      outcome: h.outcome,
                      price: cents(h.price),
                    })}
                  </span>
                  {h.settlement === "PENDING" && (
                    <Badge variant="outline" className="border-primary/40 text-primary">
                      {t("portfolio.settling")}
                    </Badge>
                  )}
                  {h.settlement === "FAILED" && (
                    <Badge variant="outline" className="border-no text-no">
                      {t("portfolio.reverted")}
                    </Badge>
                  )}
                  <span className="w-20 text-right tabular-nums">
                    {h.side === "BUY" ? `−${money(h.usdcAmount)}` : `+${money(h.usdcAmount)}`}
                  </span>
                  {h.side === "REDEEM" && h.realizedPnl !== undefined && (
                    <span
                      className={cn(
                        "w-24 text-right text-xs font-semibold tabular-nums",
                        h.realizedPnl >= 0 ? "text-yes" : "text-no",
                      )}
                    >
                      {t(h.realizedPnl >= 0 ? "portfolio.realizedWon" : "portfolio.realizedLost", {
                        amount: signedMoney(h.realizedPnl),
                      })}
                    </span>
                  )}
                  <span className="w-28 text-right text-xs text-muted-foreground">
                    {new Date(h.createdAt).toLocaleString(intl, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {pnlDetails && pnlDetails.realizedPnl !== undefined && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setPnlDetails(null)}
        >
          <Card
            className="w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
              <div className="min-w-0">
                <CardTitle className="text-base">{t("portfolio.redemptionPnl")}</CardTitle>
                <p className="truncate text-xs text-muted-foreground">{pnlDetails.marketTitle}</p>
              </div>
              <button
                type="button"
                aria-label={t("portfolio.close")}
                onClick={() => setPnlDetails(null)}
                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("portfolio.outcome")}</span>
                <span className="font-medium">
                  {t("portfolio.historyAmount", {
                    n: pnlDetails.tokenAmount.toFixed(1),
                    outcome: pnlDetails.outcome,
                    price: cents(pnlDetails.price),
                  })}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("portfolio.costBasis")}</span>
                <span className="tabular-nums">
                  {money(pnlDetails.usdcAmount - pnlDetails.realizedPnl)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("portfolio.redeemedFor")}</span>
                <span className="tabular-nums">{money(pnlDetails.usdcAmount)}</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between font-semibold">
                <span>{t("portfolio.realizedPnl")}</span>
                <span
                  className={cn(
                    "tabular-nums",
                    pnlDetails.realizedPnl >= 0 ? "text-yes" : "text-no",
                  )}
                >
                  {signedMoney(pnlDetails.realizedPnl)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("portfolio.pnlFormula", {
                  redeemed: money(pnlDetails.usdcAmount),
                  cost: money(pnlDetails.usdcAmount - pnlDetails.realizedPnl),
                  pnl: signedMoney(pnlDetails.realizedPnl),
                })}
              </p>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("portfolio.walletBalanceNow")}</span>
                <span className="font-semibold tabular-nums">
                  {summary ? money(summary.usdc) : "…"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {new Date(pnlDetails.createdAt).toLocaleString(intl, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  );
}
