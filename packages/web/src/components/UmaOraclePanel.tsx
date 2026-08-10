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

function walletLabel(i: number) {
  return i === 0 ? "the operator" : `Demo Wallet ${i}`;
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
  const [life, setLife] = React.useState<UmaLifecycle | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [now, setNow] = React.useState(() => Math.floor(Date.now() / 1000));

  const refresh = React.useCallback(async () => {
    try {
      setLife(await getUmaLifecycle(slug));
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "oracle state unavailable");
    }
  }, [slug]);

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
            <Scale className="h-4 w-4 text-primary" /> UMA oracle
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{error ?? "Loading oracle state…"}</p>
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
      setError(e?.message ?? `${label} failed`);
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
          <Scale className="h-4 w-4 text-primary" /> UMA oracle
          {o.mock && (
            <span className="rounded-md bg-accent px-2 py-0.5 text-[0.7rem] font-medium text-accent-foreground">
              demo jury
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {/* State line — always shown, whichever oracle */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>
            State: <strong>{resolvedOnVerex ? "Settled" : o.state}</strong>
          </span>
          {o.proposedAnswer && (
            <span>
              Proposed: <strong className={answerClass(o.proposedAnswer)}>{o.proposedAnswer}</strong>
              {o.proposerIndex === 0 ? " (operator)" : o.proposerIndex ? ` (wallet #${o.proposerIndex})` : ""}
            </span>
          )}
          {o.disputer && (
            <span>
              Disputed by <strong>{o.disputerIndex ? `wallet #${o.disputerIndex}` : "someone"}</strong>
            </span>
          )}
          {o.verdict && (
            <span>
              Verdict: <strong className={answerClass(o.verdict)}>{o.verdict}</strong>
            </span>
          )}
          <span className="text-muted-foreground">
            Bond {o.bond} {o.bondCurrency}
          </span>
        </div>

        {!o.mock ? (
          // Real oracle: read-only. Disputes go to UMA's DVM, not to a page.
          <p className="text-muted-foreground">
            This market settles on UMA&apos;s real Optimistic Oracle. Propose and dispute
            on-chain (see the runbook); a dispute escalates to UMA&apos;s DVM, where staked
            UMA holders vote — that part has no button anywhere, by design.
          </p>
        ) : resolvedOnVerex ? (
          <p className="flex items-center gap-2 text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-yes" />
            The verdict has been copied on-chain — winners can redeem in Portfolio.
          </p>
        ) : (
          <>
            {beforeCutoff && (o.state === "Requested" || o.state === "Proposed") && (
              <p className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                This market&apos;s question isn&apos;t decided until{" "}
                <strong>
                  {new Date(closesAt!).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </strong>{" "}
                — a proposal made now is <strong>premature</strong>. On the real oracle,
                watchers would dispute it for exactly that reason; in this demo it&apos;s a
                handy way to set up the dispute scenarios.
              </p>
            )}
            {o.state === "Requested" && (
              <div className="space-y-2">
                <p className="text-muted-foreground">
                  No answer proposed yet. Anyone may propose one — it costs a {o.bond}{" "}
                  {o.bondCurrency} bond, refunded unless a dispute proves the answer wrong.
                </p>
                <div className="flex gap-2">
                  <Button
                    className="flex-1 bg-yes text-white hover:bg-yes/90"
                    disabled={busy !== null}
                    onClick={() => act("propose", () => postUmaPropose(slug, "Yes", accountIndex))}
                  >
                    {busy === "propose" ? "Proposing…" : "Propose YES"}
                  </Button>
                  <Button
                    className="flex-1 bg-no text-white hover:bg-no/90"
                    disabled={busy !== null}
                    onClick={() => act("propose", () => postUmaPropose(slug, "No", accountIndex))}
                  >
                    Propose NO
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  You would propose as <strong>{walletLabel(accountIndex)}</strong> — switch
                  wallets in the header to propose as someone else.
                </p>
              </div>
            )}

            {windowOpen && (
              <div className="space-y-2">
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Hourglass className="h-4 w-4" />
                  Challenge window: <strong className="tabular-nums">{Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}</strong>{" "}
                  left. Anyone who thinks the answer is wrong can dispute, bonding {o.bond}{" "}
                  {o.bondCurrency}.
                </p>
                <Button
                  variant="outline"
                  className="w-full border-no/50 text-no hover:bg-no/10"
                  disabled={busy !== null}
                  onClick={() => act("dispute", () => postUmaDispute(slug, accountIndex))}
                >
                  <ShieldAlert className="mr-2 h-4 w-4" />
                  {busy === "dispute"
                    ? "Disputing…"
                    : `Dispute this answer as ${walletLabel(accountIndex)}`}
                </Button>
                {o.proposerIndex === accountIndex && (
                  <p className="text-xs text-muted-foreground">
                    You proposed this answer. Disputing yourself is allowed — on real UMA
                    it is the only way to retract a proposal you now believe is wrong.
                  </p>
                )}
              </div>
            )}

            {(o.state === "Expired" || (o.state === "Proposed" && !windowOpen)) && (
              <div className="space-y-2">
                <p className="text-muted-foreground">
                  The challenge window closed with no dispute — the proposed answer stands.
                </p>
                <Button
                  className="w-full"
                  disabled={busy !== null}
                  onClick={() => act("resolve", () => postUmaResolve(slug), true)}
                >
                  {busy === "resolve" ? "Resolving…" : "Resolve market from the oracle"}
                </Button>
              </div>
            )}

            {o.state === "Disputed" && (
              <div className="space-y-3">
                <p className="text-muted-foreground">
                  Disputed — the market is frozen until the jury rules. In production this
                  is UMA&apos;s DVM voting for ~48h; here the demo wallets are the jury.
                  Leave it unvoted and this stays frozen forever — that is scenario 3.
                </p>
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
                          wallet #{i}
                          {isYou && <span className="ml-1.5 text-xs text-primary">(you)</span>}
                        </span>
                        {ballot !== undefined ? (
                          <span className={`text-sm font-semibold ${answerClass(ballot ?? null)}`}>
                            voted {ballot}
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
                              Vote Yes
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 border-no/50 px-2 text-no hover:bg-no/10"
                              disabled={busy !== null}
                              onClick={() => act("vote", () => postUmaVote(slug, i, "No"))}
                            >
                              Vote No
                            </Button>
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">not voted</span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  {accountIndex === 0
                    ? "The operator runs the venue and does not sit on the jury — switch to a demo wallet in the header to cast a vote."
                    : votedBy.has(accountIndex)
                      ? `You have voted as ${walletLabel(accountIndex)}. Each address votes once — switch wallets in the header to add another juror's vote.`
                      : `You vote as ${walletLabel(accountIndex)}. Each address votes once; switch wallets in the header to vote as another juror.`}
                </p>
                <Button
                  className="w-full"
                  disabled={busy !== null || o.ballots.length === 0}
                  onClick={() => act("finalize", () => postUmaFinalize(slug, accountIndex))}
                >
                  <Gavel className="mr-2 h-4 w-4" />
                  {busy === "finalize"
                    ? "Finalizing…"
                    : o.ballots.length === 0
                      ? "Finalize verdict (needs at least one vote)"
                      : `Finalize verdict (${o.ballots.length} vote${o.ballots.length > 1 ? "s" : ""}, majority wins)`}
                </Button>
              </div>
            )}

            {o.state === "Resolved" && (
              <div className="space-y-2">
                <p className="text-muted-foreground">
                  The jury ruled <strong className={answerClass(o.verdict)}>{o.verdict}</strong>
                  {o.verdict === o.proposedAnswer
                    ? " — the dispute was defeated; the disputer loses its bond to the proposer."
                    : " — the dispute was upheld; the proposer loses its bond to the disputer."}
                </p>
                <Button
                  className="w-full"
                  disabled={busy !== null}
                  onClick={() => act("resolve", () => postUmaResolve(slug), true)}
                >
                  {busy === "resolve" ? "Resolving…" : "Copy the verdict on-chain (resolve)"}
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
