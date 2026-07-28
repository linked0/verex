"use client";

// The interactive body of a group page: outcome rows on the left (click to
// select), trade panel + order book for the selected member on the right —
// the operator sees the group resolve panel instead.

import * as React from "react";
import { CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useWallet } from "@/components/WalletProvider";
import { TradePanel } from "@/components/TradePanel";
import { BookPanel } from "@/components/BookPanel";
import { GroupResolvePanel } from "@/components/GroupResolvePanel";
import { cents, pct, type MarketGroup } from "@/lib/api";
import { cn } from "@/lib/utils";

export function GroupView({ group }: { group: MarketGroup }) {
  const { isAdmin } = useWallet();
  const members = [...group.markets].sort(
    (a, b) => Number(b.quoteCenter ?? 0) - Number(a.quoteCenter ?? 0),
  );
  const [selectedSlug, setSelectedSlug] = React.useState(members[0]?.slug ?? "");
  const selected = members.find((m) => m.slug === selectedSlug) ?? members[0];
  const resolved = group.status === "RESOLVED";
  const winnerId = group.resolvedMarketId;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <Card className="self-start">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Outcomes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {members.map((m) => {
            const yes = m.outcomes.find((o) => o.label === "Yes");
            const no = m.outcomes.find((o) => o.label === "No");
            const p = Number(m.quoteCenter ?? yes?.price ?? 0);
            const isWinner = resolved && m.id === winnerId;
            return (
              <button
                key={m.id}
                onClick={() => setSelectedSlug(m.slug)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors",
                  selectedSlug === m.slug ? "border-primary bg-primary/5" : "hover:border-primary/40",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{m.groupLabel}</span>
                    {isWinner && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-yes">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Winner
                      </span>
                    )}
                  </div>
                  <div className="mt-1 h-1.5 w-full max-w-56 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${pct(p)}%` }} />
                  </div>
                </div>
                <span className="w-12 text-right text-lg font-bold tabular-nums text-primary">
                  {pct(p)}%
                </span>
                {!resolved && (
                  <div className="hidden gap-1.5 sm:flex">
                    <span className="rounded-md bg-yes/10 px-2 py-1 text-xs font-semibold text-yes">
                      Yes {yes ? cents(yes.price) : "—"}
                    </span>
                    <span className="rounded-md bg-no/10 px-2 py-1 text-xs font-semibold text-no">
                      No {no ? cents(no.price) : "—"}
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </CardContent>
      </Card>

      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        {resolved ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckCircle2 className="h-4 w-4 text-yes" /> Group resolved
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                Winner:{" "}
                <span className="font-semibold text-yes">
                  {members.find((m) => m.id === winnerId)?.groupLabel ?? "—"}
                </span>
              </p>
              <p>
                Winning tokens pay $1 each — redeem from your{" "}
                <a href="/portfolio" className="underline hover:text-foreground">
                  Portfolio
                </a>
                .
              </p>
            </CardContent>
          </Card>
        ) : isAdmin ? (
          <GroupResolvePanel group={group} />
        ) : (
          selected && (
            <>
              <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm">
                Trading: <span className="font-semibold">{selected.groupLabel}</span>
              </div>
              <TradePanel key={selected.slug} market={selected} />
            </>
          )
        )}
        {selected && !resolved && <BookPanel key={`book-${selected.slug}`} slug={selected.slug} outcome="Yes" />}
      </aside>
    </div>
  );
}
