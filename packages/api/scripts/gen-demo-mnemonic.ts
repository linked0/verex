// One-off helper for the deploy runbook (docs/runbooks/deploy.md §3):
// generates a FRESH, private BIP-39 mnemonic, prints the 5 demo-wallet addresses
// (indices 1-5, the only ones the UI dropdown exposes) it derives — the exact same
// derivation chain.ts uses, so what you see here is what the app will actually use —
// and, if VEREX_OPERATOR_KEY/VEREX_RPC_URL are set, funds each of the 5 addresses
// with 0.01 ETH from the operator (replaces the old copy-paste `cast send` loop).
//
// Loads packages/api/.env itself (same as seed.ts) — no need to `source` anything
// or run this in the same shell as an earlier step, as long as packages/api/.env
// already has VEREX_OPERATOR_KEY/VEREX_RPC_URL/VEREX_CHAIN_ID filled in. Values
// already exported in your shell still take precedence over the .env file.
//
// Run once, save the mnemonic to Secret Manager (see the runbook), then discard this
// terminal's scrollback. Never commit the printed mnemonic anywhere.
//
//   pnpm --filter @verex/api exec tsx scripts/gen-demo-mnemonic.ts
//   pnpm --filter @verex/api exec tsx scripts/gen-demo-mnemonic.ts --store prod
//
// --store test|prod stores the mnemonic straight into Secret Manager
// (verex-demo-mnemonic-<DB_NAME>, names/project read from the matching
// scripts/deploy.env* file) BEFORE funding — via gcloud stdin, never argv —
// so no copy-paste bridge to §4 is needed at all: setup-chain-secrets.sh
// then just gets an empty Enter at its mnemonic prompt.

import "dotenv/config";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve as pathResolve } from "node:path";
import { parseEther, type Hex } from "viem";
import { english, generateMnemonic, mnemonicToAccount } from "viem/accounts";
import {
  CHAINS,
  makePublicClient,
  makeWalletClient,
  type AccountConfig,
} from "@verex/sdk";

const FUND_AMOUNT = parseEther("0.01");

/// Ready-to-paste spot-check command with the real mnemonic filled in — the
/// mnemonic is already in this terminal's scrollback either way, so this adds
/// convenience without new exposure. The leading space keeps the pasted line
/// out of shell history when HIST_IGNORE_SPACE (zsh) / ignorespace (bash) is on.
function printCheckCommand(mnemonic: string) {
  console.log("\nSpot-check the balances (paste as-is; note the leading space):\n");
  console.log(
    ` VEREX_DEMO_MNEMONIC="${mnemonic}" pnpm --filter @verex/api exec tsx scripts/check-demo-balance.ts`,
  );
}

/// Store the mnemonic into Secret Manager for the given deploy target.
/// PROJECT_ID/DB_NAME come from the same env file deploy.sh uses, so the
/// secret name can't drift; the value travels via gcloud's stdin, never argv.
function storeToSecretManager(mnemonic: string, target: "test" | "prod") {
  const envFile = pathResolve(
    __dirname,
    "../../../scripts",
    target === "prod" ? "deploy.env.prod" : "deploy.env",
  );
  const envText = readFileSync(envFile, "utf8");
  const dbName = envText.match(/^DB_NAME=(.+)$/m)?.[1]?.trim();
  const projectId = envText.match(/^PROJECT_ID=(.+)$/m)?.[1]?.trim();
  if (!dbName || !projectId) {
    throw new Error(`could not read DB_NAME/PROJECT_ID from ${envFile}`);
  }
  const secret = `verex-demo-mnemonic-${dbName}`;
  const exists =
    spawnSync("gcloud", ["secrets", "describe", secret, "--project", projectId], {
      stdio: "ignore",
    }).status === 0;
  const args = exists
    ? ["secrets", "versions", "add", secret, "--project", projectId, "--data-file=-"]
    : ["secrets", "create", secret, "--project", projectId, "--replication-policy=automatic", "--data-file=-"];
  const res = spawnSync("gcloud", args, { input: mnemonic, stdio: ["pipe", "ignore", "inherit"] });
  if (res.status !== 0) {
    throw new Error(`gcloud failed storing ${secret} — is gcloud installed and authenticated?`);
  }
  console.log(
    `\nStored in Secret Manager: ${secret} (${exists ? "new version added" : "created"}).`,
  );
}

async function main() {
  const storeIdx = process.argv.indexOf("--store");
  const storeTarget = storeIdx === -1 ? null : process.argv[storeIdx + 1];
  if (storeIdx !== -1 && storeTarget !== "test" && storeTarget !== "prod") {
    console.error("Usage: gen-demo-mnemonic.ts [--store test|prod]");
    process.exit(1);
  }

  const mnemonic = generateMnemonic(english);

  console.log("Demo mnemonic (save to Secret Manager, then clear your scrollback):\n");
  console.log(mnemonic);
  console.log("\nDerived demo-wallet addresses (indices 1-5):\n");
  const addresses = Array.from({ length: 5 }, (_, i) => {
    const index = i + 1;
    const address = mnemonicToAccount(mnemonic, { addressIndex: index }).address;
    console.log(`  #${index}  ${address}`);
    return address;
  });

  // Store BEFORE funding: a funding failure then can't lose the mnemonic.
  if (storeTarget) storeToSecretManager(mnemonic, storeTarget);

  const operatorKey = process.env.VEREX_OPERATOR_KEY?.trim() as Hex | undefined;
  const rpcUrl = process.env.VEREX_RPC_URL;
  if (!operatorKey || !rpcUrl) {
    console.log(
      "\nVEREX_OPERATOR_KEY/VEREX_RPC_URL not set — skipping funding. Fund the " +
        "5 addresses above manually, or re-run with both exported.",
    );
    printCheckCommand(mnemonic);
    return;
  }

  const chainId = Number(process.env.VEREX_CHAIN_ID ?? 31337);
  const cfg: AccountConfig = {
    rpcUrl,
    chain: CHAINS[chainId] ?? CHAINS[31337]!,
    operatorKey,
    mnemonic: () => mnemonic, // unused for index 0 (operatorKey takes precedence)
  };
  const operator = makeWalletClient(cfg, 0);
  const publicClient = makePublicClient(cfg);

  console.log(`\nFunding each address with 0.01 ETH from the operator...\n`);
  for (const [i, address] of addresses.entries()) {
    // Sequential + waiting for each receipt (not fired in parallel) — the
    // operator wallet client has no shared nonce manager across concurrent
    // sends, so this is the simple way to avoid a nonce collision here.
    const hash = await operator.sendTransaction({ to: address, value: FUND_AMOUNT });
    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`  #${i + 1}  ${address}  funded (tx ${hash})`);
  }
  console.log("\nDone.");
  printCheckCommand(mnemonic);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
