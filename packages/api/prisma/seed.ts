// Seed: real CTF markets on anvil + DB mirror.
//
// What it does (run after `prisma migrate reset` for a clean slate):
//   1. Resolves the CTF backbone and stores its addresses in ChainConfig:
//      VEREX_DEPLOY_TARGET=staging|prod reads the committed entry in
//      packages/contracts/deployments.json (after an on-chain code preflight);
//      local (the default) deploys fresh via forge, or reuses USDC_ADDR/
//      CTF_ADDR/EXCHANGE_ADDR from the shell env / packages/contracts/.env.
//   2. One-time exchange setup: operator allowlist + USDC approvals.
//   3. Per market: prepareCondition → registerToken → split operator
//      inventory, then writes the Market/Outcome rows + synthetic price
//      history for the chart.
//
// Requires: anvil running on http://127.0.0.1:8545, foundry in ~/.foundry.
//
//   anvil &
//   pnpm --filter @verex/api db:reset   (migrate reset --force + this seed)

import { config as loadEnv } from "dotenv";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve as pathResolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { keccak256, toHex, parseUnits } from "viem";
import {
  createCTClient,
  createExchangeClient,
  createUsdcClient,
  createUmaAdapterClient,
  UMA_SEPOLIA,
  type Address,
  type Hex,
  type UmaAdapterClient,
} from "@verex/sdk";
import {
  accountAddress,
  makePublicClient,
  makeWalletClient,
  RPC_URL,
  CHAIN_ID,
} from "../src/chain";
import { createBinaryMarketOnChain } from "../src/market-create";
import { postLadders } from "../src/mm";

const CONTRACTS_DIR = pathResolve(__dirname, "../../contracts");
const FOUNDRY_PATH = `${process.env.HOME}/.foundry/bin:${process.env.PATH}`;

loadEnv(); // packages/api/.env
// USDC_ADDR/CTF_ADDR/EXCHANGE_ADDR are deliberately not part of packages/api/.env
// (one-time deploy outputs, not persistent API config — see docs/runbooks/
// deploy.md §5) — but if they're saved in packages/contracts/.env
// after a deploy, pick them up from there too. dotenv never overrides a key
// that's already set, so anything already in packages/api/.env or the shell
// environment still wins over this.
loadEnv({ path: pathResolve(CONTRACTS_DIR, ".env") });

// Which deployed backbone to seed against. 'local' (the default) keeps the
// anvil flow: env addresses or a fresh forge deploy. 'staging'/'prod' read the
// committed manifest below — cloud deploys pass this via deploy.sh, so a prod
// seed physically can't pick up the staging backbone (or vice versa).
const DEPLOY_TARGET = process.env.VEREX_DEPLOY_TARGET ?? "local";
if (DEPLOY_TARGET === "test") {
  throw new Error("VEREX_DEPLOY_TARGET 'test' was renamed to 'staging' (2026-07-28)");
}
if (!["local", "staging", "prod"].includes(DEPLOY_TARGET)) {
  throw new Error(`VEREX_DEPLOY_TARGET must be local|staging|prod, got '${DEPLOY_TARGET}'`);
}

const prisma = new PrismaClient();

/// Operator liquidity per market (YES+NO inventory) and USDC buffer for
/// buying tokens back when users sell.
const INVENTORY_PER_MARKET = parseUnits("10000", 6); // 10,000 USDC
/// Group members get lighter inventory — there are N of them per group and
/// the MM ladder caps at 2k tokens anyway.
const INVENTORY_PER_MEMBER = parseUnits("2000", 6); // 2,000 USDC
const OPERATOR_USDC_BUFFER = parseUnits("100000", 6); // 100,000 USDC
/// Starting balance for demo wallets #1-5 (matches AUTO_FAUCET_USDC in src/trade.ts).
const DEMO_WALLET_USDC = parseUnits("1000", 6); // 1,000 USDC

