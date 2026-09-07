import FundingClient from "./FundingClient";

// Server wrapper so `dynamic` applies (ignored in a "use client" file) —
// same reasoning as the portfolio page.
export const dynamic = "force-dynamic";

export default function FundingPage() {
  return <FundingClient />;
}
