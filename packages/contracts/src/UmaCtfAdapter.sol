// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "openzeppelin-contracts/token/ERC20/IERC20.sol";
import {IConditionalTokens} from "ctf-exchange/exchange/interfaces/IConditionalTokens.sol";
import {IOptimisticOracleV2} from "./interfaces/IOptimisticOracleV2.sol";

/// @title UmaCtfAdapter
/// @notice Resolves Verex CTF conditions from UMA's Optimistic Oracle instead of
///         from the operator's own key.
///
/// @dev WHY THIS IS A CONTRACT AND NOT A SETTING.
///      A CTF condition's identity is derived by hashing the oracle's address:
///
///          conditionId = keccak256(abi.encodePacked(oracle, questionId, 2))
///
///      So "who may report the result" is baked into the market's identity. This
///      adapter registers *itself* as that oracle at prepare time, which means:
///        - it must be deployed BEFORE any market that uses it, and
///        - a live market can never be migrated to a different oracle; pointing
///          at one computes a different conditionId, i.e. a different market
///          holding none of the original positions.
///      The choice between operator resolution and UMA is therefore made per
///      market, at creation, and is permanent.
///
/// @dev TRUST MODEL. Anyone may call `resolve` — it is not privileged, because
///      it has no discretion: it copies whatever UMA settled on. The only
///      privileged action is `initialize`, which spends the adapter's reward
///      budget. Making resolution permissionless is deliberate; if it required
///      the operator, an absent operator could strand every payout, which is
///      the failure mode UMA is here to remove.
contract UmaCtfAdapter {
    /// @dev UMA's identifier for free-text yes/no questions. Answers come back
    ///      as 1e18 = YES, 0 = NO, 0.5e18 = unresolvable.
    bytes32 public constant YES_OR_NO_QUERY = "YES_OR_NO_QUERY";

    int256 private constant YES = 1 ether;
    int256 private constant NO = 0;
    int256 private constant UNRESOLVABLE = 0.5 ether;

    IConditionalTokens public immutable ctf;
    IOptimisticOracleV2 public immutable oo;
    address public immutable admin;

    struct Question {
        uint256 requestTimestamp; // part of the OO request key; 0 = uninitialised
        address creator;
        address rewardToken;
        uint256 reward;
        uint256 bond;
        bytes ancillaryData; // the question text UMA voters actually read
        bool resolved;
    }

    mapping(bytes32 => Question) internal questions;

    event QuestionInitialized(
        bytes32 indexed questionId, bytes32 indexed conditionId, uint256 requestTimestamp, bytes ancillaryData
    );
    event QuestionResolved(bytes32 indexed questionId, int256 settledPrice, uint256[] payouts);

    error NotAdmin();
    error AlreadyInitialized();
    error NotInitialized();
    error AlreadyResolved();
    error InvalidAncillaryData();
    error UnsupportedPrice(int256 price);

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    constructor(address _ctf, address _oo, address _admin) {
        ctf = IConditionalTokens(_ctf);
        oo = IOptimisticOracleV2(_oo);
        admin = _admin;
    }

    /// @notice Prepare a CTF condition owned by this adapter and ask UMA the question.
    /// @param ancillaryData The question as UMA voters will read it. This is the
    ///        entire basis on which a human decides the answer, so it must carry
    ///        its own resolution criteria — a bare question with no rules is how
    ///        a market ends up settled "unresolvable".
    /// @param rewardToken Must be on UMA's AddressWhitelist. Verex's MockUSDC is
    ///        NOT; Sepolia WETH (0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9) is,
    ///        and is self-service via deposit().
    /// @param reward Paid to whoever proposes an answer. May be 0.
    /// @param bond Extra bond on top of UMA's final fee. This is the security
    ///        parameter: it must exceed what a liar could earn from the market.
    /// @param liveness Challenge window in seconds; 0 keeps UMA's 7200s default.
    function initialize(
        bytes memory ancillaryData,
        address rewardToken,
        uint256 reward,
        uint256 bond,
        uint256 liveness
    ) external onlyAdmin returns (bytes32 questionId, bytes32 conditionId) {
        if (ancillaryData.length == 0) revert InvalidAncillaryData();

        questionId = keccak256(ancillaryData);
        if (questions[questionId].requestTimestamp != 0) revert AlreadyInitialized();

        uint256 requestTimestamp = block.timestamp;

        questions[questionId] = Question({
            requestTimestamp: requestTimestamp,
            creator: msg.sender,
            rewardToken: rewardToken,
            reward: reward,
            bond: bond,
            ancillaryData: ancillaryData,
            resolved: false
        });

        // The adapter is the oracle in this hash — see the contract-level note.
        ctf.prepareCondition(address(this), questionId, 2);
        conditionId = keccak256(abi.encodePacked(address(this), questionId, uint256(2)));

        if (reward > 0) {
            IERC20(rewardToken).approve(address(oo), reward);
        }
        oo.requestPrice(YES_OR_NO_QUERY, requestTimestamp, ancillaryData, rewardToken, reward);
        if (bond > 0) {
            oo.setBond(YES_OR_NO_QUERY, requestTimestamp, ancillaryData, bond);
        }
        if (liveness > 0) {
            oo.setCustomLiveness(YES_OR_NO_QUERY, requestTimestamp, ancillaryData, liveness);
        }

        emit QuestionInitialized(questionId, conditionId, requestTimestamp, ancillaryData);
    }

    /// @notice Copy UMA's settled answer onto the CTF condition. Permissionless.
    /// @dev Reverts until liveness has expired (or a dispute has been voted on) —
    ///      that revert comes from `settleAndGetPrice`, not from here, so the
    ///      adapter never has to track the request's own state machine.
    function resolve(bytes32 questionId) external {
        Question storage q = questions[questionId];
        if (q.requestTimestamp == 0) revert NotInitialized();
        if (q.resolved) revert AlreadyResolved();

        int256 price = oo.settleAndGetPrice(YES_OR_NO_QUERY, q.requestTimestamp, q.ancillaryData);
        uint256[] memory payouts = _payouts(price);

        // Set before the external call: reportPayouts is itself irreversible, so
        // a re-entrant second call could only ever be a duplicate.
        q.resolved = true;

        ctf.reportPayouts(questionId, payouts);
        emit QuestionResolved(questionId, price, payouts);
    }

    function getQuestion(bytes32 questionId) external view returns (Question memory) {
        return questions[questionId];
    }

    /// @notice Whether `resolve` would succeed right now.
    ///
    /// @dev Reads the request's STATE, not its `settled` flag. That distinction
    ///      is not cosmetic: `settled` means "someone already called
    ///      settleAndGetPrice", so it is false for the entire window in which
    ///      resolving is possible and only flips as a side effect of resolving.
    ///      Gating on it would make `resolve` permanently unreachable.
    ///
    ///      Expired = liveness passed undisputed. Resolved = a dispute went to
    ///      UMA's DVM and was voted on. Both carry an answer; nothing else does.
    function isSettleable(bytes32 questionId) external view returns (bool) {
        Question storage q = questions[questionId];
        if (q.requestTimestamp == 0 || q.resolved) return false;
        IOptimisticOracleV2.State state =
            oo.getState(address(this), YES_OR_NO_QUERY, q.requestTimestamp, q.ancillaryData);
        return state == IOptimisticOracleV2.State.Expired || state == IOptimisticOracleV2.State.Resolved;
    }

    /// @dev CTF payout vector for a binary condition, index 0 = YES, 1 = NO.
    ///      Unresolvable maps to [1,1]: both sides redeem half, which returns
    ///      each holder's collateral rather than handing the whole pot to one
    ///      side on a question that was never actually answered.
    function _payouts(int256 price) internal pure returns (uint256[] memory payouts) {
        payouts = new uint256[](2);
        if (price == YES) {
            payouts[0] = 1;
            payouts[1] = 0;
        } else if (price == NO) {
            payouts[0] = 0;
            payouts[1] = 1;
        } else if (price == UNRESOLVABLE) {
            payouts[0] = 1;
            payouts[1] = 1;
        } else {
            // UMA can in principle return any int256. Refusing anything outside
            // the three defined answers is safer than coercing it — a silent
            // coercion would resolve a market on a value nobody voted for.
            revert UnsupportedPrice(price);
        }
    }
}
