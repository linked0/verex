import Link from "next/link";
import { notFound } from "next/navigation";
import { getMarket, pct, usd } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function MarketPage({ params }: { params: { slug: string } }) {
  const market = await getMarket(params.slug);
  if (!market) notFound();

  const outcomes = [...market.outcomes].sort((a, b) => Number(b.price) - Number(a.price));

  return (
    <main className="container">
      <Link href="/" className="back">
        ← All markets
      </Link>

      <div className="detail-cat">{market.category}</div>
      <h1 className="detail-title">{market.title}</h1>
      {market.description && <p className="detail-desc">{market.description}</p>}
      <div className="detail-meta">
        {usd(market.volume)} Vol · {market.status}
        {market.closesAt && ` · closes ${new Date(market.closesAt).toLocaleDateString("en-US")}`}
      </div>

      <div className="outcome-list">
        {outcomes.map((o) => {
          const p = pct(o.price);
          return (
            <div key={o.id} className="outcome-row">
              <div className="outcome-row-top">
                <span>{o.label}</span>
                <span>{p}%</span>
              </div>
              <div className="bar">
                <div className="bar-fill" style={{ width: `${p}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
