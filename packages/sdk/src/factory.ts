import { decodeEventLog, getAddress } from "viem";
import { MarketFactoryAbi } from "./abis";
import type { Address, ClientConfig } from "./types";

export interface FactoryClient {
  address: Address;
  getMarkets(): Promise<Address[]>;
  getMarketCount(): Promise<bigint>;
  /** Deploys a new Market and returns its address. Requires `walletClient`. */
  createMarket(question: string, endTimeSeconds: bigint): Promise<Address>;
}

export function createFactoryClient(config: ClientConfig): FactoryClient {
  const { address, publicClient, walletClient } = config;

  return {
    address,

    async getMarkets() {
      const markets = await publicClient.readContract({
        address,
        abi: MarketFactoryAbi,
        functionName: "getMarkets",
      });
      return [...markets] as Address[];
    },

    async getMarketCount() {
      return publicClient.readContract({
        address,
        abi: MarketFactoryAbi,
        functionName: "marketCount",
      });
    },

    async createMarket(question: string, endTimeSeconds: bigint) {
      if (!walletClient) {
        throw new Error("walletClient required for createMarket");
      }
      const account = walletClient.account;
      if (!account) {
        throw new Error("walletClient.account required");
      }

      const { request } = await publicClient.simulateContract({
        address,
        abi: MarketFactoryAbi,
        functionName: "createMarket",
        args: [question, endTimeSeconds],
        account,
      });
      const txHash = await walletClient.writeContract(request);
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

      // Decode the MarketCreated event to recover the new market address
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== address.toLowerCase()) continue;
        try {
          const decoded = decodeEventLog({
            abi: MarketFactoryAbi,
            data: log.data,
            topics: log.topics,
          });
          if (decoded.eventName === "MarketCreated") {
            return getAddress(decoded.args.market);
          }
        } catch {
          // not our event
        }
      }
      throw new Error("MarketCreated event not found in receipt");
    },
  };
}
