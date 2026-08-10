// Wallet reads (portfolio, history) + the demo faucet. Trade execution
// itself lives in book.ts — the CLOB matching engine — since design rev 2
// (jul-28); the old direct-fillOrder flow is gone.

import { parseUnits, formatUnits } from "viem";
import type { Address } from "@verex/sdk";
import { prisma } from "./db";
import { loadChain, account } from "./chain";

/// Demo faucet: top up a user below this balance during a trade.
const AUTO_FAUCET_USDC = 1_000;

/// Legacy request shape still accepted by POST /trade — adapted to a
/// market (IOC) order against the book.
export interface TradeRequest {
  slug: string;
  outcome: "Yes" | "No";
  side: "BUY" | "SELL";
  /// BUY: USDC to spend. SELL: outcome tokens to sell. Human units.
  amount: number;
  /// Demo wallet index 1..9 (0 is the operator).
  accountIndex: number;
}

export interface WalletSummary {
  accountIndex: number;
  address: string;
  usdc: number;
  positions: {
    slug: string;
    title: string;
    outcome: string;
    tokens: number;
    price: number;
    value: number;
    /// Net USDC spent on this outcome (Σ BUY − Σ SELL) — cost basis for P&L.
    costBasis: number;
    /// value − costBasis. For resolved markets value uses the payout price
    /// (1 or 0), so this is the final profit/loss before redemption.
    pnl: number;
    marketStatus: string;
    /// RESOLVED markets only: did this outcome win? (null while OPEN)
    won: boolean | null;
  }[];
}

/// Balance + per-market outcome-token positions, read straight from chain.
/// Index 0 (the operator) gets address + balance only — its token holdings
/// are MM inventory across every market, not a portfolio.
export async function walletSummary(accountIndex: number): Promise<WalletSummary> {
  const chain = await loadChain();
  const user = account(accountIndex).address as Address;
  if (chain.chainId === 0) {
    return { accountIndex, address: user, usdc: 0, positions: [] };
  }
  const userCt = chain.ctAs(0); // reads only — any wallet binding works
  const usdcBal = await chain.usdcAs(0).balanceOf(user);
  if (accountIndex === 0) {
    return { accountIndex, address: user, usdc: Number(formatUnits(usdcBal, 6)), positions: [] };
  }

  const markets = await prisma.market.findMany({ include: { outcomes: true } });

  // Cost basis per outcome: net USDC the user has put in (Σ BUY − Σ SELL).
  // REDEEM rows are excluded — they close a position, not change its cost.
  // FAILED rows too: a reverted settlement moved nothing on either side.
  const userTrades = await prisma.trade.findMany({
    where: { user, side: { in: ["BUY", "SELL"] }, settlement: { not: "FAILED" } },
    select: { outcomeId: true, side: true, usdcAmount: true, tokenAmount: true, settlement: true },
  });
  const netCost = new Map<string, number>();
  // PENDING fills, netted into what the chain reports. The book fills a trade
  // instantly but SETTLE_MATCH mines a block later; in that window the chain
  // still shows pre-trade balances while cost basis (DB) already moved — the
  // portfolio showed "bought $100, worth $7" right after a fair fill. Same
  // read-your-own-writes race as the MM ladder (mm.unsettledOperatorSold), and
  // the same fix: count what is in flight. CONFIRMED is already in balanceOf.
  const pendingTokens = new Map<string, number>();
  let pendingUsdc = 0;
  for (const t of userTrades) {
    const sign = t.side === "BUY" ? 1 : -1;
    netCost.set(t.outcomeId, (netCost.get(t.outcomeId) ?? 0) + sign * Number(t.usdcAmount));
    if (t.settlement === "PENDING") {
      pendingTokens.set(t.outcomeId, (pendingTokens.get(t.outcomeId) ?? 0) + sign * Number(t.tokenAmount));
      pendingUsdc -= sign * Number(t.usdcAmount);
    }
  }

  // Every outcome of every market in ONE call. One-at-a-time cost a network
  // round-trip each — ~5s for a seeded environment against a remote node, and
  // the whole portfolio waits on it.
  const slots = markets.flatMap((m) => m.outcomes.map((o) => ({ m, o })));
  const balances = await userCt.balanceOfBatch(
    user,
    slots.map((s) => BigInt(s.o.tokenId)),
  );

  const positions: WalletSummary["positions"] = [];
  for (const [i, { m, o }] of slots.entries()) {
    const bal = balances[i] ?? 0n;
    // Chain balance ± in-flight fills. Clamped at zero: a pending SELL of the
    // whole position must show 0, never a negative holding. Note the include
    // test runs on the ADJUSTED number — a brand-new position that exists only
    // as a pending buy must appear, even though the chain still says 0.
    const tokens = Math.max(0, Number(formatUnits(bal, 6)) + (pendingTokens.get(o.id) ?? 0));
    if (tokens < 0.000001) continue;
    const price = Number(o.price);
    const value = Number((tokens * price).toFixed(2));
    const costBasis = Number((netCost.get(o.id) ?? 0).toFixed(2));
    positions.push({
      slug: m.slug,
      title: m.title,
      outcome: o.label,
      tokens,
      price,
      value,
      costBasis,
      pnl: Number((value - costBasis).toFixed(2)),
      marketStatus: m.status,
      won: m.status === "RESOLVED" ? m.resolvedOutcomeId === o.id : null,
    });
  }
  return {
    accountIndex,
    address: user,
    // Same adjustment for cash: a pending BUY's USDC has left the wallet as
    // far as the user is concerned, even though the transfer settles later.
    usdc: Math.max(0, Number(formatUnits(usdcBal, 6)) + pendingUsdc),
    positions,
  };
}

