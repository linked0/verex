// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {IConditionalTokens} from "ctf-exchange/exchange/interfaces/IConditionalTokens.sol";
import {IERC20} from "openzeppelin-contracts/token/ERC20/IERC20.sol";

import {MockUSDC} from "../src/MockUSDC.sol";

/// @notice S2.1 milestone test — answers §7 open questions in
///         docs/plan/gnosis-ctf-research.md by exercising CTF directly:
///           - Q1: loser redeem returns 0 (no revert)
///           - Q2: split after resolution allowed
///           - Q3: ERC-1155 receiver hook fires on caller-side
///           - Q4: gas snapshots for split / merge / redeem
///           - Q6: prepareCondition idempotency (revert message captured)
///           - Q8: receiver hook required for contract callers of split
///           - Q9: redeem([1,2]) vs separate redeems gas comparison
///
///         Q5 (questionId convention) and Q7 (auto-claim delegate scope) are
///         decision/design items, not exercised here.
contract CTFCycleTest is Test {
    IConditionalTokens internal ctf;
    MockUSDC internal usdc;

    // Test market: "Will Brazil win the 2026 World Cup?"
    address internal oracle;
    bytes32 internal questionId = keccak256("Will Brazil win the 2026 World Cup?");
    bytes32 internal conditionId;
    uint256 internal yesPositionId;
    uint256 internal noPositionId;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        oracle = makeAddr("oracle");

        // Deploy CTF from Polymarket's pre-compiled bytecode (Solidity 0.5
        // source compiled into the artifact JSON; we deploy raw bytecode so
        // we can interact from our 0.8 test).
        ctf = IConditionalTokens(_deployCTF());
        usdc = new MockUSDC();

        // Prepare a binary YES/NO condition.
        ctf.prepareCondition(oracle, questionId, 2);
        conditionId = _conditionId(oracle, questionId, 2);

        // Compute YES/NO position IDs via CTF's own helpers (binary partition:
        // indexSet 1 = YES, 2 = NO). Don't reimplement the math — CTHelpers
        // does EC arithmetic for nested conditions that's hard to replicate.
        bytes32 yesCollection = ctf.getCollectionId(bytes32(0), conditionId, 1);
        bytes32 noCollection = ctf.getCollectionId(bytes32(0), conditionId, 2);
        yesPositionId = ctf.getPositionId(IERC20(address(usdc)), yesCollection);
        noPositionId = ctf.getPositionId(IERC20(address(usdc)), noCollection);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Q1 — Loser redeem returns 0 (no revert)
    // ─────────────────────────────────────────────────────────────────────

    function test_LoserRedeemReturnsZero() public {
        // alice splits 100 USDC into 100 YES + 100 NO
        _mintAndSplit(alice, 100e6);

        // Resolve YES wins
        vm.warp(block.timestamp + 1 days);
        vm.prank(oracle);
        uint256[] memory payouts = new uint256[](2);
        payouts[0] = 1; // YES wins
        payouts[1] = 0; // NO loses
        ctf.reportPayouts(questionId, payouts);

        // alice redeems NO (loser) — should return 0, not revert
        uint256 balBefore = usdc.balanceOf(alice);
        uint256[] memory loserIndexSets = new uint256[](1);
        loserIndexSets[0] = 2; // NO

        vm.prank(alice);
        ctf.redeemPositions(IERC20(address(usdc)), bytes32(0), conditionId, loserIndexSets);

        assertEq(usdc.balanceOf(alice) - balBefore, 0, "loser redeem should yield 0 USDC");
        // The NO tokens should have been burned.
        assertEq(_balance1155(alice, noPositionId), 0, "NO tokens burned even on loser redeem");
    }

    // ─────────────────────────────────────────────────────────────────────
    // Q2 — Splitting allowed after resolution (technically; pointless econ.)
    // ─────────────────────────────────────────────────────────────────────

    function test_SplitAfterResolveAllowed() public {
        vm.warp(block.timestamp + 1 days);
        vm.prank(oracle);
        uint256[] memory payouts = new uint256[](2);
        payouts[0] = 1;
        payouts[1] = 0;
        ctf.reportPayouts(questionId, payouts);

        // After resolve, alice can still split (no revert)
        _mintAndSplit(alice, 50e6);

        // She got 50 YES (now redeemable for 50) + 50 NO (worth 0).
        assertEq(_balance1155(alice, yesPositionId), 50e6);
        assertEq(_balance1155(alice, noPositionId), 50e6);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Q3 / Q8 — Receiver hook fires on caller-side; contract caller without
    //            ERC-1155 receiver hook should revert
    // ─────────────────────────────────────────────────────────────────────

    function test_SplitFromContractWithReceiver_Succeeds() public {
        ContractWithReceiver caller = new ContractWithReceiver(address(ctf), address(usdc), conditionId);
        usdc.mint(address(caller), 100e6);
        caller.split(100e6);

        assertEq(_balance1155(address(caller), yesPositionId), 100e6);
        assertEq(_balance1155(address(caller), noPositionId), 100e6);
        assertTrue(caller.receivedHookFired(), "Q3: receiver hook should fire on caller");
    }

    function test_SplitFromContractWithoutReceiver_Reverts() public {
        ContractWithoutReceiver caller = new ContractWithoutReceiver(address(ctf), address(usdc), conditionId);
        usdc.mint(address(caller), 100e6);

        // Q8: ERC-1155 mint to a contract that doesn't implement
        // onERC1155BatchReceived must revert per ERC-1155 spec.
        vm.expectRevert();
        caller.split(100e6);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Q4 — Gas snapshots for split / merge / redeem (forge snapshot)
    // ─────────────────────────────────────────────────────────────────────

    function test_GasSnapshot_Split() public {
        usdc.mint(alice, 100e6);
        vm.prank(alice);
        usdc.approve(address(ctf), 100e6);

        uint256[] memory partition = new uint256[](2);
        partition[0] = 1;
        partition[1] = 2;

        vm.prank(alice);
        ctf.splitPosition(IERC20(address(usdc)), bytes32(0), conditionId, partition, 100e6);
        // forge snapshot will record gas; no assertion needed.
    }

    function test_GasSnapshot_Merge() public {
        _mintAndSplit(alice, 100e6);

        uint256[] memory partition = new uint256[](2);
        partition[0] = 1;
        partition[1] = 2;

        vm.prank(alice);
        ctf.mergePositions(IERC20(address(usdc)), bytes32(0), conditionId, partition, 100e6);
    }

    function test_GasSnapshot_Redeem_BothIndexSets() public {
        _mintAndSplit(alice, 100e6);
        _resolveYes();

        uint256[] memory both = new uint256[](2);
        both[0] = 1;
        both[1] = 2;

        vm.prank(alice);
        ctf.redeemPositions(IERC20(address(usdc)), bytes32(0), conditionId, both);
    }

    function test_GasSnapshot_Redeem_OnlyWinner() public {
        _mintAndSplit(alice, 100e6);
        _resolveYes();

        uint256[] memory yesOnly = new uint256[](1);
        yesOnly[0] = 1;

        vm.prank(alice);
        ctf.redeemPositions(IERC20(address(usdc)), bytes32(0), conditionId, yesOnly);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Q6 — prepareCondition idempotency: capture exact revert message
    // ─────────────────────────────────────────────────────────────────────

    function test_PrepareCondition_DoubleCallReverts() public {
        // setUp already prepared the condition. A second call should revert.
        vm.expectRevert(bytes("condition already prepared"));
        ctf.prepareCondition(oracle, questionId, 2);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Q9 — Compare redeem([1,2]) vs separate redeem([1]) + redeem([2]) gas
    //      (also exercised by snapshot tests above; this records both in
    //       a single test for direct comparison in test logs)
    // ─────────────────────────────────────────────────────────────────────

    function test_RedeemCombinedVsSeparate_Gas() public {
        // Path 1: combined
        _mintAndSplit(alice, 100e6);
        _resolveYes();

        uint256[] memory both = new uint256[](2);
        both[0] = 1;
        both[1] = 2;

        vm.prank(alice);
        uint256 gasBefore = gasleft();
        ctf.redeemPositions(IERC20(address(usdc)), bytes32(0), conditionId, both);
        uint256 combinedGas = gasBefore - gasleft();

        // Path 2: separate (fresh actor bob, fresh deployment via separate prep)
        bytes32 q2 = keccak256("Q2");
        ctf.prepareCondition(oracle, q2, 2);
        bytes32 cid2 = _conditionId(oracle, q2, 2);

        usdc.mint(bob, 100e6);
        vm.prank(bob);
        usdc.approve(address(ctf), 100e6);
        uint256[] memory partition = new uint256[](2);
        partition[0] = 1;
        partition[1] = 2;
        vm.prank(bob);
        ctf.splitPosition(IERC20(address(usdc)), bytes32(0), cid2, partition, 100e6);

        vm.prank(oracle);
        uint256[] memory payouts = new uint256[](2);
        payouts[0] = 1;
        payouts[1] = 0;
        ctf.reportPayouts(q2, payouts);

        uint256[] memory yesOnly = new uint256[](1);
        yesOnly[0] = 1;
        uint256[] memory noOnly = new uint256[](1);
        noOnly[0] = 2;

        vm.prank(bob);
        gasBefore = gasleft();
        ctf.redeemPositions(IERC20(address(usdc)), bytes32(0), cid2, yesOnly);
        uint256 sep1 = gasBefore - gasleft();

        vm.prank(bob);
        gasBefore = gasleft();
        ctf.redeemPositions(IERC20(address(usdc)), bytes32(0), cid2, noOnly);
        uint256 sep2 = gasBefore - gasleft();

        emit log_named_uint("redeem([1,2]) combined", combinedGas);
        emit log_named_uint("redeem([1]) + redeem([2]) separate-sum", sep1 + sep2);
        emit log_named_uint("  separate part 1 (winner)", sep1);
        emit log_named_uint("  separate part 2 (loser)", sep2);

        // The combined path should be cheaper (fewer fixed costs of two
        // separate top-level calls). Assert the directional finding.
        assertLt(combinedGas, sep1 + sep2, "combined redeem should be cheaper");
    }

    // ─────────────────────────────────────────────────────────────────────
    // End-to-end happy path (sanity)
    // ─────────────────────────────────────────────────────────────────────

    function test_FullCycle_YesWinsAndPaysFullCollateral() public {
        _mintAndSplit(alice, 100e6);
        _resolveYes();

        uint256 balBefore = usdc.balanceOf(alice);
        uint256[] memory both = new uint256[](2);
        both[0] = 1;
        both[1] = 2;
        vm.prank(alice);
        ctf.redeemPositions(IERC20(address(usdc)), bytes32(0), conditionId, both);

        // YES paid 1 USDC per token (100), NO paid 0 → total 100.
        assertEq(usdc.balanceOf(alice) - balBefore, 100e6);
    }

    // ─── Helpers ─────────────────────────────────────────────────────────

    function _mintAndSplit(address who, uint256 amount) internal {
        usdc.mint(who, amount);
        vm.prank(who);
        usdc.approve(address(ctf), amount);

        uint256[] memory partition = new uint256[](2);
        partition[0] = 1;
        partition[1] = 2;

        vm.prank(who);
        ctf.splitPosition(IERC20(address(usdc)), bytes32(0), conditionId, partition, amount);
    }

    function _resolveYes() internal {
        vm.warp(block.timestamp + 1 days);
        vm.prank(oracle);
        uint256[] memory payouts = new uint256[](2);
        payouts[0] = 1;
        payouts[1] = 0;
        ctf.reportPayouts(questionId, payouts);
    }

    function _conditionId(address _oracle, bytes32 _questionId, uint256 outcomeSlotCount)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(_oracle, _questionId, outcomeSlotCount));
    }

    function _balance1155(address holder, uint256 tokenId) internal view returns (uint256) {
        // ConditionalTokens IS an ERC-1155. Use the standard interface call.
        (bool ok, bytes memory data) = address(ctf).staticcall(
            abi.encodeWithSignature("balanceOf(address,uint256)", holder, tokenId)
        );
        require(ok, "balanceOf failed");
        return abi.decode(data, (uint256));
    }

    function _deployCTF() internal returns (address addr) {
        string memory artifactPath = "lib/ctf-exchange/artifacts/ConditionalTokens.json";
        string memory json = vm.readFile(artifactPath);
        bytes memory bytecode = vm.parseJsonBytes(json, ".bytecode.object");
        assembly {
            addr := create(0, add(bytecode, 0x20), mload(bytecode))
        }
        require(addr != address(0), "CTF deployment failed");
    }
}

// ─────────────────────────────────────────────────────────────────────────
// Helper contracts for Q3 / Q8: caller is a contract.
// ─────────────────────────────────────────────────────────────────────────

contract ContractWithReceiver {
    IConditionalTokens internal immutable ctf;
    IERC20 internal immutable collateral;
    bytes32 internal immutable conditionId;
    bool public receivedHookFired;

    constructor(address _ctf, address _collateral, bytes32 _conditionId) {
        ctf = IConditionalTokens(_ctf);
        collateral = IERC20(_collateral);
        conditionId = _conditionId;
    }

    function split(uint256 amount) external {
        collateral.approve(address(ctf), amount);
        uint256[] memory partition = new uint256[](2);
        partition[0] = 1;
        partition[1] = 2;
        ctf.splitPosition(collateral, bytes32(0), conditionId, partition, amount);
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external
        returns (bytes4)
    {
        receivedHookFired = true;
        return this.onERC1155BatchReceived.selector;
    }

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external returns (bytes4) {
        receivedHookFired = true;
        return this.onERC1155Received.selector;
    }
}

contract ContractWithoutReceiver {
    IConditionalTokens internal immutable ctf;
    IERC20 internal immutable collateral;
    bytes32 internal immutable conditionId;

    constructor(address _ctf, address _collateral, bytes32 _conditionId) {
        ctf = IConditionalTokens(_ctf);
        collateral = IERC20(_collateral);
        conditionId = _conditionId;
    }

    function split(uint256 amount) external {
        collateral.approve(address(ctf), amount);
        uint256[] memory partition = new uint256[](2);
        partition[0] = 1;
        partition[1] = 2;
        // No onERC1155*Received implemented — must revert per ERC-1155 spec.
        ctf.splitPosition(collateral, bytes32(0), conditionId, partition, amount);
    }
}
