import PortfolioClient from "./PortfolioClient";

// Server wrapper so this route segment config actually applies — `export const
// dynamic` is ignored in a "use client" file. Without it the page prerenders as
// static and is served with s-maxage=31536000 (a year), so visitors permanently
// get the pre-fetch placeholder HTML ("…" balance, "No positions yet") even
// though the API returns real data.
export const dynamic = "force-dynamic";

export default function PortfolioPage() {
  return <PortfolioClient />;
}
