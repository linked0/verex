import {
  createPublicClient,
  createWalletClient,
  http,
  type Chain,
  type PublicClient,
  type WalletClient,
} from "viem";
import { mnemonicToAccount, privateKeyToAccount } from "viem/accounts";
import { foundry, sepolia, baseSepolia } from "viem/chains";
import type { Address, Hex } from "./types";

/// Anvil's well-known default mnemonic — the accounts it derives are public
/// knowledge (anyone running anvil gets the same 10 addresses/keys). Fine for
/// an ephemeral local chain; never reuse it as a real chain's demo mnemonic.
export const ANVIL_MNEMONIC =
  "test test test test test test test test test test test junk";

/// Supported chains, switched purely via VEREX_CHAIN_ID — add an entry here
/// (plus an import from viem/chains) to support another one.
export const CHAINS: Record<number, Chain> = {
  31337: foundry, // local anvil
  11155111: sepolia, // Ethereum Sepolia
  84532: baseSepolia, // Base Sepolia
};

/// Everything needed to resolve accounts and build viem clients, supplied
/// explicitly by the caller rather than read from `process.env` here — each
/// consumer (API, CLI) has different ideas about which env vars it trusts,
/// so that decision belongs to them, not to this shared layer.
export interface AccountConfig {
  rpcUrl: string;
  chain: Chain;
  /// Index 0 (operator) override. Unset — derive index 0 from `mnemonic`
  /// like every other index.
  operatorKey?: Hex;
  /// Lazy on purpose: a caller may want to throw if no mnemonic is
  /// configured, but only when an account actually needs deriving from it —
  /// e.g. an operator-key-only config must keep working for index 0 even
  /// with no mnemonic configured at all. Eagerly evaluating this into a
  /// plain string would force that check to run on every config build,
  /// whether or not the mnemonic ends up being used.
  mnemonic: () => string;
}

export function account(cfg: AccountConfig, index: number) {
  if (index === 0 && cfg.operatorKey) {
    return privateKeyToAccount(cfg.operatorKey);
  }
  return mnemonicToAccount(cfg.mnemonic(), { addressIndex: index });
}

export function accountAddress(cfg: AccountConfig, index: number): Address {
  return account(cfg, index).address;
}

export function makePublicClient(cfg: AccountConfig): PublicClient {
  return createPublicClient({ chain: cfg.chain, transport: http(cfg.rpcUrl) });
}

export function makeWalletClient(cfg: AccountConfig, index: number): WalletClient {
  return createWalletClient({
    account: account(cfg, index),
    chain: cfg.chain,
    transport: http(cfg.rpcUrl),
  });
}
