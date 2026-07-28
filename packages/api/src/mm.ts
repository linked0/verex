// Operator market making: the automated liquidity behind every book.
//
// The operator (#0) posts a ladder of bids and asks around each outcome's
// quote center. After any user fill the center follows the last traded
// price — the book itself is the price-impact model — and inside a group
// the centers are then RENORMALIZED so Σ(yes centers) = 1: buying "Brazil"
// deterministically drips probability out of every other candidate. This
// is the coherence rule that replaces nostra's ±5% arbitrage-bot band
// (see docs/tasks/jul-28-verex-design.md, rev 2).
//
// Third-party resting orders are never touched; coherence is enforced
// purely through the MM's own quotes.

import { formatUnits } from "viem";
import { prisma } from "./db";
import { loadChain } from "./chain";
import { placeOrder, setAfterFillHook } from "./book";

const LADDER_LEVELS = 5;
const LADDER_STEP = 0.01; // 1¢ between levels
/// Level weights, nearest-the-mid first (sum 15) — total posted size per
/// side is `Σ weights/15 × ladderTotal`, so asks can never exceed the
/// operator's minted inventory.
const LADDER_WEIGHTS = [5, 4, 3, 2, 1];
/// Cap per side per outcome so a 10k-inventory market doesn't post an
/// absurdly deep book.
const MAX_LADDER_TOKENS = 2_000;
const CENTER_MIN = 0.02;
const CENTER_MAX = 0.98;
const PRICE_FLOOR = 0.01;
const PRICE_CEIL = 0.99;

const clampCenter = (p: number) => Math.min(CENTER_MAX, Math.max(CENTER_MIN, Number(p.toFixed(4))));
const roundPrice = (p: number) => Number(p.toFixed(2)); // ladders quote whole cents

/// Re-post the operator's ladders for one market around `centerYes`.
/// Cancels the previous MM orders first. DB + local signing only, plus one
/// inventory read per outcome.
export async function postLadders(marketId: string, centerYes: number): Promise<void> {
  const chain = await loadChain();
  if (chain.chainId === 0) return;
  const market = await prisma.market.findUniqueOrThrow({
    where: { id: marketId },
    include: { outcomes: true },
  });
  if (market.status !== "OPEN") return;

  await prisma.order.updateMany({
    where: { marketId, isMM: true, status: { in: ["OPEN", "PARTIALLY_FILLED"] } },
    data: { status: "CANCELLED" },
  });

  for (const outcome of market.outcomes) {
    const center = outcome.label === "Yes" ? centerYes : Number((1 - centerYes).toFixed(4));
    const inventoryE6 = await chain.ctAs(0).balanceOf(chain.operator, BigInt(outcome.tokenId));
    const inventory = Number(formatUnits(inventoryE6, 6));
    const ladderTotal = Math.min(inventory, MAX_LADDER_TOKENS);
    if (ladderTotal < 1) continue; // nothing to quote with

    const weightSum = LADDER_WEIGHTS.reduce((a, b) => a + b, 0);
    for (let i = 1; i <= LADDER_LEVELS; i++) {
      const size = Number(((ladderTotal * LADDER_WEIGHTS[i - 1]!) / weightSum).toFixed(2));
      if (size < 0.01) continue;
      const bid = roundPrice(center - LADDER_STEP * i);
      const ask = roundPrice(center + LADDER_STEP * i);
      if (bid > PRICE_FLOOR) {
        await placeOrder({
          slug: market.slug,
          outcome: outcome.label,
          side: "BUY",
          accountIndex: 0,
          type: "limit",
          amount: size,
          price: bid,
        });
      }
      if (ask < PRICE_CEIL) {
        await placeOrder({
          slug: market.slug,
          outcome: outcome.label,
          side: "SELL",
          accountIndex: 0,
          type: "limit",
          amount: size,
          price: ask,
        });
      }
    }
  }
}

/// After a user fill on `marketId` at `lastPrice` (on `outcomeLabel`):
/// move that market's center to the traded price, renormalize its group's
/// centers to sum to 1, mirror everything into Outcome prices +
/// PricePoints, and re-post the affected ladders.
export async function requoteAfterFill(marketId: string, outcomeLabel: string, lastPrice: number): Promise<void> {
  const market = await prisma.market.findUniqueOrThrow({
    where: { id: marketId },
    select: { id: true, groupId: true },
  });

  const newYesCenter = clampCenter(outcomeLabel === "Yes" ? lastPrice : 1 - lastPrice);

  if (!market.groupId) {
    await applyCenter(marketId, newYesCenter, false);
    await postLadders(marketId, newYesCenter);
    return;
  }

  // Group: renormalize every member's center so Σ = 1, proportionally
  // scaling the others around the traded member's new center.
  const members = await prisma.market.findMany({
    where: { groupId: market.groupId, status: "OPEN" },
    select: { id: true, quoteCenter: true },
  });
  const others = members.filter((m) => m.id !== marketId);
  const othersSum = others.reduce((a, m) => a + Number(m.quoteCenter), 0);
  const scale = othersSum > 0 ? (1 - newYesCenter) / othersSum : 0;

  const centers = new Map<string, number>([[marketId, newYesCenter]]);
  for (const m of others) {
    centers.set(m.id, clampCenter(Number(m.quoteCenter) * scale));
  }

  for (const [id, center] of centers) {
    await applyCenter(id, center, id !== marketId);
  }
  for (const [id, center] of centers) {
    await postLadders(id, center);
  }
}

/// Persist a member's center into Market.quoteCenter + Outcome prices.
/// `withPricePoint` also charts the move (the traded market already got its
/// point from the fill itself).
async function applyCenter(marketId: string, centerYes: number, withPricePoint: boolean): Promise<void> {
  const outcomes = await prisma.outcome.findMany({ where: { marketId }, select: { id: true, label: true } });
  await prisma.$transaction([
    prisma.market.update({ where: { id: marketId }, data: { quoteCenter: centerYes } }),
    ...outcomes.map((o) =>
      prisma.outcome.update({
        where: { id: o.id },
        data: { price: o.label === "Yes" ? centerYes : Number((1 - centerYes).toFixed(4)) },
      }),
    ),
    ...(withPricePoint
      ? [prisma.pricePoint.create({ data: { marketId, price: centerYes } })]
      : []),
  ]);
}

// Wire the hook: book.ts calls this after every user fill (never for MM
// placements — the MM re-centering itself must not recurse).
setAfterFillHook(requoteAfterFill);
