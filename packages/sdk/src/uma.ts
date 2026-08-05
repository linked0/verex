// UmaCtfAdapter helpers — for markets whose result comes from UMA's
// Optimistic Oracle rather than from the operator's key.
//
// The one thing to keep in mind when reading this file: with UMA, a market's
// on-chain identity is derived from the QUESTION TEXT, not from its slug.
// `initialize` computes questionId = keccak256(ancillaryData), and the CTF
// then computes conditionId = keccak256(adapter, questionId, 2). So the
// ancillary data has to be unique per market — see `buildAncillaryData`.

import { keccak256, toHex, type PublicClient, type WalletClient } from "viem";
import { UmaCtfAdapterAbi } from "./abis";
import { getConditionId } from "./conditions";
import type { Address, Hex } from "./types";

/// UMA's settled answers for a YES_OR_NO_QUERY, as the adapter interprets them.
export const UMA_YES = 10n ** 18n;
export const UMA_NO = 0n;
export const UMA_UNRESOLVABLE = 5n * 10n ** 17n;

/// Sepolia deployments, verified 2026-08-03 (docs/tasks/current-plan.md, G4).
export const UMA_SEPOLIA = {
  optimisticOracleV2: "0x9f1263B8f0355673619168b5B8c0248f1d03e88C" as Address,
  /// Bond/reward currency. Verex's MockUSDC is NOT on UMA's AddressWhitelist;
  /// WETH is, and is self-service via deposit().
  weth: "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9" as Address,
} as const;

/// Compose the bytes a UMA voter actually reads.
///
/// Two jobs, and both matter:
///
///  1. **Resolution criteria.** This text is the entire basis on which a human
///     decides the answer. A bare question with no rules is how a market ends
///     up settled "unresolvable" (0.5e18), which pays both sides half — so the
///     criteria are not decoration, they are the market's correctness.
///  2. **Uniqueness.** questionId is keccak256 of these bytes, so two markets
///     with identical text are the same on-chain question, and the second
///     `initialize` reverts AlreadyInitialized. The slug is included to make
///     collisions impossible even when two markets ask the same thing.
export function buildAncillaryData(args: {
  title: string;
  resolutionCriteria: string;
  slug: string;
  closesAt: Date;
}): string {
  return [
    `q: title: ${args.title}`,
    `description: ${args.resolutionCriteria}`,
    `res_data: p1: 0, p2: 1, p3: 0.5. Where p1 corresponds to NO, p2 to YES, p3 to unknown/50-50.`,
    `closes: ${args.closesAt.toISOString()}`,
    `verex_slug: ${args.slug}`,
  ].join(", ");
}

/// questionId as `initialize` will compute it — keccak256 of the ancillary
/// bytes. Lets a caller know the id before broadcasting.
export function umaQuestionId(ancillaryData: string): Hex {
  return keccak256(toHex(ancillaryData));
}

/// conditionId for a UMA market: the ADAPTER is the oracle in the hash, not
/// the operator. This is why the choice is permanent — pointing an existing
/// market at a different oracle computes a different market entirely.
export function umaConditionId(adapter: Address, questionId: Hex): Hex {
  return getConditionId(adapter, questionId, 2n);
}

export interface UmaQuestion {
  requestTimestamp: bigint;
  creator: Address;
  rewardToken: Address;
  reward: bigint;
  bond: bigint;
  ancillaryData: Hex;
  resolved: boolean;
}

export interface UmaAdapterClient {
  address: Address;

  /// Prepare the CTF condition and ask UMA the question. Admin-only, and it
  /// spends the reward budget: if reward > 0 the ADAPTER must already hold
  /// that much of `rewardToken` — requestPrice pulls it from the caller, and
  /// the caller is the adapter.
  initialize: (args: {
    ancillaryData: string;
    rewardToken: Address;
    reward: bigint;
    bond: bigint;
    /// 0 keeps UMA's 7200s default. Shorten only for demos.
    liveness: bigint;
  }) => Promise<{ txHash: Hex; questionId: Hex; conditionId: Hex }>;

  /// Copy UMA's settled answer onto the condition. Permissionless — anyone
  /// may call it, because it has no discretion. Reverts until liveness has
  /// expired; check `isSettled` first.
  resolve: (questionId: Hex) => Promise<Hex>;

  isSettled: (questionId: Hex) => Promise<boolean>;
  getQuestion: (questionId: Hex) => Promise<UmaQuestion>;
  ctf: () => Promise<Address>;
  oo: () => Promise<Address>;
  admin: () => Promise<Address>;
}

export function createUmaAdapterClient(args: {
  address: Address;
  publicClient: PublicClient;
  walletClient?: WalletClient;
}): UmaAdapterClient {
  const { address, publicClient, walletClient } = args;
  const requireWallet = () => {
    if (!walletClient) throw new Error("walletClient required for write op");
    return walletClient;
  };

  const read = <T>(functionName: string, callArgs: readonly unknown[] = []) =>
    publicClient.readContract({
      address,
      abi: UmaCtfAdapterAbi,
      functionName,
      args: callArgs,
    } as never) as Promise<T>;

  return {
    address,

    async initialize({ ancillaryData, rewardToken, reward, bond, liveness }) {
      const wallet = requireWallet();
      const data = toHex(ancillaryData);
      const { request } = await publicClient.simulateContract({
        address,
        abi: UmaCtfAdapterAbi,
        functionName: "initialize",
        args: [data, rewardToken, reward, bond, liveness],
        account: wallet.account!,
      });
      const txHash = await wallet.writeContract(request);
      await publicClient.waitForTransactionReceipt({ hash: txHash });

      // Derived, not read back: both values are pure functions of the inputs,
      // and deriving them keeps this independent of event-log decoding.
      const questionId = umaQuestionId(ancillaryData);
      return { txHash, questionId, conditionId: umaConditionId(address, questionId) };
    },

    async resolve(questionId) {
      const wallet = requireWallet();
      const { request } = await publicClient.simulateContract({
        address,
        abi: UmaCtfAdapterAbi,
        functionName: "resolve",
        args: [questionId],
        account: wallet.account!,
      });
      const txHash = await wallet.writeContract(request);
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      return txHash;
    },

    isSettled: (questionId) => read<boolean>("isSettled", [questionId]),
    getQuestion: (questionId) => read<UmaQuestion>("getQuestion", [questionId]),
    ctf: () => read<Address>("ctf"),
    oo: () => read<Address>("oo"),
    admin: () => read<Address>("admin"),
  };
}
