# Verex

Decentralized prediction market — truth through exchange.

## Packages

| Package | Description |
|---|---|
| [`packages/contracts`](packages/contracts) | Solidity smart contracts (Foundry) |
| [`packages/sdk`](packages/sdk) | TypeScript SDK for interacting with contracts |
| [`packages/api`](packages/api) | REST API server (Fastify) |
| [`packages/web`](packages/web) | Web frontend (Next.js) |
| [`packages/cli`](packages/cli) | CLI demo — full market lifecycle on anvil |

## Stack

- **Contracts**: Solidity 0.8.24, Foundry
- **SDK**: TypeScript, viem
- **API**: Fastify, TypeScript
- **Web**: Next.js 14, React 18, wagmi, viem
- **Monorepo**: pnpm workspaces + Turborepo

## Getting Started

### Prerequisites

- [pnpm](https://pnpm.io) v9+
- [Foundry](https://book.getfoundry.sh/getting-started/installation) (`anvil` + `forge` on PATH)
- Node.js 20+
- Docker (local Postgres container)

### Install

```bash
pnpm install
```

### Build all packages

```bash
pnpm build
```

### Run locally

Four terminals (or background the first two). The seed deploys real contracts, so **anvil must
be running before step 2**.

```bash
# 1. Local blockchain — separate terminal, leave it running
anvil

# 2. Postgres (Docker, container: verex-pg) + Prisma schema + env files,
#    then deploys the CTF backbone via forge and seeds 10 on-chain markets
./scripts/dev-local.sh

# 3. API server — serves markets + executes real on-chain trades
pnpm --filter @verex/api dev      # → http://localhost:4000

# 4. Web
pnpm --filter @verex/web dev      # → http://localhost:3000
```

Open http://localhost:3000 and trade with the demo wallets (#1–5, anvil's default accounts,
seeded with 1,000 USDC each).
This is where you catch **app/logic bugs** before committing.

### Reset (start over)

When the local state gets messy — resolved test markets, junk trades, odd balances —
reset everything without touching the running servers:

```bash
# Prerequisite: anvil is running (and dev-local.sh has been run once before).
./scripts/reset.sh
```

What it does, in order:
1. Wipes **all** DB data — markets, trades, portfolio history (`prisma migrate reset`).
2. Deploys a **fresh** contract backbone (USDC / CTF / Exchange) on the same anvil.
3. Reseeds 10 OPEN markets and pre-funds demo wallets #1–5 with 1,000 USDC.

No restarts needed afterwards: the running API detects the new contract addresses
automatically — just **refresh the web page**. The old contracts remain on anvil as
orphaned leftovers; nothing references them, so they're harmless. (Reusing the old
backbone across resets is unsupported — the CTF rejects re-preparing existing
conditions.)

### Deploy (GCP Cloud Run + Cloud SQL)

```bash
# fill scripts/deploy.env (PROJECT_ID, REGION), then:
./scripts/deploy.sh               # two Cloud Run services + Cloud SQL  (DRAFT — review first)
```

Deploy ships a **merged** state: commit → push → PR → merge → deploy. Deployment/environment
bugs (Cloud SQL socket, CORS, OAuth redirect) only surface once deployed — so test on the auto
`*.run.app` URL first, fix + redeploy, and map `verex.jaylabs.xyz` **last** (= go live), so the
real domain is never broken.

By default this deploys with trading disabled (no chain wired up yet — markets browse fine).
To go live on a real testnet, see
[docs/runbooks/testnet-deploy.md](docs/runbooks/testnet-deploy.md).

### CLI demo (end-to-end on anvil)

`packages/cli` ships a one-shot demo that deploys the CTF backbone and runs a full
market lifecycle on a local anvil chain: prepare a condition → register the YES/NO
token pair → operator mints & splits inventory → **alice signs a BUY order
(60 USDC → 100 YES @ $0.60)** → operator fills it → oracle reports YES wins → alice
redeems (ends with 140 USDC).

> **The demo requires a running anvil node** — this is the #1 gotcha. If you see
> `error sending request ... Connection refused (os error 61)` for
> `http://127.0.0.1:8545`, it means anvil isn't running. Start it first.

```bash
# 1. Start a local chain in a SEPARATE terminal — leave it running
anvil

# 2. Build the SDK + CLI once (the demo runs the compiled dist/)
pnpm --filter @verex/sdk build
pnpm --filter @verex/cli build

# 3. Run the demo
pnpm --filter @verex/cli demo
```

Notes:
- **Foundry (`forge`) must be on your PATH** — the demo shells out to
  `forge script script/DeployCTF.s.sol --broadcast` to deploy the backbone.
- It uses anvil's default mnemonic accounts (no real keys): **account 0** is the
  operator / oracle / deployer, **account 1** is "alice".
- **Reuse an already-deployed backbone** (skip the redeploy) by passing addresses:
  ```bash
  USDC_ADDR=0x… CTF_ADDR=0x… EXCHANGE_ADDR=0x… pnpm --filter @verex/cli demo
  ```
- Point at a different node with `VEREX_RPC_URL` (default `http://127.0.0.1:8545`).

### Test contracts

```bash
pnpm --filter @verex/contracts test
```

## Architecture

```
User → Web (Next.js)
         ↓
       API (Fastify)
         ↓
       SDK (@verex/sdk)
         ↓
     Contracts (Solidity)
         ↓
      EVM Chain
```
