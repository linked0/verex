// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {IConditionalTokens} from "ctf-exchange/exchange/interfaces/IConditionalTokens.sol";

import {MockUSDC} from "../src/MockUSDC.sol";
import {UmaCtfAdapter} from "../src/UmaCtfAdapter.sol";
import {MockOptimisticOracleV2} from "../src/MockOptimisticOracleV2.sol";
import {IOptimisticOracleV2} from "../src/interfaces/IOptimisticOracleV2.sol";

/// @notice The three dispute scenarios, end to end through the UNCHANGED
///         adapter: dispute defeated, dispute upheld, dispute as dead end.
///         The demo wallets are the jury — that is the whole point of the mock.
contract MockOptimisticOracleTest is Test {
    IConditionalTokens internal ctf;
    MockOptimisticOracleV2 internal oo;
    MockUSDC internal usdc;
    UmaCtfAdapter internal adapter;

    address internal operator = makeAddr("operator"); // proposer, adapter admin
    address internal wallet1 = makeAddr("wallet1"); // the disputer
    address internal wallet2 = makeAddr("wallet2");
    address internal wallet3 = makeAddr("wallet3");
    address internal wallet4 = makeAddr("wallet4");
    address internal wallet5 = makeAddr("wallet5");

    bytes internal ancillary = bytes(
        "q: Will ETH close above $6,000 in 2026?"
        " res_data: p1: 0 (No), p2: 1 (Yes), p3: 0.5 (Unresolvable)."
        " Resolution source: Coinbase ETH-USD daily close."
    );

    int256 internal constant YES = 1 ether;
    int256 internal constant NO = 0;
    int256 internal constant UNRESOLVABLE = 0.5 ether;
    uint256 internal constant BOND = 10e6; // 10 USDC
    uint256 internal constant LIVENESS = 3600;

    bytes32 internal questionId;
    uint256 internal requestTimestamp;

    function setUp() public {
        ctf = IConditionalTokens(_deployCTF());
        oo = new MockOptimisticOracleV2();
        usdc = new MockUSDC();
        adapter = new UmaCtfAdapter(address(ctf), address(oo), operator);

        // Everyone who might post a bond holds and approves the currency.
        address[6] memory all = [operator, wallet1, wallet2, wallet3, wallet4, wallet5];
        for (uint256 i = 0; i < all.length; i++) {
            usdc.mint(all[i], 100e6);
            vm.prank(all[i]);
            usdc.approve(address(oo), type(uint256).max);
        }

        vm.prank(operator);
        (questionId,) = adapter.initialize(ancillary, address(usdc), 0, BOND, LIVENESS);
        requestTimestamp = adapter.getQuestion(questionId).requestTimestamp;
    }

    // ── scenario 1: dispute defeated — the jury sides with the proposer ────

    function test_Scenario1_DisputeDefeated() public {
        _propose(YES);
        _dispute();

        // wallet #1 votes its own dispute, #2–#5 back the proposer.
        _vote(wallet1, NO);
        _vote(wallet2, YES);
        _vote(wallet3, YES);
        _vote(wallet4, YES);
        _vote(wallet5, YES);
        oo.finalizeVote(address(adapter), _id(), requestTimestamp, ancillary);

        assertTrue(adapter.isSettleable(questionId), "verdict in => settleable");
        adapter.resolve(questionId);

        // YES won: payout vector [1, 0].
        bytes32 conditionId = keccak256(abi.encodePacked(address(adapter), questionId, uint256(2)));
        assertEq(ctf.payoutNumerators(conditionId, 0), 1);
        assertEq(ctf.payoutNumerators(conditionId, 1), 0);

        // Proposer takes the disputer's whole bond; the disputer paid for being wrong.
        assertEq(usdc.balanceOf(operator), 100e6 + BOND, "proposer wins the disputer's bond");
        assertEq(usdc.balanceOf(wallet1), 100e6 - BOND, "disputer loses its bond");
    }

    // ── scenario 2: dispute upheld — the jury overturns the proposal ───────

    function test_Scenario2_DisputeUpheld() public {
        _propose(YES);
        _dispute();

        _vote(wallet1, NO);
        _vote(wallet2, NO);
        _vote(wallet3, NO);
        _vote(wallet4, YES);
        _vote(wallet5, NO);
        oo.finalizeVote(address(adapter), _id(), requestTimestamp, ancillary);

        adapter.resolve(questionId);

        // The verdict flipped the answer: payout vector [0, 1].
        bytes32 conditionId = keccak256(abi.encodePacked(address(adapter), questionId, uint256(2)));
        assertEq(ctf.payoutNumerators(conditionId, 0), 0);
        assertEq(ctf.payoutNumerators(conditionId, 1), 1);

        // Fortunes reversed: disputer takes the proposer's bond.
        assertEq(usdc.balanceOf(operator), 100e6 - BOND, "proposer loses its bond");
        assertEq(usdc.balanceOf(wallet1), 100e6 + BOND, "disputer wins the proposer's bond");
    }

    // ── scenario 3: dispute as dead end — no jury, frozen forever ──────────

    function test_Scenario3_DisputeDeadEnd() public {
        _propose(YES);
        _dispute();

        // Liveness passing does NOT unfreeze a disputed request — this is the
        // exact state a real-oracle dispute leaves a market in on Sepolia.
        vm.warp(block.timestamp + LIVENESS + 1);
        assertFalse(adapter.isSettleable(questionId), "disputed => not settleable, even past liveness");
        vm.expectRevert(
            abi.encodeWithSelector(MockOptimisticOracleV2.WrongState.selector, IOptimisticOracleV2.State.Disputed)
        );
        adapter.resolve(questionId);
    }

    // ── the tie: verdict is 'unresolvable', both sides redeem half ─────────

    function test_TieSettlesUnresolvable() public {
        _propose(YES);
        _dispute();

        _vote(wallet2, YES);
        _vote(wallet3, NO);
        oo.finalizeVote(address(adapter), _id(), requestTimestamp, ancillary);

        adapter.resolve(questionId);

        bytes32 conditionId = keccak256(abi.encodePacked(address(adapter), questionId, uint256(2)));
        assertEq(ctf.payoutNumerators(conditionId, 0), 1, "unresolvable pays both sides");
        assertEq(ctf.payoutNumerators(conditionId, 1), 1, "unresolvable pays both sides");

        // Unresolvable != the proposed price, so the disputer counts as winner.
        assertEq(usdc.balanceOf(wallet1), 100e6 + BOND);
    }

    // ── the undisputed path still works: expiry pays the proposer back ─────

    function test_UndisputedExpiryRefundsProposerBond() public {
        _propose(YES);
        vm.warp(block.timestamp + LIVENESS + 1);

        adapter.resolve(questionId);
        assertEq(usdc.balanceOf(operator), 100e6, "bond comes home on an honest, unchallenged proposal");
    }

    // ── guards ─────────────────────────────────────────────────────────────

    function test_VoteBeforeDisputeReverts() public {
        _propose(YES);
        vm.prank(wallet2);
        vm.expectRevert(
            abi.encodeWithSelector(MockOptimisticOracleV2.WrongState.selector, IOptimisticOracleV2.State.Proposed)
        );
        oo.vote(address(adapter), _id(), requestTimestamp, ancillary, YES);
    }

    function test_DoubleVoteReverts() public {
        _propose(YES);
        _dispute();
        _vote(wallet2, YES);
        vm.prank(wallet2);
        vm.expectRevert(MockOptimisticOracleV2.AlreadyVoted.selector);
        oo.vote(address(adapter), _id(), requestTimestamp, ancillary, NO);
    }

    function test_FinalizeWithoutBallotsReverts() public {
        _propose(YES);
        _dispute();
        vm.expectRevert(MockOptimisticOracleV2.NoBallots.selector);
        oo.finalizeVote(address(adapter), _id(), requestTimestamp, ancillary);
    }

    function test_DisputeAfterExpiryReverts() public {
        _propose(YES);
        vm.warp(block.timestamp + LIVENESS + 1);
        vm.prank(wallet1);
        vm.expectRevert(
            abi.encodeWithSelector(MockOptimisticOracleV2.WrongState.selector, IOptimisticOracleV2.State.Expired)
        );
        oo.disputePrice(address(adapter), _id(), requestTimestamp, ancillary);
    }

    function test_BallotsAreReadable() public {
        _propose(YES);
        _dispute();
        _vote(wallet2, YES);
        _vote(wallet3, NO);

        (address[] memory voters, int256[] memory answers) =
            oo.getBallots(address(adapter), _id(), requestTimestamp, ancillary);
        assertEq(voters.length, 2);
        assertEq(voters[0], wallet2);
        assertEq(answers[0], YES);
        assertEq(voters[1], wallet3);
        assertEq(answers[1], NO);
    }

    // ── helpers ────────────────────────────────────────────────────────────

    /// @dev A constant, NOT `adapter.YES_OR_NO_QUERY()` — a helper that makes
    ///      an external call would silently consume the caller's `vm.prank`.
    function _id() internal pure returns (bytes32) {
        return "YES_OR_NO_QUERY";
    }

    function _propose(int256 price) internal {
        vm.prank(operator);
        oo.proposePrice(address(adapter), _id(), requestTimestamp, ancillary, price);
    }

    function _dispute() internal {
        vm.prank(wallet1);
        oo.disputePrice(address(adapter), _id(), requestTimestamp, ancillary);
    }

    function _vote(address who, int256 answer) internal {
        vm.prank(who);
        oo.vote(address(adapter), _id(), requestTimestamp, ancillary, answer);
    }

    function _deployCTF() internal returns (address addr) {
        string memory json = vm.readFile("lib/ctf-exchange/artifacts/ConditionalTokens.json");
        bytes memory bytecode = vm.parseJsonBytes(json, ".bytecode.object");
        assembly {
            addr := create(0, add(bytecode, 0x20), mload(bytecode))
        }
        require(addr != address(0), "CTF deployment failed");
    }
}
