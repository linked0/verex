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
