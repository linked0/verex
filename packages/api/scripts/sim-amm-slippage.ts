// AMM curve slippage simulation — decision support for the hybrid AMM+CLOB
// curve choice (docs/features/hybrid-amm-clob.md, "Extreme-probability
// handling"). Compares execution price vs order size for three candidate
// curves at moderate and tail spot prices. Pure math, no chain, no DB:
//   pnpm --filter @verex/api exec tsx scripts/sim-amm-slippage.ts
//
// Comparable setups:
// - CPMM & StableSwap pools hold POOL_VALUE USDC of total value at each spot.
// - LMSR's b is chosen so its marginal depth at $0.50 equals the CPMM's
//   (dp/dq: CPMM 2p/y = 5e-4 at $0.50 → LMSR p(1-p)/b = 0.25/b → b = 500).
//   Note the capital asymmetry: LMSR's worst-case loss is b·ln2 ≈ $347,
//   while the pools lock up the full $2,000.

const POOL_VALUE = 2_000; // USDC of total pool value (both sides)
const AMP = 10; // StableSwap amplification
const B = 500; // LMSR liquidity parameter (depth-matched, see header)
const SPOTS = [0.5, 0.9, 0.95, 0.99];
const ORDER_SIZES = [10, 50, 100, 250]; // USDC spent buying YES

/// CPMM YES↔USDC pool: y·c = k. At spot p the pool holds c = V/2 USDC and
/// y = c/p YES. Spending S: shares out Δy = y·S/(c+S) (closed form).
function cpmm(p: number, S: number) {
  const c = POOL_VALUE / 2;
  const y = c / p;
  const dy = (y * S) / (c + S);
  return { exec: S / dy };
}

/// StableSwap (Curve, n=2) on value-normalized reserves: both sides start at
/// V/2 "value units" (1 unit = 1 USDC of value at the current spot), so the
/// flat region sits at the pool's current price. Newton solvers per Curve.
function ssGetD(x: number, y: number, A: number): number {
  const S = x + y;
  if (S === 0) return 0;
  const Ann = A * 4;
  let D = S;
  for (let i = 0; i < 255; i++) {
    const D_P = (D * D * D) / (4 * x * y);
    const Dnew = ((Ann * S + 2 * D_P) * D) / ((Ann - 1) * D + 3 * D_P);
    if (Math.abs(Dnew - D) < 1e-10) return Dnew;
    D = Dnew;
  }
  return D;
}
function ssGetY(x: number, D: number, A: number): number {
  const Ann = A * 4;
  const c = (D * D * D) / (4 * x * Ann);
  const b = x + D / Ann;
  let y = D;
  for (let i = 0; i < 255; i++) {
    const yNew = (y * y + c) / (2 * y + b - D);
    if (Math.abs(yNew - y) < 1e-10) return yNew;
    y = yNew;
  }
  return y;
}
function stableswap(p: number, S: number) {
  const half = POOL_VALUE / 2; // value units per side
  const D = ssGetD(half, half, AMP);
  const xAfter = half + S; // S USDC in = S value units in
  const yAfter = ssGetY(xAfter, D, AMP);
  const outValue = half - yAfter; // value units of YES out
  const shares = outValue / p;
  return { exec: S / shares };
}

/// LMSR: cost of moving from spot p by buying δ YES = b·ln(p·e^{δ/b}+1−p).
/// Invert for a USDC spend S: δ = b·ln((e^{S/b} − (1−p)) / p).
function lmsr(p: number, S: number) {
  const shares = B * Math.log((Math.exp(S / B) - (1 - p)) / p);
  const grown = p * Math.exp(shares / B);
  return { exec: S / shares, newSpot: grown / (grown + 1 - p) };
}

const fmt = (x: number) => (x >= 10 ? x.toFixed(1) : x.toFixed(4));
console.log(`pool value $${POOL_VALUE} · StableSwap A=${AMP} · LMSR b=${B} (max loss $${(B * Math.LN2).toFixed(0)})\n`);
console.log("| Spot | Order (USDC) | CPMM exec | StableSwap exec | LMSR exec | LMSR new spot |");
console.log("|------|-------------|-----------|-----------------|-----------|---------------|");
for (const p of SPOTS) {
  for (const S of ORDER_SIZES) {
    const cp = cpmm(p, S);
    const ss = stableswap(p, S);
    const lm = lmsr(p, S);
    const flag = cp.exec > 1 ? " ⚠️>$1" : "";
    console.log(
      `| $${p.toFixed(2)} | $${S} | $${fmt(cp.exec)}${flag} | $${fmt(ss.exec)} | $${fmt(lm.exec)} | $${fmt(lm.newSpot)} |`,
    );
  }
}
