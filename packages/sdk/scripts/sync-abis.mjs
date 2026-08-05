#!/usr/bin/env node
// Reads forge build output and emits typed ABI modules under src/abis/.
// Run automatically before `tsc` via the `prebuild` npm script.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SDK_ROOT = resolve(__dirname, "..");
const FORGE_OUT = resolve(SDK_ROOT, "../contracts/out");
const ABI_DIR = resolve(SDK_ROOT, "src/abis");

// S2.4: CTF stack (v1 escrow Market/MarketFactory replaced by Polymarket CTF).
// IConditionalTokens is the on-chain ABI we call against the bytecode-deployed
// ConditionalTokens contract (Solidity 0.5.x compiled separately by Polymarket).
const CONTRACTS = ["CTFExchange", "IConditionalTokens", "MockUSDC", "UmaCtfAdapter"];

if (!existsSync(FORGE_OUT)) {
  console.error(`forge output not found at ${FORGE_OUT}`);
  console.error(`run \`forge build\` in packages/contracts first`);
  process.exit(1);
}

mkdirSync(ABI_DIR, { recursive: true });

for (const name of CONTRACTS) {
  const artifactPath = resolve(FORGE_OUT, `${name}.sol`, `${name}.json`);
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  const abi = artifact.abi;

  const out = `// AUTO-GENERATED — do not edit. Regenerate via \`pnpm sync-abis\`.
// Source: packages/contracts/out/${name}.sol/${name}.json

export const ${name}Abi = ${JSON.stringify(abi, null, 2)} as const;
`;

  writeFileSync(resolve(ABI_DIR, `${name}.ts`), out);
  console.log(`wrote src/abis/${name}.ts (${abi.length} entries)`);
}

writeFileSync(
  resolve(ABI_DIR, "index.ts"),
  CONTRACTS.map((n) => `export * from "./${n}";`).join("\n") + "\n",
);
