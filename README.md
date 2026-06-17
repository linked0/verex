# Verex

Decentralized prediction market — truth through exchange.

## Packages

| Package | Description |
|---|---|
| [`packages/contracts`](packages/contracts) | Solidity smart contracts (Foundry) |
| [`packages/sdk`](packages/sdk) | TypeScript SDK for interacting with contracts |
| [`packages/api`](packages/api) | REST API server (Fastify) |
| [`packages/web`](packages/web) | Web frontend (Next.js) |

## Stack

- **Contracts**: Solidity 0.8.24, Foundry
- **SDK**: TypeScript, viem
- **API**: Fastify, TypeScript
- **Web**: Next.js 14, React 18, wagmi, viem
- **Monorepo**: pnpm workspaces + Turborepo

## Getting Started

### Prerequisites

- [pnpm](https://pnpm.io) v9+
- [Foundry](https://book.getfoundry.sh/getting-started/installation)
- Node.js 20+

### Install

```bash
pnpm install
```

### Build all packages

```bash
pnpm build
```

### Run locally

```bash
# Start local blockchain
anvil

# Deploy contracts (in packages/contracts)
forge script script/Deploy.s.sol --rpc-url http://localhost:8545 --broadcast

# Start API server
pnpm --filter @verex/api dev

# Start web
pnpm --filter @verex/web dev
```

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
