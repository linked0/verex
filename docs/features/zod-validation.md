# Zod — Runtime Validation + Type Inference (env / ABI / external inputs)

**Goal:** validate every **external input** at the boundary — env vars, JSON from RPC/APIs,
request bodies, agent tool args — with **Zod**, getting runtime failure-fast *and* inferred
TS types from a single schema definition.

*Source: jay's Zod note, pasted in session 2026-07-17 (no source file). Not yet a dependency
anywhere in the monorepo (checked 2026-07-17) — this is a fresh adoption item.*

## Why
TypeScript types vanish at runtime; `process.env` and JSON are `any`-shaped at the edges.
One Zod schema gives both: parse-or-throw at startup **and** the static type
(`z.infer<typeof Env>`) — no drift between validation and types.

## Canonical example (from the note)
```ts
import { z } from "zod";
const Env = z.object({
  RPC_URL: z.string().url(),
  CHAIN_ID: z.coerce.number().int().positive(),
  VEREX_ADDR: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
});
export const env = Env.parse(process.env); // throws immediately on failure
```
Key details worth copying: `z.coerce.number()` (env values are strings), the `0x`-address
regex, and **parsing once at module load** so a bad config kills the process at startup, not
mid-trade.

## Adoption map (per package)
| Package | What to validate | Notes |
|---|---|---|
| **shared** | `Address`, `Hex`, `TxHash` schemas + a common `parseEnv()` helper | Put schemas in `@verex/sdk` (types already flow from there) so all packages share them |
| **sdk** | RPC/JSON inputs at the SDK boundary (order payloads, market params) | Complements viem's own types — Zod covers what arrives as raw JSON |
| **api** (S4) | Env + **request/response validation** on Fastify routes | `fastify-type-provider-zod` — schemas become both validation and OpenAPI-ready types |
| **cli** | Env (`RPC_URL`, `CHAIN_ID`, addresses) + command args | Also the natural home for the audit item A2 (chainId guard) — a `CHAIN_ID: z.literal(31337)` dev schema *is* the guard |
| **mm-agent** (S2.5) | `config.ts` per-market config loader (spread, max exposure, on/off) | Malformed market config must fail at startup, never mid-quote |
| **web** | `NEXT_PUBLIC_*` env at build/boot | Client env is stringly-typed too |

## Dev items
- [ ] Add `zod` + shared schemas (`Address`, `Hex`, `parseEnv`) to `@verex/sdk`
- [ ] CLI env schema — folds in audit item A2's chainId guard (§11.3)
- [ ] MM-agent config loader on Zod (when mm-agent lands, S2.5)
- [ ] API: `fastify-type-provider-zod` on all routes (at S4, when `packages/api` starts)
- [ ] Web `NEXT_PUBLIC_*` env schema
- [ ] (you) Confirm placement: schemas in `@verex/sdk` vs a new `@verex/schema` package —
  recommend **sdk** until a second consumer needs schemas without the SDK

## Sequencing & estimate
Not a standalone phase — **adopt incrementally**: shared schemas + CLI env now (~0.5d, and it
closes audit A2), then each package as it's built (api at S4, mm-agent at S2.5). Near-zero
marginal cost when done at package-creation time; expensive to retrofit later.
