import Link from "next/link";
import {
  getCategories,
  getGroups,
  getHistory,
  getMarkets,
  cents,
  marketThumbnail,
  pct,
  usd,
  type Market,
  type MarketGroup,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryTabs } from "@/components/CategoryTabs";
import { GroupCard } from "@/components/GroupCard";
import { MarketCard } from "@/components/MarketCard";
import { ProbChart } from "@/components/ProbChart";

export const dynamic = "force-dynamic";

// Featured market — the highest-volume one, with its probability chart.
async function Featured({ market }: { market: Market }) {
  const points = await getHistory(market.slug);
  const yes = market.outcomes.find((o) => o.label === "Yes");
  const no = market.outcomes.find((o) => o.label === "No");

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- external, per-market seeded photo; not worth Next/Image remote-pattern config for a placeholder */}
          <img
            src={market.imageUrl ?? marketThumbnail(market.slug)}
            alt=""
            loading="lazy"
            className="h-9 w-9 shrink-0 rounded-lg object-cover"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Badge>{market.category}</Badge>
              <Badge variant="secondary">Featured</Badge>
            </div>
            <Link href={`/market/${market.slug}`}>
              <CardTitle className="text-xl hover:text-primary md:text-2xl">
                {market.title}
              </CardTitle>
            </Link>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-5 md:grid-cols-[1fr_240px]">
          <ProbChart points={points} />
          <div className="flex flex-col justify-center gap-3">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">Yes chance</span>
              <span className="text-3xl font-bold tabular-nums text-primary">
                {yes ? pct(yes.price) : "—"}%
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Link
                href={`/market/${market.slug}`}
                className="rounded-md border border-yes/30 bg-yes/10 px-2 py-2 text-center text-sm font-semibold text-yes hover:bg-yes hover:text-yes-foreground"
              >
                Yes {yes ? cents(yes.price) : ""}
              </Link>
              <Link
                href={`/market/${market.slug}`}
                className="rounded-md border border-no/30 bg-no/10 px-2 py-2 text-center text-sm font-semibold text-no hover:bg-no hover:text-no-foreground"
              >
                No {no ? cents(no.price) : ""}
              </Link>
            </div>
            <div className="text-xs text-muted-foreground">
              {usd(market.volume)} Vol
              {market.closesAt &&
                ` · Closes ${new Date(market.closesAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// "Hot markets" sidebar — by volume.
function HotList({ markets }: { markets: Market[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Hot markets</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {markets.map((m) => {
          const yes = m.outcomes.find((o) => o.label === "Yes");
          return (
            <Link key={m.id} href={`/market/${m.slug}`} className="group flex items-center justify-between gap-3">
              <span className="text-sm leading-snug text-foreground group-hover:text-primary">
                {m.title}
              </span>
              <span className="shrink-0 text-sm font-bold tabular-nums text-primary">
                {yes ? pct(yes.price) : "—"}%
              </span>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: { category?: string; q?: string };
}) {
  const active = searchParams.category ?? "All";
  const q = searchParams.q;
  const [markets, groups, categories] = await Promise.all([
    getMarkets(active, q),
    getGroups(active, q),
    getCategories(),
  ]);
  const [featured, ...rest] = markets;
  const hot = [...markets].slice(0, 5);
  const total = markets.length + groups.length;

  // Groups and standalone markets share the grid, highest volume first.
  const gridItems: ({ kind: "group"; group: MarketGroup } | { kind: "market"; market: Market })[] = [
    ...groups.map((g) => ({ kind: "group" as const, group: g, volume: g.volume })),
    ...rest.map((m) => ({ kind: "market" as const, market: m, volume: Number(m.volume) })),
  ]
    .sort((a, b) => b.volume - a.volume)
    .map(({ kind, ...item }: any) => ({ kind, ...item }));

  return (
    <main className="container space-y-6 py-6">
      <CategoryTabs categories={["All", ...categories]} active={active} />

      {q && (
        <p className="text-sm text-muted-foreground">
          {total} result{total === 1 ? "" : "s"} for “{q}”
        </p>
      )}

      {total === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            No markets found.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <div className="space-y-6">
            {featured && <Featured market={featured} />}
            <div className="grid gap-4 sm:grid-cols-2">
              {gridItems.map((item) =>
                item.kind === "group" ? (
                  <GroupCard key={`g-${item.group.id}`} group={item.group} />
                ) : (
                  <MarketCard key={item.market.id} market={item.market} />
                ),
              )}
            </div>
          </div>
          <aside className="hidden lg:block">
            <HotList markets={hot} />
          </aside>
        </div>
      )}
    </main>
  );
}
