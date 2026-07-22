#!/usr/bin/env bash
# verex — full local reset: wipe ALL data (markets, trades, history) and
# deploy a FRESH contract backbone on the running anvil chain.
#
# What it does:
#   1. Checks anvil is reachable (the seed deploys contracts via forge).
#   2. Ensures the local Postgres container (verex-pg) is running.
#   3. `prisma migrate reset` — drops every table's data, re-applies migrations.
#   4. Seed — deploys new USDC/CTF/Exchange, registers 10 markets, pre-funds
#      demo wallets #1-5 with 1,000 USDC.
#
# The old contracts stay on anvil as orphaned leftovers (harmless — nothing
# references them). A RUNNING API PICKS UP THE NEW ADDRESSES AUTOMATICALLY
# (loadChain re-reads ChainConfig per call) — no restart needed. Refresh the
# web page after the reset.
#
# Usage:  ./scripts/reset.sh    (anvil must already be running)
set -euo pipefail
cd "$(dirname "$0")/.."

RPC_URL="${VEREX_RPC_URL:-http://127.0.0.1:8545}"
# See scripts/dev-local.sh for why this default is here, not in DeployCTF.s.sol.
export VEREX_OPERATOR_KEY="${VEREX_OPERATOR_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"

echo "▶ Checking anvil at $RPC_URL"
if ! curl -sf -X POST "$RPC_URL" -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' >/dev/null; then
  echo "❌ anvil is not reachable at $RPC_URL — start it first (in a separate terminal): anvil"
  exit 1
fi

echo "▶ Checking Postgres (verex-pg)"
if [ -n "$(docker ps -aq -f "name=^verex-pg$" 2>/dev/null)" ]; then
  docker start verex-pg >/dev/null
else
  echo "❌ Postgres container verex-pg not found — run ./scripts/dev-local.sh once for first-time setup."
  exit 1
fi

echo "▶ Wiping DB + deploying a fresh backbone (migrate reset + seed)"
pnpm --filter @verex/api db:reset

cat <<'EOF'

✅ Reset complete: fresh contracts, 10 OPEN markets, wallets #1-5 at 1,000 USDC.
   The running API picks up the new contracts automatically — just refresh the web page.
EOF
