import Fastify from "fastify";
import { VerexClient } from "@verex/sdk";

const app = Fastify({ logger: true });

const client = new VerexClient({
  rpcUrl: process.env.RPC_URL ?? "http://localhost:8545",
  contractAddress: (process.env.CONTRACT_ADDRESS ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
});

app.get("/health", async () => ({ status: "ok" }));

app.get("/markets/:id", async (req, reply) => {
  const { id } = req.params as { id: string };
  try {
    const market = await client.getMarket(BigInt(id));
    return market;
  } catch {
    return reply.status(404).send({ error: "Market not found" });
  }
});

app.get("/markets", async () => {
  const count = await client.getMarketCount();
  const markets = await Promise.all(
    Array.from({ length: Number(count) }, (_, i) => client.getMarket(BigInt(i)))
  );
  return { markets, count: Number(count) };
});

const start = async () => {
  await app.listen({ port: Number(process.env.PORT ?? 3001), host: "0.0.0.0" });
};

start();
