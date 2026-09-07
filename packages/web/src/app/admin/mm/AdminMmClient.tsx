"use client";

// /admin/mm — the operator's window and switch on the always-on maker
// (onboarding+MM design §6, "Operator / admin page"). Owner-gated by the
// same demo-grade convention as resolution: the operator wallet (#0) must
// be active, and the API refuses every other accountIndex on top.
//
// Status is read-only. Config carries ONLY the safe controls — pause/resume
// (global + per market) and a bounded spread, each behind a confirm. The
// LMSR b and the collateral cap define max loss, so v1 shows them read-only:
// they change by redeploy/seed, not here.

import * as React from "react";
import Link from "next/link";
import { Loader2, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocale } from "@/components/LocaleProvider";
import { useWallet } from "@/components/WalletProvider";
import { getMmStatus, postMmConfig, cents, type MmConfigAction, type MmStatus } from "@/lib/api";
import { cn } from "@/lib/utils";

const POLL_MS = 10_000;

export default function AdminMmClient() {
  const { accountIndex, isAdmin } = useWallet();
  const { t, intl } = useLocale();
  const [status, setStatus] = React.useState<MmStatus | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null); // action key in flight
  const [error, setError] = React.useState<string | null>(null);
  const [spreadInput, setSpreadInput] = React.useState<string>("");

  const load = React.useCallback(async () => {
    if (!isAdmin) return;
    const s = await getMmStatus(accountIndex);
    setStatus(s);
    setFailed(s === null);
  }, [accountIndex, isAdmin]);

  React.useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  // The input mirrors the server value until the operator starts typing.
  React.useEffect(() => {
    if (status && spreadInput === "") setSpreadInput(String(status.config.spreadBps));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed once from the first load
  }, [status]);

  const money = (v: number) =>
    `$${v.toLocaleString(intl, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const apply = async (key: string, confirmText: string, action: MmConfigAction) => {
    if (busy) return;
    if (!window.confirm(confirmText)) return;
    setBusy(key);
    setError(null);
    try {
      const fresh = await postMmConfig({ ...action, accountIndex });
      setStatus(fresh);
    } catch (e) {
      setError(e instanceof Error ? e.message : "config write failed");
    } finally {
      setBusy(null);
    }
  };

  if (!isAdmin) {
    return (
      <main className="container max-w-2xl space-y-4 py-6">
        <h1 className="text-2xl font-bold">{t("admin.mm.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("admin.mm.gate")}</p>
      </main>
    );
  }

  const spreadBps = Number(spreadInput);
  const spreadValid =
    status !== null &&
    Number.isInteger(spreadBps) &&
    spreadBps >= 0 &&
    spreadBps <= status.config.maxSpreadBps;

  return (
    <main className="container space-y-6 py-6">
      <div>
        <h1 className="text-2xl font-bold">{t("admin.mm.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("admin.mm.subtitle")}</p>
      </div>

      {failed && <p className="text-sm text-no">{t("admin.mm.loadFailed")}</p>}
      {error && <p className="text-sm text-no">{error}</p>}

      <Tabs defaultValue="status">
        <TabsList>
          <TabsTrigger value="status">{t("admin.mm.tabStatus")}</TabsTrigger>
          <TabsTrigger value="config">{t("admin.mm.tabConfig")}</TabsTrigger>
        </TabsList>

        {/* ── Status (read-only) ─────────────────────────────────────────── */}
        <TabsContent value="status" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label={t("admin.mm.treasury")}>
              {status ? money(status.global.treasuryUsd) : <Skeleton className="h-6 w-20" />}
            </StatCard>
            <StatCard label={t("admin.mm.committed")} hint={t("admin.mm.committedHint")}>
              {status ? money(status.global.committedUsd) : <Skeleton className="h-6 w-20" />}
            </StatCard>
            <StatCard label={t("admin.mm.pnl")}>
              {status ? (
                <span className={status.global.pnlUsd >= 0 ? "text-yes" : "text-no"}>
                  {status.global.pnlUsd >= 0 ? "+" : "−"}
                  {money(Math.abs(status.global.pnlUsd))}
                </span>
              ) : (
                <Skeleton className="h-6 w-20" />
              )}
            </StatCard>
            <StatCard label={t("admin.mm.globalState")}>
              {status ? (
                status.config.paused ? (
                  <span className="text-no">{t("admin.mm.pausedGlobal")}</span>
                ) : (
                  <span className="text-yes">{t("admin.mm.active")}</span>
                )
              ) : (
                <Skeleton className="h-6 w-20" />
              )}
            </StatCard>
          </div>

          <Card>
            <CardContent className="overflow-x-auto pt-4">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-1.5 pr-2 font-medium">{t("admin.mm.market")}</th>
                    <th className="py-1.5 pr-2 font-medium">{t("admin.mm.inventory")}</th>
                    <th className="py-1.5 pr-2 font-medium">{t("admin.mm.netSold")}</th>
                    <th className="py-1.5 pr-2 font-medium">{t("admin.mm.quotesCol")}</th>
                    <th className="py-1.5 pr-2 font-medium" title={t("admin.mm.headroomTitle")}>
                      {t("admin.mm.headroom")}
                    </th>
                    <th className="py-1.5 pr-2 font-medium">b</th>
                    <th className="py-1.5 font-medium">{t("admin.mm.globalState")}</th>
                  </tr>
                </thead>
                <tbody>
                  {status?.markets.map((m) => (
                    <tr key={m.slug} className="border-b last:border-0">
                      <td className="max-w-[220px] truncate py-1.5 pr-2">
                        <Link href={`/market/${m.slug}`} className="hover:underline">
                          {m.groupLabel ? `${m.groupLabel} — ${m.title}` : m.title}
                        </Link>
                      </td>
                      <td className="py-1.5 pr-2 tabular-nums">
                        {m.inventory.yes.toFixed(0)} / {m.inventory.no.toFixed(0)}
                      </td>
                      <td className="py-1.5 pr-2 tabular-nums">
                        {m.netSold.yes.toFixed(1)} / {m.netSold.no.toFixed(1)}
                      </td>
                      <td className="py-1.5 pr-2 tabular-nums">
                        {m.quotes.bid !== null ? cents(m.quotes.bid) : "—"} /{" "}
                        {m.quotes.ask !== null ? cents(m.quotes.ask) : "—"}
                      </td>
                      <td className="py-1.5 pr-2 tabular-nums" title={t("admin.mm.headroomTitle")}>
                        {money(m.headroomUsd)}{" "}
                        <span className="text-xs text-muted-foreground">/ {money(m.maxLossCapUsd)}</span>
                      </td>
                      <td className="py-1.5 pr-2 tabular-nums">{m.b.toFixed(0)}</td>
                      <td className="py-1.5">
                        <span
                          className={cn(
                            "rounded-sm px-1.5 py-0.5 text-xs font-medium",
                            m.mmPaused
                              ? "bg-no/10 text-no"
                              : m.quoting
                                ? "bg-yes/10 text-yes"
                                : "bg-muted text-muted-foreground",
                          )}
                        >
                          {m.mmPaused
                            ? t("admin.mm.paused")
                            : m.quoting
                              ? t("admin.mm.quotingOn")
                              : t("admin.mm.quotingOff")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Config (safe controls only) ─────────────────────────────────── */}
        <TabsContent value="config" className="space-y-4">
          <p className="text-xs text-muted-foreground">{t("admin.mm.audited")}</p>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("admin.mm.globalState")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3">
              {status?.config.paused ? (
                <Button
                  type="button"
                  disabled={busy !== null}
                  onClick={() =>
                    void apply("resume", t("admin.mm.confirmResumeAll"), { action: "resume" })
                  }
                >
                  {busy === "resume" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="mr-2 h-4 w-4" />
                  )}
                  {t("admin.mm.resumeAll")}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={busy !== null || !status}
                  onClick={() =>
                    void apply("pause", t("admin.mm.confirmPauseAll"), { action: "pause" })
                  }
                >
                  {busy === "pause" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Pause className="mr-2 h-4 w-4" />
                  )}
                  {t("admin.mm.pauseAll")}
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("admin.mm.spread")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <label className="text-sm text-muted-foreground">
                {t("admin.mm.spreadLabel", { max: status?.config.maxSpreadBps ?? 500 })}
              </label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={status?.config.maxSpreadBps ?? 500}
                  step={1}
                  value={spreadInput}
                  onChange={(e) => setSpreadInput(e.target.value)}
                  className="w-28"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy !== null || !spreadValid || spreadBps === status?.config.spreadBps}
                  onClick={() =>
                    void apply("spread", t("admin.mm.confirmSpread", { bps: spreadBps }), {
                      action: "spread",
                      spreadBps,
                    })
                  }
                >
                  {busy === "spread" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("admin.mm.spreadApply")}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("admin.mm.market")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {status?.markets.map((m) => (
                <div
                  key={m.slug}
                  className="flex items-center justify-between gap-2 border-b py-1.5 text-sm last:border-0"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {m.groupLabel ? `${m.groupLabel} — ${m.title}` : m.title}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    b={m.b.toFixed(0)}
                  </span>
                  {m.mmPaused ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy !== null}
                      onClick={() =>
                        void apply(
                          `resume:${m.slug}`,
                          t("admin.mm.confirmResumeOne", { slug: m.slug }),
                          { action: "market-resume", slug: m.slug },
                        )
                      }
                    >
                      {busy === `resume:${m.slug}` && (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      )}
                      {t("admin.mm.resume")}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy !== null}
                      onClick={() =>
                        void apply(
                          `pause:${m.slug}`,
                          t("admin.mm.confirmPauseOne", { slug: m.slug }),
                          { action: "market-pause", slug: m.slug },
                        )
                      }
                    >
                      {busy === `pause:${m.slug}` && (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      )}
                      {t("admin.mm.pause")}
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("admin.mm.readOnlyTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p className="text-xs leading-relaxed">{t("admin.mm.readOnlyNote")}</p>
              <div className="space-y-0.5">
                {status?.markets.map((m) => (
                  <div key={m.slug} className="flex items-center justify-between gap-2 text-xs">
                    <span className="min-w-0 flex-1 truncate">
                      {m.groupLabel ? `${m.groupLabel} — ${m.title}` : m.title}
                    </span>
                    <span className="tabular-nums">
                      b={m.b.toFixed(0)} · cap {money(m.maxLossCapUsd)}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </main>
  );
}

function StatCard({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="text-xs text-muted-foreground" title={hint}>
          {label}
        </div>
        <div className="mt-1 text-xl font-bold tabular-nums">{children}</div>
      </CardContent>
    </Card>
  );
}
