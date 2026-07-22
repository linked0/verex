import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cents, marketThumbnail, pct, usd, type Market } from "@/lib/api";

// Grid card: title, Yes probability + Yes/No prices, volume.
export function MarketCard({ market }: { market: Market }) {
  const yes = market.outcomes.find((o) => o.label === "Yes");
  const no = market.outcomes.find((o) => o.label === "No");

  return (
    <Link href={`/market/${market.slug}`} className="group">
      <Card className="h-full transition-shadow group-hover:shadow-md">
        <CardHeader className="pb-3">
          <div className="flex items-start gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- external, per-market seeded photo; not worth Next/Image remote-pattern config for a placeholder */}
            <img
              src={marketThumbnail(market.slug)}
              alt=""
              loading="lazy"
              className="h-9 w-9 shrink-0 rounded-lg object-cover"
            />
            <CardTitle className="flex-1 text-[15px] leading-snug group-hover:text-primary">
              {market.title}
            </CardTitle>
            {yes && (
              <span className="shrink-0 text-lg font-bold tabular-nums text-primary">
                {pct(yes.price)}%
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="pb-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md border border-yes/30 bg-yes/10 px-2 py-1.5 text-center text-sm font-semibold text-yes">
              Yes {yes ? cents(yes.price) : "—"}
            </div>
            <div className="rounded-md border border-no/30 bg-no/10 px-2 py-1.5 text-center text-sm font-semibold text-no">
              No {no ? cents(no.price) : "—"}
            </div>
          </div>
        </CardContent>
        <CardFooter className="gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary">{market.category}</Badge>
          <span>{usd(market.volume)} Vol</span>
          {market.closesAt && (
            <span className="ml-auto">
              Closes {new Date(market.closesAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
          )}
        </CardFooter>
      </Card>
    </Link>
  );
}
