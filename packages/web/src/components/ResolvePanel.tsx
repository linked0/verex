"use client";

// Admin (operator #0) resolution panel — replaces the trade panel on the
// market page when the operator wallet is active. Reports payouts on-chain
// (manual oracle) and finalizes DB prices at 1/0.

import * as React from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { postResolve, type Market } from "@/lib/api";

export function ResolvePanel({ market }: { market: Market }) {
  const router = useRouter();
  const [confirming, setConfirming] = React.useState<"Yes" | "No" | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [txHash, setTxHash] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const resolve = async (outcome: "Yes" | "No") => {
    setBusy(true);
    setError(null);
    try {
      const r = await postResolve({ slug: market.slug, outcome, accountIndex: 0 });
      setTxHash(r.txHash);
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "resolve failed");
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4 text-primary" /> Resolve market (admin)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Report the final outcome as the oracle. This is <strong>irreversible</strong>:
          trading stops, the winning token pays $1, the losing token pays $0.
        </p>
        {confirming ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">
              Resolve as <span className={confirming === "Yes" ? "text-yes" : "text-no"}>{confirming}</span>?
            </p>
            <div className="flex gap-2">
              <Button
                className="flex-1"
                disabled={busy}
                onClick={() => resolve(confirming)}
              >
                {busy ? "Reporting…" : `Confirm ${confirming}`}
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                disabled={busy}
                onClick={() => setConfirming(null)}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button
              className="flex-1 bg-yes text-white hover:bg-yes/90"
              disabled={busy || !!txHash}
              onClick={() => setConfirming("Yes")}
            >
              Resolve YES
            </Button>
            <Button
              className="flex-1 bg-no text-white hover:bg-no/90"
              disabled={busy || !!txHash}
              onClick={() => setConfirming("No")}
            >
              Resolve NO
            </Button>
          </div>
        )}
        {txHash && (
          <p className="break-all text-xs text-muted-foreground">Resolved · tx {txHash}</p>
        )}
        {error && <p className="text-sm text-no">{error}</p>}
      </CardContent>
    </Card>
  );
}
