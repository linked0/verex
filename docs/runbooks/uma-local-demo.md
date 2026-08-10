# Runbook: the UMA dispute demo (local mock oracle)

How to walk a full UMA dispute — propose, dispute, jury verdict, resolution — in a
browser, on plain local anvil, with no WETH and no real DVM.

This file is **local-only** by design. Everything about the *real* oracle — deploying
the adapter to Sepolia, the staging lifecycle, disputing against the real DVM, the
fork harness — lives in [uma-adapter.md](uma-adapter.md). If you are operating
staging or prod, that is your document; this one is for demoing and understanding
the dispute mechanics on your own machine.

## Why a mock exists at all

Against the real oracle, a dispute has two halves and only the first is simulatable:
propose → dispute → market frozen works fine, but the DVM verdict that *unfreezes*
it needs real staked voters in a ~2-day commit/reveal round — on Sepolia's test DVM
a disputed request may simply never settle ([uma-adapter.md §4b](uma-adapter.md)).

So local environments replace **exactly that missing piece and nothing else**: the
seed deploys a **MockOptimisticOracleV2** whose DVM is a **jury of the demo
wallets** — one vote per wallet, majority wins, a tie settles Unresolvable, the
loser's bond pays the winner.

| | Local (this runbook) | Staging/prod ([uma-adapter.md](uma-adapter.md)) |
|---|---|---|
| Oracle | `MockOptimisticOracleV2` | UMA's real `OptimisticOracleV2` on Sepolia |
| Verdicts | jury of demo wallets #1–5 | UMA's DVM (staked voters, ~2-day rounds) |
| Bond | **10 USDC** — no whitelist, no WETH dance | 0.011 WETH (bond + final fee) |
| Liveness | **5 minutes** | 1 hour |
| Adapter | `UmaCtfAdapter` — **the same contract, byte for byte** | `UmaCtfAdapter` |

The last row is the point. The adapter is constructed against the mock's address and
never knows the difference — which is precisely the no-discretion property that makes
it trustworthy against the real oracle. The demo therefore exercises the *production*
resolution path; only the verdict source is swapped.

Nothing here needs a manual deploy: `DeployMockOracle.s.sol` runs automatically
inside the local seed (`[1b] deploying mock oracle + adapter via forge...`), which
also writes the addresses into `ChainConfig`. A re-seed (`db:reset` or
`scripts/reset.sh`) is the whole setup.

## The three scenarios

Every UMA market's page carries an **oracle panel** (`UmaOraclePanel`) that walks
the whole lifecycle with buttons — no cast, no curl.

> **You act as the wallet selected in the header.** The panel shows the whole
> picture to everyone — state, countdown, every juror's ballot, the verdict —
> but each button acts only as your current wallet. To produce a 4–1 verdict you
> switch wallets and vote five times, because proposer, disputer and jurors are
> genuinely separate parties in UMA. The switching is the lesson, not friction to
> engineer away. Two consequences worth knowing up front: an address votes once,
> and the **operator cannot vote** (it runs the venue; judging its own markets is
> the conflict of interest UMA exists to remove — the API returns 400).

| # | Scenario | Steps in the panel | What it proves |
|---|---|---|---|
| 1 | **Dispute defeated** | Propose YES as #2 → dispute as #1 → #1 votes No, #2–#5 vote Yes → finalize → resolve | An honest answer survives a challenge; the disputer's bond pays the proposer |
| 2 | **Dispute upheld** | Propose YES → dispute → jury majority votes NO → finalize → resolve | The oracle can overrule the operator — the market settles on the *jury's* answer, and the proposer's bond pays the disputer |
| 3 | **Dead end** | Propose → dispute → *cast no votes* | A disputed request never expires: `uma-resolve` returns 409 forever, redeem stays blocked. This is exactly the frozen state a real-oracle dispute leaves on Sepolia ([uma-adapter.md §4b](uma-adapter.md)) |

Practical notes:

- The undisputed happy path is also demonstrable — 5-minute liveness makes waiting
  out the countdown reasonable (see the bonus at the end).
- Use **throwaway markets** from `/create` (UMA option, binary only) for scenarios
  you want to repeat; each market's question can run the lifecycle once.
- A scenario-3 market is not damaged goods — the jury can still vote later and
  unfreeze it. That, too, mirrors UMA: a dispute is resolved *whenever the DVM
  rules*, not by a deadline.
- The API guards: `uma-propose`/`uma-dispute`/`uma-vote`/`uma-finalize` return
  400 unless `ChainConfig.umaOracleMock` is true. Against the real oracle the
  panel is read-only — a one-wallet-one-vote jury there would be theatre.
- Every write takes the acting `accountIndex`, so the same three scenarios are
  scriptable over curl when you'd rather not click: `POST
  /markets/<slug>/uma-propose {"answer":"Yes","accountIndex":2}`, then
  `uma-dispute {"accountIndex":1}`, `uma-vote {"accountIndex":N,"answer":…}`,
  `uma-finalize {"accountIndex":3}`.

## Step-by-step in the browser

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
card. The header wallet selector is part of the walkthrough — each step says who
you must be:

| Step | Be | Do | Result |
|---|---|---|---|
| 1 | **Wallet #2** | **Propose YES** | state *Proposed*, 5:00 countdown starts |
| 2 | **Wallet #1** | **Dispute this answer** (during the countdown) | state *Disputed*, jury rows appear |
| 3 | **Wallet #1** | Vote **No** (the disputer backs itself) | your row shows "voted No" |
| 4 | **Wallets #2, #3, #4, #5** | Vote **Yes** in each | tally 4–1 |
| 5 | anyone | **Finalize verdict** | verdict **Yes** |
| 6 | anyone | **Copy the verdict on-chain (resolve)** | market resolves YES |

Only your own row offers Vote buttons; the others read "voted …" or "not
voted". Steps 5–6 say *anyone* because finalize and resolve decide nothing —
they count ballots and copy the result, so any wallet may send them.

Expect: `GET /wallet/1` is **down exactly 10 USDC** (its lost bond, paid to the
proposer), and `GET /wallet/2` is **up 10**. The RESOLVED badge appears; winners
redeem in Portfolio.

**Scenario 2 — dispute upheld.** Same steps, opposite jury: propose YES as #2,
dispute as #1, then vote the **majority No**. Verdict **No** — the market
settles against the proposer, whose bond pays the disputer: `GET /wallet/1`
ends **up 10 USDC** net (bonded 10, got 20 back), and the proposer is down 10.

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

## See also

- [uma-adapter.md](uma-adapter.md) — everything real-oracle: deploy, staging
  lifecycle, disputing on Sepolia (§4b), the fork harness (§5)
- [local-testing.md](local-testing.md) — the rest of the plain-anvil checklist,
  including the `/create` UMA-card checks (§5)
- `packages/contracts/src/MockOptimisticOracleV2.sol` — the jury rules, in code
- `packages/contracts/test/MockOptimisticOracle.t.sol` — the three scenarios as
  Foundry tests
