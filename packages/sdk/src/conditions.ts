import { encodePacked, keccak256 } from "viem";
import type { Address, Hex } from "./types";

/// Off-chain replication of `IConditionalTokens.getConditionId`.
///
/// Solidity:
///   keccak256(abi.encodePacked(oracle, questionId, outcomeSlotCount))
///
/// `abi.encodePacked` lays out address (20 bytes) || bytes32 (32 bytes) ||
/// uint256 (32 bytes) without padding for the dynamic-sized args, then
/// big-endian for the uint256. viem's `encodePacked` does the same.
export function getConditionId(
  oracle: Address,
  questionId: Hex,
  outcomeSlotCount: bigint,
): Hex {
  return keccak256(
    encodePacked(
      ["address", "bytes32", "uint256"],
      [oracle, questionId, outcomeSlotCount],
    ),
  );
}
