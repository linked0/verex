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

# <repo>/.env 를 읽는다 — seed.ts 가 읽는 바로 그 파일이다 (packages/api/src/env.ts).
# 이걸 안 읽으면 이 스크립트의 검사는 **셸만** 보고, 시드는 루트 .env 를 보게 되어
# "8545 를 확인하고 8546 에 배포"하는 조용한 거짓이 만들어진다. dotenv 와 같은
# 규칙으로 얹는다: **이미 설정된 키는 덮어쓰지 않는다**(셸이 이긴다).
RPC_ORIGIN="built-in default"
CHAIN_ORIGIN="(unset)"
[ -n "${VEREX_RPC_URL:-}" ] && RPC_ORIGIN="shell"
[ -n "${VEREX_CHAIN_ID:-}" ] && CHAIN_ORIGIN="shell"
if [ -f .env ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in ''|'#'*) continue ;; esac
    key="${line%%=*}"; val="${line#*=}"
    case "$key" in *[!A-Za-z0-9_]*) continue ;; esac
    if [ -z "${!key+set}" ]; then
      export "$key=$val"
      [ "$key" = VEREX_RPC_URL ] && RPC_ORIGIN="<repo>/.env"
      [ "$key" = VEREX_CHAIN_ID ] && CHAIN_ORIGIN="<repo>/.env"
    fi
  done < .env
fi

RPC_URL="${VEREX_RPC_URL:-http://127.0.0.1:8545}"
# See scripts/dev-local.sh for why this default is here, not in DeployCTF.s.sol.
export VEREX_OPERATOR_KEY="${VEREX_OPERATOR_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"

# 값보다 **출처**를 먼저 보여 준다. 값이 틀렸을 때 알고 싶은 건 누가 설정했는지다.
echo "▶ env"
printf '   %-16s %-38s ← %s\n' "VEREX_RPC_URL"  "$RPC_URL" "$RPC_ORIGIN"
printf '   %-16s %-38s ← %s\n' "VEREX_CHAIN_ID" "${VEREX_CHAIN_ID:-(unset)}" "$CHAIN_ORIGIN"
printf '   %-16s %-38s\n'      "OPERATOR_KEY"   "(set, ${#VEREX_OPERATOR_KEY} chars)"
# 키가 아니라 **주소**를 보여 준다 — 어느 계정이 배포·서명하는지가 한눈에 보여야 한다 (jay, 2026-09-01:
# 루트 .env 의 VEREX_OPERATOR_KEY 가 있으면 그 키가, 없으면 anvil #0 이 배포자다).
if command -v cast >/dev/null 2>&1; then
  printf '   %-16s %-38s\n'    "operator"       "$(cast wallet address --private-key "$VEREX_OPERATOR_KEY" 2>/dev/null || echo "(cast could not derive)")"
fi

# 설정이 아니라 **현실**을 묻는다. 이 줄과 VEREX_CHAIN_ID 가 다르면 배포하면 안 된다.
LIVE_HEX=$(curl -sf -X POST "$RPC_URL" -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' 2>/dev/null \
  | sed -E 's/.*"result":"0x([0-9a-fA-F]*)".*/\1/')
if [ -n "$LIVE_HEX" ]; then
  LIVE_ID=$((16#$LIVE_HEX))
  printf '   %-16s %-38s\n' "node reports" "chain $LIVE_ID"
  if [ -n "${VEREX_CHAIN_ID:-}" ] && [ "$LIVE_ID" != "$VEREX_CHAIN_ID" ]; then
    echo ""
    echo "❌ chain mismatch: VEREX_CHAIN_ID=$VEREX_CHAIN_ID but $RPC_URL reports $LIVE_ID."
    echo "   The contracts would land on $LIVE_ID while ChainConfig claims $VEREX_CHAIN_ID."
    exit 1
  fi
fi
echo ""

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
# 실패했을 때 마지막으로 보이는 줄이 pnpm 의 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL 이면
# 안 된다 — 그건 "자식이 죽었다"만 말하고, 정작 알아야 할 **지금 어떤 상태인가**를
# 말하지 않는다. DB 는 이미 지워졌고 컨트랙트는 일부만 올라가 있을 수 있다.
if ! pnpm --filter @verex/api db:reset; then
  echo ""
  echo "❌ seed failed — the real error is ABOVE this line, not in pnpm's summary."
  echo ""
  echo "   State right now:"
  echo "     • Postgres was already wiped (migrate reset ran first) — no markets, no trades."
  echo "     • Contracts deployed before the failure are orphaned on $RPC_URL. Harmless:"
  echo "       nothing references them, and a fork loses them on restart."
  echo ""
  echo "   Nothing is half-written that a re-run cannot replace. Fix the error above,"
  echo "   then run this script again."
  exit 1
fi

cat <<'EOF'

✅ Reset complete: fresh contracts, 10 OPEN markets, wallets #1-5 at 1,000 USDC.
   The running API picks up the new contracts automatically — just refresh the web page.
EOF
