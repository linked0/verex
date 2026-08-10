"use client";

// Create a prediction market (design rev 2, Task B — mirrors the reference
// screenshot): question, category, outcomes, per-outcome operator
// liquidity, resolution datetime. Submission returns 202 + a batch job;
// this page polls it and shows per-outcome progress. Exactly Yes/No as
// the two outcomes creates a standalone binary market.
//
// With ?edit=<slug> (market) or ?editGroup=<slug> (group) the same page
// edits an existing market's display fields instead: image URL, rules,
// category. Operator (#0) only.

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Info, Plus, ShieldCheck, Trash2, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useWallet } from "@/components/WalletProvider";
import {
  getConfig,
  getGroupBrowser,
  getJob,
  getMarketBrowser,
  patchGroup,
  patchMarket,
  postCreateGroup,
  type JobInfo,
  type Market,
  type MarketGroup,
  type OracleType,
} from "@/lib/api";

const CATEGORIES = [
  "Politics",
  "Sports",
  "Crypto",
  "Economics",
  "Tech & Science",
  "Climate",
  "Culture",
];

export default function CreateClient() {
  // useSearchParams needs a Suspense boundary for prerendering.
  return (
    <React.Suspense>
      <CreateMarketInner />
    </React.Suspense>
  );
}

function CreateMarketInner() {
  const router = useRouter();
  const { accountIndex, isAdmin } = useWallet();
  const searchParams = useSearchParams();
  const editSlug = searchParams.get("edit");
  const editGroupSlug = searchParams.get("editGroup");
  const editing = editGroupSlug ?? editSlug;

  const [title, setTitle] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [imageUrl, setImageUrl] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [liquidity, setLiquidity] = React.useState("100");
  const [outcomes, setOutcomes] = React.useState<string[]>(["", ""]);
  // Binary shortcut: fixes outcomes to Yes/No so nobody has to type them (and
  // get the exact labels wrong — UMA requires them verbatim). The previous
  // outcome list is stashed so unchecking restores whatever was typed.
  const [binaryChecked, setBinaryChecked] = React.useState(false);
  const stashedOutcomes = React.useRef<string[]>(["", ""]);
  const toggleBinary = (checked: boolean) => {
    setBinaryChecked(checked);
    if (checked) {
      stashedOutcomes.current = outcomes;
      setOutcomes(["Yes", "No"]);
    } else {
      setOutcomes(stashedOutcomes.current);
    }
  };
  const [closesDate, setClosesDate] = React.useState("");
  const [closesTime, setClosesTime] = React.useState("23:59");
  const [oracleType, setOracleType] = React.useState<OracleType>("OPERATOR");
  const [resolutionCriteria, setResolutionCriteria] = React.useState("");

  // Whether this environment has a UmaCtfAdapter at all. Asked rather than
  // assumed: the adapter is deployed per environment, so on anvil the option
  // must not appear rather than be offered and refused by the API.
  const [umaAvailable, setUmaAvailable] = React.useState(false);
  React.useEffect(() => {
    getConfig().then((c) => setUmaAvailable(c.umaAvailable));
  }, []);

  const [submitting, setSubmitting] = React.useState(false);
  const [job, setJob] = React.useState<JobInfo | null>(null);
  const [created, setCreated] = React.useState<{ kind: string; slug: string } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Edit mode: load the market (or group) and prefill the editable fields.
  const [editTarget, setEditTarget] = React.useState<Market | MarketGroup | null>(null);
  const [editLoading, setEditLoading] = React.useState(!!editing);
  React.useEffect(() => {
    if (!editing) return;
    const load = editGroupSlug ? getGroupBrowser(editGroupSlug) : getMarketBrowser(editSlug!);
    load.then((m) => {
      if (m) {
        setEditTarget(m);
        setCategory(m.category);
        setImageUrl(m.imageUrl ?? "");
        setDescription(m.description ?? "");
      }
      setEditLoading(false);
    });
  }, [editing, editSlug, editGroupSlug]);

  const filled = outcomes.map((o) => o.trim()).filter(Boolean);
  const liq = Number(liquidity) || 0;
  const totalFunding = liq * filled.length;

  // UMA is binary-only: each member of a group would be an independent UMA
  // question, and nothing coordinates the answers into a single winner.
  const isBinary =
    filled.length === 2 &&
    filled.map((l) => l.toLowerCase()).sort().join(",") === "no,yes";
  const umaSelected = oracleType === "UMA";
  // Mirrors the API's CRITERIA_MIN. Duplicated deliberately — the server is
  // the authority, this only saves a round trip.
  const criteriaOk = resolutionCriteria.trim().length >= 20;

  // Selecting UMA and then adding a third outcome silently invalidates the
  // choice, so fall back rather than leaving an unsubmittable form.
  React.useEffect(() => {
    if (umaSelected && filled.length > 0 && !isBinary) setOracleType("OPERATOR");
  }, [umaSelected, isBinary, filled.length]);

  const valid =
    title.trim().length >= 8 &&
    category &&
    filled.length >= 2 &&
    liq >= 1 &&
    liq <= 1000 &&
    closesDate &&
    (!umaSelected || (isBinary && criteriaOk));

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
        oracleType,
        resolutionCriteria: resolutionCriteria.trim() || undefined,
      });
      setCreated({ kind: r.kind, slug: r.slug });
      setJob({ id: r.jobId, type: "CREATE_GROUP", status: "PENDING" });
    } catch (e: any) {
      setError(e?.message ?? "creation failed");
    } finally {
      setSubmitting(false);
    }
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    setSubmitting(true);
    setError(null);
    try {
      const fields = {
        slug: editTarget.slug,
        accountIndex,
        imageUrl: imageUrl.trim(),
        description: description.trim(),
        category,
      };
      if (editGroupSlug) {
        await patchGroup(fields);
        router.push(`/group/${editTarget.slug}`);
      } else {
        await patchMarket(fields);
        router.push(`/market/${editTarget.slug}`);
      }
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "update failed");
      setSubmitting(false);
    }
  };

  const progress = job?.result?.progress;
  const failed = job?.status === "FAILED";

  if (editing) {
    // Seeded markets may use a category outside the fixed list — keep it selectable.
    const categoryOptions =
      category && !CATEGORIES.includes(category) ? [category, ...CATEGORIES] : CATEGORIES;
    return (
      <main className="container max-w-2xl space-y-6 py-8">
        <div>
          <h1 className="text-2xl font-bold">Edit market</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Display fields only — outcomes, liquidity, and the resolution date can&apos;t change
            after creation.
          </p>
        </div>
        {editLoading ? (
          <p className="text-sm text-muted-foreground">Loading market…</p>
        ) : !editTarget ? (
          <p className="text-sm text-no">
            {editGroupSlug ? "Group" : "Market"} “{editing}” not found.
          </p>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{editTarget.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!isAdmin && (
                <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div>
                    Only the <span className="font-semibold">Operator Wallet</span> can edit
                    markets — switch wallets in the top bar to make changes.
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Image URL
                </label>
                <Input
                  placeholder="https://…"
                  value={imageUrl}
                  disabled={!isAdmin}
                  onChange={(e) => setImageUrl(e.target.value)}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Leave empty to fall back to the default per-market photo.
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Category
                </label>
                <select
                  className="h-9 w-full rounded-md border bg-transparent px-3 text-sm disabled:opacity-50"
                  value={category}
                  disabled={!isAdmin}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {categoryOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Rules / description
                </label>
                <textarea
                  className="min-h-20 w-full rounded-md border bg-transparent px-3 py-2 text-sm disabled:opacity-50"
                  placeholder="How does this market resolve?"
                  value={description}
                  disabled={!isAdmin}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className="flex gap-2">
                <Button className="flex-1" disabled={submitting || !isAdmin} onClick={saveEdit}>
                  {submitting ? "Saving…" : "Save changes"}
                </Button>
                <Button
                  variant="outline"
                  disabled={submitting}
                  onClick={() =>
                    router.push(
                      editGroupSlug ? `/group/${editTarget.slug}` : `/market/${editTarget.slug}`,
                    )
                  }
                >
                  Cancel
                </Button>
              </div>
              {error && (
                <p className="rounded-md border border-no/30 bg-no/10 px-3 py-2 text-sm text-no">
                  {error}
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </main>
    );
  }

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
              1 USDC mints 1 Yes + 1 No token — the operator&apos;s opening liquidity.
              Max 1,000 per outcome.
              {totalFunding > 0 && ` Total: ${totalFunding.toLocaleString()} USDC.`}
            </p>
          </div>

          <Separator />

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Outcomes * {!binaryChecked && "(minimum 2 — exactly “Yes” and “No” makes a binary market)"}
            </label>
            <label className="mb-2 flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={binaryChecked}
                onChange={(e) => toggleBinary(e.target.checked)}
              />
              Binary market (Yes / No)
            </label>
            {binaryChecked ? (
              <p className="rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                Outcomes are set to <strong>Yes</strong> and <strong>No</strong> — the labels the
                UMA oracle option requires.
              </p>
            ) : (
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
            )}
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

          <Separator />

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Resolution source
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setOracleType("OPERATOR")}
                className={`rounded-md border p-3 text-left transition ${
                  oracleType === "OPERATOR" ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                }`}
              >
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <UserCog className="h-4 w-4" /> Operator
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  The platform reports the result. Instant, free, and requires trusting the
                  operator.
                </span>
              </button>
              <button
                type="button"
                disabled={!umaAvailable || !isBinary}
                onClick={() => setOracleType("UMA")}
                className={`rounded-md border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  oracleType === "UMA" ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                }`}
              >
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <ShieldCheck className="h-4 w-4" /> UMA oracle
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {!umaAvailable
                    ? "Not available in this environment — no adapter deployed."
                    : !isBinary
                      ? "Binary markets only — set outcomes to exactly Yes and No."
                      : "UMA's Optimistic Oracle decides. Anyone can finalise it, so payouts don't depend on the operator."}
                </span>
              </button>
            </div>

            {/* Not a warning about a risky action — a statement that this input
                has no edit screen later, because the resolver's address is part
                of the market's on-chain identity. */}
            <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
              <Info className="mt-px h-3 w-3 shrink-0" />
              Permanent once created. A market&apos;s on-chain id includes its resolver, so this
              can never be changed afterwards — only replaced by a different market.
            </p>
          </div>

          {umaSelected && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Resolution criteria * (sent to UMA)
              </label>
              <textarea
                className="min-h-24 w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                placeholder="Resolves YES if … according to <source>, measured at <time>. Resolves NO otherwise."
                value={resolutionCriteria}
                onChange={(e) => setResolutionCriteria(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                This is the entire text a UMA voter reads. A question without explicit rules is
                likely to settle as <span className="font-medium">unresolvable</span>, which pays
                both sides half.{" "}
                {!criteriaOk && resolutionCriteria.length > 0 && (
                  <span className="text-no">At least 20 characters.</span>
                )}
              </p>
            </div>
          )}

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
