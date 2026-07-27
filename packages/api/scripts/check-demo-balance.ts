// One-off helper for the testnet deploy runbook (docs/runbooks/contracts-testnet-deploy.md):
// checks the native-ETH balance of the 5 demo-wallet addresses (indices 1-5,
// the only ones the UI dropdown exposes) derived from a demo mnemonic — the
// exact same derivation chain.ts / gen-demo-mnemonic.ts use, so what you see
// here is what the app will actually use.
//
// Loads packages/api/.env itself (same as seed.ts / gen-demo-mnemonic.ts) —
// no need to `source` anything first, as long as packages/api/.env already
// has VEREX_RPC_URL/VEREX_CHAIN_ID filled in. Values already exported in
// your shell still take precedence over the .env file.
//
// The mnemonic itself is never written to disk by gen-demo-mnemonic.ts, so
// supply it as $VEREX_DEMO_MNEMONIC (same env var seed.ts reads, and same
// name it'll get in packages/api/.env once you reach step 5) — either
// already in that .env file, or exported inline for just this command.
// Never pass it as a CLI arg: unlike an env var, argv ends up in shell
// history and is visible to other processes via `ps`.
//
//   pnpm --filter @verex/api exec tsx scripts/check-demo-balance.ts
//   VEREX_DEMO_MNEMONIC="word1 word2 ..." pnpm --filter @verex/api exec tsx scripts/check-demo-balance.ts

import "dotenv/config";
import { formatEther } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { CHAINS, makePublicClient, type AccountConfig } from "@verex/sdk";

async function main() {
  const mnemonic = process.env.VEREX_DEMO_MNEMONIC?.trim();
  if (!mnemonic) {
    console.error(
      "Missing VEREX_DEMO_MNEMONIC — set it in packages/api/.env, or export it " +
        "inline for this command.",
    );
    process.exit(1);
  }

  const rpcUrl = process.env.VEREX_RPC_URL;
  if (!rpcUrl) {
    console.error("Missing VEREX_RPC_URL — set it in packages/api/.env or your shell.");
    process.exit(1);
  }

  const chainId = Number(process.env.VEREX_CHAIN_ID ?? 31337);
  const cfg: AccountConfig = {
    rpcUrl,
    chain: CHAINS[chainId] ?? CHAINS[31337]!,
    mnemonic: () => mnemonic,
  };
  const publicClient = makePublicClient(cfg);

  console.log("Demo-wallet ETH balances (indices 1-5):\n");
  for (let index = 1; index <= 5; index++) {
    const address = mnemonicToAccount(mnemonic, { addressIndex: index }).address;
    const balance = await publicClient.getBalance({ address });
    console.log(`  #${index}  ${address}  ${formatEther(balance)} ETH`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
