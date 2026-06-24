import Fastify from "fastify";
import cors from "@fastify/cors";
import { prisma } from "./db";

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

// List markets, newest-by-volume first; optional ?category= filter.
app.get("/markets", async (req) => {
  const { category } = req.query as { category?: string };
  const markets = await prisma.market.findMany({
    where: category ? { category } : undefined,
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

const start = async () => {
  await app.listen({ port: Number(process.env.PORT ?? 4000), host: "0.0.0.0" });
};

start();
