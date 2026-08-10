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
import { useLocale } from "@/components/LocaleProvider";
import { useWallet } from "@/components/WalletProvider";
import type { MessageKey } from "@/lib/i18n";
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

// These strings are the values the API stores, so they must never be
// localised. Only the rendered <option> text is translated, via the lookup
// below — a category the map doesn't know (a seeded one) falls back to itself.
const CATEGORIES = [
  "Politics",
  "Sports",
  "Crypto",
  "Economics",
  "Tech & Science",
  "Climate",
  "Culture",
];

const CATEGORY_LABEL_KEY: Record<string, MessageKey> = {
  Politics: "create.cat.politics",
  Sports: "create.cat.sports",
  Crypto: "create.cat.crypto",
  Economics: "create.cat.economics",
  "Tech & Science": "create.cat.techScience",
  Climate: "create.cat.climate",
  Culture: "create.cat.culture",
};

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
  const { t, intl } = useLocale();
  const categoryLabel = (c: string) => (CATEGORY_LABEL_KEY[c] ? t(CATEGORY_LABEL_KEY[c]) : c);
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
      setError(e?.message ?? t("create.errCreateFailed"));
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
      setError(e?.message ?? t("create.errUpdateFailed"));
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
          <h1 className="text-2xl font-bold">{t("create.editTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("create.editSubtitle")}</p>
        </div>
        {editLoading ? (
          <p className="text-sm text-muted-foreground">{t("create.loadingMarket")}</p>
        ) : !editTarget ? (
          <p className="text-sm text-no">
            {t(editGroupSlug ? "create.groupNotFound" : "create.marketNotFound", {
              slug: editing!,
            })}
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
                    {t("create.operatorOnlyPre")}
                    <span className="font-semibold">{t("create.operatorOnlyWallet")}</span>
                    {t("create.operatorOnlyPost")}
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  {t("create.imageUrl")}
                </label>
                <Input
                  placeholder="https://…"
                  value={imageUrl}
                  disabled={!isAdmin}
                  onChange={(e) => setImageUrl(e.target.value)}
                />
                <p className="mt-1 text-xs text-muted-foreground">{t("create.imageUrlHint")}</p>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  {t("create.category")}
                </label>
                <select
                  className="h-9 w-full rounded-md border bg-transparent px-3 text-sm disabled:opacity-50"
                  value={category}
                  disabled={!isAdmin}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {categoryOptions.map((c) => (
                    <option key={c} value={c}>
                      {categoryLabel(c)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  {t("create.rules")}
                </label>
                <textarea
                  className="min-h-20 w-full rounded-md border bg-transparent px-3 py-2 text-sm disabled:opacity-50"
                  placeholder={t("create.rulesPlaceholder")}
                  value={description}
                  disabled={!isAdmin}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className="flex gap-2">
                <Button className="flex-1" disabled={submitting || !isAdmin} onClick={saveEdit}>
                  {submitting ? t("create.saving") : t("create.saveChanges")}
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
                  {t("create.cancel")}
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
        <h1 className="text-2xl font-bold">{t("create.creatingTitle")}</h1>
        <Card>
          <CardContent className="space-y-4 pt-6">
            {failed ? (
              <>
                <p className="text-sm font-medium text-no">
                  {/* job.result.error comes from the server — shown verbatim. */}
                  {job.result?.error
                    ? t("create.creationFailedReason", { error: job.result.error })
                    : t("create.creationFailed")}
                </p>
                <p className="text-sm text-muted-foreground">{t("create.nothingPublished")}</p>
                <Button onClick={() => { setCreated(null); setJob(null); }}>
                  {t("create.backToForm")}
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">{t("create.batchRunning")}</p>
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
                    : t("create.queued")}
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
        <h1 className="text-2xl font-bold">{t("create.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("create.subtitle")}</p>
      </div>

      <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div>
          <span className="font-semibold text-primary">{t("create.serverSideLabel")}</span>{" "}
          {t("create.serverSideBody")}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("create.marketDetails")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              {t("create.question")} *
            </label>
            <Input
              placeholder={t("create.questionPlaceholder")}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                {t("create.category")} *
              </label>
              <select
                className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">{t("create.selectCategory")}</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {categoryLabel(c)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                {t("create.imageUrlOptional")}
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
              {t("create.rulesOptional")}
            </label>
            <textarea
              className="min-h-20 w-full rounded-md border bg-transparent px-3 py-2 text-sm"
              placeholder={t("create.rulesPlaceholder")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              {t("create.liquidity")}
            </label>
            <Input
              type="number"
              min="1"
              max="1000"
              value={liquidity}
              onChange={(e) => setLiquidity(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {t("create.liquidityHint")}
              {totalFunding > 0 &&
                ` ${t("create.liquidityTotal", { total: totalFunding.toLocaleString(intl) })}`}
            </p>
          </div>

          <Separator />

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              {t("create.outcomes")} * {!binaryChecked && t("create.outcomesHint")}
            </label>
            <label className="mb-2 flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={binaryChecked}
                onChange={(e) => toggleBinary(e.target.checked)}
              />
              {t("create.binaryCheckbox")}
            </label>
            {binaryChecked ? (
              <p className="rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                {/* Yes / No are the on-chain outcome labels — never localised. */}
                {t("create.binaryNotePre")}
                <strong>Yes</strong>
                {t("create.binaryNoteMid")}
                <strong>No</strong>
                {t("create.binaryNotePost")}
              </p>
            ) : (
              <div className="space-y-2">
                {outcomes.map((o, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      placeholder={t("create.outcomePlaceholder", { n: i + 1 })}
                      value={o}
                      onChange={(e) =>
                        setOutcomes((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))
                      }
                    />
                    {outcomes.length > 2 && (
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label={t("create.removeOutcome")}
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
                  <Plus className="h-4 w-4" /> {t("create.addOutcome")}
                </Button>
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                {t("create.resolutionDate")} *
              </label>
              <Input type="date" value={closesDate} onChange={(e) => setClosesDate(e.target.value)} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                {t("create.resolutionTime")} *
              </label>
              <Input type="time" value={closesTime} onChange={(e) => setClosesTime(e.target.value)} />
            </div>
          </div>

          <Separator />

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              {t("create.resolutionSource")}
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
                  <UserCog className="h-4 w-4" /> {t("create.oracleOperator")}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {t("create.oracleOperatorDesc")}
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
                  <ShieldCheck className="h-4 w-4" /> {t("create.oracleUma")}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {!umaAvailable
                    ? t("create.umaUnavailable")
                    : !isBinary
                      ? t("create.umaBinaryOnly")
                      : t("create.oracleUmaDesc")}
                </span>
              </button>
            </div>

            {/* Not a warning about a risky action — a statement that this input
                has no edit screen later, because the resolver's address is part
                of the market's on-chain identity. */}
            <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
              <Info className="mt-px h-3 w-3 shrink-0" />
              {t("create.permanentNote")}
            </p>
          </div>

          {umaSelected && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                {t("create.criteria")} * {t("create.criteriaSentToUma")}
              </label>
              <textarea
                className="min-h-24 w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                placeholder={t("create.criteriaPlaceholder")}
                value={resolutionCriteria}
                onChange={(e) => setResolutionCriteria(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {t("create.criteriaHintPre")}
                <span className="font-medium">{t("create.criteriaUnresolvable")}</span>
                {t("create.criteriaHintPost")}{" "}
                {!criteriaOk && resolutionCriteria.length > 0 && (
                  <span className="text-no">{t("create.criteriaMin")}</span>
                )}
              </p>
            </div>
          )}

          <Button className="w-full" size="lg" disabled={!valid || submitting} onClick={submit}>
            {submitting ? t("create.submitting") : t("create.submit")}
          </Button>
          {error && (
            <p className="rounded-md border border-no/30 bg-no/10 px-3 py-2 text-sm text-no">{error}</p>
          )}
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {t("create.createdAs", { n: accountIndex })}
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
