#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { Command } from "commander";
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
import { publicClient, walletClient, accountAddress } from "./clients";

// ─────────────────────────────────────────────────────────────────────
// Address resolution: --flag overrides env var
// ─────────────────────────────────────────────────────────────────────

function requireAddr(flag: string | undefined, envName: string): Address {
  const v = flag ?? process.env[envName];
  if (!v) throw new Error(`missing ${envName} (or --${envName.toLowerCase()} flag)`);
  return v as Address;
}

// ─────────────────────────────────────────────────────────────────────
// JSON pretty-print that handles bigints
// ─────────────────────────────────────────────────────────────────────

const bigintReplacer = (_: string, v: unknown) => (typeof v === "bigint" ? v.toString() : v);

// ─────────────────────────────────────────────────────────────────────
// Default question id — matches DemoMarket.s.sol so anvil scripts and CLI
// agree by default. Override with --question.
// ─────────────────────────────────────────────────────────────────────

const DEFAULT_QUESTION_ID: Hex = keccak256(
  toHex("demo: Will Brazil win the 2026 World Cup?"),
);

// ─────────────────────────────────────────────────────────────────────

const program = new Command();
program
  .name("verex")
  .description("Verex CLI — drive a CTF prediction market on anvil");

// ─────────────────────────────────────────────────────────────────────
// Read-only helpers
// ─────────────────────────────────────────────────────────────────────

program
  .command("condition")
  .description("Compute conditionId off-chain (no RPC required)")
  .requiredOption("--oracle <address>", "oracle (resolver) address")
  .option("--question <bytes32>", "question id", DEFAULT_QUESTION_ID)
  .option("--slots <n>", "outcome slot count", "2")
  .action((opts) => {
    const id = getConditionId(opts.oracle as Address, opts.question as Hex, BigInt(opts.slots));
    console.log(id);
  });

program
  .command("balance")
  .description("Show USDC + YES + NO balances for an account")
  .option("--usdc <address>", "MockUSDC address (env: USDC_ADDR)")
  .option("--ctf <address>", "ConditionalTokens address (env: CTF_ADDR)")
  .requiredOption("--question <bytes32>", "question id", DEFAULT_QUESTION_ID)
  .requiredOption("--oracle <address>", "oracle (resolver) address")
  .option("-a, --account <index>", "anvil account index", "0")
  .action(async (opts) => {
    const usdcAddr = requireAddr(opts.usdc, "USDC_ADDR");
    const ctfAddr = requireAddr(opts.ctf, "CTF_ADDR");
    const pc = publicClient();
    const idx = parseInt(opts.account, 10);
    const user = accountAddress(idx);

    const conditionId = getConditionId(opts.oracle as Address, opts.question as Hex, 2n);
    const ct = createCTClient({ address: ctfAddr, publicClient: pc });
    const usdc = createUsdcClient({ address: usdcAddr, publicClient: pc });

    const [usdcBal, ids] = await Promise.all([
      usdc.balanceOf(user),
      ct.getBinaryPositionIds(usdcAddr, conditionId),
    ]);
    const [yesBal, noBal] = await Promise.all([
      ct.balanceOf(user, ids.yes),
      ct.balanceOf(user, ids.no),
    ]);

    console.log(`user:  ${user}`);
    console.log(`USDC:  ${usdcBal}`);
    console.log(`YES:   ${yesBal} (id=${ids.yes})`);
    console.log(`NO:    ${noBal} (id=${ids.no})`);
  });

// ─────────────────────────────────────────────────────────────────────
// Setup + resolve (operator/oracle key — typically account 0)
// ─────────────────────────────────────────────────────────────────────

