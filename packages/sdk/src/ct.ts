import type { PublicClient, WalletClient } from "viem";
import { IConditionalTokensAbi } from "./abis";
import type { Address, Hex } from "./types";

/// Minimal ERC-1155 surface for balance + approval. IConditionalTokens
/// doesn't expose ERC-1155 entrypoints in its interface (only the CT-specific
/// functions), so balance/approval calls go through this thin ABI applied to
/// the same deployed address.
const ERC1155_BALANCE_AND_APPROVAL_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "id", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "balanceOfBatch",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "accounts", type: "address[]" },
      { name: "ids", type: "uint256[]" },
    ],
    outputs: [{ name: "", type: "uint256[]" }],
  },
  {
    name: "setApprovalForAll",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "operator", type: "address" },
      { name: "approved", type: "bool" },
    ],
    outputs: [],
  },
  {
    name: "isApprovedForAll",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "operator", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

// ─────────────────────────────────────────────────────────────────────
// Read helpers
// ─────────────────────────────────────────────────────────────────────

export async function getCollectionId(
  publicClient: PublicClient,
  ct: Address,
  parentCollectionId: Hex,
  conditionId: Hex,
  indexSet: bigint,
): Promise<Hex> {
  return publicClient.readContract({
    address: ct,
    abi: IConditionalTokensAbi,
    functionName: "getCollectionId",
    args: [parentCollectionId, conditionId, indexSet],
  });
}

export async function getPositionId(
  publicClient: PublicClient,
  ct: Address,
  collateralToken: Address,
  collectionId: Hex,
): Promise<bigint> {
  return publicClient.readContract({
    address: ct,
    abi: IConditionalTokensAbi,
    functionName: "getPositionId",
    args: [collateralToken, collectionId],
  });
}

/// Convenience: derive both YES (indexSet=1) and NO (indexSet=2) position
/// IDs for a binary market in one go. Always uses parentCollectionId = 0.
export async function getBinaryPositionIds(
  publicClient: PublicClient,
  ct: Address,
  collateralToken: Address,
  conditionId: Hex,
): Promise<{ yes: bigint; no: bigint }> {
  const ZERO_PARENT: Hex = "0x0000000000000000000000000000000000000000000000000000000000000000";
  const [yesCollection, noCollection] = await Promise.all([
    getCollectionId(publicClient, ct, ZERO_PARENT, conditionId, 1n),
    getCollectionId(publicClient, ct, ZERO_PARENT, conditionId, 2n),
  ]);
  const [yes, no] = await Promise.all([
    getPositionId(publicClient, ct, collateralToken, yesCollection),
    getPositionId(publicClient, ct, collateralToken, noCollection),
  ]);
  return { yes, no };
}

export async function balanceOf1155(
  publicClient: PublicClient,
  ct: Address,
  account: Address,
  positionId: bigint,
): Promise<bigint> {
  return publicClient.readContract({
    address: ct,
    abi: ERC1155_BALANCE_AND_APPROVAL_ABI,
    functionName: "balanceOf",
    args: [account, positionId],
  });
}

/// One RPC round-trip for many position ids. A portfolio has to check every
/// outcome of every market, and doing that one call at a time costs a network
/// round-trip each — seconds against a remote node.
export async function balanceOfBatch1155(
  publicClient: PublicClient,
  ct: Address,
  account: Address,
  positionIds: bigint[],
): Promise<bigint[]> {
  if (positionIds.length === 0) return [];
  const balances = await publicClient.readContract({
    address: ct,
    abi: ERC1155_BALANCE_AND_APPROVAL_ABI,
    functionName: "balanceOfBatch",
    args: [positionIds.map(() => account), positionIds],
  });
  return [...(balances as readonly bigint[])];
}

export async function getOutcomeSlotCount(
  publicClient: PublicClient,
  ct: Address,
  conditionId: Hex,
): Promise<bigint> {
  return publicClient.readContract({
    address: ct,
    abi: IConditionalTokensAbi,
    functionName: "getOutcomeSlotCount",
    args: [conditionId],
  });
}

export async function getPayoutDenominator(
  publicClient: PublicClient,
  ct: Address,
  conditionId: Hex,
): Promise<bigint> {
  return publicClient.readContract({
    address: ct,
    abi: IConditionalTokensAbi,
    functionName: "payoutDenominator",
    args: [conditionId],
  });
}

/// One outcome slot's payout numerator. For a binary condition index 0 is Yes
/// and 1 is No. Reading these back is how a caller learns an answer it did not
/// choose itself — the UMA path resolves from the oracle's verdict, so the
/// result has to be read off the chain rather than assumed.
export async function getPayoutNumerator(
  publicClient: PublicClient,
  ct: Address,
  conditionId: Hex,
  index: bigint,
): Promise<bigint> {
  return publicClient.readContract({
    address: ct,
    abi: IConditionalTokensAbi,
    functionName: "payoutNumerators",
    args: [conditionId, index],
  });
}

// ─────────────────────────────────────────────────────────────────────
// Write helpers
// ─────────────────────────────────────────────────────────────────────

function requireAccount(wc: WalletClient) {
  if (!wc.account) throw new Error("walletClient.account required");
  return wc.account;
}

export async function prepareCondition(
  publicClient: PublicClient,
  walletClient: WalletClient,
  ct: Address,
  oracle: Address,
  questionId: Hex,
  outcomeSlotCount: bigint,
): Promise<Hex> {
  const account = requireAccount(walletClient);
  const { request } = await publicClient.simulateContract({
    address: ct,
    abi: IConditionalTokensAbi,
    functionName: "prepareCondition",
    args: [oracle, questionId, outcomeSlotCount],
    account,
  });
  const hash = await walletClient.writeContract(request);
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function reportPayouts(
  publicClient: PublicClient,
  walletClient: WalletClient,
  ct: Address,
  questionId: Hex,
  payouts: bigint[],
): Promise<Hex> {
  const account = requireAccount(walletClient);
  const { request } = await publicClient.simulateContract({
    address: ct,
    abi: IConditionalTokensAbi,
    functionName: "reportPayouts",
    args: [questionId, payouts],
    account,
  });
  const hash = await walletClient.writeContract(request);
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/// Always uses parentCollectionId = 0 (top-level split) and the binary
/// partition `[1, 2]`. For multi-outcome or nested splits, drop down to the
/// raw contract call.
export async function splitBinaryPosition(
  publicClient: PublicClient,
  walletClient: WalletClient,
  ct: Address,
  collateral: Address,
  conditionId: Hex,
  amount: bigint,
): Promise<Hex> {
  const account = requireAccount(walletClient);
  const ZERO_PARENT: Hex = "0x0000000000000000000000000000000000000000000000000000000000000000";
  const { request } = await publicClient.simulateContract({
    address: ct,
    abi: IConditionalTokensAbi,
    functionName: "splitPosition",
    args: [collateral, ZERO_PARENT, conditionId, [1n, 2n], amount],
    account,
  });
  const hash = await walletClient.writeContract(request);
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function mergeBinaryPosition(
  publicClient: PublicClient,
  walletClient: WalletClient,
  ct: Address,
  collateral: Address,
  conditionId: Hex,
  amount: bigint,
): Promise<Hex> {
  const account = requireAccount(walletClient);
  const ZERO_PARENT: Hex = "0x0000000000000000000000000000000000000000000000000000000000000000";
  const { request } = await publicClient.simulateContract({
    address: ct,
    abi: IConditionalTokensAbi,
    functionName: "mergePositions",
    args: [collateral, ZERO_PARENT, conditionId, [1n, 2n], amount],
    account,
  });
  const hash = await walletClient.writeContract(request);
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/// Redeem the given index sets. After a `[1, 0]` resolution pass `[1n]`
/// to collect only the winning side (cheapest); pass `[1n, 2n]` for full
/// cleanup or for fractional-payout markets.
export async function redeemPositions(
  publicClient: PublicClient,
  walletClient: WalletClient,
  ct: Address,
  collateral: Address,
  conditionId: Hex,
  indexSets: bigint[],
): Promise<Hex> {
  const account = requireAccount(walletClient);
  const ZERO_PARENT: Hex = "0x0000000000000000000000000000000000000000000000000000000000000000";
  const { request } = await publicClient.simulateContract({
    address: ct,
    abi: IConditionalTokensAbi,
    functionName: "redeemPositions",
    args: [collateral, ZERO_PARENT, conditionId, indexSets],
    account,
  });
  const hash = await walletClient.writeContract(request);
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function setApprovalForAll(
  publicClient: PublicClient,
  walletClient: WalletClient,
  ct: Address,
  operator: Address,
  approved: boolean,
): Promise<Hex> {
  const account = requireAccount(walletClient);
  const { request } = await publicClient.simulateContract({
    address: ct,
    abi: ERC1155_BALANCE_AND_APPROVAL_ABI,
    functionName: "setApprovalForAll",
    args: [operator, approved],
    account,
  });
  const hash = await walletClient.writeContract(request);
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}
