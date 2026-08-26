import "dotenv/config"; // load packages/api/.env into process.env (DATABASE_URL) before Prisma
import Fastify from "fastify";
import cors from "@fastify/cors";
import { prisma } from "./db";
import { isAddress, getAddress } from "viem";
import type { Address } from "@verex/sdk";
import {
  walletSummary,
  walletSummaryByAddress,
  walletHistory,
  walletHistoryByAddress,
  faucet,
  faucetTo,
  type TradeRequest,
} from "./trade";
import {
  resolveMarket,
  resolveMarketFromUma,
  resolveGroup,
  redeemPosition,
  recordExternalRedeem,
  pendingRedeems,
} from "./resolve";
import { umaLifecycle, umaPropose, umaDispute, umaVote, umaFinalize, type UmaAnswer } from "./uma-demo";
import { startWorker } from "./worker";
import {
  placeOrder,
  cancelOpenOrder,
  getBook,
  openOrders,
  type PlaceOrderRequest,
} from "./book";
import "./mm"; // wires the after-fill re-quote hook into the book
import { createMarketGroup, type CreateGroupRequest } from "./group-create";
import { loadChain } from "./chain";
import { notifyTelegram } from "./telegram-notify";

const app = Fastify({ logger: true });

// The web frontend runs on a different origin, so allow cross-origin reads.
app.register(cors, { origin: true });

app.get("/health", async () => ({ status: "ok" }));

// What this environment can do. The create page asks before offering the UMA
// oracle: the adapter is deployed per environment (runbook §2b), so on anvil
// or on any environment that hasn't run it, the option must not appear at all
// rather than be offered and then rejected.
app.get("/config", async () => {
  try {
    const chain = await loadChain();
    return {
      chainId: chain.chainId,
      // The EIP-712 `verifyingContract` for order signing. An external maker
      // cannot build the domain without it, and a local `reset.sh` deploys a
      // fresh backbone — so this has to be read, never hardcoded.
      exchange: chain.exchangeAddr,
      // V-D: an external holder redeems for itself, and `redeemPositions`
      // wants the CTF and the collateral. `conditionId` it already has from
      // the market; the index sets for a binary condition are always [1, 2].
      ctf: chain.ctfAddr,
      usdc: chain.usdcAddr,
      tradingEnabled: chain.chainId !== 0,
      umaAvailable: Boolean(chain.umaAdapterAddr),
      umaAdapter: chain.umaAdapterAddr,
      // True when the oracle is the demo mock whose DVM is a demo-wallet
      // jury — the web only offers propose/dispute/vote controls then.
      umaOracleMock: chain.umaOracleMock,
    };
  } catch {
    // No ChainConfig row yet (un-seeded DB) — browse-only, nothing on offer.
    return {
      chainId: 0,
      exchange: null,
      ctf: null,
      usdc: null,
      tradingEnabled: false,
      umaAvailable: false,
      umaAdapter: null,
      umaOracleMock: false,
    };
  }
});

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
// With ?q= the group MEMBERS match too (searching "Judge" should find the
// Derby market); without it members stay hidden — the homepage shows the
// group card instead.
app.get("/markets", async (req) => {
  const { category, q } = req.query as { category?: string; q?: string };
  const markets = await prisma.market.findMany({
    where: {
      ...(q ? {} : { groupId: null }),
      ...(category ? { category } : {}),
      ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}),
    },
    orderBy: { volume: "desc" },
    include: {
      outcomes: { orderBy: { sortOrder: "asc" } },
      group: { select: { slug: true, title: true } },
    },
  });
  return { markets, count: markets.length };
});

// List market groups (homepage cards): members summarized by probability.
app.get("/market-groups", async (req) => {
  const { category, q } = req.query as { category?: string; q?: string };
  const groups = await prisma.marketGroup.findMany({
    where: {
      status: { in: ["OPEN", "RESOLVED"] }, // CREATING stays hidden
      ...(category ? { category } : {}),
      ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}),
    },
    include: {
      markets: {
        orderBy: { sortOrder: "asc" },
        include: { outcomes: { orderBy: { sortOrder: "asc" } } },
      },
    },
  });
  // Highest-volume first, volume = Σ members.
  const shaped = groups
    .map((g) => ({
      ...g,
      volume: g.markets.reduce((a, m) => a + Number(m.volume), 0),
    }))
    .sort((a, b) => b.volume - a.volume);
  return { groups: shaped, count: shaped.length };
});

