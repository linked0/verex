// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/Market.sol";

contract MarketTest is Test {
    Market market;
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public {
        market = new Market();
    }

    function test_CreateMarket() public {
        uint256 endTime = block.timestamp + 1 days;
        uint256 id = market.createMarket("Will ETH hit $10k?", endTime);
        assertEq(id, 0);
        (string memory q,,,,,) = market.markets(0);
        assertEq(q, "Will ETH hit $10k?");
    }

    function test_BuyShares() public {
        uint256 id = market.createMarket("Will ETH hit $10k?", block.timestamp + 1 days);
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        market.buyShares{value: 1 ether}(id, true);
        assertEq(market.yesBalances(id, alice), 1 ether);
    }

    function test_SettleAndClaim() public {
        uint256 end = block.timestamp + 1 days;
        uint256 id = market.createMarket("Will ETH hit $10k?", end);

        vm.deal(alice, 1 ether);
        vm.prank(alice);
        market.buyShares{value: 1 ether}(id, true);

        vm.deal(bob, 1 ether);
        vm.prank(bob);
        market.buyShares{value: 1 ether}(id, false);

        vm.warp(end + 1);
        market.settleMarket(id, Market.Outcome.Yes);

        uint256 before = alice.balance;
        vm.prank(alice);
        market.claimWinnings(id);
        assertEq(alice.balance - before, 2 ether);
    }
}
