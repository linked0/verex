// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal surface of UMA's OptimisticOracleV2 that the adapter uses.
/// @dev Deliberately hand-written rather than importing UMA's protocol package:
///      that package pulls a large dependency tree pinned to older solc, and we
///      need six functions. Sepolia deployment:
///      0x9f1263B8f0355673619168b5B8c0248f1d03e88C
interface IOptimisticOracleV2 {
    /// @dev UMA's request lifecycle. The ordering matters — these are compared
    ///      by value, so they must match UMA's own enum exactly.
    ///
    ///      Expired is the state that matters to us: liveness has passed with
    ///      no dispute, so the answer can be settled. It is NOT the same as
    ///      Settled, which only happens once someone calls settleAndGetPrice.
    enum State {
        Invalid,
        Requested,
        Proposed,
        Expired,
        Disputed,
        Resolved,
        Settled
    }

    /// @dev Mirrors UMA's Request struct field order — `getRequest` decodes
    ///      into this, so the layout must match exactly.
    struct Request {
        address proposer;
        address disputer;
        address currency;
        bool settled;
        bool refundOnDispute;
        int256 proposedPrice;
        int256 resolvedPrice;
        uint256 expirationTime;
        uint256 reward;
        uint256 finalFee;
        uint256 bond;
        uint256 customLiveness;
    }

    function requestPrice(
        bytes32 identifier,
        uint256 timestamp,
        bytes memory ancillaryData,
        address currency,
        uint256 reward
    ) external returns (uint256 totalBond);

    /// @dev Raises the bond above the protocol's final fee. A larger bond makes
    ///      a false proposal more expensive than the profit from lying.
    function setBond(bytes32 identifier, uint256 timestamp, bytes memory ancillaryData, uint256 bond)
        external
        returns (uint256 totalBond);

    /// @dev Shortens the challenge window from UMA's 7200s default. Used for
    ///      demos; on mainnet the default exists for a reason.
    function setCustomLiveness(
        bytes32 identifier,
        uint256 timestamp,
        bytes memory ancillaryData,
        uint256 customLiveness
    ) external;

    /// @dev Reverts unless the request has passed liveness (or been voted on).
    function settleAndGetPrice(bytes32 identifier, uint256 timestamp, bytes memory ancillaryData)
        external
        returns (int256);

    function getRequest(address requester, bytes32 identifier, uint256 timestamp, bytes memory ancillaryData)
        external
        view
        returns (Request memory);

    /// @dev Where a request is in its lifecycle. This is the only reliable way
    ///      to ask "can this be settled now" — `Request.settled` answers the
    ///      different question "has someone already settled it", and stays
    ///      false right up until the settling call itself.
    function getState(address requester, bytes32 identifier, uint256 timestamp, bytes memory ancillaryData)
        external
        view
        returns (State);
}
