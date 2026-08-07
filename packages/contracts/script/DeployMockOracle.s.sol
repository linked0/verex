// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {MockOptimisticOracleV2} from "../src/MockOptimisticOracleV2.sol";
import {UmaCtfAdapter} from "../src/UmaCtfAdapter.sol";

/// @notice Deploy the demo oracle stack: MockOptimisticOracleV2 plus a
///         UmaCtfAdapter bound to it.
///
/// @dev The adapter here is the SAME contract that runs against the real UMA
///      oracle — only its constructor argument differs. That is deliberate:
///      the demo's dispute scenarios exercise the production resolution path,
///      not a parallel one.
///
/// @dev LOCAL-ONLY BY DEFAULT. The mock's jury is one-address-one-vote with no
///      stake, so on a public chain it would be a fake security theatre.
///      Deploying to anything but a local anvil (chain id 31337) requires
///      ALLOW_REAL_CHAIN=1 — for the case where a public *demo* environment
///      wants walkable dispute scenarios, with the mock-ness clearly labeled.
///
/// Env:
///   VEREX_OPERATOR_KEY  (required) deployer; also the adapter admin
///   CTF_ADDR            (required) the environment's ConditionalTokens
///   ALLOW_REAL_CHAIN    (optional) set to 1 to deploy off local anvil
///
/// Run:
///   CTF_ADDR=0x… forge script script/DeployMockOracle.s.sol \
///     --rpc-url http://127.0.0.1:8545 --broadcast
contract DeployMockOracle is Script {
    uint256 internal constant ANVIL_CHAIN_ID = 31337;

    function run() external returns (address oracle, address adapter) {
        uint256 deployerKey = vm.envUint("VEREX_OPERATOR_KEY");
        address deployer = vm.addr(deployerKey);
        address ctf = vm.envAddress("CTF_ADDR");

        require(
            block.chainid == ANVIL_CHAIN_ID || vm.envOr("ALLOW_REAL_CHAIN", uint256(0)) == 1,
            "mock oracle is local-only; set ALLOW_REAL_CHAIN=1 to override"
        );
        require(ctf.code.length > 0, "CTF_ADDR has no code on this chain");

        vm.startBroadcast(deployerKey);
        MockOptimisticOracleV2 oo = new MockOptimisticOracleV2();
        UmaCtfAdapter deployed = new UmaCtfAdapter(ctf, address(oo), deployer);
        vm.stopBroadcast();

        oracle = address(oo);
        adapter = address(deployed);

        // The labels below are what seed.ts greps for — keep them stable.
        console2.log("Chain id:            ", block.chainid);
        console2.log("Deployer:            ", deployer);
        console2.log("MockOptimisticOracleV2:", oracle);
        console2.log("UmaCtfAdapter:       ", adapter);
    }
}
