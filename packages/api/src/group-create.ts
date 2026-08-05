// User-created markets, funded by the operator (design rev 2, Task B).
//
// POST /market-groups accepts the form, runs a pre-flight solvency check
// on the operator's USDC, writes a CREATING group row, and returns 202
// with a CREATE_GROUP job id. The job does everything on-chain — per
// outcome: prepareCondition → registerToken → splitPosition(L) — then
// writes the member rows, posts the opening MM ladders, and flips the
// group OPEN. Exactly two outcomes labeled Yes/No create a standalone
// binary market instead of a group.
//
// Anyone may create (no real auth — same trust level as trading); the
// creator's wallet address is recorded for display. Per-outcome liquidity
// is capped so a demo user can't drain the operator.

import { parseUnits, formatUnits } from "viem";
import type { ChainJob, OracleType } from "@prisma/client";
import { UMA_SEPOLIA, type Address } from "@verex/sdk";
import { prisma } from "./db";
import { loadChain, account } from "./chain";
import { enqueueJob, registerHandler } from "./worker";
import { createBinaryMarketOnChain, type UmaCreateArgs } from "./market-create";
import { postLadders } from "./mm";

const LIQUIDITY_DEFAULT = 100;
const LIQUIDITY_MAX = 1_000;
const OUTCOMES_MAX = 12;

// ── UMA defaults for a testnet demo.
//
// reward = 0 on purpose. A non-zero reward has to be held BY THE ADAPTER
// before initialize (requestPrice pulls it from the caller), so a non-zero
// default would make every creation fail until someone funds the adapter.
// The tradeoff is real and worth stating: with no reward, nobody is paid to
// propose an answer, so on staging the operator proposes it.
const UMA_REWARD = 0n;
/// Bond above UMA's final fee, in the reward token's units (WETH, 18dp).
/// 0.01 WETH is nominal — enough to make a careless proposal cost something
/// on a testnet, nowhere near a real security parameter.
const UMA_BOND = parseUnits("0.01", 18);
/// 1 hour instead of UMA's 7200s default. Shortened because a demo that needs
/// a two-hour wait before anyone can see resolution work isn't a demo.
const UMA_LIVENESS = 3600n;
/// Minimum length for resolution criteria. Not a formatting rule — this text
/// is the entire basis on which a UMA voter decides, and a one-word answer
/// there is how a market settles "unresolvable" and pays both sides half.
const CRITERIA_MIN = 20;

function httpError(message: string, statusCode: number): Error {
  return Object.assign(new Error(message), { statusCode });
}

export interface CreateGroupRequest {
  title: string;
  category: string;
  description?: string;
  imageUrl?: string;
  outcomes: { label: string }[];
  liquidityPerOutcome?: number;
  closesAt: string; // ISO datetime
  creatorIndex: number;
  /// Who resolves this market. Defaults to OPERATOR. Permanent once created.
  oracleType?: OracleType;
  /// Required when oracleType is UMA — the rules a voter decides by.
  resolutionCriteria?: string;
}

export interface CreateGroupResult {
  jobId: string;
  kind: "group" | "binary";
  slug: string; // group slug, or the market slug for a binary
  status: "CREATING";
}