// ── The one UMA-resolved seed market (see §4b).
//
// Seeded only where deployments.json carries a `umaAdapter`. It exists so a
// fresh environment has something to exercise the propose → wait → resolve
// path against without anyone hand-crafting a market first — that lifecycle is
// the "≥1 market per adapter" milestone in docs/tasks/current-plan.md.
/// Matches src/group-create.ts's UMA_BOND. Nominal for a testnet: enough that a
/// careless proposal costs something, nowhere near a real security parameter.
const UMA_SEED_BOND = parseUnits("0.01", 18); // WETH, 18dp
/// 1 hour instead of UMA's 7200s default, so the demo's challenge window is
/// something a person will actually sit through.
const UMA_SEED_LIVENESS = 3600n;
/// Mock-oracle variants (local anvil). The mock has no currency whitelist, so
/// the bond is plain USDC — demo wallets already hold it — and liveness drops
/// to 5 minutes: long enough to click "dispute", short enough that the
/// undisputed path is also demonstrable without warping the chain.
const UMA_SEED_BOND_MOCK = parseUnits("10", 6); // 10 USDC
const UMA_SEED_LIVENESS_MOCK = 300n;
const UMA_SEED = {
  slug: "uma-eth-above-6k-2026",
  title: "Will ETH close above $6,000 in 2026? (UMA-resolved)",
  description:
    "Settled by UMA's Optimistic Oracle rather than the Verex operator — anyone can finalise it once the challenge window closes.",
  category: "Crypto",
  imageUrl:
    "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSd4Wb7L9skxMOIaWTrmMY2jjMsBjnnXCzc1yJO92bBzUetn3WbS_XL278r&s=10",
  yesPrice: 0.62,
  displayVolume: 880_000,
  closesAt: "2026-12-31T23:59:59Z",
  // Deliberately over-specified. This text is the entire basis a UMA voter
  // decides on; a vaguer question is how a market settles "unresolvable",
  // which pays both sides half.
  resolutionCriteria:
    "Resolves YES if the daily close of ETH/USD on Coinbase (ETH-USD spot, 00:00 UTC daily close) " +
    "is strictly greater than 6000.00 USD on any calendar day in 2026 (UTC). Resolves NO if no such " +
    "day occurs before 2027-01-01T00:00:00Z. If Coinbase ETH-USD is unavailable for a given day, use " +
    "the Kraken ETH/USD daily close for that day instead.",
};

type SeedMarket = {
  slug: string;
  title: string;
  description: string;
  category: string;
  imageUrl?: string; // logo; unset falls back to the per-slug picsum photo
  yesPrice: number; // initial implied probability
  displayVolume: number; // synthetic display volume (demo data)
  closesAt: string;
};

// Original questions (clean-room — not copied from any reference site).
const MARKETS: SeedMarket[] = [
  {
    slug: "us-federal-stablecoin-law-2026",
    title: "Will the US enact a federal stablecoin law in 2026?",
    description:
      "Resolves YES if a federal bill establishing a regulatory framework for payment stablecoins is signed into law before Jan 1, 2027.",
    category: "Politics",
    imageUrl:
      "https://cdn.prod.website-files.com/6779cec685b83bf2876d67f3/67d99e0ff6d01f5a279cfb8e_coin-1.png",
    yesPrice: 0.58,
    displayVolume: 1_240_000,
    closesAt: "2026-12-31T23:59:59Z",
  },
  {
    slug: "kr-constitutional-referendum-2027",
    title: "Will South Korea hold a constitutional referendum before 2028?",
    description:
      "Resolves YES if a national referendum on constitutional amendment is held in South Korea before Jan 1, 2028.",
    category: "Politics",
    imageUrl: "https://cdn12.picryl.com/photo/2016/12/31/seoul-korea-asia-travel-vacation-753950-1024.jpg",
    yesPrice: 0.22,
    displayVolume: 342_000,
    closesAt: "2027-12-31T23:59:59Z",
  },
  {
    slug: "kr-world-cup-quarterfinals-2026",
    title: "Will South Korea reach the 2026 World Cup quarterfinals?",
    description:
      "Resolves YES if the South Korean national team plays in a quarterfinal match of the 2026 FIFA World Cup.",
    category: "Sports",
    imageUrl: "https://live.staticflickr.com/65535/52521280235_977d7b8e77_b.jpg",
    yesPrice: 0.31,
    displayVolume: 2_810_000,
    closesAt: "2026-07-10T00:00:00Z",
  },
  {
    slug: "eth-above-10k-2026",
    title: "Will ETH close above $10,000 in 2026?",
    description:
      "Resolves YES if the daily close of ETH/USD exceeds $10,000 on any day in 2026 (major exchange composite).",
    category: "Crypto",
    imageUrl:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSd4Wb7L9skxMOIaWTrmMY2jjMsBjnnXCzc1yJO92bBzUetn3WbS_XL278r&s=10",
    yesPrice: 0.44,
    displayVolume: 5_620_000,
    closesAt: "2026-12-31T23:59:59Z",
  },
  {
    slug: "btc-dominance-below-40-2026",
    title: "Will Bitcoin dominance drop below 40% in 2026?",
    description:
      "Resolves YES if BTC market-cap dominance prints below 40% at any point in 2026.",
    category: "Crypto",
    imageUrl:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSWjsrRY1DE4jAOv_ebrdJsjAlZcCWYQ3HieLJ2jlgJOqZx3z_72L08BWw&s=10",
    yesPrice: 0.27,
    displayVolume: 1_980_000,
    closesAt: "2026-12-31T23:59:59Z",
  },
  {
    slug: "fed-rate-below-3-dec-2026",
    title: "Will the Fed funds rate be below 3% in December 2026?",
    description:
      "Resolves YES if the upper bound of the federal funds target range is below 3.00% after the December 2026 FOMC meeting.",
    category: "Economics",
    imageUrl:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR9io1IdJzK1lJW8F860vDWZhE7ucMeEvQskuI3y0tlqDtkH_5ecaYZm5A&s=10",
    yesPrice: 0.36,
    displayVolume: 4_070_000,
    closesAt: "2026-12-16T20:00:00Z",
  },
  {
    slug: "ai-imo-gold-2026",
    title: "Will an AI system win an IMO gold medal in 2026?",
    description:
      "Resolves YES if an AI system achieves a gold-medal score at the 2026 International Mathematical Olympiad under organizer-sanctioned evaluation.",
    category: "Tech & Science",
    imageUrl:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT9WR-GNfOIdDzOBanEbWGDSy80hok9HldfjfI7VNQjtsbLTudj-dhB30za&s=10",
    yesPrice: 0.71,
    displayVolume: 3_450_000,
    closesAt: "2026-07-20T00:00:00Z",
  },
  {
    slug: "humanoid-robot-100k-units-2026",
    title: "Will any humanoid robot ship 100k units in 2026?",
    description:
      "Resolves YES if a single humanoid robot model ships at least 100,000 units to customers during 2026.",
    category: "Tech & Science",
    imageUrl:
      "https://substackcdn.com/image/fetch/$s_!Ml7f!,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F102f4fec-b405-4a57-854b-7e642b09d8bb_1024x683.jpeg",
    yesPrice: 0.18,
    displayVolume: 890_000,
    closesAt: "2026-12-31T23:59:59Z",
  },
  {
    slug: "hottest-year-record-2026",
    title: "Will 2026 be the hottest year on record?",
    description:
      "Resolves YES if 2026 sets a new global mean surface temperature record per NASA GISS or NOAA.",
    category: "Climate",
    imageUrl:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRUP2cxJtOku3W7p4AE0F-_tBn4j_jx5ZsWiAnmwdvr-TKYnuKy625QqqA&s=10",
    yesPrice: 0.52,
    displayVolume: 760_000,
    closesAt: "2027-01-31T00:00:00Z",
  },
  {
    slug: "kpop-headliner-coachella-2027",
    title: "Will a K-pop act headline Coachella 2027?",
    description:
      "Resolves YES if a K-pop artist or group is announced as a headliner for Coachella 2027.",
    category: "Culture",
    imageUrl:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTTKhyy6G_eKm8b8-PEmN9-F6cFnd5HNEIUgWcroDdQpA&s=10",
    yesPrice: 0.63,
    displayVolume: 512_000,
    closesAt: "2027-01-15T00:00:00Z",
  },
];

