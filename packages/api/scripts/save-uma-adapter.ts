// Records a just-deployed UmaCtfAdapter into packages/contracts/deployments.json
// (runbook: docs/runbooks/deploy.md §2b). Reads the address from forge's own
// broadcast artifact rather than asking you to copy-paste it.
//
// Unlike the backbone, this is one contract with one hazard, so the check and
// the save are a single step — there is no separate `check-uma-adapter`. It
// verifies, before writing anything:
//
//   1. deployer identity — run-latest's `from` must equal the address derived
//      from $VEREX_OPERATOR_KEY, and it must be the adapter's admin(). Only the
//      admin can initialize questions; an adapter admin'd by a key you don't
//      hold can never be used.
//   2. cross-target collision — run-latest.json is per CHAIN id and
//      staging/prod share Sepolia, so a stale file can masquerade as this
//      target's deploy. Hard-fails if the OTHER target already holds this
//      address; warns if the broadcast is over an hour old.
//   3. on-chain wiring — the adapter's ctf() must equal the ctf already
//      recorded for this target. This is the error worth catching: an adapter
//      bound to the other environment's CTF looks fine until a market resolves
//      into a condition nobody's positions live in.
//   4. no silent replacement — refuses to overwrite an existing umaAdapter
//      unless --force, because a market's conditionId hashes the adapter
//      address, so a new adapter cannot inherit the old one's markets.
//
// Loads packages/api/.env itself (same as the other helpers here); shell env
// wins, so a sourced packages/contracts/.env.prod takes precedence.
//
//   pnpm --filter @verex/api save-uma-adapter staging
//   pnpm --filter @verex/api save-uma-adapter prod --force   # deliberate replacement

