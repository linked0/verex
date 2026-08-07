// Chain plumbing shared by the seed script and the trading routes.
//
// Demo-wallet model: users are deterministic mnemonic accounts (index
// 1..9); account 0 is the operator (deployer, manual oracle, exchange
// operator, and MM inventory holder). The server holds these keys because
// this is a demo — the production path (real wallets, session keys) is the
// S7 AA work.
//
// Local dev (default, no env vars set) uses anvil's well-known public
// mnemonic/chain — fine, it's an ephemeral local chain with no adversaries.
// Any real chain (VEREX_CHAIN_ID != 31337) must supply VEREX_DEMO_MNEMONIC
// (a *private* mnemonic nobody else knows — anvil's default is famous, so
// reusing it on a public chain would let anyone derive the same keys) and
// should supply VEREX_OPERATOR_KEY for the operator specifically.
//
// Account derivation and viem client construction live in @verex/sdk
// (packages/sdk/src/chain.ts) — this file just resolves the env vars into
// an explicit AccountConfig and adds the API-specific bits (the ChainConfig
// DB row / loadChain() below). packages/cli builds its own separate,
// deliberately env-insensitive AccountConfig for the same SDK functions.

import type { Hex, PublicClient, WalletClient } from "viem";
import {
  ANVIL_MNEMONIC,
  CHAINS,
  account as sdkAccount,
  accountAddress as sdkAccountAddress,
  makePublicClient as sdkMakePublicClient,
  makeWalletClient as sdkMakeWalletClient,
  createCTClient,
  createExchangeClient,
  createUsdcClient,
  createUmaAdapterClient,
  createUmaOracleClient,
  type AccountConfig,
  type Address,
  type CTClient,
  type ExchangeClient,
  type UmaAdapterClient,
  type UmaOracleClient,
  type UsdcClient,
} from "@verex/sdk";
import { prisma } from "./db";

export { ANVIL_MNEMONIC };

export const RPC_URL = process.env.VEREX_RPC_URL ?? "http://127.0.0.1:8545";
export const CHAIN_ID = Number(process.env.VEREX_CHAIN_ID ?? 31337);
const CHAIN = CHAINS[CHAIN_ID] ?? CHAINS[31337]!;

// Lazy on purpose: throwing here (rather than at module import) means a
// deploy that never actually calls account(1..9) — e.g. browse-only/
// DB-only mode — still boots. An import-time throw would take down the
// whole API process, including market-browsing requests that never touch
// a demo-wallet account. Passed to the SDK as a thunk (not called here) for
// the same reason — building an operator-key-only config must not force
// this check for calls that never end up needing a mnemonic.
function demoMnemonic(): string {
  const mnemonic = process.env.VEREX_DEMO_MNEMONIC;
  if (mnemonic) return mnemonic;
  if (CHAIN_ID !== 31337) {
    throw new Error(
      "VEREX_DEMO_MNEMONIC must be set when VEREX_CHAIN_ID points at a real " +
        "chain — anvil's default mnemonic is public, so anyone could derive " +
        "the same demo-wallet keys.",
    );
  }
  return ANVIL_MNEMONIC;
}

function chainAccounts(): AccountConfig {
  // Secret Manager / heredoc values commonly pick up a trailing newline;
  // privateKeyToAccount throws on anything but exactly 0x + 64 hex chars.
  const operatorKey = process.env.VEREX_OPERATOR_KEY?.trim() as
    | Hex
    | undefined;
  return { rpcUrl: RPC_URL, chain: CHAIN, operatorKey, mnemonic: demoMnemonic };
}

export function account(index: number) {
  return sdkAccount(chainAccounts(), index);
}

export function accountAddress(index: number): Address {
  return sdkAccountAddress(chainAccounts(), index);
}

export function makePublicClient(): PublicClient {
  return sdkMakePublicClient(chainAccounts());
}

export function makeWalletClient(index: number): WalletClient {
  return sdkMakeWalletClient(chainAccounts(), index);
}

