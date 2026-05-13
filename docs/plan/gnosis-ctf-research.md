# Gnosis Conditional Tokens Framework (CTF) — Research Note

> **Purpose**: working reference for S2 implementation. Skim-readable. Not exhaustive.
> **Status**: draft (S2.1) — to be reviewed before S2.2 (Polymarket Exchange import).
> **Sources**:
> - [`gnosis/conditional-tokens-contracts`](https://github.com/gnosis/conditional-tokens-contracts) — `ConditionalTokens.sol` (287 lines), `CTHelpers.sol` (position ID math)
> - [Official docs](https://docs.gnosis.io/conditionaltokens/)
> - [`Polymarket/ctf-exchange`](https://github.com/Polymarket/ctf-exchange) — `mixins/AssetOperations.sol` (real CTF call sites)

---

## 1. Mental Model

CTF is the **token-layer primitive**. It does three things:

1. **Issues** outcome tokens as ERC-1155 — when a user deposits collateral, CTF mints a *complete set* of outcome tokens (one per possible outcome).
2. **Tracks** ownership of those tokens (standard ERC-1155 balances, transfers, approvals).
3. **Redeems** them after an oracle reports the result — winning tokens become claimable for collateral.

CTF is **permissionless** — anyone can call any function. The trust boundary is the oracle (whoever has the right to call `reportPayouts` for a given condition).

CTF does **NOT**:
- Match orders or run an exchange (that's Polymarket Exchange's job — see §6)
- Hold or move collateral on its own — collateral flows in via `splitPosition`, out via `mergePositions` / `redeemPositions`
- Provide pricing or liquidity

## 2. The Five Functions You Actually Use

For a binary YES/NO market with USDC collateral, these are all you need:

### 2.1 `prepareCondition(oracle, questionId, outcomeSlotCount)`

Creates a *condition* — basically registers "this market exists" in CTF's books.

```solidity
function prepareCondition(
    address oracle,           // who can call reportPayouts (e.g. UMA adapter, our admin)
    bytes32 questionId,       // arbitrary 32-byte ID we choose (e.g. keccak256 of question text)
    uint outcomeSlotCount     // 2 for binary YES/NO
) external;
```

- Idempotent? **No** — reverts if the condition was already prepared.
- Emits: `ConditionPreparation(conditionId, oracle, questionId, outcomeSlotCount)`
- Output: the **conditionId** = `keccak256(oracle, questionId, outcomeSlotCount)` (computable off-chain via `getConditionId`).

### 2.2 `splitPosition(collateral, parentCollectionId, conditionId, partition, amount)` — **MINT**

User deposits collateral, gets back a complete set of outcome tokens.

```solidity
function splitPosition(
    IERC20 collateralToken,    // e.g. USDC address
    bytes32 parentCollectionId, // bytes32(0) for top-level positions
    bytes32 conditionId,
    uint[] calldata partition,  // [1, 2] for binary YES/NO
    uint amount                 // collateral amount (e.g. 100 USDC)
) external;
```

- **Effect**: pulls `amount` collateral from caller, mints `amount` of each outcome token to caller.
- For 100 USDC + binary partition → caller gets 100 YES tokens + 100 NO tokens. Net cost: 100 USDC; net value: still worth 100 USDC (since YES + NO = 1 USDC after resolution regardless of outcome).
- Emits: `PositionSplit(stakeholder, collateralToken, parentCollectionId, conditionId, partition, amount)`

### 2.3 `mergePositions(collateral, parentCollectionId, conditionId, partition, amount)` — **UNMINT**

Reverse of split — burn a complete set, get collateral back.

```solidity
function mergePositions(
    IERC20 collateralToken,
    bytes32 parentCollectionId,
    bytes32 conditionId,
    uint[] calldata partition,
    uint amount
) external;
```

- **Effect**: burns `amount` of each outcome token from caller, returns `amount` collateral.
- Used when: user wants to exit their position before resolution (e.g. closing both YES and NO).
- Emits: `PositionsMerge(stakeholder, collateralToken, parentCollectionId, conditionId, partition, amount)`

### 2.4 `reportPayouts(questionId, payouts)` — **ORACLE RESOLVE**

Oracle declares the result.

```solidity
function reportPayouts(
    bytes32 questionId,
    uint[] calldata payouts    // e.g. [1, 0] for YES wins; [0, 1] for NO; [1, 1] for tie
) external;
```

- **Constraint**: only the address registered as oracle in `prepareCondition` can call this.
- Idempotent? **No** — reverts if already reported.
- Payout numerators are **relative** — `[1, 0]` and `[100, 0]` mean the same thing (YES gets all).
- Tie / fractional outcomes possible: `[1, 1]` splits 50/50. Useful for "scalar" markets.
- Emits: `ConditionResolution(conditionId, oracle, questionId, outcomeSlotCount, payoutNumerators)`

### 2.5 `redeemPositions(collateral, parentCollectionId, conditionId, indexSets)` — **CLAIM**

After resolution, holders convert winning tokens back to collateral.

```solidity
function redeemPositions(
    IERC20 collateralToken,
    bytes32 parentCollectionId,
    bytes32 conditionId,
    uint[] calldata indexSets   // [1, 2] = redeem both YES and NO; [1] = only YES
) external;
```

- **Effect**: burns the caller's tokens for the specified indexSets, pays out collateral proportional to `payoutNumerators / payoutDenominator`.
- Loser tokens redeem to **0** (no revert) — same UX-friendly behavior we used in v1's `claim()`.
- Emits: `PayoutRedemption(redeemer, collateralToken, parentCollectionId, conditionId, indexSets, payout)`

## 3. Position ID Derivation (the non-obvious part)

Every outcome token is an ERC-1155 with a `tokenId`. That `tokenId` is a deterministic hash of:

```
positionId = uint256( keccak256(abi.encodePacked(collateralToken, collectionId)) )
collectionId = keccak256(abi.encodePacked(parentCollectionId, conditionId, indexSet))
```

For a binary YES/NO market with USDC and no parent (top-level position):

```solidity
bytes32 conditionId   = keccak256(abi.encode(oracle, questionId, 2));
bytes32 yesCollection = keccak256(abi.encode(bytes32(0), conditionId, 1));  // indexSet=1 → YES
bytes32 noCollection  = keccak256(abi.encode(bytes32(0), conditionId, 2));  // indexSet=2 → NO
uint256 yesTokenId    = uint256(keccak256(abi.encode(USDC, yesCollection)));
uint256 noTokenId     = uint256(keccak256(abi.encode(USDC, noCollection)));
```

**Why "indexSet"?** It's a bitmap. For binary outcomes:
- `1` = `0b01` = the *first* outcome slot only → YES
- `2` = `0b10` = the *second* outcome slot only → NO
- `3` = `0b11` = both → represents holding the complete set (rarely used directly)

For 3-outcome markets you'd see `[1, 2, 4]`. Bit positions = outcome slot indices.

**Helpers** (use these, don't recompute by hand):
- `getConditionId(oracle, questionId, outcomeSlotCount) → bytes32`
- `getCollectionId(parentCollectionId, conditionId, indexSet) → bytes32`
- `getPositionId(collateralToken, collectionId) → uint`

In the SDK, derive these client-side with `viem`'s `keccak256` so we don't pay for an RPC roundtrip.

## 4. Events We'll Index (S5 prep)

| Event | When | Indexer use |
|-------|------|-------------|
| `ConditionPreparation(conditionId, oracle, questionId, outcomeSlotCount)` | new market created | `Markets` row with conditionId as primary key |
| `ConditionResolution(conditionId, oracle, questionId, outcomeSlotCount, payoutNumerators)` | oracle resolves | mark market as resolved + record payout numerators |
| `PositionSplit(stakeholder, collateralToken, parentCollectionId, conditionId, partition, amount)` | user mints outcome tokens | track collateral inflow + position creation |
| `PositionsMerge(stakeholder, collateralToken, parentCollectionId, conditionId, partition, amount)` | user burns outcome tokens for collateral | reverse of above |
| `PayoutRedemption(redeemer, collateralToken, parentCollectionId, conditionId, indexSets, payout)` | user claims after resolve | record actual payout amounts |

Plus standard ERC-1155 `TransferSingle` / `TransferBatch` from CTF for actual token movements (Polymarket Exchange fills emit these as it moves outcome tokens between buyer and seller).

## 5. How Polymarket Exchange Uses CTF

From [`AssetOperations.sol`](https://github.com/Polymarket/ctf-exchange/blob/main/src/exchange/mixins/AssetOperations.sol):

- **`parentCollectionId = bytes32(0)` always** — Polymarket only does top-level positions, no nested conditions.
- **`partition = [1, 2]` always** — only binary markets.
- **`_mint(conditionId, amount)`** = `IConditionalTokens.splitPosition(USDC, 0x0, conditionId, [1, 2], amount)` — exchange splits its own collateral when needed for filling orders.
- **`_merge(conditionId, amount)`** = `IConditionalTokens.mergePositions(USDC, 0x0, conditionId, [1, 2], amount)` — exchange merges to free collateral.
- **Token ID 0 special-cased** = collateral (USDC). All other token IDs are ERC-1155 outcome tokens.

This split/merge pattern is the engine that lets the exchange settle YES↔USDC trades atomically: when buyer wants YES and seller has only USDC, the exchange can split USDC into [YES, NO] complete sets, give YES to buyer, and either give NO back to seller or merge it on subsequent trades.

**Implication for Verex S2**: we adopt the same conventions (parentCollectionId = 0, partition = [1, 2], collateral = USDC) so Polymarket Exchange works unmodified.

## 6. CTF vs Polymarket Exchange — boundary

| Layer | Owns |
|-------|------|
| **Gnosis CTF** | Condition existence, oracle resolution, outcome token mint/burn/redemption, ERC-1155 balance accounting |
| **Polymarket CTF Exchange** | Order book (off-chain), order matching, EIP-712 signed order verification, atomic token swaps via `safeTransferFrom`, optional split/merge to source liquidity |

For our v2 backbone, both layers are **deployed but unmodified** in S2. The only place we customize is:
- **Oracle**: we register our own admin address (S2) → later replace with UMA adapter (S6)
- **Collateral**: USDC mock token (S2) → real USDC on testnet/mainnet later
- **Operator/admin** of Polymarket Exchange: us

## 7. Open Questions

Things the docs don't make 100% explicit. Each entry is **question + verification approach + (provisional answer where source-readable)**. Items whose answers are still TBD will be confirmed by the S2.1 Foundry test or by deferred work in a later step.

1. **Loser redeem behavior** — does `redeemPositions` revert or return 0 for an `indexSet` with no winning tokens?
   - **Provisional answer (from source)**: returns 0, no revert. Looking at `ConditionalTokens.sol`, the function computes `payout = (numerator × balance) / denominator` for the requested indexSet. For a losing slot, `numerator = 0`, so `payout = 0`. The user's outcome tokens still get burned (regardless of payout amount). UX-friendly — matches our v1 `claim()` design.
   - **Verify**: `test_LoserRedeemReturnsZero` in S2.1.

2. **Splitting after resolution** — can you call `splitPosition` after the condition is resolved?
   - **Provisional answer (from source)**: yes, technically allowed. `splitPosition` only requires the condition to be *prepared*, not unresolved. But economically pointless: you put in 1 USDC → get 1 YES + 1 NO → redeem one for ~1 USDC and the other for 0 (or proportional to numerators). Net zero. No reason to do it on purpose.
   - **Verify**: `test_SplitAfterResolveAllowed` — confirm no revert. Our SDK wrapper should warn (not block) if called post-resolve.

3. **Reentrancy surface** — `splitPosition` / `mergePositions` and the ERC-1155 receiver hook.
   - **Provisional answer (from source)**: `splitPosition` does ERC-20 `transferFrom` (no callback) + `_mintBatch` of outcome tokens. `_mintBatch` triggers `onERC1155BatchReceived` on the **caller** if it's a contract. CTF performs state changes *before* the hook fires (correct CEI), so CTF itself isn't reentrancy-vulnerable. The risk is on **our side**: if our caller-contract (MM Agent v1, AA wallet) has logic in its receiver hook, that runs synchronously inside the split call.
   - **Verify**: `test_SplitFromContract_ReceiverHookFires` — confirm hook is invoked. SDK doc note: if you're calling `splitPosition` *from* a contract, ensure your `onERC1155BatchReceived` is non-trivial-safe.

4. **Gas cost of `splitPosition` vs direct `safeTransferFrom`** — does the exchange's auto-split path add meaningful cost?
   - **Provisional answer (rough)**: `splitPosition` ≈ 100–150k gas for binary (ERC-20 `transferFrom` + state writes + 2× ERC-1155 mints + receiver acceptance check). Direct ERC-1155 `safeTransferFrom` ≈ 40–60k. So auto-split path is ~2–3× more expensive than a pure transfer between accounts that already hold the right tokens.
   - **Verify**: `forge snapshot` on both paths in S2.1; record numbers. Informs MM Agent v0/v1 inventory strategy (pre-mint pairs vs split-on-demand).

5. **Question ID convention** — `keccak256(question_text)` vs UMA's format?
   - **Provisional answer / recommendation**: use **UMA's format from the start** — `keccak256(abi.encode(timestamp, ancillaryData))` (or whichever schema we end up with for the UMA adapter we'll wire in S6). Reason: when S6 swaps the oracle from manual to UMA, our existing conditions stay compatible — migration cost = 0. Keccak of plain text would force re-creating all S2-S5 markets with new IDs at the S6 boundary.
   - **Verify**: pick the exact UMA adapter schema during S2.1 reading, document chosen format in this doc, and use it consistently from S2.2 onward. No test needed — convention decision.

6. **`prepareCondition` idempotency wrapping pattern** — non-idempotent (reverts on re-call). What's the cleanest SDK wrapper?
   - **Verification approach**: write a Foundry test that calls `prepareCondition` twice with same args, capture the exact revert message. Decide between (a) wrap-in-try/catch that treats matching revert as success, or (b) off-chain `getOutcomeSlotCount(conditionId) > 0` check before call. (a) is one round-trip; (b) is two but cleaner separation of concerns. Pick during S2.4.

7. **Auto-claim delegate scope** — for the EIP-7702 delegate ([§11.4 B6](./README.md#114-eip-7702-eoa-delegation--phase-3-aa-전략-결정)) that allows ONLY `redeemPositions` for the user's EOA, is whitelisting by **function selector** sufficient, or do we need to validate **arguments**?
   - **Concretely**: can a malicious caller of the delegate drain other ERC-20 positions in unrelated CTF conditions just by passing different `(collateralToken, conditionId)` args?
   - **Verification approach**: construct an attack-scenario test where the delegated call tries to redeem from a *different* condition than the user intended. If selector-only whitelisting fails the test, we add per-arg validation.
   - **Most security-critical of the new questions** — answer materially shapes B6's audit-grade design.

8. **ERC-1155 receiver hook requirements** — do our future contracts (MM Agent v1, AA wallet, Auto-claim delegate) need to implement `onERC1155Received` / `onERC1155BatchReceived`?
   - **Verification approach**: try calling `splitPosition` from a contract that does NOT implement the receiver — does it revert? Likely yes (per ERC-1155 spec). If so, add receiver implementations to all our contracts that hold outcome tokens.

9. **`redeemPositions` gas — multi-indexSet single call vs separate calls** — for a winner holding both YES and NO (e.g., MM Agent paired-set inventory), is `redeem([1, 2])` cheaper than `redeem([1])` then `redeem([2])`?
   - **Verification approach**: `forge snapshot` both paths. SDK's `claim()` wrapper should default to whichever is cheaper.

10. **NegRisk Adapter upgrade path** — if we add event grouping later (multiple binary markets as one "World Cup winner" event), what's the migration story?
    - **Deferred to**: post-S10 design doc. Polymarket's NegRisk Adapter is a separate contract layer that can be added without touching CTF or Exchange. Tracking here so we don't forget when "event-style markets" come up later.

11. **Cross-chain position ID determinism** — does the same `(oracle, questionId, outcomeSlotCount, collateralToken)` produce the same `positionId` on two different chains?
    - **Deferred to**: S8 (cross-chain participation). Doesn't block any earlier step. If yes, cross-chain UX is much simpler (token IDs are consistent); if no, we need a chain-aware mapping layer.

## 8. What We Build in S2.2~S2.6 — Mapped to CTF

| Step | What it touches |
|------|----------------|
| **S2.2** Polymarket Exchange import | Deploys `ConditionalTokens` + `CTFExchange` to anvil; exchange's constructor takes the CTF address |
| **S2.3** USDC mock | An ERC-20 we control on anvil; passed as `collateralToken` in every CTF call |
| **S2.4** SDK transition | Wraps `prepareCondition` / `splitPosition` / `mergePositions` / `redeemPositions` + EIP-712 order signing for Exchange |
| **S2.5** MM Agent v0 | Calls `splitPosition` to source initial inventory (mint complete sets), then posts both YES and NO orders |
| **S2.6** CLI | New commands: `verex condition prepare`, `verex split`, `verex merge`, `verex order sign`, `verex order fill`, `verex redeem` |

## 9. Reading Order for First-Time CTF Implementer

If you read in this order, each piece reinforces the previous one:

1. This document (mental model)
2. [`IConditionalTokens.sol` (Polymarket's interface)](https://github.com/Polymarket/ctf-exchange/blob/main/src/exchange/interfaces/IConditionalTokens.sol) — only the functions Polymarket actually uses, ~92 lines
3. [`AssetOperations.sol`](https://github.com/Polymarket/ctf-exchange/blob/main/src/exchange/mixins/AssetOperations.sol) — see CTF being called in real code
4. [`ConditionalTokens.sol` (full)](https://github.com/gnosis/conditional-tokens-contracts/blob/master/contracts/ConditionalTokens.sol) — the canonical implementation, 287 lines, surprisingly readable
5. [`CTHelpers.sol`](https://github.com/gnosis/conditional-tokens-contracts/blob/master/contracts/CTHelpers.sol) — only the position ID derivation section (lines 392, 429); skip the unrelated `sqrt` and other helpers
6. The Foundry test we write in S2.1 milestone — *applied* understanding

Total reading time: ~2–3 hours. Plus the test (another 2–3 hours). Confirms the ~2 day estimate.

---

**Next**: write the Foundry test (mint → split → merge → redeem cycle). After that passes and this note is reviewed, we move to S2.2 (Polymarket Exchange import).
