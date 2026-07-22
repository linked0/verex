// End-to-end demo: deploy CTF backbone, setup market, sign+fill a buy
// order, resolve YES, alice redeems winnings.
//
// Assumes anvil is running on http://127.0.0.1:8545 with the default mnemonic.
//
// Usage:
//   anvil &
//   pnpm --filter @verex/cli build && pnpm --filter @verex/cli demo
//
// Or reuse already-deployed contracts via env:
//   USDC_ADDR=0x... CTF_ADDR=0x... EXCHANGE_ADDR=0x... \
//     pnpm --filter @verex/cli demo

import { execSync } from "node:child_process";
import { resolve as pathResolve } from "node:path";
import { keccak256, toHex } from "viem";
import {
  createCTClient,
  createExchangeClient,
  createUsdcClient,
  getConditionId,
  signOrder,
  Side,
  SignatureType,
  type Address,
  type Hex,
  type Order,
  type OrderDomain,
} from "@verex/sdk";
import { publicClient, walletClient, accountAddress, RPC_URL } from "./clients";

const CONTRACTS_DIR = pathResolve(__dirname, "../../contracts");
const FOUNDRY_PATH = `${process.env.HOME}/.foundry/bin:${process.env.PATH}`;
const CHAIN_ID = 31337;
// DeployCTF.s.sol requires VEREX_OPERATOR_KEY explicitly (no in-contract
// fallback, by design — see docs/analysis/2026-05-08-v1-security-audit.md
// §2.5). This script is anvil-only (see header comment), so defaulting to
// anvil's well-known account[0] key here is safe — a real key already in
// the environment still wins.
const FORGE_ENV = {
  ...process.env,
  PATH: FOUNDRY_PATH,
  VEREX_OPERATOR_KEY:
    process.env.VEREX_OPERATOR_KEY ??
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
};

const QUESTION_ID: Hex = keccak256(toHex("demo: Will Brazil win the 2026 World Cup?"));

interface Backbone {
  usdc: Address;
  ctf: Address;
  exchange: Address;
}

function parseDeployOutput(out: string): Backbone {
  const grab = (label: string) => {
    const re = new RegExp(`${label}:\\s*(0x[a-fA-F0-9]{40})`);
    const m = out.match(re);
    if (!m) throw new Error(`could not parse ${label} from forge output`);
    return m[1] as Address;
  };
  return {
    usdc: grab("MockUSDC"),
    ctf: grab("ConditionalTokens"),
    exchange: grab("CTFExchange"),
  };
}

