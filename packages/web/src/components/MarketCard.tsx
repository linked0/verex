import Link from "next/link";
import { type Market, pct, usd } from "@/lib/api";

export function MarketCard({ market }: { market: Market }) {
  const top = [...market.outcomes].sort((a, b) => Number(b.price) - Number(a.price)).slice(0, 3);
  return (
    <Link href={`/market/${market.slug}`} className="card">
      <div className="card-cat">{market.category}</div>
      <div className="card-title">{market.title}</div>
      <div className="outcomes">
        {top.map((o) => (
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