interface CreatePayload {
  kind: "group" | "binary";
  groupId?: string;
  slug: string;
  title: string;
  category: string;
  description?: string;
  imageUrl?: string;
  closesAt: string;
  creator: string;
  liquidityE6: string;
  outcomes: { key: string; label: string }[];
  oracleType: OracleType;
  resolutionCriteria?: string;
  /// Resolved at request time, not job time: the environment's adapter could
  /// be replaced between enqueue and run, and the market must be created
  /// against the one that was validated.
  umaAdapter?: string;
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "market";

async function uniqueSlug(base: string, kind: "group" | "binary"): Promise<string> {
  for (let i = 0; ; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const clash =
      kind === "group"
        ? await prisma.marketGroup.findUnique({ where: { slug: candidate } })
        : await prisma.market.findUnique({ where: { slug: candidate } });
    if (!clash) return candidate;
  }
}

export async function createMarketGroup(req: CreateGroupRequest): Promise<CreateGroupResult> {
  const chain = await loadChain();
  if (chain.chainId === 0) throw httpError("market creation is disabled in this environment", 400);

  const title = req.title?.trim();
  if (!title || title.length < 8) throw httpError("question must be at least 8 characters", 400);
  if (!req.category?.trim()) throw httpError("category is required", 400);
  const labels = (req.outcomes ?? []).map((o) => o.label?.trim()).filter(Boolean) as string[];
  if (labels.length < 2) throw httpError("at least 2 outcomes are required", 400);
  if (labels.length > OUTCOMES_MAX) throw httpError(`at most ${OUTCOMES_MAX} outcomes`, 400);
  if (new Set(labels.map((l) => l.toLowerCase())).size !== labels.length) {
    throw httpError("outcome labels must be unique", 400);
  }
  const closesAt = new Date(req.closesAt);
  if (!(closesAt.getTime() > Date.now())) throw httpError("resolution date must be in the future", 400);
  const liquidity = req.liquidityPerOutcome ?? LIQUIDITY_DEFAULT;
  if (!(liquidity >= 1 && liquidity <= LIQUIDITY_MAX)) {
    throw httpError(`liquidity per outcome must be 1..${LIQUIDITY_MAX} USDC`, 400);
  }
  if (!Number.isInteger(req.creatorIndex) || req.creatorIndex < 0 || req.creatorIndex > 9) {
    throw httpError("creatorIndex must be 0..9", 400);
  }
  const creator = account(req.creatorIndex).address;

  // Exactly Yes/No → a standalone binary market, not a group.
  const isBinary =
    labels.length === 2 &&
    labels.map((l) => l.toLowerCase()).sort().join(",") === "no,yes";

  // ── Oracle choice. Validated here rather than in the job because it is
  // permanent: conditionId hashes the oracle's address, so a market created
  // against the wrong one cannot be repaired, only replaced.
  const oracleType: OracleType = req.oracleType ?? "OPERATOR";
  let resolutionCriteria: string | undefined;
  let umaAdapter: string | undefined;

  if (oracleType === "UMA") {
    if (!chain.umaAdapterAddr) {
      throw httpError(
        "UMA resolution isn't available in this environment — no UmaCtfAdapter " +
          "is deployed (see docs/runbooks/deploy.md §2b)",
        400,
      );
    }
    // Each member of a group would be its own independent UMA question, and
    // nothing coordinates the answers — UMA could settle Yes on two members at
    // once, which the group's "one winner, everyone else No" invariant has no
    // way to represent. Binary only until that's designed.
    if (!isBinary) {
      throw httpError(
        "UMA resolution currently supports binary (Yes/No) markets only — a " +
          "multi-outcome group would be N independent UMA questions with " +
          "nothing enforcing a single winner",
        400,
      );
    }
    resolutionCriteria = req.resolutionCriteria?.trim();
    if (!resolutionCriteria || resolutionCriteria.length < CRITERIA_MIN) {
      throw httpError(
        `resolution criteria are required for UMA markets (at least ` +
          `${CRITERIA_MIN} characters) — this text is the entire basis on ` +
          `which a UMA voter decides the answer, and a question without it ` +
          `is likely to settle "unresolvable", paying both sides half`,
        400,
      );
    }
    umaAdapter = chain.umaAdapterAddr;
  } else if (req.resolutionCriteria?.trim()) {
    // Harmless and useful on an operator market — shown in the UI, just not
    // sent to any oracle.
    resolutionCriteria = req.resolutionCriteria.trim();
  }

  // Pre-flight solvency: the operator funds L×N USDC of inventory. On a
  // test chain the shortfall is simply minted (MockUSDC); a real deployment
  // rejects with the numbers instead.
  const liquidityE6 = parseUnits(String(liquidity), 6);
  const totalE6 = liquidityE6 * BigInt(labels.length);
  const operatorBalance = await chain.usdcAs(0).balanceOf(chain.operator);
  if (operatorBalance < totalE6) {
    try {
      await chain.usdcAs(0).mint(chain.operator, totalE6 - operatorBalance);
    } catch {
      throw httpError(
        `operator can't fund this market: required ${formatUnits(totalE6, 6)} USDC, ` +
          `available ${formatUnits(operatorBalance, 6)}`,
        400,
      );
    }
  }

  const base = slugify(title);
  const slug = await uniqueSlug(base, isBinary ? "binary" : "group");

  let groupId: string | undefined;
  if (!isBinary) {
    const group = await prisma.marketGroup.create({
      data: {
        slug,
        title,
        description: req.description?.trim() || null,
        category: req.category.trim(),
        imageUrl: req.imageUrl?.trim() || null,
        status: "CREATING", // hidden from the homepage until the job finishes
        closesAt,
        creator,
      },
    });
    groupId = group.id;
  }

  const payload: CreatePayload = {
    kind: isBinary ? "binary" : "group",
    groupId,
    slug,
    title,
    category: req.category.trim(),
    description: req.description?.trim(),
    imageUrl: req.imageUrl?.trim(),
    closesAt: closesAt.toISOString(),
    creator,
    liquidityE6: liquidityE6.toString(),
    outcomes: labels.map((label) => ({ key: slugify(label), label })),
    oracleType,
    resolutionCriteria,
    umaAdapter,
  };
  const jobId = await enqueueJob("CREATE_GROUP", payload);
  return { jobId, kind: payload.kind, slug, status: "CREATING" };
}

/// Build the UMA arguments for one market, or undefined for the operator path.
///
/// The adapter address comes from the PAYLOAD, not from the current chain
/// config: the environment's adapter could have been replaced between enqueue
/// and run, and the market must be created against the one that was validated.
function umaArgs(
  p: CreatePayload,
  chain: Awaited<ReturnType<typeof loadChain>>,
): UmaCreateArgs | undefined {
  if (p.oracleType !== "UMA") return undefined;
  if (!p.umaAdapter || !p.resolutionCriteria) {
    throw new Error("UMA payload is missing its adapter address or resolution criteria");
  }
  return {
    adapter: chain.umaAs(0, p.umaAdapter as Address),
    title: p.title,
    resolutionCriteria: p.resolutionCriteria,
    closesAt: new Date(p.closesAt),
    // WETH rather than the market's own collateral: UMA only accepts bond
    // currencies on its AddressWhitelist, and Verex's MockUSDC is not on it.
    rewardToken: UMA_SEPOLIA.weth,
    reward: UMA_REWARD,
    bond: UMA_BOND,
    liveness: UMA_LIVENESS,
  } satisfies UmaCreateArgs;
}

/// Mid-run progress for the create page's bar — merged into the job row's
/// result while it's RUNNING (the worker overwrites it with the final value
/// on completion).
async function progress(job: ChainJob, done: number, total: number, stage: string) {
  await prisma.chainJob.update({
    where: { id: job.id },
    data: { result: { progress: { done, total, stage } } },
  });
}

registerHandler("CREATE_GROUP", {
  async run(job) {
    const p = job.payload as unknown as CreatePayload;
    const chain = await loadChain();
    const ct = chain.ctAs(0);
    const exchange = chain.exchangeAs(0);
    const liquidityE6 = BigInt(p.liquidityE6);
    const total = p.outcomes.length;
    const createdSlugs: string[] = [];

    // The seed approves the CTF for exactly its own inventory, so runtime
    // splits need a fresh allowance — top it up once, generously.
    const usdc = chain.usdcAs(0);
    const needed = liquidityE6 * BigInt(total) * 2n;
    const allowance = await usdc.allowance(chain.operator, chain.ctfAddr);
    if (allowance < needed) {
      await usdc.approve(chain.ctfAddr, parseUnits("1000000000", 6));
    }

    for (const [i, o] of p.outcomes.entries()) {
      const memberSlug = p.kind === "binary" ? p.slug : `${p.slug}-${o.key}`;
      // Idempotent resume: a member that already exists finished in a
      // previous attempt (createBinaryMarketOnChain is itself resumable).
      const existing = await prisma.market.findUnique({ where: { slug: memberSlug } });
      if (existing) {
        createdSlugs.push(memberSlug);
        continue;
      }
      await progress(job, i, total, `creating "${o.label}" on-chain`);

      if (p.kind === "binary") {
        // One market with real Yes/No outcomes.
        const onchain = await createBinaryMarketOnChain({
          ct,
          exchange,
          usdcAddr: chain.usdcAddr,
          operator: chain.operator,
          questionKey: `verex:${memberSlug}`,
          inventoryE6: liquidityE6 * 2n, // both labels share one condition
          uma: umaArgs(p, chain),
        });
        const market = await prisma.market.create({
          data: {
            slug: memberSlug,
            title: p.title,
            description: p.description,
            category: p.category,
            imageUrl: p.imageUrl,
            closesAt: new Date(p.closesAt),
            creator: p.creator,
            quoteCenter: 0.5,
            questionId: onchain.questionId,
            conditionId: onchain.conditionId,
            yesTokenId: onchain.yesTokenId,
            noTokenId: onchain.noTokenId,
            oracleType: p.oracleType,
            umaAdapter: p.oracleType === "UMA" ? p.umaAdapter : null,
            umaAncillaryData: onchain.ancillaryData ?? null,
            resolutionCriteria: p.resolutionCriteria ?? null,
            outcomes: {
              create: [
                { label: "Yes", price: 0.5, tokenId: onchain.yesTokenId, sortOrder: 0 },
                { label: "No", price: 0.5, tokenId: onchain.noTokenId, sortOrder: 1 },
              ],
            },
          },
        });
        await prisma.pricePoint.create({ data: { marketId: market.id, price: 0.5 } });
        createdSlugs.push(memberSlug);
        break; // binary = single market, outcomes were just labels
      }

      const center = Number((1 / total).toFixed(4));
      const onchain = await createBinaryMarketOnChain({
        ct,
        exchange,
        usdcAddr: chain.usdcAddr,
        operator: chain.operator,
        questionKey: `verex:${memberSlug}`,
        inventoryE6: liquidityE6,
      });
      const market = await prisma.market.create({
        data: {
          slug: memberSlug,
          title: `${p.title} — ${o.label}`,
          description: p.description,
          category: p.category,
          closesAt: new Date(p.closesAt),
          creator: p.creator,
          groupId: p.groupId,
          groupLabel: o.label,
          sortOrder: i,
          quoteCenter: center,
          questionId: onchain.questionId,
          conditionId: onchain.conditionId,
          yesTokenId: onchain.yesTokenId,
          noTokenId: onchain.noTokenId,
          // Group members are always operator-resolved — the UMA path is
          // rejected for groups at request time (see createMarketGroup).
          resolutionCriteria: p.resolutionCriteria ?? null,
          outcomes: {
            create: [
              { label: "Yes", price: center, tokenId: onchain.yesTokenId, sortOrder: 0 },
              { label: "No", price: Number((1 - center).toFixed(4)), tokenId: onchain.noTokenId, sortOrder: 1 },
            ],
          },
        },
      });
      await prisma.pricePoint.create({ data: { marketId: market.id, price: center } });
      createdSlugs.push(memberSlug);
    }

    // Opening books for everything we just created.
    await progress(job, total, total, "posting opening liquidity");
    for (const slug of createdSlugs) {
      const market = await prisma.market.findUniqueOrThrow({ where: { slug }, select: { id: true, quoteCenter: true } });
      await postLadders(market.id, Number(market.quoteCenter));
    }

    if (p.groupId) {
      await prisma.marketGroup.update({ where: { id: p.groupId }, data: { status: "OPEN" } });
    }
    return { slug: p.slug, kind: p.kind, markets: createdSlugs };
  },

  /// Terminal failure: hide the half-made group. Prepared conditions and
  /// any minted inventory stay on-chain as orphans (harmless, same as a
  /// re-seed); created member markets are removed so the UI never shows a
  /// partial group.
  async onFailed(job) {
    const p = job.payload as unknown as CreatePayload;
    if (p.groupId) {
      await prisma.market.deleteMany({ where: { groupId: p.groupId } });
      await prisma.marketGroup.update({
        where: { id: p.groupId },
        data: { status: "CANCELLED" },
      });
    }
  },
});