type SeedGroupOutcome = {
  key: string; // slug suffix: "aaron-judge"
  label: string; // chip text: "Aaron Judge"
  prob: number; // initial probability — each group's probs sum to 1
};

type SeedGroup = {
  slug: string;
  title: string;
  description: string;
  category: string;
  closesAt: string;
  displayVolume: number; // split across members by probability share
  /// Full legal question for one member, e.g. label → "Will X win …?"
  question: (label: string) => string;
  outcomes: SeedGroupOutcome[];
};

// Multi-outcome groups (rev 2): each outcome is its own binary CTF market;
// the group is the DB wrapper. Original questions, clean-room.
const GROUPS: SeedGroup[] = [
  {
    slug: "mlb-home-run-derby-2026",
    title: "Who will win the 2026 MLB Home Run Derby?",
    description:
      "Resolves to the player who wins the 2026 MLB Home Run Derby at All-Star week. 'The field' covers any player not listed.",
    category: "Sports",
    closesAt: "2026-07-13T22:00:00Z",
    displayVolume: 1_870_000,
    question: (label) =>
      label === "The field"
        ? "Will a player not listed here win the 2026 MLB Home Run Derby?"
        : `Will ${label} win the 2026 MLB Home Run Derby?`,
    outcomes: [
      { key: "aaron-judge", label: "Aaron Judge", prob: 0.24 },
      { key: "shohei-ohtani", label: "Shohei Ohtani", prob: 0.2 },
      { key: "juan-soto", label: "Juan Soto", prob: 0.14 },
      { key: "kyle-schwarber", label: "Kyle Schwarber", prob: 0.12 },
      { key: "pete-alonso", label: "Pete Alonso", prob: 0.1 },
      { key: "vladimir-guerrero-jr", label: "Vladimir Guerrero Jr.", prob: 0.08 },
      { key: "field", label: "The field", prob: 0.12 },
    ],
  },
  {
    slug: "world-series-champion-2026",
    title: "Who will win the 2026 World Series?",
    description:
      "Resolves to the team that wins the 2026 World Series. 'The field' covers any team not listed.",
    category: "Sports",
    closesAt: "2026-11-05T00:00:00Z",
    displayVolume: 4_930_000,
    question: (label) =>
      label === "The field"
        ? "Will a team not listed here win the 2026 World Series?"
        : `Will the ${label} win the 2026 World Series?`,
    outcomes: [
      { key: "dodgers", label: "Los Angeles Dodgers", prob: 0.22 },
      { key: "yankees", label: "New York Yankees", prob: 0.16 },
      { key: "braves", label: "Atlanta Braves", prob: 0.13 },
      { key: "astros", label: "Houston Astros", prob: 0.11 },
      { key: "phillies", label: "Philadelphia Phillies", prob: 0.1 },
      { key: "orioles", label: "Baltimore Orioles", prob: 0.09 },
      { key: "mariners", label: "Seattle Mariners", prob: 0.07 },
      { key: "field", label: "The field", prob: 0.12 },
    ],
  },
  {
    slug: "time-person-of-year-2026",
    title: "Who will be TIME Person of the Year 2026?",
    description:
      "Resolves to TIME magazine's announced Person of the Year for 2026. 'The field' covers anyone not listed.",
    category: "Culture",
    closesAt: "2026-12-10T00:00:00Z",
    displayVolume: 640_000,
    question: (label) =>
      label === "The field"
        ? "Will someone not listed here be named TIME Person of the Year 2026?"
        : `Will ${label} be named TIME Person of the Year 2026?`,
    outcomes: [
      { key: "trump", label: "Donald Trump", prob: 0.18 },
      { key: "altman", label: "Sam Altman", prob: 0.15 },
      { key: "swift", label: "Taylor Swift", prob: 0.12 },
      { key: "zelenskyy", label: "Volodymyr Zelenskyy", prob: 0.1 },
      { key: "powell", label: "Jerome Powell", prob: 0.08 },
      { key: "field", label: "The field", prob: 0.37 },
    ],
  },
];

