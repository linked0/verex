// One-off helper for the deploy runbook (docs/runbooks/deploy.md §2):
// records a just-deployed backbone's addresses into
// packages/contracts/deployments.json — the committed per-environment
// manifest seed.ts reads when VEREX_DEPLOY_TARGET=staging|prod. Reads the
// addresses from forge's own broadcast artifact (the `returns` block of
// DeployCTF.s.sol's run-latest.json) instead of asking you to copy-paste
// them, so a typo'd or stale address can't enter the manifest.
//
// Run it IMMEDIATELY after the forge deploy: run-latest.json is per chain id,
// and staging/prod share Sepolia — the next deploy on the same chain overwrites
// it, so "latest" is only guaranteed to be yours right after you deployed.
//
// Loads packages/api/.env itself (same as the other helpers here); chain id
// comes from $VEREX_CHAIN_ID there or in your shell.
//
//   pnpm --filter @verex/api save-deployment staging
//   pnpm --filter @verex/api save-deployment prod

import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve as pathResolve } from "node:path";

const CONTRACTS_DIR = pathResolve(__dirname, "../../contracts");
const DEPLOYMENTS_PATH = pathResolve(CONTRACTS_DIR, "deployments.json");

const target = process.argv[2];
if (target === "test") {
  console.error("target 'test' was renamed to 'staging' (2026-07-28) — use: save-deployment staging");
  process.exit(1);
}
if (target !== "staging" && target !== "prod") {
  console.error(
    "Usage: pnpm --filter @verex/api save-deployment <staging|prod>\n" +
      "('local' is never recorded — anvil backbones are throwaway)",
  );
  process.exit(1);
}

const chainId = Number(process.env.VEREX_CHAIN_ID ?? NaN);
if (!Number.isFinite(chainId) || chainId === 31337) {
  console.error(
    `VEREX_CHAIN_ID must point at the real chain you deployed to ` +
      `(got ${process.env.VEREX_CHAIN_ID ?? "unset"}).`,
  );
  process.exit(1);
}

const runPath = pathResolve(
  CONTRACTS_DIR,
  `broadcast/DeployCTF.s.sol/${chainId}/run-latest.json`,
);
let returns: Record<string, { value?: string }>;
try {
  returns = JSON.parse(readFileSync(runPath, "utf8")).returns ?? {};
} catch {
  console.error(`Could not read ${runPath} — run the DeployCTF.s.sol forge script first.`);
  process.exit(1);
}

function addr(name: string): string {
  const v = returns[name]?.value;
  if (!v || !/^0x[0-9a-fA-F]{40}$/.test(v)) {
    console.error(
      `Broadcast artifact has no '${name}' address in its returns — was ` +
        `run-latest.json written by DeployCTF.s.sol?`,
    );
    process.exit(1);
  }
  return v;
}

const entry: Record<string, unknown> = {
  chainId,
  usdc: addr("usdc"),
  ctf: addr("ctf"),
  exchange: addr("exchange"),
};

let manifest: Record<string, Record<string, unknown>> = {};
try {
  manifest = JSON.parse(readFileSync(DEPLOYMENTS_PATH, "utf8"));
} catch {
  // first entry ever — start a fresh manifest
}

// The UMA adapter is written by a different script (save-uma-adapter.ts) into
// this same entry, so a plain overwrite here would silently erase it. Whether
// it survives depends on the CTF: the adapter's constructor binds it to one
// ConditionalTokens, so it only remains valid if this deploy landed on the same
// one. A new CTF makes the recorded adapter meaningless — drop it loudly rather
// than carry an address that now points into a different backbone.
const prior = manifest[target];
if (prior?.umaAdapter) {
  if (prior.ctf === entry.ctf) {
    entry.umaAdapter = prior.umaAdapter;
    entry.umaOracle = prior.umaOracle;
  } else {
    console.warn(
      `! dropping umaAdapter ${prior.umaAdapter} — it is bound to the previous ` +
        `ConditionalTokens (${prior.ctf}), not the one just deployed (${entry.ctf}).\n` +
        `  Redeploy it: forge script script/DeployUmaAdapter.s.sol … then save-uma-adapter ${target}.`,
    );
  }
}

manifest[target] = entry;
writeFileSync(DEPLOYMENTS_PATH, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Wrote '${target}' to ${DEPLOYMENTS_PATH}:`);
console.log(JSON.stringify(entry, null, 2));
console.log("\nReview the diff and commit deployments.json — the seed reads it from git.");
