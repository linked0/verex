import {
  ANVIL_MNEMONIC,
  CHAINS,
  accountAddress as sdkAccountAddress,
  makePublicClient as sdkMakePublicClient,
  makeWalletClient as sdkMakeWalletClient,
  type AccountConfig,
  type Address,
} from "@verex/sdk";

export const RPC_URL = process.env.VEREX_RPC_URL ?? "http://127.0.0.1:8545";

// Index 0 is the deployer (factory owner). Anyone in 1..9 can buy. Indices
// 0-9 match anvil's own default 10-account mnemonic 1:1, so this is the
// same set of addresses/keys the CLI has always used.
const MAX_INDEX = 9;
function checkIndex(accountIndex: number) {
  if (accountIndex < 0 || accountIndex > MAX_INDEX) {
    throw new Error(`account index out of range: ${accountIndex}`);
  }
}

// Always local anvil, always the public well-known mnemonic — deliberately
// ignores VEREX_CHAIN_ID/VEREX_OPERATOR_KEY/VEREX_DEMO_MNEMONIC even if set
// in the same shell from API work. The CLI is a local-anvil-only demo tool
// and must stay one regardless of what else is exported in the environment.
const cfg: AccountConfig = {
  rpcUrl: RPC_URL,
  chain: CHAINS[31337]!,
  mnemonic: () => ANVIL_MNEMONIC,
};

export function publicClient() {
  return sdkMakePublicClient(cfg);
}

export function walletClient(accountIndex: number) {
  checkIndex(accountIndex);
  return sdkMakeWalletClient(cfg, accountIndex);
}

export function accountAddress(accountIndex: number): Address {
  checkIndex(accountIndex);
  return sdkAccountAddress(cfg, accountIndex);
}
