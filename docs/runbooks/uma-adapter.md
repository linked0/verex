# Runbook: the UMA oracle adapter

Optional per environment. Skip all of this if markets are resolved by the operator key —
that is the default and nothing here is required for it.

`UmaCtfAdapter` lets a market's result come from UMA's Optimistic Oracle instead of from
you. Its point is that payouts stop depending on the operator being present or honest:
`resolve` is permissionless, so an absent operator cannot strand anyone's winnings.

> **Read this before deploying.** A CTF condition's id is
> `keccak256(oracle, questionId, 2)`, so the resolver's address is part of every market's
> identity. That has three consequences that shape everything below:
> 1. the adapter must exist **before** any market that uses it;
> 2. a live market can **never** be repointed at a different oracle — doing so computes a
>    different `conditionId`, i.e. a different market holding none of the original positions;
> 3. so the oracle is chosen **once, per market, at creation**, and there is no edit screen.

---

## 0. Prerequisites

| | |
|---|---|
| Backbone deployed + recorded | `deployments.json` has a `<target>` entry (deploy.md §2) |
| Operator gas | ≥ 0.01 ETH — deploy is ~0.003 at 2 gwei, each market's `initialize` costs more |
| **Bond currency** | **WETH**, ≥ 0.011 per market you intend to resolve |
| foundry | `forge`, `cast` on PATH |

**WETH is the one that catches people.** UMA only accepts bond currencies on its
`AddressWhitelist`, and **Verex's MockUSDC is not on it**. Sepolia WETH is, and is
self-service:

```bash
set -a; source packages/contracts/.env; set +a
cast send 0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9 "deposit()" \
  --value 0.05ether --private-key $VEREX_OPERATOR_KEY --rpc-url $VEREX_RPC_URL
```

Per proposal a proposer posts `finalFee + bond` = **0.001 + 0.01 = 0.011 WETH**. That is a
**deposit, not a cost** — an honest proposer gets it back at settlement. 0.05 WETH covers
about four concurrent proposals.

Sepolia addresses, verified 2026-08-03 (`current-plan.md`, G4 result):

| Contract | Address |
|---|---|
| `OptimisticOracleV2` | `0x9f1263B8f0355673619168b5B8c0248f1d03e88C` |
| `Store` (final fee) | `0x39e7FFA77A4ac4D34021C6BbE4C8778d47F684F2` |
| `AddressWhitelist` | `0xE8DE4bcE27f6214dcE18D8a7629f233C66A97B84` |
| WETH | `0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9` |

---

## 1. Deploy

```bash
DRY_RUN=1 ./scripts/deploy-uma-adapter.sh staging   # preflight only, broadcasts nothing
./scripts/deploy-uma-adapter.sh staging             # deploy + record
```

The script pairs the two steps that must happen in one sitting — the forge deploy and
`save-uma-adapter` — because forge's `broadcast/run-latest.json` is per **chain id** and
staging/prod share Sepolia. Leave a gap and the next deploy on that chain overwrites the
artifact the recorder reads.

**Preflight (`DRY_RUN=1`) reports, before spending anything:**

| Check | Behaviour |
|---|---|
| existing `umaAdapter` for this target | **stops** unless `FORCE=1` — a new adapter cannot inherit the old one's markets |
| operator ETH | warns under 0.01 |
| operator WETH | warns at zero, prints the `deposit()` command |

