import type { PublicClient, WalletClient } from "viem";
import { JUSDAbi } from "./abis";
import type { Address, Hex } from "./types";

/// Minimal ERC-20 surface re-derived from JUSD; in prod we'd swap the
/// ABI for the real jUSD ABI on Polygon. Same function signatures, so the
/// helpers below work either way.

function requireAccount(wc: WalletClient) {
  if (!wc.account) throw new Error("walletClient.account required");
  return wc.account;
}

export async function getBalance(
  publicClient: PublicClient,
  token: Address,
  account: Address,
): Promise<bigint> {
  return publicClient.readContract({
    address: token,
    abi: JUSDAbi,
    functionName: "balanceOf",
    args: [account],
  });
}

export async function getAllowance(
  publicClient: PublicClient,
  token: Address,
  owner: Address,
  spender: Address,
): Promise<bigint> {
  return publicClient.readContract({
    address: token,
    abi: JUSDAbi,
    functionName: "allowance",
    args: [owner, spender],
  });
}

/// JUSD has an open `mint(address,uint256)`. Real jUSD does not — this
/// is for anvil / dev only.
export async function mint(
  publicClient: PublicClient,
  walletClient: WalletClient,
  token: Address,
  to: Address,
  amount: bigint,
): Promise<Hex> {
  const account = requireAccount(walletClient);
  const { request } = await publicClient.simulateContract({
    address: token,
    abi: JUSDAbi,
    functionName: "mint",
    args: [to, amount],
    account,
  });
  const hash = await walletClient.writeContract(request);
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function approve(
  publicClient: PublicClient,
  walletClient: WalletClient,
  token: Address,
  spender: Address,
  amount: bigint,
): Promise<Hex> {
  const account = requireAccount(walletClient);
  const { request } = await publicClient.simulateContract({
    address: token,
    abi: JUSDAbi,
    functionName: "approve",
    args: [spender, amount],
    account,
  });
  const hash = await walletClient.writeContract(request);
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}
