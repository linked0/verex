// Chain plumbing shared by the seed script and the trading routes.
//
// Demo-wallet model: users are anvil's deterministic mnemonic accounts
// (index 1..9); account 0 is the operator (deployer, manual oracle, exchange
// operator, and MM inventory holder). The server holds these keys because
// this is a local demo chain — the production path (real wallets, session
// keys) is the S7 AA work.

import {
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  type WalletClient,
} from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import {
  createCTClient,
  createExchangeClient,
  createUsdcClient,
  type Address,
  type CTClient,
  type ExchangeClient,
  type UsdcClient,
} from "@verex/sdk";
import { prisma } from "./db";

export const ANVIL_MNEMONIC =
  "test test test test test test test test test test test junk";

export const RPC_URL = process.env.VEREX_RPC_URL ?? "http://127.0.0.1:8545";
export const CHAIN_ID = 31337;

export function account(index: number) {
  return mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: index });
}

export function accountAddress(index: number): Address {
  return account(index).address;
}

export function makePublicClient(): PublicClient {
  return createPublicClient({ chain: foundry, transport: http(RPC_URL) });
}

export function makeWalletClient(index: number): WalletClient {
  return createWalletClient({
    account: account(index),
    chain: foundry,
    transport: http(RPC_URL),
  });
}

export interface ChainCtx {
  chainId: number;
  rpcUrl: string;
  usdcAddr: Address;
  ctfAddr: Address;
  exchangeAddr: Address;
  operator: Address;
  publicClient: PublicClient;
  /// Clients bound to a wallet — pass the account index (0 = operator).
  ctAs: (index: number) => CTClient;
  exchangeAs: (index: number) => ExchangeClient;
  usdcAs: (index: number) => UsdcClient;
}

let cached: ChainCtx | null = null;

/// Load the deployed addresses from the ChainConfig row the seed script
/// wrote, and bind viem clients. Cached for the process lifetime — re-seed
/// requires an API restart (fine for local dev).
export async function loadChain(): Promise<ChainCtx> {
  if (cached) return cached;
  const cfg = await prisma.chainConfig.findUnique({ where: { id: 1 } });
  if (!cfg) {
    throw new Error(
      "ChainConfig missing — run the seed first (pnpm --filter @verex/api seed)",
    );
  }
  const publicClient = makePublicClient();
  const ctx: ChainCtx = {
    chainId: cfg.chainId,
    rpcUrl: cfg.rpcUrl,
    usdcAddr: cfg.usdcAddr as Address,
    ctfAddr: cfg.ctfAddr as Address,
    exchangeAddr: cfg.exchangeAddr as Address,
    operator: cfg.operator as Address,
    publicClient,
    ctAs: (index) =>
      createCTClient({
        address: cfg.ctfAddr as Address,
        publicClient,
        walletClient: makeWalletClient(index),
      }),
    exchangeAs: (index) =>
      createExchangeClient({
        address: cfg.exchangeAddr as Address,
        publicClient,
        walletClient: makeWalletClient(index),
      }),
    usdcAs: (index) =>
      createUsdcClient({
        address: cfg.usdcAddr as Address,
        publicClient,
        walletClient: makeWalletClient(index),
      }),
  };
  cached = ctx;
  return ctx;
}