program
  .command("setup")
  .description("Full market setup: prepareCondition + register + addOperator + split + approve")
  .option("--usdc <address>", "MockUSDC address (env: USDC_ADDR)")
  .option("--ctf <address>", "ConditionalTokens address (env: CTF_ADDR)")
  .option("--exchange <address>", "CTFExchange address (env: EXCHANGE_ADDR)")
  .option("--question <bytes32>", "question id", DEFAULT_QUESTION_ID)
  .option("--mint <units>", "USDC units to mint + split into inventory", "1000000000")
  .option("-a, --account <index>", "operator/oracle anvil account index", "0")
  .action(async (opts) => {
    const usdcAddr = requireAddr(opts.usdc, "USDC_ADDR");
    const ctfAddr = requireAddr(opts.ctf, "CTF_ADDR");
    const exchangeAddr = requireAddr(opts.exchange, "EXCHANGE_ADDR");
    const idx = parseInt(opts.account, 10);
    const pc = publicClient();
    const wc = walletClient(idx);
    const operator = accountAddress(idx);
    const inventory = BigInt(opts.mint);

    const ct = createCTClient({ address: ctfAddr, publicClient: pc, walletClient: wc });
    const exchange = createExchangeClient({ address: exchangeAddr, publicClient: pc, walletClient: wc });
    const usdc = createUsdcClient({ address: usdcAddr, publicClient: pc, walletClient: wc });

    // 1. prepareCondition — operator is the manual oracle.
    const conditionId = getConditionId(operator, opts.question as Hex, 2n);
    console.log(`conditionId: ${conditionId}`);
    await ct.prepareCondition(operator, opts.question as Hex, 2n);

    // 2. Derive YES/NO position ids (CT computes — avoids off-chain EC math)
    const ids = await ct.getBinaryPositionIds(usdcAddr, conditionId);
    console.log(`YES id: ${ids.yes}`);
    console.log(`NO id:  ${ids.no}`);

    // 3. Register on exchange.
    await exchange.registerToken(ids.yes, ids.no, conditionId);

    // 4. Allowlist operator.
    await exchange.addOperator(operator);

    // 5. Mint + approve + split USDC → YES + NO inventory.
    await usdc.mint(operator, inventory);
    await usdc.approve(ctfAddr, inventory);
    await ct.splitBinary(usdcAddr, conditionId, inventory);

    // 6. Approve exchange to pull YES/NO from operator during fillOrder.
    await ct.setApprovalForAll(exchangeAddr, true);

    console.log("setup complete");
  });

program
  .command("resolve")
  .description("Manual-oracle resolve: reportPayouts on CT")
  .option("--ctf <address>", "ConditionalTokens address (env: CTF_ADDR)")
  .option("--question <bytes32>", "question id", DEFAULT_QUESTION_ID)
  .requiredOption("--yes <n>", "YES payout numerator")
  .requiredOption("--no <n>", "NO payout numerator")
  .option("-a, --account <index>", "oracle anvil account index", "0")
  .action(async (opts) => {
    const ctfAddr = requireAddr(opts.ctf, "CTF_ADDR");
    const idx = parseInt(opts.account, 10);
    const ct = createCTClient({
      address: ctfAddr,
      publicClient: publicClient(),
      walletClient: walletClient(idx),
    });
    const tx = await ct.reportPayouts(opts.question as Hex, [BigInt(opts.yes), BigInt(opts.no)]);
    console.log(`tx: ${tx}`);
  });

// ─────────────────────────────────────────────────────────────────────
// Position lifecycle (any user)
// ─────────────────────────────────────────────────────────────────────

program
  .command("split")
  .description("Split USDC into YES + NO position tokens")
  .option("--usdc <address>", "MockUSDC address (env: USDC_ADDR)")
  .option("--ctf <address>", "ConditionalTokens address (env: CTF_ADDR)")
  .requiredOption("--condition <bytes32>", "conditionId")
  .requiredOption("--amount <units>", "USDC units to split")
  .option("-a, --account <index>", "anvil account index", "1")
  .action(async (opts) => {
    const usdcAddr = requireAddr(opts.usdc, "USDC_ADDR");
    const ctfAddr = requireAddr(opts.ctf, "CTF_ADDR");
    const pc = publicClient();
    const wc = walletClient(parseInt(opts.account, 10));
    const ct = createCTClient({ address: ctfAddr, publicClient: pc, walletClient: wc });
    const usdc = createUsdcClient({ address: usdcAddr, publicClient: pc, walletClient: wc });
    const amount = BigInt(opts.amount);

    await usdc.approve(ctfAddr, amount);
    const tx = await ct.splitBinary(usdcAddr, opts.condition as Hex, amount);
    console.log(`tx: ${tx}`);
  });

