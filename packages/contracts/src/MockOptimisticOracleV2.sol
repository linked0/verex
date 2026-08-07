// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "openzeppelin-contracts/token/ERC20/IERC20.sol";
import {IOptimisticOracleV2} from "./interfaces/IOptimisticOracleV2.sol";

/// @title MockOptimisticOracleV2
/// @notice A self-contained stand-in for UMA's OptimisticOracleV2 whose DVM is a
///         simple on-chain jury: any address may cast one vote on a disputed
///         request, and a majority of votes becomes the verdict.
///
/// @dev WHY THIS EXISTS. Against the real oracle, only half of the dispute
///      story is demonstrable: propose → dispute → frozen. The other half — the
///      DVM verdict that unfreezes it — needs staked UMA voters in a ~2-day
///      commit/reveal round, which no demo can wait for and no testnet
///      reliably provides. This mock replaces exactly that half. The demo
///      wallets ARE the jury, so all three worst-case scenarios become
///      walkable in a browser: dispute defeated, dispute upheld, and (on the
///      real oracle) dispute as a dead end.
///
///      `UmaCtfAdapter` is deliberately UNCHANGED — it is constructed with this
///      contract's address instead of the real oracle's, and never knows the
///      difference. That is the same property that makes the real adapter
///      trustworthy: it has no discretion, it just copies what the oracle
///      settled.
///
/// @dev SIMPLIFICATIONS vs the real OOv2, all deliberate:
///        - votes are one-address-one-vote, not stake-weighted; a tie settles
///          "unresolvable" (0.5e18) — both simple and instructive;
///        - the final fee is zero: the only stake is the request's bond;
///        - the winner of a dispute takes the loser's WHOLE bond (real UMA
///          burns half); the reward goes to whichever side won;
///        - anyone may finalize a vote once at least one ballot is in — a demo
///          jury has no fixed roster, so quorum is the caller's judgment.
contract MockOptimisticOracleV2 {
    int256 private constant UNRESOLVABLE = 0.5 ether;
    uint256 public constant DEFAULT_LIVENESS = 7200;

    struct RequestData {
        address requester;
        IOptimisticOracleV2.Request req;
    }

    struct Ballot {
        address voter;
        int256 answer;
    }

    mapping(bytes32 => RequestData) internal requests;
    mapping(bytes32 => Ballot[]) internal ballots;
    mapping(bytes32 => mapping(address => bool)) internal hasVoted;
    mapping(bytes32 => bool) internal voteFinalized;

    event PriceRequested(address indexed requester, bytes32 key);
    event PriceProposed(address indexed proposer, bytes32 key, int256 price);
    event PriceDisputed(address indexed disputer, bytes32 key);
    event VoteCast(address indexed voter, bytes32 key, int256 answer);
    event VoteFinalized(bytes32 key, int256 verdict, uint256 ballotCount);
    event Settled(bytes32 key, int256 price);

    error UnknownRequest();
    error WrongState(IOptimisticOracleV2.State actual);
    error OnlyRequester();
    error AlreadyProposed();
    error AlreadyVoted();
    error NoBallots();

    // ---------------------------------------------------------------- keys --

    function _key(address requester, bytes32 identifier, uint256 timestamp, bytes memory ancillaryData)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(requester, identifier, timestamp, ancillaryData));
    }

    function _request(address requester, bytes32 identifier, uint256 timestamp, bytes memory ancillaryData)
        internal
        view
        returns (bytes32 key, RequestData storage rd)
    {
        key = _key(requester, identifier, timestamp, ancillaryData);
        rd = requests[key];
        if (rd.requester == address(0)) revert UnknownRequest();
    }

    // ------------------------------------------------- requester-side (adapter)

    /// @dev Mirrors the real OO: called by the requester (the adapter). Reward,
    ///      if any, is escrowed here and paid out at settlement.
    function requestPrice(
        bytes32 identifier,
        uint256 timestamp,
        bytes memory ancillaryData,
        address currency,
        uint256 reward
    ) external returns (uint256) {
        bytes32 key = _key(msg.sender, identifier, timestamp, ancillaryData);
        RequestData storage rd = requests[key];
        require(rd.requester == address(0), "already requested");

        rd.requester = msg.sender;
        rd.req.currency = currency;
        rd.req.reward = reward;
        if (reward > 0) IERC20(currency).transferFrom(msg.sender, address(this), reward);

        emit PriceRequested(msg.sender, key);
        return 0;
    }

    function setBond(bytes32 identifier, uint256 timestamp, bytes memory ancillaryData, uint256 bond)
        external
        returns (uint256)
    {
        (, RequestData storage rd) = _request(msg.sender, identifier, timestamp, ancillaryData);
        if (rd.req.proposer != address(0)) revert AlreadyProposed();
        rd.req.bond = bond;
        return bond;
    }

    function setCustomLiveness(bytes32 identifier, uint256 timestamp, bytes memory ancillaryData, uint256 liveness)
        external
    {
        (, RequestData storage rd) = _request(msg.sender, identifier, timestamp, ancillaryData);
        if (rd.req.proposer != address(0)) revert AlreadyProposed();
        rd.req.customLiveness = liveness;
    }

    // ------------------------------------------------------ public lifecycle --

    /// @notice Propose an answer, posting the request's bond.
    function proposePrice(
        address requester,
        bytes32 identifier,
        uint256 timestamp,
        bytes memory ancillaryData,
        int256 price
    ) external {
        (bytes32 key, RequestData storage rd) = _request(requester, identifier, timestamp, ancillaryData);
        IOptimisticOracleV2.State s = _state(key, rd);
        if (s != IOptimisticOracleV2.State.Requested) revert WrongState(s);

        rd.req.proposer = msg.sender;
        rd.req.proposedPrice = price;
        uint256 liveness = rd.req.customLiveness > 0 ? rd.req.customLiveness : DEFAULT_LIVENESS;
        rd.req.expirationTime = block.timestamp + liveness;
        if (rd.req.bond > 0) IERC20(rd.req.currency).transferFrom(msg.sender, address(this), rd.req.bond);

        emit PriceProposed(msg.sender, key, price);
    }

    /// @notice Dispute the current proposal, posting a matching bond. Moves the
    ///         request into the jury phase — it can no longer expire quietly.
    function disputePrice(address requester, bytes32 identifier, uint256 timestamp, bytes memory ancillaryData)
        external
    {
        (bytes32 key, RequestData storage rd) = _request(requester, identifier, timestamp, ancillaryData);
        IOptimisticOracleV2.State s = _state(key, rd);
        if (s != IOptimisticOracleV2.State.Proposed) revert WrongState(s);

        rd.req.disputer = msg.sender;
        if (rd.req.bond > 0) IERC20(rd.req.currency).transferFrom(msg.sender, address(this), rd.req.bond);

        emit PriceDisputed(msg.sender, key);
    }

    /// @notice Cast one vote on a disputed request. One vote per address; the
    ///         proposer and disputer may vote too — their bonds are their real
    ///         ballots, but excluding them would complicate the demo for no
    ///         security gain (this is a mock).
    function vote(
        address requester,
        bytes32 identifier,
        uint256 timestamp,
        bytes memory ancillaryData,
        int256 answer
    ) external {
        (bytes32 key, RequestData storage rd) = _request(requester, identifier, timestamp, ancillaryData);
        IOptimisticOracleV2.State s = _state(key, rd);
        if (s != IOptimisticOracleV2.State.Disputed) revert WrongState(s);
        if (hasVoted[key][msg.sender]) revert AlreadyVoted();

        hasVoted[key][msg.sender] = true;
        ballots[key].push(Ballot({voter: msg.sender, answer: answer}));
        emit VoteCast(msg.sender, key, answer);
    }

    /// @notice Close the jury and record the verdict: the answer with the most
    ///         votes; a tie settles "unresolvable" (0.5e18). Callable by anyone
    ///         once at least one ballot is in.
    function finalizeVote(address requester, bytes32 identifier, uint256 timestamp, bytes memory ancillaryData)
        external
    {
        (bytes32 key, RequestData storage rd) = _request(requester, identifier, timestamp, ancillaryData);
        IOptimisticOracleV2.State s = _state(key, rd);
        if (s != IOptimisticOracleV2.State.Disputed) revert WrongState(s);
        Ballot[] storage list = ballots[key];
        if (list.length == 0) revert NoBallots();

        // O(n²) tally — fine for a jury of demo wallets, and it avoids any
        // bound on what answers may be voted for.
        int256 verdict = UNRESOLVABLE;
        uint256 best = 0;
        bool tie = false;
        for (uint256 i = 0; i < list.length; i++) {
            uint256 count = 0;
            for (uint256 j = 0; j < list.length; j++) {
                if (list[j].answer == list[i].answer) count++;
            }
            if (count > best) {
                best = count;
                verdict = list[i].answer;
                tie = false;
            } else if (count == best && list[i].answer != verdict) {
                tie = true;
            }
        }
        if (tie) verdict = UNRESOLVABLE;

        rd.req.resolvedPrice = verdict;
        voteFinalized[key] = true;
        emit VoteFinalized(key, verdict, list.length);
    }

    /// @notice Settle and pay out. Called by the requester (the adapter's
    ///         `resolve`). Undisputed: proposer gets bond + reward back.
    ///         Disputed: whoever the verdict sided with takes both bonds and
    ///         the reward.
    function settleAndGetPrice(bytes32 identifier, uint256 timestamp, bytes memory ancillaryData)
        external
        returns (int256)
    {
        (bytes32 key, RequestData storage rd) = _request(msg.sender, identifier, timestamp, ancillaryData);
        IOptimisticOracleV2.State s = _state(key, rd);

        int256 price;
        address payee;
        uint256 amount = rd.req.reward;
        if (s == IOptimisticOracleV2.State.Expired) {
            price = rd.req.proposedPrice;
            payee = rd.req.proposer;
            amount += rd.req.bond;
        } else if (s == IOptimisticOracleV2.State.Resolved) {
            price = rd.req.resolvedPrice;
            bool proposerWon = rd.req.resolvedPrice == rd.req.proposedPrice;
            payee = proposerWon ? rd.req.proposer : rd.req.disputer;
            amount += rd.req.bond * 2;
        } else {
            revert WrongState(s);
        }

        rd.req.settled = true;
        if (amount > 0 && payee != address(0)) IERC20(rd.req.currency).transfer(payee, amount);

        emit Settled(key, price);
        return price;
    }

    // ----------------------------------------------------------------- views --

    function getRequest(address requester, bytes32 identifier, uint256 timestamp, bytes memory ancillaryData)
        external
        view
        returns (IOptimisticOracleV2.Request memory)
    {
        (, RequestData storage rd) = _request(requester, identifier, timestamp, ancillaryData);
        return rd.req;
    }

    function getState(address requester, bytes32 identifier, uint256 timestamp, bytes memory ancillaryData)
        external
        view
        returns (IOptimisticOracleV2.State)
    {
        bytes32 key = _key(requester, identifier, timestamp, ancillaryData);
        RequestData storage rd = requests[key];
        if (rd.requester == address(0)) return IOptimisticOracleV2.State.Invalid;
        return _state(key, rd);
    }

    /// @notice The jury's ballots so far — the UI reads this to draw the vote
    ///         panel without event scraping.
    function getBallots(address requester, bytes32 identifier, uint256 timestamp, bytes memory ancillaryData)
        external
        view
        returns (address[] memory voters, int256[] memory answers)
    {
        bytes32 key = _key(requester, identifier, timestamp, ancillaryData);
        Ballot[] storage list = ballots[key];
        voters = new address[](list.length);
        answers = new int256[](list.length);
        for (uint256 i = 0; i < list.length; i++) {
            voters[i] = list[i].voter;
            answers[i] = list[i].answer;
        }
    }

    function _state(bytes32 key, RequestData storage rd) internal view returns (IOptimisticOracleV2.State) {
        if (rd.req.settled) return IOptimisticOracleV2.State.Settled;
        if (voteFinalized[key]) return IOptimisticOracleV2.State.Resolved;
        if (rd.req.disputer != address(0)) return IOptimisticOracleV2.State.Disputed;
        if (rd.req.proposer != address(0)) {
            return block.timestamp >= rd.req.expirationTime
                ? IOptimisticOracleV2.State.Expired
                : IOptimisticOracleV2.State.Proposed;
        }
        return IOptimisticOracleV2.State.Requested;
    }
}
