import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { marketThumbnail, pct, usd, type MarketGroup } from "@/lib/api";

/// Homepage card for a multi-outcome group: top candidates with their
/// probabilities, Polymarket-style rows.
export function GroupCard({ group }: { group: MarketGroup }) {
  const members = [...group.markets].sort(
    (a, b) => Number(b.quoteCenter ?? 0) - Number(a.quoteCenter ?? 0),
  );
  const top = members.slice(0, 3);
  const more = members.length - top.length;
  const winner = group.resolvedMarketId
    ? members.find((m) => m.id === group.resolvedMarketId)
    : null;

  return (
    <Link href={`/group/${group.slug}`} className="group">
      <Card className="h-full overflow-hidden transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/40 group-hover:shadow-lg group-hover:shadow-primary/10">
        <CardHeader className="pb-3">
          <div className="flex items-start gap-2">
            <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg">
              {/* eslint-disable-next-line @next/next/no-img-element -- external, per-market seeded photo; not worth Next/Image remote-pattern config for a placeholder */}
              <img
                src={group.imageUrl ?? marketThumbnail(group.slug)}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
              />
            </div>
            <CardTitle className="flex-1 text-[15px] leading-snug group-hover:text-primary">
              {group.title}
            </CardTitle>
            <Badge variant="secondary" className="shrink-0">
              {members.length} outcomes
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pb-3">
          {group.status === "RESOLVED" && winner ? (
            <div className="rounded-md border border-yes/30 bg-yes/10 px-2 py-1.5 text-center text-sm font-semibold text-yes">
              Resolved — {winner.groupLabel}
            </div>
          ) : (
            <div className="space-y-1.5">
              {top.map((m) => {
                const p = Number(m.quoteCenter ?? 0);
                return (
                  <div key={m.id} className="flex items-center gap-2 text-sm">
                    <span className="flex-1 truncate">{m.groupLabel}</span>
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${pct(p)}%` }}
                      />
                    </div>
                    <span className="w-9 text-right font-semibold tabular-nums text-primary">
                      {pct(p)}%
                    </span>
                  </div>
                );
              })}
              {more > 0 && (
                <div className="text-xs text-muted-foreground">+{more} more</div>
              )}
            </div>
          )}
          <div className="mt-2 text-xs text-muted-foreground">{usd(group.volume)} Vol</div>
        </CardContent>
      </Card>
    </Link>
  );
}
