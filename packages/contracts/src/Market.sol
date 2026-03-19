// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Verex Prediction Market
/// @notice Core contract for creating and settling prediction markets
contract Market {
    enum Outcome { Unresolved, Yes, No }

    struct MarketData {
        string question;
        uint256 endTime;
        Outcome outcome;
        uint256 yesShares;
        uint256 noShares;
        bool settled;
    }

    uint256 public marketCount;
    mapping(uint256 => MarketData) public markets;
    mapping(uint256 => mapping(address => uint256)) public yesBalances;
    mapping(uint256 => mapping(address => uint256)) public noBalances;

    address public owner;

    event MarketCreated(uint256 indexed id, string question, uint256 endTime);
    event SharesBought(uint256 indexed id, address indexed buyer, bool isYes, uint256 amount);
    event MarketSettled(uint256 indexed id, Outcome outcome);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function createMarket(string calldata question, uint256 endTime) external onlyOwner returns (uint256 id) {
        require(endTime > block.timestamp, "End time must be in future");
        id = marketCount++;
        markets[id] = MarketData({
            question: question,
            endTime: endTime,
            outcome: Outcome.Unresolved,
            yesShares: 0,
            noShares: 0,
            settled: false
        });
        emit MarketCreated(id, question, endTime);
    }

    function buyShares(uint256 id, bool isYes) external payable {
        MarketData storage m = markets[id];
        require(block.timestamp < m.endTime, "Market closed");
        require(msg.value > 0, "Must send ETH");

        if (isYes) {
            m.yesShares += msg.value;
            yesBalances[id][msg.sender] += msg.value;
        } else {
            m.noShares += msg.value;
            noBalances[id][msg.sender] += msg.value;
        }

        emit SharesBought(id, msg.sender, isYes, msg.value);
    }

    function settleMarket(uint256 id, Outcome outcome) external onlyOwner {
        MarketData storage m = markets[id];
        require(block.timestamp >= m.endTime, "Market not ended");
        require(!m.settled, "Already settled");
        require(outcome != Outcome.Unresolved, "Invalid outcome");

        m.outcome = outcome;
        m.settled = true;
        emit MarketSettled(id, outcome);
    }

    function claimWinnings(uint256 id) external {
        MarketData storage m = markets[id];
        require(m.settled, "Not settled");

        uint256 userShares;
        uint256 totalWinning;
        uint256 totalPool = m.yesShares + m.noShares;

        if (m.outcome == Outcome.Yes) {
            userShares = yesBalances[id][msg.sender];
            totalWinning = m.yesShares;
            yesBalances[id][msg.sender] = 0;
        } else {
            userShares = noBalances[id][msg.sender];
            totalWinning = m.noShares;
            noBalances[id][msg.sender] = 0;
        }

        require(userShares > 0, "No winnings");
        uint256 payout = (userShares * totalPool) / totalWinning;
        payable(msg.sender).transfer(payout);
    }
}