// Guard: a group whose probabilities don't sum to 1 renders nonsense.
for (const g of GROUPS) {
  const sum = g.outcomes.reduce((a, o) => a + o.prob, 0);
  if (Math.abs(sum - 1) > 1e-9) {
    throw new Error(`seed group ${g.slug}: probs sum to ${sum}, expected 1`);
  }
}

interface Backbone {
  usdc: Address;
  ctf: Address;
  exchange: Address;
  /// Optional per environment — only set once runbook §2b has been run.
  /// Absent means markets here can only be operator-resolved.
  umaAdapter?: Address;
  /// The oracle the adapter is bound to. On local anvil this is the
  /// MockOptimisticOracleV2 (umaMock true) whose DVM is a demo-wallet jury;
  /// on staging/prod it is the real OptimisticOracleV2.
  umaOracle?: Address;
  umaMock?: boolean;
}

const DEPLOYMENTS_PATH = pathResolve(CONTRACTS_DIR, "deployments.json");

/// test/prod backbones come from the committed manifest (written by
/// scripts/save-deployment.ts right after a forge deploy), never from mutable
/// .env files — so seeding one environment can't silently pick up another's
/// addresses. Addresses are public on-chain data; committing them is safe and
/// gives an audit trail of which backbone each environment ran on.
function manifestBackbone(target: string): Backbone {
  let entries: Record<string, ({ chainId: number } & Backbone) | undefined>;
  try {
    entries = JSON.parse(readFileSync(DEPLOYMENTS_PATH, "utf8"));
  } catch {
    throw new Error(`could not read ${DEPLOYMENTS_PATH} — it should be committed to the repo`);
  }
  const entry = entries[target];
  if (!entry) {
    throw new Error(
      `no '${target}' entry in deployments.json — deploy the backbone first, then run: ` +
        `pnpm --filter @verex/api save-deployment ${target}`,
    );
  }
  if (entry.chainId !== CHAIN_ID) {
    throw new Error(
      `deployments.json '${target}' is for chain ${entry.chainId}, but VEREX_CHAIN_ID=${CHAIN_ID}`,
    );
  }
  return {
    usdc: entry.usdc,
    ctf: entry.ctf,
    exchange: entry.exchange,
    umaAdapter: entry.umaAdapter,
    umaOracle: entry.umaOracle,
    umaMock: entry.umaMock ?? false,
  };
}

function parseDeployOutput(out: string): Backbone {
  const grab = (label: string) => {
    const re = new RegExp(`${label}:\\s*(0x[a-fA-F0-9]{40})`);
    const m = out.match(re);
    if (!m) throw new Error(`could not parse ${label} from forge output`);
    return m[1] as Address;
  };
  return {
    usdc: grab("MockUSDC"),
    ctf: grab("ConditionalTokens"),
    exchange: grab("CTFExchange"),
  };
}

