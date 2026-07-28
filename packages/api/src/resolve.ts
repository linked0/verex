// Market resolution (operator #0 = manual oracle) and winner redemption —
// async since rev 2: the DB flips immediately (status, prices, cancelled
// books) and the on-chain reportPayouts / redeemPositions run behind a
// ChainJob. The worker is strictly FIFO, so a redeem queued after a
// resolve can never hit the chain before the payouts are reported.

import { formatUnits, type Hex } from "viem";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { account, loadChain } from "./chain";
import { enqueueJob, registerHandler } from "./worker";
import type { Address } from "@verex/sdk";

function httpError(message: string, statusCode: number): Error {
  return Object.assign(new Error(message), { statusCode });
}

export interface ResolveRequest {
  slug: string;
  outcome: "Yes" | "No";
  /// Must be 0 — resolution is operator-only (convention auth, like the rest
  /// of the demo API).
  accountIndex: number;
}

export interface ResolveResult {
  jobId: string;
  slug: string;
  resolvedOutcome: "Yes" | "No";
  settlement: "PENDING";
}

interface ResolveEntry {
  marketId: string;
  questionId: string;
  payouts: [number, number]; // [Yes, No]
}

interface ResolvePayload {
  entries: ResolveEntry[];
  groupId?: string;
}

/// DB-side resolution of one market: freeze prices at 1/0, cancel the whole
/// book, chart the final point. Runs inside the caller's transaction.
async function resolveMarketRows(
  tx: Prisma.TransactionClient,
  market: { id: string; outcomes: { id: string; label: string }[] },
  winnerLabel: "Yes" | "No",
) {
  const winner = market.outcomes.find((o) => o.label === winnerLabel)!;
  const loser = market.outcomes.find((o) => o.label !== winnerLabel)!;
  await tx.market.update({
    where: { id: market.id },
    data: { status: "RESOLVED", resolvedOutcomeId: winner.id, quoteCenter: winnerLabel === "Yes" ? 1 : 0 },
  });
  await tx.outcome.update({ where: { id: winner.id }, data: { price: 1 } });
  await tx.outcome.update({ where: { id: loser.id }, data: { price: 0 } });
  await tx.order.updateMany({
    where: { marketId: market.id, status: { in: ["OPEN", "PARTIALLY_FILLED"] } },
    data: { status: "CANCELLED" },
  });
  await tx.pricePoint.create({ data: { marketId: market.id, price: winnerLabel === "Yes" ? 1 : 0 } });
}

/// Resolve a standalone binary market. Group members can't be resolved
/// individually — outcomes there are mutually exclusive, so the whole
/// group resolves at once (resolveGroup).
export async function resolveMarket(req: ResolveRequest): Promise<ResolveResult> {
  if (req.accountIndex !== 0) throw httpError("only the operator (#0) can resolve", 403);
  if (req.outcome !== "Yes" && req.outcome !== "No") throw httpError("outcome must be Yes or No", 400);
  const chain = await loadChain();
  if (chain.chainId === 0) throw httpError("resolution is disabled in this environment", 400);

  const market = await prisma.market.findUnique({
    where: { slug: req.slug },
    include: { outcomes: true },
  });
  if (!market) throw httpError("market not found", 404);
  if (market.status !== "OPEN") throw httpError("market is already resolved", 400);
  if (market.groupId) {
    throw httpError("this market belongs to a group — resolve the group with its winner instead", 400);
  }

  await prisma.$transaction(async (tx) => {
    await resolveMarketRows(tx, market, req.outcome);
  });

  const payload: ResolvePayload = {
    entries: [
      {
        marketId: market.id,
        questionId: market.questionId,
        payouts: req.outcome === "Yes" ? [1, 0] : [0, 1],
      },
    ],
  };
  const jobId = await enqueueJob("RESOLVE", payload);
  return { jobId, slug: market.slug, resolvedOutcome: req.outcome, settlement: "PENDING" };
}

export interface ResolveGroupRequest {
  groupSlug: string;
  winnerSlug: string; // the winning member market's slug
  accountIndex: number;
}

export interface ResolveGroupResult {
  jobId: string;
  groupSlug: string;
  winnerSlug: string;
  winnerLabel: string | null;
  settlement: "PENDING";
}

/// Resolve a whole group: the winner's market reports Yes, every other
/// member reports No — N reportPayouts in one RESOLVE job.
export async function resolveGroup(req: ResolveGroupRequest): Promise<ResolveGroupResult> {
  if (req.accountIndex !== 0) throw httpError("only the operator (#0) can resolve", 403);
  const chain = await loadChain();
  if (chain.chainId === 0) throw httpError("resolution is disabled in this environment", 400);

  const group = await prisma.marketGroup.findUnique({
    where: { slug: req.groupSlug },
    include: { markets: { include: { outcomes: true } } },
  });
  if (!group) throw httpError("group not found", 404);
  if (group.status !== "OPEN") throw httpError("group is already resolved", 400);
  const winner = group.markets.find((m) => m.slug === req.winnerSlug);
  if (!winner) throw httpError("winnerSlug is not a member of this group", 400);

  await prisma.$transaction(async (tx) => {
    for (const member of group.markets) {
      if (member.status !== "OPEN") continue;
      await resolveMarketRows(tx, member, member.id === winner.id ? "Yes" : "No");
    }
    await tx.marketGroup.update({
      where: { id: group.id },
      data: { status: "RESOLVED", resolvedMarketId: winner.id },
    });
  });

  const payload: ResolvePayload = {
    groupId: group.id,
    entries: group.markets.map((m) => ({
      marketId: m.id,
      questionId: m.questionId,
      payouts: m.id === winner.id ? [1, 0] : [0, 1],
    })),
  };
  const jobId = await enqueueJob("RESOLVE", payload);
  return {
    jobId,
    groupSlug: group.slug,
    winnerSlug: winner.slug,
    winnerLabel: winner.groupLabel,
    settlement: "PENDING",
  };
}

