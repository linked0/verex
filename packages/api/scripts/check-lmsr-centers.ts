// Read-only preview of the LMSR wiring against the live DB: for each market it
// prints the stored quote centre next to the centre LMSR would derive from the
// operator's net sold inventory. Mutates nothing.
//
// Run: pnpm --filter @verex/api exec tsx scripts/check-lmsr-centers.ts

import { PrismaClient } from "@prisma/client";
import { DEFAULT_LMSR_B, lmsrPrices, type LmsrOutcome } from "../src/lmsr";

const prisma = new PrismaClient();

async function netSold(marketIds: string[]): Promise<Map<string, number>> {
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

async function main() {
  const b = DEFAULT_LMSR_B;

  console.log("\n=== standalone binary markets ===");
  const singles = await prisma.market.findMany({
    where: { groupId: null, status: "OPEN" },
    select: { id: true, slug: true, quoteCenter: true, openingCenter: true, outcomes: { select: { id: true, label: true } } },
    take: 8,
  });
  const singleQ = await netSold(singles.map((m) => m.id));
  for (const m of singles) {
    const opening = Number(m.openingCenter);
    const outcomes: LmsrOutcome[] = m.outcomes.map((o) => ({
      key: o.label,
      openingPrice: o.label === "Yes" ? opening : 1 - opening,
      netSold: singleQ.get(o.id) ?? 0,
    }));
    const yesQ = outcomes.find((o) => o.key === "Yes")?.netSold ?? 0;
    const lmsr = lmsrPrices(outcomes, b).get("Yes")!;
    console.log(
      `  ${m.slug.padEnd(34).slice(0, 34)} p0=${opening.toFixed(3)}  q(yes)=${yesQ.toFixed(1).padStart(8)}  stored=${Number(m.quoteCenter).toFixed(3)}  lmsr=${lmsr.toFixed(3)}`,
    );
  }

  console.log("\n=== groups (members' Yes centres must total 1.000) ===");
  const groups = await prisma.marketGroup.findMany({ select: { id: true, slug: true }, take: 3 });
  for (const g of groups) {
    const members = await prisma.market.findMany({
      where: { groupId: g.id, status: "OPEN" },
      select: { id: true, groupLabel: true, quoteCenter: true, openingCenter: true, outcomes: { select: { id: true, label: true } } },
      orderBy: { id: "asc" },
    });
    if (members.length === 0) continue;
    const q = await netSold(members.map((m) => m.id));
    const outcomes: LmsrOutcome[] = members.map((m) => {
      const yes = m.outcomes.find((o) => o.label === "Yes");
      return { key: m.id, openingPrice: Number(m.openingCenter), netSold: yes ? (q.get(yes.id) ?? 0) : 0 };
    });
    const prices = lmsrPrices(outcomes, b);
    const storedSum = members.reduce((a, m) => a + Number(m.quoteCenter), 0);
    const lmsrSum = [...prices.values()].reduce((a, p) => a + p, 0);
    console.log(`\n  ${g.slug}  (${members.length} members)`);
    for (const m of members) {
      console.log(
        `    ${(m.groupLabel ?? m.id).padEnd(24).slice(0, 24)} stored=${Number(m.quoteCenter).toFixed(3)}  lmsr=${prices.get(m.id)!.toFixed(3)}`,
      );
    }
    console.log(`    ${"SUM".padEnd(24)} stored=${storedSum.toFixed(3)}  lmsr=${lmsrSum.toFixed(3)}`);
  }

  await prisma.$disconnect();
}

main();
