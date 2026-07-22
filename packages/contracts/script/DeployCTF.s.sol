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
/// Run on anvil (the script reads VEREX_OPERATOR_KEY from the environment
/// itself via vm.envUint — forge's own --private-key CLI flag is not used/read here):
///   anvil &
///   export VEREX_OPERATOR_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
///   forge script script/DeployCTF.s.sol --rpc-url http://localhost:8545 --broadcast
contract DeployCTF is Script {
    function run() external returns (address usdc, address ctf, address exchange) {
        // No fallback: on anvil, export VEREX_OPERATOR_KEY=0xac09...ff80
        // (account[0]) explicitly. A silent fallback here previously meant an
        // un-exported key deployed with anvil's well-known key as admin/operator
        // on WHATEVER chain --rpc-url pointed at, with no error — dangerous
        // on a real chain (see docs/analysis/2026-05-08-v1-security-audit.md
        // §2.5, action item A1). Failing loudly here is strictly safer.
        uint256 deployerKey = vm.envUint("VEREX_OPERATOR_KEY");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        // 1. MockUSDC (6 decimals; open mint)
        usdc = address(new MockUSDC());
        vm.label(usdc, "MockUSDC");
        console2.log("[1/3] MockUSDC deployed:         ", usdc);

        // 2. ConditionalTokens — deployed from Polymarket's pre-built bytecode
        //    artifact (Solidity 0.5.x source, compiled into bytecode that runs
        //    on any post-Byzantium EVM, including 0.8 networks). Raw create(),
        //    not `new ContractName()` — forge has no compiled artifact of its
        //    own to match this deployment against, so the --broadcast summary
        //    prints this one with NO "Contract:" name line (unlike the other
        //    two below). vm.label() doesn't fix that specific summary — it's
        //    forge's own artifact-matching, not something a script can set —
        //    but it does make this address readable in trace output, and the
        //    console2.log line right here is printed in the same 1-2-3 order
        //    as the broadcast summary, so you can match it up positionally.
        ctf = _deployCTF();
        vm.label(ctf, "ConditionalTokens");
        console2.log("[2/3] ConditionalTokens deployed: ", ctf, "<- unlabeled in the broadcast summary, see comment above");

        // 3. CTFExchange — Polymarket's exchange contract, deployed from its
        //    pre-built artifact. Constructor: (_collateral, _ctf,
        //    _proxyFactory, _safeFactory). We pass 0/0 for factories.
        exchange = _deployCTFExchange(usdc, ctf, address(0), address(0));
        vm.label(exchange, "CTFExchange");
        console2.log("[3/3] CTFExchange deployed:      ", exchange);

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
