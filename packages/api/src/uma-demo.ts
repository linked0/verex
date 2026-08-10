// The walkable dispute demo: propose / dispute / vote / finalize against the
// MOCK oracle, plus a read-only lifecycle view that works against either
// oracle.
//
// Three scenarios this enables in a browser (docs/runbooks/uma-local-demo.md):
//   1. dispute defeated — wallet #1 disputes, the jury sides with the proposer
//   2. dispute upheld   — the jury overturns the proposed answer
//   3. dead end         — a dispute with no verdict freezes the market (this
//      one needs no mock; it is exactly what a real-oracle dispute does)
//
// Every WRITE here is mock-only by guard, not by accident: on the real oracle
// a dispute escalates to UMA's DVM where staked voters rule — a demo jury
// voting there would be theatre, and proposing/disputing needs WETH the demo
// wallets don't hold. Reads work against both oracles.

import { formatUnits } from "viem";
import {
  UMA_YES,
  UMA_NO,
  UMA_UNRESOLVABLE,
  type Address,
  type Hex,
  type UmaRequestState,
} from "@verex/sdk";
import { prisma } from "./db";
import { loadChain, accountAddress, type ChainCtx } from "./chain";

function httpError(message: string, statusCode: number): Error {
  const e = new Error(message) as Error & { statusCode: number };
  e.statusCode = statusCode;
  return e;
}

export type UmaAnswer = "Yes" | "No" | "Unresolvable";

const ANSWER_PRICE: Record<UmaAnswer, bigint> = {
  Yes: UMA_YES,
  No: UMA_NO,
  Unresolvable: UMA_UNRESOLVABLE,
};

function priceToAnswer(price: bigint): UmaAnswer | null {
  if (price === UMA_YES) return "Yes";
  if (price === UMA_NO) return "No";
  if (price === UMA_UNRESOLVABLE) return "Unresolvable";
  return null;
}

/// Resolve a market's oracle request key from what is ON CHAIN (the adapter's
/// stored question), never from reconstructed inputs — the ancillary bytes
/// must match to the byte or the oracle sees a different request.
async function requestKeyFor(chain: ChainCtx, market: { questionId: string; umaAdapter: string | null }) {
  if (!market.umaAdapter) throw httpError("market has no adapter recorded", 500);
  const adapter = chain.umaAs(0, market.umaAdapter as Address);
  const q = await adapter.getQuestion(market.questionId as Hex);
  if (q.requestTimestamp === 0n) throw httpError("question not initialized on the adapter", 500);
  return {
    requester: market.umaAdapter as Address,
    timestamp: q.requestTimestamp,
    ancillaryData: q.ancillaryData,
    bond: q.bond,
  };
}

async function umaMarket(slug: string) {
  const market = await prisma.market.findUnique({ where: { slug } });
  if (!market) throw httpError("market not found", 404);
  if (market.oracleType !== "UMA") {
    throw httpError("this market is operator-resolved — it has no oracle lifecycle", 400);
  }
  return market;
}

function requireMock(chain: ChainCtx) {
  if (!chain.umaOracleMock) {
    throw httpError(
      "this environment runs against the real UMA oracle — propose/dispute per " +
        "docs/runbooks/uma-adapter.md §4, and disputes there are ruled by UMA's DVM, " +
        "not by demo wallets",
      400,
    );
  }
}

