import { createPublicClient, createWalletClient, http, PublicClient, WalletClient } from "viem";
import { VerexClientConfig, Market, Outcome } from "./types";

const MARKET_ABI = [
  {
    name: "createMarket",
    type: "function",
    inputs: [{ name: "question", type: "string" }, { name: "endTime", type: "uint256" }],
    outputs: [{ name: "id", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    name: "buyShares",
    type: "function",
    inputs: [{ name: "id", type: "uint256" }, { name: "isYes", type: "bool" }],
    outputs: [],
    stateMutability: "payable",
  },
  {
    name: "markets",
    type: "function",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      { name: "question", type: "string" },
      { name: "endTime", type: "uint256" },
      { name: "outcome", type: "uint8" },
      { name: "yesShares", type: "uint256" },
      { name: "noShares", type: "uint256" },
      { name: "settled", type: "bool" },
    ],
    stateMutability: "view",
  },
  {
    name: "marketCount",
    type: "function",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    name: "claimWinnings",
    type: "function",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

export class VerexClient {
  private publicClient: PublicClient;
  private contractAddress: `0x${string}`;

  constructor(config: VerexClientConfig) {
    this.contractAddress = config.contractAddress;
    this.publicClient = createPublicClient({
      transport: http(config.rpcUrl),
    });
  }

  async getMarket(id: bigint): Promise<Market> {
    const result = await this.publicClient.readContract({
      address: this.contractAddress,
      abi: MARKET_ABI,
      functionName: "markets",
      args: [id],
    });

    return {
      id,
      question: result[0],
      endTime: result[1],
      outcome: result[2] as Outcome,
      yesShares: result[3],
      noShares: result[4],
      settled: result[5],
    };
  }

  async getMarketCount(): Promise<bigint> {
    return this.publicClient.readContract({
      address: this.contractAddress,
      abi: MARKET_ABI,
      functionName: "marketCount",
    });
  }
}
