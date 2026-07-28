import type { PublicClient, WalletClient } from "viem";
import { CTFExchangeAbi } from "./abis";
import type { Address, Hex, Order } from "./types";

function requireAccount(wc: WalletClient) {
  if (!wc.account) throw new Error("walletClient.account required");
  return wc.account;
}

// ─────────────────────────────────────────────────────────────────────
// Read helpers
// ─────────────────────────────────────────────────────────────────────

/// Calls `exchange.hashOrder(order)` on-chain. Use the off-chain `hashOrder`
/// from `./orders` in production paths; this is here for tests and parity
/// checks against the contract.
export async function hashOrderViaContract(
  publicClient: PublicClient,
  exchange: Address,
  order: Order,
): Promise<Hex> {
  return publicClient.readContract({
    address: exchange,
    abi: CTFExchangeAbi,
    functionName: "hashOrder",
    args: [orderForCall(order)],
  });
}

export async function getDomainSeparator(
  publicClient: PublicClient,
  exchange: Address,
): Promise<Hex> {
  return publicClient.readContract({
    address: exchange,
    abi: CTFExchangeAbi,
    functionName: "domainSeparator",
  });
}

// ─────────────────────────────────────────────────────────────────────
// Write helpers
// ─────────────────────────────────────────────────────────────────────

/// Operator-only. Registers a YES/NO token pair under a given conditionId.
/// Required before `fillOrder` can match against those tokens.
export async function registerToken(
  publicClient: PublicClient,
  walletClient: WalletClient,
  exchange: Address,
  yesTokenId: bigint,
  noTokenId: bigint,
  conditionId: Hex,
): Promise<Hex> {
  const account = requireAccount(walletClient);
  const { request } = await publicClient.simulateContract({
    address: exchange,
    abi: CTFExchangeAbi,
    functionName: "registerToken",
    args: [yesTokenId, noTokenId, conditionId],
    account,
  });
  const hash = await walletClient.writeContract(request);
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/// Admin-only. Adds an address to the operator allowlist so it can call
/// `fillOrder` / `matchOrders`. Required during setup.
export async function addOperator(
  publicClient: PublicClient,
  walletClient: WalletClient,
  exchange: Address,
  operator: Address,
): Promise<Hex> {
  const account = requireAccount(walletClient);
  const { request } = await publicClient.simulateContract({
    address: exchange,
    abi: CTFExchangeAbi,
    functionName: "addOperator",
    args: [operator],
    account,
  });
  const hash = await walletClient.writeContract(request);
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/// Operator-only. Settles a signed maker `order` against contract inventory
/// for `fillAmount` (in maker-amount terms — see Polymarket OrderStructs.sol
/// docs).
export async function fillOrder(
  publicClient: PublicClient,
  walletClient: WalletClient,
  exchange: Address,
  order: Order,
  fillAmount: bigint,
): Promise<Hex> {
  const account = requireAccount(walletClient);
  const { request } = await publicClient.simulateContract({
    address: exchange,
    abi: CTFExchangeAbi,
    functionName: "fillOrder",
    args: [orderForCall(order), fillAmount],
    account,
  });
  const hash = await walletClient.writeContract(request);
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/// Operator-only. Crosses a taker order against maker orders — the CLOB
/// settlement primitive. `takerFillAmount` is in the taker order's
/// makerAmount units; each `makerFillAmounts[i]` is in that maker order's
/// makerAmount units (see Polymarket Trading.sol).
export async function matchOrders(
  publicClient: PublicClient,
  walletClient: WalletClient,
  exchange: Address,
  takerOrder: Order,
  makerOrders: Order[],
  takerFillAmount: bigint,
  makerFillAmounts: bigint[],
): Promise<Hex> {
  const account = requireAccount(walletClient);
  const { request } = await publicClient.simulateContract({
    address: exchange,
    abi: CTFExchangeAbi,
    functionName: "matchOrders",
    args: [orderForCall(takerOrder), makerOrders.map(orderForCall), takerFillAmount, makerFillAmounts],
    account,
  });
  const hash = await walletClient.writeContract(request);
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/// Maker-only. Cancels a signed order on-chain by burning its nonce. Use
/// when the off-chain book has retracted an order and we want to guarantee
/// it can never be filled even if the operator misbehaves.
export async function cancelOrder(
  publicClient: PublicClient,
  walletClient: WalletClient,
  exchange: Address,
  order: Order,
): Promise<Hex> {
  const account = requireAccount(walletClient);
  const { request } = await publicClient.simulateContract({
    address: exchange,
    abi: CTFExchangeAbi,
    functionName: "cancelOrder",
    args: [orderForCall(order)],
    account,
  });
  const hash = await walletClient.writeContract(request);
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

// ─────────────────────────────────────────────────────────────────────
// Internal
// ─────────────────────────────────────────────────────────────────────

/// viem's contract call layer expects enums as numeric uint8s already — our
/// `Order` already stores them as `Side | SignatureType` numeric enums, so
/// this is effectively an identity cast that nails down the call shape.
function orderForCall(order: Order) {
  return {
    salt: order.salt,
    maker: order.maker,
    signer: order.signer,
    taker: order.taker,
    tokenId: order.tokenId,
    makerAmount: order.makerAmount,
    takerAmount: order.takerAmount,
    expiration: order.expiration,
    nonce: order.nonce,
    feeRateBps: order.feeRateBps,
    side: order.side,
    signatureType: order.signatureType,
    signature: order.signature,
  };
}
