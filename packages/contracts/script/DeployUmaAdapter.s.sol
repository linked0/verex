// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {UmaCtfAdapter} from "../src/UmaCtfAdapter.sol";

/// @notice Deploy the UMA oracle adapter for an existing CTF backbone.
///
/// @dev WHY THIS IS A SEPARATE SCRIPT FROM DeployCTF.s.sol.
///      The adapter is *bound* to one ConditionalTokens instance by its
///      constructor, and a market's conditionId hashes the adapter's own
///      address — so the adapter must exist before any market that uses it,
///      and redeploying it orphans every market already pointing at the old
///      one. Keeping it out of the backbone script means you can add UMA to an
///      environment that is already live, without touching MockUSDC / CTF /
///      CTFExchange and without invalidating the markets they already carry.
///
/// @dev THIS SCRIPT ONLY DEPLOYS. It does not initialize any question — that
///      spends the reward budget and is a per-market action (see the runbook's
///      UMA section). Deploy is idempotent in the sense that it is safe to run
///      on a fresh environment; it is NOT safe to re-run on one that already
///      has an adapter recorded in deployments.json, because the new address
///      cannot inherit the old one's markets.
///
/// Env:
///   VEREX_OPERATOR_KEY  (required) deployer; also the default admin
///   CTF_ADDR            (required) the environment's ConditionalTokens, from
///                       packages/contracts/deployments.json
///   UMA_OO_ADDR         (optional) OptimisticOracleV2; defaults to Sepolia's
///   UMA_ADAPTER_ADMIN   (optional) admin address; defaults to the deployer
///
/// Run:
///   set -a; source <chain env file>; set +a
///   CTF_ADDR=0x… forge script script/DeployUmaAdapter.s.sol \
///     --rpc-url $VEREX_RPC_URL --broadcast
contract DeployUmaAdapter is Script {
    /// @dev UMA's OptimisticOracleV2 on Sepolia. Verified 2026-08-03 two ways —
    ///      UMA's own networks/11155111.json, and live `cast` calls returning
    ///      defaultLiveness() == 7200. See docs/tasks/current-plan.md "G4 result".
    address internal constant SEPOLIA_OO = 0x9f1263B8f0355673619168b5B8c0248f1d03e88C;
    uint256 internal constant SEPOLIA_CHAIN_ID = 11155111;

    function run() external returns (address adapter, address oracle) {
        // No fallback key, for the same reason DeployCTF.s.sol has none: a
        // silent default would deploy with anvil's well-known key as admin on
        // whatever chain --rpc-url happens to point at.
        uint256 deployerKey = vm.envUint("VEREX_OPERATOR_KEY");
        address deployer = vm.addr(deployerKey);

        address ctf = vm.envAddress("CTF_ADDR");
        address oo = vm.envOr("UMA_OO_ADDR", SEPOLIA_OO);
        address admin = vm.envOr("UMA_ADAPTER_ADMIN", deployer);

        // --- Preflight. Every check below is cheaper than a bad deploy: the
        // adapter's address is baked into the conditionId of every market it
        // ever resolves, so a wrong constructor argument is not fixable in
        // place — it is a re-deploy plus a re-creation of those markets.

        // The hardcoded default is a Sepolia address and means nothing
        // anywhere else. Requiring an explicit override off-Sepolia stops a
        // deploy that would point at an empty address on another chain.
        require(
            oo != SEPOLIA_OO || block.chainid == SEPOLIA_CHAIN_ID,
            "UMA_OO_ADDR must be set explicitly off Sepolia"
        );
        require(ctf.code.length > 0, "CTF_ADDR has no code on this chain");
        require(oo.code.length > 0, "UMA_OO_ADDR has no code on this chain");

        // Confirm the OO address really is an OptimisticOracleV2 and not some
        // other contract that merely exists. defaultLiveness() is not on our
        // 5-function interface (deliberately minimal), so call it raw rather
        // than widening the interface for a one-off sanity check.
        (bool ok, bytes memory ret) = oo.staticcall(abi.encodeWithSignature("defaultLiveness()"));
        require(ok && ret.length == 32, "UMA_OO_ADDR does not answer defaultLiveness()");
        uint256 defaultLiveness = abi.decode(ret, (uint256));

        console2.log("Chain id:        ", block.chainid);
        console2.log("Deployer:        ", deployer);
        console2.log("CTF:             ", ctf);
        console2.log("OptimisticOracleV2:", oo);
        console2.log("  defaultLiveness:", defaultLiveness);
        console2.log("Adapter admin:   ", admin);

        vm.startBroadcast(deployerKey);
        UmaCtfAdapter deployed = new UmaCtfAdapter(ctf, oo, admin);
        vm.stopBroadcast();

        adapter = address(deployed);
        oracle = oo;
        vm.label(adapter, "UmaCtfAdapter");

        console2.log("");
        console2.log("=== UmaCtfAdapter deployed ===");
        console2.log("UmaCtfAdapter:   ", adapter);
        console2.log("");
        console2.log("Record it in the manifest (immediately - run-latest.json is per chain id):");
        console2.log("  pnpm --filter @verex/api save-uma-adapter <staging|prod>");
        console2.log("");
        console2.log("Before initializing a question, fund the ADAPTER with the reward token");
        console2.log("if reward > 0 - requestPrice pulls the reward from the adapter, not from you.");
        console2.log("Sepolia WETH (on UMA's AddressWhitelist): 0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9");
    }
}
