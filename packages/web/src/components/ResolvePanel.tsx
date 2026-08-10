"use client";

// Admin (operator #0) resolution panel — replaces the trade panel on the
// market page when the operator wallet is active. Reports payouts on-chain
// (manual oracle) and finalizes DB prices at 1/0.

import * as React from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SettlementChip } from "@/components/SettlementChip";
import { useLocale } from "@/components/LocaleProvider";
import { postResolve, type Market } from "@/lib/api";

export function ResolvePanel({ market }: { market: Market }) {
  const router = useRouter();
  const { t } = useLocale();
  const [confirming, setConfirming] = React.useState<"Yes" | "No" | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [jobId, setJobId] = React.useState<string | null>(null);
  const [resolved, setResolved] = React.useState<"Yes" | "No" | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const resolve = async (outcome: "Yes" | "No") => {
    setBusy(true);
    setError(null);
    try {
      const r = await postResolve({ slug: market.slug, outcome, accountIndex: 0 });
      setJobId(r.jobId);
      setResolved(outcome); // the DB already flipped — show it immediately
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? t("market.resolveFailed"));
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4 text-primary" /> {t("market.resolveTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {t("market.resolveDescPre")}
          <strong>{t("market.resolveIrreversible")}</strong>
          {t("market.resolveDescPost")}
        </p>
        {resolved ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">
              {t("market.resolvedLabel")}{" "}
              <span className={resolved === "Yes" ? "text-yes" : "text-no"}>
                {resolved.toUpperCase()}
              </span>
            </p>
            {jobId && <SettlementChip jobId={jobId} onSettled={() => router.refresh()} />}
          </div>
        ) : confirming ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">
              {t("market.resolveAsPre")}
              <span className={confirming === "Yes" ? "text-yes" : "text-no"}>{confirming}</span>
              {t("market.resolveAsPost")}
            </p>
            <div className="flex gap-2">
              <Button
                className="flex-1"
                disabled={busy}
                onClick={() => resolve(confirming)}
              >
                {busy ? t("market.reporting") : t("market.confirmOutcome", { outcome: confirming })}
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                disabled={busy}
                onClick={() => setConfirming(null)}
              >
                {t("market.cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button
              className="flex-1 bg-yes text-white hover:bg-yes/90"
              disabled={busy}
              onClick={() => setConfirming("Yes")}
            >
              {t("market.resolveYes")}
            </Button>
            <Button
              className="flex-1 bg-no text-white hover:bg-no/90"
              disabled={busy}
              onClick={() => setConfirming("No")}
            >
              {t("market.resolveNo")}
            </Button>
          </div>
        )}
        {error && <p className="text-sm text-no">{error}</p>}
      </CardContent>
    </Card>
  );
}
