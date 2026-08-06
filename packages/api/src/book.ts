// The CLOB: an off-chain order book with on-chain settlement.
//
// Placement + matching happen in the DB (price-time priority, row-locked,
// instant). Every matched pair settles asynchronously on-chain via
// CTFExchange.matchOrders in a SETTLE_MATCH ChainJob — the taker sub-order
// is signed per fill at the maker's exact price ratio, so the contract's
// crossing checks pass and chain movements mirror the DB to within 1e-6
// dust. Resting limit orders are signed at placement (they act as makers
// later); IOC/market taker orders never rest and are signed at settlement.

import { randomBytes } from "node:crypto";
import { parseUnits, formatUnits } from "viem";
import type { Prisma } from "@prisma/client";
import {
  hashOrder,
  signOrder,
  Side,
  SignatureType,
  type Address,
  type Order as SignedOrder,
  type OrderDomain,
} from "@verex/sdk";
import { prisma } from "./db";
import { loadChain, account, makeWalletClient } from "./chain";
import { enqueueJob, registerHandler } from "./worker";

export const ORDER_PRICE_MIN = 0.01;
export const ORDER_PRICE_MAX = 0.99;
/// Market (IOC) orders walk the book at most this far past the best
/// opposite level — a thin-book guard, not a real risk limit.
const MARKET_SLIPPAGE_CAP = 0.1;
/// Demo faucet: top up a buyer below the order's notional (same UX as the
/// old /trade flow).
const AUTO_FAUCET_USDC = 1_000;

const E6 = 1_000_000n;
const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;

export interface PlaceOrderRequest {
  slug: string;
  outcome: string; // outcome label ("Yes" | "No")
  side: "BUY" | "SELL";
  accountIndex: number;
  type: "market" | "limit";
  /// market BUY: USDC budget. market SELL: tokens. limit: tokens.
  amount: number;
  /// limit orders only: USDC per share, 0.01..0.99
  price?: number;
}

export interface FillSummary {
  price: number;
  tokens: number;
  usdc: number;
}

export interface PlaceOrderResult {
  orderId: string;
  status: string;
  side: "BUY" | "SELL";
  outcome: string;
  fills: FillSummary[];
  totalTokens: number;
  totalUsdc: number;
  avgPrice: number | null;
  restingSize: number; // limit remainder now resting in the book
  newYesPrice: number;
  jobId: string | null; // SETTLE_MATCH job when there were fills
  settlement: "PENDING" | "NONE";
  faucetMinted: boolean;
}

interface FillPlan {
  makerOrderId: string;
  makerIndex: number;
  maker: string;
  makerIsMM: boolean;
  price: number;
  tokensE6: bigint;
  usdcE6: bigint;
  /// Fill amount in the maker order's own makerAmount units (tokens for a
  /// SELL maker, USDC for a BUY maker) — what matchOrders wants.
  makerFillE6: bigint;
}

