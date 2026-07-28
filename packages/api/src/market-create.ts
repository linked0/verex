// Shared on-chain binary-market creation: prepareCondition → registerToken
// → split operator inventory. Used by the seed and by the CREATE_GROUP
// batch job (user-created markets), so both paths stay identical.
//
// Every step is idempotent-checkable — a retried job resumes where it
// stopped instead of double-splitting inventory:
//   - prepareCondition: the CTF reverts on re-prepare → caught + continued
//   - registerToken: the exchange reverts AlreadyRegistered → caught + continued
//   - split: skipped when the operator already holds the inventory

import { keccak256, toHex } from "viem";
import { getConditionId, type Address, type CTClient, type ExchangeClient, type Hex } from "@verex/sdk";

export interface OnChainMarket {
  questionId: Hex;
  conditionId: Hex;
  yesTokenId: string;
  noTokenId: string;
}

export async function createBinaryMarketOnChain(args: {
  ct: CTClient;
  exchange: ExchangeClient;
  usdcAddr: Address;
  operator: Address;
  /// Deterministic question key, e.g. "verex:eth-above-10k-2026" — hashed
  /// into the on-chain questionId.
  questionKey: string;
  /// Operator inventory to mint for this market (E6). splitPosition turns
  /// this much USDC into equal Yes+No token inventory.
  inventoryE6: bigint;
}): Promise<OnChainMarket> {
  const questionId: Hex = keccak256(toHex(args.questionKey));
  const conditionId = getConditionId(args.operator, questionId, 2n);

  try {
    await args.ct.prepareCondition(args.operator, questionId, 2n);
  } catch (e: any) {
    // Re-prepare reverts "condition already prepared" — fine on a resumed job.
    if (!/already prepared/i.test(e?.message ?? "")) throw e;
  }

  const ids = await args.ct.getBinaryPositionIds(args.usdcAddr, conditionId);

  try {
    await args.exchange.registerToken(ids.yes, ids.no, conditionId);
  } catch (e: any) {
    if (!/AlreadyRegistered/i.test(e?.message ?? String(e))) throw e;
  }

  const held = await args.ct.balanceOf(args.operator, ids.yes);
  if (held < args.inventoryE6) {
    await args.ct.splitBinary(args.usdcAddr, conditionId, args.inventoryE6 - held);
  }

  return {
    questionId,
    conditionId,
    yesTokenId: ids.yes.toString(),
    noTokenId: ids.no.toString(),
  };
}
