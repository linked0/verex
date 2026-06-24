// Fetch helpers for the Verex API (packages/api). Prices/volumes arrive as strings
// (Prisma Decimal serializes to string) — callers convert with Number().

export type Outcome = {
  id: string;
  label: string;
  price: string; // 0..1 implied probability
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
  outcomes: Outcome[];
};

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export async function getMarkets(category?: string): Promise<Market[]> {
  const url =
    category && category !== "All"
      ? `${API}/markets?category=${encodeURIComponent(category)}`
      : `${API}/markets`;
  try {
    const res = await fetch(url, { cache: "no-store" });
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

export const pct = (price: string | number) => Math.round(Number(price) * 100);
export const usd = (v: string | number) => `$${Number(v).toLocaleString("en-US")}`;