/// Called after a user placement produced fills: (marketId, outcomeLabel,
/// lastFillPrice). Wired by mm.ts (re-quote + group renormalization) —
/// injected as a hook to avoid a book↔mm import cycle. Never fired for MM
/// placements, so the MM re-centering can't recurse.
type AfterFillHook = (marketId: string, outcomeLabel: string, lastPrice: number) => Promise<void>;
let afterFillHook: AfterFillHook | null = null;
export function setAfterFillHook(hook: AfterFillHook) {
  afterFillHook = hook;
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

function httpError(message: string, statusCode: number): Error {
  return Object.assign(new Error(message), { statusCode });
}

function randomSalt(): bigint {
  return BigInt("0x" + randomBytes(8).toString("hex"));
}

/// The stored JSON shape of a signed order (bigints as strings).
type StoredOrder = Record<keyof SignedOrder, string> & { side: number; signatureType: number };

function serializeOrder(o: SignedOrder): Prisma.InputJsonObject {
  return {
    salt: o.salt.toString(),
    maker: o.maker,
    signer: o.signer,
    taker: o.taker,
    tokenId: o.tokenId.toString(),
    makerAmount: o.makerAmount.toString(),
    takerAmount: o.takerAmount.toString(),
    expiration: o.expiration.toString(),
    nonce: o.nonce.toString(),
    feeRateBps: o.feeRateBps.toString(),
    side: o.side,
    signatureType: o.signatureType,
    signature: o.signature,
  };
}

function deserializeOrder(json: unknown): SignedOrder {
  const s = json as StoredOrder;
  return {
    salt: BigInt(s.salt),
    maker: s.maker as Address,
    signer: s.signer as Address,
    taker: s.taker as Address,
    tokenId: BigInt(s.tokenId),
    makerAmount: BigInt(s.makerAmount),
    takerAmount: BigInt(s.takerAmount),
    expiration: BigInt(s.expiration),
    nonce: BigInt(s.nonce),
    feeRateBps: BigInt(s.feeRateBps),
    side: s.side as SignedOrder["side"],
    signatureType: s.signatureType as SignedOrder["signatureType"],
    signature: s.signature as SignedOrder["signature"],
  };
}

/// Build + sign an EIP-712 order for `index`'s wallet. `tokens`/`usdc` are
/// E6 fixed-point. Local crypto only — no RPC.
async function buildSignedOrder(args: {
  index: number;
  tokenId: bigint;
  side: "BUY" | "SELL";
  tokensE6: bigint;
  usdcE6: bigint;
  chainId: number;
  exchangeAddr: Address;
}): Promise<SignedOrder> {
  const user = account(args.index).address as Address;
  const order: SignedOrder = {
    salt: randomSalt(),
    maker: user,
    signer: user,
    taker: "0x0000000000000000000000000000000000000000",
    tokenId: args.tokenId,
    makerAmount: args.side === "BUY" ? args.usdcE6 : args.tokensE6,
    takerAmount: args.side === "BUY" ? args.tokensE6 : args.usdcE6,
    expiration: 0n,
    nonce: 0n,
    feeRateBps: 0n,
    side: args.side === "BUY" ? Side.BUY : Side.SELL,
    signatureType: SignatureType.EOA,
    signature: "0x",
  };
  const domain: OrderDomain = { chainId: args.chainId, verifyingContract: args.exchangeAddr };
  return signOrder(order, domain, makeWalletClient(args.index));
}

/// Ensure the wallet can actually settle this order later: faucet+approve
/// for BUY notional, token balance + operator approval for SELL. Chain ops
/// — happens BEFORE the matching transaction. Pre-warmed wallets (#1-5)
/// skip everything but two fast reads.
async function ensureFunds(args: {
  index: number;
  side: "BUY" | "SELL";
  usdcE6: bigint;
  tokensE6: bigint;
  tokenId: bigint;
  outcomeLabel: string;
}): Promise<boolean> {
  const chain = await loadChain();
  const user = account(args.index).address as Address;
  let faucetMinted = false;
  if (args.side === "BUY") {
    const usdc = chain.usdcAs(args.index);
    const balance = await usdc.balanceOf(user);
    if (balance < args.usdcE6) {
      await chain.usdcAs(0).mint(user, args.usdcE6 + parseUnits(String(AUTO_FAUCET_USDC), 6));
      faucetMinted = true;
    }
    const allowance = await usdc.allowance(user, chain.exchangeAddr);
    if (allowance < args.usdcE6) {
      await usdc.approve(chain.exchangeAddr, parseUnits("1000000000", 6));
    }
  } else {
    const bal = await chain.ctAs(0).balanceOf(user, args.tokenId);
    if (bal < args.tokensE6) {
      throw httpError(
        `insufficient ${args.outcomeLabel} balance (${formatUnits(bal, 6)})`,
        400,
      );
    }
    const approved = await chain.publicClient.readContract({
      address: chain.ctfAddr,
      abi: isApprovedForAllAbi,
      functionName: "isApprovedForAll",
      args: [user, chain.exchangeAddr],
    });
    if (!approved) {
      await chain.ctAs(args.index).setApprovalForAll(chain.exchangeAddr, true);
    }
  }
  return faucetMinted;
}

export async function placeOrder(req: PlaceOrderRequest): Promise<PlaceOrderResult> {
  const isMM = req.accountIndex === 0;
  if (!isMM && (req.accountIndex < 1 || req.accountIndex > 9)) {
    throw httpError("accountIndex must be 1..9 (0 is the operator MM)", 400);
  }
  if (!(req.amount > 0) || req.amount > 1_000_000) throw httpError("amount must be > 0 and sane", 400);
  if (req.type === "limit") {
    if (req.price === undefined || req.price < ORDER_PRICE_MIN || req.price > ORDER_PRICE_MAX) {
      throw httpError(`limit price must be ${ORDER_PRICE_MIN}..${ORDER_PRICE_MAX}`, 400);
    }
  }

  const chain = await loadChain();
  if (chain.chainId === 0) throw httpError("trading is disabled in this environment (no chain configured)", 400);

  const market = await prisma.market.findUnique({
    where: { slug: req.slug },
    include: { outcomes: true },
  });
  if (!market) throw httpError("market not found", 404);
  if (market.status !== "OPEN") throw httpError("market is not open", 400);
  const outcome = market.outcomes.find((o) => o.label === req.outcome);
  if (!outcome) throw httpError("outcome not found", 404);
  const tokenId = BigInt(outcome.tokenId);
  const user = account(req.accountIndex).address as Address;

  // Worst-case notional for the funds check (market BUY: the budget itself).
  const limitPrice = req.type === "limit" ? req.price! : null;
  const budgetE6 =
    req.side === "BUY"
      ? req.type === "market"
        ? parseUnits(req.amount.toFixed(6), 6)
        : ceilDiv(parseUnits(req.amount.toFixed(6), 6) * parseUnits(limitPrice!.toFixed(6), 6), E6)
      : 0n;
  const sizeE6 = req.side === "SELL" || req.type === "limit" ? parseUnits(req.amount.toFixed(6), 6) : 0n;
  // The operator MM is pre-approved and solvent by construction (seed mints
  // its buffer + inventory) — skipping the per-order chain reads keeps a
  // 20-order re-quote cheap.
  const faucetMinted = isMM
    ? false
    : await ensureFunds({
        index: req.accountIndex,
        side: req.side,
        usdcE6: budgetE6,
        tokensE6: sizeE6,
        tokenId,
        outcomeLabel: outcome.label,
      });

  // ── Match + persist, all inside one row-locked transaction ─────────────
  const result = await prisma.$transaction(async (tx) => {
    // Serialize matching per market.
    await tx.$queryRaw`SELECT id FROM "Market" WHERE id = ${market.id} FOR UPDATE`;

    const opposite = req.side === "BUY" ? "SELL" : "BUY";
    // Price bound for crossing: limit price, or best-opposite ± slippage cap
    // for market orders (resolved after we see the book).
    const lockedIds = (await tx.$queryRaw`
      SELECT id FROM "Order"
      WHERE "outcomeId" = ${outcome.id}
        AND side = ${opposite}::"OrderSide"
        AND status IN ('OPEN', 'PARTIALLY_FILLED')
        AND maker <> ${user}
      FOR UPDATE
    `) as { id: string }[];
    const makers = lockedIds.length
      ? await tx.order.findMany({
          where: { id: { in: lockedIds.map((r) => r.id) } },
          orderBy: [{ price: req.side === "BUY" ? "asc" : "desc" }, { createdAt: "asc" }],
        })
      : [];

    const bestOpposite = makers.length ? Number(makers[0]!.price) : null;
    const priceBound =
      limitPrice ??
      (bestOpposite === null
        ? null
        : req.side === "BUY"
          ? Math.min(ORDER_PRICE_MAX, bestOpposite + MARKET_SLIPPAGE_CAP)
          : Math.max(ORDER_PRICE_MIN, bestOpposite - MARKET_SLIPPAGE_CAP));

    // Walk the book.
    const fills: FillPlan[] = [];
    let tokensLeftE6 = req.side === "BUY" && req.type === "market" ? null : sizeE6; // null = budget-driven
    let budgetLeftE6 = budgetE6;
    for (const m of makers) {
      const mPrice = Number(m.price);
      if (priceBound !== null && (req.side === "BUY" ? mPrice > priceBound : mPrice < priceBound)) break;
      const availE6 = parseUnits(Number(m.size).toFixed(6), 6) - parseUnits(Number(m.sizeFilled).toFixed(6), 6);
      if (availE6 <= 0n) continue;
      const signed = deserializeOrder(m.signedOrder);
      // Maker's exact signed ratio — used so the contract's math agrees.
      const mMakerAmt = signed.makerAmount;
      const mTakerAmt = signed.takerAmount;

      let fillTokensE6: bigint;
      if (tokensLeftE6 === null) {
        // Budget-driven market BUY: how many tokens does the remaining
        // budget buy at this level (maker SELL: tokens = usdc * maker/taker)?
        const maxTokens = (budgetLeftE6 * mMakerAmt) / mTakerAmt;
        fillTokensE6 = maxTokens < availE6 ? maxTokens : availE6;
      } else {
        fillTokensE6 = tokensLeftE6 < availE6 ? tokensLeftE6 : availE6;
      }
      if (fillTokensE6 <= 0n) break;

      let usdcE6: bigint;
      let makerFillE6: bigint;
      if (req.side === "BUY") {
        // Maker is SELL (makerAmount = tokens): taker pays ceil at the
        // maker's ratio so the on-chain crossing check passes.
        usdcE6 = ceilDiv(fillTokensE6 * mTakerAmt, mMakerAmt);
        makerFillE6 = fillTokensE6;
      } else {
        // Maker is BUY (makerAmount = USDC): taker receives floor at the
        // maker's ratio — never demand more than the maker signed for.
        usdcE6 = (fillTokensE6 * mMakerAmt) / mTakerAmt;
        makerFillE6 = usdcE6;
      }
      if (usdcE6 <= 0n) break;

      fills.push({
        makerOrderId: m.id,
        makerIndex: m.makerIndex,
        maker: m.maker,
        makerIsMM: m.isMM,
        price: mPrice,
        tokensE6: fillTokensE6,
        usdcE6,
        makerFillE6,
      });
      if (tokensLeftE6 === null) budgetLeftE6 -= usdcE6;
      else tokensLeftE6 -= fillTokensE6;
      if (tokensLeftE6 !== null && tokensLeftE6 <= 0n) break;
      if (tokensLeftE6 === null && budgetLeftE6 <= 0n) break;
    }

    const totalTokensE6 = fills.reduce((a, f) => a + f.tokensE6, 0n);
    const totalUsdcE6 = fills.reduce((a, f) => a + f.usdcE6, 0n);
    const totalTokens = Number(formatUnits(totalTokensE6, 6));
    const totalUsdc = Number(formatUnits(totalUsdcE6, 6));

    // The taker's own order row.
    const restE6 = req.type === "limit" ? sizeE6 - totalTokensE6 : 0n;
    const takerSize = req.type === "limit" ? Number(formatUnits(sizeE6, 6)) : totalTokens;
    const takerStatus =
      req.type === "limit"
        ? restE6 <= 0n
          ? "FILLED"
          : totalTokensE6 > 0n
            ? "PARTIALLY_FILLED"
            : "OPEN"
        : totalTokensE6 > 0n
          ? "FILLED"
          : "CANCELLED"; // IOC with nothing to cross

    // Resting limit orders get signed now — they'll act as makers later.
    let signedJson: Prisma.InputJsonObject | undefined;
    let orderHash: string | undefined;
    if (req.type === "limit") {
      const usdcAtLimitE6 =
        req.side === "BUY"
          ? ceilDiv(sizeE6 * parseUnits(limitPrice!.toFixed(6), 6), E6)
          : (sizeE6 * parseUnits(limitPrice!.toFixed(6), 6)) / E6;
      const signed = await buildSignedOrder({
        index: req.accountIndex,
        tokenId,
        side: req.side,
        tokensE6: sizeE6,
        usdcE6: usdcAtLimitE6,
        chainId: chain.chainId,
        exchangeAddr: chain.exchangeAddr,
      });
      signedJson = serializeOrder(signed);
      orderHash = hashOrder(signed, { chainId: chain.chainId, verifyingContract: chain.exchangeAddr });
    }

    const takerOrder = await tx.order.create({
      data: {
        marketId: market.id,
        outcomeId: outcome.id,
        maker: user,
        makerIndex: req.accountIndex,
        side: req.side,
        price: limitPrice ?? (fills.length ? fills[fills.length - 1]!.price : 0),
        size: takerSize || Number(formatUnits(sizeE6, 6)),
        sizeFilled: totalTokens,
        status: takerStatus,
        isMM,
        signedOrder: signedJson,
        orderHash,
      },
    });

    // Apply fills to makers + write the trade feed.
    const tradeIdsByFill: string[][] = [];
    for (const f of fills) {
      const m = await tx.order.findUniqueOrThrow({ where: { id: f.makerOrderId } });
      const newFilled = Number(m.sizeFilled) + Number(formatUnits(f.tokensE6, 6));
      const filledOut = newFilled >= Number(m.size) - 1e-6;
      await tx.order.update({
        where: { id: f.makerOrderId },
        data: { sizeFilled: newFilled, status: filledOut ? "FILLED" : "PARTIALLY_FILLED" },
      });

      const ids: string[] = [];
      const takerTrade = await tx.trade.create({
        data: {
          marketId: market.id,
          outcomeId: outcome.id,
          user,
          side: req.side,
          usdcAmount: Number(formatUnits(f.usdcE6, 6)),
          tokenAmount: Number(formatUnits(f.tokensE6, 6)),
          price: f.price,
          settlement: "PENDING",
          takerOrderId: takerOrder.id,
          makerOrderId: f.makerOrderId,
        },
      });
      ids.push(takerTrade.id);
      if (!f.makerIsMM) {
        // The maker is a demo user — mirror the fill so their cost basis works.
        const makerTrade = await tx.trade.create({
          data: {
            marketId: market.id,
            outcomeId: outcome.id,
            user: f.maker,
            side: req.side === "BUY" ? "SELL" : "BUY",
            usdcAmount: Number(formatUnits(f.usdcE6, 6)),
            tokenAmount: Number(formatUnits(f.tokensE6, 6)),
            price: f.price,
            settlement: "PENDING",
            takerOrderId: takerOrder.id,
            makerOrderId: f.makerOrderId,
          },
        });
        ids.push(makerTrade.id);
      }
      tradeIdsByFill.push(ids);
    }

    // Display price: last fill price on this outcome; complement mirrors.
    // (The MM re-quote refines this to the renormalized book mid.)
    let newYesPrice = Number(market.outcomes.find((o) => o.label === "Yes")?.price ?? 0.5);
    if (fills.length > 0) {
      const lastPrice = fills[fills.length - 1]!.price;
      const yesPrice = outcome.label === "Yes" ? lastPrice : Number((1 - lastPrice).toFixed(6));
      const other = market.outcomes.find((o) => o.id !== outcome.id);
      await tx.outcome.update({ where: { id: outcome.id }, data: { price: lastPrice } });
      if (other) {
        await tx.outcome.update({ where: { id: other.id }, data: { price: Number((1 - lastPrice).toFixed(6)) } });
      }
      await tx.market.update({ where: { id: market.id }, data: { volume: { increment: totalUsdc } } });
      // Deliberately NO PricePoint here. The chart is a probability series, and
      // a fill price is not this market's probability — it is one rung on the
      // operator's ladder, which a large order walks well past. The re-quote
      // below writes the point instead, for this market and for every sibling
      // the trade moved (a group member's price can change with no fill of its
      // own, so fills cannot be the source of the series anyway).
      newYesPrice = yesPrice;
    }

    return { takerOrder, fills, tradeIdsByFill, totalTokens, totalUsdc, newYesPrice };
  });

  // Re-quote the MM around the traded price (and renormalize the group's
  // centers) — user fills only, so the MM's own placements can't recurse.
  if (!isMM && result.fills.length > 0 && afterFillHook) {
    const lastPrice = result.fills[result.fills.length - 1]!.price;
    try {
      await afterFillHook(market.id, outcome.label, lastPrice);
      // The re-quote is what sets the new price, so report that rather than the
      // fill — otherwise this response disagrees with the page the moment it
      // refreshes. Falls back to the fill price if the hook failed below.
      const yes = await prisma.outcome.findFirst({
        where: { marketId: market.id, label: "Yes" },
        select: { price: true },
      });
      if (yes) result.newYesPrice = Number(yes.price);
    } catch (e) {
      console.error(`after-fill re-quote failed for ${market.slug}:`, e);
    }
  }

  // Queue on-chain settlement for the fills (outside the DB transaction —
  // the job row itself is the durable record).
  let jobId: string | null = null;
  if (result.fills.length > 0) {
    jobId = await enqueueJob("SETTLE_MATCH", {
      takerOrderId: result.takerOrder.id,
      takerIndex: req.accountIndex,
      takerSide: req.side,
      tokenId: outcome.tokenId,
      marketId: market.id,
      fills: result.fills.map((f, i) => ({
        makerOrderId: f.makerOrderId,
        tokensE6: f.tokensE6.toString(),
        usdcE6: f.usdcE6.toString(),
        makerFillE6: f.makerFillE6.toString(),
        tradeIds: result.tradeIdsByFill[i]!,
      })),
    });
  }

  return {
    orderId: result.takerOrder.id,
    status: result.takerOrder.status,
    side: req.side,
    outcome: outcome.label,
    fills: result.fills.map((f) => ({
      price: f.price,
      tokens: Number(formatUnits(f.tokensE6, 6)),
      usdc: Number(formatUnits(f.usdcE6, 6)),
    })),
    totalTokens: result.totalTokens,
    totalUsdc: result.totalUsdc,
    avgPrice: result.totalTokens > 0 ? Number((result.totalUsdc / result.totalTokens).toFixed(4)) : null,
    restingSize:
      result.takerOrder.status === "OPEN" || result.takerOrder.status === "PARTIALLY_FILLED"
        ? Number(result.takerOrder.size) - Number(result.takerOrder.sizeFilled)
        : 0,
    newYesPrice: result.newYesPrice,
    jobId,
    settlement: result.fills.length > 0 ? "PENDING" : "NONE",
    faucetMinted,
  };
}

/// Cancel the unfilled remainder of one of the caller's resting orders.
/// DB-only ("lazy" cancel): the operator is the only settler, so a
/// DB-cancelled order can never reach the chain.
export async function cancelOpenOrder(orderId: string, accountIndex: number): Promise<{ orderId: string; status: string }> {
  const user = account(accountIndex).address as Address;
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw httpError("order not found", 404);
  if (order.maker !== user) throw httpError("not your order", 403);
  if (order.status !== "OPEN" && order.status !== "PARTIALLY_FILLED") {
    throw httpError(`order is ${order.status}`, 400);
  }
  const updated = await prisma.order.update({ where: { id: orderId }, data: { status: "CANCELLED" } });
  return { orderId: updated.id, status: updated.status };
}

export interface BookLevel {
  price: number;
  size: number;
}

export interface BookSnapshot {
  outcome: string;
  bids: BookLevel[]; // descending price
  asks: BookLevel[]; // ascending price
  mid: number | null;
}

/// Aggregated depth for one outcome (top `depth` levels per side).
export async function getBook(slug: string, outcomeLabel: string, depth = 10): Promise<BookSnapshot> {
  const market = await prisma.market.findUnique({
    where: { slug },
    include: { outcomes: true },
  });
  if (!market) throw httpError("market not found", 404);
  const outcome = market.outcomes.find((o) => o.label === outcomeLabel);
  if (!outcome) throw httpError("outcome not found", 404);

  const open = await prisma.order.findMany({
    where: { outcomeId: outcome.id, status: { in: ["OPEN", "PARTIALLY_FILLED"] } },
    select: { side: true, price: true, size: true, sizeFilled: true },
  });
  const levels = (side: "BUY" | "SELL") => {
    const byPrice = new Map<number, number>();
    for (const o of open) {
      if (o.side !== side) continue;
      const remaining = Number(o.size) - Number(o.sizeFilled);
      if (remaining <= 0) continue;
      const p = Number(o.price);
      byPrice.set(p, (byPrice.get(p) ?? 0) + remaining);
    }
    const sorted = [...byPrice.entries()]
      .map(([price, size]) => ({ price, size: Number(size.toFixed(2)) }))
      .sort((a, b) => (side === "BUY" ? b.price - a.price : a.price - b.price));
    return sorted.slice(0, depth);
  };
  const bids = levels("BUY");
  const asks = levels("SELL");
  const mid =
    bids.length && asks.length ? Number(((bids[0]!.price + asks[0]!.price) / 2).toFixed(4)) : null;
  return { outcome: outcome.label, bids, asks, mid };
}

/// The caller's open (resting) orders, optionally scoped to one market.
export async function openOrders(accountIndex: number, slug?: string) {
  const user = account(accountIndex).address as Address;
  return prisma.order.findMany({
    where: {
      maker: user,
      status: { in: ["OPEN", "PARTIALLY_FILLED"] },
      ...(slug ? { market: { slug } } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { market: { select: { slug: true, title: true } }, outcome: { select: { label: true } } },
  });
}

// ── SETTLE_MATCH: on-chain settlement of matched pairs ────────────────────

interface SettlePayload {
  takerOrderId: string;
  takerIndex: number;
  takerSide: "BUY" | "SELL";
  tokenId: string;
  marketId: string;
  fills: {
    makerOrderId: string;
    tokensE6: string;
    usdcE6: string;
    makerFillE6: string;
    tradeIds: string[];
  }[];
}

registerHandler("SETTLE_MATCH", {
  async run(job) {
    const p = job.payload as unknown as SettlePayload;
    const chain = await loadChain();
    const txHashes: string[] = [];

    for (const fill of p.fills) {
      // Idempotent across retries: skip fills whose trades already settled.
      const already = await prisma.trade.findFirst({
        where: { id: { in: fill.tradeIds }, settlement: "CONFIRMED" },
        select: { txHash: true },
      });
      if (already) {
        if (already.txHash) txHashes.push(already.txHash);
        continue;
      }

      const makerRow = await prisma.order.findUniqueOrThrow({ where: { id: fill.makerOrderId } });
      const makerSigned = deserializeOrder(makerRow.signedOrder);

      // Taker sub-order at the maker's exact price for this fill's amounts.
      const takerSigned = await buildSignedOrder({
        index: p.takerIndex,
        tokenId: BigInt(p.tokenId),
        side: p.takerSide,
        tokensE6: BigInt(fill.tokensE6),
        usdcE6: BigInt(fill.usdcE6),
        chainId: chain.chainId,
        exchangeAddr: chain.exchangeAddr,
      });
      const txHash = await chain
        .exchangeAs(0)
        .matchOrders(takerSigned, [makerSigned], takerSigned.makerAmount, [BigInt(fill.makerFillE6)]);
      txHashes.push(txHash);
      await prisma.trade.updateMany({
        where: { id: { in: fill.tradeIds } },
        data: { settlement: "CONFIRMED", txHash },
      });
    }
    return { txHashes };
  },

  /// Terminal failure → compensate: reverse the DB fills so the book and
  /// feed match reality (nothing moved on-chain for unsettled fills).
  async onFailed(job) {
    const p = job.payload as unknown as SettlePayload;
    for (const fill of p.fills) {
      const trades = await prisma.trade.findMany({
        where: { id: { in: fill.tradeIds }, settlement: "PENDING" },
      });
      if (trades.length === 0) continue; // this fill settled before the failure
      const tokens = Number(formatUnits(BigInt(fill.tokensE6), 6));
      const usdc = Number(formatUnits(BigInt(fill.usdcE6), 6));
      await prisma.$transaction([
        prisma.trade.updateMany({
          where: { id: { in: fill.tradeIds } },
          data: { settlement: "FAILED" },
        }),
        prisma.order.update({
          where: { id: fill.makerOrderId },
          data: { sizeFilled: { decrement: tokens }, status: "PARTIALLY_FILLED" },
        }),
        prisma.market.update({
          where: { id: p.marketId },
          data: { volume: { decrement: usdc } },
        }),
      ]);
    }
    // The taker order is spent either way — mark what didn't settle.
    await prisma.order.update({
      where: { id: p.takerOrderId },
      data: { status: "CANCELLED" },
    }).catch(() => {});
  },
});
