"use client";

// Right-hand panel switch for the market page (client-side because the choice
// depends on the active demo wallet): operator #0 sees the resolve panel,
// everyone else trades; resolved markets show the outcome instead.

import { CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useWallet } from "@/components/WalletProvider";
import { TradePanel } from "@/components/TradePanel";
import { ResolvePanel } from "@/components/ResolvePanel";
import type { Market } from "@/lib/api";

export function MarketSidePanel({ market }: { market: Market }) {
  const { isAdmin } = useWallet();

  if (market.status === "RESOLVED") {
    const winner = market.outcomes.find((o) => Number(o.price) === 1);
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="h-4 w-4 text-yes" /> Market resolved
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Final outcome:{" "}
            <span className={winner?.label === "Yes" ? "font-semibold text-yes" : "font-semibold text-no"}>
              {winner?.label ?? "—"}
            </span>
          </p>
          <p>
            Winning tokens pay $1 each — redeem them from your{" "}
            <a href="/portfolio" className="underline hover:text-foreground">
              Portfolio
            </a>
            .
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isAdmin && market.group) {
    // Group members resolve together (mutually exclusive outcomes) — send
    // the operator to the group's winner picker instead.
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Resolve via the group</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          This market is one outcome of{" "}
          <a href={`/group/${market.group.slug}`} className="underline hover:text-foreground">
            {market.group.title}
          </a>
          . Pick the winner there — all member markets resolve together.
        </CardContent>
      </Card>
    );
  }

  return isAdmin ? <ResolvePanel market={market} /> : <TradePanel market={market} />;
}
