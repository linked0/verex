import { MarketAbi } from "./abis";
import type { Address, ClientConfig, MarketInfo, PositionInfo } from "./types";

export interface MarketClient {
  address: Address;
  getInfo(): Promise<MarketInfo>;
  getPosition(user: Address): Promise<PositionInfo>;
  buyYes(amountWei: bigint): Promise<`0x${string}`>;
  buyNo(amountWei: bigint): Promise<`0x${string}`>;
  resolve(outcome: boolean): Promise<`0x${string}`>;
  /** Returns the tx hash; payout is emitted in the Claimed event. */
  claim(): Promise<`0x${string}`>;
}

export function createMarketClient(config: ClientConfig): MarketClient {
  const { address, publicClient, walletClient } = config;

  function requireWallet() {
    if (!walletClient) throw new Error("walletClient required for write op");
    const account = walletClient.account;
    if (!account) throw new Error("walletClient.account required");
    return { walletClient, account };
  }

  async function sendPayable(
    functionName: "buyYes" | "buyNo",
    value: bigint,
  ) {
    const { walletClient: wc, account } = requireWallet();
    const { request } = await publicClient.simulateContract({
      address,
      abi: MarketAbi,
      functionName,
      account,
      value,
    });
    const hash = await wc.writeContract(request);
    await publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  async function sendResolve(outcome: boolean) {
    const { walletClient: wc, account } = requireWallet();
    const { request } = await publicClient.simulateContract({
      address,
      abi: MarketAbi,
      functionName: "resolve",
      args: [outcome],
      account,
    });
    const hash = await wc.writeContract(request);
    await publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  async function sendClaim() {
    const { walletClient: wc, account } = requireWallet();
    const { request } = await publicClient.simulateContract({
      address,
      abi: MarketAbi,
      functionName: "claim",
      account,
    });
    const hash = await wc.writeContract(request);
    await publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  return {
    address,

    async getInfo() {
      const [question, endTime, owner, resolved, outcome, yesPool, noPool] =
        await Promise.all([
          publicClient.readContract({ address, abi: MarketAbi, functionName: "question" }),
          publicClient.readContract({ address, abi: MarketAbi, functionName: "endTime" }),
          publicClient.readContract({ address, abi: MarketAbi, functionName: "owner" }),
          publicClient.readContract({ address, abi: MarketAbi, functionName: "resolved" }),
          publicClient.readContract({ address, abi: MarketAbi, functionName: "outcome" }),
          publicClient.readContract({ address, abi: MarketAbi, functionName: "yesPool" }),
          publicClient.readContract({ address, abi: MarketAbi, functionName: "noPool" }),
        ]);
      return {
        address,
        question,
        endTime,
        owner: owner as Address,
        resolved,
        outcome,
        yesPool,
        noPool,
      };
    },

    async getPosition(user: Address) {
      const [yesShares, noShares] = await Promise.all([
        publicClient.readContract({
          address,
          abi: MarketAbi,
          functionName: "yesShares",
          args: [user],
        }),
        publicClient.readContract({
          address,
          abi: MarketAbi,
          functionName: "noShares",
          args: [user],
        }),
      ]);
      return { user, yesShares, noShares };
    },

    buyYes: (amountWei) => sendPayable("buyYes", amountWei),
    buyNo: (amountWei) => sendPayable("buyNo", amountWei),
    resolve: (outcome) => sendResolve(outcome),
    claim: () => sendClaim(),
  };
}
