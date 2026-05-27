// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import "forge-std/Script.sol";
import {Order, Side, SignatureType} from "ctf-exchange/exchange/libraries/OrderStructs.sol";
import {CTFExchange} from "ctf-exchange/exchange/CTFExchange.sol";

import {MockUSDC} from "../src/MockUSDC.sol";

/// @notice Emits a deterministic Order digest for cross-checking the SDK's
///         off-chain EIP-712 reconstruction (packages/sdk).
///
///         Run:
///           forge script script/EmitOrderHash.s.sol --rpc-url=ignored
///
///         The script does not broadcast (no `--broadcast` flag) — it just
///         logs the deployed exchange address and the resulting digest.
///         Copy both into `packages/sdk/test/orders.test.ts` as the golden
///         values.
contract EmitOrderHash is Script {
    function run() external {
        // Deploy a minimal exchange. The CTF + factory addresses are zero
        // because `hashOrder` doesn't touch them — it only reads the
        // domain separator (set in the constructor) and the order fields.
        MockUSDC usdc = new MockUSDC();
        CTFExchange exchange = new CTFExchange(address(usdc), address(0), address(0), address(0));

        // Fixed Order. Values chosen so they're distinctive across fields
        // (catch encoding bugs that put the wrong field at the wrong slot).
        Order memory order = Order({
            salt: 12345,
            maker: 0x1111111111111111111111111111111111111111,
            signer: 0x1111111111111111111111111111111111111111,
            taker: 0x0000000000000000000000000000000000000000,
            tokenId: 0xabcdef0123456789,
            makerAmount: 60_000_000,    // 60 USDC
            takerAmount: 100_000_000,   // 100 outcome tokens
            expiration: 0,
            nonce: 7,
            feeRateBps: 0,
            side: Side.BUY,
            signatureType: SignatureType.EOA,
            signature: bytes("")
        });

        bytes32 digest = exchange.hashOrder(order);

        // 31337 is foundry's default chainId for `forge script` without a
        // live RPC. SDK test must use the same.
        console2.log("chainId:           ", block.chainid);
        console2.log("exchange address:  ", address(exchange));
        console2.log("ORDER_TYPEHASH ok: hashOrder returned:");
        console2.logBytes32(digest);
    }
}
