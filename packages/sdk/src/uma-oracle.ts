// Oracle-side helpers for UMA markets: the request lifecycle as seen from the
// ORACLE, not the adapter. Propose / dispute / (mock-only) vote & finalize.
//
// One client serves both oracles. `proposePrice` and `disputePrice` share
// their signatures with the real OptimisticOracleV2, so those calls work
// against either; `vote`, `finalizeVote` and `getBallots` exist only on the
// MockOptimisticOracleV2 — the demo jury that stands in for UMA's DVM. The
// caller decides what to offer based on ChainConfig's `umaOracleMock` flag,
// not by probing the contract.

import { toHex, type PublicClient, type WalletClient } from "viem";
import { MockOptimisticOracleV2Abi } from "./abis";
import type { Address, Hex } from "./types";

/// UMA's request lifecycle states, by enum value. `Expired` = liveness passed
/// undisputed (settleable); `Resolved` = a dispute was voted on (settleable);
/// `Settled` = someone already collected the answer.
export const UMA_REQUEST_STATES = [
  "Invalid",
  "Requested",
  "Proposed",
  "Expired",
  "Disputed",
  "Resolved",
  "Settled",
] as const;
export type UmaRequestState = (typeof UMA_REQUEST_STATES)[number];

export interface UmaOracleRequest {
  proposer: Address;
  disputer: Address;
  currency: Address;
  settled: boolean;
  proposedPrice: bigint;
  resolvedPrice: bigint;
  expirationTime: bigint;
  reward: bigint;
  bond: bigint;
  customLiveness: bigint;
}

export interface UmaOracleClient {
  address: Address;

  /// Propose an answer (1e18 YES / 0 NO / 0.5e18 unresolvable). The caller's
  /// wallet must hold and have approved the request's bond currency.
  proposePrice: (args: RequestKey & { price: bigint }) => Promise<Hex>;

  /// Dispute the live proposal, posting a matching bond. Freezes the request
  /// until the (mock) jury rules.
  disputePrice: (args: RequestKey) => Promise<Hex>;

  /// MOCK ONLY — cast this wallet's one vote on a disputed request.
  vote: (args: RequestKey & { answer: bigint }) => Promise<Hex>;

  /// MOCK ONLY — close the jury: majority wins, a tie is unresolvable.
  finalizeVote: (args: RequestKey) => Promise<Hex>;

  getState: (args: RequestKey) => Promise<UmaRequestState>;
  getRequest: (args: RequestKey) => Promise<UmaOracleRequest>;
  /// MOCK ONLY — the ballots cast so far.
  getBallots: (args: RequestKey) => Promise<{ voter: Address; answer: bigint }[]>;
}

/// The four values that identify a request on the oracle. `requester` is the
/// ADAPTER's address; timestamp and ancillary data come from the adapter's
/// `getQuestion` — never reconstruct them by hand.
export interface RequestKey {
  requester: Address;
  timestamp: bigint;
  /// Already-encoded ancillary bytes (Market.umaAncillaryData as hex, or the
  /// adapter's stored bytes) — passed through untouched.
  ancillaryData: Hex | string;
}

const YES_OR_NO_QUERY = toHex("YES_OR_NO_QUERY", { size: 32 });

export function createUmaOracleClient(args: {
  address: Address;
  publicClient: PublicClient;
  walletClient?: WalletClient;
}): UmaOracleClient {
  const { address, publicClient, walletClient } = args;
  const requireWallet = () => {
    if (!walletClient) throw new Error("walletClient required for write op");
    return walletClient;
  };

  const ancBytes = (v: Hex | string): Hex => (v.startsWith("0x") ? (v as Hex) : toHex(v));

  const write = async (functionName: string, callArgs: readonly unknown[]) => {
    const wallet = requireWallet();
    const { request } = await publicClient.simulateContract({
      address,
      abi: MockOptimisticOracleV2Abi,
      functionName,
      args: callArgs,
      account: wallet.account!,
    } as never);
    const txHash = await wallet.writeContract(request as never);
    await publicClient.waitForTransactionReceipt({ hash: txHash });
    return txHash;
  };

  const read = <T>(functionName: string, callArgs: readonly unknown[]) =>
    publicClient.readContract({
      address,
      abi: MockOptimisticOracleV2Abi,
      functionName,
      args: callArgs,
    } as never) as Promise<T>;

  const key = (k: RequestKey) => [k.requester, YES_OR_NO_QUERY, k.timestamp, ancBytes(k.ancillaryData)] as const;

  return {
    address,

    proposePrice: (a) => write("proposePrice", [...key(a), a.price]),
    disputePrice: (a) => write("disputePrice", [...key(a)]),
    vote: (a) => write("vote", [...key(a), a.answer]),
    finalizeVote: (a) => write("finalizeVote", [...key(a)]),

    async getState(a) {
      const s = await read<number>("getState", [...key(a)]);
      return UMA_REQUEST_STATES[s] ?? "Invalid";
    },

    getRequest: (a) => read<UmaOracleRequest>("getRequest", [...key(a)]),

    async getBallots(a) {
      const [voters, answers] = await read<[Address[], bigint[]]>("getBallots", [...key(a)]);
      return voters.map((voter, i) => ({ voter, answer: answers[i]! }));
    },
  };
}