program
  .command("merge")
  .description("Merge YES + NO position tokens back into USDC")
  .option("--usdc <address>", "MockUSDC address (env: USDC_ADDR)")
  .option("--ctf <address>", "ConditionalTokens address (env: CTF_ADDR)")
  .requiredOption("--condition <bytes32>", "conditionId")
  .requiredOption("--amount <units>", "amount of each side to merge")
  .option("-a, --account <index>", "anvil account index", "1")
  .action(async (opts) => {
    const usdcAddr = requireAddr(opts.usdc, "USDC_ADDR");
    const ctfAddr = requireAddr(opts.ctf, "CTF_ADDR");
    const ct = createCTClient({
      address: ctfAddr,
      publicClient: publicClient(),
      walletClient: walletClient(parseInt(opts.account, 10)),
    });
    const tx = await ct.mergeBinary(usdcAddr, opts.condition as Hex, BigInt(opts.amount));
    console.log(`tx: ${tx}`);
  });

program
  .command("redeem")
  .description("Redeem winning side after resolution")
  .option("--usdc <address>", "MockUSDC address (env: USDC_ADDR)")
  .option("--ctf <address>", "ConditionalTokens address (env: CTF_ADDR)")
  .requiredOption("--condition <bytes32>", "conditionId")
  .option("--side <yes|no|both>", "which side(s) to redeem", "both")
  .option("-a, --account <index>", "anvil account index", "1")
  .action(async (opts) => {
    const usdcAddr = requireAddr(opts.usdc, "USDC_ADDR");
    const ctfAddr = requireAddr(opts.ctf, "CTF_ADDR");
    const side = opts.side.toLowerCase();
    const indexSets: bigint[] =
      side === "yes" ? [1n] : side === "no" ? [2n] : [1n, 2n];

    const ct = createCTClient({
      address: ctfAddr,
      publicClient: publicClient(),
      walletClient: walletClient(parseInt(opts.account, 10)),
    });
    const tx = await ct.redeem(usdcAddr, opts.condition as Hex, indexSets);
    console.log(`tx: ${tx}`);
  });

program
  .command("mint")
  .description("Mint MockUSDC (anvil-only — real USDC has no open mint)")
  .option("--usdc <address>", "MockUSDC address (env: USDC_ADDR)")
  .requiredOption("--amount <units>", "USDC units to mint")
  .option("--to <address>", "recipient (defaults to --account address)")
  .option("-a, --account <index>", "anvil account index", "0")
  .action(async (opts) => {
    const usdcAddr = requireAddr(opts.usdc, "USDC_ADDR");
    const idx = parseInt(opts.account, 10);
    const to = (opts.to as Address) ?? accountAddress(idx);
    const usdc = createUsdcClient({
      address: usdcAddr,
      publicClient: publicClient(),
      walletClient: walletClient(idx),
    });
    const tx = await usdc.mint(to, BigInt(opts.amount));
    console.log(`tx: ${tx}`);
  });

// ─────────────────────────────────────────────────────────────────────
// Order signing + filling (CLOB primitives)
// ─────────────────────────────────────────────────────────────────────

const orderCmd = program.command("order").description("Sign and fill CTFExchange orders");

