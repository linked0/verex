// Pre-save gate for the deployments manifest — run BETWEEN the forge deploy
// and `save-deployment <target>` (runbook: docs/runbooks/deploy.md §2). It
// verifies that broadcast/DeployCTF.s.sol/<chainId>/run-latest.json really is
// the deploy you think it is, BEFORE its addresses get recorded:
//
//   1. deployer identity — run-latest's `from` must equal the address derived
//      from $VEREX_OPERATOR_KEY. The deploy key becomes the exchange's
//      permanent admin/operator (the runbooks' critical rule); recording a
//      backbone whose admin is some other key bricks every operator call.
//   2. cross-target collision — run-latest is per CHAIN id and test/prod
//      share Sepolia, so a stale file (e.g. the test deploy) can masquerade
//      as the prod one. Hard-fails if the OTHER target in deployments.json
//      already holds these addresses; warns if the broadcast is >60 min old.
//   3. on-chain liveness + wiring — all three addresses hold code on
//      $VEREX_RPC_URL, the RPC's chain id matches $VEREX_CHAIN_ID,
//      exchange.getCollateral()/getCtf() point at the recorded usdc/ctf, and
//      the deployer is isAdmin + isOperator on the exchange.
//
// Loads packages/api/.env itself (same as the other helpers here); shell env
// wins, so a sourced packages/contracts/.env.prod takes precedence.
//
//   pnpm --filter @verex/api check-deployment test|prod