// Group detail by slug (members ordered by current probability, desc).
app.get("/market-groups/:slug", async (req, reply) => {
  const { slug } = req.params as { slug: string };
  const group = await prisma.marketGroup.findUnique({
    where: { slug },
    include: {
      markets: {
        include: { outcomes: { orderBy: { sortOrder: "asc" } } },
      },
    },
  });
  if (!group) return reply.status(404).send({ error: "Group not found" });
  group.markets.sort((a, b) => Number(b.quoteCenter) - Number(a.quoteCenter));
  return group;
});

// Per-member YES-price history — one series per outcome for the group chart.
app.get("/market-groups/:slug/history", async (req, reply) => {
  const { slug } = req.params as { slug: string };
  const group = await prisma.marketGroup.findUnique({
    where: { slug },
    include: { markets: { select: { id: true, slug: true, groupLabel: true, quoteCenter: true } } },
  });
  if (!group) return reply.status(404).send({ error: "Group not found" });
  const members = [...group.markets].sort((a, b) => Number(b.quoteCenter) - Number(a.quoteCenter));
  const series = await Promise.all(
    members.map(async (m) => ({
      slug: m.slug,
      label: m.groupLabel ?? m.slug,
      points: await prisma.pricePoint.findMany({
        where: { marketId: m.id },
        orderBy: { at: "asc" },
        select: { price: true, at: true },
      }),
    })),
  );
  return { series };
});

// Create a market (group or binary) with operator-funded liquidity. 202 +
// jobId — the batch job does the on-chain work; poll /jobs/:id.
app.post("/market-groups", async (req, reply) => {
  try {
    const result = await createMarketGroup(req.body as CreateGroupRequest);
    return reply.status(202).send(result);
  } catch (e: any) {
    const status = e?.statusCode ?? 500;
    req.log.error(e);
    return reply.status(status).send({
      error: e?.shortMessage ?? e?.message ?? "creation failed",
      detail: revertDetail(e),
    });
  }
});

// Resolve a whole group: winner reports Yes, everyone else No (operator #0).
app.post("/market-groups/:slug/resolve", async (req, reply) => {
  try {
    const { slug } = req.params as { slug: string };
    const body = req.body as { winnerSlug: string; accountIndex: number };
    const r = await resolveGroup({ groupSlug: slug, winnerSlug: body.winnerSlug, accountIndex: body.accountIndex });
    notifyTelegram(`🔮 🏁 Verex — group resolved: ${slug} → winner ${r.winnerSlug}`);
    return r;
  } catch (e: any) {
    const status = e?.statusCode ?? 500;
    req.log.error(e);
    return reply.status(status).send({
      error: e?.shortMessage ?? e?.message ?? "resolve failed",
      detail: revertDetail(e),
    });
  }
});

// Edit a group's display fields (image / rules / category). Operator (#0)
// only. Category cascades to the member markets — creation keeps group and
// members in sync, so editing does too.
app.patch("/market-groups/:slug", async (req, reply) => {
  const { slug } = req.params as { slug: string };
  const body = (req.body ?? {}) as {
    accountIndex?: number;
    imageUrl?: string;
    description?: string;
    category?: string;
  };
  if (body.accountIndex !== 0) {
    return reply.status(403).send({ error: "only the operator (#0) may edit markets" });
  }
  if (body.category !== undefined && !body.category.trim()) {
    return reply.status(400).send({ error: "category cannot be empty" });
  }
  const data: Record<string, string | null> = {};
  if (body.imageUrl !== undefined) data.imageUrl = body.imageUrl.trim() || null;
  if (body.description !== undefined) data.description = body.description.trim() || null;
  if (body.category !== undefined) data.category = body.category.trim();
  if (Object.keys(data).length === 0) {
    return reply.status(400).send({ error: "nothing to update" });
  }
  const existing = await prisma.marketGroup.findUnique({ where: { slug }, select: { id: true } });
  if (!existing) return reply.status(404).send({ error: "Group not found" });
  if (data.category) {
    await prisma.market.updateMany({
      where: { groupId: existing.id },
      data: { category: data.category },
    });
  }
  return prisma.marketGroup.update({
    where: { id: existing.id },
    data,
    include: {
      markets: { include: { outcomes: { orderBy: { sortOrder: "asc" } } } },
    },
  });
});