export interface ChainCtx {
  chainId: number;
  rpcUrl: string;
  usdcAddr: Address;
  ctfAddr: Address;
  exchangeAddr: Address;
  operator: Address;
  /// Null when no UmaCtfAdapter is deployed here — the UMA option is then not
  /// offered at market creation. True on anvil and on any environment that
  /// hasn't run runbook §2b.
  umaAdapterAddr: Address | null;
  /// The oracle behind the adapter, and whether it is the demo mock (a
  /// jury of demo wallets stands in for UMA's DVM). The dispute/vote demo
  /// endpoints refuse to run unless the mock flag is set.
  umaOracleAddr: Address | null;
  umaOracleMock: boolean;
  publicClient: PublicClient;
  /// Clients bound to a wallet — pass the account index (0 = operator).
  ctAs: (index: number) => CTClient;
  exchangeAs: (index: number) => ExchangeClient;
  usdcAs: (index: number) => UsdcClient;
  /// Bound to a specific adapter address. Defaults to the environment's, but
  /// takes an override because a market must resolve through the adapter it
  /// was CREATED against, which may not be the current one.
  umaAs: (index: number, adapter?: Address) => UmaAdapterClient;
  /// Oracle-side lifecycle (propose/dispute/vote) bound to a wallet.
  umaOracleAs: (index: number) => UmaOracleClient;
}

let cached: ChainCtx | null = null;

/// Load the deployed addresses from the ChainConfig row the seed script
/// wrote, and bind viem clients. The ctx is rebuilt whenever the row's
/// addresses change, so a re-seed is picked up without an API restart
/// (a stale ctx makes every fill revert on unregistered token ids).
export async function loadChain(): Promise<ChainCtx> {
  const cfg = await prisma.chainConfig.findUnique({ where: { id: 1 } });
  if (!cfg) {
    throw new Error(
      "ChainConfig missing — run the seed first (pnpm --filter @verex/api seed)",
    );
  }
  if (
    cached &&
    cached.usdcAddr === cfg.usdcAddr &&
    cached.ctfAddr === cfg.ctfAddr &&
    cached.exchangeAddr === cfg.exchangeAddr &&
    cached.umaAdapterAddr === (cfg.umaAdapterAddr as Address | null) &&
    cached.umaOracleAddr === (cfg.umaOracleAddr as Address | null)
  ) {
    return cached;
  }
  const publicClient = makePublicClient();
  // cfg.chainId === 0 is the DB-only/trading-disabled sentinel (no real RPC
  // behind it) — skip the check there, it'd just fail against whatever
  // RPC_URL happens to default to.
  if (cfg.chainId !== 0) {
    const liveChainId = await publicClient.getChainId();
    if (liveChainId !== cfg.chainId) {
      throw new Error(
        `Chain id mismatch: RPC at ${RPC_URL} reports chain ${liveChainId}, ` +
          `but ChainConfig expects ${cfg.chainId} — check VEREX_RPC_URL points ` +
          "at the right network.",
      );
    }
  }
  const ctx: ChainCtx = {
    chainId: cfg.chainId,
    rpcUrl: cfg.rpcUrl,
    usdcAddr: cfg.usdcAddr as Address,
    ctfAddr: cfg.ctfAddr as Address,
    exchangeAddr: cfg.exchangeAddr as Address,
    operator: cfg.operator as Address,
    umaAdapterAddr: (cfg.umaAdapterAddr as Address | null) ?? null,
    umaOracleAddr: (cfg.umaOracleAddr as Address | null) ?? null,
    umaOracleMock: cfg.umaOracleMock,
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
    umaAs: (index, adapter) => {
      const address = adapter ?? (cfg.umaAdapterAddr as Address | null);
      if (!address) {
        throw new Error(
          "no UmaCtfAdapter is deployed in this environment — see " +
            "docs/runbooks/deploy.md §2b",
        );
      }
      return createUmaAdapterClient({
        address,
        publicClient,
        walletClient: makeWalletClient(index),
      });
    },
    umaOracleAs: (index) => {
      const address = cfg.umaOracleAddr as Address | null;
      if (!address) {
        throw new Error("no UMA oracle recorded in this environment's ChainConfig");
      }
      return createUmaOracleClient({
        address,
        publicClient,
        walletClient: makeWalletClient(index),
      });
    },
  };
  cached = ctx;
  return ctx;
}
