"use client";

// The oracle lifecycle panel for UMA markets — the dispute demo's stage.
//
// Three walkable scenarios (docs/runbooks/uma-local-demo.md):
//   1. dispute defeated — a wallet disputes, the jury backs the proposer
//   2. dispute upheld   — the jury overturns the proposed answer
//   3. dead end         — a dispute with no verdict freezes the market
//
// Controls only render against the MOCK oracle (config.umaOracleMock); against
// the real oracle the panel is read-only and explains where disputes actually
// go (UMA's DVM). The polling is deliberate: oracle state changes on-chain,
// not through this tab, and a demo often drives it from two windows.
//
// Everyone SEES everything (state, ballots, verdict); you ACT only as the
// wallet selected in the header. Proposer, disputer and each juror are
// separate parties in UMA — a panel that drove all five from one screen would
// demo the mechanics while teaching the opposite of what the oracle is for.

import * as React from "react";
import { useRouter } from "next/navigation";
import { Scale, ShieldAlert, Gavel, CheckCircle2, Hourglass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useWallet } from "@/components/WalletProvider";
import { useLocale } from "@/components/LocaleProvider";
import type { MessageKey } from "@/lib/i18n";
import {
  getUmaLifecycle,
  postUmaPropose,
  postUmaDispute,
  postUmaVote,
  postUmaFinalize,
  postUmaResolve,
  type UmaAnswer,
  type UmaLifecycle,
} from "@/lib/api";

const JURY = [1, 2, 3, 4, 5];

function answerClass(a: UmaAnswer | null) {
  return a === "Yes" ? "text-yes" : a === "No" ? "text-no" : "text-muted-foreground";
}

