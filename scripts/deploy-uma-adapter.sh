#!/usr/bin/env bash
# Deploy the UMA oracle adapter for one environment and record it in the
# manifest. Wraps the two steps that must happen in the same sitting:
#
#   forge script DeployUmaAdapter.s.sol --broadcast
#   pnpm --filter @verex/api save-uma-adapter <target>
#
# They are paired here because forge's broadcast/run-latest.json is per CHAIN
# ID and staging/prod share Sepolia — leave a gap between them and the next
# deploy on that chain overwrites the artifact save-uma-adapter reads.
#
# Full procedure, including what to do with the adapter afterwards:
# docs/runbooks/uma-adapter.md
#
# Usage:
#   ./scripts/deploy-uma-adapter.sh staging
#   ./scripts/deploy-uma-adapter.sh prod
#   DRY_RUN=1 ./scripts/deploy-uma-adapter.sh staging   # preflight only
#   RPC_URL=http://127.0.0.1:8546 ./scripts/deploy-uma-adapter.sh staging  # fork
set -euo pipefail

cd "$(dirname "$0")/.."

TARGET="${1:-}"
if [[ "$TARGET" != "staging" && "$TARGET" != "prod" ]]; then
  echo "Usage: $0 <staging|prod>" >&2
  exit 1
fi

ENV_FILE="packages/contracts/.env"
[[ "$TARGET" == "prod" ]] && ENV_FILE="packages/contracts/.env.prod"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "missing $ENV_FILE — see docs/runbooks/deploy.md §1" >&2
  exit 1
fi
# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

RPC_URL="${RPC_URL:-$VEREX_RPC_URL}"
: "${VEREX_OPERATOR_KEY:?VEREX_OPERATOR_KEY missing from $ENV_FILE}"

MANIFEST="packages/contracts/deployments.json"
CTF_ADDR="$(node -p "require('./$MANIFEST').$TARGET?.ctf ?? ''")"
if [[ -z "$CTF_ADDR" ]]; then
  echo "no '$TARGET' backbone in $MANIFEST — deploy it first (runbook §2)" >&2
  exit 1
fi

OPERATOR="$(cast wallet address "$VEREX_OPERATOR_KEY")"
WETH="${WETH_ADDR:-0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9}"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

say "Target $TARGET · chain $VEREX_CHAIN_ID · $RPC_URL"
echo "  operator $OPERATOR"
echo "  CTF      $CTF_ADDR"

# ── Preflight. Each check below fails cheaper than the thing it prevents.

say "1/4 · Existing adapter?"
EXISTING="$(node -p "require('./$MANIFEST').$TARGET?.umaAdapter ?? ''")"
if [[ -n "$EXISTING" ]]; then
  echo "  ⚠ '$TARGET' already records umaAdapter $EXISTING"
  echo "    A market's conditionId hashes the adapter address, so a NEW adapter"
  echo "    cannot inherit the old one's markets — they keep resolving through"
  echo "    the old one and only new markets use the new address."
  echo "    Re-run with FORCE=1 if the replacement is deliberate."
  [[ "${FORCE:-0}" == "1" ]] || exit 1
else
  echo "  none recorded — this is a first deploy"
fi

say "2/4 · Operator gas"
BAL_WEI="$(cast balance "$OPERATOR" --rpc-url "$RPC_URL")"
echo "  $(cast to-unit "$BAL_WEI" ether) ETH"
# ~0.003 ETH at 2 gwei for the deploy; the floor leaves room for the per-market
# initialize calls that follow.
if (( $(echo "$BAL_WEI < 10000000000000000" | bc) )); then
  echo "  ⚠ under 0.01 ETH — deploy is ~0.003, and each market's initialize costs more" >&2
fi

say "3/4 · Bond currency (WETH)"
# Not a blocker for the DEPLOY, but the adapter is useless without it: every
# proposal posts finalFee + bond in WETH, and MockUSDC is not whitelisted.
WETH_BAL="$(cast call "$WETH" 'balanceOf(address)(uint256)' "$OPERATOR" --rpc-url "$RPC_URL" | awk '{print $1}')"
echo "  $(cast to-unit "$WETH_BAL" ether) WETH"
if [[ "$WETH_BAL" == "0" ]]; then
  echo "  ⚠ zero WETH — you can deploy now, but no answer can be PROPOSED until you wrap some:"
  echo "      cast send $WETH 'deposit()' --value 0.05ether \\"
  echo "        --private-key \$VEREX_OPERATOR_KEY --rpc-url \$VEREX_RPC_URL"
fi

if [[ "${DRY_RUN:-0}" == "1" ]]; then
  say "DRY_RUN=1 — preflight only, nothing broadcast."
  exit 0
fi

say "4/4 · Deploying + recording"
(
  cd packages/contracts
  CTF_ADDR="$CTF_ADDR" forge script script/DeployUmaAdapter.s.sol \
    --rpc-url "$RPC_URL" --broadcast
)

# Immediately, per the header comment.
VEREX_RPC_URL="$RPC_URL" pnpm --filter @verex/api save-uma-adapter "$TARGET"

cat <<EOF

Next:
  1. Review and commit the $MANIFEST diff — the seed reads it from git.
  2. Re-seed so the environment gets its UMA-resolved market:
       VEREX_DEPLOY_TARGET=$TARGET pnpm --filter @verex/api seed
  3. Resolve it once end-to-end — docs/runbooks/uma-adapter.md, "Per-market lifecycle".
EOF
