"use client";

// Portfolio: the active demo wallet's USDC balance and on-chain positions
// with cost basis / P&L, plus one-click redemption for resolved markets.
// All numbers come from /wallet/:index (chain reads + Trade-table cost basis).

import * as React from "react";
import Link from "next/link";
import { BriefcaseBusiness, Wallet, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useWallet } from "@/components/WalletProvider";
import {
  postRedeem,
  getWalletHistory,
  cents,
  type Position,
  type HistoryRow,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const money = (v: number) =>
  `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const signedMoney = (v: number) => `${v >= 0 ? "+" : "−"}${money(Math.abs(v))}`;

export default function PortfolioPage() {
  const { accountIndex, summary, refresh, isAdmin } = useWallet();
  const [redeeming, setRedeeming] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [history, setHistory] = React.useState<HistoryRow[]>([]);
  const [pnlDetails, setPnlDetails] = React.useState<HistoryRow | null>(null);

  const loadHistory = React.useCallback(async () => {
    setHistory(isAdmin ? [] : await getWalletHistory(accountIndex));
  }, [accountIndex, isAdmin]);

  React.useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

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
      setToast(`Redeemed ${p.slug} — received $${r.usdcReceived.toFixed(2)} USDC`);
      await refresh();
      await loadHistory();
    } catch (e: any) {
      setError(e?.message ?? "redeem failed");
    } finally {
      setRedeeming(null);
    }
  };

  if (isAdmin) {
    return (
      <main className="container max-w-3xl space-y-4 py-8">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <BriefcaseBusiness className="h-6 w-6" /> Portfolio
        </h1>
        <p className="text-sm text-muted-foreground">
          The operator (#0) has no portfolio — its holdings are market-making inventory
          across every market. Switch to a demo wallet (#1–5) to see a portfolio, or open
          a market page to resolve it.
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
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <BriefcaseBusiness className="h-6 w-6" /> Portfolio
      </h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              <Wallet className="h-4 w-4" /> Demo #{accountIndex} balance
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold tabular-nums">
            {summary ? money(summary.usdc) : "…"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Positions value
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold tabular-nums">{money(totalValue)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Open P&L</CardTitle>
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
              Realized P&L
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

      {toast && <p className="rounded-md bg-yes/10 px-3 py-2 text-sm text-yes">{toast}</p>}
      {error && <p className="rounded-md bg-no/10 px-3 py-2 text-sm text-no">{error}</p>}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Positions</CardTitle>
        </CardHeader>
        <CardContent>
          {positions.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No positions yet —{" "}
              <Link href="/" className="underline hover:text-foreground">
                find a market
              </Link>{" "}
              and make a trade.
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
                        {p.tokens.toFixed(1)} tokens @ {cents(p.price)}
                      </span>
                      {p.marketStatus === "RESOLVED" && (
                        <Badge
                          variant="outline"
                          className={p.won ? "border-yes text-yes" : "border-no text-no"}
                        >
                          {p.won ? "WON" : "LOST"}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="text-right tabular-nums">
                    <div className="text-sm font-semibold">{money(p.value)}</div>
                    <div className="text-xs text-muted-foreground">cost {money(p.costBasis)}</div>
                  </div>
                  <div
                    className={cn(
                      "w-20 text-right text-sm font-semibold tabular-nums",
                      p.pnl >= 0 ? "text-yes" : "text-no",
                    )}
                  >
                    {signedMoney(p.pnl)}
                  </div>
                  {p.marketStatus === "RESOLVED" && (
                    <Button
                      size="sm"
                      disabled={redeeming === p.slug}
                      onClick={() => onRedeem(p)}
                    >
                      {redeeming === p.slug ? "Redeeming…" : "Redeem"}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No activity yet.</p>
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
                      {h.side}
                    </button>
                  ) : (
                    <span
                      className={cn(
                        "w-16 shrink-0 rounded px-1.5 py-0.5 text-center text-xs font-semibold",
                        h.side === "BUY" && "bg-yes/10 text-yes",
                        h.side === "SELL" && "bg-no/10 text-no",
                      )}
                    >
                      {h.side}
                    </span>
                  )}
                  <Link
                    href={`/market/${h.marketSlug}`}
                    className="min-w-0 flex-1 truncate font-medium hover:underline"
                  >
                    {h.marketTitle}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {h.tokenAmount.toFixed(1)} {h.outcome} @ {cents(h.price)}
                  </span>
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
                      {h.realizedPnl >= 0 ? "won " : "lost "}
                      {signedMoney(h.realizedPnl)}
                    </span>
                  )}
                  <span className="w-28 text-right text-xs text-muted-foreground">
                    {new Date(h.createdAt).toLocaleString("en-US", {
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
                <CardTitle className="text-base">Redemption P&amp;L</CardTitle>
                <p className="truncate text-xs text-muted-foreground">{pnlDetails.marketTitle}</p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setPnlDetails(null)}
                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Outcome</span>
                <span className="font-medium">
                  {pnlDetails.tokenAmount.toFixed(1)} {pnlDetails.outcome} @ {cents(pnlDetails.price)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Cost basis</span>
                <span className="tabular-nums">
                  {money(pnlDetails.usdcAmount - pnlDetails.realizedPnl)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Redeemed for</span>
                <span className="tabular-nums">{money(pnlDetails.usdcAmount)}</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between font-semibold">
                <span>Realized P&amp;L</span>
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
                Redeemed for {money(pnlDetails.usdcAmount)} − cost basis{" "}
                {money(pnlDetails.usdcAmount - pnlDetails.realizedPnl)} ={" "}
                {signedMoney(pnlDetails.realizedPnl)}
              </p>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Wallet balance now</span>
                <span className="font-semibold tabular-nums">
                  {summary ? money(summary.usdc) : "…"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {new Date(pnlDetails.createdAt).toLocaleString("en-US", {
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
