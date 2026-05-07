// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Verex Prediction Market (single market, fixed-price 1:1 escrow)
/// @notice One deployment per question. Buyers send native ETH for YES or NO shares.
///         After endTime the owner resolves; winners claim their pro-rata share of the
///         total pool.
contract Market {
    string public question;
    uint256 public endTime;
    address public owner;

    bool public resolved;
    /// @notice true = YES wins, false = NO wins. Meaningful only when `resolved` is true.
    bool public outcome;

    uint256 public yesPool;
    uint256 public noPool;

    mapping(address => uint256) public yesShares;
    mapping(address => uint256) public noShares;

    event Bought(address indexed buyer, bool isYes, uint256 amount);
    event Resolved(bool outcome);
    event Claimed(address indexed user, uint256 amount);

    constructor(string memory _question, uint256 _endTime, address _owner) {
        require(_endTime > block.timestamp, "endTime must be future");
        require(_owner != address(0), "owner zero");
        question = _question;
        endTime = _endTime;
        owner = _owner;
    }

    function buyYes() external payable {
        require(block.timestamp < endTime, "market closed");
        require(msg.value > 0, "zero amount");
        yesPool += msg.value;
        yesShares[msg.sender] += msg.value;
        emit Bought(msg.sender, true, msg.value);
    }

    function buyNo() external payable {
        require(block.timestamp < endTime, "market closed");
        require(msg.value > 0, "zero amount");
        noPool += msg.value;
        noShares[msg.sender] += msg.value;
        emit Bought(msg.sender, false, msg.value);
    }

    function resolve(bool _outcome) external {
        require(msg.sender == owner, "not owner");
        require(!resolved, "already resolved");
        require(block.timestamp >= endTime, "market not ended");
        resolved = true;
        outcome = _outcome;
        emit Resolved(_outcome);
    }

    /// @notice Claim winnings. If the caller has no winning shares, returns 0
    ///         (does NOT revert) — by design, so a UI can call this blindly.
    function claim() external returns (uint256 payout) {
        require(resolved, "not resolved");

        uint256 userShares = outcome ? yesShares[msg.sender] : noShares[msg.sender];
        if (userShares == 0) {
            return 0;
        }

        uint256 winningPool = outcome ? yesPool : noPool;
        uint256 totalPool = yesPool + noPool;
        payout = (userShares * totalPool) / winningPool;

        // Zero out before transfer (CEI pattern)
        if (outcome) {
            yesShares[msg.sender] = 0;
        } else {
            noShares[msg.sender] = 0;
        }

        (bool ok, ) = payable(msg.sender).call{value: payout}("");
        require(ok, "transfer failed");
        emit Claimed(msg.sender, payout);
    }
}
