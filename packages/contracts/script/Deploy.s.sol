// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/MarketFactory.sol";

/// @notice Deploy MarketFactory to anvil (or any EVM chain). The factory's owner
///         becomes the global resolver for every Market it spawns.
///
/// Run on anvil:
///   anvil &
///   forge script script/Deploy.s.sol \
///     --rpc-url http://localhost:8545 \
///     --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
///     --broadcast
///
/// (The private key above is anvil's default account[0] — DO NOT use on mainnet.)
contract Deploy is Script {
    function run() external returns (MarketFactory factory) {
        uint256 deployerKey = vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);
        factory = new MarketFactory(deployer);
        vm.stopBroadcast();

        console.log("MarketFactory deployed at:", address(factory));
        console.log("Owner (resolver):", deployer);
    }
}