/// Read-only lifecycle view for the market page's oracle panel.
export async function umaLifecycle(slug: string) {
  const chain = await loadChain();
  if (chain.chainId === 0) throw httpError("trading is disabled in this environment", 400);
  const market = await umaMarket(slug);
  const key = await requestKeyFor(chain, market);
  const oracle = chain.umaOracleAs(0);

  const [state, request] = await Promise.all([oracle.getState(key), oracle.getRequest(key)]);
  const ballots = chain.umaOracleMock && state !== "Invalid" && state !== "Requested" && state !== "Proposed"
    ? await oracle.getBallots(key)
    : [];

  // Which demo wallet an address belongs to (if any) — the UI names jurors
  // "wallet #2", not 0x-strings.
  const indexOf = new Map<string, number>();
  for (let i = 0; i <= 5; i++) indexOf.set(accountAddress(i).toLowerCase(), i);

  const bondDecimals = chain.umaOracleMock ? 6 : 18; // USDC vs WETH
  return {
    slug,
    oracle: {
      address: chain.umaOracleAddr,
      mock: chain.umaOracleMock,
      state: state as UmaRequestState,
      proposer: request.proposer === "0x0000000000000000000000000000000000000000" ? null : request.proposer,
      proposerIndex: indexOf.get(request.proposer.toLowerCase()) ?? null,
      disputer: request.disputer === "0x0000000000000000000000000000000000000000" ? null : request.disputer,
      disputerIndex: indexOf.get(request.disputer.toLowerCase()) ?? null,
      proposedAnswer: request.proposer === "0x0000000000000000000000000000000000000000"
        ? null
        : priceToAnswer(request.proposedPrice),
      verdict: state === "Resolved" || state === "Settled" ? priceToAnswer(request.resolvedPrice) : null,
      bond: Number(formatUnits(key.bond, bondDecimals)),
      bondCurrency: chain.umaOracleMock ? "USDC" : "WETH",
      /// Unix seconds; 0 until proposed. The challenge window's end.
      expirationTime: Number(request.expirationTime),
      settled: request.settled,
      ballots: ballots.map((b) => ({
        voter: b.voter,
        voterIndex: indexOf.get(b.voter.toLowerCase()) ?? null,
        answer: priceToAnswer(b.answer),
      })),
    },
  };
}

/// Every write below acts AS a caller the UI names (the selected demo wallet),
/// never as an ambient "the app does it". Proposing, disputing and voting are
/// separate parties in UMA's design, and a demo that lets one screen drive all
/// of them teaches the opposite of what the oracle is for.
function requireAccount(accountIndex: number, opts: { juryOnly?: boolean } = {}) {
  if (!Number.isInteger(accountIndex) || accountIndex < 0 || accountIndex > 9) {
    throw httpError("accountIndex must be 0..9", 400);
  }
  // The operator runs the venue; letting it also judge its own markets is the
  // conflict of interest UMA exists to remove. Proposing/disputing are fine —
  // those only make claims, and anyone may make one.
  if (opts.juryOnly && accountIndex === 0) {
    throw httpError("the operator does not sit on the jury — vote as a demo wallet", 400);
  }
}

/// Propose an answer, bonding USDC. Permissionless in UMA, so any wallet. Mock only.
export async function umaPropose(slug: string, answer: UmaAnswer, accountIndex: number) {
  requireAccount(accountIndex);
  const chain = await loadChain();
  requireMock(chain);
  const market = await umaMarket(slug);
  const key = await requestKeyFor(chain, market);
  const txHash = await chain
    .umaOracleAs(accountIndex)
    .proposePrice({ ...key, price: ANSWER_PRICE[answer] });
  return { slug, proposed: answer, proposer: accountIndex, txHash };
}

/// Dispute the live proposal, bonding USDC. Mock only. Self-dispute is allowed
/// on purpose: on real UMA it is the only way to retract your own wrong answer.
export async function umaDispute(slug: string, accountIndex: number) {
  requireAccount(accountIndex);
  const chain = await loadChain();
  requireMock(chain);
  const market = await umaMarket(slug);
  const key = await requestKeyFor(chain, market);
  const txHash = await chain.umaOracleAs(accountIndex).disputePrice(key);
  return { slug, disputer: accountIndex, txHash };
}

/// A demo wallet casts its one jury vote. Mock only.
export async function umaVote(slug: string, accountIndex: number, answer: UmaAnswer) {
  requireAccount(accountIndex, { juryOnly: true });
  const chain = await loadChain();
  requireMock(chain);
  const market = await umaMarket(slug);
  const key = await requestKeyFor(chain, market);
  const txHash = await chain.umaOracleAs(accountIndex).vote({ ...key, answer: ANSWER_PRICE[answer] });
  return { slug, voter: accountIndex, answer, txHash };
}

/// Close the jury: majority wins, a tie settles Unresolvable. Mock only.
/// Not privileged — like resolve, anyone may send it; it only counts ballots.
export async function umaFinalize(slug: string, accountIndex: number) {
  requireAccount(accountIndex);
  const chain = await loadChain();
  requireMock(chain);
  const market = await umaMarket(slug);
  const key = await requestKeyFor(chain, market);
  const txHash = await chain.umaOracleAs(accountIndex).finalizeVote(key);
  const state = await chain.umaOracleAs(accountIndex).getState(key);
  return { slug, state, txHash };
}
