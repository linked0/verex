// Public surface for @verex/sdk.
//
// Layered design:
//   - Types: Order, Side, SignatureType, OrderDomain, ClientConfig
//   - Chain: account derivation + viem client construction from an explicit
//     `AccountConfig` — no env-var reading here, that's each consumer's own
//     call (see packages/api/src/chain.ts and packages/cli/src/clients.ts).
//   - Flat helpers: `signOrder`, `hashOrder`, `getConditionId`, plus thin
//     wrappers around CTFExchange / IConditionalTokens / MockUSDC. Useful
//     for one-off calls and tests.
//   - Small clients: `createCTClient`, `createExchangeClient`,
//     `createUsdcClient` pre-bind an address + viem clients. Useful when
//     the same address gets passed around (CLI, MM agent).

export * from "./types";
export * from "./chain";

// Off-chain primitives
export { getConditionId } from "./conditions";
export { signOrder, hashOrder } from "./orders";

// Contract-call helpers
export * as ct from "./ct";
export * as exchange from "./exchange";
export * as usdc from "./usdc";

// Pre-bound clients
export {
  createCTClient,
  createExchangeClient,
  createUsdcClient,
  type CTClient,
  type ExchangeClient,
  type UsdcClient,
} from "./clients";

// ABIs (escape hatch for callers that need raw contract access)
export {
  CTFExchangeAbi,
  IConditionalTokensAbi,
  MockUSDCAbi,
} from "./abis";
