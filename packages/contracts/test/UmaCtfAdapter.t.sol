// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {IERC20} from "openzeppelin-contracts/token/ERC20/IERC20.sol";
import {IConditionalTokens} from "ctf-exchange/exchange/interfaces/IConditionalTokens.sol";

import {MockUSDC} from "../src/MockUSDC.sol";
import {UmaCtfAdapter} from "../src/UmaCtfAdapter.sol";
import {IOptimisticOracleV2} from "../src/interfaces/IOptimisticOracleV2.sol";

/// @notice Stand-in for UMA's OptimisticOracleV2.
/// @dev Reproduces the behaviours the adapter actually depends on: a request
///      cannot be settled before liveness expires, a settled request returns the
///      proposed price, and `getState` reports Expired during the window in
///      which settling is possible while `settled` is still false. That last
///      one is modelled deliberately — an earlier version of this mock let
///      `settled` stand in for "ready", which made isSettled() look usable as a
///      pre-check when against the real oracle it can never be true before
///      resolving. Verified against Sepolia's OO (state 3 = Expired, settled
///      false) in packages/api/scripts/uma-e2e-fork.ts.
///
///      Everything else (bonds moving, disputes escalating to the DVM) is
///      UMA's business, not the adapter's.
contract MockOptimisticOracleV2 {
    uint256 public constant DEFAULT_LIVENESS = 7200;

    struct Req {
        bool requested;
        bool settled;
        int256 proposedPrice;
        uint256 expirationTime;
        uint256 bond;
        address currency;
        uint256 reward;
    }

    mapping(bytes32 => Req) public reqs;

    function _key(address requester, bytes32 identifier, uint256 timestamp, bytes memory ancillaryData)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(requester, identifier, timestamp, ancillaryData));
    }

    function requestPrice(
        bytes32 identifier,
        uint256 timestamp,
        bytes memory ancillaryData,
        address currency,
        uint256 reward
    ) external returns (uint256) {
        bytes32 k = _key(msg.sender, identifier, timestamp, ancillaryData);
        require(!reqs[k].requested, "already requested");
        reqs[k] = Req({
            requested: true,
            settled: false,
            proposedPrice: 0,
            expirationTime: type(uint256).max, // no proposal yet
            bond: 0,
            currency: currency,
            reward: reward
        });
        return 0;
    }

    function setBond(bytes32 identifier, uint256 timestamp, bytes memory ancillaryData, uint256 bond)
        external
        returns (uint256)
    {
        bytes32 k = _key(msg.sender, identifier, timestamp, ancillaryData);
        require(reqs[k].requested, "no request");
        reqs[k].bond = bond;
        return bond;
    }

    function setCustomLiveness(bytes32, uint256, bytes memory, uint256) external pure {
        // Liveness only matters here through `propose`, which the test drives.
    }

    /// @dev Test-only: a proposer answers, starting the challenge window.
    function propose(
        address requester,
        bytes32 identifier,
        uint256 timestamp,
        bytes memory ancillaryData,
        int256 price,
        uint256 liveness
    ) external {
        bytes32 k = _key(requester, identifier, timestamp, ancillaryData);
        require(reqs[k].requested, "no request");
        reqs[k].proposedPrice = price;
        reqs[k].expirationTime = block.timestamp + (liveness == 0 ? DEFAULT_LIVENESS : liveness);
    }

    function settleAndGetPrice(bytes32 identifier, uint256 timestamp, bytes memory ancillaryData)
        external
        returns (int256)
    {
        bytes32 k = _key(msg.sender, identifier, timestamp, ancillaryData);
        Req storage r = reqs[k];
        require(r.requested, "no request");
        // The real OO reverts here too — this is what stops the adapter from
        // resolving a market before anyone has had a chance to dispute.
        require(block.timestamp >= r.expirationTime, "not settleable");
        r.settled = true;
        return r.proposedPrice;
    }

    function getRequest(address requester, bytes32 identifier, uint256 timestamp, bytes memory ancillaryData)
        external
        view
        returns (IOptimisticOracleV2.Request memory out)
    {
        Req storage r = reqs[_key(requester, identifier, timestamp, ancillaryData)];
        out.settled = r.settled;
        out.proposedPrice = r.proposedPrice;
        out.expirationTime = r.expirationTime;
        out.bond = r.bond;
        out.currency = r.currency;
        out.reward = r.reward;
    }

    function getState(address requester, bytes32 identifier, uint256 timestamp, bytes memory ancillaryData)
        external
        view
        returns (IOptimisticOracleV2.State)
    {
        Req storage r = reqs[_key(requester, identifier, timestamp, ancillaryData)];
        if (!r.requested) return IOptimisticOracleV2.State.Invalid;
        if (r.settled) return IOptimisticOracleV2.State.Settled;
        if (r.expirationTime == type(uint256).max) return IOptimisticOracleV2.State.Requested;
        if (block.timestamp < r.expirationTime) return IOptimisticOracleV2.State.Proposed;
        return IOptimisticOracleV2.State.Expired;
    }
}