export interface HistoryRow {
  id: string;
  side: "BUY" | "SELL" | "REDEEM";
  marketSlug: string;
  marketTitle: string;
  outcome: string;
  usdcAmount: number;
  tokenAmount: number;
  price: number;
  txHash: string | null; // null while on-chain settlement is pending
  settlement: "PENDING" | "CONFIRMED" | "FAILED";
  createdAt: string;
  /// REDEEM rows only: usdcAmount − net cost of the outcome (Σ BUY − Σ SELL)
  /// at redemption — the realized win/loss of the closed position.
  realizedPnl?: number;
}

/// The wallet's full activity feed (buys, sells, redemptions), newest first.
export async function walletHistory(accountIndex: number): Promise<HistoryRow[]> {
  const user = account(accountIndex).address as Address;
  const trades = await prisma.trade.findMany({
    where: { user },
    orderBy: { createdAt: "desc" },
    include: { market: { select: { slug: true, title: true } }, outcome: { select: { id: true, label: true } } },
  });

  // Net cost per outcome from BUY/SELL rows, for realized P&L on REDEEM rows.
  const netCost = new Map<string, number>();
  for (const t of trades) {
    if (t.side === "REDEEM") continue;
    const signed = (t.side === "BUY" ? 1 : -1) * Number(t.usdcAmount);
    netCost.set(t.outcome.id, (netCost.get(t.outcome.id) ?? 0) + signed);
  }

  return trades.map((t) => ({
    id: t.id,
    side: t.side,
    marketSlug: t.market.slug,
    marketTitle: t.market.title,
    outcome: t.outcome.label,
    usdcAmount: Number(t.usdcAmount),
    tokenAmount: Number(t.tokenAmount),
    price: Number(t.price),
    txHash: t.txHash,
    settlement: t.settlement,
    createdAt: t.createdAt.toISOString(),
    ...(t.side === "REDEEM"
      ? { realizedPnl: Number((Number(t.usdcAmount) - (netCost.get(t.outcome.id) ?? 0)).toFixed(2)) }
      : {}),
  }));
}

/// Explicit faucet (demo): mint USDC to a demo wallet.
export async function faucet(accountIndex: number, amount = AUTO_FAUCET_USDC): Promise<{ address: string; usdc: number }> {
  const chain = await loadChain();
  const user = account(accountIndex).address as Address;
  if (chain.chainId === 0) return { address: user, usdc: 0 };
  await chain.usdcAs(0).mint(user, parseUnits(String(amount), 6));
  const bal = await chain.usdcAs(0).balanceOf(user);
  return { address: user, usdc: Number(formatUnits(bal, 6)) };
}
