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

/// RPC 가 이 컴퓨터를 가리키는가.
///
/// **왜 chainId 로는 안 되나.** Sepolia 포크(`anvil --fork-url … --chain-id 11155111`)는
/// 남의 체인 id 를 그대로 보고한다 — 그게 지갑과 표준 컨트랙트 주소를 쓰기 위한
/// 전제이기도 하다. 그래서 "31337 이 아니면 실 네트워크"라는 판정은 포크에서 거짓이 된다.
///
/// **왜 RPC 주소로는 되나.** 127.0.0.1 뒤에 있는 것은 무엇을 주장하든 이 컴퓨터다.
/// 아래 가드들이 지키려는 것은 "체인 이름"이 아니라 **적대자가 존재하는가**이고,
/// loopback 노드에는 없다. 파싱 실패는 remote 로 본다 — 애매하면 닫는 쪽.
export function isLoopbackRpc(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return h === "127.0.0.1" || h === "localhost" || h === "::1" || h === "0.0.0.0";
  } catch {
    return false;
  }
}

/// 이 프로세스가 붙은 노드가 로컬인가. 포크도 포함된다.
export const IS_LOCAL_NODE = isLoopbackRpc(RPC_URL);

// Lazy on purpose: throwing here (rather than at module import) means a
// deploy that never actually calls account(1..9) — e.g. browse-only/
// DB-only mode — still boots. An import-time throw would take down the
// whole API process, including market-browsing requests that never touch
// a demo-wallet account. Passed to the SDK as a thunk (not called here) for
// the same reason — building an operator-key-only config must not force
// this check for calls that never end up needing a mnemonic.
let warnedAnvilMnemonic = false;

function demoMnemonic(): string {
  const mnemonic = process.env.VEREX_DEMO_MNEMONIC;
  if (mnemonic) return mnemonic;
  if (CHAIN_ID !== 31337) {
    // 포크(loopback + 남의 chainId)는 이 가드가 막으려는 상황이 아니다: 키를 도출할
    // 수 있는 상대가 없고, 잔고도 이 프로세스와 함께 사라진다. 다만 **조용히 넘어가지
    // 않는다** — 가드가 안 걸린다고 배우면 진짜 걸려야 할 때 놓친다.
    if (IS_LOCAL_NODE) {
      if (!warnedAnvilMnemonic) {
        warnedAnvilMnemonic = true;
        console.warn(
          `⚠ VEREX_DEMO_MNEMONIC is unset and VEREX_CHAIN_ID=${CHAIN_ID} is not anvil, ` +
            `but ${RPC_URL} is loopback — using anvil's public mnemonic for the demo wallets. ` +
            `Set VEREX_DEMO_MNEMONIC before pointing this at a remote RPC.`,
        );
      }
      return ANVIL_MNEMONIC;
    }
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

/// Case-insensitive address compare — DB rows and viem-derived addresses are
/// both checksummed today, but only one of them is guaranteed to be.
export function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
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
  // The operator recorded at seed time vs the one this process actually signs
  // as. They diverge silently and the symptom is unrecognisable: an operator
  // that never touched this chain has no ETH, so every operator-signed tx dies
  // as `Insufficient funds for gas * price + value` — which reads like a
  // funding problem, not a wrong-key problem (2026-08-27, jay: the faucet).
  //
  // Warn rather than throw: browsing markets never signs anything, and taking
  // the whole API down over a key that only matters for faucet/MM/resolution
  // would turn a broken demo button into a broken site.
  if (cfg.chainId !== 0 && !sameAddress(accountAddress(0), cfg.operator as Address)) {
    console.warn(
      `⚠️  Operator mismatch: this process signs as ${accountAddress(0)}, but ` +
        `ChainConfig was seeded by ${cfg.operator}. Operator-signed actions ` +
        "(faucet, MM inventory, resolution) will fail. Check VEREX_OPERATOR_KEY " +
        "in <repo>/.env — it must be the key that ran the last reset.sh; on anvil, " +
        "leaving it unset derives the operator from the default mnemonic.",
    );
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
