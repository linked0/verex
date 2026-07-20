import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  getHistory,
  getMarket,
  getTrades,
  cents,
  pct,
  usd,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ProbChart } from "@/components/ProbChart";
import { MarketSidePanel } from "@/components/MarketSidePanel";

export const dynamic = "force-dynamic";

export default async function MarketPage({ params }: { params: { slug: string } }) {
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
        href="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> All markets
      </Link>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* Left: market info + chart + outcomes + activity */}
        <div className="space-y-6">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Badge>{market.category}</Badge>
              {market.status === "RESOLVED" && (
                <Badge variant="outline" className="border-yes text-yes">
                  RESOLVED —{" "}
                  {market.outcomes.find((o) => Number(o.price) === 1)?.label?.toUpperCase() ?? "?"}
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">
                {usd(market.volume)} Vol
                {market.closesAt &&
                  ` · Closes ${new Date(market.closesAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}
              </span>
            </div>
            <h1 className="text-2xl font-bold leading-tight md:text-3xl">{market.title}</h1>
          </div>

          <Card>
            <CardHeader className="pb-0">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tabular-nums text-primary">
                  {yes ? pct(yes.price) : "—"}%
                </span>
                <span className="text-sm text-muted-foreground">Yes chance</span>
              </div>
            </CardHeader>
            <CardContent>
              <ProbChart points={points} height={260} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Outcomes</CardTitle>
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
                <CardTitle className="text-base">Rules</CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-relaxed text-muted-foreground">
                {market.description}
                <Separator className="my-3" />
                <div className="break-all text-xs">
                  Condition: <code>{market.conditionId}</code>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Recent activity</CardTitle>
            </CardHeader>
            <CardContent>
              {trades.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No trades yet — be the first.
                </p>
              ) : (
                <div className="space-y-2">
                  {trades.map((t) => (
                    <div key={t.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-mono text-xs text-muted-foreground">
                        {t.user.slice(0, 6)}…{t.user.slice(-4)}
                      </span>
                      <span
                        className={
                          t.side === "BUY" ? "text-yes" : t.side === "SELL" ? "text-no" : "text-primary"
                        }
                      >
                        {t.side === "BUY" ? "Bought" : t.side === "SELL" ? "Sold" : "Redeemed"}{" "}
                        {Number(t.tokenAmount).toFixed(1)} {t.outcome.label}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        @{cents(t.price)}
                      </span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {new Date(t.createdAt).toLocaleTimeString("en-US", {
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

        {/* Right: trade panel (or admin resolve / resolved note) */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <MarketSidePanel market={market} />
        </aside>
      </div>
    </main>
  );
}
