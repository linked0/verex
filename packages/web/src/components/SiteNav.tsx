"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Wallet, Droplets } from "lucide-react";
import * as React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/components/WalletProvider";
import { postFaucet } from "@/lib/api";

export function SiteNav() {
  const router = useRouter();
  const params = useSearchParams();
  const { accountIndex, setAccountIndex, summary, refresh } = useWallet();
  const [minting, setMinting] = React.useState(false);

  const onSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = new FormData(e.currentTarget).get("q") as string;
    router.push(q ? `/?q=${encodeURIComponent(q)}` : "/");
  };

  const onFaucet = async () => {
    setMinting(true);
    await postFaucet(accountIndex);
    await refresh();
    setMinting(false);
  };

  return (
    <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur">
      <div className="container flex h-14 items-center gap-4">
        <Link href="/" className="flex items-center gap-1.5 text-lg font-bold tracking-tight">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-xs font-black text-primary-foreground">
            V
          </span>
          Verex
        </Link>

        <form onSubmit={onSearch} className="relative hidden max-w-sm flex-1 md:block">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            name="q"
            placeholder="Search markets"
            defaultValue={params.get("q") ?? ""}
            className="pl-8"
          />
        </form>

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onFaucet}
            disabled={minting}
            title="Mint 1,000 test USDC to the active demo wallet"
          >
            <Droplets className="h-3.5 w-3.5" />
            {minting ? "Minting…" : "Faucet"}
          </Button>
          <div className="flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-sm">
            <Wallet className="h-4 w-4 text-primary" />
            <select
              aria-label="Demo wallet"
              className="bg-transparent text-sm font-medium outline-none"
              value={accountIndex}
              onChange={(e) => setAccountIndex(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5].map((i) => (
                <option key={i} value={i}>
                  Demo #{i}
                </option>
              ))}
            </select>
            <span className="tabular-nums text-muted-foreground">
              {summary ? `$${summary.usdc.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "…"}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
