// Shared on-chain binary-market creation: prepare the condition →
// registerToken → split operator inventory. Used by the seed and by the
// CREATE_GROUP batch job (user-created markets), so both paths stay identical.
//
// Every step is idempotent-checkable — a retried job resumes where it
// stopped instead of double-splitting inventory:
//   - prepareCondition: the CTF reverts on re-prepare → caught + continued
//   - registerToken: the exchange reverts AlreadyRegistered → caught + continued
//   - split: skipped when the operator already holds the inventory
//
// ── Two oracles, one function.
//
// Who may report a market's result is baked into its identity:
//   conditionId = keccak256(oracle, questionId, 2)
// so the two paths below produce genuinely different markets, and the choice
// can never be changed afterwards. They also differ in HOW the condition gets
// prepared, which is why this isn't a one-line branch:
//
//   OPERATOR — we call prepareCondition(operator, …) ourselves, and questionId
//              is keccak256 of a slug-derived key we control.
//   UMA      — the ADAPTER calls prepareCondition(address(this), …) inside its
//              own initialize(), and questionId is keccak256(ancillaryData).
//              So the question TEXT determines on-chain identity: two markets
//              with identical ancillary data are the same question, and the
//              second initialize reverts AlreadyInitialized. buildAncillaryData
//              folds the slug in so that can't happen by accident.

import { keccak256, toHex } from "viem";
import {
  buildAncillaryData,
  getConditionId,
  umaConditionId,
  umaQuestionId,
  type Address,
  type CTClient,
  type ExchangeClient,
  type Hex,
  type UmaAdapterClient,
} from "@verex/sdk";

export interface OnChainMarket {
  questionId: Hex;
  conditionId: Hex;
  yesTokenId: string;
  noTokenId: string;
  /// Present only for UMA markets — the exact bytes a voter reads.
  ancillaryData?: string;
}

/// Everything the UMA path needs beyond the operator path.
export interface UmaCreateArgs {
  adapter: UmaAdapterClient;
  /// The market question as a human reads it.
  title: string;
  /// Explicit rules for deciding the answer. Required — a question with no
  /// criteria gives a voter no basis to decide, and the likely settlement is
  /// "unresolvable" (0.5e18), which pays both sides half.
  resolutionCriteria: string;
  closesAt: Date;
  /// Bond/reward currency. Must be on UMA's AddressWhitelist — Verex's
  /// MockUSDC is not; Sepolia WETH is.
  rewardToken: Address;
  /// Paid to whoever proposes an answer. If non-zero the ADAPTER must already
  /// hold this much: requestPrice pulls the reward from the caller, and the
  /// caller is the adapter, not us.
  reward: bigint;
  /// Extra bond on top of UMA's final fee — the security parameter. Must
  /// exceed what a liar could earn from the market.
  bond: bigint;
  /// Challenge window in seconds; 0 keeps UMA's 7200s default.
  liveness: bigint;
}

export async function createBinaryMarketOnChain(args: {
  ct: CTClient;
  exchange: ExchangeClient;
  usdcAddr: Address;
  operator: Address;
  /// Question key, e.g. "verex:eth-above-10k-2026:<nonce>" — hashed into the
  /// on-chain questionId on the OPERATOR path, and folded into the ancillary
  /// data on the UMA path. The nonce (job id / seed run id) matters: the CTF
  /// derives token ids from this key, and a key that is a pure function of the
  /// slug means a re-seeded environment re-creates the SAME token ids — wallet
  /// balances from wiped sessions reattach to the new markets as ghost
  /// positions with no trades behind them. The nonce must be stable across
  /// retries of one creation attempt (resume relies on "already prepared"),
  /// which is why callers pass a persisted id, not a timestamp per call.
  questionKey: string;
  /// Operator inventory to mint for this market (E6). splitPosition turns
  /// this much USDC into equal Yes+No token inventory.
  inventoryE6: bigint;
  /// Omit for an operator-resolved market (the default).
  uma?: UmaCreateArgs;
}): Promise<OnChainMarket> {
  const prepared = args.uma
    ? await prepareViaUma(args.questionKey, args.uma)
    : await prepareViaOperator(args.ct, args.operator, args.questionKey);
  const { questionId, conditionId } = prepared;

  const ids = await args.ct.getBinaryPositionIds(args.usdcAddr, conditionId);

  try {
    await args.exchange.registerToken(ids.yes, ids.no, conditionId);
  } catch (e: any) {
    if (!/AlreadyRegistered/i.test(e?.message ?? String(e))) throw e;
  }

  // Inventory is minted by splitting the operator's USDC, which is independent
  // of who resolves the market — this part is identical for both oracles.
  const held = await args.ct.balanceOf(args.operator, ids.yes);
  if (held < args.inventoryE6) {
    await args.ct.splitBinary(args.usdcAddr, conditionId, args.inventoryE6 - held);
  }

  return {
    questionId,
    conditionId,
    yesTokenId: ids.yes.toString(),
    noTokenId: ids.no.toString(),
    ancillaryData: prepared.ancillaryData,
  };
}

async function prepareViaOperator(
  ct: CTClient,
  operator: Address,
  questionKey: string,
): Promise<{ questionId: Hex; conditionId: Hex; ancillaryData?: string }> {
  const questionId: Hex = keccak256(toHex(questionKey));
  const conditionId = getConditionId(operator, questionId, 2n);

  try {
    await ct.prepareCondition(operator, questionId, 2n);
  } catch (e: any) {
    // Re-prepare reverts "condition already prepared" — fine on a resumed job.
    if (!/already prepared/i.test(e?.message ?? "")) throw e;
  }

  return { questionId, conditionId };
}

async function prepareViaUma(
  questionKey: string,
  uma: UmaCreateArgs,
): Promise<{ questionId: Hex; conditionId: Hex; ancillaryData: string }> {
  const ancillaryData = buildAncillaryData({
    title: uma.title,
    resolutionCriteria: uma.resolutionCriteria,
    slug: questionKey,
    closesAt: uma.closesAt,
  });
  const questionId = umaQuestionId(ancillaryData);
  const conditionId = umaConditionId(uma.adapter.address, questionId);

  try {
    await uma.adapter.initialize({
      ancillaryData,
      rewardToken: uma.rewardToken,
      reward: uma.reward,
      bond: uma.bond,
      liveness: uma.liveness,
    });
  } catch (e: any) {
    // Same resume semantics as prepareCondition above: initialize is the step
    // that both prepares the condition and opens the UMA request, so an
    // already-initialized question means a previous attempt got this far.
    if (!/AlreadyInitialized/i.test(e?.message ?? String(e))) throw e;
  }

  return { questionId, conditionId, ancillaryData };
}
