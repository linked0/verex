// One-off helper for the testnet deploy runbook (docs/runbooks/testnet-deploy.md):
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

import "dotenv/config";
import { parseEther, type Hex } from "viem";
import { english, generateMnemonic, mnemonicToAccount } from "viem/accounts";
import {
  CHAINS,
  makePublicClient,
  makeWalletClient,
  type AccountConfig,
} from "@verex/sdk";

const FUND_AMOUNT = parseEther("0.01");

async function main() {
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

  const operatorKey = process.env.VEREX_OPERATOR_KEY?.trim() as Hex | undefined;
  const rpcUrl = process.env.VEREX_RPC_URL;
  if (!operatorKey || !rpcUrl) {
    console.log(
      "\nVEREX_OPERATOR_KEY/VEREX_RPC_URL not set — skipping funding. Fund the " +
        "5 addresses above manually, or re-run with both exported.",
    );
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
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
