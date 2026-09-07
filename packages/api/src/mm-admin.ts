// /admin/mm — the operator's window and switch on the always-on maker.
//
// Status is read-only aggregation (inventory, exposure, quotes, headroom vs
// the b·ln(n) cap). Config carries ONLY the safe live controls: pause/resume
// (global + per market — the kill switch) and a spread within a hard-coded
// bound. The liquidity parameter b and the collateral cap DEFINE max loss,
// so in v1 they stay deploy-time values — shown here, never edited here.
// Every config write is validated server-side and lands in MmAuditLog.
// Design: rabbit docs/features/jayverse-onboarding-mm.md §6.

import { formatUnits } from "viem";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { loadChain } from "./chain";
import { lmsrCost, lmsrMaxLoss, type LmsrOutcome } from "./lmsr";
import { getMmConfig, operatorNetSold, postLadders, MAX_SPREAD_BPS } from "./mm";

function httpError(message: string, statusCode: number): Error {
  return Object.assign(new Error(message), { statusCode });
}

const usd = (n: number) => Number(n.toFixed(2));

export interface MmMarketStatus {
  slug: string;
  title: string;
  groupSlug: string | null;
  groupLabel: string | null;
  /// Deploy-time LMSR depth — read-only in v1 (see module comment).
  b: number;
  mmPaused: boolean;
  /// Whether MM orders are actually resting right now.
  quoting: boolean;
  centerYes: number;
  /// Operator token holdings (chain read).
  inventory: { yes: number; no: number };
  /// LMSR's q — net tokens the operator has sold over the market's history.
  netSold: { yes: number; no: number };
  /// Best MM bid/ask on the Yes outcome (null = no resting quote).
  quotes: { bid: number | null; ask: number | null };
  /// b·ln(n) for this market's LMSR book (n = 2, or the group size).
  maxLossCapUsd: number;
  /// Estimated worst-case loss at current q: maxᵢ(qᵢ) − (C(q) − C(0)).
  worstLossUsd: number;
  headroomUsd: number;
  /// Mark-to-market: cash collected from fills − netSold × current price.
  pnlUsd: number;
}

export interface MmStatus {
  config: { paused: boolean; spreadBps: number; maxSpreadBps: number };
  global: {
    operator: string;
    /// Operator's on-chain USDC balance.
    treasuryUsd: number;
    /// Σ of open books' b·ln(n) caps — collateral spoken for.
    committedUsd: number;
    pnlUsd: number;
  };
  markets: MmMarketStatus[];
}