/// Deterministic PRNG per market so re-seeds produce the same chart.
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/// 45 days of synthetic YES-price history ending at the seeded price.
function priceHistory(slug: string, endPrice: number): { price: number; at: Date }[] {
  const rand = mulberry32(
    [...slug].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7),
  );
  const days = 45;
  const points: number[] = [endPrice];
  let p = endPrice;
  for (let i = 1; i < days; i++) {
    p = Math.min(0.95, Math.max(0.05, p + (rand() - 0.5) * 0.06));
    points.unshift(p);
  }
  const now = Date.now();
  return points.map((price, i) => ({
    price: Number(price.toFixed(4)),
    at: new Date(now - (days - 1 - i) * 24 * 3600 * 1000),
  }));
}

/// DB-only mode (SEED_DB_ONLY=1): no chain at all — markets get pseudo
/// on-chain identifiers and ChainConfig.chainId=0, which the API treats as
/// "trading disabled". Used for cloud staging until the chain decision
/// (Task 2: testnet vs hosted anvil).
async function mainDbOnly() {
  console.log("[db-only] seeding without a chain (trading disabled)");
  await prisma.chainJob.deleteMany();
  await prisma.trade.deleteMany();
  await prisma.order.deleteMany();
  await prisma.pricePoint.deleteMany();
  await prisma.outcome.deleteMany();
  await prisma.market.deleteMany();
  await prisma.marketGroup.deleteMany();
  await prisma.chainConfig.deleteMany();
  const ZERO = "0x0000000000000000000000000000000000000000";
  await prisma.chainConfig.create({
    data: { id: 1, chainId: 0, rpcUrl: "none", usdcAddr: ZERO, ctfAddr: ZERO, exchangeAddr: ZERO, operator: ZERO },
  });

  for (const m of MARKETS) {
    const questionId: Hex = keccak256(toHex(`verex:${m.slug}`));
    const conditionId = keccak256(toHex(`verex-cond:${m.slug}`));
    const yesTokenId = BigInt(keccak256(toHex(`verex-yes:${m.slug}`))).toString();
    const noTokenId = BigInt(keccak256(toHex(`verex-no:${m.slug}`))).toString();
    const market = await prisma.market.create({
      data: {
        slug: m.slug,
        title: m.title,
        description: m.description,
        category: m.category,
        imageUrl: m.imageUrl,
        volume: m.displayVolume,
        closesAt: new Date(m.closesAt),
        questionId,
        conditionId,
        yesTokenId,
        noTokenId,
        outcomes: {
          create: [
            { label: "Yes", price: m.yesPrice, tokenId: yesTokenId, sortOrder: 0 },
            { label: "No", price: Number((1 - m.yesPrice).toFixed(4)), tokenId: noTokenId, sortOrder: 1 },
          ],
        },
      },
    });
    await prisma.pricePoint.createMany({
      data: priceHistory(m.slug, m.yesPrice).map((p) => ({ marketId: market.id, price: p.price, at: p.at })),
    });
    console.log(`[db-only] ${m.slug}`);
  }

  // Groups get the same pseudo-id treatment so the cloud staging UI can
  // render them (trading stays disabled there anyway).
  for (const g of GROUPS) {
    const group = await prisma.marketGroup.create({
      data: {
        slug: g.slug,
        title: g.title,
        description: g.description,
        category: g.category,
        status: "OPEN",
        closesAt: new Date(g.closesAt),
      },
    });
    for (const [i, o] of g.outcomes.entries()) {
      const slug = `${g.slug}-${o.key}`;
      const yesTokenId = BigInt(keccak256(toHex(`verex-yes:${slug}`))).toString();
      const noTokenId = BigInt(keccak256(toHex(`verex-no:${slug}`))).toString();
      const market = await prisma.market.create({
        data: {
          slug,
          title: g.question(o.label),
          description: g.description,
          category: g.category,
          volume: Math.round(g.displayVolume * o.prob),
          closesAt: new Date(g.closesAt),
          questionId: keccak256(toHex(`verex:${slug}`)),
          conditionId: keccak256(toHex(`verex-cond:${slug}`)),
          yesTokenId,
          noTokenId,
          groupId: group.id,
          groupLabel: o.label,
          sortOrder: i,
          quoteCenter: o.prob,
          outcomes: {
            create: [
              { label: "Yes", price: o.prob, tokenId: yesTokenId, sortOrder: 0 },
              { label: "No", price: Number((1 - o.prob).toFixed(4)), tokenId: noTokenId, sortOrder: 1 },
            ],
          },
        },
      });
      await prisma.pricePoint.createMany({
        data: priceHistory(slug, o.prob).map((p) => ({ marketId: market.id, price: p.price, at: p.at })),
      });
    }
    console.log(`[db-only] group ${g.slug}`);
  }
  console.log(`\n✓ seeded ${MARKETS.length} DB-only markets + ${GROUPS.length} groups (no chain)`);
}

