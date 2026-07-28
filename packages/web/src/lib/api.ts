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
  // Group membership (rev 2): set when this market is one outcome of a
  // multi-outcome group.
  groupId?: string | null;
  groupLabel?: string | null;
  quoteCenter?: string;
  group?: { slug: string; title: string } | null;
};

/// A multi-outcome market: N mutually exclusive member Markets under one
/// question ("Who wins the World Cup?"). Yes prices across members sum to 1.
export type MarketGroup = {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  category: string;
  imageUrl?: string | null;
  status: "CREATING" | "OPEN" | "RESOLVED" | "CANCELLED";
  closesAt?: string | null;
  resolvedMarketId?: string | null;
  creator?: string | null;
  volume: number;
  markets: Market[];
};

export type GroupSeries = {
  slug: string;
  label: string;
  points: PricePoint[];
};

export type BookLevel = { price: number; size: number };
export type BookSnapshot = {
  outcome: string;
  bids: BookLevel[];
  asks: BookLevel[];
  mid: number | null;
};

export type PricePoint = { price: string; at: string };

export type Trade = {
  id: string;
  user: string;
  side: "BUY" | "SELL" | "REDEEM";
  usdcAmount: string;
  tokenAmount: string;
  price: string;
  txHash: string | null;
  settlement?: "PENDING" | "CONFIRMED" | "FAILED";
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
  txHash: string | null;
  settlement?: "PENDING" | "CONFIRMED" | "FAILED";
  createdAt: string;
  realizedPnl?: number;
};

export type TradeResult = {
  /// Null on arrival — fills are instant in the DB book; the chain settles
  /// behind `jobId` (SettlementChip polls it).
  txHash: string | null;
  jobId: string | null;
  settlement: "PENDING" | "NONE";
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

/// Browser-side base: same-origin /backend/* — proxied to the API by
/// src/app/backend/[...path]/route.ts (a Route Handler, not a
/// next.config.js rewrite — rewrites are evaluated at build time, which
/// would bake in the wrong URL; a Route Handler reads API_URL fresh on
/// every request). Works identically in local dev and the cloud (no
/// build-time NEXT_PUBLIC_ URL baking).
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

export async function getGroups(category?: string, q?: string): Promise<MarketGroup[]> {
  const params = new URLSearchParams();
  if (category && category !== "All") params.set("category", category);
  if (q) params.set("q", q);
  const qs = params.toString();
  try {
    const res = await fetch(`${API}/market-groups${qs ? `?${qs}` : ""}`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return data.groups ?? [];
  } catch {
    return [];
  }
}

export async function getGroup(slug: string): Promise<MarketGroup | null> {
  try {
    const res = await fetch(`${API}/market-groups/${slug}`, { cache: "no-store" });
    if (!res.ok) return null;
    const group = (await res.json()) as MarketGroup;
    group.volume = group.markets.reduce((a, m) => a + Number(m.volume), 0);
    return group;
  } catch {
    return null;
  }
}

export async function getGroupHistory(slug: string): Promise<GroupSeries[]> {
  try {
    const res = await fetch(`${API}/market-groups/${slug}/history`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return data.series ?? [];
  } catch {
    return [];
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
}): Promise<{ jobId: string; resolvedOutcome: "Yes" | "No" }> {
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
}): Promise<{ jobId: string; expectedUsdc: number }> {
  const res = await fetch(`${BROWSER_API}/redeem`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? "redeem failed");
  return data;
}

export async function postGroupResolve(body: {
  groupSlug: string;
  winnerSlug: string;
  accountIndex: number;
}): Promise<{ jobId: string; winnerSlug: string; winnerLabel: string | null }> {
  const res = await fetch(`${BROWSER_API}/market-groups/${body.groupSlug}/resolve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ winnerSlug: body.winnerSlug, accountIndex: body.accountIndex }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? "resolve failed");
  return data;
}

/// Order-book depth for one outcome (browser-side, polled by BookPanel).
export async function getBookSnapshot(slug: string, outcome: string): Promise<BookSnapshot | null> {
  try {
    const res = await fetch(
      `${BROWSER_API}/markets/${slug}/book?outcome=${encodeURIComponent(outcome)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    return (await res.json()) as BookSnapshot;
  } catch {
    return null;
  }
}

export type CreateGroupBody = {
  title: string;
  category: string;
  description?: string;
  imageUrl?: string;
  outcomes: { label: string }[];
  liquidityPerOutcome: number;
  closesAt: string;
  creatorIndex: number;
};

export async function postCreateGroup(
  body: CreateGroupBody,
): Promise<{ jobId: string; kind: "group" | "binary"; slug: string }> {
  const res = await fetch(`${BROWSER_API}/market-groups`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? "creation failed");
  return data;
}

export type JobInfo = {
  id: string;
  type: string;
  status: "PENDING" | "RUNNING" | "CONFIRMED" | "FAILED";
  result?: { progress?: { done: number; total: number; stage: string }; error?: string } & Record<string, unknown>;
};

export async function getJob(jobId: string): Promise<JobInfo | null> {
  try {
    const res = await fetch(`${BROWSER_API}/jobs/${jobId}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as JobInfo;
  } catch {
    return null;
  }
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
