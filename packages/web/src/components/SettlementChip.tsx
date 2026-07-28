"use client";

// Live settlement status for a ChainJob: polls /jobs/:id every 2s while
// pending, then freezes at confirmed (with the tx hash) or failed. The
// small print behind "instant" trading — the DB filled you already, this
// chip is the chain catching up.

import * as React from "react";
import { CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import { BROWSER_API } from "@/lib/api";

type JobStatus = "PENDING" | "RUNNING" | "CONFIRMED" | "FAILED";

export function SettlementChip({
  jobId,
  onSettled,
}: {
  jobId: string;
  /// Fired once when the job leaves the queue (confirmed or failed) — hook
  /// for refreshing balances.
  onSettled?: (status: "CONFIRMED" | "FAILED") => void;
}) {
  const [status, setStatus] = React.useState<JobStatus>("PENDING");
  const [txHash, setTxHash] = React.useState<string | null>(null);
  const settledRef = React.useRef(false);
  // Ref'd so an inline callback from the parent doesn't reset the polling
  // effect on every render.
  const onSettledRef = React.useRef(onSettled);
  onSettledRef.current = onSettled;

  React.useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetch(`${BROWSER_API}/jobs/${jobId}`, { cache: "no-store" });
        if (!res.ok) return;
        const job = await res.json();
        if (!alive) return;
        setStatus(job.status);
        const hash = job.result?.txHashes?.[0];
        if (hash) setTxHash(hash);
        if ((job.status === "CONFIRMED" || job.status === "FAILED") && !settledRef.current) {
          settledRef.current = true;
          onSettledRef.current?.(job.status);
        }
      } catch {
        /* transient — keep polling */
      }
    };
    poll();
    const t = setInterval(() => {
      if (settledRef.current) return clearInterval(t);
      void poll();
    }, 2_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [jobId]);

  if (status === "FAILED") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-no">
        <XCircle className="h-3.5 w-3.5" /> on-chain settlement failed — reverted
      </span>
    );
  }
  if (status === "CONFIRMED") {
    return (
      <span className="inline-flex items-center gap-1 break-all text-xs text-muted-foreground">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-yes" />
        settled on-chain{txHash ? ` · tx ${txHash.slice(0, 10)}…${txHash.slice(-6)}` : ""}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <CircleDashed className="h-3.5 w-3.5 animate-spin text-primary" /> settling on-chain…
    </span>
  );
}
