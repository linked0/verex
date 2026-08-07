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

## 4b. Worst case: simulating a dispute

The dispute mechanism has two halves, and **only the first half is simulatable**:

| Half | Simulatable? |
|---|---|
| propose → dispute → market frozen | yes — commands below |
| the DVM verdict that unfreezes it | no — needs real staked voters in a ~2-day commit/reveal round; on Sepolia's test DVM a disputed request may simply never settle |

> ⚠️ **Never dispute the seeded `uma-eth-above-6k-2026`** — a disputed market stays
> frozen until the DVM rules, which on a testnet can be forever. Create a THROWAWAY
> UMA market on `/create` and dispute that one.

The disputer must be a *different* wallet than the proposer — demo wallet #1 works.
It was funded 0.01 ETH at setup, which is not enough for the 0.011 WETH bond plus gas,
so top it up first:

```bash
set -a; source packages/contracts/.env; set +a
MNEMONIC=$(gcloud secrets versions access latest --secret=verex-demo-mnemonic-verex)
W1_KEY=$(cast wallet private-key --mnemonic "$MNEMONIC" --mnemonic-index 1)
W1=$(cast wallet address $W1_KEY)

# 1. top up wallet #1 from the operator (bond 0.01 + final fee 0.001 + gas)
cast send $W1 --value 0.02ether --private-key $VEREX_OPERATOR_KEY --rpc-url $VEREX_RPC_URL

# 2. wrap ETH → WETH and approve the oracle for bond + final fee
WETH=0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9
OO=0x9f1263B8f0355673619168b5B8c0248f1d03e88C
cast send $WETH 'deposit()' --value 0.011ether --private-key $W1_KEY --rpc-url $VEREX_RPC_URL
cast send $WETH 'approve(address,uint256)' $OO 11000000000000000 \
  --private-key $W1_KEY --rpc-url $VEREX_RPC_URL

# 3. dispute — same request params as the propose step (§4): the adapter is the
#    requester, and timestamp/ancillary come from getQuestion(<questionId>)
ADAPTER=$(node -p "require('./packages/contracts/deployments.json').staging.umaAdapter")
cast send $OO 'disputePrice(address,bytes32,uint256,bytes)' \
  $ADAPTER $(cast format-bytes32-string "YES_OR_NO_QUERY") \
  <requestTimestamp> <ancillaryDataHex> \
  --private-key $W1_KEY --rpc-url $VEREX_RPC_URL
```

What you should observe afterwards — this IS the worst case, working as designed:

- `isSettleable(<questionId>)` → `false`, indefinitely
- `POST /markets/<slug>/uma-resolve` → **409**, indefinitely
- redeem → 400 (`market is not resolved yet`) — nobody can cash out on a contested answer
- trading on the book stays open; price now expresses the market's guess about the DVM

Economics: whichever side the DVM eventually rules against loses its bond, half of
which pays the winning side. Proposing falsely risks 0.01 WETH against a 1-hour
window watched by anyone; disputing frivolously risks the same. Honesty is the
cheap strategy on both sides — that is the entire design.

### Joining the DVM (how a verdict actually happens)

For reference — this is mainnet UMA governance, not something the demo needs:

1. **Stake UMA** in VotingV2 (via [vote.uma.xyz](https://vote.uma.xyz)). Staked
   tokens are your voting power and your skin in the game.
2. **Vote in the round** a disputed request lands in: **commit** a hashed vote
   (~24h), then **reveal** it (~24h) — hashing keeps votes secret while open.
3. **Settlement**: the mode of revealed stake-weighted votes becomes the answer
   the adapter later reads. Voters who voted with the majority earn emissions;
   wrong or absent voters are slashed — being right, often, is the yield.

Verex never talks to the DVM directly: the adapter only reads the settled answer
through `settleAndGetPrice`. Dispute UX likewise belongs to UMA's own dApp
([oracle.uma.xyz](https://oracle.uma.xyz)) — real deployments (Polymarket included)
link out to it rather than rebuilding dispute flows in-app.

---

## 4c. The three dispute scenarios, in a browser (mock oracle)

Section 4b's limitation — the DVM verdict can't be simulated — is real only
against the *real* oracle. Local environments deploy a
**MockOptimisticOracleV2** instead (`DeployMockOracle.s.sol`, run automatically
by the seed), whose DVM is a **jury of the demo wallets**: one vote per wallet,
majority wins, a tie settles Unresolvable. The `UmaCtfAdapter` is the SAME
contract as on staging — it is constructed against the mock's address and never
knows the difference, which is precisely the no-discretion property that makes
it trustworthy against the real oracle.

Every UMA market's page carries an **oracle panel** (`UmaOraclePanel`) that
walks the whole lifecycle with buttons — no cast, no curl. The three scenarios:

| # | Scenario | Steps in the panel | What it proves |
|---|---|---|---|
| 1 | **Dispute defeated** | Propose YES → dispute as wallet #1 → wallets #2–5 vote YES → finalize → resolve | An honest answer survives a challenge; the disputer's bond pays the proposer |
| 2 | **Dispute upheld** | Propose YES → dispute → jury majority votes NO → finalize → resolve | The oracle can overrule the operator — the market settles on the *jury's* answer, and the proposer's bond pays the disputer |
| 3 | **Dead end** | Propose → dispute → *cast no votes* | A disputed request never expires: `uma-resolve` returns 409 forever, redeem stays blocked. This is exactly the frozen state a real-oracle dispute leaves on Sepolia (§4b) |

Practical notes:

- Mock-oracle bonds are **10 USDC** (no whitelist, so no WETH dance) and
  liveness is **5 minutes**, so the undisputed path is also demonstrable by
  simply waiting out the countdown.
- Use **throwaway markets** from `/create` (UMA option, binary only) for
  scenarios you want to repeat; each market's question can run the lifecycle
  once.
- A scenario-3 market is not damaged goods — the jury can still vote later and
  unfreeze it. That, too, mirrors UMA: a dispute is resolved *whenever the DVM
  rules*, not by a deadline.
- The API guards: `uma-propose`/`uma-dispute`/`uma-vote`/`uma-finalize` return
  400 unless `ChainConfig.umaOracleMock` is true. Against the real oracle the
  panel is read-only — a one-wallet-one-vote jury there would be theatre.

### Step-by-step in the browser

**Prerequisites** — a seeded local stack:

```bash
anvil &                                # chain on http://127.0.0.1:8545
pnpm --filter @verex/api seed          # deploys backbone + MOCK oracle + adapter
pnpm --filter @verex/api dev           # API → http://localhost:4000
pnpm --filter @verex/web dev           # Web → http://localhost:3000
```

The API must sign as the seeded operator: `packages/api/.env` needs
`VEREX_OPERATOR_KEY` (mirrored from `packages/contracts/.env`). Symptom when it
is missing: `GET http://localhost:4000/wallet/0` returns anvil's well-known
`0xf39F…` instead of the operator, and every propose fails
"insufficient allowance".

**URLs:**

| What | URL |
|---|---|
| Seeded UMA market (one lifecycle only — spend it wisely) | <http://localhost:3000/market/uma-eth-above-6k-2026> |
| Create throwaway UMA markets (repeatable scenarios) | <http://localhost:3000/create> |
| Oracle state, raw (the panel's data source) | <http://localhost:4000/markets/uma-eth-above-6k-2026/uma> |
| Wallet balance check (bond arithmetic) | <http://localhost:4000/wallet/1> |
| Staging (real oracle — panel is read-only) | <https://verex-web-q6qvjcw5ma-du.a.run.app/market/uma-eth-above-6k-2026> |

On `/create`: pick **binary Yes/No**, resolution source **UMA oracle**, and
resolution criteria of at least 20 characters. Each market's question can run
the lifecycle **once**, so make one throwaway market per scenario run.

**Scenario 1 — dispute defeated.** Open the market page; in the *UMA oracle*
card:

1. **Propose YES** — state becomes *Proposed*, a 5:00 countdown starts.
2. **Dispute as wallet #1** during the countdown — state *Disputed*, the jury
   rows appear.
3. Vote: **#1 → No** (the disputer backs itself), **#2–#5 → Yes**.
4. **Finalize verdict** — verdict **Yes** (4–1).
5. **Copy the verdict on-chain (resolve)** — the market resolves YES.

Expect: `GET /wallet/1` is **down exactly 10 USDC** (its lost bond, paid to the
proposer). The RESOLVED badge appears; winners redeem in Portfolio.

**Scenario 2 — dispute upheld.** Same clicks, opposite jury: propose YES,
dispute as #1, but vote the **majority No**. Verdict **No** — the market
settles against the proposer, whose bond pays the disputer: `GET /wallet/1`
ends **up 10 USDC** net (bonded 10, got 20 back).

**Scenario 3 — dead end.** Propose, dispute — then **cast no votes**. Expect,
indefinitely (even long after the countdown would have expired):

- the panel stays on *Disputed* with the frozen-forever note,
- `POST /markets/<slug>/uma-resolve` → **409**,
- redeem → 400 "market is not resolved yet".

To show the freeze outlives liveness, warp the chain and watch nothing change:

```bash
cast rpc evm_increaseTime 600 --rpc-url http://127.0.0.1:8545
cast rpc evm_mine --rpc-url http://127.0.0.1:8545
```

A dead-ended market can still be rescued later — jury votes + finalize work at
any time, which mirrors the real DVM: disputes resolve when the vote happens,
not by a deadline.

**Bonus — the undisputed path.** Propose and let the 5:00 countdown run out
without disputing: the panel offers *Resolve market from the oracle*, and the
proposer's bond simply comes back. This is the happy path staging exercises
against the real oracle (with a 1-hour window there).

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
