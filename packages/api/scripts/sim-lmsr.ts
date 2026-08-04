// Property check for src/lmsr.ts — the guarantees the curve was chosen for.
// Run: pnpm --filter @verex/api exec tsx scripts/sim-lmsr.ts
//
// Companion to sim-amm-slippage.ts, which is what ruled CPMM out: this asserts
// the failure mode found there (quotes above $1.00 at the tails) cannot occur.

import { DEFAULT_LMSR_B, lmsrMaxLoss, lmsrPrices, type LmsrOutcome } from "../src/lmsr";

let failures = 0;

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const sum = (m: Map<string, number>) => [...m.values()].reduce((a, p) => a + p, 0);

function binary(openingYes: number, qYes: number, qNo: number, b = DEFAULT_LMSR_B) {
  const outcomes: LmsrOutcome[] = [
    { key: "Yes", openingPrice: openingYes, netSold: qYes },
    { key: "No", openingPrice: 1 - openingYes, netSold: qNo },
  ];
  return lmsrPrices(outcomes, b);
}

console.log("\n1. No trading returns the opening probability");
for (const p0 of [0.05, 0.5, 0.63, 0.95]) {
  const p = binary(p0, 0, 0);
  check(`p0=${p0} -> ${p.get("Yes")}`, Math.abs(p.get("Yes")! - p0) < 1e-3);
}

console.log("\n2. Prices always sum to 1");
for (const [qy, qn] of [[0, 0], [500, 0], [0, 500], [5_000, -5_000], [-2_000, 400]]) {
  const s = sum(binary(0.63, qy!, qn!));
  check(`q=(${qy},${qn}) sum=${s.toFixed(6)}`, Math.abs(s - 1) < 1e-3, `sum was ${s}`);
}

console.log("\n3. Prices stay inside (0,1) — the CPMM failure mode");
let worst = 0;
for (let q = 0; q <= 100_000; q += 500) {
  const p = binary(0.63, q, 0);
  worst = Math.max(worst, p.get("Yes")!);
  if (p.get("Yes")! > 1 || p.get("No")! < 0) {
    check(`q=${q} produced ${p.get("Yes")}`, false);
    break;
  }
}
check(`max Yes price over a 100k one-sided run = ${worst}`, worst <= 1);

console.log("\n4. Buying pressure raises the price, monotonically");
let prev = 0;
let monotone = true;
for (let q = 0; q <= 20_000; q += 250) {
  const p = binary(0.5, q, 0).get("Yes")!;
  if (p < prev - 1e-9) monotone = false;
  prev = p;
}
check("price is non-decreasing in quantity sold", monotone);

console.log("\n5. Larger b means a flatter curve (deeper liquidity)");
const tight = binary(0.5, 1_000, 0, 100).get("Yes")!;
const deep = binary(0.5, 1_000, 0, 1_000).get("Yes")!;
check(`b=100 -> ${tight}, b=1000 -> ${deep}`, deep < tight, "larger b moved the price more");

console.log("\n6. Groups: an n-way book still totals 100%");
for (const n of [3, 5, 12]) {
  const outcomes: LmsrOutcome[] = Array.from({ length: n }, (_, i) => ({
    key: `c${i}`,
    openingPrice: 1 / n,
    netSold: i === 0 ? 8_000 : 0, // one candidate heavily bought
  }));
  const p = lmsrPrices(outcomes, DEFAULT_LMSR_B);
  const s = sum(p);
  check(`n=${n} sum=${s.toFixed(6)} leader=${p.get("c0")}`, Math.abs(s - 1) < 1e-3, `sum was ${s}`);
}

console.log("\n7. Extreme inputs do not overflow to NaN");
for (const q of [1e5, 1e6, -1e6]) {
  const p = binary(0.5, q, 0);
  const vals = [...p.values()];
  check(`q=${q} -> [${vals.join(", ")}]`, vals.every((v) => Number.isFinite(v)));
}

console.log("\n8. Bounded loss");
for (const n of [2, 5]) {
  const loss = lmsrMaxLoss(DEFAULT_LMSR_B, n);
  console.log(`  b=${DEFAULT_LMSR_B}, n=${n} -> max subsidy ${loss.toFixed(2)} USDC`);
}
check("binary max loss is b·ln2", Math.abs(lmsrMaxLoss(DEFAULT_LMSR_B, 2) - DEFAULT_LMSR_B * Math.LN2) < 1e-9);

console.log(failures === 0 ? "\nAll LMSR properties hold.\n" : `\n${failures} FAILING CHECK(S).\n`);
process.exit(failures === 0 ? 0 : 1);
