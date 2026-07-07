// SPDX-License-Identifier: MIT
// Pragma ^0.8.15 to share a compile unit with Polymarket's CTFExchange (=0.8.15).
pragma solidity ^0.8.15;

import "forge-std/Script.sol";
import {IConditionalTokens} from "ctf-exchange/exchange/interfaces/IConditionalTokens.sol";
import {IERC20} from "openzeppelin-contracts/token/ERC20/IERC20.sol";
import {CTFExchange} from "ctf-exchange/exchange/CTFExchange.sol";

import {MockUSDC} from "../src/MockUSDC.sol";

/// @notice Deploy the v2 (CTF) backbone to anvil:
///           MockUSDC + ConditionalTokens + (CTFExchange via separate deploy)
///         CTFExchange's constructor takes (collateral, ctf, proxyFactory,
///         safeFactory). We deploy with (0,0) for the factories — disables
///         Polymarket's account-abstraction order paths and leaves
///         direct-EOA order signing as the only enabled path. Sufficient
///         for S2~S5 work; AA-flavored signing comes back in S7 (§11.4).
///
/// Run on anvil:
///   anvil &
///   forge script script/DeployCTF.s.sol \
///     --rpc-url http://localhost:8545 \
///     --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
///     --broadcast
contract DeployCTF is Script {
    function run() external returns (address usdc, address ctf, address exchange) {
        uint256 deployerKey = vm.envOr(
            "PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        // 1. MockUSDC (6 decimals; open mint)
        usdc = address(new MockUSDC());

        // 2. ConditionalTokens — deployed from Polymarket's pre-built bytecode
        //    artifact (Solidity 0.5.x source, compiled into bytecode that runs
        //    on any post-Byzantium EVM, including 0.8 networks).
        ctf = _deployCTF();

        // 3. CTFExchange — Polymarket's exchange contract, deployed from its
        //    pre-built artifact. Constructor: (_collateral, _ctf,
        //    _proxyFactory, _safeFactory). We pass 0/0 for factories.
        exchange = _deployCTFExchange(usdc, ctf, address(0), address(0));

        vm.stopBroadcast();

        console2.log("");
        console2.log("=== v2 (CTF) backbone deployed ===");
        console2.log("Deployer:        ", deployer);
        console2.log("MockUSDC:        ", usdc);
        console2.log("ConditionalTokens:", ctf);
        console2.log("CTFExchange:     ", exchange);
        console2.log("");
        console2.log("To mint test USDC to deployer:");
        console2.log("  cast send <USDC> 'mint(address,uint256)' <deployer> 1000000000000");
        console2.log("");
        console2.log("Copy-paste for the CLI (packages/cli reads these env vars):");
        console2.log(
            string.concat(
                "  export USDC_ADDR=",
                vm.toString(usdc),
                " CTF_ADDR=",
                vm.toString(ctf),
                " EXCHANGE_ADDR=",
                vm.toString(exchange)
            )
        );
    }

    function _deployCTF() internal returns (address addr) {
        bytes memory bytecode = vm.parseJsonBytes(
            vm.readFile("lib/ctf-exchange/artifacts/ConditionalTokens.json"),
            ".bytecode.object"
        );
        assembly {
            addr := create(0, add(bytecode, 0x20), mload(bytecode))
        }
        require(addr != address(0), "CTF deploy failed");
    }

    function _deployCTFExchange(
        address collateral,
        address ctf,
        address proxyFactory,
        address safeFactory
    ) internal returns (address) {
        // CTFExchange is Solidity 0.8 — compile from source via the import.
        // (CTF itself stays as bytecode-deploy because its source is 0.5.x.)
        return address(new CTFExchange(collateral, ctf, proxyFactory, safeFactory));
    }
}
