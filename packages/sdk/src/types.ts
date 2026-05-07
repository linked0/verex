import type { PublicClient, WalletClient } from "viem";

export type Address = `0x${string}`;

export interface ClientConfig {
  address: Address;
  publicClient: PublicClient;
  /** Optional. Required only for write operations. */
  walletClient?: WalletClient;
}

export interface MarketInfo {
  address: Address;
  question: string;
  endTime: bigint;
  owner: Address;
  resolved: boolean;
  /** Meaningful only when `resolved` is true. true = YES wins, false = NO wins. */
  outcome: boolean;
  yesPool: bigint;
  noPool: bigint;
}

export interface PositionInfo {
  user: Address;
  yesShares: bigint;
  noShares: bigint;
}