async function main() {
  if (process.env.SEED_DB_ONLY === "1") return mainDbOnly();

  const pc = makePublicClient();

  // Guard: anvil must be up.
  try {
    await pc.getChainId();
  } catch {
    throw new Error(`anvil not reachable at ${RPC_URL} — start it first ("anvil")`);
  }

  // 1. Resolve the backbone: manifest for test/prod, env/fresh-deploy for local
  let backbone: Backbone;
  if (DEPLOY_TARGET !== "local") {
    backbone = manifestBackbone(DEPLOY_TARGET);
    if (process.env.USDC_ADDR && process.env.USDC_ADDR !== backbone.usdc) {
      console.warn(
        `    (ignoring USDC_ADDR/CTF_ADDR/EXCHANGE_ADDR from env — the manifest wins for target '${DEPLOY_TARGET}')`,
      );
    }
    // Preflight: all three addresses must hold contract code on this RPC —
    // a wrong-RPC or stale-manifest mixup fails here in seconds instead of
    // partway through ~32 real transactions.
    for (const [name, addr] of Object.entries(backbone)) {
      if (!addr) continue; // umaAdapter is optional — absent is a valid state
      const code = await pc.getCode({ address: addr as Address });
      if (!code || code === "0x") {
        throw new Error(
          `preflight failed: no contract code at ${name} ${addr} on ${RPC_URL} — ` +
            `wrong RPC for target '${DEPLOY_TARGET}', or a stale deployments.json entry`,
        );
      }
    }
    console.log(`[1] using '${DEPLOY_TARGET}' backbone from deployments.json (preflight OK)`);
  } else if (process.env.USDC_ADDR && process.env.CTF_ADDR && process.env.EXCHANGE_ADDR) {
    backbone = {
      usdc: process.env.USDC_ADDR as Address,
      ctf: process.env.CTF_ADDR as Address,
      exchange: process.env.EXCHANGE_ADDR as Address,
    };
    console.log("[1] reusing backbone from env");
  } else {
    console.log("[1] deploying CTF backbone via forge...");
    const out = execSync(
      `forge script script/DeployCTF.s.sol --rpc-url ${RPC_URL} --broadcast`,
      { cwd: CONTRACTS_DIR, env: { ...process.env, PATH: FOUNDRY_PATH } },
    ).toString();
    backbone = parseDeployOutput(out);
  }

  // Local only: deploy the demo oracle stack — MockOptimisticOracleV2 plus an
  // UNCHANGED UmaCtfAdapter bound to it — so the dispute scenarios (defeated /
  // upheld / dead end) are walkable in the browser with the demo wallets as
  // the jury. A fresh stack per seed is correct: the adapter's address is part
  // of every conditionId it prepares, and the seed recreates those markets.
  if (DEPLOY_TARGET === "local") {
    console.log("[1b] deploying mock oracle + adapter via forge...");
    const out = execSync(
      `forge script script/DeployMockOracle.s.sol --rpc-url ${RPC_URL} --broadcast`,
      { cwd: CONTRACTS_DIR, env: { ...process.env, PATH: FOUNDRY_PATH, CTF_ADDR: backbone.ctf } },
    ).toString();
    const grab = (label: string) => {
      const m = out.match(new RegExp(`${label}:\\s*(0x[a-fA-F0-9]{40})`));
      if (!m) throw new Error(`could not parse ${label} from DeployMockOracle output`);
      return m[1] as Address;
    };
    backbone.umaOracle = grab("MockOptimisticOracleV2");
    backbone.umaAdapter = grab("UmaCtfAdapter");
    backbone.umaMock = true;
  }
  console.log(`    USDC ${backbone.usdc}\n    CTF ${backbone.ctf}\n    Exchange ${backbone.exchange}`);
  if (backbone.umaAdapter) {
    console.log(`    UmaCtfAdapter ${backbone.umaAdapter} (oracle ${backbone.umaOracle}${backbone.umaMock ? ", MOCK jury" : ""})`);
  }

  const operator = accountAddress(0);
  const operatorWallet = makeWalletClient(0);
  const ct = createCTClient({ address: backbone.ctf, publicClient: pc, walletClient: operatorWallet });
  const exchange = createExchangeClient({ address: backbone.exchange, publicClient: pc, walletClient: operatorWallet });
  const usdc = createUsdcClient({ address: backbone.usdc, publicClient: pc, walletClient: operatorWallet });
  // Null unless this environment has an adapter — every UMA branch below keys
  // off this rather than off the address, so "no adapter" degrades to a normal
  // operator-only seed instead of an error.
  const umaAdapterClient: UmaAdapterClient | null = backbone.umaAdapter
    ? createUmaAdapterClient({
        address: backbone.umaAdapter,
        publicClient: pc,
        walletClient: operatorWallet,
      })
    : null;

  // 2. One-time exchange setup for the operator
  console.log("[2] operator setup (allowlist + approvals + USDC buffer)...");
  await exchange.addOperator(operator);
  await ct.setApprovalForAll(backbone.exchange, true); // exchange pulls YES/NO on fills
  const memberCount = GROUPS.reduce((a, g) => a + g.outcomes.length, 0);
  const totalInventory =
    INVENTORY_PER_MARKET * BigInt(MARKETS.length) + INVENTORY_PER_MEMBER * BigInt(memberCount);
  const totalMint = OPERATOR_USDC_BUFFER + totalInventory;
  await usdc.mint(operator, totalMint);
  await usdc.approve(backbone.ctf, totalInventory); // splits pull via CTF
  await usdc.approve(backbone.exchange, OPERATOR_USDC_BUFFER); // fills pull the operator's USDC (MM bids) via the exchange

  // Pre-fund + pre-approve demo wallets #1-5. Funding is a top-up (not blind
  // mint) so re-running the seed against a reused backbone doesn't inflate
  // balances — the trade-time auto-faucet in src/trade.ts stays as a safety
  // net either way. Approvals (USDC → exchange, CT → exchange) mirror what
  // executeTrade would otherwise do lazily on a wallet's first trade
  // (trade.ts's BUY/SELL branches) — doing it here means a demo BUY is
  // always a single fillOrder confirmation, not up to three chained ones.
  // See docs/tasks/details/jul-22-trade-resolution-latency-ux.md.
  console.log("[2b] funding + approving demo wallets #1-5...");
  const DEMO_APPROVAL = parseUnits("1000000000", 6); // effectively unlimited, same as trade.ts's approve
  for (let i = 1; i <= 5; i++) {
    const user = accountAddress(i);
    const bal = await usdc.balanceOf(user);
    if (bal < DEMO_WALLET_USDC) await usdc.mint(user, DEMO_WALLET_USDC - bal);

    const userWallet = makeWalletClient(i);
    const userUsdc = createUsdcClient({ address: backbone.usdc, publicClient: pc, walletClient: userWallet });
    const userCt = createCTClient({ address: backbone.ctf, publicClient: pc, walletClient: userWallet });
    await userUsdc.approve(backbone.exchange, DEMO_APPROVAL);
    await userCt.setApprovalForAll(backbone.exchange, true);
    // Mock oracle: dispute bonds are pulled in USDC, so pre-approve it the
    // same way trades are — a dispute should be one confirmation, not two.
    if (backbone.umaMock && backbone.umaOracle) {
      await userUsdc.approve(backbone.umaOracle, DEMO_APPROVAL);
    }
  }
  // The operator proposes answers on mock-oracle markets, bonding USDC too.
  if (backbone.umaMock && backbone.umaOracle) {
    await usdc.approve(backbone.umaOracle, DEMO_APPROVAL);
  }

  // 3. Reset DB content and store chain config
  console.log("[3] resetting DB rows...");
  await prisma.chainJob.deleteMany();
  await prisma.trade.deleteMany();
  await prisma.order.deleteMany();
  await prisma.pricePoint.deleteMany();
  await prisma.outcome.deleteMany();
  await prisma.market.deleteMany();
  await prisma.marketGroup.deleteMany();
  await prisma.chainConfig.deleteMany();
  await prisma.chainConfig.create({
    data: {
      id: 1,
      chainId: CHAIN_ID,
      rpcUrl: RPC_URL,
      usdcAddr: backbone.usdc,
      ctfAddr: backbone.ctf,
      exchangeAddr: backbone.exchange,
      operator,
      // Null unless the manifest carries one — the API offers the UMA oracle
      // at creation only when this is set.
      umaAdapterAddr: backbone.umaAdapter ?? null,
      umaOracleAddr: backbone.umaOracle ?? null,
      umaOracleMock: backbone.umaMock ?? false,
    },
  });

  // 4. Per-market on-chain setup + DB mirror (shared with the CREATE_GROUP
  // batch job — see src/market-create.ts).
  const seededMarketIds: { id: string; yesPrice: number }[] = [];
  const seedOneMarket = async (args: {
    slug: string;
    title: string;
    description: string;
    category: string;
    imageUrl?: string;
    yesPrice: number;
    displayVolume: number;
    closesAt: string;
    inventoryE6: bigint;
    groupId?: string;
    groupLabel?: string;
    sortOrder?: number;
    /// Resolve this one through UMA instead of the operator. Only honoured
    /// when the manifest carries an adapter — see UMA_SEED below.
    uma?: { resolutionCriteria: string };
  }) => {
    const useUma = Boolean(args.uma && umaAdapterClient);
    const onchain = await createBinaryMarketOnChain({
      ct,
      exchange,
      usdcAddr: backbone.usdc,
      operator,
      questionKey: `verex:${args.slug}`,
      inventoryE6: args.inventoryE6,
      uma: useUma
        ? {
            adapter: umaAdapterClient!,
            title: args.title,
            resolutionCriteria: args.uma!.resolutionCriteria,
            closesAt: new Date(args.closesAt),
            // The mock has no whitelist, so its bond is plain USDC; the real
            // oracle only takes whitelisted currencies (WETH).
            rewardToken: backbone.umaMock ? backbone.usdc : UMA_SEPOLIA.weth,
            // reward 0: a non-zero reward would have to be held by the ADAPTER
            // before initialize, so a seeded market can't pay one without a
            // funding step the seed has no business performing.
            reward: 0n,
            bond: backbone.umaMock ? UMA_SEED_BOND_MOCK : UMA_SEED_BOND,
            liveness: backbone.umaMock ? UMA_SEED_LIVENESS_MOCK : UMA_SEED_LIVENESS,
          }
        : undefined,
    });
    const market = await prisma.market.create({
      data: {
        slug: args.slug,
        title: args.title,
        description: args.description,
        category: args.category,
        imageUrl: args.imageUrl,
        volume: args.displayVolume, // synthetic demo volume; real fills add to it
        closesAt: new Date(args.closesAt),
        questionId: onchain.questionId,
        conditionId: onchain.conditionId,
        yesTokenId: onchain.yesTokenId,
        noTokenId: onchain.noTokenId,
        groupId: args.groupId,
        groupLabel: args.groupLabel,
        sortOrder: args.sortOrder ?? 0,
        quoteCenter: args.yesPrice,
        oracleType: useUma ? "UMA" : "OPERATOR",
        umaAdapter: useUma ? backbone.umaAdapter : null,
        umaAncillaryData: onchain.ancillaryData ?? null,
        resolutionCriteria: args.uma?.resolutionCriteria ?? null,
        outcomes: {
          create: [
            { label: "Yes", price: args.yesPrice, tokenId: onchain.yesTokenId, sortOrder: 0 },
            { label: "No", price: Number((1 - args.yesPrice).toFixed(4)), tokenId: onchain.noTokenId, sortOrder: 1 },
          ],
        },
      },
    });
    await prisma.pricePoint.createMany({
      data: priceHistory(args.slug, args.yesPrice).map((p) => ({
        marketId: market.id,
        price: p.price,
        at: p.at,
      })),
    });
    seededMarketIds.push({ id: market.id, yesPrice: args.yesPrice });
    return market;
  };

  for (const m of MARKETS) {
    console.log(`[4] ${m.slug}`);
    await seedOneMarket({ ...m, inventoryE6: INVENTORY_PER_MARKET });
  }

  // 4b. One UMA-resolved market, but only where an adapter exists. Skipped
  // silently on anvil and on any environment that hasn't run the UMA runbook —
  // the alternative (failing the whole seed) would make the adapter a hard
  // dependency of seeding, which it isn't.
  if (umaAdapterClient) {
    console.log(`[4b] ${UMA_SEED.slug} (UMA-resolved)`);
    await seedOneMarket({
      ...UMA_SEED,
      inventoryE6: INVENTORY_PER_MARKET,
      uma: { resolutionCriteria: UMA_SEED.resolutionCriteria },
    });
  } else {
    console.log("[4b] no UMA adapter in the manifest — skipping the UMA-resolved market");
  }

  // 5. Multi-outcome groups: one binary CTF market per outcome + the DB
  // wrapper. Initial probabilities sum to 1 per group (checked above).
  for (const g of GROUPS) {
    console.log(`[5] group ${g.slug} (${g.outcomes.length} outcomes)`);
    const group = await prisma.marketGroup.create({
      data: {
        slug: g.slug,
        title: g.title,
        description: g.description,
        category: g.category,
        status: "OPEN",
        closesAt: new Date(g.closesAt),
      },
    });
    for (const [i, o] of g.outcomes.entries()) {
      await seedOneMarket({
        slug: `${g.slug}-${o.key}`,
        title: g.question(o.label),
        description: g.description,
        category: g.category,
        yesPrice: o.prob,
        displayVolume: Math.round(g.displayVolume * o.prob),
        closesAt: g.closesAt,
        inventoryE6: INVENTORY_PER_MEMBER,
        groupId: group.id,
        groupLabel: o.label,
        sortOrder: i,
      });
    }
  }

  // 6. Initial MM ladders — the books every market opens with.
  console.log(`[6] posting MM ladders for ${seededMarketIds.length} markets...`);
  for (const m of seededMarketIds) {
    await postLadders(m.id, m.yesPrice);
  }

  console.log(
    `\n✓ seeded ${MARKETS.length} binary markets + ${GROUPS.length} groups (${memberCount} members) with MM books (chain ${CHAIN_ID}, operator ${operator})`,
  );
}

main()
  .catch((e) => {
    console.error("seed failed:", e?.shortMessage ?? e?.message ?? e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
