// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import "forge-std/Script.sol";
import {IERC20} from "openzeppelin-contracts/token/ERC20/IERC20.sol";
import {IConditionalTokens} from "ctf-exchange/exchange/interfaces/IConditionalTokens.sol";
import {CTFExchange} from "ctf-exchange/exchange/CTFExchange.sol";

import {MockUSDC} from "../src/MockUSDC.sol";

/// @notice Demo-market lifecycle scripts for the anvil v2 stack
///         (MockUSDC + ConditionalTokens + CTFExchange — deployed by
///         DeployCTF.s.sol first).
///
///         The Stage-1 manual oracle is the operator EOA itself: the same key
///         that prepares the condition also reports payouts. This is the
///         plan §2.2.7 / §4 oracle progression (Stage 1 of 3). Chainlink
///         (Stage 2) and UMA (Stage 3) come in S6.
///
///         Two entrypoints, invoked via --sig:
///
///         Setup a tradable market:
///           forge script script/DemoMarket.s.sol --sig "setup()" \
///             --rpc-url http://localhost:8545 \
///             --private-key 0xac0974... --broadcast
///
///         Resolve a market (YES wins or NO wins):
///           forge script script/DemoMarket.s.sol \
///             --sig "resolve(uint256,uint256)" 1 0 \
///             --rpc-url http://localhost:8545 \
///             --private-key 0xac0974... --broadcast
///
///         Required env: USDC_ADDR, CTF_ADDR, EXCHANGE_ADDR (from DeployCTF
///         broadcast output). QUESTION_ID is optional — defaults to a fixed
///         keccak so setup/resolve target the same condition by default.
contract DemoMarket is Script {
    // Deterministic default question so setup() and resolve() agree without
    // needing the user to plumb a hex string between them.
    bytes32 internal constant DEFAULT_QUESTION_ID =
        keccak256("demo: Will Brazil win the 2026 World Cup?");

    // ─────────────────────────────────────────────────────────────────────
    // setup() — prepare condition, register on Exchange, add operator,
    //           pre-split USDC into CT inventory for the operator
    // ─────────────────────────────────────────────────────────────────────

    function setup() external {
        (MockUSDC usdc, IConditionalTokens ctf, CTFExchange exchange) = _readAddrs();
        uint256 operatorKey = _operatorKey();
        address operator = vm.addr(operatorKey);
        bytes32 questionId = _questionId();

        vm.startBroadcast(operatorKey);

        // Manual oracle = operator EOA itself (Stage 1).
        ctf.prepareCondition(operator, questionId, 2);

        bytes32 conditionId = keccak256(abi.encodePacked(operator, questionId, uint256(2)));
        uint256 yesId = ctf.getPositionId(
            IERC20(address(usdc)), ctf.getCollectionId(bytes32(0), conditionId, 1)
        );
        uint256 noId = ctf.getPositionId(
            IERC20(address(usdc)), ctf.getCollectionId(bytes32(0), conditionId, 2)
        );

        // Register YES/NO pair on the Exchange. Required before fillOrder.
        exchange.registerToken(yesId, noId, conditionId);

        // Authorize the operator EOA as an Exchange operator (caller is admin
        // because DeployCTF used the same key as deployer).
        exchange.addOperator(operator);

        // Mint + split 1000 USDC so the operator has 1000 YES + 1000 NO of
        // inventory to settle BUY orders against.
        usdc.mint(operator, 1000e6);
        usdc.approve(address(ctf), 1000e6);
        uint256[] memory partition = new uint256[](2);
        partition[0] = 1;
        partition[1] = 2;
        ctf.splitPosition(IERC20(address(usdc)), bytes32(0), conditionId, partition, 1000e6);

        // Operator must let the Exchange pull its CT to settle BUY fills.
        (bool ok,) = address(ctf).call(
            abi.encodeWithSignature("setApprovalForAll(address,bool)", address(exchange), true)
        );
        require(ok, "setApprovalForAll failed");

        vm.stopBroadcast();

        console2.log("");
        console2.log("=== Demo market ready ===");
        console2.log("Operator/Oracle: ", operator);
        console2.log("questionId:      ");
        console2.logBytes32(questionId);
        console2.log("conditionId:     ");
        console2.logBytes32(conditionId);
        console2.log("YES position id: ", yesId);
        console2.log("NO position id:  ", noId);
        console2.log("");
        console2.log("To resolve YES wins:");
        console2.log("  forge script script/DemoMarket.s.sol --sig 'resolve(uint256,uint256)' 1 0 ...");
    }

    // ─────────────────────────────────────────────────────────────────────
    // resolve(yesPayout, noPayout) — operator-as-oracle reports payouts
    //   yesWins:   resolve(1, 0)
    //   noWins:    resolve(0, 1)
    // ─────────────────────────────────────────────────────────────────────

    function resolve(uint256 yesPayout, uint256 noPayout) external {
        (, IConditionalTokens ctf,) = _readAddrs();
        uint256 operatorKey = _operatorKey();
        bytes32 questionId = _questionId();

        uint256[] memory payouts = new uint256[](2);
        payouts[0] = yesPayout;
        payouts[1] = noPayout;

        vm.startBroadcast(operatorKey);
        ctf.reportPayouts(questionId, payouts);
        vm.stopBroadcast();

        console2.log("Reported payouts: YES=", yesPayout, "NO=", noPayout);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────

    function _readAddrs()
        internal
        view
        returns (MockUSDC usdc, IConditionalTokens ctf, CTFExchange exchange)
    {
        usdc = MockUSDC(vm.envAddress("USDC_ADDR"));
        ctf = IConditionalTokens(vm.envAddress("CTF_ADDR"));
        exchange = CTFExchange(vm.envAddress("EXCHANGE_ADDR"));
    }

    function _operatorKey() internal view returns (uint256) {
        return vm.envOr(
            "PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );
    }

    function _questionId() internal view returns (bytes32) {
        return vm.envOr("QUESTION_ID", DEFAULT_QUESTION_ID);
    }
}
