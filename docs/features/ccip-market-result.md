# CCIP Market-Result Receiver — Chainlink Local test setup

**Goal:** receive market results cross-chain via Chainlink CCIP (`MarketResultReceiver`),
tested entirely locally with `CCIPLocalSimulator` — no testnet tokens, API keys, or
dynamic gas fees.

*Source: setup note pasted in session 2026-07-29 (KST). Relates to the design doc's
cross-chain interoperability goal (§1.1) and the oracle trust progression
([oracle.md](oracle.md) Stage 2, Chainlink) — a future path where resolution happens on
one chain and Verex settles on another.*

## 1. Contract skeleton

Inherit `CCIPReceiver`, validate the source chain (and in production, the sender):

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {CCIPReceiver} from "@chainlink/contracts-ccip/src/v0.8/ccip/applications/CCIPReceiver.sol";
import {Client} from "@chainlink/contracts-ccip/src/v0.8/ccip/libraries/Client.sol";

contract MarketResultReceiver is CCIPReceiver {
    event ResultReceived(bytes32 indexed messageId, uint64 indexed srcChainSelector, bytes data);

    uint64 public allowedSourceChain;

    constructor(address router, uint64 _allowedSourceChain) CCIPReceiver(router) {
        allowedSourceChain = _allowedSourceChain;
    }

    function _ccipReceive(Client.Any2EVMMessage memory m) internal override {
        require(m.sourceChainSelector == allowedSourceChain, "Invalid source chain");
        emit ResultReceived(m.messageId, m.sourceChainSelector, m.data);
    }
}
```

## 2. Local test — Foundry (verex's stack)

`@chainlink/local` ships `CCIPLocalSimulator.sol`: a pre-configured Router mock +
chain selector, simulating cross-chain messaging in memory.

```solidity
// test/MarketResultReceiver.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {CCIPLocalSimulator, Register} from "@chainlink/local/src/ccip/CCIPLocalSimulator.sol";
import {MarketResultReceiver} from "../src/MarketResultReceiver.sol";

contract MarketResultReceiverTest is Test {
    CCIPLocalSimulator public ccipLocalSimulator;
    MarketResultReceiver public receiver;
    uint64 public chainSelector;

    function setUp() public {
        ccipLocalSimulator = new CCIPLocalSimulator();
        Register.NetworkDetails memory networkDetails = ccipLocalSimulator.getNetworkDetails(block.chainid);
        chainSelector = networkDetails.chainSelector;
        receiver = new MarketResultReceiver(networkDetails.routerAddress, chainSelector);
    }

    function test_ReceiveCCIPMessage() public {
        bytes memory data = abi.encode("MarketResolved", 42);
        ccipLocalSimulator.sendWithCCIP(address(receiver), chainSelector, data, address(this));
    }
}
```

Run with `forge test`.

## 3. Local test — Hardhat (alternative)

```js
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CCIP Local Receiver Test", function () {
  let ccipSimulator, receiverContract, chainSelector, sourceRouter;

  beforeEach(async function () {
    const CCIPLocalSimulatorFactory = await ethers.getContractFactory("CCIPLocalSimulator");
    ccipSimulator = await CCIPLocalSimulatorFactory.deploy();
    await ccipSimulator.waitForDeployment();

    const config = await ccipSimulator.configuration();
    sourceRouter = config.sourceRouter_;
    chainSelector = config.chainSelector_;

    const ReceiverFactory = await ethers.getContractFactory("MarketResultReceiver");
    receiverContract = await ReceiverFactory.deploy(sourceRouter, chainSelector);
    await receiverContract.waitForDeployment();
  });

  it("Should receive cross-chain message via CCIP simulator", async function () {
    const [sender] = await ethers.getSigners();
    const payload = ethers.abiCoder.encode(["string", "uint256"], ["MarketResolved", 42]);

    const tx = await ccipSimulator.sendWithCCIP(
      await receiverContract.getAddress(),
      chainSelector,
      payload,
      sender.address
    );
    await tx.wait();

    await expect(tx)
      .to.emit(receiverContract, "ResultReceived")
      .withArgs(ethers.ZeroHash, chainSelector, payload);
  });
});
```

Run with `npx hardhat test`.

## 4. Key points

1. **`router` parameter**: in local unit tests, always pass the simulator's
   `config.sourceRouter_` / `networkDetails.routerAddress` as the constructor's `router`.
2. **Sender checks**: in production, `_ccipReceive` must decode `m.sender`
   (`abi.decode(m.sender, (address))`) and verify it against an explicit whitelist of
   allowed sender contracts on the source chain — source-chain validation alone is not
   enough.

## Features
- [ ] **CCIP result receiver (exploratory)**
  - [ ] Add `@chainlink/local` + `CCIPLocalSimulator` Foundry test to `packages/contracts`
  - [ ] `MarketResultReceiver` prototype wired to `reportPayouts` (oracle Stage 2 touchpoint)
  - [ ] `(you)` decide source chain + sender whitelist model before any testnet deploy
