import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  getHistory,
  getMarket,
  getTrades,
  cents,
  marketThumbnail,
  pct,
  usd,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { categoryLabel } from "@/components/CategoryTabs";
import { EditMarketLink } from "@/components/EditMarketLink";
import { ProbChart } from "@/components/ProbChart";
import { MarketSidePanel } from "@/components/MarketSidePanel";
import { BookPanel } from "@/components/BookPanel";
import { UmaOraclePanel } from "@/components/UmaOraclePanel";
import { getLocale, getT } from "@/lib/i18n-server";
import { intlLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function MarketPage({ params }: { params: { slug: string } }) {
  const t = getT();
  const intl = intlLocale(getLocale());
  const market = await getMarket(params.slug);
  if (!market) notFound();

  const [points, trades] = await Promise.all([
    getHistory(market.slug),
    getTrades(market.slug),
  ]);
  const yes = market.outcomes.find((o) => o.label === "Yes");
  const no = market.outcomes.find((o) => o.label === "No");

  return (
    <main className="container space-y-6 py-6">
      <Link
        href={market.group ? `/group/${market.group.slug}` : "/"}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {market.group ? market.group.title : t("market.allMarkets")}
      </Link>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* Left: market info + chart + outcomes + activity */}
        <div className="space-y-6">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Badge>{categoryLabel(market.category, t)}</Badge>
              {market.status === "RESOLVED" && (
                <Badge variant="outline" className="border-yes text-yes">
                  {t("market.resolvedLabel")}{" "}
                  {market.outcomes.find((o) => Number(o.price) === 1)?.label?.toUpperCase() ?? "?"}
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">
                {usd(market.volume)} {t("market.volume")}
                {market.closesAt &&
                  ` · ${t("market.closes", { date: new Date(market.closesAt).toLocaleDateString(intl, { month: "short", day: "numeric", year: "numeric" }) })}`}
              </span>
              <EditMarketLink slug={market.slug} />
            </div>
            <div className="flex items-start gap-3">
              {/* Same logo as the grid card, one size up (56px vs 36px). */}
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg">
                {/* eslint-disable-next-line @next/next/no-img-element -- external, per-market seeded photo; not worth Next/Image remote-pattern config for a placeholder */}
                <img
                  src={market.imageUrl ?? marketThumbnail(market.slug)}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </div>
              <h1 className="text-2xl font-bold leading-tight md:text-3xl">{market.title}</h1>
            </div>
          </div>

          <Card>
            <CardHeader className="pb-0">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tabular-nums text-primary">
                  {yes ? pct(yes.price) : "—"}%
                </span>
                <span className="text-sm text-muted-foreground">{t("market.yesChance")}</span>
              </div>
            </CardHeader>
            <CardContent>
              <ProbChart points={points} height={260} />
            </CardContent>
          </Card>

          {/* UMA markets carry their oracle's whole lifecycle on the page —
              propose → challenge window → (dispute → jury → verdict) → resolve.
              Operator markets have no lifecycle to show; their resolution is a
              single admin action in the side panel. */}
          {market.oracleType === "UMA" && (
            <UmaOraclePanel
              slug={market.slug}
              marketStatus={market.status}
              closesAt={market.closesAt}
            />
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("market.outcomes")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {market.outcomes.map((o) => (
                <div
                  key={o.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2.5"
                >
                  <span className="font-medium">{o.label}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">{pct(o.price)}%</span>
                    <span
                      className={
                        o.label === "Yes"
                          ? "rounded-md bg-yes/10 px-2.5 py-1 text-sm font-semibold text-yes"
                          : "rounded-md bg-no/10 px-2.5 py-1 text-sm font-semibold text-no"
                      }
                    >
                      {cents(o.price)}
                    </span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {market.description && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t("market.rules")}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-relaxed text-muted-foreground">
                {market.description}
                <Separator className="my-3" />
                <div className="break-all text-xs">
                  {t("market.condition")}: <code>{market.conditionId}</code>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("market.recentActivity")}</CardTitle>
            </CardHeader>
            <CardContent>
              {trades.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  {t("market.noTrades")}
                </p>
              ) : (
                <div className="space-y-2">
                  {trades.map((tr) => (
                    <div key={tr.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-mono text-xs text-muted-foreground">
                        {tr.user.slice(0, 6)}…{tr.user.slice(-4)}
                      </span>
                      <span
                        className={
                          tr.side === "BUY"
                            ? "text-yes"
                            : tr.side === "SELL"
                              ? "text-no"
                              : "text-primary"
                        }
                      >
                        {t(
                          tr.side === "BUY"
                            ? "market.tradeBought"
                            : tr.side === "SELL"
                              ? "market.tradeSold"
                              : "market.tradeRedeemed",
                          {
                            amount: Number(tr.tokenAmount).toFixed(1),
                            outcome: tr.outcome.label,
                          },
                        )}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        @{cents(tr.price)}
                      </span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {new Date(tr.createdAt).toLocaleTimeString(intl, {
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
        </div>

        {/* Right: trade panel (or admin resolve / resolved note) + book depth */}
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <MarketSidePanel market={market} />
          {market.status === "OPEN" && <BookPanel slug={market.slug} outcome="Yes" />}
        </aside>
      </div>
    </main>
  );
}
