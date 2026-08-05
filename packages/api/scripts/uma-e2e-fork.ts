// End-to-end check of the UMA market option against the REAL Sepolia
// OptimisticOracleV2, on an anvil fork. This is not a unit test — it exists to
// verify the things unit tests structurally can't:
//
//   - our off-chain questionId/conditionId derivation equals what the adapter
//     actually computed and stored (a mock can only confirm our own beliefs)
//   - the create path produces a market the CTF agrees is prepared
//   - a real UMA proposal, a real liveness window, and a real settled verdict
//     flow back into the DB
//
// It is destructive to the local DB (rewrites ChainConfig, creates a market),
// so it is a scratch tool, not part of `pnpm test`.
//
// Usage:
//   anvil --fork-url <sepolia> --chain-id 11155111 --port 8546 &
//   forge script script/DeployUmaAdapter.s.sol --rpc-url http://127.0.0.1:8546 --broadcast
//   ADAPTER=0x… VEREX_RPC_URL=http://127.0.0.1:8546 VEREX_CHAIN_ID=11155111 \
//     pnpm exec tsx scripts/uma-e2e-fork.ts

import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve as pathResolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  parseAbi,
  parseUnits,
  toHex,
  stringToHex,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { prisma } from "../src/db";

const RPC = process.env.VEREX_RPC_URL ?? "http://127.0.0.1:8546";
const ADAPTER = process.env.ADAPTER as Address;
const OO = "0x9f1263B8f0355673619168b5B8c0248f1d03e88C" as Address;
const WETH = "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9" as Address;

const OO_ABI = parseAbi([
  "function proposePrice(address requester, bytes32 identifier, uint256 timestamp, bytes ancillaryData, int256 proposedPrice) returns (uint256)",
]);
const WETH_ABI = parseAbi([
  "function deposit() payable",
  "function approve(address,uint256) returns (bool)",
]);
const ADAPTER_ABI = parseAbi([
  "function getQuestion(bytes32) view returns ((uint256 requestTimestamp, address creator, address rewardToken, uint256 reward, uint256 bond, bytes ancillaryData, bool resolved))",
  "function isSettleable(bytes32) view returns (bool)",
]);
const CTF_ABI = parseAbi(["function payoutDenominator(bytes32) view returns (uint256)"]);

let failed = false;
const ok = (m: string) => console.log(`  ✓ ${m}`);
const fail = (m: string) => {
  console.error(`  ✗ ${m}`);
  failed = true;
};

const rpc = (method: string, params: unknown[] = []) =>
  fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });

