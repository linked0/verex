import Image from "next/image";
import Link from "next/link";
import {
  BriefcaseBusiness,
  CircleDollarSign,
  Droplets,
  LineChart,
  ListTree,
  PlusCircle,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "How to use — Verex" };

const sections = [
  { id: "wallets", label: "Demo wallets & faucet" },
  { id: "trade", label: "Trade" },
  { id: "groups", label: "Multi-outcome markets" },
  { id: "resolve", label: "Resolve (operator)" },
  { id: "portfolio", label: "Portfolio & redeem" },
  { id: "create", label: "Create a market" },
];

function Shot({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <Image
        src={src}
        alt={alt}
        width={1280}
        height={800}
        className="h-auto w-full"
        unoptimized
      />
    </div>
  );
}

export default function HowToPage() {
  return (
    <main className="container max-w-4xl space-y-8 py-8">
      <div>
        <h1 className="text-3xl font-bold">How to use Verex</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Verex is a demo prediction market: every trade is a real order matched in a central
          limit order book and settled on-chain (Gnosis Conditional Tokens + a CTF exchange).
          This page walks through the whole lifecycle with the actual screens.
        </p>
        <nav className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {sections.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="text-primary underline-offset-2 hover:underline">
              {s.label}
            </a>
          ))}
        </nav>
      </div>

      <Card id="wallets">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Droplets className="h-5 w-5 text-primary" /> 1 · Demo wallets & the faucet
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            The wallet selector in the top-right corner switches between <strong>Demo Wallets
            #1–5</strong> (regular traders, seeded with 1,000 test USDC each) and the{" "}
            <strong>Operator Wallet</strong> (the admin that provides liquidity and resolves
            markets). Everything you do — trades, positions, history — belongs to the wallet
            that is active.
          </p>
          <Shot src="/how-to/faucet.png" alt="The nav controls: Create, Portfolio, Faucet, wallet selector" />
          <p>
            Need more play money? Press <strong>Faucet</strong> — it mints 1,000 test USDC to
            the active demo wallet. <strong>Check the result</strong> right next to the wallet
            selector: the balance there updates immediately (it also appears at the top of your{" "}
            <Link href="/portfolio" className="text-primary underline-offset-2 hover:underline">
              Portfolio
            </Link>
            ). Buying with an empty balance also auto-faucets as a safety net, so you can never
            get stuck.
          </p>
        </CardContent>
      </Card>

      <Card id="trade">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <LineChart className="h-5 w-5 text-primary" /> 2 · Trade
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            Open any market and use the <strong>Trade</strong> panel: pick Yes or No, enter a
            USDC amount (BUY) or a token amount (SELL), and submit. Your order fills instantly
            against the order book — the operator&apos;s market-making ladder keeps both sides
            quoted — and the matched pair settles on-chain a moment later. Watch the small{" "}
            <em>“settling on-chain… → settled”</em> chip under the fill for the transaction
            hash; your position appears in the Portfolio as soon as it confirms.
          </p>
          <Shot src="/how-to/trade.png" alt="Market page with trade panel and order book" />
          <p>
            The <strong>Order book</strong> card shows the live depth around the mid price.
            Big orders walk through several price levels — the fill result shows your average
            price.
          </p>
        </CardContent>
      </Card>

      <Card id="groups">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ListTree className="h-5 w-5 text-primary" /> 3 · Multi-outcome markets
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            Questions like <em>“Who will win the 2026 World Series?”</em> have many candidates.
            Each candidate is its own Yes/No market under the hood, and the group keeps their
            probabilities <strong>summing to 100%</strong>: buying one candidate automatically
            re-prices the others. Click an outcome row to trade it; the chart tracks the top
            candidates over time.
          </p>
          <Shot src="/how-to/group.png" alt="A multi-outcome group page with outcome rows and chart" />
        </CardContent>
      </Card>

      <Card id="resolve">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldCheck className="h-5 w-5 text-primary" /> 4 · Resolve (operator)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            Switch the wallet selector to <strong>Operator Wallet</strong> and open a market:
            the trade panel becomes the <strong>Resolve</strong> panel. Report the final
            outcome (Yes/No — or pick the winner on a group page) and confirm. The market flips
            to RESOLVED immediately; the payout reports settle on-chain behind the status chip.
            Resolution is irreversible: winning tokens are now worth $1, losing tokens $0.
          </p>
          <Shot src="/how-to/resolve.png" alt="The operator's resolve panel on a market page" />
        </CardContent>
      </Card>

      <Card id="portfolio">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <BriefcaseBusiness className="h-5 w-5 text-primary" /> 5 · Portfolio & redeem
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            <Link href="/portfolio" className="text-primary underline-offset-2 hover:underline">
              Portfolio
            </Link>{" "}
            shows the active wallet&apos;s USDC balance, every position with cost basis and
            P&amp;L, and the full activity feed. After a market you hold resolves, the position
            shows <strong>WON</strong> or <strong>LOST</strong> and a <strong>Redeem</strong>{" "}
            button appears — press it to burn the tokens and collect $1 per winning token. The
            payout lands when the settlement chip confirms, and the redemption appears in the
            activity feed with its realized P&amp;L (click the REDEEM tag for the breakdown).
          </p>
          <Shot src="/how-to/portfolio.png" alt="Portfolio with balances, positions and activity" />
        </CardContent>
      </Card>

      <Card id="create">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <PlusCircle className="h-5 w-5 text-primary" /> 6 · Create a market
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            Anyone can create a market from{" "}
            <Link href="/create" className="text-primary underline-offset-2 hover:underline">
              Create
            </Link>{" "}
            in the top menu: write the question, pick a category, list at least two outcomes
            (exactly “Yes” and “No” makes a simple binary market), set the resolution time, and
            submit. The server creates every outcome on-chain and the{" "}
            <strong>operator funds the opening order books</strong> with the liquidity you
            chose (up to 1,000 USDC per outcome) — no gas needed from you. A progress bar
            tracks the batch; when it finishes you land on your new market.
          </p>
          <Shot src="/how-to/create.png" alt="The create-market form" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <CircleDollarSign className="h-5 w-5 text-primary" /> The full demo loop
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm leading-relaxed text-muted-foreground">
          <ol className="list-decimal space-y-1 pl-5">
            <li>Pick Demo Wallet #1 and hit Faucet — check the balance next to the selector.</li>
            <li>Buy Yes on any market (or a candidate in a group) and watch the chip settle.</li>
            <li>See the position and cost basis in Portfolio.</li>
            <li>Switch to the Operator Wallet and resolve the market your way.</li>
            <li>Switch back, Redeem from Portfolio, and check the realized P&amp;L.</li>
            <li>Create your own market and trade it — the operator quotes it automatically.</li>
          </ol>
        </CardContent>
      </Card>
    </main>
  );
}
