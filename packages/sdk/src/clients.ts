import type { PublicClient, WalletClient } from "viem";
import * as ct from "./ct";
import * as exchange from "./exchange";
import * as usdc from "./usdc";
import type { Address, Hex, Order } from "./types";

/// Thin client that pre-binds a PublicClient (+ optional WalletClient) and a
/// `ConditionalTokens` address. Forwards to the flat helpers in `./ct` and
/// `./usdc`. Use the flat helpers directly when one-off, or this client when
/// the same address gets passed around (CLI, MM agent).
export interface CTClient {
  address: Address;

  prepareCondition: (oracle: Address, questionId: Hex, slots: bigint) => Promise<Hex>;
  reportPayouts: (questionId: Hex, payouts: bigint[]) => Promise<Hex>;

  splitBinary: (collateral: Address, conditionId: Hex, amount: bigint) => Promise<Hex>;
  mergeBinary: (collateral: Address, conditionId: Hex, amount: bigint) => Promise<Hex>;
  redeem: (collateral: Address, conditionId: Hex, indexSets: bigint[]) => Promise<Hex>;
  setApprovalForAll: (operator: Address, approved: boolean) => Promise<Hex>;

  getBinaryPositionIds: (collateral: Address, conditionId: Hex) => Promise<{ yes: bigint; no: bigint }>;
  balanceOf: (account: Address, positionId: bigint) => Promise<bigint>;
  getPayoutDenominator: (conditionId: Hex) => Promise<bigint>;
}

export function createCTClient(args: {
  address: Address;
  publicClient: PublicClient;
  walletClient?: WalletClient;
}): CTClient {
  const { address, publicClient, walletClient } = args;
  const requireWallet = () => {
    if (!walletClient) throw new Error("walletClient required for write op");
    return walletClient;
  };

  return {
    address,

    prepareCondition: (oracle, questionId, slots) =>
      ct.prepareCondition(publicClient, requireWallet(), address, oracle, questionId, slots),
    reportPayouts: (questionId, payouts) =>
      ct.reportPayouts(publicClient, requireWallet(), address, questionId, payouts),

    splitBinary: (collateral, conditionId, amount) =>
      ct.splitBinaryPosition(publicClient, requireWallet(), address, collateral, conditionId, amount),
    mergeBinary: (collateral, conditionId, amount) =>
      ct.mergeBinaryPosition(publicClient, requireWallet(), address, collateral, conditionId, amount),
    redeem: (collateral, conditionId, indexSets) =>
      ct.redeemPositions(publicClient, requireWallet(), address, collateral, conditionId, indexSets),
    setApprovalForAll: (operator, approved) =>
      ct.setApprovalForAll(publicClient, requireWallet(), address, operator, approved),

    getBinaryPositionIds: (collateral, conditionId) =>
      ct.getBinaryPositionIds(publicClient, address, collateral, conditionId),
    balanceOf: (account, positionId) =>
      ct.balanceOf1155(publicClient, address, account, positionId),
    getPayoutDenominator: (conditionId) =>
      ct.getPayoutDenominator(publicClient, address, conditionId),
  };
}

/// Same pattern for `CTFExchange`.
export interface ExchangeClient {
  address: Address;

  registerToken: (yesTokenId: bigint, noTokenId: bigint, conditionId: Hex) => Promise<Hex>;
  addOperator: (operator: Address) => Promise<Hex>;
  fillOrder: (order: Order, fillAmount: bigint) => Promise<Hex>;
  cancelOrder: (order: Order) => Promise<Hex>;

  hashOrderViaContract: (order: Order) => Promise<Hex>;
  getDomainSeparator: () => Promise<Hex>;
}

export function createExchangeClient(args: {
  address: Address;
  publicClient: PublicClient;
  walletClient?: WalletClient;
}): ExchangeClient {
  const { address, publicClient, walletClient } = args;
  const requireWallet = () => {
    if (!walletClient) throw new Error("walletClient required for write op");
    return walletClient;
  };

  return {
    address,

    registerToken: (yesTokenId, noTokenId, conditionId) =>
      exchange.registerToken(publicClient, requireWallet(), address, yesTokenId, noTokenId, conditionId),
    addOperator: (operator) =>
      exchange.addOperator(publicClient, requireWallet(), address, operator),
    fillOrder: (order, fillAmount) =>
      exchange.fillOrder(publicClient, requireWallet(), address, order, fillAmount),
    cancelOrder: (order) =>
      exchange.cancelOrder(publicClient, requireWallet(), address, order),

    hashOrderViaContract: (order) => exchange.hashOrderViaContract(publicClient, address, order),
    getDomainSeparator: () => exchange.getDomainSeparator(publicClient, address),
  };
}

/// Same pattern for `MockUSDC` (or any ERC-20 with `mint`).
export interface UsdcClient {
  address: Address;
  balanceOf: (account: Address) => Promise<bigint>;
  allowance: (owner: Address, spender: Address) => Promise<bigint>;
  mint: (to: Address, amount: bigint) => Promise<Hex>;
  approve: (spender: Address, amount: bigint) => Promise<Hex>;
}

export function createUsdcClient(args: {
  address: Address;
  publicClient: PublicClient;
  walletClient?: WalletClient;
}): UsdcClient {
  const { address, publicClient, walletClient } = args;
  const requireWallet = () => {
    if (!walletClient) throw new Error("walletClient required for write op");
    return walletClient;
  };

  return {
    address,
    balanceOf: (account) => usdc.getBalance(publicClient, address, account),
    allowance: (owner, spender) => usdc.getAllowance(publicClient, address, owner, spender),
    mint: (to, amount) => usdc.mint(publicClient, requireWallet(), address, to, amount),
    approve: (spender, amount) => usdc.approve(publicClient, requireWallet(), address, spender, amount),
  };
}
