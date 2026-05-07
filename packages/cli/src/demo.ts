// End-to-end demo: deploy factory, create market, two-sided bet, resolve, claim.
// Assumes anvil is running on http://127.0.0.1:8545 with default mnemonic.
//
// Usage:
//   anvil &
//   pnpm --filter @verex/cli build && pnpm --filter @verex/cli demo
//
// Or with env override:
//   FACTORY=0x... pnpm --filter @verex/cli demo  # skip deploy, reuse factory

import { execSync } from "node:child_process";
import { resolve as pathResolve } from "node:path";
import { formatEther, parseEther } from "viem";
import {
  createFactoryClient,
  createMarketClient,
  type Address,
} from "@verex/sdk";
import { publicClient, walletClient, accountAddress, RPC_URL } from "./clients";

const CONTRACTS_DIR = pathResolve(__dirname, "../../contracts");

async function main() {
  const pc = publicClient();
  const owner = walletClient(0);
  const alice = walletClient(1);
  const bob = walletClient(2);

  const ownerAddr = accountAddress(0);
  const aliceAddr = accountAddress(1);
  const bobAddr = accountAddress(2);

  // 1. Deploy factory (or reuse via env)
  let factoryAddress: Address;
  if (process.env.FACTORY) {
    factoryAddress = process.env.FACTORY as Address;
    console.log(`[1] reusing factory ${factoryAddress}`);
  } else {
    console.log(`[1] deploying factory via forge script...`);
    const out = execSync(
      `forge script script/Deploy.s.sol --rpc-url ${RPC_URL} --broadcast`,
      { cwd: CONTRACTS_DIR, env: { ...process.env, PATH: `${process.env.HOME}/.foundry/bin:${process.env.PATH}` } },
    ).toString();
    const match = out.match(/MarketFactory deployed at:\s+(0x[a-fA-F0-9]{40})/);
    if (!match) {
      console.log(out);
      throw new Error("could not parse factory address from forge script output");
    }
    factoryAddress = match[1] as Address;
    console.log(`    factory=${factoryAddress}`);
  }

  // 2. Create market via factory
  console.log(`\n[2] creating market...`);
  const factory = createFactoryClient({
    address: factoryAddress,
    publicClient: pc,
    walletClient: owner,
  });
  const block = await pc.getBlock();
  const endTime = block.timestamp + 3600n; // 1 hour from now
  const marketAddr = await factory.createMarket(
    "Will the W1 demo work end-to-end?",
    endTime,
  );
  console.log(`    market=${marketAddr}`);
  console.log(`    endTime=${endTime} (${new Date(Number(endTime) * 1000).toISOString()})`);

  // 3. Both sides bet
  console.log(`\n[3] alice (account 1) bets 2 ETH on YES...`);
  const aliceMkt = createMarketClient({
    address: marketAddr,
    publicClient: pc,
    walletClient: alice,
  });
  await aliceMkt.buyYes(parseEther("2"));

  console.log(`    bob (account 2) bets 3 ETH on NO...`);
  const bobMkt = createMarketClient({
    address: marketAddr,
    publicClient: pc,
    walletClient: bob,
  });
  await bobMkt.buyNo(parseEther("3"));

  let info = await aliceMkt.getInfo();
  console.log(`    pools: yes=${formatEther(info.yesPool)} no=${formatEther(info.noPool)}`);

  // 4. Fast-forward time on anvil
  console.log(`\n[4] advancing anvil time past endTime...`);
  await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "evm_increaseTime",
      params: [3601],
      id: 1,
    }),
  });
  await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "evm_mine", params: [], id: 1 }),
  });

  // 5. Owner resolves YES
  console.log(`\n[5] owner (account 0) resolves YES...`);
  const ownerMkt = createMarketClient({
    address: marketAddr,
    publicClient: pc,
    walletClient: owner,
  });
  await ownerMkt.resolve(true);
  info = await aliceMkt.getInfo();
  console.log(`    resolved=${info.resolved} outcome=${info.outcome ? "YES" : "NO"}`);

  // 6. Both claim
  const aliceBefore = await pc.getBalance({ address: aliceAddr });
  const bobBefore = await pc.getBalance({ address: bobAddr });

  console.log(`\n[6] alice claims (winner)...`);
  await aliceMkt.claim();
  console.log(`    bob claims (loser)...`);
  await bobMkt.claim();

  const aliceAfter = await pc.getBalance({ address: aliceAddr });
  const bobAfter = await pc.getBalance({ address: bobAddr });

  console.log(`\n[7] balance changes (incl. gas):`);
  console.log(`    alice: ${formatEther(aliceAfter - aliceBefore)} ETH (expect ~+5)`);
  console.log(`    bob:   ${formatEther(bobAfter - bobBefore)} ETH (expect ~0, slight neg from gas)`);

  console.log(`\n✓ end-to-end demo complete`);
}

main().catch((e) => {
  console.error("demo failed:", e?.shortMessage ?? e?.message ?? e);
  process.exit(1);
});