**The forge script itself refuses to deploy** without code at `CTF_ADDR`, without an oracle
that answers `defaultLiveness()` (so a wrong address can't pass as an oracle), or with the
Sepolia default address on any other chain. A wrong constructor argument is not fixable in
place — it's a redeploy plus re-creating every market bound to it.

**`save-uma-adapter` then verifies, before writing:** the broadcast's deployer is
`$VEREX_OPERATOR_KEY`; the address isn't already recorded under the *other* target;
`adapter.ctf()` matches this target's recorded CTF; and the operator is `admin()` — only
admin can initialize questions, so an adapter admin'd by a key you don't hold is unusable.

Then **review and commit the `deployments.json` diff** — the seed reads it from git.

```bash
./scripts/deploy-uma-adapter.sh prod    # same, when you want it there
```

> **Redeploying the backbone invalidates the adapter** — it is bound to one CTF by its
> constructor. `save-deployment` handles this: it keeps `umaAdapter` when the CTF is
> unchanged and drops it with a warning when it isn't. If it drops, redeploy the adapter.

---

## 2. Seed

Re-seed so the environment gets its UMA-resolved market:

```bash
VEREX_DEPLOY_TARGET=staging pnpm --filter @verex/api seed
```

The seed creates **one** UMA market (`uma-eth-above-6k-2026`), and only where the manifest
carries a `umaAdapter`. Without one it logs `[4b] no UMA adapter in the manifest — skipping`
and seeds normally — the adapter is not a dependency of seeding.

Everything else the seed creates stays operator-resolved. The UMA market exists so a fresh
environment has something to exercise the propose → resolve path against without anyone
hand-crafting a market first.

---

## 3. Creating UMA markets from the app

Once recorded, `/create` offers **Resolution source → UMA oracle**. Three rules the form
enforces rather than documents:

| Rule | Why |
|---|---|
| Hidden unless this environment has an adapter | asks `GET /config` first — better than offering it and failing |
| **Binary Yes/No only** | each member of a group would be an independent UMA question, with nothing enforcing that exactly one settles Yes |
| **Resolution criteria required** (≥20 chars) | that text is the entire basis a voter decides on; without it the likely settlement is *unresolvable*, which pays both sides half |

---

## 4. Per-market lifecycle

Deploying the adapter creates no market, and creating a market does not resolve it.

1. **`initialize`** — admin-only, happens inside market creation. Prepares the CTF
   condition *and* opens the UMA request.
2. **Propose an answer.** With `reward = 0` (our default) nobody is paid to propose, so on
   staging you propose. `1e18` = YES, `0` = NO, `0.5e18` = unresolvable.
3. **Wait out liveness** — 1 hour for seeded/app-created markets (UMA's default is 7200s).
4. **Resolve** — `POST /markets/<slug>/uma-resolve`. Permissionless; returns **409** while
   UMA hasn't settled.
5. **Redeem** — unchanged, winners redeem through the CTF as usual.

```bash
# 2. propose YES
ADAPTER=$(node -p "require('./packages/contracts/deployments.json').staging.umaAdapter")
# read the request's timestamp + exact ancillary bytes back from the adapter
cast call $ADAPTER \
  'getQuestion(bytes32)((uint256,address,address,uint256,uint256,bytes,bool))' \
  <questionId> --rpc-url $VEREX_RPC_URL

cast send 0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9 \
  'approve(address,uint256)' 0x9f1263B8f0355673619168b5B8c0248f1d03e88C 11000000000000000 \
  --private-key $VEREX_OPERATOR_KEY --rpc-url $VEREX_RPC_URL

cast send 0x9f1263B8f0355673619168b5B8c0248f1d03e88C \
  'proposePrice(address,bytes32,uint256,bytes,int256)' \
  $ADAPTER $(cast format-bytes32-string "YES_OR_NO_QUERY") \
  <requestTimestamp> <ancillaryDataHex> 1000000000000000000 \
  --private-key $VEREX_OPERATOR_KEY --rpc-url $VEREX_RPC_URL

# 3–4. after liveness
cast call $ADAPTER 'isSettleable(bytes32)(bool)' <questionId> --rpc-url $VEREX_RPC_URL
curl -X POST "$API_URL/markets/<slug>/uma-resolve"
```

`questionId` is `Market.questionId`; the ancillary hex is `toHex(Market.umaAncillaryData)`.

> **Check `isSettleable`, never the request's `settled` flag.** `settled` means "someone
> already called `settleAndGetPrice`" — it is false for the entire window in which
> resolving is possible and only flips as a side effect of resolving. Gating on it makes
> `resolve` unreachable. This was a real bug, caught only against the live oracle.

**The operator endpoint refuses UMA markets outright.** An operator `reportPayouts` on an
adapter-owned condition does not revert — the CTF derives the condition from `msg.sender`,
so it would silently report on a *different* condition, leaving the real one unresolved
forever.

---

## 5. Testing locally

**UMA does not exist on a plain anvil chain.** There is no mock deployment to point at, so
local testing forks Sepolia — which is better anyway: it tests against the real oracle
rather than against our understanding of it.

### 5a. Automated — one command, 21 assertions

```bash
# 1. fork Sepolia on a spare port
set -a; source packages/contracts/.env; set +a
anvil --fork-url $VEREX_RPC_URL --chain-id 11155111 --port 8546 --silent &

# 2. give the operator fork ETH (fork balances are real, top up to be safe)
OP=$(cast wallet address $VEREX_OPERATOR_KEY)
cast rpc anvil_setBalance $OP 0x8AC7230489E80000 --rpc-url http://127.0.0.1:8546

# 3. deploy the adapter onto the fork
cd packages/contracts
CTF_ADDR=$(node -p "require('./deployments.json').staging.ctf") \
  forge script script/DeployUmaAdapter.s.sol --rpc-url http://127.0.0.1:8546 --broadcast
cd ../..

# 4. run the lifecycle
cd packages/api
ADAPTER=<address printed above> \
VEREX_RPC_URL=http://127.0.0.1:8546 VEREX_CHAIN_ID=11155111 \
  pnpm exec tsx scripts/uma-e2e-fork.ts
```

It creates a market through the API's own path, proposes YES on the **real** oracle, warps
past liveness, resolves, and checks the verdict landed in the DB. Expected tail:

```
✓ proposed YES on the real OptimisticOracleV2
✓ isSettleable true after liveness, before resolving
✓ payout vector [1,0] read back from the CTF, not assumed
✓ Yes settled at 1.00

✓ all UMA end-to-end checks passed
```

**It is destructive to the local DB** — it rewrites `ChainConfig` and creates a market. Run
`./scripts/reset.sh` afterwards to get local dev back (it needs plain anvil on 8545).

Why keep this around rather than trust the unit tests: the `isSettled` bug above passed 14
green tests, because the mock encoded the same misunderstanding as the contract. A mock can
only confirm its author's beliefs.

### 5b. Manual — clicking through the UI

Same fork, but drive it from the browser:

```bash
# after steps 1–3 above, record the fork adapter in the manifest
VEREX_RPC_URL=http://127.0.0.1:8546 \
  pnpm --filter @verex/api save-uma-adapter staging

VEREX_DEPLOY_TARGET=staging VEREX_RPC_URL=http://127.0.0.1:8546 \
  pnpm --filter @verex/api seed

VEREX_RPC_URL=http://127.0.0.1:8546 pnpm --filter @verex/api dev
pnpm --filter @verex/web dev
```

Then open `/create` — **Resolution source → UMA oracle** should be selectable, and the
seeded `uma-eth-above-6k-2026` market should be present.

> **Revert the manifest afterwards.** Step 2 writes a *fork* address into the committed
> `deployments.json`: `git checkout packages/contracts/deployments.json`. Forgetting this
> is how a fork address reaches staging.

To skip the 1-hour wait when driving it manually, warp the fork forward:

```bash
cast rpc evm_increaseTime 4000 --rpc-url http://127.0.0.1:8546
cast rpc evm_mine --rpc-url http://127.0.0.1:8546
```

### 5c. Contract-level only

```bash
pnpm --filter @verex/contracts test        # 53 tests; 19 cover the adapter
```

No chain, no fork. Covers the payout mapping, admin gating, permissionless resolve, the
`isSettleable` window, and a full lifecycle including redemption — but against a **mock**
oracle, so it proves the adapter is self-consistent, not that it matches UMA. That is what
5a is for.

---

## 6. Troubleshooting

| Symptom | Cause |
|---|---|
| `initialize` reverts `AlreadyInitialized` | questionId is `keccak256(ancillaryData)`, so identical question text = the same on-chain question. The slug is folded into the ancillary data to prevent this — a collision means two markets share a slug *and* text |
| `initialize` reverts on transfer | `reward > 0` and the **adapter** doesn't hold the reward token — `requestPrice` pulls from the caller, and the caller is the adapter, not you |
| `requestPrice` reverts on currency | reward token isn't on UMA's `AddressWhitelist` — MockUSDC never is |
| `uma-resolve` returns **409** | no proposal yet, or liveness hasn't expired. Check `isSettleable` |
| `resolve` reverts `UnsupportedPrice` | UMA settled something other than 1e18 / 0 / 0.5e18. Deliberate: coercing it would resolve a market on a value nobody voted for |
| Market settles "unresolvable" (both sides get half) | the ancillary data gave voters no basis to decide. This is a question-writing failure, not a bug |
| UMA option missing from `/create` | this environment has no adapter recorded — check `GET /config` |

---

## See also

- [deploy.md](deploy.md) — the environment deploy this hangs off (§2b links back here)
- [current-plan.md](../tasks/current-plan.md) — G4 result, and the "≥1 market per adapter" milestone
- `packages/contracts/src/UmaCtfAdapter.sol` — the trust-model comments live at the top