registerHandler("RESOLVE", {
  async run(job) {
    const p = job.payload as unknown as ResolvePayload;
    const chain = await loadChain();
    const ct = chain.ctAs(0);
    const txHashes: string[] = [];
    for (const entry of p.entries) {
      // Idempotent across retries: a reported condition has a non-zero
      // payout denominator — skip it.
      const market = await prisma.market.findUniqueOrThrow({
        where: { id: entry.marketId },
        select: { conditionId: true },
      });
      const denominator = await ct.getPayoutDenominator(market.conditionId as Hex);
      if (denominator > 0n) continue;
      const txHash = await ct.reportPayouts(
        entry.questionId as Hex,
        entry.payouts.map((n) => BigInt(n)),
      );
      txHashes.push(txHash);
    }
    return { txHashes };
  },

  /// Terminal failure → the chain never learned the result: re-open the
  /// DB side so the UI matches reality (prices back to the quote centers).
  async onFailed(job) {
    const p = job.payload as unknown as ResolvePayload;
    for (const entry of p.entries) {
      const market = await prisma.market.findUnique({
        where: { id: entry.marketId },
        include: { outcomes: true },
      });
      if (!market) continue;
      const center = Number(market.quoteCenter) === 1 || Number(market.quoteCenter) === 0 ? 0.5 : Number(market.quoteCenter);
      await prisma.$transaction([
        prisma.market.update({
          where: { id: market.id },
          data: { status: "OPEN", resolvedOutcomeId: null, quoteCenter: center },
        }),
        ...market.outcomes.map((o) =>
          prisma.outcome.update({
            where: { id: o.id },
            data: { price: o.label === "Yes" ? center : Number((1 - center).toFixed(4)) },
          }),
        ),
      ]);
    }
    if (p.groupId) {
      await prisma.marketGroup.update({
        where: { id: p.groupId },
        data: { status: "OPEN", resolvedMarketId: null },
      });
    }
  },
});

export interface RedeemRequest {
  slug: string;
  accountIndex: number;
}

export interface RedeemResult {
  jobId: string;
  slug: string;
  /// What the winning tokens should pay out (winning balance × $1) — the
  /// job writes the exact number once the chain confirms.
  expectedUsdc: number;
  settlement: "PENDING";
}

interface RedeemPayload {
  marketId: string;
  accountIndex: number;
}

/// Redeem the caller's position in a resolved market — queued behind any
/// pending resolution (FIFO worker), so the payout report always lands
/// first.
export async function redeemPosition(req: RedeemRequest): Promise<RedeemResult> {
  if (req.accountIndex < 1 || req.accountIndex > 9) throw httpError("accountIndex must be 1..9", 400);
  const chain = await loadChain();
  if (chain.chainId === 0) throw httpError("redeem is disabled in this environment", 400);

  const market = await prisma.market.findUnique({
    where: { slug: req.slug },
    include: { outcomes: true },
  });
  if (!market) throw httpError("market not found", 404);
  if (market.status !== "RESOLVED") throw httpError("market is not resolved yet", 400);

  // Expected payout: winning-outcome balance × $1 (read-only, fast).
  const user = account(req.accountIndex).address as Address;
  const winning = market.outcomes.find((o) => o.id === market.resolvedOutcomeId);
  let expectedUsdc = 0;
  if (winning) {
    const bal = await chain.ctAs(0).balanceOf(user, BigInt(winning.tokenId));
    expectedUsdc = Number(formatUnits(bal, 6));
  }

  const jobId = await enqueueJob("REDEEM", { marketId: market.id, accountIndex: req.accountIndex } satisfies RedeemPayload);
  return { jobId, slug: market.slug, expectedUsdc, settlement: "PENDING" };
}

registerHandler("REDEEM", {
  async run(job) {
    const p = job.payload as unknown as RedeemPayload;
    const chain = await loadChain();
    const market = await prisma.market.findUniqueOrThrow({
      where: { id: p.marketId },
      include: { outcomes: true },
    });
    const user = account(p.accountIndex).address as Address;
    const usdc = chain.usdcAs(0);
    const userCt = chain.ctAs(p.accountIndex);

    // Snapshot per-outcome holdings before the burn — becomes the REDEEM
    // trade rows (portfolio history / realized P&L).
    const held = [] as { outcomeId: string; tokens: number; payout: number }[];
    for (const o of market.outcomes) {
      const bal = await userCt.balanceOf(user, BigInt(o.tokenId));
      if (bal > 0n) {
        held.push({
          outcomeId: o.id,
          tokens: Number(formatUnits(bal, 6)),
          payout: market.resolvedOutcomeId === o.id ? 1 : 0,
        });
      }
    }
    if (held.length === 0) return { txHashes: [], usdcReceived: 0 };

    const before = await usdc.balanceOf(user);
    const txHash = await userCt.redeem(chain.usdcAddr, market.conditionId as Hex, [1n, 2n]);
    const after = await usdc.balanceOf(user);

    await prisma.trade.createMany({
      data: held.map((h) => ({
        marketId: market.id,
        outcomeId: h.outcomeId,
        user,
        side: "REDEEM" as const,
        usdcAmount: Number((h.tokens * h.payout).toFixed(6)),
        tokenAmount: h.tokens,
        price: h.payout,
        txHash,
        settlement: "CONFIRMED" as const,
      })),
    });

    return { txHashes: [txHash], usdcReceived: Number(formatUnits(after - before, 6)) };
  },
  // No compensation needed: a failed redeem moved nothing on-chain and
  // wrote nothing to the DB — the position simply remains redeemable.
});
