// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Market.sol";

/// @title Verex Market Factory
/// @notice Deploys per-market `Market` contracts. Permissionless creation; the
///         protocol-wide owner (set at factory construction) becomes the resolver
///         for every spawned Market.
contract MarketFactory {
    address public owner;
    address[] public markets;

    event MarketCreated(
        address indexed market,
        address indexed creator,
        string question,
        uint256 endTime
    );

    constructor(address _owner) {
        require(_owner != address(0), "owner zero");
        owner = _owner;
    }

    function createMarket(string calldata question, uint256 endTime)
        external
        returns (address market)
    {
        Market m = new Market(question, endTime, owner);
        market = address(m);
        markets.push(market);
        emit MarketCreated(market, msg.sender, question, endTime);
    }

    function getMarkets() external view returns (address[] memory) {
        return markets;
    }

    function marketCount() external view returns (uint256) {
        return markets.length;
    }
}
