// Trade execution: real on-chain fills against the operator's inventory.
//
// Model (mirrors the S2.3 e2e demo): the user (demo anvil account) is the
// MAKER — the server signs their BUY/SELL order with their demo key — and
// the operator (account 0) is the taker via `CTFExchange.fillOrder`,
// delivering outcome tokens from (BUY) or paying USDC into (SELL) its
// inventory. Every trade is a real transaction on anvil; the DB mirrors the
// result (price impact, volume, trade log, chart point).

import { parseUnits, formatUnits } from "viem";
import { signOrder, Side, SignatureType, type Address, type Order, type OrderDomain } from "@verex/sdk";
import { prisma } from "./db";
import { loadChain, account, makeWalletClient, type ChainCtx } from "./chain";

/// Linear price-impact model: a trade of L USDC moves the price all the way
/// to its bound. Demo-grade market making — replaced by real order books in
/// a later step.
const LIQUIDITY_PARAM = 2_000; // USDC for a full-range move
const PRICE_MIN = 0.02;
const PRICE_MAX = 0.98;

/// Demo faucet: top up a user below this balance during a trade.
const AUTO_FAUCET_USDC = 1_000;

export interface TradeRequest {
  slug: string;
  outcome: "Yes" | "No";
  side: "BUY" | "SELL";
  /// BUY: USDC to spend. SELL: outcome tokens to sell. Human units.
  amount: number;
  /// Demo wallet index 1..9 (0 is the operator).
  accountIndex: number;
}

export interface TradeResult {
  txHash: string;
  side: "BUY" | "SELL";
  outcome: "Yes" | "No";
  usdcAmount: number;
  tokenAmount: number;
  price: number;
  newYesPrice: number;
  faucetMinted: boolean;
}

