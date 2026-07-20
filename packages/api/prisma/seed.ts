// Seed: real CTF markets on anvil + DB mirror.
//
// What it does (run after `prisma migrate reset` for a clean slate):
//   1. Deploys the CTF backbone via forge (or reuses USDC_ADDR/CTF_ADDR/
//      EXCHANGE_ADDR from env) and stores addresses in ChainConfig.
//   2. One-time exchange setup: operator allowlist + USDC approvals.
//   3. Per market: prepareCondition → registerToken → split operator
//      inventory, then writes the Market/Outcome rows + synthetic price
//      history for the chart.
//
// Requires: anvil running on http://127.0.0.1:8545, foundry in ~/.foundry.
//
//   anvil &
//   pnpm --filter @verex/api db:reset   (migrate reset --force + this seed)

import "dotenv/config";
import { execSync } from "node:child_process";
import { resolve as pathResolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { keccak256, toHex, parseUnits } from "viem";
import {
  createCTClient,
  createExchangeClient,
  createUsdcClient,
  getConditionId,
  type Address,
  type Hex,
} from "@verex/sdk";
import {
  accountAddress,
  makePublicClient,
  makeWalletClient,
  RPC_URL,
  CHAIN_ID,
} from "../src/chain";

const prisma = new PrismaClient();

const CONTRACTS_DIR = pathResolve(__dirname, "../../contracts");
const FOUNDRY_PATH = `${process.env.HOME}/.foundry/bin:${process.env.PATH}`;

/// Operator liquidity per market (YES+NO inventory) and USDC buffer for
/// buying tokens back when users sell.
const INVENTORY_PER_MARKET = parseUnits("10000", 6); // 10,000 USDC
const OPERATOR_USDC_BUFFER = parseUnits("100000", 6); // 100,000 USDC
/// Starting balance for demo wallets #1-5 (matches AUTO_FAUCET_USDC in src/trade.ts).
const DEMO_WALLET_USDC = parseUnits("1000", 6); // 1,000 USDC

type SeedMarket = {
  slug: string;
  title: string;
  description: string;
  category: string;
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
    yesPrice: 0.63,
    displayVolume: 512_000,
    closesAt: "2027-01-15T00:00:00Z",
  },
];

interface Backbone {
  usdc: Address;
  ctf: Address;
  exchange: Address;
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
  await prisma.trade.deleteMany();
  await prisma.pricePoint.deleteMany();
  await prisma.outcome.deleteMany();
  await prisma.market.deleteMany();
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
  console.log(`\n✓ seeded ${MARKETS.length} DB-only markets (no chain)`);
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

  // 1. Deploy or reuse the backbone
  let backbone: Backbone;
  if (process.env.USDC_ADDR && process.env.CTF_ADDR && process.env.EXCHANGE_ADDR) {
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
  console.log(`    USDC ${backbone.usdc}\n    CTF ${backbone.ctf}\n    Exchange ${backbone.exchange}`);

  const operator = accountAddress(0);
  const operatorWallet = makeWalletClient(0);
  const ct = createCTClient({ address: backbone.ctf, publicClient: pc, walletClient: operatorWallet });
  const exchange = createExchangeClient({ address: backbone.exchange, publicClient: pc, walletClient: operatorWallet });
  const usdc = createUsdcClient({ address: backbone.usdc, publicClient: pc, walletClient: operatorWallet });

  // 2. One-time exchange setup for the operator
  console.log("[2] operator setup (allowlist + approvals + USDC buffer)...");
  await exchange.addOperator(operator);
  await ct.setApprovalForAll(backbone.exchange, true); // exchange pulls YES/NO on fills
  const totalMint =
    OPERATOR_USDC_BUFFER + INVENTORY_PER_MARKET * BigInt(MARKETS.length);
  await usdc.mint(operator, totalMint);
  await usdc.approve(backbone.ctf, INVENTORY_PER_MARKET * BigInt(MARKETS.length)); // splits pull via CTF
  await usdc.approve(backbone.exchange, OPERATOR_USDC_BUFFER); // SELL fills pull the operator's USDC via the exchange

  // Pre-fund demo wallets #1-5. Top-up (not blind mint) so re-running the seed
  // against a reused backbone doesn't inflate balances. The trade-time
  // auto-faucet in src/trade.ts stays as a safety net.
  console.log("[2b] funding demo wallets #1-5 (top up to 1,000 USDC)...");
  for (let i = 1; i <= 5; i++) {
    const user = accountAddress(i);
    const bal = await usdc.balanceOf(user);
    if (bal < DEMO_WALLET_USDC) await usdc.mint(user, DEMO_WALLET_USDC - bal);
  }

  // 3. Reset DB content and store chain config
  console.log("[3] resetting DB rows...");
  await prisma.trade.deleteMany();
  await prisma.pricePoint.deleteMany();
  await prisma.outcome.deleteMany();
  await prisma.market.deleteMany();
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
    },
  });

  // 4. Per-market on-chain setup + DB mirror
  for (const m of MARKETS) {
    const questionId: Hex = keccak256(toHex(`verex:${m.slug}`));
    const conditionId = getConditionId(operator, questionId, 2n);
    console.log(`[4] ${m.slug}`);

    await ct.prepareCondition(operator, questionId, 2n);
    const ids = await ct.getBinaryPositionIds(backbone.usdc, conditionId);
    await exchange.registerToken(ids.yes, ids.no, conditionId);
    await ct.splitBinary(backbone.usdc, conditionId, INVENTORY_PER_MARKET);

    const market = await prisma.market.create({
      data: {
        slug: m.slug,
        title: m.title,
        description: m.description,
        category: m.category,
        volume: m.displayVolume, // synthetic demo volume; real fills add to it
        closesAt: new Date(m.closesAt),
        questionId,
        conditionId,
        yesTokenId: ids.yes.toString(),
        noTokenId: ids.no.toString(),
        outcomes: {
          create: [
            { label: "Yes", price: m.yesPrice, tokenId: ids.yes.toString(), sortOrder: 0 },
            { label: "No", price: Number((1 - m.yesPrice).toFixed(4)), tokenId: ids.no.toString(), sortOrder: 1 },
          ],
        },
      },
    });

    await prisma.pricePoint.createMany({
      data: priceHistory(m.slug, m.yesPrice).map((p) => ({
        marketId: market.id,
        price: p.price,
        at: p.at,
      })),
    });
  }

  console.log(`\n✓ seeded ${MARKETS.length} on-chain markets (chain ${CHAIN_ID}, operator ${operator})`);
}

main()
  .catch((e) => {
    console.error("seed failed:", e?.shortMessage ?? e?.message ?? e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