async function main() {
  if (!ADAPTER) throw new Error("ADAPTER env var required");
  const account = privateKeyToAccount(process.env.VEREX_OPERATOR_KEY as Hex);
  const pc = createPublicClient({ transport: http(RPC) });
  const wc = createWalletClient({ account, transport: http(RPC), chain: null as never });

  console.log(`\nAdapter  ${ADAPTER}\nOperator ${account.address}\nRPC      ${RPC}\n`);

  const manifest = JSON.parse(
    readFileSync(pathResolve(__dirname, "../../contracts/deployments.json"), "utf8"),
  );
  const bb = manifest.staging;

  // ── 1. Point the API at the fork, with the adapter available.
  await prisma.chainConfig.deleteMany();
  await prisma.chainConfig.create({
    data: {
      id: 1,
      chainId: 11155111,
      rpcUrl: RPC,
      usdcAddr: bb.usdc,
      ctfAddr: bb.ctf,
      exchangeAddr: bb.exchange,
      operator: account.address,
      umaAdapterAddr: ADAPTER,
    },
  });
  const { loadChain } = await import("../src/chain");
  const chain = await loadChain();
  if (chain.umaAdapterAddr !== ADAPTER) fail(`loadChain umaAdapterAddr = ${chain.umaAdapterAddr}`);
  else ok("loadChain exposes the environment's adapter");

  // ── 2. Validation must reject before anything is spent.
  const { createMarketGroup } = await import("../src/group-create");
  const base = {
    category: "Crypto",
    closesAt: new Date(Date.now() + 7 * 864e5).toISOString(),
    creatorIndex: 0,
    liquidityPerOutcome: 5,
  };
  const expectReject = async (name: string, req: unknown, re: RegExp) => {
    try {
      await createMarketGroup(req as never);
      fail(`${name}: expected rejection, got success`);
    } catch (e: any) {
      if (re.test(e.message)) ok(`${name} rejected`);
      else fail(`${name}: wrong error — ${e.message}`);
    }
  };
  await expectReject(
    "UMA on a multi-outcome group",
    {
      ...base,
      title: "Who wins the 2026 final?",
      outcomes: [{ label: "Brazil" }, { label: "France" }, { label: "Spain" }],
      oracleType: "UMA",
      resolutionCriteria: "Resolves to the team lifting the trophy per FIFA's official result.",
    },
    /binary/i,
  );
  await expectReject(
    "UMA with criteria too short to decide on",
    {
      ...base,
      title: "Will ETH close above $10,000 on 2026-12-31?",
      outcomes: [{ label: "Yes" }, { label: "No" }],
      oracleType: "UMA",
      resolutionCriteria: "yes if high",
    },
    /criteria/i,
  );

  // ── 3. Create a real UMA market through the API's own path.
  const criteria =
    "Resolves YES if the ETH/USD close on Coinbase at 23:59 UTC on 2026-12-31 " +
    "is strictly greater than 10000.00 USD. Resolves NO otherwise.";
  const created = await createMarketGroup({
    ...base,
    title: "Will ETH close above $10,000 on 2026-12-31?",
    outcomes: [{ label: "Yes" }, { label: "No" }],
    oracleType: "UMA",
    resolutionCriteria: criteria,
  } as never);
  ok(`create accepted → ${created.kind} "${created.slug}"`);

  const { wake } = await import("../src/worker");
  await import("../src/mm");
  wake();
  for (let i = 0; i < 120; i++) {
    const job = await prisma.chainJob.findUnique({ where: { id: created.jobId } });
    if (job?.status === "CONFIRMED") break;
    if (job?.status === "FAILED") {
      fail(`create job FAILED: ${JSON.stringify(job.result)}`);
      break;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  const market = await prisma.market.findUnique({
    where: { slug: created.slug },
    include: { outcomes: true },
  });
  if (!market) {
    fail("market row was never created");
    return finish();
  }
  if (market.oracleType !== "UMA") fail(`oracleType = ${market.oracleType}`);
  else ok("market recorded as UMA-resolved");
  if (market.umaAdapter?.toLowerCase() !== ADAPTER.toLowerCase()) fail("adapter not recorded");
  else ok("adapter address recorded on the market");
  if (!market.umaAncillaryData?.includes(criteria)) fail("ancillary data lost the criteria");
  else ok("ancillary data carries the resolution criteria");

  // ── 4. The check a mock can't make: our derivation vs the contract's state.
  const qid = market.questionId as Hex;
  if (qid !== keccak256(toHex(market.umaAncillaryData!))) {
    fail("questionId != keccak256(ancillaryData)");
  } else {
    ok("questionId matches keccak256(ancillaryData)");
  }
  const q = await pc.readContract({
    address: ADAPTER,
    abi: ADAPTER_ABI,
    functionName: "getQuestion",
    args: [qid],
  });
  if (q.requestTimestamp === 0n) {
    fail("adapter holds no question under our derived questionId");
    return finish();
  }
  ok(`adapter stored the question under that id (t=${q.requestTimestamp})`);
  if (q.ancillaryData !== toHex(market.umaAncillaryData!)) fail("adapter's ancillary bytes differ");
  else ok("adapter's stored ancillary bytes match ours byte-for-byte");

  const denom = await pc.readContract({
    address: bb.ctf as Address,
    abi: CTF_ABI,
    functionName: "payoutDenominator",
    args: [market.conditionId as Hex],
  });
  if (denom !== 0n) fail(`condition already reported (denominator ${denom})`);
  else ok("CTF agrees the condition is prepared and unresolved");

  // ── 5. Neither resolution path may fire yet.
  const { resolveMarket, resolveMarketFromUma } = await import("../src/resolve");
  try {
    await resolveMarket({ slug: market.slug, outcome: "Yes", accountIndex: 0 });
    fail("operator resolve on a UMA market was allowed");
  } catch (e: any) {
    if (/UMA/.test(e.message)) ok("operator resolve refused on a UMA market");
    else fail(`operator resolve: wrong error — ${e.message}`);
  }
  try {
    await resolveMarketFromUma(market.slug);
    fail("uma resolve succeeded before UMA settled");
  } catch (e: any) {
    if (/settle/i.test(e.message)) ok("uma resolve refused before settlement");
    else fail(`uma resolve: wrong error — ${e.message}`);
  }

  // ── 6. Propose YES on the real oracle, bonded in real WETH.
  const totalBond = q.bond + parseUnits("1", 18); // bond + room for the final fee
  await wc.writeContract({
    address: WETH,
    abi: WETH_ABI,
    functionName: "deposit",
    value: totalBond,
    chain: null as never,
  });
  await wc.writeContract({
    address: WETH,
    abi: WETH_ABI,
    functionName: "approve",
    args: [OO, totalBond],
    chain: null as never,
  });
  ok(`wrapped and approved ${Number(totalBond) / 1e18} WETH for the bond`);

  const identifier = stringToHex("YES_OR_NO_QUERY", { size: 32 });
  const hash = await wc.writeContract({
    address: OO,
    abi: OO_ABI,
    functionName: "proposePrice",
    args: [ADAPTER, identifier, q.requestTimestamp, q.ancillaryData, parseUnits("1", 18)],
    chain: null as never,
  });
  await pc.waitForTransactionReceipt({ hash });
  ok("proposed YES on the real OptimisticOracleV2");

  // ── 7. Past liveness, the verdict must flow all the way back.
  await rpc("evm_increaseTime", [4000]);
  await rpc("evm_mine");
  const settleable = await pc.readContract({
    address: ADAPTER,
    abi: ADAPTER_ABI,
    functionName: "isSettleable",
    args: [qid],
  });
  if (!settleable) fail("isSettleable is false after liveness — the pre-check is wrong");
  else ok("isSettleable true after liveness, before resolving");

  const result = await resolveMarketFromUma(market.slug);
  if (result.resolvedOutcome !== "Yes") fail(`expected Yes, got ${result.resolvedOutcome}`);
  else ok("UMA's YES verdict copied onto the market");
  if (result.payouts[0] !== 1 || result.payouts[1] !== 0) {
    fail(`payouts ${JSON.stringify(result.payouts)}`);
  } else {
    ok("payout vector [1,0] read back from the CTF, not assumed");
  }

  const after = await prisma.market.findUniqueOrThrow({
    where: { slug: market.slug },
    include: { outcomes: true },
  });
  if (after.status !== "RESOLVED") fail(`status ${after.status}`);
  else ok("market row is RESOLVED");
  if (Number(after.outcomes.find((o) => o.label === "Yes")!.price) !== 1) fail("Yes price != 1");
  else ok("Yes settled at 1.00");

  return finish();
}

function finish() {
  console.log(failed ? "\n✗ FAILURES ABOVE\n" : "\n✓ all UMA end-to-end checks passed\n");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
