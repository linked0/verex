// SPDX-License-Identifier: MIT
// Pragma 0.8.15 matches CTFExchange.sol (strict-pinned). Sharing the compile
// unit lets us import CTFExchange concretely instead of via interface + raw
// bytecode (the trick CTFCycle.t.sol uses for the 0.5-pinned CTF).
pragma solidity ^0.8.15;

import "forge-std/Test.sol";
import {IERC20} from "openzeppelin-contracts/token/ERC20/IERC20.sol";

import {CTFExchange} from "ctf-exchange/exchange/CTFExchange.sol";
import {IConditionalTokens} from "ctf-exchange/exchange/interfaces/IConditionalTokens.sol";
import {Order, Side, SignatureType} from "ctf-exchange/exchange/libraries/OrderStructs.sol";

import {JUSD} from "../src/JUSD.sol";

/// @notice S2 keystone milestone — CTF order fill end-to-end on anvil-shaped
///         setup. Proves the orderbook integration works before SDK/CLI/MM
///         layers are built on top.
///
///         What's exercised:
///           - EIP-712 typed-data sign of an Order by an EOA maker
///           - CTFExchange.fillOrder by an authorized operator
///           - BUY-side asset movement: maker pays JUSD, receives CT (YES)
///           - Partial fill state in orderStatus
///           - Signature / expiry / nonce revert paths
///
///         What's NOT exercised here (next slices):
///           - matchOrders (MM-style two-sided matching)
///           - SELL orders against operator inventory (covered for symmetry
///             but the MINT/MERGE flows live in matchOrders)
///           - Fee accounting beyond fee=0
contract CTFFillOrderTest is Test {
    // ── Deployed contracts ──
    IConditionalTokens internal ctf;
    JUSD internal jusd;
    CTFExchange internal exchange;

    // ── Test market: "Will Brazil win the 2026 World Cup?" ──
    address internal oracle = makeAddr("oracle");
    bytes32 internal questionId = keccak256("Will Brazil win the 2026 World Cup?");
    bytes32 internal conditionId;
    uint256 internal yesPositionId;
    uint256 internal noPositionId;

    // ── Actors ──
    // Maker: signs orders off-chain (EIP-712), funds them with JUSD.
    // We need its private key to call vm.sign, so we derive both pk + addr.
    uint256 internal makerPk = uint256(keccak256("maker"));
    address internal maker;

    // Operator: msg.sender for fillOrder. Holds CT inventory (pre-split) and
    // collects JUSD from the maker's BUY. In S6+ this becomes the MM Agent.
    address internal operator = makeAddr("operator");

    // ─────────────────────────────────────────────────────────────────────
    // Setup
    // ─────────────────────────────────────────────────────────────────────

    function setUp() public {
        maker = vm.addr(makerPk);

        // 1. Deploy CTF + JUSD + Exchange (deployer == this contract).
        ctf = IConditionalTokens(_deployCTF());
        jusd = new JUSD();
        // (proxyFactory, safeFactory) = (0, 0) — disables Polymarket's AA
        // signature paths. Mirrors DeployCTF.s.sol. EOA path is the only
        // enabled signature type until S7 brings AA back.
        exchange = new CTFExchange(address(jusd), address(ctf), address(0), address(0));

        // 2. Prepare a binary YES/NO condition + compute position IDs.
        //    Use CTHelpers (via CTF) for the IDs — don't recompute the EC
        //    math (CTFCycle.t.sol learned this the hard way, see history).
        ctf.prepareCondition(oracle, questionId, 2);
        conditionId = _conditionId(oracle, questionId, 2);
        bytes32 yesCollection = ctf.getCollectionId(bytes32(0), conditionId, 1);
        bytes32 noCollection = ctf.getCollectionId(bytes32(0), conditionId, 2);
        yesPositionId = ctf.getPositionId(IERC20(address(jusd)), yesCollection);
        noPositionId = ctf.getPositionId(IERC20(address(jusd)), noCollection);

        // 3. Register the YES token on the Exchange. Trading is gated on
        //    registry — fillOrder reverts with InvalidTokenId otherwise.
        //    Caller must be admin; deployer is admin by default.
        exchange.registerToken(yesPositionId, noPositionId, conditionId);

        // 4. Grant operator role. fillOrder is onlyOperator.
        exchange.addOperator(operator);

        // 5. Pre-fund operator with CT inventory so it can settle BUY orders.
        //    Operator splits 1000 JUSD -> 1000 YES + 1000 NO.
        _mintAndSplit(operator, 1000e6);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Happy-path: BUY order, full fill
    //   maker wants 100 YES at price 0.60  =>  pays 60 JUSD, receives 100 YES
    // ─────────────────────────────────────────────────────────────────────

    function test_FillOrder_Buy_FullFill() public {
        jusd.mint(maker, 60e6);
        vm.prank(maker);
        jusd.approve(address(exchange), type(uint256).max);

        // Operator must approve CT (ERC-1155) to the exchange so it can pull.
        _approveCtfForAll(operator, address(exchange));

        Order memory order = _buildBuyOrder({
            tokenId: yesPositionId,
            makerAmount: 60e6,    // JUSD paid
            takerAmount: 100e6,   // YES received (CT uses same 6 dec as collateral)
            nonce: 0
        });
        _sign(order);

        uint256 makerJusdBefore = jusd.balanceOf(maker);
        uint256 operatorJusdBefore = jusd.balanceOf(operator);

        vm.prank(operator);
        exchange.fillOrder(order, 60e6); // fillAmount in maker-amount terms

        assertEq(jusd.balanceOf(maker), makerJusdBefore - 60e6, "maker JUSD debited");
        assertEq(jusd.balanceOf(operator), operatorJusdBefore + 60e6, "operator JUSD credited");
        assertEq(_balance1155(maker, yesPositionId), 100e6, "maker received 100 YES");
        assertEq(_balance1155(operator, yesPositionId), 1000e6 - 100e6, "operator YES debited");
        // Operator's NO inventory untouched — only YES side moved.
        assertEq(_balance1155(operator, noPositionId), 1000e6, "operator NO untouched");
    }

    // ─────────────────────────────────────────────────────────────────────
    // Partial fill: same order, fill only 30 JUSD of 60.
    //   maker pays 30 JUSD, receives 50 YES (pro-rata of 100)
    //   order remains open for the remaining 30 JUSD.
    // ─────────────────────────────────────────────────────────────────────

    function test_FillOrder_Buy_PartialFill() public {
        jusd.mint(maker, 60e6);
        vm.prank(maker);
        jusd.approve(address(exchange), type(uint256).max);
        _approveCtfForAll(operator, address(exchange));

        Order memory order = _buildBuyOrder(yesPositionId, 60e6, 100e6, 0);
        _sign(order);

        // Fill 30 of 60 (half).
        vm.prank(operator);
        exchange.fillOrder(order, 30e6);

        assertEq(_balance1155(maker, yesPositionId), 50e6, "half fill -> 50 YES");
        assertEq(jusd.balanceOf(maker), 30e6, "30 JUSD remaining for maker");

        // Fill the rest in a second call.
        vm.prank(operator);
        exchange.fillOrder(order, 30e6);

        assertEq(_balance1155(maker, yesPositionId), 100e6, "full fill after second call");
        assertEq(jusd.balanceOf(maker), 0, "all 60 JUSD spent");
    }

    // ─────────────────────────────────────────────────────────────────────
    // Revert: tampered signature (wrong key).
    // ─────────────────────────────────────────────────────────────────────

    function test_FillOrder_RevertsOnBadSignature() public {
        jusd.mint(maker, 60e6);
        vm.prank(maker);
        jusd.approve(address(exchange), type(uint256).max);
        _approveCtfForAll(operator, address(exchange));

        Order memory order = _buildBuyOrder(yesPositionId, 60e6, 100e6, 0);
        // Sign with a different key than `order.signer`.
        uint256 wrongPk = uint256(keccak256("not-maker"));
        bytes32 digest = exchange.hashOrder(order);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(wrongPk, digest);
        order.signature = abi.encodePacked(r, s, v);

        vm.expectRevert(); // InvalidSignature
        vm.prank(operator);
        exchange.fillOrder(order, 60e6);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Revert: expired order.
    // ─────────────────────────────────────────────────────────────────────

    function test_FillOrder_RevertsOnExpired() public {
        jusd.mint(maker, 60e6);
        vm.prank(maker);
        jusd.approve(address(exchange), type(uint256).max);
        _approveCtfForAll(operator, address(exchange));

        Order memory order = _buildBuyOrder(yesPositionId, 60e6, 100e6, 0);
        order.expiration = block.timestamp + 1 hours;
        _sign(order);

        // Advance past expiry.
        vm.warp(block.timestamp + 2 hours);

        vm.expectRevert(); // OrderExpired
        vm.prank(operator);
        exchange.fillOrder(order, 60e6);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Revert: non-operator caller.
    // ─────────────────────────────────────────────────────────────────────

    function test_FillOrder_RevertsForNonOperator() public {
        jusd.mint(maker, 60e6);
        vm.prank(maker);
        jusd.approve(address(exchange), type(uint256).max);

        Order memory order = _buildBuyOrder(yesPositionId, 60e6, 100e6, 0);
        _sign(order);

        address notOperator = makeAddr("notOperator");
        vm.expectRevert(); // NotOperator
        vm.prank(notOperator);
        exchange.fillOrder(order, 60e6);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Gas snapshot for cold fillOrder (BUY, full fill). Useful for SDK/MM
    // capacity planning and for the v2 audit baseline.
    // ─────────────────────────────────────────────────────────────────────

    function test_GasSnapshot_FillOrder_Buy() public {
        jusd.mint(maker, 60e6);
        vm.prank(maker);
        jusd.approve(address(exchange), type(uint256).max);
        _approveCtfForAll(operator, address(exchange));

        Order memory order = _buildBuyOrder(yesPositionId, 60e6, 100e6, 0);
        _sign(order);

        vm.prank(operator);
        uint256 gasBefore = gasleft();
        exchange.fillOrder(order, 60e6);
        uint256 gasUsed = gasBefore - gasleft();
        emit log_named_uint("fillOrder BUY full-fill gas", gasUsed);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────

    function _buildBuyOrder(uint256 tokenId, uint256 makerAmount, uint256 takerAmount, uint256 nonce)
        internal
        view
        returns (Order memory)
    {
        return Order({
            salt: uint256(keccak256(abi.encode(tokenId, makerAmount, takerAmount, nonce, block.timestamp))),
            maker: maker,
            signer: maker,
            taker: address(0),  // public order
            tokenId: tokenId,
            makerAmount: makerAmount,
            takerAmount: takerAmount,
            expiration: 0,      // no expiry
            nonce: nonce,
            feeRateBps: 0,
            side: Side.BUY,
            signatureType: SignatureType.EOA,
            signature: bytes("")
        });
    }

    /// @dev Computes the EIP-712 digest via exchange.hashOrder(order) and signs
    ///      with makerPk. Doing it on-contract instead of re-deriving the
    ///      domain separator off-contract keeps the test resilient to any
    ///      future Polymarket pragma changes.
    function _sign(Order memory order) internal {
        bytes32 digest = exchange.hashOrder(order);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(makerPk, digest);
        order.signature = abi.encodePacked(r, s, v);
    }

    function _mintAndSplit(address who, uint256 amount) internal {
        jusd.mint(who, amount);
        vm.prank(who);
        jusd.approve(address(ctf), amount);

        uint256[] memory partition = new uint256[](2);
        partition[0] = 1;
        partition[1] = 2;

        vm.prank(who);
        ctf.splitPosition(IERC20(address(jusd)), bytes32(0), conditionId, partition, amount);
    }

    function _conditionId(address _oracle, bytes32 _questionId, uint256 outcomeSlotCount)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(_oracle, _questionId, outcomeSlotCount));
    }

    /// @dev IConditionalTokens doesn't expose ERC-1155 surface, so go through
    ///      a raw call (the same trick CTFCycle.t.sol uses for balanceOf).
    function _approveCtfForAll(address owner, address spender) internal {
        vm.prank(owner);
        (bool ok,) = address(ctf).call(
            abi.encodeWithSignature("setApprovalForAll(address,bool)", spender, true)
        );
        require(ok, "setApprovalForAll failed");
    }

    function _balance1155(address holder, uint256 tokenId) internal view returns (uint256) {
        (bool ok, bytes memory data) = address(ctf).staticcall(
            abi.encodeWithSignature("balanceOf(address,uint256)", holder, tokenId)
        );
        require(ok, "balanceOf failed");
        return abi.decode(data, (uint256));
    }

    function _deployCTF() internal returns (address addr) {
        string memory artifactPath = "lib/ctf-exchange/artifacts/ConditionalTokens.json";
        string memory json = vm.readFile(artifactPath);
        bytes memory bytecode = vm.parseJsonBytes(json, ".bytecode.object");
        assembly {
            addr := create(0, add(bytecode, 0x20), mload(bytecode))
        }
        require(addr != address(0), "CTF deployment failed");
    }
}
