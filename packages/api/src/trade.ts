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
export async function walletSummary(accountIndex: number): Promise<WalletSummary> {
  const chain = await loadChain();
  const user = account(accountIndex).address as Address;
  if (chain.chainId === 0) {
    return { accountIndex, address: user, usdc: 0, positions: [] };
  }
  const userCt = chain.ctAs(0); // reads only — any wallet binding works
  const usdcBal = await chain.usdcAs(0).balanceOf(user);

  const markets = await prisma.market.findMany({ include: { outcomes: true } });

  // Cost basis per outcome: net USDC the user has put in (Σ BUY − Σ SELL).
  // REDEEM rows are excluded — they close a position, not change its cost.
  const userTrades = await prisma.trade.findMany({
    where: { user, side: { in: ["BUY", "SELL"] } },
    select: { outcomeId: true, side: true, usdcAmount: true },
  });
  const netCost = new Map<string, number>();
  for (const t of userTrades) {
    const signed = (t.side === "BUY" ? 1 : -1) * Number(t.usdcAmount);
    netCost.set(t.outcomeId, (netCost.get(t.outcomeId) ?? 0) + signed);
  }

  const positions: WalletSummary["positions"] = [];
  for (const m of markets) {
    for (const o of m.outcomes) {
      const bal = await userCt.balanceOf(user, BigInt(o.tokenId));
      if (bal > 0n) {
        const tokens = Number(formatUnits(bal, 6));
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
    }
  }
  return {
    accountIndex,
    address: user,
    usdc: Number(formatUnits(usdcBal, 6)),
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
