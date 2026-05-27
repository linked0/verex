import type { Account, PublicClient, WalletClient } from "viem";

export type Address = `0x${string}`;
export type Hex = `0x${string}`;

/// Mirrors Polymarket's `Side` enum (OrderStructs.sol). Encoded as uint8 in
/// EIP-712 typed data and on-chain calls.
export enum Side {
  BUY = 0,
  SELL = 1,
}

/// Mirrors Polymarket's `SignatureType` enum. Stage 1 only uses EOA; the
/// POLY_PROXY / POLY_GNOSIS_SAFE variants are reserved for S7 AA work.
export enum SignatureType {
  EOA = 0,
  POLY_PROXY = 1,
  POLY_GNOSIS_SAFE = 2,
}

/// Unsigned order. `signature` is filled in by `signOrder`. Mirrors the
/// Solidity struct field-for-field — order matters for EIP-712 encoding.
export interface Order {
  salt: bigint;
  maker: Address;
  signer: Address;
  taker: Address;
  tokenId: bigint;
  makerAmount: bigint;
  takerAmount: bigint;
  expiration: bigint;
  nonce: bigint;
  feeRateBps: bigint;
  side: Side;
  signatureType: SignatureType;
  signature: Hex;
}

/// Inputs needed to compute the EIP-712 digest off-chain. The verifying
/// contract is the deployed CTFExchange. Domain name + version are fixed by
/// Polymarket's constructor and must not vary.
export interface OrderDomain {
  chainId: number;
  verifyingContract: Address;
}

/// Optional helper for callers that want to bind a PublicClient + (optional)
/// WalletClient + contract address once and pass it around. Read-only ops
/// require `publicClient`; writes require `walletClient` with an account.
export interface ClientConfig {
  address: Address;
  publicClient: PublicClient;
  walletClient?: WalletClient;
}

/// Convenience union for either a viem Account or a private-key signer that
/// `signOrder` can drive directly.
export type OrderSigner = Account | { privateKey: Hex };