export function UmaOraclePanel({
  slug,
  marketStatus,
  closesAt,
}: {
  slug: string;
  marketStatus: string;
  closesAt?: string | null;
}) {
  const router = useRouter();
  const { accountIndex } = useWallet();
  const { t, intl } = useLocale();
  const [life, setLife] = React.useState<UmaLifecycle | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [now, setNow] = React.useState(() => Math.floor(Date.now() / 1000));

  // Oracle states and answers are API data, not copy — they get looked up as
  // labels so the wire values stay untouched.
  const walletLabel = (i: number) =>
    i === 0 ? t("uma.walletOperator") : t("uma.walletDemo", { n: i });
  const stateLabel = (s: string) => t(`uma.state.${s}` as MessageKey);
  const answerLabel = (a: UmaAnswer | null | undefined) =>
    a ? t(`uma.answer.${a}` as MessageKey) : "";

  const refresh = React.useCallback(async () => {
    try {
      setLife(await getUmaLifecycle(slug));
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? t("uma.stateUnavailable"));
    }
  }, [slug, t]);

  React.useEffect(() => {
    refresh();
    const poll = setInterval(refresh, 4000);
    const tick = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [refresh]);

  if (!life) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Scale className="h-4 w-4 text-primary" /> {t("uma.title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{error ?? t("uma.loading")}</p>
        </CardContent>
      </Card>
    );
  }

  const o = life.oracle;
  const act = async (label: string, fn: () => Promise<unknown>, refreshPage = false) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
      await refresh();
      if (refreshPage) router.refresh();
    } catch (e: any) {
      setError(e?.message ?? t("uma.actionFailed", { action: t(`uma.action.${label}` as MessageKey) }));
    } finally {
      setBusy(null);
    }
  };

  const secondsLeft = o.expirationTime > 0 ? o.expirationTime - now : 0;
  const windowOpen = o.state === "Proposed" && secondsLeft > 0;
  const votedBy = new Map(o.ballots.map((b) => [b.voterIndex, b.answer]));
  const resolvedOnVerex = marketStatus === "RESOLVED";
  // The market's trading cutoff and the oracle's clock are independent — a
  // proposal before the cutoff is premature (the question isn't decided yet),
  // which is worth saying out loud right where the countdown confuses people.
  const beforeCutoff = !!closesAt && now * 1000 < new Date(closesAt).getTime();

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Scale className="h-4 w-4 text-primary" /> {t("uma.title")}
          {o.mock && (
            <span className="rounded-md bg-accent px-2 py-0.5 text-[0.7rem] font-medium text-accent-foreground">
              {t("uma.demoJuryBadge")}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {/* State line — always shown, whichever oracle */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>
            {t("uma.stateLabel")}: <strong>{stateLabel(resolvedOnVerex ? "Settled" : o.state)}</strong>
          </span>
          {o.proposedAnswer && (
            <span>
              {t("uma.proposedLabel")}:{" "}
              <strong className={answerClass(o.proposedAnswer)}>{answerLabel(o.proposedAnswer)}</strong>
              {o.proposerIndex === 0
                ? ` ${t("uma.byOperator")}`
                : o.proposerIndex
                  ? ` ${t("uma.byWallet", { n: o.proposerIndex })}`
                  : ""}
            </span>
          )}
          {o.disputer && (
            <span>
              {t("uma.disputedByPre")}
              <strong>
                {o.disputerIndex ? t("uma.walletNo", { n: o.disputerIndex }) : t("uma.someone")}
              </strong>
              {t("uma.disputedByPost")}
            </span>
          )}
          {o.verdict && (
            <span>
              {t("uma.verdictLabel")}:{" "}
              <strong className={answerClass(o.verdict)}>{answerLabel(o.verdict)}</strong>
            </span>
          )}
          <span className="text-muted-foreground">
            {t("uma.bond", { amount: o.bond, currency: o.bondCurrency })}
          </span>
        </div>

        {!o.mock ? (
          // Real oracle: read-only. Disputes go to UMA's DVM, not to a page.
          <p className="text-muted-foreground">{t("uma.realOracle")}</p>
        ) : resolvedOnVerex ? (
          <p className="flex items-center gap-2 text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-yes" />
            {t("uma.settledOnChain")}
          </p>
        ) : (
          <>
            {beforeCutoff && (o.state === "Requested" || o.state === "Proposed") && (
              <p className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                {t("uma.prematurePre")}
                <strong>
                  {new Date(closesAt!).toLocaleDateString(intl, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </strong>
                {t("uma.prematureMid")}
                <strong>{t("uma.prematureWord")}</strong>
                {t("uma.prematurePost")}
              </p>
            )}
            {o.state === "Requested" && (
              <div className="space-y-2">
                <p className="text-muted-foreground">
                  {t("uma.noProposal", { amount: o.bond, currency: o.bondCurrency })}
                </p>
                <div className="flex gap-2">
                  <Button
                    className="flex-1 bg-yes text-white hover:bg-yes/90"
                    disabled={busy !== null}
                    onClick={() => act("propose", () => postUmaPropose(slug, "Yes", accountIndex))}
                  >
                    {busy === "propose" ? t("uma.proposing") : t("uma.proposeYes")}
                  </Button>
                  <Button
                    className="flex-1 bg-no text-white hover:bg-no/90"
                    disabled={busy !== null}
                    onClick={() => act("propose", () => postUmaPropose(slug, "No", accountIndex))}
                  >
                    {t("uma.proposeNo")}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("uma.proposeAsPre")}
                  <strong>{walletLabel(accountIndex)}</strong>
                  {t("uma.proposeAsPost")}
                </p>
              </div>
            )}

            {windowOpen && (
              <div className="space-y-2">
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Hourglass className="h-4 w-4" />
                  {t("uma.challengeWindow")}{" "}
                  <strong className="tabular-nums">{Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}</strong>
                  {t("uma.challengeWindowRest", { amount: o.bond, currency: o.bondCurrency })}
                </p>
                <Button
                  variant="outline"
                  className="w-full border-no/50 text-no hover:bg-no/10"
                  disabled={busy !== null}
                  onClick={() => act("dispute", () => postUmaDispute(slug, accountIndex))}
                >
                  <ShieldAlert className="mr-2 h-4 w-4" />
                  {busy === "dispute"
                    ? t("uma.disputing")
                    : t("uma.disputeAs", { wallet: walletLabel(accountIndex) })}
                </Button>
                {o.proposerIndex === accountIndex && (
                  <p className="text-xs text-muted-foreground">{t("uma.selfDispute")}</p>
                )}
              </div>
            )}

            {(o.state === "Expired" || (o.state === "Proposed" && !windowOpen)) && (
              <div className="space-y-2">
                <p className="text-muted-foreground">{t("uma.windowClosed")}</p>
                <Button
                  className="w-full"
                  disabled={busy !== null}
                  onClick={() => act("resolve", () => postUmaResolve(slug), true)}
                >
                  {busy === "resolve" ? t("uma.resolving") : t("uma.resolveFromOracle")}
                </Button>
              </div>
            )}

            {o.state === "Disputed" && (
              <div className="space-y-3">
                <p className="text-muted-foreground">{t("uma.disputedBody")}</p>
                {/* Everyone sees the whole tally; only the selected wallet can add to it. */}
                <div className="space-y-1.5">
                  {JURY.map((i) => {
                    const ballot = votedBy.get(i);
                    const isYou = i === accountIndex;
                    return (
                      <div
                        key={i}
                        className={`flex items-center justify-between rounded-md border px-3 py-1.5 ${
                          isYou ? "border-primary/40 bg-primary/5" : ""
                        }`}
                      >
                        <span className="font-medium">
                          {t("uma.walletNo", { n: i })}
                          {isYou && (
                            <span className="ml-1.5 text-xs text-primary">{t("uma.you")}</span>
                          )}
                        </span>
                        {ballot !== undefined ? (
                          <span className={`text-sm font-semibold ${answerClass(ballot ?? null)}`}>
                            {t("uma.votedFor", { answer: answerLabel(ballot) })}
                          </span>
                        ) : isYou ? (
                          <span className="flex gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 border-yes/50 px-2 text-yes hover:bg-yes/10"
                              disabled={busy !== null}
                              onClick={() => act("vote", () => postUmaVote(slug, i, "Yes"))}
                            >
                              {t("uma.voteYes")}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 border-no/50 px-2 text-no hover:bg-no/10"
                              disabled={busy !== null}
                              onClick={() => act("vote", () => postUmaVote(slug, i, "No"))}
                            >
                              {t("uma.voteNo")}
                            </Button>
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">{t("uma.notVoted")}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  {accountIndex === 0
                    ? t("uma.operatorNotJuror")
                    : votedBy.has(accountIndex)
                      ? t("uma.youHaveVoted", { wallet: walletLabel(accountIndex) })
                      : t("uma.youVoteAs", { wallet: walletLabel(accountIndex) })}
                </p>
                <Button
                  className="w-full"
                  disabled={busy !== null || o.ballots.length === 0}
                  onClick={() => act("finalize", () => postUmaFinalize(slug, accountIndex))}
                >
                  <Gavel className="mr-2 h-4 w-4" />
                  {busy === "finalize"
                    ? t("uma.finalizing")
                    : o.ballots.length === 0
                      ? t("uma.finalizeNeedsVote")
                      : o.ballots.length === 1
                        ? t("uma.finalizeOne")
                        : t("uma.finalizeMany", { n: o.ballots.length })}
                </Button>
              </div>
            )}

            {o.state === "Resolved" && (
              <div className="space-y-2">
                <p className="text-muted-foreground">
                  {t("uma.juryRuledPre")}
                  <strong className={answerClass(o.verdict)}>{answerLabel(o.verdict)}</strong>
                  {o.verdict === o.proposedAnswer
                    ? t("uma.disputeDefeated")
                    : t("uma.disputeUpheld")}
                </p>
                <Button
                  className="w-full"
                  disabled={busy !== null}
                  onClick={() => act("resolve", () => postUmaResolve(slug), true)}
                >
                  {busy === "resolve" ? t("uma.resolving") : t("uma.copyVerdict")}
                </Button>
              </div>
            )}
          </>
        )}

        {error && <p className="text-sm text-no">{error}</p>}
      </CardContent>
    </Card>
  );
}