import "dotenv/config";
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { resolve as pathResolve } from "node:path";
import { createPublicClient, http, parseAbi, getAddress, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const CONTRACTS_DIR = pathResolve(__dirname, "../../contracts");
const DEPLOYMENTS_PATH = pathResolve(CONTRACTS_DIR, "deployments.json");

const ADAPTER_VIEWS = parseAbi([
  "function ctf() view returns (address)",
  "function oo() view returns (address)",
  "function admin() view returns (address)",
]);

type Entry = {
  chainId: number;
  usdc: string;
  ctf: string;
  exchange: string;
  umaAdapter?: string;
  umaOracle?: string;
};

let failed = false;
const ok = (m: string) => console.log(`  ✓ ${m}`);
const fail = (m: string) => {
  console.error(`  ✗ ${m}`);
  failed = true;
};

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const target = args.find((a) => !a.startsWith("--"));

  if (target !== "staging" && target !== "prod") {
    console.error(
      "Usage: pnpm --filter @verex/api save-uma-adapter <staging|prod> [--force]\n" +
        "('local' is never recorded — anvil backbones are throwaway)",
    );
    process.exit(1);
  }

  const rpcUrl = process.env.VEREX_RPC_URL;
  const operatorKey = process.env.VEREX_OPERATOR_KEY;
  const chainId = Number(process.env.VEREX_CHAIN_ID ?? NaN);
  if (!rpcUrl || !operatorKey) {
    console.error("VEREX_RPC_URL and VEREX_OPERATOR_KEY must be set (source the chain env file).");
    process.exit(1);
  }
  if (!Number.isFinite(chainId) || chainId === 31337) {
    console.error(
      `VEREX_CHAIN_ID must point at the real chain you deployed to ` +
        `(got ${process.env.VEREX_CHAIN_ID ?? "unset"}).`,
    );
    process.exit(1);
  }

  // --- manifest must already describe this target's backbone
  let manifest: Record<string, Entry>;
  try {
    manifest = JSON.parse(readFileSync(DEPLOYMENTS_PATH, "utf8"));
  } catch {
    console.error(`Could not read ${DEPLOYMENTS_PATH}.`);
    process.exit(1);
  }
  const entry = manifest[target];
  if (!entry?.ctf) {
    console.error(
      `deployments.json has no '${target}' backbone yet — deploy it and run ` +
        `save-deployment ${target} first. The adapter is bound to that CTF.`,
    );
    process.exit(1);
  }

  // --- read the broadcast artifact
  const runPath = pathResolve(
    CONTRACTS_DIR,
    `broadcast/DeployUmaAdapter.s.sol/${chainId}/run-latest.json`,
  );
  let run: {
    returns?: Record<string, { value?: string }>;
    // `from` is nested under `transaction`, same as check-deployment.ts reads it.
    transactions?: { transactionType?: string; transaction?: { from?: string } }[];
  };
  try {
    run = JSON.parse(readFileSync(runPath, "utf8"));
  } catch {
    console.error(
      `Could not read ${runPath} — run DeployUmaAdapter.s.sol with --broadcast first.`,
    );
    process.exit(1);
  }

  function returned(name: string): Address {
    const v = run.returns?.[name]?.value;
    if (!v || !/^0x[0-9a-fA-F]{40}$/.test(v)) {
      console.error(`Broadcast artifact has no '${name}' address in its returns.`);
      process.exit(1);
    }
    return getAddress(v);
  }
  const adapter = returned("adapter");
  const oracle = returned("oracle");

  console.log(`\nUmaCtfAdapter ${adapter}  (target: ${target}, chain ${chainId})\n`);

  // 1. deployer identity
  const expectedDeployer = privateKeyToAccount(operatorKey as `0x${string}`).address;
  const from = run.transactions?.find((t) => t.transactionType === "CREATE")?.transaction?.from;
  if (!from) {
    fail("broadcast has no CREATE transaction — was this a --broadcast run, not a dry run?");
  } else if (getAddress(from) !== getAddress(expectedDeployer)) {
    fail(`broadcast deployer ${from} != $VEREX_OPERATOR_KEY address ${expectedDeployer}`);
  } else {
    ok(`deployed by the operator key (${expectedDeployer})`);
  }

  // freshness — run-latest.json is per chain id and shared across targets
  try {
    const ageMin = (Date.now() - statSync(runPath).mtimeMs) / 60_000;
    if (ageMin > 60) {
      console.warn(
        `  ! broadcast artifact is ${Math.round(ageMin)} min old — make sure it is ` +
          `this deploy and not an earlier one on the same chain`,
      );
    }
  } catch {
    /* mtime is a nicety, not a gate */
  }

  // 2. cross-target collision
  const other = target === "staging" ? "prod" : "staging";
  if (manifest[other]?.umaAdapter && getAddress(manifest[other].umaAdapter!) === adapter) {
    fail(`this address is already recorded as ${other}'s umaAdapter — wrong broadcast file`);
  } else {
    ok(`not already recorded under '${other}'`);
  }

  // 3. on-chain wiring
  const client = createPublicClient({ transport: http(rpcUrl) });
  const rpcChainId = await client.getChainId();
  if (rpcChainId !== chainId) {
    fail(`RPC chain id ${rpcChainId} != VEREX_CHAIN_ID ${chainId}`);
  } else {
    ok(`RPC is on chain ${chainId}`);
  }

  const code = await client.getBytecode({ address: adapter });
  if (!code || code === "0x") {
    fail("no code at the adapter address");
  } else {
    ok("adapter has code on-chain");

    const [onChainCtf, onChainOo, onChainAdmin] = await Promise.all([
      client.readContract({ address: adapter, abi: ADAPTER_VIEWS, functionName: "ctf" }),
      client.readContract({ address: adapter, abi: ADAPTER_VIEWS, functionName: "oo" }),
      client.readContract({ address: adapter, abi: ADAPTER_VIEWS, functionName: "admin" }),
    ]);

    if (getAddress(onChainCtf) !== getAddress(entry.ctf)) {
      fail(`adapter.ctf() ${onChainCtf} != ${target}'s recorded ctf ${entry.ctf}`);
    } else {
      ok(`bound to ${target}'s ConditionalTokens`);
    }
    if (getAddress(onChainOo) !== oracle) {
      fail(`adapter.oo() ${onChainOo} != the oracle the script returned ${oracle}`);
    } else {
      ok(`points at OptimisticOracleV2 ${oracle}`);
    }
    if (getAddress(onChainAdmin) !== getAddress(expectedDeployer)) {
      fail(
        `adapter.admin() ${onChainAdmin} != operator ${expectedDeployer} — ` +
          `only admin can initialize questions`,
      );
    } else {
      ok("operator is the adapter admin");
    }
  }

  // 4. no silent replacement
  if (entry.umaAdapter && getAddress(entry.umaAdapter) !== adapter) {
    if (force) {
      console.warn(
        `\n  ! replacing ${target}'s umaAdapter ${entry.umaAdapter} -> ${adapter} (--force).\n` +
          `    Markets created against the old adapter keep resolving through it;\n` +
          `    they do NOT migrate. Only new markets use the new address.`,
      );
    } else {
      fail(
        `${target} already has umaAdapter ${entry.umaAdapter}. A market's conditionId ` +
          `hashes the adapter address, so a new adapter cannot inherit its markets. ` +
          `Pass --force if the replacement is deliberate.`,
      );
    }
  }

  if (failed) {
    console.error("\n✗ checks failed — nothing written.\n");
    process.exit(1);
  }

  entry.umaAdapter = adapter;
  entry.umaOracle = oracle;
  manifest[target] = entry;
  writeFileSync(DEPLOYMENTS_PATH, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`\n✓ all checks passed — wrote '${target}' in ${DEPLOYMENTS_PATH}:`);
  console.log(JSON.stringify(entry, null, 2));
  console.log("\nReview the diff and commit deployments.json — the seed reads it from git.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
