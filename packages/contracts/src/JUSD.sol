// SPDX-License-Identifier: MIT
// Pragma is ^0.8.15 (not ^0.8.24) so this file shares a compilation unit with
// Polymarket's CTFExchange.sol (which pins solc to 0.8.15) when both are used
// in DeployCTF.s.sol. Nothing here requires 0.8.24-specific features.
pragma solidity ^0.8.15;

/// @notice jUSD — the Jayverse dollar, used as CTF collateral in tests and
///         standalone anvil deploys. 6 decimals; open mint for test convenience.
///
///         This is a *local* copy, deliberately not an import of
///         jayverse-token's JUSD.sol: that one is ^0.8.28 and pulls in
///         OpenZeppelin's ERC20, which cannot share a compile unit with
///         CTFExchange's pinned 0.8.15. On a shared chain (the devnet) do not
///         deploy this at all — pass the canonical jUSD address via
///         COLLATERAL_ADDRESS so there is exactly one jUSD per chain.
///
///         Previously `JUSD`/`jUSD`. Renamed once the devnet began forking
///         Circle's real Sepolia jUSD, at which point two unrelated tokens
///         answered to the same name (jay, 2026-09-15).
contract JUSD {
    string public constant name = "Jayverse USD";
    string public constant symbol = "jUSD";
    uint8 public constant decimals = 6;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "insufficient allowance");
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(balanceOf[from] >= amount, "insufficient balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
