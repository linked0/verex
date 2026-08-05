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
  // A UMA market's condition is owned by the adapter, not the operator. A
  // reportPayouts from the operator here would NOT fail loudly — the CTF
  // derives the condition from msg.sender, so it would silently report on a
  // different condition that holds none of this market's positions, leaving
  // the real one unresolved forever. Refuse instead.
  if (market.oracleType === "UMA") {
    throw httpError(
      "this market resolves through UMA — its result can't be chosen. Use " +
        "POST /markets/:slug/uma-resolve once UMA has settled the question",
      400,
    );
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

export interface UmaResolveResult {
  slug: string;
  /// null when UMA settled "unresolvable" — both sides redeem half, so there
  /// is no winning outcome to record.
  resolvedOutcome: "Yes" | "No" | null;
  payouts: [number, number];
  txHash: string | null; // null when the condition was already reported
}

/// Resolve a UMA market by copying whatever UMA settled.
///
/// The control flow is deliberately the OPPOSITE of the operator path. There,
/// the DB flips first and the chain follows behind a job, because the operator
/// already knows the answer it is about to report. Here nobody knows it until
/// UMA settles — so the chain leads, and the DB copies the result back. Doing
/// it the other way round would mean guessing a verdict and correcting the UI
/// afterwards if the guess was wrong.
///
/// Unlike operator resolution this is NOT restricted to account 0: the adapter
/// makes `resolve` permissionless on purpose, since it has no discretion. An
/// absent operator must not be able to strand payouts — that is the failure
/// mode UMA is here to remove.
export async function resolveMarketFromUma(slug: string): Promise<UmaResolveResult> {
  const chain = await loadChain();
  if (chain.chainId === 0) throw httpError("resolution is disabled in this environment", 400);

  const market = await prisma.market.findUnique({
    where: { slug },
    include: { outcomes: true },
  });
  if (!market) throw httpError("market not found", 404);
  if (market.oracleType !== "UMA") {
    throw httpError("this market is operator-resolved — use POST /markets/:slug/resolve", 400);
  }
  if (market.status !== "OPEN") throw httpError("market is already resolved", 400);
  if (!market.umaAdapter) throw httpError("market has no adapter recorded", 500);

  // Bound to the adapter the market was CREATED against, not the environment's
  // current one — a replaced adapter still owns its old markets' conditions.
  const adapter = chain.umaAs(0, market.umaAdapter as Address);
  const ct = chain.ctAs(0);
  const questionId = market.questionId as Hex;

  let txHash: string | null = null;
  const alreadyReported = (await ct.getPayoutDenominator(market.conditionId as Hex)) > 0n;
  if (!alreadyReported) {
    if (!(await adapter.isSettled(questionId))) {
      throw httpError(
        "UMA hasn't settled this question yet — an answer must be proposed and " +
          "its challenge window must expire before the result can be copied on-chain",
        409,
      );
    }
    txHash = await adapter.resolve(questionId);
  }

  // Read the verdict off the chain rather than trusting what we expected it to
  // be. This is the whole point of the UMA path.
  const [yesNum, noNum] = await Promise.all([
    ct.getPayoutNumerator(market.conditionId as Hex, 0n),
    ct.getPayoutNumerator(market.conditionId as Hex, 1n),
  ]);
  const payouts: [number, number] = [Number(yesNum), Number(noNum)];

  // [1,1] is UMA's "unresolvable" — both sides redeem half. There is no
  // winner, so prices settle at 0.5 rather than 1/0 and no resolvedOutcomeId
  // is written.
  const isSplit = payouts[0] === payouts[1];
  const winnerLabel: "Yes" | "No" | null = isSplit ? null : payouts[0] > payouts[1] ? "Yes" : "No";

  await prisma.$transaction(async (tx) => {
    if (winnerLabel) {
      await resolveMarketRows(tx, market, winnerLabel);
    } else {
      await tx.market.update({
        where: { id: market.id },
        data: { status: "RESOLVED", resolvedOutcomeId: null, quoteCenter: 0.5 },
      });
      for (const o of market.outcomes) {
        await tx.outcome.update({ where: { id: o.id }, data: { price: 0.5 } });
      }
      await tx.order.updateMany({
        where: { marketId: market.id, status: { in: ["OPEN", "PARTIALLY_FILLED"] } },
        data: { status: "CANCELLED" },
      });
      await tx.pricePoint.create({ data: { marketId: market.id, price: 0.5 } });
    }
  });

  return { slug: market.slug, resolvedOutcome: winnerLabel, payouts, txHash };
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

/// A wallet's in-flight redemptions — pending/running REDEEM jobs, keyed
/// by market slug. The portfolio uses this to re-attach its status chips
/// after a page revisit (a redeem takes real time on Sepolia).
export async function pendingRedeems(accountIndex: number): Promise<{ jobId: string; slug: string }[]> {
  const jobs = await prisma.chainJob.findMany({
    where: {
      type: "REDEEM",
      status: { in: ["PENDING", "RUNNING"] },
      payload: { path: ["accountIndex"], equals: accountIndex },
    },
    select: { id: true, payload: true },
    orderBy: { createdAt: "asc" },
  });
  if (jobs.length === 0) return [];
  const marketIds = jobs.map((j) => (j.payload as unknown as RedeemPayload).marketId);
  const markets = await prisma.market.findMany({
    where: { id: { in: marketIds } },
    select: { id: true, slug: true },
  });
  const slugById = new Map(markets.map((m) => [m.id, m.slug]));
  return jobs.flatMap((j) => {
    const slug = slugById.get((j.payload as unknown as RedeemPayload).marketId);
    return slug ? [{ jobId: j.id, slug }] : [];
  });
}

/// Redeem the caller's position in a resolved market — queued behind any
/// pending resolution (FIFO worker), so the payout report always lands
/// first. Idempotent per (market, wallet): while a redeem is in flight,
/// asking again returns the same job instead of queueing a duplicate burn.
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

  const existing = await prisma.chainJob.findFirst({
    where: {
      type: "REDEEM",
      status: { in: ["PENDING", "RUNNING"] },
      AND: [
        { payload: { path: ["marketId"], equals: market.id } },
        { payload: { path: ["accountIndex"], equals: req.accountIndex } },
      ],
    },
    select: { id: true },
  });
  if (existing) {
    return { jobId: existing.id, slug: market.slug, expectedUsdc, settlement: "PENDING" };
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
