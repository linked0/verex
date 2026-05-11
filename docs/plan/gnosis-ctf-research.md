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

## 7. Open Questions (verify by testing in S2.1 milestone)

These are things the docs don't make 100% explicit; the Foundry test should resolve them:

1. **Loser redeem behavior** — does `redeemPositions` revert or return 0 for an `indexSet` with no winning tokens? (Source skim says it pays the proportional amount, which is 0 for a losing slot — but we should confirm with a test.)
2. **Splitting after resolution** — can you call `splitPosition` after the condition is resolved? (Probably yes — useful for late-arriving collateral providers — but should test.)
3. **Reentrancy surface** — `splitPosition` / `mergePositions` call `safeTransferFrom` (ERC-1155 hook) which can trigger receiver callbacks. Anything we need to guard against in our integration code?
4. **Gas cost of `splitPosition`** vs direct `safeTransferFrom` — if the exchange's settlement path forces a split, does that add meaningful cost?
5. **Question ID convention** — keccak256 of the human-readable question text? Or use UMA's question ID format if we plan to switch oracles in S6? (Pick a convention now to avoid migration later.)

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