import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve as pathResolve } from "node:path";
import { createPublicClient, http, parseAbi, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const CONTRACTS_DIR = pathResolve(__dirname, "../../contracts");
const DEPLOYMENTS_PATH = pathResolve(CONTRACTS_DIR, "deployments.json");

const EXCHANGE_VIEWS = parseAbi([
  "function getCollateral() view returns (address)",
  "function getCtf() view returns (address)",
  "function isAdmin(address) view returns (bool)",
  "function isOperator(address) view returns (bool)",
]);

let failed = false;
function ok(msg: string) {
  console.log(`  ✓ ${msg}`);
}
function fail(msg: string) {
  console.error(`  ✗ ${msg}`);
  failed = true;
}

async function main() {
  const target = process.argv[2];
  if (target !== "test" && target !== "prod") {
    console.error("Usage: pnpm --filter @verex/api check-deployment <test|prod>");
    process.exit(1);
  }
  const rpcUrl = process.env.VEREX_RPC_URL;
  const operatorKey = process.env.VEREX_OPERATOR_KEY;
  const chainId = Number(process.env.VEREX_CHAIN_ID ?? NaN);
  if (!rpcUrl || !operatorKey || !Number.isFinite(chainId)) {
    console.error(
      "Missing env — need VEREX_RPC_URL, VEREX_OPERATOR_KEY, VEREX_CHAIN_ID " +
        "(source packages/contracts/.env.prod for a prod check).",
    );
    process.exit(1);
  }

  // --- the pending broadcast ---
  const runPath = pathResolve(
    CONTRACTS_DIR,
    `broadcast/DeployCTF.s.sol/${chainId}/run-latest.json`,
  );
  let run: {
    timestamp?: number;
    returns?: Record<string, { value?: string }>;
    transactions?: { transaction?: { from?: string } }[];
  };
  try {
    run = JSON.parse(readFileSync(runPath, "utf8"));
  } catch {
    console.error(`Could not read ${runPath} — run the DeployCTF.s.sol forge script first.`);
    process.exit(1);
  }
  const returns = run.returns ?? {};
  const candidate: Record<string, Address> = {};
  for (const name of ["usdc", "ctf", "exchange"] as const) {
    const v = returns[name]?.value;
    if (!v || !/^0x[0-9a-fA-F]{40}$/.test(v)) {
      console.error(`Broadcast has no '${name}' address in its returns — not a DeployCTF run?`);
      process.exit(1);
    }
    candidate[name] = v as Address;
  }

  console.log(`Checking pending '${target}' deployment (chain ${chainId}):`);
  for (const name of ["usdc", "ctf", "exchange"] as const) {
    console.log(`    ${name}: ${candidate[name]}`);
  }

  // --- 1. deployer identity (the critical rule) ---
  const operator = privateKeyToAccount(operatorKey as `0x${string}`).address;
  const broadcastFrom = run.transactions?.find((t) => t.transaction?.from)?.transaction?.from;
  if (!broadcastFrom) {
    fail("broadcast has no `from` address — cannot verify the deployer");
  } else if (broadcastFrom.toLowerCase() !== operator.toLowerCase()) {
    fail(
      `deployer mismatch: broadcast was sent by ${broadcastFrom}, but ` +
        `$VEREX_OPERATOR_KEY derives ${operator} — this run-latest.json is NOT ` +
        `your deploy (stale file, or wrong key in the shell)`,
    );
  } else {
    ok(`deployer matches $VEREX_OPERATOR_KEY (${operator})`);
  }

  // --- 2. staleness + cross-target collision ---
  if (run.timestamp) {
    const ageMin = Math.round((Date.now() - run.timestamp) / 60_000);
    if (ageMin > 60) {
      console.warn(
        `  ⚠ broadcast is ${ageMin} min old — run-latest.json is overwritten by every ` +
          `deploy on this chain; make sure this is YOUR deploy, not an earlier one`,
      );
    } else {
      ok(`broadcast is recent (${ageMin} min old)`);
    }
  }
  let manifest: Record<string, { exchange?: string } | undefined> = {};
  try {
    manifest = JSON.parse(readFileSync(DEPLOYMENTS_PATH, "utf8"));
  } catch {
    // no manifest yet — nothing to collide with
  }
  const other = target === "prod" ? "test" : "prod";
  if (manifest[other]?.exchange?.toLowerCase() === candidate.exchange.toLowerCase()) {
    fail(
      `these are the '${other}' backbone's addresses (same exchange as the existing ` +
        `'${other}' manifest entry) — you are about to record the wrong environment`,
    );
  } else {
    ok(`no collision with the '${other}' manifest entry`);
  }
  if (manifest[target]?.exchange?.toLowerCase() === candidate.exchange.toLowerCase()) {
    console.log(`  ℹ '${target}' already has exactly these addresses (re-run would be a no-op)`);
  }

  // --- 3. on-chain liveness + wiring ---
  const pc = createPublicClient({ transport: http(rpcUrl) });
  const liveChainId = await pc.getChainId();
  if (liveChainId !== chainId) {
    fail(`RPC reports chain ${liveChainId}, but VEREX_CHAIN_ID=${chainId}`);
  } else {
    ok(`RPC chain id matches (${chainId})`);
  }
  for (const name of ["usdc", "ctf", "exchange"] as const) {
    const code = await pc.getCode({ address: candidate[name] });
    if (!code || code === "0x") fail(`no contract code at ${name} ${candidate[name]}`);
    else ok(`code present at ${name}`);
  }
  const exch = { address: candidate.exchange, abi: EXCHANGE_VIEWS } as const;
  const [collateral, ctf, isAdmin, isOperator] = await Promise.all([
    pc.readContract({ ...exch, functionName: "getCollateral" }),
    pc.readContract({ ...exch, functionName: "getCtf" }),
    pc.readContract({ ...exch, functionName: "isAdmin", args: [operator] }),
    pc.readContract({ ...exch, functionName: "isOperator", args: [operator] }),
  ]);
  if (collateral.toLowerCase() !== candidate.usdc.toLowerCase()) {
    fail(`exchange.getCollateral() = ${collateral}, expected the recorded usdc`);
  } else {
    ok("exchange collateral wiring matches usdc");
  }
  if (ctf.toLowerCase() !== candidate.ctf.toLowerCase()) {
    fail(`exchange.getCtf() = ${ctf}, expected the recorded ctf`);
  } else {
    ok("exchange CTF wiring matches ctf");
  }
  if (!isAdmin || !isOperator) {
    fail(
      `operator ${operator} is admin=${isAdmin} operator=${isOperator} on the exchange — ` +
        `must be both (deployed with a different key?)`,
    );
  } else {
    ok("operator is admin + operator on the exchange");
  }

  if (failed) {
    console.error(`\n✗ NOT safe to record — fix the above before save-deployment ${target}`);
    process.exit(1);
  }
  console.log(`\n✓ all checks passed — safe to run: pnpm --filter @verex/api save-deployment ${target}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
