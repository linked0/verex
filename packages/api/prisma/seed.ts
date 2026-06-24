import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Seed = {
  slug: string;
  title: string;
  description: string;
  category: string;
  volume: number;
  closesAt: string;
  outcomes: { label: string; price: number }[]; // prices ~sum to 1
};

// 10 categorical markets across 5 categories (2 each). Static seeded prices.
const MARKETS: Seed[] = [
  {
    slug: "us-presidential-election-2028",
    title: "Who will win the 2028 US Presidential Election?",
    description: "Resolves to the party of the winning candidate of the 2028 US presidential election.",
    category: "Politics",
    volume: 8_400_000,
    closesAt: "2028-11-07T00:00:00Z",
    outcomes: [
      { label: "Republican", price: 0.49 },
      { label: "Democrat", price: 0.47 },
      { label: "Other", price: 0.04 },
    ],
  },
  {
    slug: "uk-labour-next-election",
    title: "Will Labour win the next UK general election?",
    description: "Resolves YES if the Labour Party wins the most seats at the next UK general election.",
    category: "Politics",
    volume: 2_100_000,
    closesAt: "2029-01-31T00:00:00Z",
    outcomes: [
      { label: "Yes", price: 0.62 },
      { label: "No", price: 0.38 },
    ],
  },
  {
    slug: "world-cup-2026-winner",
    title: "2026 FIFA World Cup Winner",
    description: "Resolves to the nation that wins the 2026 FIFA World Cup.",
    category: "Sports",
    volume: 12_900_000,
    closesAt: "2026-07-19T00:00:00Z",
    outcomes: [
      { label: "Brazil", price: 0.22 },
      { label: "France", price: 0.18 },
      { label: "Argentina", price: 0.16 },
      { label: "England", price: 0.12 },
      { label: "Other", price: 0.32 },
    ],
  },
  {
    slug: "lakers-2026-playoffs",
    title: "Will the Lakers make the 2026 NBA Playoffs?",
    description: "Resolves YES if the Los Angeles Lakers qualify for the 2026 NBA playoffs.",
    category: "Sports",
    volume: 1_700_000,
    closesAt: "2026-04-15T00:00:00Z",
    outcomes: [
      { label: "Yes", price: 0.71 },
      { label: "No", price: 0.29 },
    ],
  },
  {
    slug: "btc-above-100k-2026",
    title: "Will Bitcoin be above $100k at the end of 2026?",
    description: "Resolves YES if BTC/USD is above $100,000 at 2026-12-31 00:00 UTC.",
    category: "Crypto",
    volume: 6_300_000,
    closesAt: "2026-12-31T00:00:00Z",
    outcomes: [
      { label: "Yes", price: 0.58 },
      { label: "No", price: 0.42 },
    ],
  },
  {
    slug: "eth-peerdas-2026",
    title: "Will Ethereum PeerDAS go live on mainnet before Oct 2026?",
    description: "Resolves YES if PeerDAS (Fusaka) activates on Ethereum mainnet before 2026-10-01 UTC.",
    category: "Crypto",
    volume: 940_000,
    closesAt: "2026-10-01T00:00:00Z",
    outcomes: [
      { label: "Yes", price: 0.44 },
      { label: "No", price: 0.56 },
    ],
  },
  {
    slug: "fed-next-meeting-decision",
    title: "What will the Fed do at the next meeting?",
    description: "Resolves to the FOMC's interest-rate decision at the next scheduled meeting.",
    category: "Economy",
    volume: 5_500_000,
    closesAt: "2026-07-29T00:00:00Z",
    outcomes: [
      { label: "Cut", price: 0.67 },
      { label: "Hold", price: 0.31 },
      { label: "Hike", price: 0.02 },
    ],
  },
  {
    slug: "us-recession-2026",
    title: "Will the US enter a recession in 2026?",
    description: "Resolves YES if the NBER declares a US recession beginning in 2026.",
    category: "Economy",
    volume: 3_800_000,
    closesAt: "2026-12-31T00:00:00Z",
    outcomes: [
      { label: "Yes", price: 0.28 },
      { label: "No", price: 0.72 },
    ],
  },
  {
    slug: "ceasefire-agreement-2026",
    title: "Will a major ceasefire agreement be signed in 2026?",
    description: "Resolves YES if a major internationally-recognized ceasefire agreement is signed in 2026.",
    category: "Geopolitics",
    volume: 2_600_000,
    closesAt: "2026-12-31T00:00:00Z",
    outcomes: [
      { label: "Yes", price: 0.39 },
      { label: "No", price: 0.61 },
    ],
  },
  {
    slug: "us-eu-trade-deal-2026",
    title: "Will the US and EU sign a new trade deal in 2026?",
    description: "Resolves YES if the US and EU sign a new bilateral trade agreement during 2026.",
    category: "Geopolitics",
    volume: 1_300_000,
    closesAt: "2026-12-31T00:00:00Z",
    outcomes: [
      { label: "Yes", price: 0.53 },
      { label: "No", price: 0.47 },
    ],
  },
];

async function main() {
  // Idempotent re-seed: clear then recreate.
  await prisma.outcome.deleteMany();
  await prisma.market.deleteMany();

  for (const m of MARKETS) {
    await prisma.market.create({
      data: {
        slug: m.slug,
        title: m.title,
        description: m.description,
        category: m.category,
        volume: m.volume,
        closesAt: new Date(m.closesAt),
        outcomes: {
          create: m.outcomes.map((o, i) => ({
            label: o.label,
            price: o.price,
            sortOrder: i,
          })),
        },
      },
    });
  }

  const count = await prisma.market.count();
  console.log(`Seeded ${count} markets.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
