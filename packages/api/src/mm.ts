// Operator market making: the automated liquidity behind every book.
//
// The operator (#0) posts a ladder of bids and asks around each outcome's
// quote center. Centers come from LMSR (see ./lmsr.ts): the price is a
// softmax over how much of each outcome the operator has NET SOLD, seeded
// with the market's opening probability. Inside a group the members' Yes
// centers are one n-way softmax, so Σ(yes centers) = 1 by construction —
// buying "Brazil" drips probability out of every other candidate without a
// separate renormalization pass.
//
// This replaced "the center follows the last traded price" (plan wave 1,
// Phase A). The practical difference: the quote now tracks the operator's
// own EXPOSURE rather than the last print, so a fill that never touched the
// operator's ladder — two users crossing against each other — correctly
// leaves the quote where it was.
//
// Third-party resting orders are never touched; coherence is enforced
// purely through the MM's own quotes.

import { formatUnits } from "viem";
import { prisma } from "./db";
import { loadChain } from "./chain";
import { placeOrder, setAfterFillHook } from "./book";
import { DEFAULT_LMSR_B, lmsrPrices, type LmsrOutcome } from "./lmsr";

const LADDER_LEVELS = 5;
const LADDER_STEP = 0.01; // 1¢ between levels
/// Level weights, nearest-the-mid first (sum 15) — total posted size per
/// side is `Σ weights/15 × ladderTotal`, so asks can never exceed the
/// operator's minted inventory. That guarantee only holds because
/// `ladderTotal` nets out unsettled sales (see `unsettledOperatorSold`);
/// the raw chain balance lags every fill.
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
  // Past its trading cutoff the market takes no orders (book.ts placeOrder),
  // so quoting it would throw on the first level. A closed market simply has
  // no book — that is the state, not an error to propagate to the caller.
  if (market.closesAt && market.closesAt.getTime() <= Date.now()) return;

  await prisma.order.updateMany({
    where: { marketId, isMM: true, status: { in: ["OPEN", "PARTIALLY_FILLED"] } },
    data: { status: "CANCELLED" },
  });

  const unsettled = await unsettledOperatorSold(marketId);

  for (const outcome of market.outcomes) {
    const center = outcome.label === "Yes" ? centerYes : Number((1 - centerYes).toFixed(4));
    const inventoryE6 = await chain.ctAs(0).balanceOf(chain.operator, BigInt(outcome.tokenId));
    const inventory = Number(formatUnits(inventoryE6, 6));
    // Only ever REDUCE by what's owed. A negative net (the operator bought and
    // hasn't received yet) must not inflate the quote — those tokens aren't in
    // hand either.
    const owed = Math.max(0, unsettled.get(outcome.id) ?? 0);
    const available = Math.max(0, inventory - owed);
    const ladderTotal = Math.min(available, MAX_LADDER_TOKENS);
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

/// Tokens the operator has already sold on the book but whose on-chain transfer
/// has NOT been mined yet, keyed by outcome.
///
/// `balanceOf` cannot see these. The after-fill hook that re-posts the ladder
/// runs before SETTLE_MATCH is even enqueued (book.ts), so a fresh chain read
/// still reports the PRE-trade balance. Sizing the ladder off that stale number
/// is what let the operator advertise size it no longer owns: a $400 fill took
/// 772 of 1,000 tokens and the very next ladder still quoted the full 1,000.
///
/// Only PENDING counts. CONFIRMED is already reflected in `balanceOf`, and
/// FAILED settlements never moved anything — the operator really does still
/// hold those.
async function unsettledOperatorSold(marketId: string): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<{ outcomeId: string; netSold: number }[]>`
    SELECT t."outcomeId" AS "outcomeId",
           SUM(CASE WHEN t."side" = 'BUY' THEN t."tokenAmount" ELSE -t."tokenAmount" END)::float8 AS "netSold"
    FROM "Trade" t
    JOIN "Order" o ON o."id" = t."makerOrderId"
    WHERE o."makerIndex" = 0
      AND t."settlement" = 'PENDING'
      AND t."marketId" = ${marketId}
    GROUP BY t."outcomeId"
  `;
  return new Map(rows.map((r) => [r.outcomeId, Number(r.netSold) || 0]));
}

