"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Wallet, Droplets, BriefcaseBusiness, PlusCircle, BookText } from "lucide-react";
import * as React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LocaleToggle } from "@/components/LocaleToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useLocale } from "@/components/LocaleProvider";
import { useWallet } from "@/components/WalletProvider";
import { VerexMark } from "@/components/VerexMark";
import { postFaucet } from "@/lib/api";

export function SiteNav() {
  const router = useRouter();
  const params = useSearchParams();
  const { accountIndex, setAccountIndex, summary, refresh, isAdmin } = useWallet();
  const { t, intl } = useLocale();
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
        <Link href="/" className="flex shrink-0 items-center gap-1.5 text-lg font-bold tracking-tight">
          <VerexMark className="h-6 w-6 shrink-0" />
          <span className="hidden sm:inline">Verex</span>
        </Link>

        <form onSubmit={onSearch} className="relative hidden min-w-0 max-w-sm flex-1 md:block">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            name="q"
            placeholder={t("nav.search")}
            defaultValue={params.get("q") ?? ""}
            className="pl-8"
          />
        </form>

        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/docs"
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <BookText className="h-4 w-4 shrink-0" />
            <span className="hidden lg:inline">{t("nav.docs")}</span>
          </Link>
          <Link
            href="/create"
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <PlusCircle className="h-4 w-4 shrink-0" />
            <span className="hidden lg:inline">{t("nav.create")}</span>
          </Link>
          <Link
            href="/portfolio"
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <BriefcaseBusiness className="h-4 w-4 shrink-0" />
            <span className="hidden lg:inline">{t("nav.portfolio")}</span>
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={onFaucet}
            disabled={minting || isAdmin}
            title={t("nav.faucetTitle")}
            aria-label={t("nav.faucet")}
          >
            <Droplets className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden lg:inline">
              {minting ? t("nav.faucetMinting") : t("nav.faucet")}
            </span>
          </Button>
          <div className="flex shrink-0 items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-sm">
            <Wallet className="h-4 w-4 shrink-0 text-primary" />
            <select
              aria-label={t("nav.walletLabel")}
              className="bg-transparent text-sm font-medium outline-none"
              value={accountIndex}
              onChange={(e) => setAccountIndex(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5].map((i) => (
                <option key={i} value={i}>
                  {t("nav.demoWallet", { n: i })}
                </option>
              ))}
              <option value={0}>{t("nav.operatorWallet")}</option>
            </select>
            <span className="hidden tabular-nums text-muted-foreground sm:inline">
              {isAdmin ? (
                t("nav.admin")
              ) : summary ? (
                `$${summary.usdc.toLocaleString(intl, { maximumFractionDigits: 0 })}`
              ) : (
                // A balance is worse wrong than absent — while the new wallet
                // loads, show a placeholder rather than the last one's number.
                <Skeleton className="inline-block h-4 w-12 align-middle" />
              )}
            </span>
          </div>
          <div className="flex items-center">
            <LocaleToggle />
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}
