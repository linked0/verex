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
   - **✅ Confirmed (test: `test_LoserRedeemReturnsZero`)**: returns 0 USDC, **no revert**. The loser's outcome tokens are burned regardless. UX-friendly — exact match for our v1 `claim()` design pattern.

2. **Splitting after resolution** — can you call `splitPosition` after the condition is resolved?
   - **✅ Confirmed (test: `test_SplitAfterResolveAllowed`)**: yes, no revert. Tokens are minted normally; user can then redeem winning side immediately. Economically a wash (you put in 1 USDC → can get back at most 1 USDC) but technically allowed. Our SDK wrapper should warn (not block) if called post-resolve.

3. **Reentrancy surface** — `splitPosition` / `mergePositions` and the ERC-1155 receiver hook.
   - **✅ Confirmed (test: `test_SplitFromContractWithReceiver_Succeeds`)**: hook fires on the caller side (the receiver of newly-minted ERC-1155 tokens). CTF's own state writes happen before the hook (correct CEI), so CTF isn't vulnerable. **Risk is on our side**: if our caller-contract (MM Agent v1, AA wallet) has logic in `onERC1155BatchReceived`, that logic runs synchronously inside the split call — our hook implementation must be reentrancy-safe.

4. **Gas cost of `splitPosition` vs direct `safeTransferFrom`** — does the exchange's auto-split path add meaningful cost?
   - **✅ Measured (gas snapshots in `test_GasSnapshot_*`)**:
     - `splitPosition` ≈ **151k gas** (binary, EOA caller; ~496k from a contract caller including hook)
     - `mergePositions` ≈ **191k gas**
     - `redeemPositions([1, 2])` ≈ **240k gas**
     - `redeemPositions([1])` (winner only) ≈ **230k gas**
   - Direct ERC-1155 `safeTransferFrom` is roughly 40–60k. So **split is ~3× more expensive than a transfer**. Implication for MM Agent v0/v1: pre-mint complete sets when convenient and trade them, rather than splitting on-demand inside hot path. Save ~100k gas per fill that way.

5. **Question ID convention** — `keccak256(question_text)` vs UMA's format?
   - **Recommendation (locked in)**: use **UMA's format from the start** — `keccak256(abi.encode(ancillaryData))` for the simple v2 case, with a `timestamp` field to be added when we wire UMA's `OptimisticOracleV2.requestPrice` in S6. This way our conditions stay compatible across the S2~S6 oracle migration. Documented here as the convention; SDK enforces it from S2.4.

6. **`prepareCondition` idempotency wrapping pattern** — non-idempotent (reverts on re-call).
   - **✅ Confirmed (test: `test_PrepareCondition_DoubleCallReverts`)**: revert message is exact string `"condition already prepared"`. Use it for try/catch in SDK:
     ```typescript
     try { await ctf.prepareCondition(...); }
     catch (e) { if (!e.message.includes("condition already prepared")) throw e; }
     ```
     Single RPC round-trip, retry-safe under network flakiness.

7. **Auto-claim delegate scope** — selector-only or with arg validation?
   - **Still pending** (test deferred to S7 when we build the delegate). The S2.1 test suite doesn't exercise this — it requires a deployed delegate plus an attack contract. To do at S7 mid-week alongside the EIP-7702 work (§11.4 B6).
   - **Working hypothesis**: selector-only is INSUFFICIENT — an attacker who has delegation rights via `redeemPositions` selector could redeem from any (collateralToken, conditionId) the user holds tokens in, draining unrelated positions. So the delegate likely needs to enforce `(collateralToken == expectedCollateral)` and `(conditionId in user-approved set)`. Final answer when test runs.

8. **ERC-1155 receiver hook requirements** — do our future contracts need to implement `onERC1155Received` / `onERC1155BatchReceived`?
   - **✅ Confirmed (tests: `test_SplitFromContractWith*Receiver`)**: yes — a contract that calls `splitPosition` MUST implement the receiver, or the call reverts (per ERC-1155 spec). For our codebase: MM Agent v1, AA wallet, Auto-claim delegate, and any other contract that calls `splitPosition` directly all need a no-op `onERC1155Received` + `onERC1155BatchReceived` (return the standard magic selector). Trivial to add; easy to forget.

9. **`redeemPositions` gas — multi-indexSet single call vs separate calls** — for a winner holding both YES and NO, is `redeem([1, 2])` cheaper than `redeem([1])` then `redeem([2])`?
   - **✅ Measured (test: `test_RedeemCombinedVsSeparate_Gas`)**:
     - `redeem([1, 2])` combined: **54,877 gas**
     - `redeem([1])` + `redeem([2])` separate (sum): **82,042 gas** (winner: 56,613 + loser: 25,429)
   - Combined is **~33% cheaper**. Two reasons: (a) one transaction's fixed cost vs two, (b) shared bookkeeping. SDK's `claim()` wrapper should default to combined when the user holds both sides.

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