/// Net quantity of each outcome the OPERATOR has sold, over the market's whole
/// history — LMSR's `q`. Derived from settled book fills rather than kept as a
/// running column so it cannot drift: a crashed re-quote, a manual DB fix or a
/// replayed job all still produce the same number.
///
/// Only fills whose MAKER was the operator count. A trade between two demo
/// wallets moves no operator inventory and must not move the operator's quote.
/// A user BUY means the operator sold; a user SELL means it bought back.
async function operatorNetSold(marketIds: string[]): Promise<Map<string, number>> {
  if (marketIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<{ outcomeId: string; netSold: number }[]>`
    SELECT t."outcomeId" AS "outcomeId",
           SUM(CASE WHEN t."side" = 'BUY' THEN t."tokenAmount" ELSE -t."tokenAmount" END)::float8 AS "netSold"
    FROM "Trade" t
    JOIN "Order" o ON o."id" = t."makerOrderId"
    WHERE o."makerIndex" = 0
      AND t."side" IN ('BUY', 'SELL')
      AND t."marketId" = ANY(${marketIds}::text[])
    GROUP BY t."outcomeId"
  `;
  return new Map(rows.map((r) => [r.outcomeId, Number(r.netSold) || 0]));
}

/// Re-quote after a user fill. `lastPrice` is intentionally unused: under LMSR
/// the center is a function of the operator's inventory, not of the last print.
/// Recomputes the affected centers, mirrors them into Outcome prices +
/// PricePoints, and re-posts the ladders.
export async function requoteAfterFill(marketId: string, _outcomeLabel: string, _lastPrice: number): Promise<void> {
  const market = await prisma.market.findUniqueOrThrow({
    where: { id: marketId },
    select: { id: true, groupId: true },
  });

  const centers = market.groupId
    ? await groupCenters(market.groupId)
    : await binaryCenter(marketId);

  for (const [id, center] of centers) {
    await applyCenter(id, center);
  }
  for (const [id, center] of centers) {
    await postLadders(id, center);
  }
}

/// Standalone binary market: one LMSR over its own Yes and No outcomes.
async function binaryCenter(marketId: string): Promise<Map<string, number>> {
  const market = await prisma.market.findUniqueOrThrow({
    where: { id: marketId },
    select: {
      id: true,
      openingCenter: true,
      lmsrB: true,
      outcomes: { select: { id: true, label: true } },
    },
  });

  const netSold = await operatorNetSold([marketId]);
  const opening = Number(market.openingCenter);
  const outcomes: LmsrOutcome[] = market.outcomes.map((o) => ({
    key: o.label,
    openingPrice: o.label === "Yes" ? opening : 1 - opening,
    netSold: netSold.get(o.id) ?? 0,
  }));

  const prices = lmsrPrices(outcomes, positiveB(market.lmsrB));
  return new Map([[marketId, clampCenter(prices.get("Yes") ?? opening)]]);
}

/// Group: ONE softmax across every member's Yes side. This is what replaces the
/// old proportional rescaling of siblings — the members' centers sum to 1
/// because they are a single softmax, not because they were scaled afterwards.
async function groupCenters(groupId: string): Promise<Map<string, number>> {
  const members = await prisma.market.findMany({
    where: { groupId, status: "OPEN" },
    select: {
      id: true,
      openingCenter: true,
      lmsrB: true,
      outcomes: { select: { id: true, label: true } },
    },
    orderBy: { id: "asc" }, // deterministic b selection below
  });
  if (members.length === 0) return new Map();

  const netSold = await operatorNetSold(members.map((m) => m.id));

  // Members of a group are created together and share b; take the first
  // deterministically rather than averaging, so the value is traceable.
  const b = positiveB(members[0]!.lmsrB);

  const outcomes: LmsrOutcome[] = members.map((m) => {
    const yes = m.outcomes.find((o) => o.label === "Yes");
    return {
      key: m.id,
      openingPrice: Number(m.openingCenter),
      netSold: yes ? (netSold.get(yes.id) ?? 0) : 0,
    };
  });

  const prices = lmsrPrices(outcomes, b);
  return new Map(members.map((m) => [m.id, clampCenter(prices.get(m.id) ?? Number(m.openingCenter))]));
}

/// Guard the one input that can make the softmax undefined.
function positiveB(raw: unknown): number {
  const b = Number(raw);
  return Number.isFinite(b) && b > 0 ? b : DEFAULT_LMSR_B;
}

/// Persist a member's center into Market.quoteCenter + Outcome prices, and
/// chart it.
///
/// EVERY market whose center moved gets a PricePoint, including the one that
/// was traded. It used to be skipped here because the fill had already written
/// a point — but that point was the FILL PRICE, one rung on the operator's
/// ladder, which a large order walks well past. The result was a chart whose
/// traded member sat at the print while its untouched siblings correctly
/// tracked the quote: two different quantities drawn on the same axis.
async function applyCenter(marketId: string, centerYes: number): Promise<void> {
  const outcomes = await prisma.outcome.findMany({ where: { marketId }, select: { id: true, label: true } });
  await prisma.$transaction([
    prisma.market.update({ where: { id: marketId }, data: { quoteCenter: centerYes } }),
    ...outcomes.map((o) =>
      prisma.outcome.update({
        where: { id: o.id },
        data: { price: o.label === "Yes" ? centerYes : Number((1 - centerYes).toFixed(4)) },
      }),
    ),
    prisma.pricePoint.create({ data: { marketId, price: centerYes } }),
  ]);
}

// Wire the hook: book.ts calls this after every user fill (never for MM
// placements — the MM re-centering itself must not recurse).
setAfterFillHook(requoteAfterFill);