/// Net USDC the operator has collected from book fills, per market: a user
/// BUY pays the operator, a user SELL is paid by it. Same maker join as
/// mm.operatorNetSold so cash and q describe the same fills.
async function operatorCash(marketIds: string[]): Promise<Map<string, number>> {
  if (marketIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<{ marketId: string; cash: number }[]>`
    SELECT t."marketId" AS "marketId",
           SUM(CASE WHEN t."side" = 'BUY' THEN t."usdcAmount" ELSE -t."usdcAmount" END)::float8 AS "cash"
    FROM "Trade" t
    JOIN "Order" o ON o."id" = t."makerOrderId"
    WHERE o."makerIndex" = 0
      AND t."side" IN ('BUY', 'SELL')
      AND t."marketId" = ANY(${marketIds}::text[])
    GROUP BY t."marketId"
  `;
  return new Map(rows.map((r) => [r.marketId, Number(r.cash) || 0]));
}

export async function mmStatus(): Promise<MmStatus> {
  const chain = await loadChain();
  const config = await getMmConfig();

  const markets = await prisma.market.findMany({
    where: { status: "OPEN" },
    include: {
      outcomes: { orderBy: { sortOrder: "asc" } },
      group: { select: { id: true, slug: true } },
    },
    orderBy: [{ groupId: "asc" }, { sortOrder: "asc" }, { volume: "desc" }],
  });
  const marketIds = markets.map((m) => m.id);
  const netSold = await operatorNetSold(marketIds);
  const cash = await operatorCash(marketIds);

  // Operator inventory for every outcome in one batched chain call — the
  // same read walletSummary does for a portfolio.
  const slots = markets.flatMap((m) => m.outcomes.map((o) => ({ m, o })));
  const balances =
    chain.chainId === 0 || slots.length === 0
      ? slots.map(() => 0n)
      : await chain.ctAs(0).balanceOfBatch(
          chain.operator as `0x${string}`,
          slots.map((s) => BigInt(s.o.tokenId)),
        );
  const inventory = new Map<string, number>();
  for (const [i, s] of slots.entries()) {
    inventory.set(s.o.id, Number(formatUnits(balances[i] ?? 0n, 6)));
  }

  // Resting MM quotes (best Yes bid/ask per market) + "quoting" flag.
  const mmOrders = await prisma.order.findMany({
    where: { marketId: { in: marketIds }, isMM: true, status: { in: ["OPEN", "PARTIALLY_FILLED"] } },
    select: { marketId: true, outcomeId: true, side: true, price: true },
  });

  // Worst loss is a property of the LMSR *book*: a standalone market's own
  // Yes/No pair, or the Yes side of every member of a group (mm.ts prices
  // them the same way). Compute per book, then attach to each member row.
  type Book = { key: string; marketIds: string[]; outcomes: LmsrOutcome[]; b: number; n: number };
  const books = new Map<string, Book>();
  for (const m of markets) {
    const b = Number(m.lmsrB) > 0 ? Number(m.lmsrB) : 250;
    if (!m.groupId) {
      const opening = Number(m.openingCenter);
      books.set(m.id, {
        key: m.id,
        marketIds: [m.id],
        b,
        n: 2,
        outcomes: m.outcomes.map((o) => ({
          key: o.id,
          openingPrice: o.label === "Yes" ? opening : 1 - opening,
          netSold: netSold.get(o.id) ?? 0,
        })),
      });
    } else {
      const book = books.get(m.groupId) ?? {
        key: m.groupId,
        marketIds: [],
        b,
        n: 0,
        outcomes: [],
      };
      const yes = m.outcomes.find((o) => o.label === "Yes");
      book.marketIds.push(m.id);
      book.n += 1;
      book.outcomes.push({
        key: m.id,
        openingPrice: Number(m.openingCenter),
        netSold: yes ? (netSold.get(yes.id) ?? 0) : 0,
      });
      books.set(m.groupId, book);
    }
  }
  const bookLoss = new Map<string, { cap: number; worst: number }>();
  for (const book of books.values()) {
    const cap = lmsrMaxLoss(book.b, book.n);
    const collected = lmsrCost(book.outcomes, book.b);
    const maxQ = Math.max(0, ...book.outcomes.map((o) => o.netSold));
    const worst = Math.max(0, maxQ - collected);
    for (const id of book.marketIds) bookLoss.set(id, { cap, worst });
  }

  const rows: MmMarketStatus[] = markets.map((m) => {
    const yes = m.outcomes.find((o) => o.label === "Yes");
    const no = m.outcomes.find((o) => o.label === "No");
    const yesBids = mmOrders.filter(
      (o) => o.marketId === m.id && o.outcomeId === yes?.id && o.side === "BUY",
    );
    const yesAsks = mmOrders.filter(
      (o) => o.marketId === m.id && o.outcomeId === yes?.id && o.side === "SELL",
    );
    const loss = bookLoss.get(m.id) ?? { cap: 0, worst: 0 };
    // Liability marks EVERY outcome sold (Yes and No) at its current price.
    const liability = m.outcomes.reduce(
      (a, o) => a + (netSold.get(o.id) ?? 0) * Number(o.price),
      0,
    );
    return {
      slug: m.slug,
      title: m.title,
      groupSlug: m.group?.slug ?? null,
      groupLabel: m.groupLabel,
      b: Number(m.lmsrB),
      mmPaused: m.mmPaused,
      quoting: mmOrders.some((o) => o.marketId === m.id),
      centerYes: Number(m.quoteCenter),
      inventory: {
        yes: yes ? (inventory.get(yes.id) ?? 0) : 0,
        no: no ? (inventory.get(no.id) ?? 0) : 0,
      },
      netSold: {
        yes: usd(yes ? (netSold.get(yes.id) ?? 0) : 0),
        no: usd(no ? (netSold.get(no.id) ?? 0) : 0),
      },
      quotes: {
        bid: yesBids.length ? Math.max(...yesBids.map((o) => Number(o.price))) : null,
        ask: yesAsks.length ? Math.min(...yesAsks.map((o) => Number(o.price))) : null,
      },
      maxLossCapUsd: usd(loss.cap),
      worstLossUsd: usd(loss.worst),
      headroomUsd: usd(loss.cap - loss.worst),
      pnlUsd: usd((cash.get(m.id) ?? 0) - liability),
    };
  });

  const treasury =
    chain.chainId === 0
      ? 0
      : Number(formatUnits(await chain.usdcAs(0).balanceOf(chain.operator as `0x${string}`), 6));
  const committed = [...books.values()].reduce((a, b) => a + lmsrMaxLoss(b.b, b.n), 0);

  return {
    config: { paused: config.paused, spreadBps: config.spreadBps, maxSpreadBps: MAX_SPREAD_BPS },
    global: {
      operator: chain.operator,
      treasuryUsd: usd(treasury),
      committedUsd: usd(committed),
      pnlUsd: usd(rows.reduce((a, r) => a + r.pnlUsd, 0)),
    },
    markets: rows,
  };
}

// ── Config writes (audited) ────────────────────────────────────────────────

export interface MmConfigWrite {
  action: "pause" | "resume" | "market-pause" | "market-resume" | "spread";
  /// market-pause / market-resume only.
  slug?: string;
  /// spread only — integer bps, 0..MAX_SPREAD_BPS.
  spreadBps?: number;
}

async function audit(actor: string, action: string, detail: Prisma.InputJsonObject) {
  await prisma.mmAuditLog.create({ data: { actor, action, detail } });
}

/// Cancel every resting MM order, optionally for one market. Third-party
/// orders are never touched.
async function cancelMmOrders(marketId?: string) {
  await prisma.order.updateMany({
    where: {
      isMM: true,
      status: { in: ["OPEN", "PARTIALLY_FILLED"] },
      ...(marketId ? { marketId } : {}),
    },
    data: { status: "CANCELLED" },
  });
}

/// Re-post ladders for every OPEN market at its stored center. postLadders
/// itself re-reads the pause switches, so paused markets stay quiet.
async function repostAll() {
  const markets = await prisma.market.findMany({
    where: { status: "OPEN" },
    select: { id: true, quoteCenter: true },
  });
  for (const m of markets) {
    await postLadders(m.id, Number(m.quoteCenter));
  }
}

/// Apply one validated config write as `actor` (the operator address — the
/// route has already enforced the owner gate). Returns the fresh status so
/// the page repaints from what the server actually did.
export async function mmConfigWrite(actor: string, req: MmConfigWrite): Promise<MmStatus> {
  switch (req.action) {
    case "pause": {
      await prisma.mmConfig.upsert({
        where: { id: 1 },
        create: { id: 1, paused: true },
        update: { paused: true },
      });
      await cancelMmOrders();
      await audit(actor, "pause", {});
      break;
    }
    case "resume": {
      await prisma.mmConfig.upsert({
        where: { id: 1 },
        create: { id: 1, paused: false },
        update: { paused: false },
      });
      await audit(actor, "resume", {});
      await repostAll();
      break;
    }
    case "market-pause":
    case "market-resume": {
      if (!req.slug) throw httpError("slug is required", 400);
      const market = await prisma.market.findUnique({
        where: { slug: req.slug },
        select: { id: true, quoteCenter: true },
      });
      if (!market) throw httpError("market not found", 404);
      const pause = req.action === "market-pause";
      await prisma.market.update({ where: { id: market.id }, data: { mmPaused: pause } });
      await audit(actor, req.action, { slug: req.slug });
      if (pause) await cancelMmOrders(market.id);
      else await postLadders(market.id, Number(market.quoteCenter));
      break;
    }
    case "spread": {
      // Server-side validation is the guardrail, not the client's input
      // field: an out-of-bound spread is refused here no matter who asks.
      const bps = Number(req.spreadBps);
      if (!Number.isInteger(bps) || bps < 0 || bps > MAX_SPREAD_BPS) {
        throw httpError(`spreadBps must be an integer 0..${MAX_SPREAD_BPS}`, 400);
      }
      const previous = (await getMmConfig()).spreadBps;
      await prisma.mmConfig.upsert({
        where: { id: 1 },
        create: { id: 1, spreadBps: bps },
        update: { spreadBps: bps },
      });
      await audit(actor, "spread", { spreadBps: bps, previous });
      await repostAll();
      break;
    }
    default:
      throw httpError(`unknown action ${String((req as { action?: string }).action)}`, 400);
  }
  return mmStatus();
}
