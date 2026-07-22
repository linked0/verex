// Fetch helpers for the Verex API (packages/api). Prices/volumes arrive as strings
// (Prisma Decimal serializes to string) — callers convert with Number().

export type Outcome = {
  id: string;
  label: string;
  price: string; // 0..1 implied probability
  tokenId: string;
  sortOrder: number;
};

export type Market = {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  category: string;
  imageUrl?: string | null;
  status: string;
  volume: string;
  closesAt?: string | null;
  conditionId: string;
  outcomes: Outcome[];
};

export type PricePoint = { price: string; at: string };

export type Trade = {
  id: string;
  user: string;
  side: "BUY" | "SELL" | "REDEEM";
  usdcAmount: string;
  tokenAmount: string;
  price: string;
  txHash: string;
  createdAt: string;
  outcome: { label: string };
};

export type HistoryRow = {
  id: string;
  side: "BUY" | "SELL" | "REDEEM";
  marketSlug: string;
  marketTitle: string;
  outcome: string;
  usdcAmount: number;
  tokenAmount: number;
  price: number;
  txHash: string;
  createdAt: string;
  realizedPnl?: number;
};

export type TradeResult = {
  txHash: string;
  side: "BUY" | "SELL";
  outcome: "Yes" | "No";
  usdcAmount: number;
  tokenAmount: number;
  price: number;
  newYesPrice: number;
  faucetMinted: boolean;
};

export type Position = {
  slug: string;
  title: string;
  outcome: string;
  tokens: number;
  price: number;
  value: number;
  costBasis: number;
  pnl: number;
  marketStatus: string;
  won: boolean | null;
};

export type WalletSummary = {
  accountIndex: number;
  address: string;
  usdc: number;
  positions: Position[];
};

// Server components use API_URL (runtime, non-public); the browser uses
// NEXT_PUBLIC_API_URL. Both default to local dev.
const API =
  process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/// Browser-side base: same-origin /backend/* — proxied to the API by the
/// rewrite in next.config.js. Works identically in local dev and the cloud
/// (no build-time NEXT_PUBLIC_ URL baking).
export const BROWSER_API = "/backend";

export async function getMarkets(category?: string, q?: string): Promise<Market[]> {
  const params = new URLSearchParams();
  if (category && category !== "All") params.set("category", category);
  if (q) params.set("q", q);
  const qs = params.toString();
  try {
    const res = await fetch(`${API}/markets${qs ? `?${qs}` : ""}`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return data.markets ?? [];
  } catch {
    return [];
  }
}

export async function getMarket(slug: string): Promise<Market | null> {
  try {
    const res = await fetch(`${API}/markets/${slug}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as Market;
  } catch {
    return null;
  }
}

export async function getCategories(): Promise<string[]> {
  try {
    const res = await fetch(`${API}/categories`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return data.categories ?? [];
  } catch {
    return [];
  }
}

export async function getHistory(slug: string): Promise<PricePoint[]> {
  try {
    const res = await fetch(`${API}/markets/${slug}/history`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return data.points ?? [];
  } catch {
    return [];
  }
}

export async function getTrades(slug: string): Promise<Trade[]> {
  try {
    const res = await fetch(`${API}/markets/${slug}/trades`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return data.trades ?? [];
  } catch {
    return [];
  }
}

// ── Browser-side calls (client components) ──────────────────────────

export async function postTrade(body: {
  slug: string;
  outcome: "Yes" | "No";
  side: "BUY" | "SELL";
  amount: number;
  accountIndex: number;
}): Promise<TradeResult> {
  const res = await fetch(`${BROWSER_API}/trade`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? "trade failed");
  return data as TradeResult;
}

export async function getWallet(index: number): Promise<WalletSummary | null> {
  try {
    const res = await fetch(`${BROWSER_API}/wallet/${index}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as WalletSummary;
  } catch {
    return null;
  }
}

export async function getWalletHistory(index: number): Promise<HistoryRow[]> {
  try {
    const res = await fetch(`${BROWSER_API}/wallet/${index}/history`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return data.history ?? [];
  } catch {
    return [];
  }
}

export async function postResolve(body: {
  slug: string;
  outcome: "Yes" | "No";
  accountIndex: number;
}): Promise<{ txHash: string; resolvedOutcome: "Yes" | "No" }> {
  const res = await fetch(`${BROWSER_API}/markets/${body.slug}/resolve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ outcome: body.outcome, accountIndex: body.accountIndex }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? "resolve failed");
  return data;
}

export async function postRedeem(body: {
  slug: string;
  accountIndex: number;
}): Promise<{ txHash: string; usdcReceived: number; usdc: number }> {
  const res = await fetch(`${BROWSER_API}/redeem`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? "redeem failed");
  return data;
}

export async function postFaucet(accountIndex: number): Promise<{ usdc: number } | null> {
  try {
    const res = await fetch(`${BROWSER_API}/faucet`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accountIndex }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export const pct = (price: string | number) => Math.round(Number(price) * 100);
export const usd = (v: string | number) =>
  `$${Number(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
export const cents = (price: string | number) => `${Math.round(Number(price) * 100)}¢`;

// Free, seeded per market so the same market always gets the same photo — no API key,
// no storage/upload flow needed.
export const marketThumbnail = (slug: string) => `https://picsum.photos/seed/${slug}/96/96`;
