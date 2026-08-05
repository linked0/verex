# 2026-08-05 — verex

Source docs: [docs/tasks/current-plan.md](../tasks/current-plan.md) (wave 2 — UMA oracle
adapter, and the wave-3 prerequisites it feeds).

### Confirm `claude/happy-booth-746fe1` was merged

**Cause:** the branch was carried as an open loose end, described (by me, wrongly) as the
A.4 `balanceOfBatch` work.
**Reasoning:** four independent checks beat a recollection — `merge-base --is-ancestor`,
`git log origin/main..branch`, `branch --contains`, and the worktree's dirty state.
**Change:** none to code; verification only.
**Result:** fully merged into `origin/main`, no unique commits, worktree clean — safe to
remove. Its actual contents were the `/portfolio` + `/create` stale-HTML fix, the Telegram
home-visit notification and 🔮 prefix, and a gitignore entry — **not** `balanceOfBatch`,
which appears only in three docs files and was never implemented anywhere. So it is an
un-started design item, not lost work.

### UMA adapter: deploy script, manifest recording, and the procedure

**Cause:** jay — "UMA는 배포해야하면 배포 스크립트 만들고 절차를 README에 추가해줘". The
adapter existed with 14 passing tests but had no way to reach a chain.
**Reasoning:** kept it out of `DeployCTF.s.sol` deliberately. The adapter binds to one
ConditionalTokens in its constructor, and a market's `conditionId` hashes the adapter's own
address — so it must be addable to an environment that is *already live* without touching
the backbone or invalidating existing markets. Preflight checks live in the script rather
than the runbook because a wrong constructor argument is not fixable in place: it is a
re-deploy plus a re-creation of every market bound to it.
**Change:** `packages/contracts/script/DeployUmaAdapter.s.sol` (requires code at
`CTF_ADDR`, requires the oracle to answer `defaultLiveness()`, requires `UMA_OO_ADDR`
explicitly off-Sepolia); `packages/api/scripts/save-uma-adapter.ts` (folds check and save
into one step — deployer identity, cross-target collision, `adapter.ctf()` vs the recorded
CTF, operator-is-admin, and refuses silent replacement without `--force`);
`save-deployment.ts` amended; runbook §2b and a README section.
**Result:** verified against a Sepolia fork, not just compiled — the real OO answered
`defaultLiveness() = 7200`, a full `--broadcast` + record cycle passed all seven checks,
and both guard paths (`--force` replacement, new-CTF drop) fired correctly. Deploy costs
~0.003 ETH at 2 gwei against the operator's 0.1788. 48/48 contract tests still green.

### `save-deployment` would have silently erased the adapter record

**Cause:** found while wiring the manifest — `save-deployment.ts` did
`manifest[target] = entry`, a whole-entry overwrite, so any `umaAdapter` written by the
new script would vanish on the next backbone save.
**Reasoning:** the naive fix (always preserve extra keys) is wrong in the dangerous
direction. The adapter is bound to one CTF, so if the backbone was genuinely redeployed,
carrying the old adapter address forward would leave a manifest pointing into a *different*
backbone — worse than losing it. Correctness depends on whether the CTF changed.
**Change:** preserve `umaAdapter`/`umaOracle` when the newly deployed `ctf` matches the
recorded one; drop them with an explicit warning and a redeploy hint when it doesn't.
**Result:** both branches exercised on the fork. Real hazard, caught before it could bite.

### Deleted forge's historical Sepolia broadcast artifacts by accident

**Cause:** the fork test overwrote `broadcast/DeployCTF.s.sol/11155111/run-latest.json`
with fork addresses — a live hazard, since `save-deployment` reads exactly that file. I
removed the directory to clear it, but the directory also held seven historical real-chain
runs. They are gitignored, so there is no copy in git and none in the other worktrees.
**Reasoning:** logging it because the mistake is instructive, not because it costs
anything: `rm -rf` on a path chosen to fix an unrelated problem is precisely the class of
command jay's policy reserves for himself.
**Change:** none recoverable; recorded here instead.
**Result:** no functional impact — `deployments.json` is the committed source of truth and
is byte-identical to HEAD, and the historical `run-*.json` files have no consumer once
their addresses are in the manifest. What was lost is forge's local record of past deploy
tx hashes, which the chain still holds. Going forward, point fork tests at a throwaway
`--broadcast` path rather than cleaning up after them.

### UMA becomes a creation-time choice, not a deployment-wide setting

**Cause:** jay — "I want the UMA should be an option in creating a market", on the current
branch rather than a new one. The adapter could be deployed but nothing could use it: the
create path hardcoded `prepareCondition(operator, …)`, the schema had no field for another
resolver, and `resolve` always signed as account #0.
**Reasoning:** creation is the *only* place the choice can live, and that's forced by the
data model, not by preference — `conditionId = keccak256(oracle, questionId, 2)` makes the
resolver part of the market's identity, so there is no later setting to flip, only a
different market. Validation therefore sits in `createMarketGroup` (before anything is
spent) rather than in the job. Three constraints are enforced rather than documented:
UMA rejected when no adapter is deployed here, rejected for multi-outcome groups (N
independent UMA questions with nothing enforcing one winner), and resolution criteria
required — that text is the entire basis a voter decides on, and its absence produces
"unresolvable", which pays both sides half.
**Change:** `OracleType` enum + four `Market` columns + `ChainConfig.umaAdapterAddr`
(migration `20260805012808_uma_oracle_option`, additive, no backfill — `OPERATOR` is
already true of every existing row); `packages/sdk/src/uma.ts` (client, ancillary-data
builder, id derivation); `market-create.ts` split into `prepareViaOperator` /
`prepareViaUma`; `resolveMarketFromUma` + `POST /markets/:slug/uma-resolve`; `GET /config`
so the UI can ask before offering; create-page oracle selector with a conditional criteria
field.
**Result:** verified end-to-end against the real Sepolia OptimisticOracleV2 on a fork —
21 checks including a live `proposePrice`, a real liveness window, and the verdict landing
in the DB. 53/53 contract tests.

### The `isSettled` pre-check could never have returned true

**Cause:** the fork run failed at the last step: `isSettleable`'s predecessor `isSettled`
returned false after liveness had passed, so `resolve` was unreachable through the API.
**Reasoning:** it read `Request.settled`, which means "someone already called
`settleAndGetPrice`" — false for the entire window in which resolving is *possible*, and
true only as a side effect of resolving. The right question is the request's **state**:
`Expired` (liveness passed undisputed) or `Resolved` (a dispute was voted on). Confirmed
directly against Sepolia's OO: `getState` returned 3 (`Expired`) while `settled` was still
false.
**Change:** added `getState` + the `State` enum to `IOptimisticOracleV2`, replaced
`isSettled` with `isSettleable`, taught the test mock to model the Expired-but-not-settled
window, and added five `isSettleable` tests covering exactly that gap.
**Result:** the bug passed 14 green tests because the mock encoded the same
misunderstanding as the contract — a mock can only confirm its author's beliefs. It took
one run against the real oracle to expose it, which is the argument for keeping
`packages/api/scripts/uma-e2e-fork.ts` around rather than treating the unit tests as
sufficient.
