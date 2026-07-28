"use client";

// Create a prediction market (design rev 2, Task B — mirrors the reference
// screenshot): question, category, outcomes, per-outcome operator
// liquidity, resolution datetime. Submission returns 202 + a batch job;
// this page polls it and shows per-outcome progress. Exactly Yes/No as
// the two outcomes creates a standalone binary market.

import * as React from "react";
import { useRouter } from "next/navigation";
import { Info, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useWallet } from "@/components/WalletProvider";
import { getJob, postCreateGroup, type JobInfo } from "@/lib/api";

const CATEGORIES = [
  "Politics",
  "Sports",
  "Crypto",
  "Economics",
  "Tech & Science",
  "Climate",
  "Culture",
];

export default function CreateMarketPage() {
  const router = useRouter();
  const { accountIndex } = useWallet();

  const [title, setTitle] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [imageUrl, setImageUrl] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [liquidity, setLiquidity] = React.useState("100");
  const [outcomes, setOutcomes] = React.useState<string[]>(["", ""]);
  const [closesDate, setClosesDate] = React.useState("");
  const [closesTime, setClosesTime] = React.useState("23:59");

  const [submitting, setSubmitting] = React.useState(false);
  const [job, setJob] = React.useState<JobInfo | null>(null);
  const [created, setCreated] = React.useState<{ kind: string; slug: string } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const filled = outcomes.map((o) => o.trim()).filter(Boolean);
  const liq = Number(liquidity) || 0;
  const totalFunding = liq * filled.length;
  const valid =
    title.trim().length >= 8 && category && filled.length >= 2 && liq >= 1 && liq <= 1000 && closesDate;

  // Poll the batch job until it settles, then send the user to the result.
  React.useEffect(() => {
    if (!created || !job || job.status === "CONFIRMED" || job.status === "FAILED") return;
    const t = setInterval(async () => {
      const j = await getJob(job.id);
      if (j) setJob(j);
      if (j?.status === "CONFIRMED") {
        clearInterval(t);
        router.push(created.kind === "group" ? `/group/${created.slug}` : `/market/${created.slug}`);
      }
    }, 1_500);
    return () => clearInterval(t);
  }, [created, job, router]);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const r = await postCreateGroup({
        title: title.trim(),
        category,
        description: description.trim() || undefined,
        imageUrl: imageUrl.trim() || undefined,
        outcomes: filled.map((label) => ({ label })),
        liquidityPerOutcome: liq,
        closesAt: new Date(`${closesDate}T${closesTime || "23:59"}:00`).toISOString(),
        creatorIndex: accountIndex,
      });
      setCreated({ kind: r.kind, slug: r.slug });
      setJob({ id: r.jobId, type: "CREATE_GROUP", status: "PENDING" });
    } catch (e: any) {
      setError(e?.message ?? "creation failed");
    } finally {
      setSubmitting(false);
    }
  };

  const progress = job?.result?.progress;
  const failed = job?.status === "FAILED";

  if (created && job) {
    return (
      <main className="container max-w-2xl space-y-6 py-8">
        <h1 className="text-2xl font-bold">Creating your market…</h1>
        <Card>
          <CardContent className="space-y-4 pt-6">
            {failed ? (
              <>
                <p className="text-sm font-medium text-no">
                  Creation failed{job.result?.error ? ` — ${job.result.error}` : ""}.
                </p>
                <p className="text-sm text-muted-foreground">
                  Nothing was published. You can adjust the form and try again.
                </p>
                <Button onClick={() => { setCreated(null); setJob(null); }}>Back to the form</Button>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Our batch processor is creating the on-chain markets and providing the
                  operator&apos;s liquidity — no gas needed from you.
                </p>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{
                      width: progress ? `${Math.round((progress.done / progress.total) * 90) + 10}%` : "10%",
                    }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {progress
                    ? `${progress.stage} (${Math.min(progress.done + 1, progress.total)}/${progress.total})`
                    : "queued…"}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="container max-w-2xl space-y-6 py-8">
      <div>
        <h1 className="text-2xl font-bold">Create a prediction market</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Multi-outcome markets are grouped binary markets with automated liquidity.
        </p>
      </div>

      <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div>
          <span className="font-semibold text-primary">Server-side creation:</span> submit your
          market details and the batch processor creates the markets and provisions the
          operator&apos;s liquidity automatically. No gas fees for you.
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Market details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Question *
            </label>
            <Input
              placeholder="Who will win the MVP in the World Series?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Category *
              </label>
              <select
                className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">Select a category</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Image URL (optional)
              </label>
              <Input
                placeholder="https://…"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Rules / description (optional)
            </label>
            <textarea
              className="min-h-20 w-full rounded-md border bg-transparent px-3 py-2 text-sm"
              placeholder="How does this market resolve?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Initial liquidity (USDC per outcome)
            </label>
            <Input
              type="number"
              min="1"
              max="1000"
              value={liquidity}
              onChange={(e) => setLiquidity(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Operator funding for the opening order books. Total: {totalFunding || 0} USDC ·
              max 1,000 per outcome.
            </p>
          </div>

          <Separator />

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Outcomes * (minimum 2 — exactly “Yes” and “No” makes a binary market)
            </label>
            <div className="space-y-2">
              {outcomes.map((o, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    placeholder={`Outcome ${i + 1}…`}
                    value={o}
                    onChange={(e) =>
                      setOutcomes((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))
                    }
                  />
                  {outcomes.length > 2 && (
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="Remove outcome"
                      onClick={() => setOutcomes((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                variant="secondary"
                className="w-full"
                disabled={outcomes.length >= 12}
                onClick={() => setOutcomes((prev) => [...prev, ""])}
              >
                <Plus className="h-4 w-4" /> Add outcome
              </Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Resolution date *
              </label>
              <Input type="date" value={closesDate} onChange={(e) => setClosesDate(e.target.value)} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Resolution time *
              </label>
              <Input type="time" value={closesTime} onChange={(e) => setClosesTime(e.target.value)} />
            </div>
          </div>

          <Button className="w-full" size="lg" disabled={!valid || submitting} onClick={submit}>
            {submitting ? "Submitting…" : "Start batch creation →"}
          </Button>
          {error && (
            <p className="rounded-md border border-no/30 bg-no/10 px-3 py-2 text-sm text-no">{error}</p>
          )}
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Created as Demo Wallet {accountIndex}. Anyone can create markets in this demo; the
            operator funds each outcome&apos;s opening book.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
