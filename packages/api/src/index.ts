import "dotenv/config"; // load packages/api/.env into process.env (DATABASE_URL) before Prisma
import Fastify from "fastify";
import cors from "@fastify/cors";
import { prisma } from "./db";
import { executeTrade, walletSummary, walletHistory, faucet, type TradeRequest } from "./trade";
import { resolveMarket, redeemPosition } from "./resolve";
import { startWorker } from "./worker";

const app = Fastify({ logger: true });

// The web frontend runs on a different origin, so allow cross-origin reads.
app.register(cors, { origin: true });

app.get("/health", async () => ({ status: "ok" }));

// Distinct categories — used by the web nav tabs.
app.get("/categories", async () => {
  const rows = await prisma.market.findMany({
    distinct: ["category"],
    select: { category: true },
    orderBy: { category: "asc" },
  });
  return { categories: rows.map((r) => r.category) };
});

// List markets, highest-volume first; optional ?category= and ?q= filters.
app.get("/markets", async (req) => {
  const { category, q } = req.query as { category?: string; q?: string };
  const markets = await prisma.market.findMany({
    where: {
      ...(category ? { category } : {}),
      ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}),
    },
    orderBy: { volume: "desc" },
    include: { outcomes: { orderBy: { sortOrder: "asc" } } },
  });
  return { markets, count: markets.length };
});

// Market detail by slug.
app.get("/markets/:slug", async (req, reply) => {
  const { slug } = req.params as { slug: string };
  const market = await prisma.market.findUnique({
    where: { slug },
    include: { outcomes: { orderBy: { sortOrder: "asc" } } },
  });
  if (!market) return reply.status(404).send({ error: "Market not found" });
  return market;
});

// YES-price history for the probability chart.
app.get("/markets/:slug/history", async (req, reply) => {
  const { slug } = req.params as { slug: string };
  const market = await prisma.market.findUnique({ where: { slug }, select: { id: true } });
  if (!market) return reply.status(404).send({ error: "Market not found" });
  const points = await prisma.pricePoint.findMany({
    where: { marketId: market.id },
    orderBy: { at: "asc" },
    select: { price: true, at: true },
  });
  return { points };
});

// Recent real fills for a market.
app.get("/markets/:slug/trades", async (req, reply) => {
  const { slug } = req.params as { slug: string };
  const market = await prisma.market.findUnique({ where: { slug }, select: { id: true } });
  if (!market) return reply.status(404).send({ error: "Market not found" });
  const trades = await prisma.trade.findMany({
    where: { marketId: market.id },
    orderBy: { createdAt: "desc" },
    take: 25,
    include: { outcome: { select: { label: true } } },
  });
  return { trades };
});

/// Dig the revert reason / custom error name out of viem's nested cause chain —
/// `shortMessage` alone ("fillOrder reverted") hides it (see 2026-07-20 history).
function revertDetail(e: any): string | undefined {
  for (let c = e; c; c = c.cause) {
    if (typeof c.reason === "string") return c.reason;
    if (c.data?.errorName) return c.data.errorName;
  }
  return e?.metaMessages?.filter(Boolean).slice(0, 3).join(" | ");
}

// Execute a real on-chain trade (see trade.ts for the maker/taker model).
app.post("/trade", async (req, reply) => {
  try {
    const result = await executeTrade(req.body as TradeRequest);
    return result;
  } catch (e: any) {
    const status = e?.statusCode ?? 500;
    req.log.error(e);
    return reply.status(status).send({
      error: e?.shortMessage ?? e?.message ?? "trade failed",
      detail: revertDetail(e),
    });
  }
});

// Resolve a market (operator #0 only — manual oracle, reportPayouts on-chain).
app.post("/markets/:slug/resolve", async (req, reply) => {
  try {
    const { slug } = req.params as { slug: string };
    const body = req.body as { outcome: "Yes" | "No"; accountIndex: number };
    return await resolveMarket({ slug, outcome: body.outcome, accountIndex: body.accountIndex });
  } catch (e: any) {
    const status = e?.statusCode ?? 500;
    req.log.error(e);
    return reply.status(status).send({
      error: e?.shortMessage ?? e?.message ?? "resolve failed",
      detail: revertDetail(e),
    });
  }
});

// Redeem a position in a resolved market (winner gets $1/token; one call clears both sides).
app.post("/redeem", async (req, reply) => {
  try {
    return await redeemPosition(req.body as { slug: string; accountIndex: number });
  } catch (e: any) {
    const status = e?.statusCode ?? 500;
    req.log.error(e);
    return reply.status(status).send({
      error: e?.shortMessage ?? e?.message ?? "redeem failed",
      detail: revertDetail(e),
    });
  }
});

// Demo wallet: address, USDC balance, on-chain positions.
app.get("/wallet/:index", async (req, reply) => {
  const index = Number((req.params as { index: string }).index);
  if (!Number.isInteger(index) || index < 1 || index > 9) {
    return reply.status(400).send({ error: "index must be 1..9" });
  }
  return walletSummary(index);
});

// Demo wallet: trade + redemption history (newest first), with realized P&L on redeems.
app.get("/wallet/:index/history", async (req, reply) => {
  const index = Number((req.params as { index: string }).index);
  if (!Number.isInteger(index) || index < 1 || index > 9) {
    return reply.status(400).send({ error: "index must be 1..9" });
  }
  return { history: await walletHistory(index) };
});

// Poll a queued chain job (settlement / resolution / redemption / creation).
app.get("/jobs/:id", async (req, reply) => {
  const { id } = req.params as { id: string };
  const job = await prisma.chainJob.findUnique({
    where: { id },
    select: { id: true, type: true, status: true, result: true, attempts: true, updatedAt: true },
  });
  if (!job) return reply.status(404).send({ error: "job not found" });
  return job;
});

// Demo faucet: mint test USDC to a demo wallet.
app.post("/faucet", async (req, reply) => {
  const { accountIndex } = (req.body ?? {}) as { accountIndex?: number };
  if (!Number.isInteger(accountIndex) || accountIndex! < 1 || accountIndex! > 9) {
    return reply.status(400).send({ error: "accountIndex must be 1..9" });
  }
  return faucet(accountIndex!);
});

const start = async () => {
  startWorker();
  await app.listen({ port: Number(process.env.PORT ?? 4000), host: "0.0.0.0" });
};

start();
