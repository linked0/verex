import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cents, marketThumbnail, pct, usd, type Market } from "@/lib/api";
import { categoryLabel } from "@/components/CategoryTabs";
import type { Translate } from "@/lib/i18n";

// Grid card: title, Yes probability + Yes/No prices, volume.
export function MarketCard({ market, t, intl }: { market: Market; t: Translate; intl: string }) {
  const yes = market.outcomes.find((o) => o.label === "Yes");
  const no = market.outcomes.find((o) => o.label === "No");

  return (
    <Link href={`/market/${market.slug}`} className="group">
      <Card className="h-full overflow-hidden transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/40 group-hover:shadow-lg group-hover:shadow-primary/10">
        {/* Signature: a Yes-probability bar, width and hue driven by the actual price. */}
        <div className="h-1 w-full bg-no/20">
          <div
            className="h-full bg-gradient-to-r from-primary to-yes transition-[width] duration-500"
            style={{ width: yes ? `${pct(yes.price)}%` : "0%" }}
          />
        </div>
        <CardHeader className="pb-3">
          <div className="flex items-start gap-2">
            <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg">
              {/* eslint-disable-next-line @next/next/no-img-element -- external, per-market seeded photo; not worth Next/Image remote-pattern config for a placeholder */}
              <img
                src={market.imageUrl ?? marketThumbnail(market.slug)}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
              />
            </div>
            <CardTitle className="flex-1 text-[15px] leading-snug group-hover:text-primary">
              {market.title}
            </CardTitle>
            {yes && (
              <span className="shrink-0 bg-gradient-to-r from-primary to-yes bg-clip-text text-lg font-bold tabular-nums text-transparent">
                {pct(yes.price)}%
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="pb-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md border border-yes/30 bg-yes/10 px-2 py-1.5 text-center text-sm font-semibold text-yes transition-colors duration-200 group-hover:bg-yes/20">
              Yes {yes ? cents(yes.price) : "—"}
            </div>
            <div className="rounded-md border border-no/30 bg-no/10 px-2 py-1.5 text-center text-sm font-semibold text-no transition-colors duration-200 group-hover:bg-no/20">
              No {no ? cents(no.price) : "—"}
            </div>
          </div>
        </CardContent>
        <CardFooter className="gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary">{categoryLabel(market.category, t)}</Badge>
          <span>
            {usd(market.volume)} {t("home.volume")}
          </span>
          {market.closesAt && (
            <span className="ml-auto">
              {t("home.closes", {
                date: new Date(market.closesAt).toLocaleDateString(intl, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                }),
              })}
            </span>
          )}
        </CardFooter>
      </Card>
    </Link>
  );
}