const isApprovedForAllAbi = [
  {
    name: "isApprovedForAll",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "operator", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

function clampPrice(p: number): number {
  return Math.min(PRICE_MAX, Math.max(PRICE_MIN, Number(p.toFixed(4))));
}

/// New YES price after a trade. Buying YES (or selling NO) pushes YES up;
/// selling YES (or buying NO) pushes it down.
function applyImpact(yesPrice: number, req: TradeRequest, usdcAmount: number): number {
  const k = usdcAmount / LIQUIDITY_PARAM;
  const up = (req.outcome === "Yes") === (req.side === "BUY");
  return clampPrice(up ? yesPrice + k * (1 - yesPrice) : yesPrice - k * yesPrice);
}

export async function executeTrade(req: TradeRequest): Promise<TradeResult> {
  if (req.accountIndex < 1 || req.accountIndex > 9) {
    throw Object.assign(new Error("accountIndex must be 1..9 (0 is the operator)"), { statusCode: 400 });
  }
  if (!(req.amount > 0) || req.amount > 1_000_000) {
    throw Object.assign(new Error("amount must be > 0 and sane"), { statusCode: 400 });
  }

  const chain = await loadChain();
  if (chain.chainId === 0) {
    throw Object.assign(
      new Error("trading is disabled in this environment (no chain configured)"),
      { statusCode: 400 },
    );
  }
  const market = await prisma.market.findUnique({
    where: { slug: req.slug },
    include: { outcomes: true },
  });
  if (!market) throw Object.assign(new Error("market not found"), { statusCode: 404 });
  if (market.status !== "OPEN") {
    throw Object.assign(new Error("market is not open"), { statusCode: 400 });
  }
  const outcome = market.outcomes.find((o) => o.label === req.outcome);
  if (!outcome) throw Object.assign(new Error("outcome not found"), { statusCode: 404 });

  const price = Number(outcome.price);
  const tokenId = BigInt(outcome.tokenId);
  const user = account(req.accountIndex).address as Address;
  const userWallet = makeWalletClient(req.accountIndex);
  const userUsdc = chain.usdcAs(req.accountIndex);
  const userCt = chain.ctAs(req.accountIndex);
  const operatorExchange = chain.exchangeAs(0);

  // Amounts (6-decimals fixed point, bigint math)
  let usdcE6: bigint;
  let tokenE6: bigint;
  const priceE6 = parseUnits(price.toFixed(6), 6);
  if (req.side === "BUY") {
    usdcE6 = parseUnits(req.amount.toFixed(6), 6);
    tokenE6 = (usdcE6 * 1_000_000n) / priceE6;
  } else {
    tokenE6 = parseUnits(req.amount.toFixed(6), 6);
    usdcE6 = (tokenE6 * priceE6) / 1_000_000n;
  }
  if (usdcE6 === 0n || tokenE6 === 0n) {
    throw Object.assign(new Error("amount too small"), { statusCode: 400 });
  }

  let faucetMinted = false;

  if (req.side === "BUY") {
    // Demo faucet: keep the flow one-click on a toy chain.
    const balance = await userUsdc.balanceOf(user);
    if (balance < usdcE6) {
      await chain.usdcAs(0).mint(user, usdcE6 + parseUnits(String(AUTO_FAUCET_USDC), 6));
      faucetMinted = true;
    }
    const allowance = await userUsdc.allowance(user, chain.exchangeAddr);
    if (allowance < usdcE6) {
      await userUsdc.approve(chain.exchangeAddr, parseUnits("1000000000", 6));
    }
  } else {
    const tokenBal = await userCt.balanceOf(user, tokenId);
    if (tokenBal < tokenE6) {
      throw Object.assign(
        new Error(`insufficient ${req.outcome} balance (${formatUnits(tokenBal, 6)})`),
        { statusCode: 400 },
      );
    }
    const approved = await chain.publicClient.readContract({
      address: chain.ctfAddr,
      abi: isApprovedForAllAbi,
      functionName: "isApprovedForAll",
      args: [user, chain.exchangeAddr],
    });
    if (!approved) await userCt.setApprovalForAll(chain.exchangeAddr, true);
  }

  // Build + sign the user's maker order, then fill it as operator.
  const order: Order = {
    salt: BigInt(Math.floor(Math.random() * 1e15)),
    maker: user,
    signer: user,
    taker: "0x0000000000000000000000000000000000000000",
    tokenId,
    makerAmount: req.side === "BUY" ? usdcE6 : tokenE6,
    takerAmount: req.side === "BUY" ? tokenE6 : usdcE6,
    expiration: 0n,
    nonce: 0n,
    feeRateBps: 0n,
    side: req.side === "BUY" ? Side.BUY : Side.SELL,
    signatureType: SignatureType.EOA,
    signature: "0x",
  };
  const domain: OrderDomain = { chainId: chain.chainId, verifyingContract: chain.exchangeAddr };
  const signed = await signOrder(order, domain, userWallet);
  const txHash = await operatorExchange.fillOrder(signed, order.makerAmount);

  // Mirror into the DB: price impact, volume, trade log, chart point.
  const usdcAmount = Number(formatUnits(usdcE6, 6));
  const tokenAmount = Number(formatUnits(tokenE6, 6));
  const newYesPrice = applyImpact(
    req.outcome === "Yes" ? price : Number((1 - price).toFixed(4)),
    req,
    usdcAmount,
  );

  const yesOutcome = market.outcomes.find((o) => o.label === "Yes")!;
  const noOutcome = market.outcomes.find((o) => o.label === "No")!;
  await prisma.$transaction([
    prisma.outcome.update({ where: { id: yesOutcome.id }, data: { price: newYesPrice } }),
    prisma.outcome.update({
      where: { id: noOutcome.id },
      data: { price: Number((1 - newYesPrice).toFixed(4)) },
    }),
    prisma.market.update({
      where: { id: market.id },
      data: { volume: { increment: usdcAmount } },
    }),
    prisma.trade.create({
      data: {
        marketId: market.id,
        outcomeId: outcome.id,
        user,
        side: req.side,
        usdcAmount,
        tokenAmount,
        price,
        txHash,
      },
    }),
    prisma.pricePoint.create({ data: { marketId: market.id, price: newYesPrice } }),
  ]);

  return {
    txHash,
    side: req.side,
    outcome: req.outcome,
    usdcAmount,
    tokenAmount,
    price,
    newYesPrice,
    faucetMinted,
  };
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
