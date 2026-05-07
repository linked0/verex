// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/MarketFactory.sol";
import "../src/Market.sol";

contract MarketFactoryTest is Test {
    MarketFactory factory;
    address owner = makeAddr("owner");
    address alice = makeAddr("alice");

    function setUp() public {
        factory = new MarketFactory(owner);
    }

    function test_CreateMarket_DeploysAndRegisters() public {
        uint256 endTime = block.timestamp + 1 days;

        vm.prank(alice);
        address marketAddr = factory.createMarket("Q1", endTime);

        assertEq(factory.marketCount(), 1);
        assertEq(factory.markets(0), marketAddr);

        Market m = Market(marketAddr);
        assertEq(m.question(), "Q1");
        assertEq(m.endTime(), endTime);
        assertEq(m.owner(), owner, "factory owner becomes market owner");
    }

    function test_CreateMarket_PermissionlessCreation() public {
        // Anyone can create — no onlyOwner gate on factory.createMarket
        vm.prank(alice);
        factory.createMarket("Q1", block.timestamp + 1 days);

        vm.prank(makeAddr("randomUser"));
        factory.createMarket("Q2", block.timestamp + 2 days);

        assertEq(factory.marketCount(), 2);
    }

    function test_GetMarkets_ReturnsAll() public {
        vm.prank(alice);
        address m1 = factory.createMarket("Q1", block.timestamp + 1 days);
        vm.prank(alice);
        address m2 = factory.createMarket("Q2", block.timestamp + 2 days);
        vm.prank(alice);
        address m3 = factory.createMarket("Q3", block.timestamp + 3 days);

        address[] memory all = factory.getMarkets();
        assertEq(all.length, 3);
        assertEq(all[0], m1);
        assertEq(all[1], m2);
        assertEq(all[2], m3);
    }

    function test_RevertWhen_PastEndTime() public {
        vm.expectRevert("endTime must be future");
        factory.createMarket("Q", block.timestamp);
    }

    function test_RevertWhen_OwnerZeroOnConstruction() public {
        vm.expectRevert("owner zero");
        new MarketFactory(address(0));
    }

    function test_MarketCreatedEvent() public {
        uint256 endTime = block.timestamp + 1 days;

        vm.recordLogs();
        vm.prank(alice);
        address marketAddr = factory.createMarket("event-test", endTime);

        Vm.Log[] memory logs = vm.getRecordedLogs();
        // Find the MarketCreated event from the factory
        bytes32 sig = keccak256("MarketCreated(address,address,string,uint256)");
        bool found;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].emitter == address(factory) && logs[i].topics[0] == sig) {
                assertEq(address(uint160(uint256(logs[i].topics[1]))), marketAddr);
                assertEq(address(uint160(uint256(logs[i].topics[2]))), alice);
                found = true;
                break;
            }
        }
        assertTrue(found, "MarketCreated event not emitted");
    }
}