contract UmaCtfAdapterTest is Test {
    IConditionalTokens internal ctf;
    MockOptimisticOracleV2 internal oo;
    MockUSDC internal usdc; // collateral for the CTF condition
    MockUSDC internal weth; // stands in for the whitelisted bond currency
    UmaCtfAdapter internal adapter;

    address internal admin = makeAddr("admin");
    address internal alice = makeAddr("alice");
    address internal randomCaller = makeAddr("randomCaller");

    bytes internal ancillary = bytes(
        "q: Will ETH close above $10,000 on 2026-12-31 UTC?"
        " res_data: p1: 0 (No), p2: 1 (Yes), p3: 0.5 (Unresolvable)."
        " Resolution source: Coinbase ETH-USD daily close."
    );

    int256 internal constant YES = 1 ether;
    int256 internal constant NO = 0;
    int256 internal constant UNRESOLVABLE = 0.5 ether;

    function setUp() public {
        ctf = IConditionalTokens(_deployCTF());
        oo = new MockOptimisticOracleV2();
        usdc = new MockUSDC();
        weth = new MockUSDC();
        adapter = new UmaCtfAdapter(address(ctf), address(oo), admin);
    }

    // ── initialize ──────────────────────────────────────────────────────

    function test_InitializePreparesConditionOwnedByAdapter() public {
        vm.prank(admin);
        (bytes32 questionId, bytes32 conditionId) = adapter.initialize(ancillary, address(weth), 0, 1 ether, 60);

        assertEq(questionId, keccak256(ancillary), "questionId is the ancillary hash");

        // The adapter — not the operator — is hashed into the market's identity.
        assertEq(
            conditionId,
            keccak256(abi.encodePacked(address(adapter), questionId, uint256(2))),
            "adapter must be the oracle in the conditionId"
        );
        // CTF agrees the condition exists with 2 slots.
        assertEq(ctf.getOutcomeSlotCount(conditionId), 2, "condition prepared on CTF");
    }

    function test_InitializeIsAdminOnly() public {
        vm.prank(alice);
        vm.expectRevert(UmaCtfAdapter.NotAdmin.selector);
        adapter.initialize(ancillary, address(weth), 0, 1 ether, 60);
    }

    function test_InitializeRejectsEmptyAncillaryData() public {
        vm.prank(admin);
        vm.expectRevert(UmaCtfAdapter.InvalidAncillaryData.selector);
        adapter.initialize("", address(weth), 0, 1 ether, 60);
    }

    function test_InitializeTwiceReverts() public {
        vm.startPrank(admin);
        adapter.initialize(ancillary, address(weth), 0, 1 ether, 60);
        vm.expectRevert(UmaCtfAdapter.AlreadyInitialized.selector);
        adapter.initialize(ancillary, address(weth), 0, 1 ether, 60);
        vm.stopPrank();
    }

    // ── resolve ─────────────────────────────────────────────────────────

    function test_ResolveYesReportsWinningPayouts() public {
        bytes32 questionId = _initAndPropose(YES, 60);
        vm.warp(block.timestamp + 61);

        adapter.resolve(questionId);

        bytes32 conditionId = keccak256(abi.encodePacked(address(adapter), questionId, uint256(2)));
        assertEq(ctf.payoutNumerators(conditionId, 0), 1, "YES pays");
        assertEq(ctf.payoutNumerators(conditionId, 1), 0, "NO does not");
    }

    function test_ResolveNoReportsLosingPayouts() public {
        bytes32 questionId = _initAndPropose(NO, 60);
        vm.warp(block.timestamp + 61);

        adapter.resolve(questionId);

        bytes32 conditionId = keccak256(abi.encodePacked(address(adapter), questionId, uint256(2)));
        assertEq(ctf.payoutNumerators(conditionId, 0), 0, "YES does not pay");
        assertEq(ctf.payoutNumerators(conditionId, 1), 1, "NO pays");
    }

    /// @dev The case worth being deliberate about: an unanswerable question
    ///      splits the pot rather than handing it to one side.
    function test_ResolveUnresolvableSplitsEvenly() public {
        bytes32 questionId = _initAndPropose(UNRESOLVABLE, 60);
        vm.warp(block.timestamp + 61);

        adapter.resolve(questionId);

        bytes32 conditionId = keccak256(abi.encodePacked(address(adapter), questionId, uint256(2)));
        assertEq(ctf.payoutNumerators(conditionId, 0), 1, "YES half");
        assertEq(ctf.payoutNumerators(conditionId, 1), 1, "NO half");
    }

    /// @dev The whole point of the optimistic model: nothing resolves until the
    ///      challenge window has passed.
    function test_ResolveBeforeLivenessReverts() public {
        bytes32 questionId = _initAndPropose(YES, 60);
        vm.expectRevert(bytes("not settleable"));
        adapter.resolve(questionId);
    }

    function test_ResolveIsPermissionless() public {
        bytes32 questionId = _initAndPropose(YES, 60);
        vm.warp(block.timestamp + 61);

        // Anyone may push the settled answer through — an absent operator must
        // not be able to strand payouts.
        vm.prank(randomCaller);
        adapter.resolve(questionId);

        assertTrue(adapter.getQuestion(questionId).resolved, "resolved by a stranger");
    }

    function test_ResolveTwiceReverts() public {
        bytes32 questionId = _initAndPropose(YES, 60);
        vm.warp(block.timestamp + 61);
        adapter.resolve(questionId);

        vm.expectRevert(UmaCtfAdapter.AlreadyResolved.selector);
        adapter.resolve(questionId);
    }

    // ── isSettleable ────────────────────────────────────────────────────
    //
    // These exist because the first version of this check read the request's
    // `settled` flag instead of its state. Against the real oracle that flag is
    // false for the entire window in which resolving is possible and only flips
    // as a side effect of resolving — so gating on it made resolve unreachable.
    // The bug survived a green mock and was caught only against Sepolia's live
    // OO. The assertions below are the ones that would have caught it here.

    function test_IsSettleableFalseBeforeAProposal() public {
        vm.prank(admin);
        (bytes32 questionId,) = adapter.initialize(ancillary, address(weth), 0, 1 ether, 60);
        assertFalse(adapter.isSettleable(questionId), "nothing proposed yet");
    }

    function test_IsSettleableFalseDuringLiveness() public {
        bytes32 questionId = _initAndPropose(YES, 60);
        vm.warp(block.timestamp + 30);
        assertFalse(adapter.isSettleable(questionId), "challenge window still open");
    }

    /// The regression: true AFTER liveness but BEFORE anyone resolves. This is
    /// exactly the window `settled` reports as false.
    function test_IsSettleableTrueAfterLivenessBeforeResolve() public {
        bytes32 questionId = _initAndPropose(YES, 60);
        vm.warp(block.timestamp + 61);

        assertTrue(adapter.isSettleable(questionId), "expired and undisputed = ready");
        // And it must agree with reality: resolve succeeds from this state.
        adapter.resolve(questionId);
    }

    function test_IsSettleableFalseOnceResolved() public {
        bytes32 questionId = _initAndPropose(YES, 60);
        vm.warp(block.timestamp + 61);
        adapter.resolve(questionId);
        assertFalse(adapter.isSettleable(questionId), "already copied on-chain");
    }

    function test_IsSettleableFalseForUnknownQuestion() public view {
        assertFalse(adapter.isSettleable(keccak256("never initialized")), "unknown question");
    }

    function test_ResolveUninitializedReverts() public {
        vm.expectRevert(UmaCtfAdapter.NotInitialized.selector);
        adapter.resolve(keccak256("never initialised"));
    }

    /// @dev UMA can return any int256. Anything outside the three defined
    ///      answers must revert rather than be coerced into a payout nobody
    ///      voted for.
    function test_ResolveUnsupportedPriceReverts() public {
        bytes32 questionId = _initAndPropose(0.25 ether, 60);
        vm.warp(block.timestamp + 61);

        vm.expectRevert(abi.encodeWithSelector(UmaCtfAdapter.UnsupportedPrice.selector, int256(0.25 ether)));
        adapter.resolve(questionId);
    }

    function testFuzz_ResolveOnlyAcceptsDefinedAnswers(int256 price) public {
        vm.assume(price != YES && price != NO && price != UNRESOLVABLE);
        bytes32 questionId = _initAndPropose(price, 60);
        vm.warp(block.timestamp + 61);

        vm.expectRevert(abi.encodeWithSelector(UmaCtfAdapter.UnsupportedPrice.selector, price));
        adapter.resolve(questionId);
    }

    // ── end to end ──────────────────────────────────────────────────────

    /// @dev Money actually moves: split collateral, resolve through UMA, redeem.
    function test_FullLifecycleRedeemsAgainstUmaAnswer() public {
        bytes32 questionId = _initAndPropose(YES, 60);
        bytes32 conditionId = keccak256(abi.encodePacked(address(adapter), questionId, uint256(2)));

        usdc.mint(alice, 100e6);
        vm.startPrank(alice);
        usdc.approve(address(ctf), 100e6);
        uint256[] memory partition = new uint256[](2);
        partition[0] = 1; // YES
        partition[1] = 2; // NO
        ctf.splitPosition(IERC20(address(usdc)), bytes32(0), conditionId, partition, 100e6);
        vm.stopPrank();

        assertEq(usdc.balanceOf(alice), 0, "collateral locked");

        vm.warp(block.timestamp + 61);
        adapter.resolve(questionId);

        uint256[] memory winner = new uint256[](1);
        winner[0] = 1; // YES
        vm.prank(alice);
        ctf.redeemPositions(IERC20(address(usdc)), bytes32(0), conditionId, winner);

        assertEq(usdc.balanceOf(alice), 100e6, "winning side redeems the full pot");
    }

    // ── helpers ─────────────────────────────────────────────────────────

    function _initAndPropose(int256 price, uint256 liveness) internal returns (bytes32 questionId) {
        vm.prank(admin);
        (questionId,) = adapter.initialize(ancillary, address(weth), 0, 1 ether, liveness);
        oo.propose(address(adapter), adapter.YES_OR_NO_QUERY(), block.timestamp, ancillary, price, liveness);
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
