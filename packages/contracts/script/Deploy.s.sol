// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/MarketFactory.sol";

/// @notice Deploy MarketFactory to anvil (or any EVM chain). The factory's owner
///         becomes the global resolver for every Market it spawns.
///
/// Run on anvil (the script reads VEREX_OPERATOR_KEY from the environment
/// itself via vm.envOr — forge's own --private-key CLI flag is not read here):
///   anvil &
///   forge script script/Deploy.s.sol --rpc-url http://localhost:8545 --broadcast
///
/// Unset VEREX_OPERATOR_KEY falls back to anvil's default account[0] key —
/// DO NOT rely on that fallback on any network other than a local anvil node.
contract Deploy is Script {
    function run() external returns (MarketFactory factory) {
        uint256 deployerKey = vm.envOr("VEREX_OPERATOR_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);
        factory = new MarketFactory(deployer);
        vm.stopBroadcast();

        console.log("MarketFactory deployed at:", address(factory));
        console.log("Owner (resolver):", deployer);
    }
}
