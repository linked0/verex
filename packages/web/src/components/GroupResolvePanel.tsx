"use client";

// Admin (operator #0) group resolution: pick the winning outcome from the
// member list — the winner reports Yes on-chain, every other member No.
// Optimistic: the group flips in the DB immediately; the payout txs settle
// behind the returned job.

import * as React from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { pct, postGroupResolve, type MarketGroup } from "@/lib/api";
import { cn } from "@/lib/utils";

export function GroupResolvePanel({ group }: { group: MarketGroup }) {
  const router = useRouter();
  const [winnerSlug, setWinnerSlug] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const members = [...group.markets].sort(
    (a, b) => Number(b.quoteCenter ?? 0) - Number(a.quoteCenter ?? 0),
  );
  const winner = members.find((m) => m.slug === winnerSlug);

  const resolve = async () => {
    if (!winnerSlug) return;
    setBusy(true);
    setError(null);
    try {
      const r = await postGroupResolve({ groupSlug: group.slug, winnerSlug, accountIndex: 0 });
      setDone(r.winnerLabel ?? r.winnerSlug);
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "resolve failed");
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  if (done) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-yes" /> Group resolved
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Winner: <span className="font-semibold text-yes">{done}</span> — payouts are being
          reported on-chain for every member market.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4 text-primary" /> Resolve group (admin)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Pick the winning outcome. This is <strong>irreversible</strong>: the winner&apos;s Yes
          pays $1, every other outcome&apos;s No pays $1.
        </p>
        <div className="space-y-1.5">
          {members.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                setWinnerSlug(m.slug);
                setConfirming(false);
              }}
              className={cn(
                "flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors",
                winnerSlug === m.slug
                  ? "border-primary bg-primary/10 font-semibold text-primary"
                  : "hover:border-primary/40",
              )}
            >
              <span className="truncate">{m.groupLabel}</span>
              <span className="tabular-nums text-muted-foreground">
                {pct(Number(m.quoteCenter ?? 0))}%
              </span>
            </button>
          ))}
        </div>
        {confirming && winner ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">
              Resolve with <span className="text-primary">{winner.groupLabel}</span> as the winner?
            </p>
            <div className="flex gap-2">
              <Button className="flex-1" disabled={busy} onClick={resolve}>
                {busy ? "Resolving…" : "Confirm"}
              </Button>
              <Button variant="outline" className="flex-1" disabled={busy} onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button className="w-full" disabled={!winnerSlug || busy} onClick={() => setConfirming(true)}>
            Resolve group…
          </Button>
        )}
        {error && <p className="text-sm text-no">{error}</p>}
      </CardContent>
    </Card>
  );
}
