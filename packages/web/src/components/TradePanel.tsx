"use client";

// Buy/Sell panel — every submit is a real on-chain fill through the API
// (CTFExchange.fillOrder on anvil). Shows est. tokens/payout before the
// trade and the tx hash after.

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWallet } from "@/components/WalletProvider";
import { cents, postTrade, type Market, type TradeResult } from "@/lib/api";
import { cn } from "@/lib/utils";

export function TradePanel({ market }: { market: Market }) {
  const router = useRouter();
  const { accountIndex, summary, refresh } = useWallet();

  const [side, setSide] = React.useState<"BUY" | "SELL">("BUY");
  const [outcome, setOutcome] = React.useState<"Yes" | "No">("Yes");
  const [amount, setAmount] = React.useState("10");
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<TradeResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  // Snapshot of the submitted trade's estimate, shown immediately on click
  // (before the on-chain confirmation returns) so the wait doesn't feel like
  // dead time. Captured at submit time rather than read live off `amt` so it
  // can't drift if the user edits the input while a request is in flight.
  const [pending, setPending] = React.useState<{
    side: "BUY" | "SELL";
    outcome: "Yes" | "No";
    tokensOut: number;
    usdcOut: number;
  } | null>(null);

  const yes = market.outcomes.find((o) => o.label === "Yes");
  const no = market.outcomes.find((o) => o.label === "No");
  const price = Number((outcome === "Yes" ? yes : no)?.price ?? 0.5);
  const amt = Number(amount) || 0;

  // BUY: amount = USDC in → tokens out. SELL: amount = tokens in → USDC out.
  const tokensOut = price > 0 ? amt / price : 0;
  const usdcOut = amt * price;
  const position = summary?.positions.find(
    (p) => p.slug === market.slug && p.outcome === outcome,
  );

  const submit = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    setPending({ side, outcome, tokensOut, usdcOut });
    try {
      const r = await postTrade({
        slug: market.slug,
        outcome,
        side,
        amount: amt,
        accountIndex,
      });
      setPending(null); // clear before setResult so the two boxes never overlap
      setResult(r);
      await refresh();
      router.refresh(); // re-render server components with new prices
    } catch (e: any) {
      setPending(null);
      setError(e?.message ?? "trade failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Trade</CardTitle>
          <Tabs value={side} onValueChange={(v) => setSide(v as "BUY" | "SELL")}>
            <TabsList className="h-8">
              <TabsTrigger value="BUY" className="px-4 text-xs">
                Buy
              </TabsTrigger>
              <TabsTrigger value="SELL" className="px-4 text-xs">
                Sell
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setOutcome("Yes")}
            className={cn(
              "rounded-md border px-3 py-2.5 text-sm font-semibold transition-colors",
              outcome === "Yes"
                ? "border-yes bg-yes text-yes-foreground"
                : "border-yes/30 bg-yes/10 text-yes hover:bg-yes/20",
            )}
          >
            Yes {yes ? cents(yes.price) : ""}
          </button>
          <button
            onClick={() => setOutcome("No")}
            className={cn(
              "rounded-md border px-3 py-2.5 text-sm font-semibold transition-colors",
              outcome === "No"
                ? "border-no bg-no text-no-foreground"
                : "border-no/30 bg-no/10 text-no hover:bg-no/20",
            )}
          >
            No {no ? cents(no.price) : ""}
          </button>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            {side === "BUY" ? "Amount (USDC)" : `${outcome} tokens to sell`}
          </label>
          <Input
            type="number"
            min="0"
            step="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <div className="mt-1.5 flex gap-1.5">
            {(side === "BUY" ? [10, 25, 50, 100] : [10, 50, 100]).map((v) => (
              <Button key={v} variant="secondary" size="sm" onClick={() => setAmount(String(v))}>
                {v}
              </Button>
            ))}
            {side === "SELL" && position && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setAmount(String(Math.floor(position.tokens)))}
              >
                Max
              </Button>
            )}
          </div>
        </div>

        <Separator />

        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Price</span>
            <span className="tabular-nums">{cents(price)}</span>
          </div>
          {side === "BUY" ? (
            <>
              <div className="flex justify-between text-muted-foreground">
                <span>Est. {outcome} tokens</span>
                <span className="tabular-nums">{tokensOut.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>Payout if {outcome} wins</span>
                <span className="tabular-nums text-yes">${tokensOut.toFixed(2)}</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex justify-between text-muted-foreground">
                <span>You hold</span>
                <span className="tabular-nums">{position ? position.tokens.toFixed(2) : "0"}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>You receive</span>
                <span className="tabular-nums">${usdcOut.toFixed(2)}</span>
              </div>
            </>
          )}
        </div>

        <Button
          className="w-full"
          size="lg"
          disabled={busy || amt <= 0}
          variant={outcome === "Yes" ? "yes" : "no"}
          onClick={submit}
        >
          {busy
            ? "Confirming on-chain…"
            : `${side === "BUY" ? "Buy" : "Sell"} ${outcome}`}
        </Button>

        {pending && (
          <div className="animate-pulse rounded-md border border-primary/30 bg-primary/5 p-2.5 text-xs">
            <div className="font-semibold text-primary">
              Pending: {pending.side} ~{pending.tokensOut.toFixed(2)} {pending.outcome} for ~$
              {pending.usdcOut.toFixed(2)}
            </div>
            <div className="mt-1 text-muted-foreground">Confirming on-chain…</div>
          </div>
        )}
        {result && (
          <div className="rounded-md border border-yes/30 bg-yes/10 p-2.5 text-xs">
            <div className="font-semibold text-yes">
              Filled on-chain: {result.side} {result.tokenAmount.toFixed(2)} {result.outcome} for $
              {result.usdcAmount.toFixed(2)}
            </div>
            <div className="mt-1 break-all text-muted-foreground">tx {result.txHash}</div>
            {result.faucetMinted && (
              <div className="mt-1 text-muted-foreground">
                (Demo faucet topped up your USDC automatically)
              </div>
            )}
          </div>
        )}
        {error && (
          <div className="rounded-md border border-no/30 bg-no/10 p-2.5 text-xs font-medium text-no">
            {error}
          </div>
        )}

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Trades settle on the local anvil chain via CTFExchange against the
          operator&apos;s inventory. Demo Wallet {accountIndex}
          {summary ? ` · $${summary.usdc.toLocaleString("en-US", { maximumFractionDigits: 0 })} USDC` : ""}
        </p>
      </CardContent>
    </Card>
  );
}