// Market detail by slug.
app.get("/markets/:slug", async (req, reply) => {
  const { slug } = req.params as { slug: string };
  const market = await prisma.market.findUnique({
    where: { slug },
    include: {
      outcomes: { orderBy: { sortOrder: "asc" } },
      group: { select: { slug: true, title: true } },
    },
  });
  if (!market) return reply.status(404).send({ error: "Market not found" });
  return market;
});

// Edit a market's display fields (image / rules / category). Operator
// (#0) only — same demo-grade auth as resolution: the caller just claims
// an accountIndex.
app.patch("/markets/:slug", async (req, reply) => {
  const { slug } = req.params as { slug: string };
  const body = (req.body ?? {}) as {
    accountIndex?: number;
    imageUrl?: string;
    description?: string;
    category?: string;
  };
  if (body.accountIndex !== 0) {
    return reply.status(403).send({ error: "only the operator (#0) may edit markets" });
  }
  if (body.category !== undefined && !body.category.trim()) {
    return reply.status(400).send({ error: "category cannot be empty" });
  }
  const data: Record<string, string | null> = {};
  if (body.imageUrl !== undefined) data.imageUrl = body.imageUrl.trim() || null;
  if (body.description !== undefined) data.description = body.description.trim() || null;
  if (body.category !== undefined) data.category = body.category.trim();
  if (Object.keys(data).length === 0) {
    return reply.status(400).send({ error: "nothing to update" });
  }
  const existing = await prisma.market.findUnique({ where: { slug }, select: { id: true } });
  if (!existing) return reply.status(404).send({ error: "Market not found" });
  return prisma.market.update({
    where: { id: existing.id },
    data,
    include: {
      outcomes: { orderBy: { sortOrder: "asc" } },
      group: { select: { slug: true, title: true } },
    },
  });
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

// Place an order on the book (market/IOC or limit). Fills are instant in
// the DB; matched pairs settle on-chain asynchronously (poll /jobs/:id).
app.post("/orders", async (req, reply) => {
  try {
    return await placeOrder(req.body as PlaceOrderRequest);
  } catch (e: any) {
    const status = e?.statusCode ?? 500;
    req.log.error(e);
    return reply.status(status).send({
      error: e?.shortMessage ?? e?.message ?? "order failed",
      detail: revertDetail(e),
    });
  }
});

// Cancel the unfilled remainder of a resting order.
app.delete("/orders/:id", async (req, reply) => {
  try {
    const { id } = req.params as { id: string };
    const { accountIndex } = (req.body ?? {}) as { accountIndex?: number };
    if (!Number.isInteger(accountIndex)) {
      return reply.status(400).send({ error: "accountIndex required" });
    }
    return await cancelOpenOrder(id, accountIndex!);
  } catch (e: any) {
    return reply.status(e?.statusCode ?? 500).send({ error: e?.message ?? "cancel failed" });
  }
});

// The caller's open (resting) orders, optionally for one market.
app.get("/orders", async (req, reply) => {
  const { accountIndex, slug } = req.query as { accountIndex?: string; slug?: string };
  const index = Number(accountIndex);
  if (!Number.isInteger(index)) return reply.status(400).send({ error: "accountIndex required" });
  return { orders: await openOrders(index, slug) };
});

// Aggregated order-book depth for one outcome.
app.get("/markets/:slug/book", async (req, reply) => {
  try {
    const { slug } = req.params as { slug: string };
    const { outcome } = req.query as { outcome?: string };
    return await getBook(slug, outcome ?? "Yes");
  } catch (e: any) {
    return reply.status(e?.statusCode ?? 500).send({ error: e?.message ?? "book failed" });
  }
});

// Legacy trade endpoint — adapts the old body to a market (IOC) order so
// the existing web panel keeps working. Response keeps the old field names
// plus the new jobId/settlement pair.
app.post("/trade", async (req, reply) => {
  try {
    const body = req.body as TradeRequest;
    const r = await placeOrder({
      slug: body.slug,
      outcome: body.outcome,
      side: body.side,
      accountIndex: body.accountIndex,
      type: "market",
      amount: body.amount,
    });
    if (r.fills.length === 0) {
      return reply.status(400).send({ error: "no liquidity at this price — try a smaller amount" });
    }
    notifyTelegram(
      `🔮 💱 Verex — trade: ${r.side} ${r.outcome} on ${body.slug} — ${r.totalUsdc.toFixed(2)} USDC (account #${body.accountIndex})`
    );
    return {
      txHash: null, // settles asynchronously — poll jobId
      jobId: r.jobId,
      settlement: r.settlement,
      side: r.side,
      outcome: r.outcome,
      usdcAmount: r.totalUsdc,
      tokenAmount: r.totalTokens,
      price: r.avgPrice,
      newYesPrice: r.newYesPrice,
      faucetMinted: r.faucetMinted,
    };
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
    const r = await resolveMarket({ slug, outcome: body.outcome, accountIndex: body.accountIndex });
    notifyTelegram(`🔮 🏁 Verex — market resolved: ${slug} → ${r.resolvedOutcome}`);
    return r;
  } catch (e: any) {
    const status = e?.statusCode ?? 500;
    req.log.error(e);
    return reply.status(status).send({
      error: e?.shortMessage ?? e?.message ?? "resolve failed",
      detail: revertDetail(e),
    });
  }
});

// Copy UMA's settled answer onto a UMA market. Permissionless on purpose —
// the adapter's resolve() has no discretion, so requiring the operator here
// would let an absent operator strand payouts, which is the failure mode UMA
// exists to remove. 409 means UMA hasn't settled yet, not that anything broke.
app.post("/markets/:slug/uma-resolve", async (req, reply) => {
  try {
    const { slug } = req.params as { slug: string };
    const r = await resolveMarketFromUma(slug);
    const verdict = r.resolvedOutcome ?? "unresolvable (both sides redeem half)";
    notifyTelegram(`🔮 🏁 Verex — UMA resolved: ${slug} → ${verdict}`);
    return r;
  } catch (e: any) {
    const status = e?.statusCode ?? 500;
    req.log.error(e);
    return reply.status(status).send({
      error: e?.shortMessage ?? e?.message ?? "uma resolve failed",
      detail: revertDetail(e),
    });
  }
});

// ── The oracle lifecycle demo (mock oracle only for writes) ────────────────
// GET works against either oracle; the writes exist so the three dispute
// scenarios are walkable in a browser. See src/uma-demo.ts for why writes
// refuse to run against the real oracle.

app.get("/markets/:slug/uma", async (req, reply) => {
  try {
    const { slug } = req.params as { slug: string };
    return await umaLifecycle(slug);
  } catch (e: any) {
    return reply.status(e?.statusCode ?? 500).send({ error: e?.message ?? "uma state failed" });
  }
});

app.post("/markets/:slug/uma-propose", async (req, reply) => {
  try {
    const { slug } = req.params as { slug: string };
    const body = (req.body ?? {}) as { answer?: UmaAnswer; accountIndex?: number };
    if (!body.answer || !["Yes", "No", "Unresolvable"].includes(body.answer)) {
      return reply.status(400).send({ error: "answer must be Yes, No or Unresolvable" });
    }
    const r = await umaPropose(slug, body.answer, Number(body.accountIndex ?? 0));
    notifyTelegram(`🔮 📣 Verex — answer proposed on ${slug}: ${body.answer}`);
    return r;
  } catch (e: any) {
    req.log.error(e);
    return reply.status(e?.statusCode ?? 500).send({
      error: e?.shortMessage ?? e?.message ?? "propose failed",
      detail: revertDetail(e),
    });
  }
});

app.post("/markets/:slug/uma-dispute", async (req, reply) => {
  try {
    const { slug } = req.params as { slug: string };
    const body = (req.body ?? {}) as { accountIndex?: number };
    const r = await umaDispute(slug, Number(body.accountIndex));
    notifyTelegram(`🔮 ⚔️ Verex — proposal disputed on ${slug} by wallet #${body.accountIndex}`);
    return r;
  } catch (e: any) {
    req.log.error(e);
    return reply.status(e?.statusCode ?? 500).send({
      error: e?.shortMessage ?? e?.message ?? "dispute failed",
      detail: revertDetail(e),
    });
  }
});

app.post("/markets/:slug/uma-vote", async (req, reply) => {
  try {
    const { slug } = req.params as { slug: string };
    const body = (req.body ?? {}) as { accountIndex?: number; answer?: UmaAnswer };
    if (!body.answer || !["Yes", "No", "Unresolvable"].includes(body.answer)) {
      return reply.status(400).send({ error: "answer must be Yes, No or Unresolvable" });
    }
    return await umaVote(slug, Number(body.accountIndex), body.answer);
  } catch (e: any) {
    req.log.error(e);
    return reply.status(e?.statusCode ?? 500).send({
      error: e?.shortMessage ?? e?.message ?? "vote failed",
      detail: revertDetail(e),
    });
  }
});

app.post("/markets/:slug/uma-finalize", async (req, reply) => {
  try {
    const { slug } = req.params as { slug: string };
    const body = (req.body ?? {}) as { accountIndex?: number };
    const r = await umaFinalize(slug, Number(body.accountIndex ?? 0));
    notifyTelegram(`🔮 🧑‍⚖️ Verex — jury verdict finalized on ${slug}`);
    return r;
  } catch (e: any) {
    req.log.error(e);
    return reply.status(e?.statusCode ?? 500).send({
      error: e?.shortMessage ?? e?.message ?? "finalize failed",
      detail: revertDetail(e),
    });
  }
});

// Redeem a position in a resolved market (winner gets $1/token; one call clears both sides).
app.post("/redeem", async (req, reply) => {
  try {
    const body = (req.body ?? {}) as { slug?: string; accountIndex?: number; address?: string; txHash?: string };
    // V-D: an external holder sends its own redeemPositions — verex holds no
    // key for it — and then reports the transaction here. Same route, two
    // meanings: "do it for me" for a demo wallet, "I did it, here is the
    // proof" for an address verex does not custody.
    if (body.address !== undefined || body.txHash !== undefined) {
      if (!body.slug || !body.address || !body.txHash) {
        return reply.status(400).send({ error: "external redeem needs slug, address and txHash" });
      }
      return await recordExternalRedeem({ slug: body.slug, address: body.address, txHash: body.txHash });
    }
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

// Demo wallet: address, USDC balance, on-chain positions. Index 0 (the
// operator) returns address + balance only — identity display, no
// portfolio.
app.get("/wallet/:index", async (req, reply) => {
  const raw = (req.params as { index: string }).index;
  // V-C: the same path serves a demo-wallet index and a bare address. Two
  // registered routes would collide — `:index` and `:address` are the same
  // shape to the router, and whichever registered first would swallow both.
  if (isAddress(raw)) return walletSummaryByAddress(getAddress(raw));
  const index = Number(raw);
  if (!Number.isInteger(index) || index < 0 || index > 9) {
    return reply.status(400).send({ error: "expected a demo-wallet index 0..9 or a 0x address" });
  }
  return walletSummary(index);
});

// Demo wallet: in-flight redemptions (pending/running REDEEM jobs) — lets
// the portfolio re-attach its status chips after a revisit.
app.get("/wallet/:index/redeems", async (req, reply) => {
  const index = Number((req.params as { index: string }).index);
  if (!Number.isInteger(index) || index < 1 || index > 9) {
    return reply.status(400).send({ error: "index must be 1..9" });
  }
  return { redeems: await pendingRedeems(index) };
});

// Demo wallet: trade + redemption history (newest first), with realized P&L on redeems.
app.get("/wallet/:index/history", async (req, reply) => {
  const raw = (req.params as { index: string }).index;
  if (isAddress(raw)) return { history: await walletHistoryByAddress(getAddress(raw)) };
  const index = Number(raw);
  if (!Number.isInteger(index) || index < 1 || index > 9) {
    return reply.status(400).send({ error: "expected a demo-wallet index 1..9 or a 0x address" });
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
  const { accountIndex, address } = (req.body ?? {}) as { accountIndex?: number; address?: string };
  // V-B: an external maker has to arrive already funded — `checkExternalFunds`
  // will not mint into a wallet on its behalf mid-order. This is how it gets
  // funded in the first place, and it is testnet-only by construction: mint is
  // operator-gated on MockUSDC.
  if (address !== undefined) {
    if (!isAddress(address)) return reply.status(400).send({ error: "address is not a valid 0x address" });
    const r = await faucetTo(getAddress(address) as Address);
    notifyTelegram(`🔮 🚰 Verex — faucet claim: ${address} → +${r.usdc.toFixed(2)} USDC`);
    return r;
  }
  if (!Number.isInteger(accountIndex) || accountIndex! < 1 || accountIndex! > 9) {
    return reply.status(400).send({ error: "accountIndex must be 1..9, or send an address" });
  }
  const r = await faucet(accountIndex!);
  notifyTelegram(`🔮 🚰 Verex — faucet claim: account #${accountIndex} → +${r.usdc.toFixed(2)} USDC`);
  return r;
});

const start = async () => {
  startWorker();
  await app.listen({ port: Number(process.env.PORT ?? 4000), host: "0.0.0.0" });
};

start();
