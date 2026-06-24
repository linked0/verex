import Link from "next/link";
import { getMarkets, getCategories, pct, usd, type Market } from "@/lib/api";
import { CategoryTabs } from "@/components/CategoryTabs";
import { MarketCard } from "@/components/MarketCard";

export const dynamic = "force-dynamic";

function Featured({ market }: { market: Market }) {
  const sorted = [...market.outcomes].sort((a, b) => Number(b.price) - Number(a.price));
  return (
    <Link href={`/market/${market.slug}`} className="featured">
      <div className="card-cat">{market.category} · Featured</div>
      <h2 className="featured-title">{market.title}</h2>
      <div className="featured-outcomes">
        {sorted.map((o) => (
          <div key={o.id} className="outcome">
            <span className="outcome-label">{o.label}</span>
            <span className="outcome-pct">{pct(o.price)}%</span>
          </div>
        ))}
      </div>
      <div className="card-foot">{usd(market.volume)} Vol</div>
    </Link>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: { category?: string };
}) {
  const active = searchParams.category ?? "All";
  const [markets, categories] = await Promise.all([getMarkets(active), getCategories()]);
  const [featured, ...rest] = markets;

  return (
    <main className="container">
      <CategoryTabs categories={["All", ...categories]} active={active} />

      {markets.length === 0 ? (
        <div className="empty">
          No markets yet. Start the API and seed the database
          (<code>pnpm --filter @verex/api seed</code>) to see markets here.
        </div>
      ) : (
        <>
          {featured && <Featured market={featured} />}
          <h3 className="section-title">All markets</h3>
          <div className="grid">
            {rest.map((m) => (
              <MarketCard key={m.id} market={m} />
            ))}
          </div>
        </>
      )}
    </main>
  );
}
