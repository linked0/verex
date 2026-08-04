// LMSR quote pricing (Hybrid AMM + CLOB, Phase A — off-chain only).
//
// Hanson's Logarithmic Market Scoring Rule prices an outcome as a softmax over
// the quantity the maker has sold of each outcome:
//
//     price_i = e^(q_i / b) / Σⱼ e^(q_j / b)
//
// Why this and not the constant-product curve the feature doc originally
// proposed: CPMM is built for two assets whose relative price ranges over
// (0, ∞). Prediction outcomes are bounded in [0, 1] and must sum to 1, and at
// the tails a constant-product pool quotes a Yes token *above* $1.00 — a price
// no rational buyer pays, since $1 is the most the token can ever pay out. That
// is a shape problem, not a tuning problem. LMSR gets all three properties we
// need structurally: prices sum to 1, prices stay inside (0, 1), and the
// maker's worst-case loss is bounded by `b · ln(n)`.
//
// `b` is the liquidity parameter and the only dial: larger b => tighter,
// deeper quotes, paid for with a larger worst-case subsidy.
//
// Seeding. A market opens at a chosen probability (0.63, not 0.50), but raw
// LMSR with q = 0 everywhere quotes a uniform 1/n. Rather than storing a
// synthetic starting inventory we fold the opening probability into the
// formula. Setting q_i^seed = b·ln(p_i^0) and using the softmax's
// shift-invariance gives the form actually used here:
//
//     price_i = p_i^0 · e^(q_i / b) / Σⱼ p_j^0 · e^(q_j / b)
//
// which reduces to plain LMSR when every p^0 is 1/n, and returns exactly p^0
// when no trading has happened.

/** Default liquidity parameter, in outcome tokens. Overridable per market. */
export const DEFAULT_LMSR_B = 250;

/** Prices are clamped away from the absorbing 0/1 boundaries. */
export const LMSR_PRICE_MIN = 0.02;
export const LMSR_PRICE_MAX = 0.98;

export type LmsrOutcome = {
  /** Stable key — market id, or outcome id for a standalone binary market. */
  key: string;
  /** Opening probability p^0, strictly inside (0, 1). */
  openingPrice: number;
  /** Net quantity of this outcome the operator has SOLD (negative = bought back). */
  netSold: number;
};

/**
 * Prices for one LMSR "book" — the outcomes that must sum to 1.
 *
 * For a standalone binary market that is its Yes and No. For a group it is the
 * Yes side of every member: the group is what has to total 100%, and this
 * replaces the old proportional rescaling of sibling centers with the same
 * softmax that prices everything else.
 */
export function lmsrPrices(outcomes: LmsrOutcome[], b: number): Map<string, number> {
  if (outcomes.length === 0) return new Map();
  if (!(b > 0)) throw new Error(`LMSR b must be positive, got ${b}`);

  // Softmax in log space, shifted by the max exponent. exp() of a few hundred
  // overflows to Infinity and NaNs the whole vector; subtracting the max is
  // exact here because the softmax is shift-invariant.
  const logits = outcomes.map((o) => Math.log(clampOpening(o.openingPrice)) + o.netSold / b);
  const maxLogit = Math.max(...logits);
  const weights = logits.map((l) => Math.exp(l - maxLogit));
  const total = weights.reduce((a, w) => a + w, 0);

  const raw = outcomes.map((o, i) => [o.key, weights[i]! / total] as const);
  return renormalize(raw.map(([k, p]) => [k, clampPrice(p)] as const));
}

/**
 * Worst-case subsidy the maker can lose across a book of `n` outcomes: `b·ln(n)`.
 * This is the number that makes LMSR fundable — the operator decides up front
 * what liquidity costs, and the formula cannot exceed it.
 */
export function lmsrMaxLoss(b: number, outcomeCount: number): number {
  return b * Math.log(Math.max(1, outcomeCount));
}

/** Opening prices arrive from the DB as Decimal; keep them off the boundaries. */
function clampOpening(p: number): number {
  if (!Number.isFinite(p) || p <= 0) return LMSR_PRICE_MIN;
  if (p >= 1) return LMSR_PRICE_MAX;
  return p;
}

function clampPrice(p: number): number {
  return Math.min(LMSR_PRICE_MAX, Math.max(LMSR_PRICE_MIN, p));
}

/**
 * Clamping breaks the sum-to-1 guarantee at the tails, so restore it by
 * distributing the residual across the outcomes that still have headroom.
 * Without this a heavily one-sided group would quote probabilities summing to
 * more than 100%, which is exactly the arbitrage the whole design avoids.
 */
function renormalize(entries: ReadonlyArray<readonly [string, number]>): Map<string, number> {
  const out = new Map(entries.map(([k, p]) => [k, p]));
  if (out.size < 2) return new Map([...out].map(([k, p]) => [k, round(p)]));

  for (let pass = 0; pass < 8; pass++) {
    const sum = [...out.values()].reduce((a, p) => a + p, 0);
    const residual = 1 - sum;
    if (Math.abs(residual) < 1e-9) break;

    // Only outcomes that can absorb the residual without re-crossing a bound.
    const movable = [...out.entries()].filter(([, p]) =>
      residual > 0 ? p < LMSR_PRICE_MAX : p > LMSR_PRICE_MIN,
    );
    if (movable.length === 0) break;

    const headroom = movable.reduce(
      (a, [, p]) => a + (residual > 0 ? LMSR_PRICE_MAX - p : p - LMSR_PRICE_MIN),
      0,
    );
    if (headroom <= 0) break;

    for (const [k, p] of movable) {
      const room = residual > 0 ? LMSR_PRICE_MAX - p : p - LMSR_PRICE_MIN;
      out.set(k, p + residual * (room / headroom));
    }
  }

  return new Map([...out].map(([k, p]) => [k, round(clampPrice(p))]));
}

const round = (p: number) => Number(p.toFixed(4));