async function main() {
  const pc = publicClient();

  // ─────────────────────────────────────────────────────────────────
  // 1. Deploy (or reuse) the v2 (CTF) backbone
  // ─────────────────────────────────────────────────────────────────

  let backbone: Backbone;
  if (process.env.USDC_ADDR && process.env.CTF_ADDR && process.env.EXCHANGE_ADDR) {
    backbone = {
      usdc: process.env.USDC_ADDR as Address,
      ctf: process.env.CTF_ADDR as Address,
      exchange: process.env.EXCHANGE_ADDR as Address,
    };
    console.log(`[1] reusing backbone from env`);
  } else {
    console.log(`[1] deploying CTF backbone via forge script...`);
    const out = execSync(
      `forge script script/DeployCTF.s.sol --rpc-url ${RPC_URL} --broadcast`,
      { cwd: CONTRACTS_DIR, env: FORGE_ENV },
    ).toString();
    backbone = parseDeployOutput(out);
  }
  console.log(`    USDC      ${backbone.usdc}`);
  console.log(`    CTF       ${backbone.ctf}`);
  console.log(`    Exchange  ${backbone.exchange}`);

  // ─────────────────────────────────────────────────────────────────
  // 2. Market setup (operator account 0 = oracle, deployer, admin)
  // ─────────────────────────────────────────────────────────────────

  const operator = accountAddress(0);
  const operatorWallet = walletClient(0);

  const ct = createCTClient({ address: backbone.ctf, publicClient: pc, walletClient: operatorWallet });
  const exchange = createExchangeClient({ address: backbone.exchange, publicClient: pc, walletClient: operatorWallet });
  const usdc = createUsdcClient({ address: backbone.usdc, publicClient: pc, walletClient: operatorWallet });

  const conditionId = getConditionId(operator, QUESTION_ID, 2n);
  console.log(`\n[2] preparing condition...`);
  console.log(`    conditionId=${conditionId}`);
  await ct.prepareCondition(operator, QUESTION_ID, 2n);

  const ids = await ct.getBinaryPositionIds(backbone.usdc, conditionId);
  console.log(`    YES id=${ids.yes}`);
  console.log(`    NO  id=${ids.no}`);

  console.log(`    registering token pair on exchange...`);
  await exchange.registerToken(ids.yes, ids.no, conditionId);

  console.log(`    adding operator to exchange allowlist...`);
  await exchange.addOperator(operator);

  console.log(`    minting + splitting 1000 USDC of operator inventory...`);
  const inventory = 1_000_000_000n; // 1000 USDC at 6 decimals
  await usdc.mint(operator, inventory);
  await usdc.approve(backbone.ctf, inventory);
  await ct.splitBinary(backbone.usdc, conditionId, inventory);

  console.log(`    approving exchange to pull operator's YES/NO during fillOrder...`);
  await ct.setApprovalForAll(backbone.exchange, true);

  // ─────────────────────────────────────────────────────────────────
  // 3. Alice (account 1) signs a BUY order: 60 USDC -> 100 YES
  // ─────────────────────────────────────────────────────────────────

  const alice = accountAddress(1);
  const aliceWallet = walletClient(1);
  const aliceUsdc = createUsdcClient({ address: backbone.usdc, publicClient: pc, walletClient: aliceWallet });

  console.log(`\n[3] funding alice + approving exchange...`);
  await aliceUsdc.mint(alice, 100_000_000n); // 100 USDC
  await aliceUsdc.approve(backbone.exchange, 100_000_000n);

  console.log(`    alice signing BUY order: 60 USDC -> 100 YES (price=$0.60/YES)`);
  const order: Order = {
    salt: BigInt(Math.floor(Math.random() * 1e15)),
    maker: alice,
    signer: alice,
    taker: "0x0000000000000000000000000000000000000000",
    tokenId: ids.yes,
    makerAmount: 60_000_000n,   // 60 USDC
    takerAmount: 100_000_000n,  // 100 YES
    expiration: 0n,
    nonce: 0n,
    feeRateBps: 0n,
    side: Side.BUY,
    signatureType: SignatureType.EOA,
    signature: "0x",
  };
  const domain: OrderDomain = { chainId: CHAIN_ID, verifyingContract: backbone.exchange };
  const signed = await signOrder(order, domain, aliceWallet);

  // Sanity: SDK digest must match on-chain digest for fillOrder to verify.
  const sdkDigest = await exchange.hashOrderViaContract(signed);
  console.log(`    on-chain digest: ${sdkDigest}`);

  // ─────────────────────────────────────────────────────────────────
  // 4. Operator fills the order
  // ─────────────────────────────────────────────────────────────────

  console.log(`\n[4] operator filling alice's BUY order (full 60 USDC)...`);
  await exchange.fillOrder(signed, 60_000_000n);

  const aliceYes = await ct.balanceOf(alice, ids.yes);
  const aliceUsdcBal = await aliceUsdc.balanceOf(alice);
  console.log(`    alice now holds: ${aliceYes} YES + ${aliceUsdcBal} USDC`);

  // ─────────────────────────────────────────────────────────────────
  // 5. Operator (oracle) reports YES wins
  // ─────────────────────────────────────────────────────────────────

  console.log(`\n[5] reporting YES wins (manual oracle, Stage 1)...`);
  await ct.reportPayouts(QUESTION_ID, [1n, 0n]);
  const denom = await ct.getPayoutDenominator(conditionId);
  console.log(`    payoutDenominator=${denom} (nonzero = resolved)`);

  // ─────────────────────────────────────────────────────────────────
  // 6. Alice redeems her winning YES tokens
  // ─────────────────────────────────────────────────────────────────

  console.log(`\n[6] alice redeems (YES only — cheapest path)...`);
  const aliceCt = createCTClient({ address: backbone.ctf, publicClient: pc, walletClient: aliceWallet });
  await aliceCt.redeem(backbone.usdc, conditionId, [1n]);

  const aliceFinal = await aliceUsdc.balanceOf(alice);
  console.log(`    alice final USDC: ${aliceFinal} (started with 100, spent 60 on BUY, won 100 → 140)`);

  console.log(`\n✓ CTF end-to-end demo complete`);
}

main().catch((e) => {
  console.error("demo failed:", e?.shortMessage ?? e?.message ?? e);
  process.exit(1);
});
