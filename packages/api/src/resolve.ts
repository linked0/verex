// Market resolution (operator #0 = manual oracle) and winner redemption.
// On-chain: ConditionalTokens.reportPayouts / redeemPositions (same flow the
// CLI demo proves in packages/cli/src/demo.ts steps 5-6). DB mirror follows
// the same conventions as trade.ts (prices, PricePoint, status).

import { formatUnits, type Hex } from "viem";
import { prisma } from "./db";
import { account, loadChain } from "./chain";
import type { Address } from "@verex/sdk";

export interface ResolveRequest {
  slug: string;
  outcome: "Yes" | "No";
  /// Must be 0 — resolution is operator-only (convention auth, like the rest
  /// of the demo API).
  accountIndex: number;
}

export interface ResolveResult {
  txHash: string;
  slug: string;
  resolvedOutcome: "Yes" | "No";
}

export async function resolveMarket(req: ResolveRequest): Promise<ResolveResult> {
  if (req.accountIndex !== 0) {
    throw Object.assign(new Error("only the operator (#0) can resolve"), { statusCode: 403 });
  }
  if (req.outcome !== "Yes" && req.outcome !== "No") {
    throw Object.assign(new Error("outcome must be Yes or No"), { statusCode: 400 });
  }
  const chain = await loadChain();
  if (chain.chainId === 0) {
    throw Object.assign(new Error("resolution is disabled in this environment"), { statusCode: 400 });
  }
  const market = await prisma.market.findUnique({
    where: { slug: req.slug },
    include: { outcomes: true },
  });
  if (!market) throw Object.assign(new Error("market not found"), { statusCode: 404 });
  if (market.status !== "OPEN") {
    throw Object.assign(new Error("market is already resolved"), { statusCode: 400 });
  }
  const winner = market.outcomes.find((o) => o.label === req.outcome)!;
  const loser = market.outcomes.find((o) => o.label !== req.outcome)!;

  // CTF payout vector is [Yes, No] (binary index sets 1/2, see seed). The CTF
  // rejects a second report for the same condition — natural idempotency.
  const payouts: bigint[] = req.outcome === "Yes" ? [1n, 0n] : [0n, 1n];
  const txHash = await chain.ctAs(0).reportPayouts(market.questionId as Hex, payouts);

  const finalYesPrice = req.outcome === "Yes" ? 1 : 0;
  await prisma.$transaction([
    prisma.outcome.update({ where: { id: winner.id }, data: { price: 1 } }),
    prisma.outcome.update({ where: { id: loser.id }, data: { price: 0 } }),
    prisma.market.update({
      where: { id: market.id },
      data: { status: "RESOLVED", resolvedOutcomeId: winner.id },
    }),
    prisma.pricePoint.create({ data: { marketId: market.id, price: finalYesPrice } }),
  ]);

  return { txHash, slug: market.slug, resolvedOutcome: req.outcome };
}

export interface RedeemRequest {
  slug: string;
  accountIndex: number;
}

export interface RedeemResult {
  txHash: string;
  slug: string;
  usdcReceived: number;
  usdc: number; // new balance
}

/// Redeem the caller's position in a resolved market. Both binary index sets
/// are passed — losing tokens redeem for 0, so one call clears the position.
export async function redeemPosition(req: RedeemRequest): Promise<RedeemResult> {
  if (req.accountIndex < 1 || req.accountIndex > 9) {
    throw Object.assign(new Error("accountIndex must be 1..9"), { statusCode: 400 });
  }
  const chain = await loadChain();
  if (chain.chainId === 0) {
    throw Object.assign(new Error("redeem is disabled in this environment"), { statusCode: 400 });
  }
  const market = await prisma.market.findUnique({
    where: { slug: req.slug },
    include: { outcomes: true },
  });
  if (!market) throw Object.assign(new Error("market not found"), { statusCode: 404 });
  if (market.status !== "RESOLVED") {
    throw Object.assign(new Error("market is not resolved yet"), { statusCode: 400 });
  }

  const user = account(req.accountIndex).address as Address;
  const usdc = chain.usdcAs(0);
  const userCt = chain.ctAs(req.accountIndex);

  // Snapshot per-outcome holdings before the redeem so the burn can be
  // recorded as REDEEM trade rows (portfolio history / realized P&L).
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

  const before = await usdc.balanceOf(user);
  const txHash = await userCt.redeem(chain.usdcAddr, market.conditionId as Hex, [1n, 2n]);
  const after = await usdc.balanceOf(user);

  // History is best-effort: the on-chain redeem above is already final, so a
  // DB failure here must not turn a successful redemption into an error
  // response (learned 2026-07-20: enum drift made this throw after the burn).
  if (held.length > 0) {
    try {
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
        })),
      });
    } catch (e) {
      console.error(`redeem history write failed for ${market.slug} (${txHash}):`, e);
    }
  }

  return {
    txHash,
    slug: market.slug,
    usdcReceived: Number(formatUnits(after - before, 6)),
    usdc: Number(formatUnits(after, 6)),
  };
}
