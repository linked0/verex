// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/Market.sol";

contract MarketTest is Test {
    Market market;
    address owner = makeAddr("owner");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");

    uint256 constant ONE_DAY = 1 days;
    uint256 endTime;

    function setUp() public {
        endTime = block.timestamp + ONE_DAY;
        market = new Market("Will ETH hit $10k by 2027?", endTime, owner);
    }

    // ─── Plan-required test 1: 양쪽 베팅 후 resolve → winner만 분배 ───

    function test_BothSidesBet_WinnerGetsAllPool() public {
        _bet(alice, true, 1 ether);
        _bet(bob, false, 1 ether);

        vm.warp(endTime);
        vm.prank(owner);
        market.resolve(true); // YES wins

        uint256 aliceBefore = alice.balance;
        uint256 bobBefore = bob.balance;

        vm.prank(alice);
        market.claim();
        vm.prank(bob);
        market.claim();

        // Alice (YES winner) gets entire pool, Bob (NO loser) gets nothing
        assertEq(alice.balance - aliceBefore, 2 ether, "alice should get full pool");
        assertEq(bob.balance - bobBefore, 0, "bob should get nothing");
    }

    function test_MultipleWinners_ProRataDistribution() public {
        _bet(alice, true, 3 ether); // 75% of YES pool
        _bet(carol, true, 1 ether); // 25% of YES pool
        _bet(bob, false, 4 ether);

        vm.warp(endTime);
        vm.prank(owner);
        market.resolve(true);

        uint256 aliceBefore = alice.balance;
        uint256 carolBefore = carol.balance;

        vm.prank(alice);
        market.claim();
        vm.prank(carol);
        market.claim();

        // Total pool = 8 ether. Alice 3/4, Carol 1/4
        assertEq(alice.balance - aliceBefore, 6 ether, "alice 75% of pool");
        assertEq(carol.balance - carolBefore, 2 ether, "carol 25% of pool");
    }

    // ─── Plan-required test 2: endTime 이후 베팅 실패 ───

    function test_RevertWhen_BuyAfterEndTime() public {
        vm.warp(endTime);

        vm.deal(alice, 1 ether);
        vm.expectRevert("market closed");
        vm.prank(alice);
        market.buyYes{value: 1 ether}();

        vm.expectRevert("market closed");
        vm.prank(alice);
        market.buyNo{value: 1 ether}();
    }

    // ─── Plan-required test 3: 같은 market 중복 resolve 실패 ───

    function test_RevertWhen_DoubleResolve() public {
        vm.warp(endTime);
        vm.prank(owner);
        market.resolve(true);

        vm.expectRevert("already resolved");
        vm.prank(owner);
        market.resolve(false);

        vm.expectRevert("already resolved");
        vm.prank(owner);
        market.resolve(true);
    }

    // ─── Plan-required test 4: loser claim 시 0 반환 (revert 아님) ───

    function test_LoserClaimReturnsZeroNoRevert() public {
        _bet(alice, true, 1 ether);
        _bet(bob, false, 1 ether);

        vm.warp(endTime);
        vm.prank(owner);
        market.resolve(true); // YES wins; bob is loser

        uint256 bobBefore = bob.balance;

        vm.prank(bob);
        uint256 payout = market.claim();

        assertEq(payout, 0, "loser payout should be 0");
        assertEq(bob.balance - bobBefore, 0, "loser balance unchanged");
        // No revert is the assertion itself — if we reach here, the test passes
    }

    // ─── Plan-required test 5: invariant — 총 escrow == YES pool + NO pool (resolve 전) ───

    function test_Invariant_BalanceEqualsPoolsBeforeResolve() public {
        _bet(alice, true, 1 ether);
        assertEq(address(market).balance, market.yesPool() + market.noPool());

        _bet(bob, false, 2 ether);
        assertEq(address(market).balance, market.yesPool() + market.noPool());

        _bet(alice, true, 0.5 ether);
        _bet(carol, false, 0.7 ether);
        assertEq(address(market).balance, market.yesPool() + market.noPool());
        assertEq(address(market).balance, 4.2 ether);
    }

    // ─── Additional sanity tests ───

    function test_RevertWhen_NonOwnerResolves() public {
        vm.warp(endTime);
        vm.expectRevert("not owner");
        vm.prank(alice);
        market.resolve(true);
    }

    function test_RevertWhen_ResolveBeforeEndTime() public {
        vm.expectRevert("market not ended");
        vm.prank(owner);
        market.resolve(true);
    }

    function test_RevertWhen_ClaimBeforeResolve() public {
        _bet(alice, true, 1 ether);
        vm.expectRevert("not resolved");
        vm.prank(alice);
        market.claim();
    }

    function test_RevertWhen_ZeroBet() public {
        vm.prank(alice);
        vm.expectRevert("zero amount");
        market.buyYes{value: 0}();
    }

    function test_DoubleClaimReturnsZeroSecondTime() public {
        _bet(alice, true, 1 ether);
        _bet(bob, false, 1 ether);

        vm.warp(endTime);
        vm.prank(owner);
        market.resolve(true);

        vm.prank(alice);
        uint256 firstPayout = market.claim();
        assertEq(firstPayout, 2 ether);

        vm.prank(alice);
        uint256 secondPayout = market.claim();
        assertEq(secondPayout, 0, "second claim should yield nothing");
    }

    // ─── Helpers ───

    function _bet(address user, bool isYes, uint256 amount) internal {
        vm.deal(user, user.balance + amount);
        vm.prank(user);
        if (isYes) {
            market.buyYes{value: amount}();
        } else {
            market.buyNo{value: amount}();
        }
    }
}