orderCmd
  .command("sign")
  .description("Build + sign an EIP-712 order, print JSON to stdout (or --out file)")
  .option("--exchange <address>", "CTFExchange address (env: EXCHANGE_ADDR)")
  .requiredOption("--token <id>", "position token id (YES or NO)")
  .requiredOption("--maker-amount <units>", "what the maker offers (BUY: USDC; SELL: tokens)")
  .requiredOption("--taker-amount <units>", "what the maker wants in return")
  .option("--side <buy|sell>", "order side", "buy")
  .option("--nonce <n>", "nonce", "0")
  .option("--expiration <n>", "unix-seconds expiry; 0 = no expiry", "0")
  .option("--salt <n>", "salt (random if omitted)")
  .option("--fee-bps <n>", "fee rate in basis points", "0")
  .option("--chain-id <n>", "chain id", "31337")
  .option("--out <file>", "write signed order JSON to file instead of stdout")
  .option("-a, --account <index>", "anvil account index (maker key)", "1")
  .action(async (opts) => {
    const exchangeAddr = requireAddr(opts.exchange, "EXCHANGE_ADDR");
    const sideStr = opts.side.toLowerCase();
    if (sideStr !== "buy" && sideStr !== "sell") {
      throw new Error("--side must be 'buy' or 'sell'");
    }
    const idx = parseInt(opts.account, 10);
    const maker = accountAddress(idx);
    const wc = walletClient(idx);

    const salt = opts.salt
      ? BigInt(opts.salt)
      : BigInt(Math.floor(Math.random() * 1e15));

    const order: Order = {
      salt,
      maker,
      signer: maker,
      taker: "0x0000000000000000000000000000000000000000",
      tokenId: BigInt(opts.token),
      makerAmount: BigInt(opts.makerAmount),
      takerAmount: BigInt(opts.takerAmount),
      expiration: BigInt(opts.expiration),
      nonce: BigInt(opts.nonce),
      feeRateBps: BigInt(opts.feeBps),
      side: sideStr === "buy" ? Side.BUY : Side.SELL,
      signatureType: SignatureType.EOA,
      signature: "0x",
    };

    const domain: OrderDomain = {
      chainId: parseInt(opts.chainId, 10),
      verifyingContract: exchangeAddr,
    };

    const signed = await signOrder(order, domain, wc);
    const json = JSON.stringify(signed, bigintReplacer, 2);
    if (opts.out) {
      writeFileSync(opts.out, json + "\n");
      console.error(`wrote ${opts.out}`);
    } else {
      console.log(json);
    }
  });

orderCmd
  .command("fill")
  .description("Operator-side: read a signed order JSON and call fillOrder")
  .option("--exchange <address>", "CTFExchange address (env: EXCHANGE_ADDR)")
  .requiredOption("--order <file>", "signed order JSON file (from `verex order sign --out`)")
  .requiredOption("--amount <units>", "fill amount in maker-amount terms")
  .option("-a, --account <index>", "operator anvil account index", "0")
  .action(async (opts) => {
    const exchangeAddr = requireAddr(opts.exchange, "EXCHANGE_ADDR");
    const raw = JSON.parse(readFileSync(opts.order, "utf8")) as Record<string, unknown>;
    // Re-coerce numeric fields to bigint; JSON dropped them to strings.
    const order: Order = {
      salt: BigInt(raw.salt as string),
      maker: raw.maker as Address,
      signer: raw.signer as Address,
      taker: raw.taker as Address,
      tokenId: BigInt(raw.tokenId as string),
      makerAmount: BigInt(raw.makerAmount as string),
      takerAmount: BigInt(raw.takerAmount as string),
      expiration: BigInt(raw.expiration as string),
      nonce: BigInt(raw.nonce as string),
      feeRateBps: BigInt(raw.feeRateBps as string),
      side: raw.side as Side,
      signatureType: raw.signatureType as SignatureType,
      signature: raw.signature as Hex,
    };
    const exchange = createExchangeClient({
      address: exchangeAddr,
      publicClient: publicClient(),
      walletClient: walletClient(parseInt(opts.account, 10)),
    });
    const tx = await exchange.fillOrder(order, BigInt(opts.amount));
    console.log(`tx: ${tx}`);
  });

program.parseAsync(process.argv).catch((e) => {
  console.error(e?.shortMessage ?? e?.message ?? e);
  process.exit(1);
});
