"use client";

// Right-hand panel switch for the market page (client-side because the choice
// depends on the active demo wallet): operator #0 sees the resolve panel,
// everyone else trades; resolved markets show the outcome instead.

import { CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useWallet } from "@/components/WalletProvider";
import { useLocale } from "@/components/LocaleProvider";
import { TradePanel } from "@/components/TradePanel";
import { ResolvePanel } from "@/components/ResolvePanel";
import type { Market } from "@/lib/api";

export function MarketSidePanel({ market }: { market: Market }) {
  const { isAdmin } = useWallet();
  const { t } = useLocale();

  if (market.status === "RESOLVED") {
    const winner = market.outcomes.find((o) => Number(o.price) === 1);
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="h-4 w-4 text-yes" /> {t("market.resolvedTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            {t("market.finalOutcome")}{" "}
            <span className={winner?.label === "Yes" ? "font-semibold text-yes" : "font-semibold text-no"}>
              {winner?.label ?? "—"}
            </span>
          </p>
          <p>
            {t("market.redeemPre")}
            <a href="/portfolio" className="underline hover:text-foreground">
              {t("market.portfolio")}
            </a>
            {t("market.redeemPost")}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isAdmin && market.group) {
    // Group members resolve together (mutually exclusive outcomes) — send
    // the operator to the group's winner picker instead.
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("market.resolveViaGroup")}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {t("market.groupNotePre")}
          <a href={`/group/${market.group.slug}`} className="underline hover:text-foreground">
            {market.group.title}
          </a>
          {t("market.groupNotePost")}
        </CardContent>
      </Card>
    );
  }

  return isAdmin ? <ResolvePanel market={market} /> : <TradePanel market={market} />;
}
